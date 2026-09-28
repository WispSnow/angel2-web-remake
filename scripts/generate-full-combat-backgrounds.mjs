#!/usr/bin/env node

// Rebuilds the full-screen battle backdrop catalog from module 29.
//
// `0000:90D8` selects one `C.SWF` battlefield record per ordinary attack before
// dispatching the presentation: `0000:95F8` walks the DS:78DC stage table, and
// unless the stage is exempt it hands over to `0000:962E`, which re-reads the
// defender cell's raw terrain token, resolves it to a logical MAP slot and
// replaces the record for the outdoor slots. Both the table and the compare
// chain are decoded here instead of being transcribed, so a different runtime
// image fails the run rather than silently shipping stale content.
//
// The same module also fixes how the chosen record reaches the screen: `AEC3`
// composes it into the 448-pixel battle buffer in five parallax layers
// (`AF8A`), `AEEF` then advances each layer's code-segment phase word with
// truncating wraps, `F2CC` presents only a 432x147 part of the buffer, and the
// window frame drawn at entry covers the buffer columns that never reach the
// screen (REMAKE-169). Those constants are decoded from the same image.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PALETTES,
  composePlanarImage,
  encodeRgbaPng,
  parseBitmapBundle,
} from "../reverse/tools/angel2-planar.mjs";
import { assertIdenticalImage, removeDuplicateImage } from "./lib/shared-image-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(root, "reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin");
const decodedC = path.join(root, "reverse/decoded/C");
const publicRoot = path.join(root, "public/assets/original/full-combat/backgrounds");
const outputPath = path.join(root, "src/game/content/full-combat-backgrounds.generated.ts");

const DATA_LINEAR_BASE = 0x1eba0;
const STAGE_TABLE = 0x78dc;
const SELECTED_RECORD = 0x77b2;
const CURRENT_STAGE = 0x2e77;
const DEFENDER_CELL = 0x77c1;
/** Every `C.SWF` battlefield is one 56-byte-per-plane row wide. */
const BACKDROP_WIDTH = 448;
/**
 * Most records are 148 rows; `C/17` and `C/27` declare 149 in their image
 * header, and `F1AC` copies that extra row into the background source planes,
 * where the lowest layer can read it.
 */
const BACKDROP_MIN_ROWS = 148;
const BACKDROP_MAX_ROWS = 149;
const DIRECTION_WORD = 0x7d31;
const PIXELS_PER_BYTE = 8;
const VGA_ROW_BYTES = 80;

