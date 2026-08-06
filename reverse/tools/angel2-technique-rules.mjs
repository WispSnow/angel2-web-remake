#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const CLASS_MENU_TABLE = 0x41ce;
const SPECIAL_DISPATCH_TABLE = 0x52a2;
const SENTINEL = 0xffff;

const CODE_SIGNATURES = [
  { address: "0000:719B", offset: 0x719b, hex: "833e4a3d537401c3e89408a1161fa3bf77e8beff" },
  { address: "0000:722B", offset: 0x722b, hex: "e440a801740f8b1ec177e8f2dda19d313d30457404e82100" },
  { address: "0000:7264", offset: 0x7264, hex: "a1430d3d3341740b3d304974263d31497441c3ba1400" },
  { address: "0000:75E4", offset: 0x75e4, hex: "e8cdff83fa597401c3a1161fa3bf77a14a3d2ea32b773d31" },
  { address: "0000:75FA", offset: 0x75fa, hex: "3d31437503e9ae003d32437503e9a6003d33437503e99e003d34437503e99600" },
  { address: "0000:76B0", offset: 0x76b0, hex: "a1161fa3c177a1a052ffd0e841fcebc0" },
  { address: "0000:CB0B", offset: 0xcb0b, hex: "a1c177b91400c706181f03009a0200db15ba0200e8e8" },
  { address: "0000:CB7F", offset: 0xcb7f, hex: "bb1200e842043d6c007203b86c008bc8a1c177c706181f05" },
  { address: "0000:CCF1", offset: 0xccf1, hex: "a1c177b914009a000074163c4e740cba0200e804038b" },
  { address: "0000:CD6D", offset: 0xcd6d, hex: "a1c177b91400c706181f0400ba00009a0c001b11b90500c3" },
  { address: "0000:CD85", offset: 0xcd85, hex: "a1c177b91400c706181f0400ba01009a0c001b11b90500c3" },
  { address: "0000:CD9D", offset: 0xcd9d, hex: "a1c177b91400c706181f0400ba02009a0c001b11b90500c3" },
  { address: "0000:CDB5", offset: 0xcdb5, hex: "a1c177c706181f0300b901009a0400da15c3a1c177c7" },
  { address: "0000:CDD9", offset: 0xcdd9, hex: "a1c177c706181f0400b903009a0400da15c3" },
  { address: "0000:CFC7", offset: 0xcfc7, hex: "538b1ec177900ee8878033d2a1c3315bf7e3bb6400f7" },
  { address: "0000:628E", offset: 0x628e, hex: "c606485d4e890e3052a33452a33652a17afaa32652c7067afa4e002ec7062784" },
  { address: "0000:63CF", offset: 0x63cf, hex: "e8bb9ee8ed32e8f6eb9a00004d18c6067cfa4ec6067dfa4e2ec7" },
  { address: "1000:11BC", offset: 0x111bc, hex: "8916e00c9a8e620000e888019afc7b0000e8ae00a180f8be" },
  { address: "1000:127E", offset: 0x1127e, hex: "a1e00c3d0000740a3d0100740f3d02007414c706e20c5201e81500c3c706e20c7001e84100c3c706e20c7001e86d00" },
  { address: "1000:1350", offset: 0x11350, hex: "33d2a19253bb3200f7e3030690538bd8a1a9018ec0b9070051b90a008bfbb80100f3aa83c33259e2efc3" },
  { address: "1000:591C", offset: 0x1591c, hex: "a180f89af6f70000e80100cbc7062660" },
  { address: "1000:5928", offset: 0x15928, hex: "c70626600000b9c409518b3e2660a124008ec0268a053c00" },
  { address: "1000:5CA0", offset: 0x15ca0, hex: "8b1e36529a58500000a19f31a3d86033d2a1c3318b1e" },
  { address: "1000:6771", offset: 0x16771, hex: "c606c8684e9a8e620000a180f88ec0bf0000b90a00bb" },
  { address: "1000:69FA", offset: 0x169fa, hex: "8bdf9a58500000f706ab3100807401c3813e9d313150" },
  { address: "1000:6EE0", offset: 0x16ee0, hex: "a30e6cc7060a6c00009a00004d18a180f88ec0bf0000" },
  { address: "1000:6EF3", offset: 0x16ef3, hex: "bf0000b91400bb04009a8efd0000a180f8be05029a0a003719" },
  { address: "1000:6F11", offset: 0x16f11, hex: "bf0000b92400bb03009a8efd0000" },
  { address: "1000:7166", offset: 0x17166, hex: "a3b46cc706b06c0000e80f00e851009acf6300008b0e" },
  { address: "1000:736D", offset: 0x1736d, hex: "8b1e34529a58500000f706ab3100807401c3a19f312b" },
  { address: "1000:73B6", offset: 0x173b6, hex: "a3c86ce80400e83b00cb" },
  { address: "1000:73C0", offset: 0x173c0, hex: "a1c86c3d0000740b3d010074133d0200741bc3c706c46c0a00c706c66c0a00c3c706c46c0f00c706c66c0f00c3c706c46c1400c706c66c1400c3" },
  { address: "1000:73FA", offset: 0x173fa, hex: "b8ba1e8ed88a16f61eb9c40933ff515752a1a9018ec0268a053c007421a2d06ca124008ec0268a053c0074123ac2750e893e34528bdf9a58500000e807005a5f5947e2cac3" },
  { address: "1000:743F", offset: 0x1743f, hex: "8b16c46ce81a000306c66ca3d16ca19f312b06d16c7303b800008b36b9318904c3" },
  { address: "1000:7460", offset: 0x17460, hex: "2e8a26cb00e44002c4b4003bc272072e2816cb00ebea2ea2cb" },
  { address: "1000:7C92", offset: 0x17c92, hex: "8bd8a1a7018ec0a1792e268807402688470140268847" },
  { address: "1000:7CB4", offset: 0x17cb4, hex: "8bd8a1a7018ec0a17b2e268807402688470140268847" },
  { address: "1000:8D94", offset: 0x18d94, hex: "81fb314c7503e9a60081fb324c7503e99d0081fb334c" },
];

