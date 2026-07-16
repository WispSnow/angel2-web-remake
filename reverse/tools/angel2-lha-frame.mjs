#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function parseFrameOffsets(buffer, fileName = "record") {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 20) {
    throw new Error(`${fileName}: missing five-offset frame directory`);
  }
  const offsets = Array.from({ length: 5 }, (_, index) =>
    buffer.readUInt32LE(index * 4));
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index];
    if (offset < 20 || offset > buffer.length) {
      throw new Error(`${fileName}: frame ${index} offset is out of bounds`);
    }
    if (index > 0 && offset < offsets[index - 1]) {
      throw new Error(`${fileName}: frame offsets are not monotonic`);
    }
  }
  return offsets;
}

function parseFrame(buffer, offset, end, fileName = "record") {
  if (offset === end) {
    return { offset, end, present: false };
  }
  if (end - offset < 3) {
    throw new Error(`${fileName}: frame at ${offset} is shorter than its header`);
  }
  const unpackedLength = buffer.readUInt16LE(offset);
  const compression = buffer[offset + 2];
  if (compression !== 0 && compression !== 1) {
    throw new Error(
      `${fileName}: frame at ${offset} has unsupported compression ${compression}`,
    );
  }
  return {
    offset,
    end,
    present: true,
    unpackedLength,
    compression,
    payload: buffer.subarray(offset + 3, end),
  };
}

function crc16Ibm(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

function makeLevel0Lha(
  compressed,
  unpackedLength,
  outputName,
  crc = 0,
  method = "-lh7-",
) {
  const name = Buffer.from(outputName, "ascii");
  if (name.length > 230) {
    throw new Error("LHA member name is too long");
  }
  const headerSize = 22 + name.length;
  const header = Buffer.alloc(headerSize + 2);
  header[0] = headerSize;
  if (!/^-lh[4-7]-$/.test(method)) {
    throw new Error(`unsupported LHA method ${method}`);
  }
  header.write(method, 2, "ascii");
  header.writeUInt32LE(compressed.length, 7);
  header.writeUInt32LE(unpackedLength, 11);
  header.writeUInt32LE(0, 15);
  header[19] = 0x20;
  header[20] = 0;
  header[21] = name.length;
  name.copy(header, 22);
  header.writeUInt16LE(crc, 22 + name.length);
  let checksum = 0;
  for (let index = 2; index < header.length; index += 1) {
    checksum = (checksum + header[index]) & 0xff;
  }
  header[1] = checksum;
  return Buffer.concat([header, compressed, Buffer.from([0])]);
}

async function wrapFrame(recordFile, frameIndex, outputFile) {
  const buffer = await readFile(recordFile);
  const offsets = parseFrameOffsets(buffer, recordFile);
  const offset = offsets[frameIndex];
  const end = frameIndex + 1 < offsets.length
    ? offsets[frameIndex + 1]
    : buffer.length;
  const frame = parseFrame(buffer, offset, end, recordFile);
  if (!frame.present) {
    throw new Error(`${recordFile}: frame ${frameIndex} is absent`);
  }
  if (frame.compression === 0) {
    if (frame.payload.length < frame.unpackedLength) {
      throw new Error(`${recordFile}: stored frame is shorter than declared length`);
    }
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, frame.payload.subarray(0, frame.unpackedLength));
    console.log(`wrote stored frame (${frame.unpackedLength} bytes) to ${outputFile}`);
    return;
  }
  const memberName = `${path.basename(recordFile, path.extname(recordFile))}-${frameIndex}.raw`;
  const archive = makeLevel0Lha(frame.payload, frame.unpackedLength, memberName);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, archive);
  console.log(
    `wrapped LH7 frame ${frameIndex}: ${frame.payload.length} -> ${frame.unpackedLength} bytes`,
  );
}