// Every byte the decoders below step through, pinned so an unexpected runtime
// image aborts instead of producing a plausible-looking wrong table.
const CODE_SIGNATURES = [
  ["0000:90D8", "select-background-before-attack-dispatch",
    "ff360460c70604604e00c706ed5dffff9a98009d13a1a9018ec0b801008b1ec177268807"],
  ["0000:95F8", "select-full-screen-battle-background",
    "8b16772ebb00008b87dc783dffff74093bc2740883c304ebee"],
  ["0000:962E", "override-background-by-defender-terrain",
    "8b3ec177a1a7018ec033db268a1d03db8b9f7d2e06a12600"],
  ["1000:0360", "allocate-battle-buffer-and-background-source-planes",
    "a180f8a3b90205a002a3bd0205a002a3c10205a002a3c50205a002a11902a3c90205a002a3cd0205a002a3d10205a002a3d502c3"],
  ["0000:9859", "full-screen-entry-stops-the-backdrop", "c706317d3a4a"],
  ["0000:9B73", "draw-battle-window-frame",
    "beea7de8d734bef47de8d134befe7de8cb34be087ee8c534be127ee8bf34be1c7ee8b934be267ee8b334be307ee8ad34be3a7ee8a734be447ee8a134be4e7ee89b34be587ee89534be627ee88f34be6c7ee88934e85e02c3"],
  ["0000:A22B", "post-hit-stream-stops-the-backdrop", "c706317d3a4a"],
  ["0000:AD51", "hold-redraw-presents-without-yd",
    "e86f01e8f302e89707e86006b8b902ba0800e86645e88e09b90100e84726c3"],
  ["0000:ADCE", "substep-present-with-yd-toggle",
    "813ef27944597414b8b902ba0800e8ed44e815092ec7060cae0000c32e83360cae2033d22ea10caebb3800f7e38bd083c208b8b9028bd2e8c444e8ec08c3"],
  ["0000:AEC3", "compose-backdrop-then-advance-phases",
    "a1b9028b1ec902e8bd00a1bd028b1ecd02e8b300a1c1028b1ed102e8a900a1c5028b1ed502e89f00e80100c3"],
  ["0000:AEEF", "advance-five-backdrop-phases",
    "1eb8ba1e8ed8a1317d1f3d3a5274063d3a4c742fc3bb0000b80100e85300bb0200b80200e84a00bb0400b80300e84100bb0600b80400e83800bb0800b80500e82f00c3bb0000b8ffffe83a00bb0200b8feffe83100bb0400b8fdffe82800bb0600b8fcffe81f00bb0800b8fbffe81600c32e0187d9af2e83bfd9af3872072ec787d9af0000c32e0187d9af2e83bfd9af007f072ec787d9af3800c3"],
  ["0000:AF8A", "compose-five-backdrop-layers",
    "1e8ec08edbbe3a002e0336d9afbf0000b9400ce84300bf8018be80182e0336dbafb9e000f3a5be401a2e0336ddafb9e000f3a5be001c2e0336dfafb9e000f3a5bec01d2e0336e1afb98801f3a51fc3"],
  ["0000:AFE3", "wrap-far-layer-within-each-row",
    "83fe007d01c383fe38720683ee38ebf6c3e80500c300000000ba38002bd62e8936f8af2e8916faaf83fa007415b970005156578bcaf3a45f5e5983c63883c738e2ee8bfa2e8b16f8af83fa007418be0000b970005156578bcaf3a45f5e5983c63883c738e2eec3"],
  ["0000:B98E", "in-battle-load-stays-inside-module-29",
    "813e4a3d32597401c3e8d579e890ca833e4a3d5874059a0000dd10"],
  ["0000:F2CC", "present-432x147-of-the-battle-buffer",
    "a304fa8bc233d2bb0800f7f3a306faa182f88ec0bace03b80500efe80100c3bada03eca80874fb8b3606fabf6d318b1e04fabac403b80208ef8b078ed8b99300515657b91b00f3a55f5e83c63883c75059e2edb8ba1e8ed88b3606fabf6d318b1e04fabac403b80204ef8b47048ed8b99300515657b91b00f3a55f5e83c63883c75059e2edb8ba1e8ed88b3606fabf6d318b1e04fabac403b80202ef8b47088ed8b99300515657b91b00f3a55f5e83c63883c75059e2edb8ba1e8ed88b3606fabf6d318b1e04fabac403b80201ef8b470c8ed8b99300515657b91b00f3a55f5e83c63883c75059e2edb8ba1e8ed8c3"],
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hex = (value, width = 4) => value.toString(16).toUpperCase().padStart(width, "0");
const dsLinear = (offset) => DATA_LINEAR_BASE + offset;

const moduleBuffer = await readFile(modulePath);

const verifiedCodeSignatures = CODE_SIGNATURES.map(([address, role, expectedHex]) => {
  const [segment, offset] = address.split(":").map((part) => Number.parseInt(part, 16));
  const linear = segment * 16 + offset;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = moduleBuffer.subarray(linear, linear + expected.length);
  assert(actual.equals(expected), `${address}: ${role} signature mismatch`);
  return { address, role, bytes: expected.length, sha256: sha256(expected) };
});

const readWord = (dsOffset) => moduleBuffer.readUInt16LE(dsLinear(dsOffset));
const codeByte = (offset) => moduleBuffer.readUInt8(offset);
const codeWord = (offset) => moduleBuffer.readUInt16LE(offset);

/**
 * DS:78DC holds `{stage, record}` word pairs closed by FFFFh. 95F8 restarts the
 * cursor at the table head when it runs off the end, so an unlisted stage keeps
 * the first entry's record rather than defaulting to record 0.
 */
function decodeStageTable() {
  const entries = [];
  for (let index = 0; index < 128; index += 1) {
    const stage = readWord(STAGE_TABLE + index * 4);
    if (stage === 0xffff) {
      return { entries, terminatorAddress: `DS:${hex(STAGE_TABLE + index * 4)}` };
    }
    entries.push({ stage, record: readWord(STAGE_TABLE + index * 4 + 2) });
  }
  throw new Error(`DS:${hex(STAGE_TABLE)}: missing FFFFh terminator`);
}

/** `cmp dx,imm16` / `jz` triples guarding the call into the terrain override. */
function decodeExemptStages(start) {
  const stages = [];
  let cursor = start;
  while (codeByte(cursor) === 0x83 && codeByte(cursor + 1) === 0xfa) {
    stages.push(codeByte(cursor + 2));
    assert(codeByte(cursor + 3) === 0x74, `0000:${hex(cursor)}: expected jz after cmp dx`);
    cursor += 5;
  }
  assert(stages.length > 0, `0000:${hex(start)}: no exempt-stage comparisons`);
  assert(codeByte(cursor) === 0xe8, `0000:${hex(cursor)}: expected call into the terrain override`);
  const target = cursor + 3 + moduleBuffer.readInt16LE(cursor + 1);
  return { stages, overrideEntry: target };
}

/** `mov word [77B2h],imm16` / `ret` — the constant tail of every switch arm. */
function decodeRecordStore(offset) {
  assert(codeWord(offset) === 0x06c7 && codeWord(offset + 2) === SELECTED_RECORD,
    `0000:${hex(offset)}: expected a store into DS:${hex(SELECTED_RECORD)}`);
  const record = codeWord(offset + 4);
  assert(codeByte(offset + 6) === 0xc3, `0000:${hex(offset)}: store is not followed by ret`);
  return record;
}

/**
 * One switch arm. Most write a constant; the slot-7/8/12 arm first compares the
 * current stage so stage 10 substitutes its own record.
 */
function decodeSwitchArm(offset) {
  if (codeWord(offset) === 0x06c7) {
    return { record: decodeRecordStore(offset), stageOverrides: [] };
  }
  assert(codeByte(offset) === 0xa1 && codeWord(offset + 1) === CURRENT_STAGE,
    `0000:${hex(offset)}: unrecognised switch arm`);
  assert(codeByte(offset + 3) === 0x3d, `0000:${hex(offset)}: expected cmp ax,imm16`);
  const stage = codeWord(offset + 4);
  assert(codeByte(offset + 6) === 0x74, `0000:${hex(offset)}: expected jz`);
  const substitute = offset + 8 + moduleBuffer.readInt8(offset + 7);
  return {
    record: decodeRecordStore(offset + 8),
    stageOverrides: [{ stage, record: decodeRecordStore(substitute) }],
  };
}

/** `cmp ax,imm16` / `jz` chain over the defender cell's logical terrain slot. */
function decodeTerrainSwitch(start) {
  const arms = [];
  const unreachable = [];
  const matched = new Set();
  let cursor = start;
  while (codeByte(cursor) === 0x3d) {
    const slot = codeWord(cursor + 1);
    assert(codeByte(cursor + 3) === 0x74, `0000:${hex(cursor)}: expected jz after cmp ax`);
    const arm = decodeSwitchArm(cursor + 5 + moduleBuffer.readInt8(cursor + 4));
    // A later duplicate compare can never run; keep it visible as evidence
    // instead of letting it look like a second rule for the same slot.
    if (matched.has(slot)) unreachable.push({ slot, ...arm });
    else arms.push({ slot, ...arm });
    matched.add(slot);
    cursor += 5;
  }
  assert(arms.length > 0, `0000:${hex(start)}: no terrain-slot comparisons`);
  assert(codeByte(cursor) === 0xc3, `0000:${hex(cursor)}: switch chain is not closed by ret`);
  return { arms, unreachable };
}

/** Asserts a fixed byte run and returns the offset just past it. */
function expectBytes(offset, bytes, what) {
  bytes.forEach((byte, index) => assert(codeByte(offset + index) === byte,
    `${hex(offset + index, 5)}: expected ${what}`));
  return offset + bytes.length;
}

/** Target of the segment-0 `call rel16` at `offset`. */
function nearCallTarget(offset) {
  expectBytes(offset, [0xe8], "call rel16");
  return (offset + 3 + moduleBuffer.readInt16LE(offset + 1)) & 0xffff;
}

/**
 * `AEC3` feeds each buffer plane and its background source plane to one
 * composer, then calls the phase update once, after all four planes are drawn.
 */
function decodeComposeSubstep(start) {
  const planes = [];
  let cursor = start;
  while (codeByte(cursor) === 0xa1) {
    const destination = codeWord(cursor + 1);
    cursor = expectBytes(cursor + 3, [0x8b, 0x1e], "mov bx,[source plane]");
    planes.push({ destination, source: codeWord(cursor), composer: nearCallTarget(cursor + 2) });
    cursor += 5;
  }
  assert(planes.length === 4 && planes.every(({ composer }) => composer === planes[0].composer),
    `0000:${hex(start)}: expected four planes through one composer`);
  const phaseUpdate = nearCallTarget(cursor);
  expectBytes(cursor + 3, [0xc3], "ret after the phase update");
  return { planes, composer: planes[0].composer, phaseUpdate };
}

/**
 * `AF8A`: the far layer starts at `seed + phase` and wraps inside each row;
 * every other layer is one `rep movsw` run from `base + phase`, copied onto the
 * same buffer rows, so a row's right end continues into the next source row.
 */
function decodeComposer(start) {
  let cursor = expectBytes(start, [0x1e, 0x8e, 0xc0, 0x8e, 0xdb, 0xbe],
    "push ds; mov es,ax; mov ds,bx; mov si,far seed");
  const farSeed = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0x2e, 0x03, 0x36], "add si,[cs:far phase]");
  const farPhaseWord = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0xbf, 0x00, 0x00, 0xb9], "mov di,0; mov cx,imm16");
  const farCopy = nearCallTarget(cursor + 2);
  cursor += 5;
  const linearLayers = [];
  let destination;
  while (codeByte(cursor) !== 0x1f) {
    if (codeByte(cursor) === 0xbf) {
      destination = codeWord(cursor + 1);
      cursor += 3;
    }
    cursor = expectBytes(cursor, [0xbe], "mov si,layer base");
    const base = codeWord(cursor);
    cursor = expectBytes(cursor + 2, [0x2e, 0x03, 0x36], "add si,[cs:layer phase]");
    const phaseWord = codeWord(cursor);
    cursor = expectBytes(cursor + 2, [0xb9], "mov cx,words");
    const words = codeWord(cursor);
    cursor = expectBytes(cursor + 2, [0xf3, 0xa5], "rep movsw");
    assert(destination === base,
      `0000:${hex(cursor)}: layer from source ${hex(base)} lands on buffer offset ${hex(destination ?? 0)}`);
    linearLayers.push({ base, phaseWord, bytes: words * 2 });
    destination += words * 2;
  }
  expectBytes(cursor, [0x1f, 0xc3], "pop ds; ret");
  return { farSeed, farPhaseWord, farCopy, linearLayers };
}

