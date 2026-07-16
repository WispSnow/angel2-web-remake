#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseIndexedSwf(buffer, fileName = "<buffer>") {
  if (buffer.length < 6) {
    return { indexed: false, fileName, reason: "file is shorter than one 6-byte record" };
  }

  const tableSize = buffer.readUInt32LE(0);
  if (tableSize < 6 || tableSize > buffer.length || tableSize % 6 !== 0) {
    return {
      indexed: false,
      fileName,
      reason: `first uint32 (${tableSize}) is not a valid 6-byte table size`,
    };
  }

  const recordCount = tableSize / 6;
  const records = [];
  let gapBytes = 0;
  let overlapBytes = 0;
  let invalidRecords = 0;
  let missingRecords = 0;
  let terminatorRecords = 0;
  let zeroLengthRecords = 0;
  let previousEnd = tableSize;

  for (let index = 0; index < recordCount; index += 1) {
    const entryOffset = index * 6;
    const offset = buffer.readUInt32LE(entryOffset);
    const length = buffer.readUInt16LE(entryOffset + 4);
    const end = offset + length;
    const missing = offset === 0xffffffff && length === 0xffff;
    const terminator = offset === buffer.length && length === 0xffff;

    if (missing) {
      missingRecords += 1;
      records.push({ index, missing: true });
      continue;
    }
    if (terminator) {
      terminatorRecords += 1;
      records.push({ index, missing: false, terminator: true, offset, length });
      continue;
    }

    if (length === 0) {
      zeroLengthRecords += 1;
    }
    if (offset < tableSize || end > buffer.length) {
      invalidRecords += 1;
    }
    if (offset > previousEnd) {
      gapBytes += offset - previousEnd;
    }
    else if (offset < previousEnd) {
      overlapBytes += previousEnd - offset;
    }

    records.push({ index, offset, length, end, missing: false, terminator: false });
    previousEnd = Math.max(previousEnd, end);
  }

  const presentRecords = records.filter(
    (record) => !record.missing && !record.terminator,
  );
  const lengths = presentRecords.map((record) => record.length);
  const finalEnd = presentRecords.at(-1)?.end ?? tableSize;

  return {
    indexed: true,
    fileName,
    fileSize: buffer.length,
    tableSize,
    recordCount,
    presentRecords: presentRecords.length,
    payloadBytes: lengths.reduce((sum, length) => sum + length, 0),
    minRecordLength: lengths.length === 0 ? 0 : Math.min(...lengths),
    maxRecordLength: lengths.length === 0 ? 0 : Math.max(...lengths),
    missingRecords,
    terminatorRecords,
    zeroLengthRecords,
    invalidRecords,
    gapBytes,
    overlapBytes,
    trailingBytes: Math.max(0, buffer.length - finalEnd),
    records,
  };
}

async function inspectDirectory(directory) {
  const names = (await readdir(directory))
    .filter((name) => name.toUpperCase().endsWith(".SWF"))
    .sort((left, right) => left.localeCompare(right));

  const results = [];
  for (const name of names) {
    const buffer = await readFile(path.join(directory, name));
    results.push(parseIndexedSwf(buffer, name));
  }
  return results;
}

async function extractFile(inputFile, outputDirectory) {
  const buffer = await readFile(inputFile);
  const result = parseIndexedSwf(buffer, path.basename(inputFile));
  if (!result.indexed) {
    throw new Error(`${inputFile}: ${result.reason}`);
  }
  if (result.invalidRecords !== 0) {
    throw new Error(`${inputFile}: refusing to extract invalid record bounds`);
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const record of result.records) {
    if (record.missing || record.terminator) {
      continue;
    }
    const name = `${record.index.toString().padStart(4, "0")}.bin`;
    await writeFile(
      path.join(outputDirectory, name),
      buffer.subarray(record.offset, record.end),
    );
  }
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

function printTable(results) {
  console.log(
    "file".padEnd(12),
    "size".padStart(9),
    "records".padStart(7),
    "present".padStart(7),
    "table".padStart(7),
    "min".padStart(7),
    "max".padStart(7),
    "gaps".padStart(7),
    "overlap".padStart(8),
    "trail".padStart(7),
  );
  for (const result of results) {
    if (!result.indexed) {
      console.log(result.fileName.padEnd(12), "non-indexed", result.reason);
      continue;
    }
    console.log(
      result.fileName.padEnd(12),
      String(result.fileSize).padStart(9),
      String(result.recordCount).padStart(7),
      String(result.presentRecords).padStart(7),
      String(result.tableSize).padStart(7),
      String(result.minRecordLength).padStart(7),
      String(result.maxRecordLength).padStart(7),
      String(result.gapBytes).padStart(7),
      String(result.overlapBytes).padStart(8),
      String(result.trailingBytes).padStart(7),
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--extract") {
    if (args.length !== 3) {
      throw new Error("usage: swf-index.mjs --extract INPUT.SWF OUTPUT_DIR");
    }
    const result = await extractFile(args[1], args[2]);
    console.log(`extracted ${result.presentRecords} records to ${args[2]}`);
    return;
  }

  const json = args[0] === "--json";
  const directory = args[json ? 1 : 0] ?? "ref/ANGEL2";
  const results = await inspectDirectory(directory);
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  }
  else {
    printTable(results);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { parseIndexedSwf };