async function decodeFrame(frame) {
  if (frame.compression === 0) {
    if (frame.payload.length < frame.unpackedLength) {
      throw new Error("stored frame is shorter than its declared length");
    }
    return frame.payload.subarray(0, frame.unpackedLength);
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "angel2-lh7-"));
  const archiveFile = path.join(temporaryDirectory, "frame.lzh");
  try {
    await writeFile(
      archiveFile,
      makeLevel0Lha(frame.payload, frame.unpackedLength, "frame.raw"),
    );
    const result = spawnSync("lha", ["pq", archiveFile], {
      encoding: null,
      maxBuffer: Math.max(1024 * 1024, frame.unpackedLength * 2),
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`lha exited with status ${result.status}`);
    }
    if (result.stdout.length !== frame.unpackedLength) {
      throw new Error(
        `LH7 output length ${result.stdout.length} != ${frame.unpackedLength}`,
      );
    }
    return result.stdout;
  }
  finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseRecordStreams(buffer, fileName = "record") {
  if (buffer.length === 3 && buffer.equals(Buffer.from([0x0d, 0x0a, 0x1a]))) {
    return { kind: "placeholder", streams: [] };
  }

  if (buffer.length >= 2 && buffer[0] === 0xaa && buffer[1] === 0x55) {
    return { kind: "opaque", streams: [] };
  }

  if (buffer.length >= 20 && buffer.readUInt32LE(0) === 20) {
    const offsets = parseFrameOffsets(buffer, fileName);
    const streams = offsets.map((offset, index) => {
      const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length;
      return parseFrame(buffer, offset, end, fileName);
    });
    return { kind: "five_stream_package", streams };
  }

  // Several top-level records are uncompressed 16x15 monochrome glyph arrays.
  // Their first three bytes can accidentally resemble a single LH7 stream
  // header, so recognize the confirmed fixed-stride layout first. Real glyph
  // sets overwhelmingly leave the fifteenth row blank; the density bound keeps
  // arbitrary compressed/data records out of this conservative classifier.
  if (buffer.length >= 16 * 30 && buffer.length % 30 === 0) {
    const glyphCount = buffer.length / 30;
    let blankFinalRows = 0;
    let setBits = 0;
    for (let glyph = 0; glyph < glyphCount; glyph += 1) {
      if (buffer.readUInt16BE(glyph * 30 + 28) === 0) {
        blankFinalRows += 1;
      }
      for (let row = 0; row < 15; row += 1) {
        let bits = buffer.readUInt16BE(glyph * 30 + row * 2);
        while (bits !== 0) {
          setBits += bits & 1;
          bits >>>= 1;
        }
      }
    }
    const blankFinalRowRatio = blankFinalRows / glyphCount;
    const setBitRatio = setBits / (glyphCount * 16 * 15);
    if (blankFinalRowRatio >= 0.9 && setBitRatio >= 0.15 && setBitRatio <= 0.4) {
      return {
        kind: "raw_16x15_glyph_array",
        streams: [],
        glyphs: { glyphCount, blankFinalRowRatio, setBitRatio },
      };
    }
  }

  if (buffer.length >= 3 && buffer.readUInt16LE(0) > 0 &&
      (buffer[2] === 0 || buffer[2] === 1)) {
    try {
      const stream = parseFrame(buffer, 0, buffer.length, fileName);
      const sizeIsPlausible = stream.compression === 0
        ? stream.payload.length === stream.unpackedLength
        : stream.payload.length <= stream.unpackedLength;
      if (sizeIsPlausible) {
        return { kind: "single_stream", streams: [stream] };
      }
    }
    catch {
      // Fall through to an opaque record classification.
    }
  }

  return { kind: "opaque", streams: [] };
}

async function extractResource(inputDirectory, outputDirectory) {
  const names = (await readdir(inputDirectory))
    .filter((name) => /^\d{4}\.bin$/.test(name))
    .sort();
  const records = [];
  let streamCount = 0;
  let unpackedBytes = 0;

  for (const name of names) {
    const inputFile = path.join(inputDirectory, name);
    const buffer = await readFile(inputFile);
    const parsed = parseRecordStreams(buffer, inputFile);
    const record = {
      record: Number.parseInt(name, 10),
      fileName: name,
      sourceBytes: buffer.length,
      kind: parsed.kind,
      streams: [],
    };
    if (parsed.glyphs !== undefined) {
      record.glyphs = parsed.glyphs;
    }

    for (let index = 0; index < parsed.streams.length; index += 1) {
      const frame = parsed.streams[index];
      if (!frame.present) {
        record.streams.push({ index, present: false });
        continue;
      }
      let decoded;
      try {
        decoded = await decodeFrame(frame);
      }
      catch (error) {
        if (parsed.kind === "single_stream") {
          record.kind = "opaque";
          record.decodeError = error.message;
          record.streams = [];
          break;
        }
        throw new Error(`${inputFile}, stream ${index}: ${error.message}`);
      }
      const relativeOutput = path.join(
        name.replace(/\.bin$/, ""),
        `${index.toString().padStart(2, "0")}.raw`,
      );
      const outputFile = path.join(outputDirectory, relativeOutput);
      await mkdir(path.dirname(outputFile), { recursive: true });
      await writeFile(outputFile, decoded);
      record.streams.push({
        index,
        present: true,
        compression: frame.compression === 0 ? "stored" : "lh7",
        sourceOffset: frame.offset,
        packedBytes: frame.payload.length,
        unpackedBytes: decoded.length,
        output: relativeOutput,
      });
      streamCount += 1;
      unpackedBytes += decoded.length;
    }
    records.push(record);
  }

  const manifest = {
    format: "ANGEL2 embedded stored/LH7 streams",
    sourceDirectory: inputDirectory,
    records: records.length,
    decodedStreams: streamCount,
    unpackedBytes,
    kinds: Object.fromEntries(
      [...new Set(records.map((record) => record.kind))].sort().map((kind) => [
        kind,
        records.filter((record) => record.kind === kind).length,
      ]),
    ),
    entries: records,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `decoded ${streamCount} streams (${unpackedBytes} bytes) from ${records.length} records`,
  );
  console.log(JSON.stringify(manifest.kinds));
}

function usage() {
  return [
    "usage:",
    "  angel2-lha-frame.mjs --wrap RECORD.bin FRAME_INDEX OUTPUT.lzh",
    "  angel2-lha-frame.mjs --extract-resource INPUT_DIR OUTPUT_DIR",
  ].join("\n");
}

async function main() {
  const [command, recordFile, frameText, outputFile] = process.argv.slice(2);
  if (command === "--wrap" && outputFile !== undefined && /^[0-4]$/.test(frameText)) {
    await wrapFrame(recordFile, Number.parseInt(frameText, 10), outputFile);
    return;
  }
  if (command === "--extract-resource" && recordFile !== undefined && frameText !== undefined && outputFile === undefined) {
    await extractResource(recordFile, frameText);
    return;
  }
  throw new Error(usage());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export {
  crc16Ibm,
  decodeFrame,
  makeLevel0Lha,
  parseFrame,
  parseFrameOffsets,
  parseRecordStreams,
};