/**
 * `AFE3` subtracts whole rows from the far layer's start, then `AFFC` copies
 * each of its rows as two runs, `[start, row end)` and `[0, start)`.
 */
function decodeFarLayerCopy(start) {
  let cursor = expectBytes(start, [0x83, 0xfe, 0x00, 0x7d, 0x01, 0xc3, 0x83, 0xfe],
    "cmp si,0; jnl; ret; cmp si,row bytes");
  const rowBytes = codeByte(cursor);
  cursor = expectBytes(cursor + 1, [0x72, 0x06, 0x83, 0xee, rowBytes, 0xeb, 0xf6, 0xc3],
    "jc copy; sub si,row bytes; jmp");
  const rotate = nearCallTarget(cursor);
  expectBytes(rotate, [0xba], "mov dx,row bytes");
  assert(codeWord(rotate + 1) === rowBytes, `0000:${hex(rotate)}: row width differs`);
  const runs = [rotate + 0x14, rotate + 0x38].map((loop) => {
    expectBytes(loop, [0xb9], "mov cx,rows");
    return codeWord(loop + 1);
  });
  for (const advance of [rotate + 0x21, rotate + 0x45]) {
    expectBytes(advance, [0x83, 0xc6, rowBytes, 0x83, 0xc7, rowBytes], "add si,row; add di,row");
  }
  assert(runs[0] === runs[1], `0000:${hex(rotate)}: the two runs cover different row counts`);
  return { rowBytes, rows: runs[0] };
}

/**
 * `add [cs:bx+phase],ax; cmp [cs:bx+phase],limit; j<keep>; mov [cs:bx+phase],
 * reset; ret`. Crossing the limit writes the reset value outright, so a step
 * that overshoots loses its remainder instead of wrapping modulo a row.
 */
function decodePhaseWrap(start) {
  let cursor = expectBytes(start, [0x2e, 0x01, 0x87], "add [cs:bx+phase],ax");
  const phaseBase = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0x2e, 0x83, 0xbf], "cmp [cs:bx+phase],imm8");
  assert(codeWord(cursor) === phaseBase, `0000:${hex(cursor)}: compare reads another word`);
  const limit = moduleBuffer.readInt8(cursor + 2);
  const keepJump = codeByte(cursor + 3);
  assert(keepJump === 0x72 || keepJump === 0x7f, `0000:${hex(cursor + 3)}: unexpected keep branch`);
  expectBytes(cursor + 4, [0x07, 0x2e, 0xc7, 0x87], "skip the reset; mov [cs:bx+phase],imm16");
  assert(codeWord(cursor + 8) === phaseBase, `0000:${hex(cursor + 8)}: reset writes another word`);
  const reset = codeWord(cursor + 10);
  expectBytes(cursor + 12, [0xc3], "ret");
  // jc keeps unsigned values below the limit; jg keeps signed values above it.
  return { phaseBase, limit, reset, resetWhen: keepJump === 0x72 ? "atOrAbove" : "atOrBelow" };
}

/**
 * `AEEF` reads the direction word; `:R` and `:L` each call one wrap routine per
 * layer with `bx = layer * 2` and a signed byte step, any other value leaves
 * the phases alone.
 */
