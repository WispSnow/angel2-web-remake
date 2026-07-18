#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_DATA_BASE = 0x1eba0;
const SIDE1_ACTOR_TABLE = 0x362c;
const CLASS_VISUAL_TABLE = 0x39a6;
const ACTOR_SLOTS = 60;
const GO_ARRAY_WORDS = 75;
const STAGE0_SIDE1_SLOTS_IN_MAP_ORDER = [0, 43, 42, 1, 40, 41];
const BIG5 = new TextDecoder("big5", { fatal: true });

const VERIFIED_RANGES = Object.freeze({
  module29ActorLoader: {
    address: "0000:5087-51E5",
    offset: 0x5087,
    bytes: 0x15f,
    sha256: "9ed4e09b8177bc87b773db60043cf19cc0ddab3571f41ca829c6e493fce09f68",
  },
  side1ActorTable: {
    address: "DS:362C-36A3",
    offset: SIDE1_ACTOR_TABLE,
    bytes: ACTOR_SLOTS * 2,
    sha256: "0dd35c1b3a4cd68947ae767a12a41f4f7a187a51117f50acfb610415662e6489",
  },
  classVisualTable: {
    address: "DS:39A6-3A43",
    offset: CLASS_VISUAL_TABLE,
    bytes: 158,
    sha256: "815e1c671056ee5b17c3da163cb0ab71d155fbf00f782f8a21709ed6b93735eb",
  },
  zeroArray: {
    bytes: GO_ARRAY_WORDS * 2,
    sha256: "1d83518b897b14e2943990eff655838246cc0207a7c95a5f3dfccc2e395f8bbf",
  },
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function module29DataSlice(module29, offset, bytes) {
  const start = MODULE29_DATA_BASE + offset;
  assert(start >= 0 && start + bytes <= module29.length, `DS:${hex(offset)} is outside module 29`);
  return module29.subarray(start, start + bytes);
}

function verifyRange(buffer, spec, dataSegment = false) {
  const start = dataSegment ? MODULE29_DATA_BASE + spec.offset : spec.offset;
  const bytes = buffer.subarray(start, start + spec.bytes);
  assert.equal(bytes.length, spec.bytes, `${spec.address}: truncated verified range`);
  assert.equal(sha256(bytes), spec.sha256, `${spec.address}: signature mismatch`);
  return { ...spec, fileOffset: start };
}

function readDollarTerminatedName(module29, offset, label) {
  const start = MODULE29_DATA_BASE + offset;
  const end = module29.indexOf(0x24, start);
  assert(end >= start, `${label}: missing '$' terminator`);
  const raw = module29.subarray(start, end);
  const displayName = BIG5.decode(raw);
  return {
    displayName,
    normalizedName: displayName.replaceAll(" ", ""),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function readVisualDescriptor(module29, offset, label) {
  const bytes = module29DataSlice(module29, offset, 6);
  const name = readDollarTerminatedName(module29, offset + 5, label);
  return {
    descriptorAddress: `DS:${hex(offset)}`,
    portraitRecord: bytes[0],
    layoutBytes: Array.from(bytes.subarray(1, 5)),
    displayNameAddress: `DS:${hex(offset + 5)}`,
    ...name,
  };
}

function parseSide1Actors(module29) {
  const table = module29DataSlice(module29, SIDE1_ACTOR_TABLE, ACTOR_SLOTS * 2);
  return Array.from({ length: ACTOR_SLOTS }, (_, slot) => {
    const descriptorOffset = table.readUInt16LE(slot * 2);
    return { slot, ...readVisualDescriptor(module29, descriptorOffset, `side-1 actor slot ${slot}`) };
  });
}

function parseClassVisualFallbacks(module29) {
  const entries = [];
  for (let cursor = CLASS_VISUAL_TABLE;; cursor += 4) {
    const pair = module29DataSlice(module29, cursor, 4);
    const classCodeWord = pair.readUInt16LE(0);
    if (classCodeWord === 0xffff) break;
    const classCode = pair.subarray(0, 2).toString("ascii");
    const descriptorOffset = pair.readUInt16LE(2);
    entries.push({
      classCode,
      tableAddress: `DS:${hex(cursor)}`,
      ...readVisualDescriptor(module29, descriptorOffset, `class fallback ${classCode}`),
    });
    assert(entries.length <= 64, "class visual fallback table is unterminated");
  }
  return entries;
}

function parseInitialGoArray(go, debugSymbols, symbolName) {
  const symbol = debugSymbols.symbols.find((entry) => entry.name === symbolName);
  assert(symbol, `${symbolName}: symbol is absent from GO debug data`);
  const headerBytes = go.readUInt16LE(8) * 16;
  const fileOffset = headerBytes + symbol.segment * 16 + symbol.offset;
  const bytes = go.subarray(fileOffset, fileOffset + GO_ARRAY_WORDS * 2);
  assert.equal(bytes.length, GO_ARRAY_WORDS * 2, `${symbolName}: truncated GO array`);
  assert.equal(sha256(bytes), VERIFIED_RANGES.zeroArray.sha256, `${symbolName}: expected all-zero initial array`);
  const words = Array.from({ length: GO_ARRAY_WORDS }, (_, index) => bytes.readUInt16LE(index * 2));
  assert(words.every((value) => value === 0), `${symbolName}: expected all values to be zero`);
  return {
    symbol: symbolName,
    address: symbol.address,
    fileOffset,
    words: GO_ARRAY_WORDS,
    sha256: sha256(bytes),
    allZero: true,
    values: words,
  };
}

function side1ClassCode(unitDescriptors, classRecord) {
  const record = unitDescriptors.records.find((entry) => entry.record === classRecord);
  assert(record, `class record ${classRecord}: descriptor is absent`);
  const descriptor = record.descriptors.find((entry) => entry.set === "set1");
  assert(descriptor, `class record ${classRecord}: side-1 descriptor is absent`);
  return { classCode: descriptor.code, className: record.normalizedName };
}

async function extract(
  goPath,
  debugSymbolsPath,
  module29Path,
  decodedSavesPath,
  unitDescriptorsPath,
  outputPath,
) {
  const [go, debugSymbolsText, module29, decodedSavesText, unitDescriptorsText] = await Promise.all([
    readFile(goPath),
    readFile(debugSymbolsPath, "utf8"),
    readFile(module29Path),
    readFile(decodedSavesPath, "utf8"),
    readFile(unitDescriptorsPath, "utf8"),
  ]);
  const debugSymbols = JSON.parse(debugSymbolsText);
  const decodedSaves = JSON.parse(decodedSavesText);
  const unitDescriptors = JSON.parse(unitDescriptorsText);

  assert.equal(sha256(go), debugSymbols.sha256, "GO.EXE and GO debug-symbol source hashes disagree");
  assert.equal(sha256(module29), unitDescriptors.sourceSha256, "module 29 and unit descriptor source hashes disagree");

  const verifiedRanges = [
    verifyRange(module29, VERIFIED_RANGES.module29ActorLoader),
    verifyRange(module29, VERIFIED_RANGES.side1ActorTable, true),
    verifyRange(module29, VERIFIED_RANGES.classVisualTable, true),
  ];
  const meData = parseInitialGoArray(go, debugSymbols, "ME_DATA");
  const meExp = parseInitialGoArray(go, debugSymbols, "ME_EXP");
  const actors = parseSide1Actors(module29);
  const classFallbacks = parseClassVisualFallbacks(module29);

  const just = decodedSaves.files.find((entry) => entry.fileName === "JUST.TST");
  assert(just?.state?.stage === 0, "JUST.TST is not the stage-0 next-battle template");
  const activeSide1 = just.state.activeUnitInstances.filter((unit) => unit.side === 1);
  assert.deepEqual(activeSide1.map((unit) => unit.unitSlot), STAGE0_SIDE1_SLOTS_IN_MAP_ORDER,
    "stage-0 side-1 map-order slots changed");
  assert(activeSide1.every((unit) => unit.classRecord === 0), "stage-0 side-1 roster is not entirely class record 0");

  const roster = activeSide1.map((unit, mapOrder) => {
    const actor = actors[unit.unitSlot];
    const { classCode, className } = side1ClassCode(unitDescriptors, unit.classRecord);
    const usesClassFallback = actor.portraitRecord === 0xff;
    const fallback = classFallbacks.find((entry) => entry.classCode === classCode);
    if (usesClassFallback) assert(fallback, `slot ${unit.unitSlot}: no visual fallback for ${classCode}`);
    const displayed = usesClassFallback ? fallback : actor;
    return {
      mapOrder,
      slot: unit.unitSlot,
      initialCell: unit.cell,
      initialPosition: { x: unit.x, y: unit.y },
      classRecord: unit.classRecord,
      classCode,
      occupation: className,
      campaignExperience: meExp.values[unit.unitSlot],
      actorDescriptor: {
        portraitRecord: actor.portraitRecord,
        normalizedName: actor.normalizedName,
        address: actor.descriptorAddress,
      },
      usesClassFallback,
      playerFacingIdentity: {
        unitName: displayed.normalizedName,
        portraitRecord: displayed.portraitRecord,
        nameSource: usesClassFallback ? "current class visual fallback" : "side-1 actor descriptor",
      },
    };
  });

  assert.deepEqual(roster.map((unit) => unit.playerFacingIdentity.unitName),
    ["妮雅", "士兵", "士兵", "希蜜", "士兵", "士兵"]);
  assert.deepEqual(roster.map((unit) => unit.playerFacingIdentity.portraitRecord),
    [46, 47, 47, 45, 47, 47]);

  const result = {
    format: "ANGEL2 campaign actor identities and stage-0 playable roster",
    semanticVersion: 1,
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    sources: {
      go: { path: goPath, bytes: go.length, sha256: sha256(go) },
      debugSymbols: { path: debugSymbolsPath, sha256: sha256(Buffer.from(debugSymbolsText)) },
      module29: { path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      decodedSaves: { path: decodedSavesPath, sha256: sha256(Buffer.from(decodedSavesText)) },
      unitDescriptors: { path: unitDescriptorsPath, sha256: sha256(Buffer.from(unitDescriptorsText)) },
    },
    verifiedRanges,
    newCampaignInitialArrays: {
      side1Classes: meData,
      side1Experience: meExp,
      consequence: "all 75 campaign slots begin at class record 0 and zero cumulative experience",
    },
    displayResolution: {
      actorTable: "module 29 DS:362C, 60 side-1 actor descriptor pointers",
      fallbackTable: "module 29 DS:39A6, class code to generic portrait/name descriptor",
      rule: "a portrait byte of FF in the actor descriptor replaces both portrait and name with the current class fallback",
      actors,
      classFallbacks,
    },
    stage0: {
      sourceSave: "JUST.TST",
      sourceSaveSha256: just.sha256,
      playableSide1Count: roster.length,
      mapOrderSlots: STAGE0_SIDE1_SLOTS_IN_MAP_ORDER,
      allClassRecord0: true,
      roster,
      conclusion: "stage 0 displays 妮雅 and 希蜜 as named soldiers; slots 40..43 display as four generic 士兵 units",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted stage-0 roster: ${roster.map((unit) => `${unit.slot}:${unit.playerFacingIdentity.unitName}/${unit.occupation}`).join(", ")}`);
  return result;
}

function usage() {
  return "usage: angel2-campaign-roster.mjs --extract GO_EXE GO_SYMBOLS_JSON MODULE29_RAW TST_DECODED_JSON UNIT_DESCRIPTORS_JSON OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--extract" || args.length !== 6) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { extract, parseClassVisualFallbacks, parseSide1Actors };