const EXPECTED_CLASS_MENUS = {
  "4A": [["1F", "1H"], ["1F", "1H"], ["1F", "1H"]],
  "5A": [["1K", "2K"], ["1K", "2K"], ["1K", "2K"]],
  "0D": [["1H", "1I"], ["1H", "1I"], ["1H", "1I"]],
  "1D": [["1F", "1I"], ["1F", "1I"], ["1F", "1I"]],
  "2D": [["1F", "1L", "1C"], ["1F", "1L", "1C"], ["1F", "1L", "1C"]],
  "0J": [["1H", "1I", "AD"], ["1H", "2I", "AD"], ["2H", "3I", "AD", "OJ"]],
  "1J": [["1H", "1I", "AA"], ["2H", "1I", "AA"], ["3H", "2I", "AA", "FM"]],
  "0K": [["1F", "1I", "SD"], ["1F", "1L", "1I", "SD"], ["2F", "1L", "1I", "SD", "TR"]],
  "1K": [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
  "0L": [["2F"], ["3F"], ["4F"]],
  "1L": [["2L"], ["3L"], ["4L"]],
  "2L": [["2C"], ["3C"], ["4C"]],
  "3E": [["1D"], ["2D"], ["3D"]],
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function dataOffset(dsOffset, bytes, buffer) {
  const offset = DATA_LINEAR_BASE + dsOffset;
  if (offset < 0 || offset + bytes > buffer.length) {
    throw new Error(`DS:${hex(dsOffset)} is outside the runtime image`);
  }
  return offset;
}

function decodeCode(word) {
  return String.fromCharCode(word & 0xff, (word >>> 8) & 0xff);
}

function readBig5Dollar(buffer, dsOffset) {
  const start = dataOffset(dsOffset, 1, buffer);
  let end = start;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  if (end === buffer.length) throw new Error(`DS:${hex(dsOffset)} Big5 text has no '$' terminator`);
  const raw = buffer.subarray(start, end);
  return {
    address: `${hex(DATA_SEGMENT)}:${hex(dsOffset)}`,
    text: new TextDecoder("big5", { fatal: true }).decode(raw),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) throw new Error(`${signature.address}: technique code signature mismatch`);
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function descriptorIndex(descriptors) {
  const byCode = new Map();
  for (const record of descriptors.records ?? []) {
    for (const code of record.codeVariants ?? []) {
      const matches = byCode.get(code) ?? [];
      matches.push({ record: record.record, name: record.normalizedName });
      byCode.set(code, matches);
    }
  }
  return byCode;
}

function parseMenu(buffer, menuOffset) {
  const entries = [];
  let cursor = menuOffset;
  for (let index = 0; index < 16; index += 1, cursor += 4) {
    const fileOffset = dataOffset(cursor, 4, buffer);
    const labelOffset = buffer.readUInt16LE(fileOffset);
    const actionWord = buffer.readUInt16LE(fileOffset + 2);
    if (labelOffset === SENTINEL) {
      return {
        address: `${hex(DATA_SEGMENT)}:${hex(menuOffset)}`,
        entries,
        terminatorActionCode: decodeCode(actionWord),
      };
    }
    entries.push({
      label: readBig5Dollar(buffer, labelOffset),
      actionCode: decodeCode(actionWord),
      actionWord,
    });
  }
  throw new Error(`menu DS:${hex(menuOffset)} has no sentinel`);
}

function parseClassMenus(buffer, descriptorsByCode) {
  const classes = [];
  let cursor = CLASS_MENU_TABLE;
  for (let index = 0; index < 32; index += 1, cursor += 4) {
    const fileOffset = dataOffset(cursor, 4, buffer);
    const classWord = buffer.readUInt16LE(fileOffset);
    if (classWord === SENTINEL) break;
    const classCode = decodeCode(classWord);
    const pointerTable = buffer.readUInt16LE(fileOffset + 2);
    const tierMenuOffsets = Array.from({ length: 3 }, (_, tier) =>
      buffer.readUInt16LE(dataOffset(pointerTable + tier * 2, 2, buffer)));
    const tiers = tierMenuOffsets.map((menuOffset, tier) => ({
      tier: tier + 1,
      ...parseMenu(buffer, menuOffset),
    }));
    const expected = EXPECTED_CLASS_MENUS[classCode];
    if (expected === undefined || !tiers.every((tier, tierIndex) =>
      tier.entries.map((entry) => entry.actionCode).join(",") === expected[tierIndex].join(","))) {
      throw new Error(`${classCode}: native technique menu differs from the recovered expectation`);
    }
    classes.push({
      classCode,
      classWord,
      descriptorMatches: descriptorsByCode.get(classCode) ?? [],
      tierPointerTable: `${hex(DATA_SEGMENT)}:${hex(pointerTable)}`,
      tiers,
    });
  }
  if (classes.length !== 13) throw new Error(`expected 13 technique-menu classes, got ${classes.length}`);
  return classes;
}

function parseDispatchTable(buffer) {
  const entries = [];
  let cursor = SPECIAL_DISPATCH_TABLE;
  for (let index = 0; index < 64; index += 1, cursor += 6) {
    const fileOffset = dataOffset(cursor, 6, buffer);
    const actionWord = buffer.readUInt16LE(fileOffset);
    if (actionWord === SENTINEL) break;
    entries.push({
      index,
      actionCode: decodeCode(actionWord),
      actionWord,
      handler: `0000:${hex(buffer.readUInt16LE(fileOffset + 2))}`,
      selectionRadius: buffer.readUInt16LE(fileOffset + 4),
    });
  }
  if (entries.length !== 36) throw new Error(`expected 36 technique dispatch entries, got ${entries.length}`);
  return entries;
}

function directNearCallers(buffer, target) {
  const callers = [];
  for (let offset = 0; offset + 2 < Math.min(buffer.length, DATA_LINEAR_BASE); offset += 1) {
    if (buffer[offset] !== 0xe8) continue;
    const displacement = buffer.readInt16LE(offset + 1);
    const segmentBase = offset & ~0xffff;
    const resolved = segmentBase + ((offset + 3 + displacement) & 0xffff);
    if (resolved === target) callers.push(offset);
  }
  return callers;
}

function nativeTechniqueRules() {
  return {
    costModel: {
      resourceCost: "no MP or consumable-cost field was found in the player technique commit chain",
      successfulCommit: "sets bit 7 (0x80) in the acting unit's map-cell byte",
      cancellation: "restores the pre-action cell/position and does not set the action-spent bit",
      seal: "SN/禁咒 writes 8003h to state +16h; its high bit blocks entry to 技術",
    },
    targetGroups: {
      enemyOnly: ["1L", "2L", "3L", "4L", "1F", "2F", "3F", "4F", "1D", "2D", "3D", "SD", "SA", "LA", "IP", "SN"],
      allyOnly: ["1I", "2I", "3I", "1H", "2H", "3H", "AD", "AA", "FM", "TR"],
      unrestrictedOrSpecial: ["1C", "2C", "3C", "4C", "OJ", "1K", "2K"],
      validator: "1000:8D94",
    },
    families: {
      L: {
        visibleName: "落雷",
        shape: "diamond/Manhattan area around the selected cell",
        tiers: [
          { code: "1L", selectionRadius: 4, effectRadius: 3, damageByRangeValue: { 1: 20, 2: 35, 3: 50 } },
          { code: "2L", selectionRadius: 5, effectRadius: 4, damageByRangeValue: { 1: 15, 2: 30, 3: 45, 4: 60 } },
          { code: "3L", selectionRadius: 6, effectRadius: 4, damageByRangeValue: { 1: 45, 2: 60, 3: 75, 4: 90 } },
          { code: "4L", selectionRadius: 7, effectRadius: 5, damageByRangeValue: { 1: 30, 2: 50, 3: 70, 4: 90, 5: 110 } },
        ],
        centerRule: "the origin has the highest range-map value, so damage is strongest at the center",
        defenseMagic: "state +0C bit15 prevents damage; every affected enemy then has +0C cleared, making 防魔 a one-cast shield",
        experience: "kill reward only; the apparent 6CB0h supplemental accumulator is initialized to zero and has no writer",
      },
      F: {
        visibleName: "炎暴",
        shape: "single selected enemy",
        tiers: [
          { code: "1F", percentMaxLife: 18, damageCap: 108, experienceBase: 8, experienceRandom: [0, 1] },
          { code: "2F", percentMaxLife: 26, damageCap: 156, experienceBase: 10, experienceRandom: [0, 1] },
          { code: "3F", percentMaxLife: 32, damageCap: 192, experienceBase: 12, experienceRandom: [0, 2] },
          { code: "4F", percentMaxLife: 44, damageCap: 270, experienceBase: 15, experienceRandom: [0, 2] },
        ],
        formula: "damage = min(currentLife, damageCap, floor(maxLife * percentMaxLife / 100))",
        defenseMagic: "the damage loop does not test +0C, but the post-effect path clears +0C on the target",
        experience: "kill reward + tier base + tier random",
      },
      C: {
        visibleName: "冰雪",
        shape: "area displacement; no life damage",
        centerMode: "actor position",
        playerRouting: {
          actionCodes: ["1C", "2C", "3C", "4C"],
          branch: "0000:75FA..7620 bypasses the generic target-cell selection path",
          centerWrite: "0000:76B0 copies the acting cell DS:1F16 to effect center DS:77C1 before calling the tier handler",
          dispatchRadiusBoundary: "the raw 2/3/3/4 third words remain in DS:52A2, but this player route does not consume them as selectable distances",
        },
        tiers: [
          { code: "1C", dispatchSelectionWord: 2, effectRadius: 3, experienceBase: 8, experienceRandom: [0, 1] },
          { code: "2C", dispatchSelectionWord: 3, effectRadius: 4, experienceBase: 10, experienceRandom: [0, 1] },
          { code: "3C", dispatchSelectionWord: 3, effectRadius: 5, experienceBase: 12, experienceRandom: [0, 2] },
          { code: "4C", dispatchSelectionWord: 4, effectRadius: 6, experienceBase: 15, experienceRandom: [0, 2] },
        ],
        displacement: "for each affected enemy, try destination offsets +50, -50, -1, +1 in that order; accept only an empty passable cell with a lower range-map value; zero is allowed, so an outer-ring value 1 target may move outside the effect",
        immunity: "defense-magic high bit blocks the effect; 1P/2P/3P boss parts are immune",
        shieldConsumption: "after resolving the area, +0C is cleared for affected enemies",
        experience: "zero if no unit is successfully affected; otherwise tier base + tier random",
      },
      H: {
        visibleName: "治療",
        shape: "single ally",
        tiers: [
          { code: "1H", maxLifePercent: 24, experienceBase: 10, experienceRandom: [0, 1] },
          { code: "2H", maxLifePercent: 36, experienceBase: 12, experienceRandom: [0, 3] },
          { code: "3H", maxLifePercent: 48, experienceBase: 15, experienceRandom: [0, 2] },
        ],
        healFormula: "actualHeal = min(maxLife - currentLife, floor(maxLife * maxLifePercent / 100))",
        experienceFormula: "q = floor(actualHeal * 10 / maxLife); award = random + (q == 0 ? 0 : q + experienceBase); therefore a full-life or sufficiently small heal still receives only the wrapper random term",
      },
      I: {
        visibleName: "回復",
        shape: "same-side area healing",
        tiers: [
          { code: "1I", selectionRadius: 4, effectRadius: 3, healByRangeValue: { 1: 30, 2: 45, 3: 60 }, experienceBase: 8 },
          { code: "2I", selectionRadius: 5, effectRadius: 3, healByRangeValue: { 1: 50, 2: 70, 3: 90 }, experienceBase: 10 },
          { code: "3I", selectionRadius: 6, effectRadius: 4, healByRangeValue: { 1: 35, 2: 60, 3: 85, 4: 110 }, experienceBase: 12 },
        ],
        healFormula: "each ally is capped at maxLife; totalActualHeal sums all real healing",
        experienceFormula: "q = floor(totalActualHeal / 50); if q == 0, return 0; else min(q, 8) + experienceBase + random(0..1)",
      },
      D: {
        visibleNames: { "1D": "龍 踏", "2D": "男 踏", "3D": "女 踏" },
        selectionRadius: 5,
        tiers: [
          { code: "1D", variant: 0, damageBase: 10, damage: "10..19" },
          { code: "2D", variant: 1, damageBase: 15, damage: "15..29" },
          { code: "3D", variant: 2, damageBase: 20, damage: "20..39" },
        ],
        formula: "damage = damageBase + pitRandomBelow(damageBase), independently for every affected unit; current life is reduced with saturation at zero",
        setupPayload20: "the handlers pass CX=20 into the common selected-area preparation record, but the runtime damage consumer does not read it as damage",
        baseArea: {
          origin: "selected target cell",
          rangeMapSeed: 4,
          propagationMode: "ASCII 0 (uniform cost 1, occupancy ignored, terrain movement-rule 99 blocks)",
          result: "origin plus cells reachable in at most three orthogonal steps; propagated values are 4,3,2,1",
        },
        viewportUnion: "after the base area is built, every cell in the current clamped 10x7 battle viewport is overwritten with range-map value 1; cells already marked outside the viewport are not cleared",
        receiverFilter: "scan all 2500 cells in ascending order; require nonzero range-map value, occupied side-map cell, and side equal to the selected target's side",
        playerTargeting: "all three player actions require an enemy target, so normal player use damages only enemy-side units in the union area",
        defenseMagic: "not tested or cleared; attack, defense and terrain-defense stats are not used",
        death: "the common post-effect chain invokes the zero-life unit remover",
        experience: "fixed 5 returned by the handler; kill experience returned by the common effect finalizer is ignored",
        randomCaveat: "the rejection loop guarantees the integer domain 0..damageBase-1, but exact statistical uniformity depends on PIT timing and the shared state byte",
      },
      K: {
        visibleNames: { "1K": "鐵板", "2K": "障礙" },
        selectionRadius: 5,
        playerRoute: {
          branch: "0000:761A..762F recognizes 1K/2K and jumps to the construction-specific 0000:76C0 path instead of the generic technique handler call",
          placement: "build seed 5 with mode M, require a nonzero-range empty destination, then move the engineer to that cell",
          neighborOrder: [50, -50, 1, -1],
          neighborFilter: "0000:77CD converts each neighboring raw token to its logical terrain slot and skips slot 0",
          mutation: "write the stage-specific sourceToken itself to every accepted orthogonal neighbor; the selected center cell is not written by this player route",
          experience: "none; the construction route spends the action after movement without a casting-experience write",
        },
        sourceTokens: {
          "1K": "raw terrain token copied at battle load from map cell 1266 (x16,y25)",
          "2K": "raw terrain token copied at battle load from map cell 1316 (x16,y26)",
        },
        dormantDispatchRows: {
          "1K": "DS:52A2 still points at wrapper 0000:CAE7 / writer 1000:7C92, which would write sourceToken..sourceToken+4 at linear offsets 0..4",
          "2K": "DS:52A2 still points at wrapper 0000:CAF9 / writer 1000:7CB4, which would write sourceToken..sourceToken+4 at linear offsets 0..4",
          reachability: "the released player construction branch bypasses these generic wrappers, class 5A is in the ordinary AI dispatch group, and no AI technique pool produces 1K/2K",
        },
      },
      OJ: {
        visibleName: "祈禱",
        scope: "scan all 2500 cells; skip empty cells and side 2",
        perUnitChance: "PIT counter bit0 must be 1 (approximately one half per eligible unit)",
        outcomes: [
          { roll: 0, effect: "heal", amount: "5..14, capped at maxLife" },
          { roll: 1, effect: "experience", amount: "5..14 added directly to the affected unit" },
          { roll: 2, effect: "attack up", stateOffset: "+08", value: "8003h" },
          { roll: 3, effect: "defense up", stateOffset: "+0A", value: "8003h" },
        ],
        casterExperience: 0,
      },
      statuses: {
        commonExperience: {
          AD: "10 + random(0..3)", AA: "10 + random(0..3)", FM: "10 + random(0..3)",
          SD: "10 + random(0..3)", SA: "10 + random(0..3)",
          LA: "14 + random(0..3)", IP: "14 + random(0..3)", TR: "14 + random(0..3)", SN: "14 + random(0..3)",
        },
        entries: [
          { code: "AD", name: "防禦提昇", stateOffset: "+0A", write: "8003h" },
          { code: "AA", name: "攻擊提昇", stateOffset: "+08", write: "8003h" },
          { code: "FM", name: "防魔", stateOffset: "+0C", write: "8001h" },
          { code: "SD", name: "防禦下降", stateOffset: "+12", write: "8003h" },
          { code: "SA", name: "攻擊下降", stateOffset: "+10", write: "8003h" },
          { code: "LA", name: "混亂", stateOffset: "+0E", write: "8003h", immunity: ["1P", "2P", "3P"], consumer: "AI loader forces behavior FFh; ordinary classes retreat defensively, while shooting/technique/empress classes perform a PIT-selected movement-only action; manual player selection is not directly blocked" },
          { code: "IP", name: "施毒", stateOffset: "+14", write: "8003h", immunity: ["1P", "2P", "3P"] },
          { code: "SN", name: "禁咒", stateOffset: "+16", write: "8003h", immunity: ["1P"] },
          { code: "TR", name: "破邪", effect: "clear bit15 at +12/+10/+0E, then write 7FFFh to +14/+16" },
        ],
      },
      V: {
        visibility: "present in the 36-entry dispatch table but absent from the 13 player technique menus",
        codes: ["1V", "2V", "3V"],
        behavior: "build a target-to-source line list; apply floor(inputDamage/2) once to each eligible occupied path cell, then apply the same half once more to the selected target at list index 0; +0C is cleared rather than checked",
        selectedTargetQuirk: "selected target damage is 2*floor(inputDamage/2), while other eligible occupied line cells receive floor(inputDamage/2); odd input rolls therefore lose one point at the target",
        inputs: { "1V": 40, "2V": 40, "3V": "caller supplied; 魔弓兵射擊 supplies 50..69" },
      },
    },
    presentationResourceIndex: {
      0: "A.SWF", 1: "C.SWF", 2: "D.SWF", 3: "E.SWF", 4: "MAGIC.SWF", 5: "M_00.SWF", 6: "Y_00.SWF",
      7: "SAY.SWF", 8: "MUSIC.SWF", 9: "NUM.SWF", 10: "CHA.SWF", 11: "BK.SWF", 12: "B.SWF", 13: "UN.SWF",
    },
    confirmedPresentationRecords: {
      "1H": [{ resource: "UN.SWF", record: 61 }, { resource: "E.SWF", record: 36 }, { resource: "MAGIC.SWF", record: 0 }],
      "2H": [{ resource: "MAGIC.SWF", record: 37 }, { resource: "E.SWF", record: 36 }, { resource: "MAGIC.SWF", record: 0 }],
      "3H": [{ resource: "MAGIC.SWF", record: 42 }, { resource: "MAGIC.SWF", record: 41 }, { resource: "E.SWF", record: 36 }, { resource: "MAGIC.SWF", record: 0 }],
      "1I-3I-common": [{ resource: "MAGIC.SWF", record: 20 }, { resource: "E.SWF", record: 36 }],
      "1F": [{ resource: "MAGIC.SWF", record: 22 }, { resource: "MAGIC.SWF", record: 83 }],
      "2F": [{ resource: "MAGIC.SWF", record: 23 }, { resource: "MAGIC.SWF", record: 83 }],
      "3F": [{ resource: "MAGIC.SWF", record: 27 }, { resource: "MAGIC.SWF", record: 83 }],
      "4F": [{ resource: "MAGIC.SWF", record: 30 }, { resource: "MAGIC.SWF", record: 83 }, { resource: "MAGIC.SWF", record: 28 }, { resource: "E.SWF", record: 51 }, { resource: "MAGIC.SWF", record: 29 }],
      "1L": [{ resource: "MAGIC.SWF", record: 8 }, { resource: "E.SWF", record: 43 }, { resource: "MAGIC.SWF", record: 31 }],
      "2L": [{ resource: "MAGIC.SWF", record: 47 }, { resource: "E.SWF", record: 63 }, { resource: "MAGIC.SWF", record: 48 }, { resource: "E.SWF", record: 41 }, { resource: "MAGIC.SWF", record: 24 }],
      "3L": [{ resource: "MAGIC.SWF", record: 3 }, { resource: "E.SWF", record: 41 }, { resource: "MAGIC.SWF", record: 4 }, { resource: "E.SWF", record: 9 }, { resource: "MAGIC.SWF", record: 25 }],
      "4L": [{ resource: "MAGIC.SWF", record: 39 }, { resource: "E.SWF", record: 43 }, { resource: "MAGIC.SWF", record: 40 }, { resource: "MAGIC.SWF", record: 26 }],
      "1C-4C-common": [{ resource: "MAGIC.SWF", record: 10 }, { resource: "UN.SWF", record: 50 }],
      "1D": [{ resource: "MAGIC.SWF", record: 82 }, { resource: "MAGIC.SWF", record: 50, whenTargetSide: 1 }, { resource: "MAGIC.SWF", record: 49, whenTargetSide: 2 }],
      "2D": [{ resource: "MAGIC.SWF", record: 82 }, { resource: "MAGIC.SWF", record: 52, whenTargetSide: 1 }, { resource: "MAGIC.SWF", record: 51, whenTargetSide: 2 }],
      "3D": [{ resource: "MAGIC.SWF", record: 82 }, { resource: "MAGIC.SWF", record: 54, whenTargetSide: 1 }, { resource: "MAGIC.SWF", record: 53, whenTargetSide: 2 }],
      "1V-3V-common": [{ resource: "UN.SWF", record: 60 }, { resource: "MAGIC.SWF", record: 83 }],
    },
  };
}

function shootingRules(descriptorsByCode) {
  return {
    menuLabel: "射擊",
    commitFunction: "0000:719B",
    minimumManhattanRange: 2,
    minimumRuleEvidence: "range mode 2, followed by clearing the source cell and its four orthogonal neighbors",
    classes: [
      { classCode: "3A", descriptorMatches: descriptorsByCode.get("3A") ?? [], maximumRange: 5, damage: "30..49 to selected target", experience: "kill reward + 8..11" },
      { classCode: "0I", descriptorMatches: descriptorsByCode.get("0I") ?? [], maximumRange: 8, damage: "70..89 to selected target", experience: "kill reward + 13..17" },
      { classCode: "1I", descriptorMatches: descriptorsByCode.get("1I") ?? [], maximumRange: 6, damage: "roll 50..69; selected target receives 2*floor(roll/2)=50..68, while other eligible occupied line cells receive floor(roll/2)=25..34", experience: "kill reward + 13..17" },
    ],
    swiftDragonEvasion: {
      targetClassCode: "0E",
      descriptorMatches: descriptorsByCode.get("0E") ?? [],
      rule: "PIT port bit0=1 bypasses normal shooting damage; player uses no-damage UN/60 common-shot impact while AI uses no-damage UN/62 + E/38 ordinary-hit presentation",
      appliesTo: ["player shooting", "AI shooting"],
      probabilityWording: "50% candidate from the sampled bit; exact empirical distribution depends on PIT timing",
      evidence: ["0000:722B", "1000:1F7B"],
      machinePresentationEvidence: "reverse/parsed/native/shooting-presentations.json",
    },
    cancellation: "restores the pre-action cell; only success sets action bit 0x80",
  };
}

async function terrainConstructionTokens(battleTemplates, battleDirectory) {
  const stages = [];
  for (const stage of battleTemplates.stages ?? []) {
    const record = String(stage.bRecord).padStart(4, "0");
    const buffer = await readFile(path.join(battleDirectory, record, "00.raw"));
    if (buffer.length !== 8506) throw new Error(`B/${record}/00.raw: expected 8506 bytes`);
    stages.push({
      stage: stage.stage,
      bRecord: stage.bRecord,
      ironPlateSourceToken: buffer[256 + 0x4f2],
      obstacleSourceToken: buffer[256 + 0x524],
    });
  }
  return {
    sourceCells: {
      ironPlate: { linearCell: 0x4f2, x: 16, y: 25 },
      obstacle: { linearCell: 0x524, x: 16, y: 26 },
    },
    stages,
  };
}

async function extract(runtimePath, descriptorPath, battleTemplatePath, battleDirectory, outputPath) {
  const [buffer, descriptors, battleTemplates] = await Promise.all([
    readFile(runtimePath),
    readFile(descriptorPath, "utf8").then(JSON.parse),
    readFile(battleTemplatePath, "utf8").then(JSON.parse),
  ]);
  const descriptorsByCode = descriptorIndex(descriptors);
  const classMenus = parseClassMenus(buffer, descriptorsByCode);
  const dispatchTable = parseDispatchTable(buffer);
  const menuCodes = new Set(classMenus.flatMap((entry) => entry.tiers.flatMap((tier) => tier.entries.map((item) => item.actionCode))));
  const dispatchCodes = new Set(dispatchTable.map((entry) => entry.actionCode));
  for (const code of menuCodes) if (!dispatchCodes.has(code)) throw new Error(`${code}: menu action is absent from dispatch table`);
  const vHandlers = Object.fromEntries(dispatchTable
    .filter((entry) => ["1V", "2V", "3V"].includes(entry.actionCode))
    .map((entry) => {
      const target = Number.parseInt(entry.handler.split(":")[1], 16);
      return [entry.actionCode, {
        handler: entry.handler,
        directNearCallers: directNearCallers(buffer, target).map((offset) => `0000:${hex(offset)}`),
      }];
    }));
  if (vHandlers["1V"].directNearCallers.length !== 0
    || vHandlers["2V"].directNearCallers.length !== 0
    || vHandlers["3V"].directNearCallers.join(",") !== "0000:72D3") {
    throw new Error("1V/2V/3V direct-caller set differs from the recovered runtime");
  }

  const result = {
    format: "ANGEL2 module 29 shooting and player technique rules",
    evidenceLevel: "C unless a field explicitly says unresolved/inference",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    unitDescriptors: descriptorPath,
    battleTemplates: battleTemplatePath,
    addressModel: { dataSegment: hex(DATA_SEGMENT), dataLinearBase: DATA_LINEAR_BASE, code1000FileBase: 0x10000 },
    actionMenuLabels: {
      basic: ["移動", "攻擊", "休息"],
      ranged: ["移動", "攻擊", "射擊", "休息"],
      technique: ["移動", "攻擊", "技術", "休息"],
      cancelCode: "X",
    },
    shooting: shootingRules(descriptorsByCode),
    techniqueMenu: {
      classTable: `${hex(DATA_SEGMENT)}:${hex(CLASS_MENU_TABLE)}`,
      tierSelector: "DS:524C minus one, clamped to 0..2",
      classes: classMenus,
      uniqueVisibleActionCodes: [...menuCodes].sort(),
    },
    dispatchTable: {
      address: `${hex(DATA_SEGMENT)}:${hex(SPECIAL_DISPATCH_TABLE)}`,
      recordFormat: "actionCode:u16, nearHandler:u16, selectionRadius:u16; FFFFh sentinel",
      entries: dispatchTable,
      codesAbsentFromPlayerMenus: dispatchTable.map((entry) => entry.actionCode).filter((code) => !menuCodes.has(code)),
      vReachability: {
        handlers: vHandlers,
        playerMenuProducer: null,
        releasedDirectProducer: "only 3V has a direct caller, 0000:72D3 in the 魔弓兵 shooting branch",
        boundary: "1V and 2V remain dormant dispatch-table compatibility entries unless corrupted/external state injects their action words",
      },
    },
    rules: nativeTechniqueRules(),
    terrainConstructionTokens: await terrainConstructionTokens(battleTemplates, battleDirectory),
    verifiedCodeSignatures: validateCodeSignatures(buffer),
    evidenceLogs: [
      "reverse/logs/module29-skill-menu-context.log",
      "reverse/logs/module29-special-effect-context.log",
      "reverse/logs/module29-special-presentation-effects.log",
      "reverse/logs/module29-ice-knockback-context.log",
      "reverse/logs/module29-prayer-5928-context.log",
      "reverse/logs/module29-lightning-xp-720d-context.log",
      "reverse/logs/module29-load-special-terrain-token-context.log",
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted ${classMenus.length} technique classes, ${dispatchTable.length} dispatch entries and ${result.verifiedCodeSignatures.length} signatures to ${outputPath}`);
}

function usage() {
  return "usage: angel2-technique-rules.mjs --extract RUNTIME.bin UNIT-DESCRIPTORS.json BATTLE-TEMPLATES.json DECODED-B-DIR OUTPUT.json";
}

async function main() {
  const [mode, runtimePath, descriptorPath, battleTemplatePath, battleDirectory, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) throw new Error(usage());
  await extract(runtimePath, descriptorPath, battleTemplatePath, battleDirectory, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { extract, parseClassMenus, parseDispatchTable };