function decodePhaseUpdate(start) {
  let cursor = expectBytes(start, [0x1e, 0xb8], "push ds; mov ax,data segment");
  cursor = expectBytes(cursor + 2, [0x8e, 0xd8, 0xa1], "mov ds,ax; mov ax,[direction]");
  const directionWord = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0x1f], "pop ds");
  const branches = [];
  while (codeByte(cursor) === 0x3d) {
    const token = codeWord(cursor + 1);
    expectBytes(cursor + 3, [0x74], "jz direction block");
    branches.push({ token, block: cursor + 5 + moduleBuffer.readInt8(cursor + 4) });
    cursor += 5;
  }
  expectBytes(cursor, [0xc3], "ret for any other direction");
  return {
    directionWord,
    branches: branches.map(({ token, block }) => {
      const steps = [];
      let wrap;
      let at = block;
      while (codeByte(at) === 0xbb) {
        assert(codeWord(at + 1) === steps.length * 2, `0000:${hex(at)}: layers out of order`);
        expectBytes(at + 3, [0xb8], "mov ax,step");
        steps.push(moduleBuffer.readInt16LE(at + 4));
        const target = nearCallTarget(at + 6);
        assert(wrap === undefined || wrap === target, `0000:${hex(at)}: layers use different wraps`);
        wrap = target;
        at += 9;
      }
      expectBytes(at, [0xc3], "ret");
      return { token, steps, wrapAddress: wrap, wrap: decodePhaseWrap(wrap) };
    }),
  };
}

/**
 * `F2CC` divides DX by eight into a buffer byte offset, waits for vertical
 * retrace, then copies the same rows x bytes rectangle of every plane to one
 * VGA offset; the caller never passes a width or height.
 */
function decodePresent(start) {
  let cursor = expectBytes(start, [0xa3], "mov [plane table],ax");
  const tablePointer = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0x8b, 0xc2, 0x33, 0xd2, 0xbb], "mov ax,dx; xor dx,dx; mov bx,imm16");
  const pixelsPerByte = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0xf7, 0xf3, 0xa3], "div bx; mov [source offset],ax");
  const sourcePointer = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [
    0xa1, 0x82, 0xf8, 0x8e, 0xc0, 0xba, 0xce, 0x03, 0xb8, 0x05, 0x00, 0xef, 0xe8, 0x01, 0x00, 0xc3,
    0xba, 0xda, 0x03, 0xec, 0xa8, 0x08, 0x74, 0xfb,
  ], "select the drawing page, write mode 0, wait for vertical retrace");
  const planes = [];
  while (codeByte(cursor) === 0x8b && codeByte(cursor + 1) === 0x36) {
    assert(codeWord(cursor + 2) === sourcePointer, `0000:${hex(cursor)}: reads another source offset`);
    cursor = expectBytes(cursor + 4, [0xbf], "mov di,screen offset");
    const screenOffset = codeWord(cursor);
    cursor = expectBytes(cursor + 2, [0x8b, 0x1e], "mov bx,[plane table]");
    assert(codeWord(cursor) === tablePointer, `0000:${hex(cursor)}: reads another plane table`);
    cursor = expectBytes(cursor + 2, [0xba, 0xc4, 0x03, 0xb8, 0x02], "sequencer map mask");
    const mapMask = codeByte(cursor);
    cursor = expectBytes(cursor + 1, [0xef, 0x8b], "out dx,ax; mov ax,[bx+plane]");
    let tableOffset = 0;
    if (codeByte(cursor) === 0x07) cursor += 1;
    else {
      expectBytes(cursor, [0x47], "[bx+disp8]");
      tableOffset = codeByte(cursor + 1);
      cursor += 2;
    }
    cursor = expectBytes(cursor, [0x8e, 0xd8, 0xb9], "mov ds,ax; mov cx,rows");
    const rows = codeWord(cursor);
    cursor = expectBytes(cursor + 2, [0x51, 0x56, 0x57, 0xb9], "push cx/si/di; mov cx,words");
    const bytes = codeWord(cursor) * 2;
    cursor = expectBytes(cursor + 2, [0xf3, 0xa5, 0x5f, 0x5e, 0x83, 0xc6], "rep movsw; pop; add si,imm8");
    const sourcePitch = codeByte(cursor);
    cursor = expectBytes(cursor + 1, [0x83, 0xc7], "add di,imm8");
    const screenPitch = codeByte(cursor);
    cursor = expectBytes(cursor + 1, [0x59, 0xe2, 0xed, 0xb8, 0xba, 0x1e, 0x8e, 0xd8], "loop; restore ds");
    planes.push({ screenOffset, mapMask, tableOffset, rows, bytes, sourcePitch, screenPitch });
  }
  expectBytes(cursor, [0xc3], "ret");
  assert(planes.length === 4, `0000:${hex(start)}: expected four plane copies`);
  const [first] = planes;
  for (const plane of planes) {
    for (const field of ["screenOffset", "rows", "bytes", "sourcePitch", "screenPitch"]) {
      assert(plane[field] === first[field], `0000:${hex(start)}: planes differ in ${field}`);
    }
  }
  assert(first.screenPitch === VGA_ROW_BYTES, `0000:${hex(start)}: not a 640-pixel VGA row`);
  return { pixelsPerByte, ...first, mapMasks: planes.map(({ mapMask }) => mapMask) };
}

/**
 * `ADCE` presents every composed substep: normally with DX = 8, and under `YD`
 * with `[cs:toggle] ^= 20h; DX = toggle * row bytes + 8`, i.e. the same window
 * a whole number of rows further down the buffer. `AD51` passes DX = 8 as is.
 */
