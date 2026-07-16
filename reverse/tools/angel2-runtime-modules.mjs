#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BLOCK_SEGMENT_STRIDE = 0x800;
const BLOCK_BYTE_STRIDE = BLOCK_SEGMENT_STRIDE * 16;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function parseRuntimeHeader(buffer, record = null) {
  if (buffer.length < 8) {
    return null;
  }
  const relocationCount = buffer.readUInt16LE(0);
  const blockCount = buffer.readUInt16LE(2);
  const entryOffset = buffer.readUInt16LE(4);
  const entrySegment = buffer.readUInt16LE(6);
  if (
    blockCount === 0 || blockCount > 16 ||
    buffer.length !== 8 + relocationCount * 4 ||
    entrySegment >= blockCount * BLOCK_SEGMENT_STRIDE
  ) {
    return null;
  }
  const relocations = Array.from({ length: relocationCount }, (_, index) => ({
    offset: buffer.readUInt16LE(8 + index * 4),
    segment: buffer.readUInt16LE(10 + index * 4),
  }));
  return {
    record,
    bytes: buffer.length,
    relocationCount,
    blockCount,
    entryOffset,
    entrySegment,
    entryAddress: `${hex(entrySegment)}:${hex(entryOffset)}`,
    entryLinearOffset: entrySegment * 16 + entryOffset,
    relocations,
  };
}

async function extractModules(extractedDirectory, decodedDirectory, outputDirectory) {
  const decodedManifest = JSON.parse(
    await readFile(path.join(decodedDirectory, "manifest.json"), "utf8"),
  );
  const decodedByRecord = new Map(
    decodedManifest.entries.map((entry) => [entry.record, entry]),
  );
  const names = (await readdir(extractedDirectory))
    .filter((name) => /^\d{4}\.bin$/.test(name))
    .sort();
  const modules = [];

  for (const name of names) {
    const headerRecord = Number.parseInt(name, 10);
    const headerBuffer = await readFile(path.join(extractedDirectory, name));
    const header = parseRuntimeHeader(headerBuffer, headerRecord);
    if (header === null) {
      continue;
    }

    const payloadRecords = [];
    let valid = true;
    for (let block = 0; block < header.blockCount; block += 1) {
      const record = headerRecord + 1 + block;
      const decoded = decodedByRecord.get(record);
      if (
        decoded?.kind !== "single_stream" || decoded.streams.length !== 1 ||
        decoded.streams[0].output === undefined
      ) {
        valid = false;
        break;
      }
      payloadRecords.push({ record, stream: decoded.streams[0] });
    }
    if (!valid) {
      continue;
    }

    const blocks = [];
    for (let index = 0; index < payloadRecords.length; index += 1) {
      const payload = payloadRecords[index];
      const buffer = await readFile(path.join(decodedDirectory, payload.stream.output));
      if (buffer.length > BLOCK_BYTE_STRIDE) {
        throw new Error(
          `UN record ${payload.record}: decoded block ${buffer.length} exceeds 32 KiB`,
        );
      }
      blocks.push({
        index,
        record: payload.record,
        loadSegmentOffset: index * BLOCK_SEGMENT_STRIDE,
        loadByteOffset: index * BLOCK_BYTE_STRIDE,
        bytes: buffer.length,
        sha256: sha256(buffer),
        buffer,
      });
    }

    const imageBytes = blocks.at(-1).loadByteOffset + blocks.at(-1).bytes;
    if (header.entryLinearOffset >= imageBytes) {
      throw new Error(
        `UN header ${headerRecord}: entry ${header.entryAddress} is outside its image`,
      );
    }
    const image = Buffer.alloc(imageBytes);
    for (const block of blocks) {
      block.buffer.copy(image, block.loadByteOffset);
    }
    const stem = headerRecord.toString().padStart(4, "0");
    const imageName = `${stem}.bin`;
    const metadataName = `${stem}.json`;
    const metadata = {
      format: "ANGEL2 UN.SWF relocatable runtime module",
      header,
      blockSegmentStride: BLOCK_SEGMENT_STRIDE,
      blockByteStride: BLOCK_BYTE_STRIDE,
      imageBytes,
      imageSha256: sha256(image),
      image: imageName,
      blocks: blocks.map(({ buffer, ...block }) => block),
    };
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDirectory, imageName), image),
      writeFile(
        path.join(outputDirectory, metadataName),
        `${JSON.stringify(metadata, null, 2)}\n`,
      ),
    ]);
    modules.push({
      headerRecord,
      blockCount: header.blockCount,
      payloadRecords: blocks.map((block) => block.record),
      entryAddress: header.entryAddress,
      entryLinearOffset: header.entryLinearOffset,
      imageBytes,
      imageSha256: metadata.imageSha256,
      image: imageName,
      metadata: metadataName,
    });
  }

  const manifest = {
    format: "ANGEL2 reconstructed UN.SWF runtime modules",
    moduleCount: modules.length,
    totalBlocks: modules.reduce((total, module) => total + module.blockCount, 0),
    totalImageBytes: modules.reduce((total, module) => total + module.imageBytes, 0),
    initialLoaderState: {
      symbol: "WK_EXE",
      value: 23,
      headerRecord: 23,
      evidence: "GO.EXE data segment 046A:004A and LOAD_V at 0000:019C",
    },
    modules,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `reconstructed ${manifest.moduleCount} runtime modules from ` +
    `${manifest.totalBlocks} blocks (${manifest.totalImageBytes} image bytes)`,
  );
  return manifest;
}

function usage() {
  return [
    "usage:",
    "  angel2-runtime-modules.mjs --extract EXTRACTED_UN DECODED_UN OUTPUT_DIR",
  ].join("\n");
}

async function main() {
  const [command, extractedDirectory, decodedDirectory, outputDirectory] =
    process.argv.slice(2);
  if (
    command !== "--extract" || extractedDirectory === undefined ||
    decodedDirectory === undefined || outputDirectory === undefined
  ) {
    throw new Error(usage());
  }
  await extractModules(extractedDirectory, decodedDirectory, outputDirectory);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { extractModules, parseRuntimeHeader };
