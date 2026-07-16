#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function inspectPairs(buffer, pairs, label) {
  return pairs.map(({ mapMaskOffset, streamSlotOffset }, stream) => {
    assert(buffer[mapMaskOffset] === 0xb8, `${label}: ${hex(mapMaskOffset)} is not MOV AX,imm16`);
    assert(buffer[mapMaskOffset + 1] === 0x02,
      `${label}: ${hex(mapMaskOffset)} does not select Sequencer register 02h`);
    const mapMask = buffer[mapMaskOffset + 2];
    assert(buffer[streamSlotOffset] === 0xbb,
      `${label}: ${hex(streamSlotOffset)} is not MOV BX,imm16`);
    const descriptorByteOffset = buffer.readUInt16LE(streamSlotOffset + 1);
    assert(descriptorByteOffset === stream * 4,
      `${label}: stream ${stream} uses descriptor offset ${hex(descriptorByteOffset)}, expected ${hex(stream * 4)}`);
    assert((mapMask & (mapMask - 1)) === 0 && mapMask <= 8,
      `${label}: ${hex(mapMask, 2)} is not a single VGA plane mask`);
    return {
      stream,
      descriptorByteOffset,
      mapMask,
      vgaPlane: Math.log2(mapMask),
      colorBit: Math.log2(mapMask),
      evidenceOffsets: {
        mapMaskInstruction: hex(mapMaskOffset),
        streamSlotInstruction: hex(streamSlotOffset),
      },
    };
  });
}

async function inspectModule(file, spec) {
  const buffer = await readFile(file);
  assert(sha256(buffer) === spec.sha256, `${file}: unexpected module SHA-256`);
  const routines = spec.routines.map((routine) => {
    const bytes = buffer.subarray(routine.start, routine.end);
    assert(sha256(bytes) === routine.sha256,
      `${file}: ${routine.name} signature mismatch`);
    return {
      name: routine.name,
      range: `${hex(routine.start)}..${hex(routine.end)}`,
      byteLength: bytes.length,
      sha256: routine.sha256,
      pairs: inspectPairs(buffer, routine.pairs, `${path.basename(file)} ${routine.name}`),
    };
  });
  const orders = routines.map((routine) => routine.pairs.map((entry) => entry.colorBit).join(","));
  assert(orders.every((order) => order === "3,2,1,0"),
    `${file}: native routines disagree with stream-to-color order 3,2,1,0`);
  return {
    file,
    sha256: spec.sha256,
    routines,
  };
}

const STORY_SPEC = {
  sha256: "effd54fb08397bb84f3593d35d025a56479d91d39cd5d44086eb803058c5172a",
  routines: [{
    name: "generic four-plane bitmap renderer",
    start: 0x1c5a,
    end: 0x1cd5,
    sha256: "ae5d50cf7d605dd6d04c784ffb6f48d59f6188f875c5f90dc09685b982d143ff",
    pairs: [
      { mapMaskOffset: 0x1c61, streamSlotOffset: 0x1c74 },
      { mapMaskOffset: 0x1c7a, streamSlotOffset: 0x1c8d },
      { mapMaskOffset: 0x1c93, streamSlotOffset: 0x1ca6 },
      { mapMaskOffset: 0x1cac, streamSlotOffset: 0x1cbf },
    ],
  }],
};

const PASSWORD_SPEC = {
  sha256: "5ba7f2c782e84c0b66fca820e138276f9e67928064ee421d5c892cf1f7859012",
  routines: [{
    name: "password-screen four-plane bitmap renderer",
    start: 0x13c6,
    end: 0x1441,
    sha256: "a95f7972c858ac480a8388e28c9df9e446ac86cecd9e21c4acdc886d40d72215",
    pairs: [
      { mapMaskOffset: 0x13cd, streamSlotOffset: 0x13e0 },
      { mapMaskOffset: 0x13e6, streamSlotOffset: 0x13f9 },
      { mapMaskOffset: 0x13ff, streamSlotOffset: 0x1412 },
      { mapMaskOffset: 0x1418, streamSlotOffset: 0x142b },
    ],
  }],
};

const BATTLE_SPEC = {
  sha256: "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4",
  routines: [
    {
      name: "full-bright terrain renderer",
      start: 0x388a,
      end: 0x38f5,
      sha256: "85b7119c0c872e53073112d9daa8c28d18caf36cdd5ac6cb2120c4ab67c02a41",
      pairs: [
        { mapMaskOffset: 0x38a0, streamSlotOffset: 0x38a7 },
        { mapMaskOffset: 0x38b5, streamSlotOffset: 0x38bc },
        { mapMaskOffset: 0x38ca, streamSlotOffset: 0x38d1 },
        { mapMaskOffset: 0x38df, streamSlotOffset: 0x38e6 },
      ],
    },
    {
      name: "dithered terrain renderer",
      start: 0x38f5,
      end: 0x3960,
      sha256: "c225cd1d9dca001d31a4b2e616a952f2bf1650e1b90785ac4e3febbfef748d37",
      pairs: [
        { mapMaskOffset: 0x390b, streamSlotOffset: 0x3912 },
        { mapMaskOffset: 0x3920, streamSlotOffset: 0x3927 },
        { mapMaskOffset: 0x3935, streamSlotOffset: 0x393c },
        { mapMaskOffset: 0x394a, streamSlotOffset: 0x3951 },
      ],
    },
  ],
};

async function main() {
  const [command, passwordModule, storyModule, battleModule, outputFile] = process.argv.slice(2);
  if (command !== "--extract" || outputFile === undefined) {
    throw new Error("usage: angel2-plane-order.mjs --extract MODULE21 MODULE25 MODULE29 OUTPUT.json");
  }
  const modules = await Promise.all([
    inspectModule(passwordModule, PASSWORD_SPEC),
    inspectModule(storyModule, STORY_SPEC),
    inspectModule(battleModule, BATTLE_SPEC),
  ]);
  const output = {
    schemaVersion: 1,
    subject: "ANGEL2 four-stream planar color-index order",
    conclusion: "resource streams 0..3 map to VGA color-index bits 3..0",
    streamToColorBit: [3, 2, 1, 0],
    streamToVgaMapMask: [8, 4, 2, 1],
    nativeRule: "Sequencer register 02h Map Mask selects VGA plane/color bit; each source descriptor occupies one four-byte far-pointer slot",
    correctedCompositeRule: "paletteIndex |= sourceBit(stream) << streamToColorBit[stream]",
    priorRendererDefect: "the old extractor mapped streams 0..3 to bits 0..3, reversing every four-bit palette index",
    modules,
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`verified native stream-to-color order 3,2,1,0 across ${modules.length} modules`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