function decodePresentCallers(substepStart, holdStart, present) {
  let cursor = expectBytes(substepStart, [0x81, 0x3e], "cmp word [mode],imm16");
  const modeWord = codeWord(cursor);
  const ydMode = codeWord(cursor + 2);
  cursor = expectBytes(cursor + 4, [0x74], "jz YD");
  const ydBranch = cursor + 1 + moduleBuffer.readInt8(cursor);
  cursor = expectBytes(cursor + 1, [0xb8], "mov ax,buffer plane table");
  const planeTable = codeWord(cursor);
  cursor = expectBytes(cursor + 2, [0xba], "mov dx,pixel offset");
  const pixelOffset = codeWord(cursor);
  assert(nearCallTarget(cursor + 2) === present, `0000:${hex(cursor + 2)}: expected the present call`);
  cursor = expectBytes(cursor + 8, [0x2e, 0xc7, 0x06], "mov word [cs:toggle],0");
  const toggleWord = codeWord(cursor);
  assert(codeWord(cursor + 2) === 0, `0000:${hex(cursor)}: a non-YD present must clear the toggle`);
  let at = expectBytes(ydBranch, [0x2e, 0x83, 0x36], "xor word [cs:toggle],imm8");
  assert(codeWord(at) === toggleWord, `0000:${hex(at)}: YD toggles another word`);
  const toggle = codeByte(at + 2);
  at = expectBytes(at + 3, [0x33, 0xd2, 0x2e, 0xa1], "xor dx,dx; mov ax,[cs:toggle]");
  assert(codeWord(at) === toggleWord, `0000:${hex(at)}: YD reads another toggle`);
  at = expectBytes(at + 2, [0xbb], "mov bx,multiplier");
  const multiplier = codeWord(at);
  at = expectBytes(at + 2, [0xf7, 0xe3, 0x8b, 0xd0, 0x83, 0xc2], "mul bx; mov dx,ax; add dx,imm8");
  const ydPixelOffset = codeByte(at);
  at = expectBytes(at + 1, [0xb8], "mov ax,buffer plane table");
  assert(codeWord(at) === planeTable, `0000:${hex(at)}: YD presents another buffer`);
  at = expectBytes(at + 2, [0x8b, 0xd2], "mov dx,dx");
  assert(nearCallTarget(at) === present, `0000:${hex(at)}: YD presents through another routine`);
  // AD51: compose the backdrop and three more draw calls, then
  // `mov ax,table; mov dx,offset; call present`.
  assert(nearCallTarget(holdStart) === 0xaec3, `0000:${hex(holdStart)}: the hold does not compose the backdrop`);
  const hold = expectBytes(holdStart + 12, [0xb8], "mov ax,buffer plane table");
  assert(codeWord(hold) === planeTable, `0000:${hex(hold)}: the hold presents another buffer`);
  expectBytes(hold + 2, [0xba], "mov dx,pixel offset");
  const holdPixelOffset = codeWord(hold + 3);
  assert(nearCallTarget(hold + 5) === present, `0000:${hex(hold + 5)}: expected the present call`);
  return {
    modeWord,
    ydMode,
    planeTable,
    pixelOffset,
    holdPixelOffset,
    toggleWord,
    toggle,
    ydPixelOffset: toggle * multiplier + ydPixelOffset,
  };
}

/** `mov si,descriptor; call D050` per rectangle, then `call 9E28` for the gauges. */
function decodeWindowFrame(start) {
  const rects = [];
  let fill;
  let cursor = start;
  while (codeByte(cursor) === 0xbe) {
    const descriptor = codeWord(cursor + 1);
    const target = nearCallTarget(cursor + 3);
    assert(fill === undefined || fill === target, `0000:${hex(cursor)}: frame uses another fill`);
    fill = target;
    const [x, y, width, height, color] = [0, 1, 2, 3, 4].map((index) => readWord(descriptor + index * 2));
    rects.push({ descriptor: `DS:${hex(descriptor)}`, x, y, width, height, color: color & 0xff });
    cursor += 6;
  }
  const gauges = nearCallTarget(cursor);
  expectBytes(cursor + 3, [0xc3], "ret");
  return { rects, fill, gauges };
}

/**
 * `1000:0360` hands out four buffer planes from the segment in DS:F880 and four
 * background source planes from DS:0219, every plane `add ax,imm16`
 * paragraphs after the previous one.
 */
function decodePlaneAllocation(start) {
  const tables = [];
  let stride;
  let cursor = start;
  while (codeByte(cursor) === 0xa1) {
    const origin = codeWord(cursor + 1);
    const planes = [];
    cursor += 3;
    while (codeByte(cursor) === 0xa3 || codeByte(cursor) === 0x05) {
      if (codeByte(cursor) === 0xa3) planes.push(codeWord(cursor + 1));
      else {
        assert(stride === undefined || stride === codeWord(cursor + 1), `${hex(cursor, 5)}: plane stride differs`);
        stride = codeWord(cursor + 1);
      }
      cursor += 3;
    }
    assert(planes.length === 4, `${hex(cursor, 5)}: expected four plane segments`);
    tables.push({ origin, planes });
  }
  expectBytes(cursor, [0xc3], "ret");
  assert(tables.length === 2, `${hex(start, 5)}: expected the buffer and source tables`);
  return { buffer: tables[0], source: tables[1], planeBytes: stride * 16 };
}

/** Code offsets whose word operand is one of `words`, over the whole code image. */
function codeReferences(words) {
  const references = [];
  for (let offset = 0; offset + 1 < DATA_LINEAR_BASE; offset += 1) {
    if (words.includes(codeWord(offset))) references.push(offset);
  }
  return references;
}

/** `mov word [direction],':J'`: the full-screen entry and the end of every post-hit stream. */
function decodeDirectionStop(offset) {
  expectBytes(offset, [0xc7, 0x06], "mov word [direction],imm16");
  assert(codeWord(offset + 2) === DIRECTION_WORD, `0000:${hex(offset)}: writes another word`);
  return codeWord(offset + 4);
}

const token = (value) => String.fromCharCode(value & 0xff, value >> 8);

