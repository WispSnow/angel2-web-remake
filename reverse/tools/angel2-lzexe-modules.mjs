#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MZ_HEADER_BYTES = 0x20;
const LZEXE_091_SIGNATURE = Buffer.from(
  "060e1f8b0e0c008bf14e89f78cdb031e0a008ec3fdf3a453b82b0050cb",
  "hex",
);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function declaredExeBytes(buffer) {
  const lastPageBytes = buffer.readUInt16LE(2);
  const pages = buffer.readUInt16LE(4);
  if (pages === 0) throw new Error("MZ header declares zero pages");
  return lastPageBytes === 0
    ? pages * 512
    : (pages - 1) * 512 + lastPageBytes;
}

function parseMz(buffer, fileName) {
  const magic = buffer.readUInt16LE(0);
  if (magic !== 0x5a4d && magic !== 0x4d5a) {
    throw new Error(`${fileName}: missing MZ signature`);
  }
  const bytes = declaredExeBytes(buffer);
  if (bytes > buffer.length) {
    throw new Error(`${fileName}: declared ${bytes} bytes, file has ${buffer.length}`);
  }
  const relocationCount = buffer.readUInt16LE(6);
  const headerParagraphs = buffer.readUInt16LE(8);
  const relocationOffset = buffer.readUInt16LE(0x18);
  const loadOffset = headerParagraphs * 16;
  if (loadOffset > bytes || relocationOffset + relocationCount * 4 > loadOffset) {
    throw new Error(`${fileName}: invalid MZ header or relocation table`);
  }
  const relocations = Array.from({ length: relocationCount }, (_, index) => ({
    offset: buffer.readUInt16LE(relocationOffset + index * 4),
    segment: buffer.readUInt16LE(relocationOffset + index * 4 + 2),
  }));
  return {
    fileBytes: buffer.length,
    declaredBytes: bytes,
    headerParagraphs,
    headerBytes: loadOffset,
    relocationOffset,
    relocationCount,
    minimumAllocationParagraphs: buffer.readUInt16LE(0x0a),
    maximumAllocationParagraphs: buffer.readUInt16LE(0x0c),
    initialSS: buffer.readUInt16LE(0x0e),
    initialSP: buffer.readUInt16LE(0x10),
    initialIP: buffer.readUInt16LE(0x14),
    initialCS: buffer.readUInt16LE(0x16),
    entryAddress: `${hex(buffer.readUInt16LE(0x16))}:${hex(buffer.readUInt16LE(0x14))}`,
    loadImage: buffer.subarray(loadOffset, bytes),
    relocations,
  };
}

function buildSyntheticPackedExe(image, module) {
  const entrySegment = Number.parseInt(module.entryAddress.split(":")[0], 16);
  const entryOffset = Number.parseInt(module.entryAddress.split(":")[1], 16);
  const signature = image.subarray(
    module.entryLinearOffset,
    module.entryLinearOffset + LZEXE_091_SIGNATURE.length,
  );
  if (!signature.equals(LZEXE_091_SIGNATURE)) {
    throw new Error(`UN ${module.headerRecord}: entry does not match LZEXE 0.91`);
  }

  const totalBytes = MZ_HEADER_BYTES + image.length;
  const header = Buffer.alloc(MZ_HEADER_BYTES);
  header.writeUInt16LE(0x5a4d, 0x00);
  header.writeUInt16LE(totalBytes % 512, 0x02);
  header.writeUInt16LE(Math.ceil(totalBytes / 512), 0x04);
  header.writeUInt16LE(0, 0x06);
  header.writeUInt16LE(MZ_HEADER_BYTES / 16, 0x08);
  header.writeUInt16LE(0, 0x0a);
  header.writeUInt16LE(0, 0x0c);
  header.writeUInt16LE(0, 0x0e);
  header.writeUInt16LE(0, 0x10);
  header.writeUInt16LE(0, 0x12);
  header.writeUInt16LE(entryOffset, 0x14);
  header.writeUInt16LE(entrySegment, 0x16);
  header.writeUInt16LE(0x1c, 0x18);
  header.writeUInt16LE(0, 0x1a);
  header.write("LZ91", 0x1c, "ascii");
  return Buffer.concat([header, image]);
}

