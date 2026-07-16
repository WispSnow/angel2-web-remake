#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_MODULES = [21, 23, 25, 27, 29, 33, 35, 37, 44, 46];
const INDEXED_READER_PREFIX = Buffer.from("8cc02e8c06", "hex");
const B_RESOURCE_GROUP = 12;
const MODULE27_STAGE_BASE_RECORDS = [
  ...Array.from({ length: 39 }, (_, stage) => stage * 2),
  0, 48, 64, 84, 86,
];
const DUPLICATE_ODD_RECORDS = [
  { record: 79, duplicateOf: 21, duplicateStage: 10 },
  { record: 81, duplicateOf: 49, duplicateStage: 24 },
  { record: 83, duplicateOf: 65, duplicateStage: 32 },
];
const DUPLICATE_EVEN_RECORDS = [
  { record: 78, duplicateOf: 20, selectedByModule29Stage: 39 },
  { record: 80, duplicateOf: 48, selectedByModule29Stage: 40 },
  { record: 82, duplicateOf: 64, selectedByModule29Stage: 41 },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function signedWord(buffer, offset) {
  return buffer.readInt16LE(offset);
}

function readerCalls(buffer, readerOffset) {
  const calls = [];
  for (let callOffset = 0; callOffset + 2 < buffer.length; callOffset += 1) {
    if (buffer[callOffset] !== 0xe8) continue;
    const segmentBase = callOffset & ~0xffff;
    const targetWithinSegment = (callOffset + 3 + signedWord(buffer, callOffset + 1)) & 0xffff;
    if (segmentBase + targetWithinSegment !== readerOffset) continue;
    const hasImmediateGroup = callOffset >= 3 && buffer[callOffset - 3] === 0xbb;
    const group = hasImmediateGroup ? buffer.readUInt16LE(callOffset - 2) : null;
    let recordSource = "not statically decoded";
    let constantRecord = null;
    if (hasImmediateGroup && callOffset >= 6 && buffer[callOffset - 6] === 0xb9) {
      constantRecord = buffer.readUInt16LE(callOffset - 5);
      recordSource = `constant CX=${constantRecord}`;
    } else if (hasImmediateGroup && callOffset >= 5
      && buffer[callOffset - 5] === 0x8b && buffer[callOffset - 4] === 0xce) {
      recordSource = "CX copied from SI";
    } else if (hasImmediateGroup && callOffset >= 7
      && buffer[callOffset - 7] === 0x8b && buffer[callOffset - 6] === 0x0e) {
      recordSource = `CX loaded from DS:${hex(buffer.readUInt16LE(callOffset - 5))}`;
    }
    calls.push({
      callOffset,
      callAddress: `${hex(segmentBase >>> 4)}:${hex(callOffset & 0xffff)}`,
      group,
      constantRecord,
      recordSource,
      contextHex: buffer.subarray(Math.max(0, callOffset - 16), callOffset + 3).toString("hex"),
    });
  }
  return calls;
}

async function decodedRecord(directory, record) {
  const recordDirectory = path.join(directory, record.toString().padStart(4, "0"));
  const files = (await readdir(recordDirectory)).filter((name) => name.endsWith(".raw")).sort();
  const streams = [];
  for (const file of files) {
    const buffer = await readFile(path.join(recordDirectory, file));
    streams.push({ file, bytes: buffer.length, sha256: sha256(buffer) });
  }
  return streams;
}

async function duplicateAudit(extractedDirectory, decodedDirectory, entry) {
  const recordPath = path.join(extractedDirectory, `${entry.record.toString().padStart(4, "0")}.bin`);
  const duplicatePath = path.join(extractedDirectory, `${entry.duplicateOf.toString().padStart(4, "0")}.bin`);
  const [recordPayload, duplicatePayload, recordStreams, duplicateStreams] = await Promise.all([
    readFile(recordPath),
    readFile(duplicatePath),
    decodedRecord(decodedDirectory, entry.record),
    decodedRecord(decodedDirectory, entry.duplicateOf),
  ]);
  const decodedEqual = JSON.stringify(recordStreams.map(({ file, bytes, sha256: hash }) => [file, bytes, hash]))
    === JSON.stringify(duplicateStreams.map(({ file, bytes, sha256: hash }) => [file, bytes, hash]));
  if (!recordPayload.equals(duplicatePayload) || !decodedEqual) {
    throw new Error(`B/${entry.record} no longer exactly duplicates B/${entry.duplicateOf}`);
  }
  return {
    ...entry,
    extractedPayload: {
      bytes: recordPayload.length,
      sha256: sha256(recordPayload),
      byteIdentical: true,
    },
    decodedStreams: recordStreams,
    decodedByteIdentical: true,
  };
}

async function extract(runtimeDirectory, extractedDirectory, decodedDirectory, outputPath) {
  const moduleAudits = [];
  for (const moduleNumber of EXPECTED_MODULES) {
    const filename = `${moduleNumber.toString().padStart(4, "0")}-unpacked.bin`;
    const buffer = await readFile(path.join(runtimeDirectory, filename));
    const readerOffset = buffer.indexOf(INDEXED_READER_PREFIX);
    if (readerOffset < 0 || buffer.indexOf(INDEXED_READER_PREFIX, readerOffset + 1) >= 0) {
      throw new Error(`${filename}: expected exactly one indexed-resource reader signature`);
    }
    const calls = readerCalls(buffer, readerOffset);
    const bCalls = calls.filter((call) => call.group === B_RESOURCE_GROUP);
    moduleAudits.push({
      module: moduleNumber,
      filename,
      bytes: buffer.length,
      sha256: sha256(buffer),
      indexedReaderOffset: readerOffset,
      indexedReaderAddress: `${hex(readerOffset >>> 16)}:${hex(readerOffset & 0xffff)}`,
      indexedReadCallCount: calls.length,
      bResourceCalls: bCalls,
    });
  }

  const allBCalls = moduleAudits.flatMap((module) => module.bResourceCalls
    .map((call) => ({ module: module.module, ...call })));
  const expectedBCallKey = allBCalls.map((call) => `${call.module}:${call.callOffset}:${call.constantRecord ?? "SI"}`);
  const expected = ["27:1847:SI", "29:20099:SI", "46:177:88"];
  if (JSON.stringify(expectedBCallKey) !== JSON.stringify(expected)) {
    throw new Error(`unexpected B.SWF indexed-read call set: ${expectedBCallKey.join(", ")}`);
  }

  const module27 = await readFile(path.join(runtimeDirectory, "0027-unpacked.bin"));
  const selectorBytes = Buffer.alloc(MODULE27_STAGE_BASE_RECORDS.length * 2);
  MODULE27_STAGE_BASE_RECORDS.forEach((value, index) => selectorBytes.writeUInt16LE(value, index * 2));
  const selectorOffset = module27.indexOf(selectorBytes);
  if (selectorOffset < 0 || module27.indexOf(selectorBytes, selectorOffset + 1) >= 0) {
    throw new Error("module 27: expected one exact 44-word B record selector table");
  }
  const module27EffectiveRecords = MODULE27_STAGE_BASE_RECORDS.map((value) => value + 1);
  for (const { record } of DUPLICATE_ODD_RECORDS) {
    if (module27EffectiveRecords.includes(record)) throw new Error(`module 27 unexpectedly selects B/${record}`);
  }

  const [oddDuplicates, evenDuplicates] = await Promise.all([
    Promise.all(DUPLICATE_ODD_RECORDS.map((entry) => duplicateAudit(extractedDirectory, decodedDirectory, entry))),
    Promise.all(DUPLICATE_EVEN_RECORDS.map((entry) => duplicateAudit(extractedDirectory, decodedDirectory, entry))),
  ]);

  const output = {
    format: "ANGEL2 global B.SWF unselected-record and indexed-read audit",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    runtimeScope: {
      modules: EXPECTED_MODULES,
      indexedReaderIdentification: "each unpacked runtime module has exactly one function beginning 8C C0 2E 8C 06; every near caller is enumerated with 16-bit segment wrapping",
      bResourceGroup: B_RESOURCE_GROUP,
      bReadCallCount: allBCalls.length,
      bReadCalls: allBCalls,
      producers: [
        {
          module: 27,
          callOffset: 0x0737,
          rule: "record = module27 44-word selector[stage] + 1",
          selectorFileOffset: selectorOffset,
          selectorBaseRecords: MODULE27_STAGE_BASE_RECORDS,
          effectiveRecords: module27EffectiveRecords,
          result: "odd records 79, 81, and 83 are absent",
        },
        {
          module: 29,
          callOffset: 0x4e83,
          rule: "record = currentStage * 2",
          parity: "always even",
          specialStageRecords: [
            { stage: 39, record: 78 },
            { stage: 40, record: 80 },
            { stage: 41, record: 82 },
          ],
          result: "cannot select any odd record, including 79, 81, or 83",
        },
        {
          module: 46,
          callOffset: 0x00b1,
          rule: "constant record 88 for credits job-title graphics",
          result: "does not select odd battle templates",
        },
      ],
    },
    moduleAudits,
    unselectedOddTemplates: oddDuplicates.map((entry) => ({
      ...entry,
      selectedByAnyRuntimeBReadPath: false,
      classification: "exact duplicate archival template; no distinct rules or assets to reconstruct",
    })),
    reusedSpecialStageTilesets: evenDuplicates.map((entry) => ({
      ...entry,
      selectedByModule29: true,
      classification: "exact duplicate payload retained at the stage-number-derived even record",
    })),
    conclusion: "B/79 is byte-identical to B/21 (stage 10), not a unique missing template. B/81 and B/83 likewise duplicate B/49 and B/65. No released runtime B.SWF record-read producer can select odd 79/81/83; even 78/80/82 remain reachable as stage 39/40/41 tilesets.",
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`audited ${moduleAudits.length} runtime modules, ${allBCalls.length} B read paths, and ${oddDuplicates.length} unselected duplicate templates to ${outputPath}`);
}

function usage() {
  return "usage: angel2-b-record-audit.mjs --extract RUNTIME-MODULE-DIR EXTRACTED-B-DIR DECODED-B-DIR OUTPUT.json";
}

async function main() {
  const [mode, runtimeDirectory, extractedDirectory, decodedDirectory, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) throw new Error(usage());
  await extract(runtimeDirectory, extractedDirectory, decodedDirectory, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { extract, readerCalls };