function decodeBackdropCompositor() {
  const substep = decodeComposeSubstep(0xaec3);
  const composer = decodeComposer(substep.composer);
  const far = decodeFarLayerCopy(composer.farCopy);
  const update = decodePhaseUpdate(substep.phaseUpdate);
  assert(update.directionWord === DIRECTION_WORD, `AEEF reads DS:${hex(update.directionWord)}`);
  const right = update.branches.find((branch) => token(branch.token) === ":R");
  const left = update.branches.find((branch) => token(branch.token) === ":L");
  assert(right && left && update.branches.length === 2, "AEEF must branch on :R and :L only");
  assert(right.wrap.phaseBase === composer.farPhaseWord && left.wrap.phaseBase === composer.farPhaseWord,
    "the wrap routines index another phase table");
  const phaseWords = [composer.farPhaseWord, ...composer.linearLayers.map(({ phaseWord }) => phaseWord)];
  phaseWords.forEach((word, layer) => assert(word === composer.farPhaseWord + layer * 2,
    `layer ${layer} phase word CS:${hex(word)} is not bx-indexed from CS:${hex(composer.farPhaseWord)}`));
  assert(right.steps.length === phaseWords.length && left.steps.length === phaseWords.length,
    "every layer needs a step in both directions");

  const { rowBytes } = far;
  const layers = [{
    layer: 0,
    firstRow: 0,
    rows: far.rows,
    copy: "row-cyclic",
    seedBytes: composer.farSeed,
    phaseWord: `CS:${hex(composer.farPhaseWord)}`,
    rightStep: right.steps[0],
    leftStep: left.steps[0],
  }];
  let nextRow = far.rows;
  composer.linearLayers.forEach(({ base, phaseWord, bytes }, index) => {
    assert(base === nextRow * rowBytes, `layer ${index + 1} starts at byte ${hex(base)}, not row ${nextRow}`);
    assert(bytes % rowBytes === 0, `layer ${index + 1} copies a partial row`);
    layers.push({
      layer: index + 1,
      firstRow: nextRow,
      rows: bytes / rowBytes,
      copy: "linear",
      seedBytes: 0,
      phaseWord: `CS:${hex(phaseWord)}`,
      rightStep: right.steps[index + 1],
      leftStep: left.steps[index + 1],
    });
    nextRow += bytes / rowBytes;
  });

  // Only the composer and the two wrap routines ever touch the phase words:
  // nothing clears them at a battle entry, a counter-attack or a death.
  const phaseReferences = codeReferences(phaseWords);
  const WRAP_ROUTINE_BYTES = 0x15;
  const COMPOSER_BYTES = 0x4f;
  const owners = [
    ...update.branches.map(({ wrapAddress }) => [wrapAddress, wrapAddress + WRAP_ROUTINE_BYTES]),
    [substep.composer, substep.composer + COMPOSER_BYTES],
  ];
  assert(phaseReferences.length === 11 && phaseReferences.every((offset) =>
    owners.some(([from, to]) => offset >= from && offset < to)),
  `phase words are referenced outside the compositor: ${phaseReferences.map((offset) => hex(offset, 5)).join(", ")}`);

  const directionStops = [0x9859, 0xa22b].map((offset) => ({
    address: `0000:${hex(offset)}`,
    token: token(decodeDirectionStop(offset)),
  }));
  assert(directionStops.every(({ token: value }) => value === ":J"), "a direction stop does not write :J");
  const directionReferences = codeReferences([DIRECTION_WORD]).map((offset) => hex(offset));
  assert(JSON.stringify(directionReferences) === JSON.stringify(["985B", "A22D", "A906", "AB0C", "AEF6"]),
    `DS:${hex(DIRECTION_WORD)} referenced at ${directionReferences.join(", ")}`);

  return {
    substep: "0000:AEC3",
    composer: `0000:${hex(substep.composer)}`,
    phaseUpdate: `0000:${hex(substep.phaseUpdate)}`,
    bufferPlaneTable: substep.planes.map(({ destination }) => destination),
    sourcePlaneTable: substep.planes.map(({ source }) => source),
    rowBytes,
    composedRows: nextRow,
    layers,
    wrap: {
      right: { token: ":R", resetWhen: right.wrap.resetWhen, limit: right.wrap.limit, reset: right.wrap.reset },
      left: { token: ":L", resetWhen: left.wrap.resetWhen, limit: left.wrap.limit, reset: left.wrap.reset },
    },
    directionWord: `DS:${hex(DIRECTION_WORD)}`,
    directionStops,
    phaseWordReferences: phaseReferences.map((offset) => `0000:${hex(offset)}`),
  };
}

const stageTable = decodeStageTable();
const fallbackRecord = stageTable.entries[0].record;
const exempt = decodeExemptStages(0x961b);
assert(exempt.overrideEntry === 0x962e,
  `terrain override moved to 0000:${hex(exempt.overrideEntry)}`);
const terrain = decodeTerrainSwitch(0x964e);

const compositor = decodeBackdropCompositor();
const presentRoutine = decodePresent(0xf2cc);
const presentCallers = decodePresentCallers(0xadce, 0xad51, 0xf2cc);
const windowFrame = decodeWindowFrame(0x9b73);
const allocation = decodePlaneAllocation(0x10360);
const { rowBytes } = compositor;
assert(rowBytes * PIXELS_PER_BYTE === BACKDROP_WIDTH, `a buffer row is ${rowBytes} bytes`);
assert(presentRoutine.pixelsPerByte === PIXELS_PER_BYTE, "F2CC divides DX by another width");
assert(presentRoutine.sourcePitch === rowBytes, "F2CC steps the buffer by another row width");
assert(JSON.stringify(compositor.bufferPlaneTable) === JSON.stringify(allocation.buffer.planes),
  "AEC3 composes into planes other than the allocated battle buffer");
assert(JSON.stringify(compositor.sourcePlaneTable) === JSON.stringify(allocation.source.planes),
  "AEC3 reads planes other than the allocated background source");
assert(presentCallers.planeTable === allocation.buffer.planes[0]
  && JSON.stringify(allocation.buffer.planes)
    === JSON.stringify([0, 4, 8, 12].map((offset) => presentCallers.planeTable + offset)),
"F2CC presents another plane table");
assert(allocation.planeBytes % rowBytes === 0, "a buffer plane is not a whole number of rows");
const bufferRows = allocation.planeBytes / rowBytes;
assert(compositor.composedRows <= bufferRows, "the backdrop is composed past the buffer");
assert(presentCallers.holdPixelOffset === presentCallers.pixelOffset,
  "the hold redraw presents another part of the buffer");