async function unpackModules(moduleDirectory, outputDirectory) {
  const sourceManifest = JSON.parse(
    await readFile(path.join(moduleDirectory, "manifest.json"), "utf8"),
  );
  const packedExeDirectory = path.join(outputDirectory, "packed-exe");
  const unpackedExeDirectory = path.join(outputDirectory, "unpacked-exe");
  const rawDirectory = path.join(outputDirectory, "raw");
  await rm(outputDirectory, { recursive: true, force: true });
  await Promise.all([
    mkdir(packedExeDirectory, { recursive: true }),
    mkdir(unpackedExeDirectory, { recursive: true }),
    mkdir(rawDirectory, { recursive: true }),
  ]);

  const entries = [];
  for (const module of sourceManifest.modules) {
    const stem = module.headerRecord.toString().padStart(4, "0");
    const sourceImage = await readFile(path.join(moduleDirectory, module.image));
    const packedExe = buildSyntheticPackedExe(sourceImage, module);
    const packedExeName = `${stem}-packed.exe`;
    // The historical unlzexe utility keeps a DOS-era 8.3-ish output-name
    // buffer, so use a deliberately short basename here.
    const unpackedExeName = `${stem}.exe`;
    const rawName = `${stem}-unpacked.bin`;
    const metadataName = `${stem}.json`;
    const packedExePath = path.join(packedExeDirectory, packedExeName);
    const unpackedExePath = path.join(unpackedExeDirectory, unpackedExeName);
    await Promise.all([
      writeFile(packedExePath, packedExe),
      rm(unpackedExePath, { force: true }),
    ]);

    let unlzexeOutput;
    try {
      unlzexeOutput = execFileSync(
        process.env.UNLZEXE ?? "unlzexe",
        [packedExePath, unpackedExePath],
        { encoding: "utf8" },
      );
    } catch (error) {
      throw new Error(
        `UN ${module.headerRecord}: unlzexe failed: ${error.stderr ?? error.message}`,
      );
    }

    const unpackedExe = await readFile(unpackedExePath);
    const parsed = parseMz(unpackedExe, unpackedExePath);
    const rawPath = path.join(rawDirectory, rawName);
    const metadataPath = path.join(rawDirectory, metadataName);
    const metadata = {
      format: "ANGEL2 LZEXE 0.91 unpacked runtime module",
      headerRecord: module.headerRecord,
      sourcePackedImage: module.image,
      sourcePackedImageBytes: sourceImage.length,
      sourcePackedImageSha256: sha256(sourceImage),
      syntheticPackedExe: path.join("packed-exe", packedExeName),
      syntheticPackedExeBytes: packedExe.length,
      syntheticPackedExeSha256: sha256(packedExe),
      unpackedExe: path.join("unpacked-exe", unpackedExeName),
      unpackedExeBytes: unpackedExe.length,
      unpackedExeSha256: sha256(unpackedExe),
      rawImage: path.join("raw", rawName),
      rawImageBytes: parsed.loadImage.length,
      rawImageSha256: sha256(parsed.loadImage),
      entryAddress: parsed.entryAddress,
      initialSS: parsed.initialSS,
      initialSP: parsed.initialSP,
      minimumAllocationParagraphs: parsed.minimumAllocationParagraphs,
      maximumAllocationParagraphs: parsed.maximumAllocationParagraphs,
      relocationCount: parsed.relocationCount,
      relocationOffset: parsed.relocationOffset,
      relocations: parsed.relocations,
      decoder: {
        command: process.env.UNLZEXE ?? "unlzexe",
        detectedVersion: "LZEXE 0.91",
        output: unlzexeOutput.trim().split(/\r?\n/),
      },
    };
    await Promise.all([
      writeFile(rawPath, parsed.loadImage),
      writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`),
    ]);
    entries.push({
      headerRecord: module.headerRecord,
      packedBytes: sourceImage.length,
      unpackedBytes: parsed.loadImage.length,
      compressionRatio: Number((sourceImage.length / parsed.loadImage.length).toFixed(6)),
      entryAddress: parsed.entryAddress,
      initialSS: parsed.initialSS,
      initialSP: parsed.initialSP,
      relocationCount: parsed.relocationCount,
      image: path.join("raw", rawName),
      metadata: path.join("raw", metadataName),
      imageSha256: metadata.rawImageSha256,
    });
  }

  const manifest = {
    format: "ANGEL2 LZEXE 0.91 unpacked runtime modules",
    moduleCount: entries.length,
    totalPackedBytes: entries.reduce((sum, entry) => sum + entry.packedBytes, 0),
    totalUnpackedBytes: entries.reduce((sum, entry) => sum + entry.unpackedBytes, 0),
    totalRelocationCount: entries.reduce(
      (sum, entry) => sum + entry.relocationCount,
      0,
    ),
    entries,
  };
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `unpacked ${manifest.moduleCount} LZEXE modules: ` +
    `${manifest.totalPackedBytes} -> ${manifest.totalUnpackedBytes} bytes`,
  );
  return manifest;
}

function usage() {
  return "usage: angel2-lzexe-modules.mjs --unpack PACKED_MODULE_DIR OUTPUT_DIR";
}

async function main() {
  const [command, moduleDirectory, outputDirectory] = process.argv.slice(2);
  if (command !== "--unpack" || outputDirectory === undefined) {
    throw new Error(usage());
  }
  await unpackModules(moduleDirectory, outputDirectory);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { buildSyntheticPackedExe, parseMz, unpackModules };
