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
/** Native battle window source; the blitter consumes a fixed 448x148 region. */
const BACKDROP_WIDTH = 448;
const BACKDROP_HEIGHT = 148;

// Every byte the decoders below step through, pinned so an unexpected runtime
// image aborts instead of producing a plausible-looking wrong table.
const CODE_SIGNATURES = [
  ["0000:90D8", "select-background-before-attack-dispatch",
    "ff360460c70604604e00c706ed5dffff9a98009d13a1a9018ec0b801008b1ec177268807"],
  ["0000:95F8", "select-full-screen-battle-background",
    "8b16772ebb00008b87dc783dffff74093bc2740883c304ebee"],
  ["0000:962E", "override-background-by-defender-terrain",
    "8b3ec177a1a7018ec033db268a1d03db8b9f7d2e06a12600"],
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

const stageTable = decodeStageTable();
const fallbackRecord = stageTable.entries[0].record;
const exempt = decodeExemptStages(0x961b);
assert(exempt.overrideEntry === 0x962e,
  `terrain override moved to 0000:${hex(exempt.overrideEntry)}`);
const terrain = decodeTerrainSwitch(0x964e);

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
  // Records 17 and 27 carry one trailing row past the window the native
  // blitter copies. Clamp instead of scaling so the extra row cannot squeeze
  // the 148-row parallax split at y=110.
  assert(source.height >= BACKDROP_HEIGHT, `C/${record}: only ${source.height} rows`);
  const clamped = planes.map((plane) => ({
    ...plane,
    images: [{
      ...plane.images[0],
      height: BACKDROP_HEIGHT,
      pixels: plane.images[0].pixels.subarray(0, BACKDROP_HEIGHT * plane.images[0].rowBytes),
    }],
  }));
  const image = composePlanarImage(clamped, 0, null, PALETTES.gameplay.colors);
  const png = encodeRgbaPng(image.width, image.height, image.pixels);
  await writeFile(path.join(publicRoot, `${String(record).padStart(2, "0")}.png`), png);
  renderedRecords.push({
    record,
    sourceRows: source.height,
    clampedRows: BACKDROP_HEIGHT,
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

const source = `// GENERATED FILE — run \`pnpm content:backgrounds\` after changing the
// generator or its native sources. Do not edit by hand.
//
// Module 29 picks the full-screen battle backdrop once per ordinary attack:
// 0000:95F8 reads the DS:78DC stage table, then — unless the stage is exempt —
// 0000:962E replaces the record from the logical terrain slot under the
// defender cell DS:${hex(DEFENDER_CELL)}.

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

export const FULL_COMBAT_BACKGROUND_EVIDENCE = ${JSON.stringify({
    module: "module29 (0029-unpacked.bin)",
    moduleSha256: sha256(moduleBuffer),
    stageTable: `DS:${hex(STAGE_TABLE)}`,
    stageTableTerminator: stageTable.terminatorAddress,
    selectedRecord: `DS:${hex(SELECTED_RECORD)}`,
    currentStage: `DS:${hex(CURRENT_STAGE)}`,
    defenderCell: `DS:${hex(DEFENDER_CELL)}`,
    graphicsContainer: "C.SWF",
    backdropSize: [BACKDROP_WIDTH, BACKDROP_HEIGHT],
    palette: PALETTES.gameplay.evidence,
    // 966C/9676 both compare slot 8; only the first can run.
    unreachableSwitchArms: terrain.unreachable,
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