const presentByte = presentCallers.pixelOffset / PIXELS_PER_BYTE;
const ydBytes = presentCallers.ydPixelOffset / PIXELS_PER_BYTE;
const ydRows = Math.floor(ydBytes / rowBytes);
assert(Number.isInteger(presentByte) && Number.isInteger(ydBytes)
  && ydBytes - ydRows * rowBytes === presentByte,
"YD must move the presented window by whole rows only");
const presentWindow = {
  bufferX: presentByte * PIXELS_PER_BYTE,
  bufferY: 0,
  width: presentRoutine.bytes * PIXELS_PER_BYTE,
  height: presentRoutine.rows,
  displacedBufferY: ydRows,
};
const bufferScreen = {
  x: (presentRoutine.screenOffset % VGA_ROW_BYTES) * PIXELS_PER_BYTE - presentWindow.bufferX,
  y: Math.floor(presentRoutine.screenOffset / VGA_ROW_BYTES) - presentWindow.bufferY,
};
assert(presentWindow.bufferX + presentWindow.width <= BACKDROP_WIDTH
  && presentWindow.displacedBufferY + presentWindow.height <= bufferRows,
"the presented window leaves the buffer");
const frameBox = {
  x: Math.min(...windowFrame.rects.map(({ x }) => x)),
  y: Math.min(...windowFrame.rects.map(({ y }) => y)),
  right: Math.max(...windowFrame.rects.map(({ x, width }) => x + width)),
  bottom: Math.max(...windowFrame.rects.map(({ y, height }) => y + height)),
};
// The frame's outer border sits on the buffer's never-presented columns.
assert(frameBox.x === bufferScreen.x && frameBox.right === bufferScreen.x + BACKDROP_WIDTH,
  "the window frame no longer spans the battle buffer width");

const referencedRecords = [...new Set([
  ...stageTable.entries.map(({ record }) => record),
  ...terrain.arms.flatMap(({ record, stageOverrides }) =>
    [record, ...stageOverrides.map((entry) => entry.record)]),
])].sort((left, right) => left - right);

await mkdir(publicRoot, { recursive: true });
const renderedRecords = [];
for (const record of referencedRecords) {
  const directory = path.join(decodedC, String(record).padStart(4, "0"));
  const planes = await Promise.all(Array.from({ length: 4 }, async (_, plane) => {
    const buffer = await readFile(path.join(directory, `${String(plane).padStart(2, "0")}.raw`));
    return parseBitmapBundle(buffer, `C/${record} plane ${plane}`);
  }));
  const source = planes[0].images[0];
  assert(source.width === BACKDROP_WIDTH, `C/${record}: unexpected width ${source.width}`);
  assert(source.height >= BACKDROP_MIN_ROWS && source.height <= BACKDROP_MAX_ROWS,
    `C/${record}: ${source.height} rows`);
  assert(planes.every((plane) => plane.images[0].height === source.height),
    `C/${record}: planes disagree on the row count`);
  // `F1AC` copies every row the image header declares, so C/17 and C/27 put a
  // 149th row into background source row 148. Only buffer rows 147..150 can
  // show it, and those reach the screen solely under `YD`; the published pack
  // keeps 148 rows and the Web compositor paints that row palette 0 like the
  // stale rows around it (REMAKE-169).
  const clamped = planes.map((plane) => ({
    ...plane,
    images: [{
      ...plane.images[0],
      height: BACKDROP_MIN_ROWS,
      pixels: plane.images[0].pixels.subarray(0, BACKDROP_MIN_ROWS * plane.images[0].rowBytes),
    }],
  }));
  const image = composePlanarImage(clamped, 0, null, PALETTES.gameplay.colors);
  const png = encodeRgbaPng(image.width, image.height, image.pixels);
  await writeFile(path.join(publicRoot, `${String(record).padStart(2, "0")}.png`), png);
  renderedRecords.push({
    record,
    sourceRows: source.height,
    publishedRows: BACKDROP_MIN_ROWS,
    sha256: sha256(png),
  });
}

// C/0019 and C/0029 are the same rendered backdrop. Keep both native record
// numbers in the evidence table, but publish one URL and resolve the alias in
// the runtime asset function.
if (referencedRecords.includes(19) && referencedRecords.includes(29)) {
  const record19 = path.join(publicRoot, "19.png");
  const record29 = path.join(publicRoot, "29.png");
  await assertIdenticalImage(record19, record29, "full-combat background C/0019-C/0029");
  await removeDuplicateImage(record29);
}

const literal = (values) => `[${values.join(", ")}]`;
const stageTableSource = stageTable.entries
  .map(({ stage, record }) => `  { nativeStage: ${stage}, record: ${record} },`)
  .join("\n");
const terrainSource = terrain.arms
  .map(({ slot, record, stageOverrides }) => {
    const overrides = stageOverrides
      .map(({ stage, record: substitute }) => `{ nativeStage: ${stage}, record: ${substitute} }`)
      .join(", ");
    return `  { terrainSlot: ${slot}, record: ${record}, stageOverrides: [${overrides}] },`;
  })
  .join("\n");
const objectLiteral = (value) => `{ ${Object.entries(value)
  .map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`)
  .join(", ")} }`;
const layerSource = compositor.layers.map((layer) => `  ${objectLiteral(layer)},`).join("\n");
const frameSource = windowFrame.rects.map((rect) => `  ${objectLiteral(rect)},`).join("\n");

const source = `// GENERATED FILE — run \`pnpm content:backgrounds\` after changing the
// generator or its native sources. Do not edit by hand.
//
// Module 29 picks the full-screen battle backdrop once per ordinary attack:
// 0000:95F8 reads the DS:78DC stage table, then — unless the stage is exempt —
// 0000:962E replaces the record from the logical terrain slot under the
// defender cell DS:${hex(DEFENDER_CELL)}. Every substep, ${compositor.substep} composes that record
// into the battle buffer in five layers and ${compositor.phaseUpdate} advances their phase words;
// 0000:F2CC presents part of the buffer inside the frame drawn at 0000:9B73.

export interface FullCombatBackgroundStageEntry {
  readonly nativeStage: number;
  readonly record: number;
}

export interface FullCombatBackgroundTerrainEntry {
  readonly terrainSlot: number;
  readonly record: number;
  /** Stages whose own record replaces the shared one for this slot. */
  readonly stageOverrides: readonly FullCombatBackgroundStageEntry[];
}

export const FULL_COMBAT_BACKGROUND_STAGE_TABLE: readonly FullCombatBackgroundStageEntry[] = [
${stageTableSource}
];

/** 95F8 restarts its cursor at the table head, so unlisted stages land here. */
export const FULL_COMBAT_BACKGROUND_FALLBACK_RECORD = ${fallbackRecord};

/** Stages that keep their table record no matter what the defender stands on. */
export const FULL_COMBAT_BACKGROUND_TERRAIN_EXEMPT_STAGES: readonly number[] = ${
  literal(exempt.stages)
};

export const FULL_COMBAT_BACKGROUND_TERRAIN_TABLE: readonly FullCombatBackgroundTerrainEntry[] = [
${terrainSource}
];

export const FULL_COMBAT_BACKGROUND_RECORDS: readonly number[] = ${literal(referencedRecords)};

export interface FullCombatBackdropLayer {
  readonly layer: number;
  readonly firstRow: number;
  readonly rows: number;
  /**
   * \`row-cyclic\` rows wrap within themselves; a \`linear\` layer is one byte
   * run, so the part of a row past its phase continues into the next source row.
   */
  readonly copy: "row-cyclic" | "linear";
  /** Source bytes added before the phase; the row-cyclic start is taken modulo one row. */
  readonly seedBytes: number;
  /** Code-segment word holding the layer's phase, in source bytes. */
  readonly phaseWord: string;
  /** Bytes added to the phase for every composed substep under \`:R\` / \`:L\`. */
  readonly rightStep: number;
  readonly leftStep: number;
}

/** ${compositor.composer} composes buffer rows 0..${compositor.composedRows - 1} from these five layers. */
export const FULL_COMBAT_BACKDROP_LAYERS: readonly FullCombatBackdropLayer[] = [
${layerSource}
];

/**
 * The wrap routines write the reset value outright once a phase crosses the
 * limit, so a step that overshoots loses its remainder instead of wrapping.
 */
export const FULL_COMBAT_BACKDROP_WRAP = {
  rowBytes: ${rowBytes},
  right: ${objectLiteral({ resetWhen: compositor.wrap.right.resetWhen, limit: compositor.wrap.right.limit, reset: compositor.wrap.right.reset })},
  left: ${objectLiteral({ resetWhen: compositor.wrap.left.resetWhen, limit: compositor.wrap.left.limit, reset: compositor.wrap.left.reset })},
} as const;

/** The planar battle buffer; its x = 0 column sits at this screen position. */
export const FULL_COMBAT_BATTLE_BUFFER = ${objectLiteral({
    width: BACKDROP_WIDTH,
    rows: bufferRows,
    composedRows: compositor.composedRows,
    screenX: bufferScreen.x,
    screenY: bufferScreen.y,
  })} as const;

/**
 * The only part of the buffer 0000:F2CC copies to the screen; under \`YD\`
 * every other present shows it \`displacedBufferY\` rows further down.
 */
export const FULL_COMBAT_PRESENT_WINDOW = ${objectLiteral(presentWindow)} as const;

export interface FullCombatWindowFrameRect {
  readonly descriptor: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Gameplay palette index. */
  readonly color: number;
}

/** 0000:9B73 fills these screen rectangles in order before 0000:9E28 draws the gauges. */
export const FULL_COMBAT_WINDOW_FRAME: readonly FullCombatWindowFrameRect[] = [
${frameSource}
];

/** The screen box the frame rectangles span. */
export const FULL_COMBAT_WINDOW_BOX = ${objectLiteral({
    x: frameBox.x,
    y: frameBox.y,
    width: frameBox.right - frameBox.x,
    height: frameBox.bottom - frameBox.y,
  })} as const;

export const FULL_COMBAT_BACKGROUND_EVIDENCE = ${JSON.stringify({
    module: "module29 (0029-unpacked.bin)",
    moduleSha256: sha256(moduleBuffer),
    stageTable: `DS:${hex(STAGE_TABLE)}`,
    stageTableTerminator: stageTable.terminatorAddress,
    selectedRecord: `DS:${hex(SELECTED_RECORD)}`,
    currentStage: `DS:${hex(CURRENT_STAGE)}`,
    defenderCell: `DS:${hex(DEFENDER_CELL)}`,
    graphicsContainer: "C.SWF",
    backdropWidth: BACKDROP_WIDTH,
    backdropRows: [BACKDROP_MIN_ROWS, BACKDROP_MAX_ROWS],
    palette: PALETTES.gameplay.evidence,
    // 966C/9676 both compare slot 8; only the first can run.
    unreachableSwitchArms: terrain.unreachable,
    compositor: {
      substep: compositor.substep,
      composer: compositor.composer,
      phaseUpdate: compositor.phaseUpdate,
      directionWord: compositor.directionWord,
      // 9859 stops the backdrop at every full-screen entry and A22B after every
      // post-hit stream; the interpreters write the stream's own :R/:L/:J.
      directionStops: compositor.directionStops,
      // The five phase words live in the code segment and only these operands
      // touch them, so they keep their values from one battle to the next
      // until GO.EXE decompresses module 29 again.
      phaseWordReferences: compositor.phaseWordReferences,
      bufferPlaneTable: compositor.bufferPlaneTable.map((word) => `DS:${hex(word)}`),
      sourcePlaneTable: compositor.sourcePlaneTable.map((word) => `DS:${hex(word)}`),
      planeAllocator: "1000:0360",
      bufferPlaneOrigin: `DS:${hex(allocation.buffer.origin)}`,
      sourcePlaneOrigin: `DS:${hex(allocation.source.origin)}`,
      planeBytes: allocation.planeBytes,
    },
    present: {
      routine: "0000:F2CC",
      substepCaller: "0000:ADCE",
      holdCaller: "0000:AD51",
      pixelOffset: presentCallers.pixelOffset,
      ydModeWord: `DS:${hex(presentCallers.modeWord)}`,
      ydMode: token(presentCallers.ydMode),
      ydToggleWord: `CS:${hex(presentCallers.toggleWord)}`,
      ydToggle: presentCallers.toggle,
      ydPixelOffset: presentCallers.ydPixelOffset,
      screenOffset: `A000:${hex(presentRoutine.screenOffset)}`,
      mapMasks: presentRoutine.mapMasks,
    },
    windowFrame: {
      routine: "0000:9B73",
      fill: `0000:${hex(windowFrame.fill)}`,
      gauges: `0000:${hex(windowFrame.gauges)}`,
      box: frameBox,
    },
    // The system menu's 讀取記錄 far-calls the WAR loader and stays in module 29.
    inBattleLoad: "0000:B9A4 -> 1000:0DD0",
    renderedRecords,
    verifiedCodeSignatures,
  }, null, 2)} as const;
`;

await writeFile(outputPath, source);
console.log(
  `wrote ${referencedRecords.length} full-screen battle backdrops, ` +
  `${stageTable.entries.length} stage-table entries and ` +
  `${terrain.arms.length} terrain-slot overrides`,
);
