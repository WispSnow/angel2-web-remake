#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba * 16;
const AI_PRIORITY_DS_OFFSET = 0x1036;
const SENTINEL = 0xffff;
const AI_CODE_SEGMENT_FILE_BASE = 0x11470;
const STAGE37_HEAD_TOGGLE_CS_OFFSET = 0x037d;
const STAGE37_HAND_TOGGLE_CS_OFFSET = 0x0405;

const CODE_SIGNATURES = [
  { address: "0000:48FE", offset: 0x48fe, hex: "e80dd39aac009d13a180f88ec0bf0000" },
  { address: "0000:55D3", offset: 0x55d3, hex: "8b36095a833e9a45007542c60690f5008936161f" },
  { address: "0000:719B", offset: 0x719b, hex: "833e4a3d537401c3e89408a1161fa3bf" },
  { address: "0000:7528", offset: 0x7528, hex: "833e4a3d487401c38b36161f8936bf77c706" },
  { address: "0000:75E4", offset: 0x75e4, hex: "e8cdff83fa597401c3a1161fa3bf77a14a3d" },
  { address: "0000:7A8C", offset: 0x7a8c, hex: "a122008ec08b1e5052b400268a07268827247f8b1e4e5226" },
  { address: "0000:7BE5", offset: 0x7be5, hex: "a122008ec08b1e5052268a070c802688" },
  { address: "0000:9123", offset: 0x9123, hex: "a122008ec08b1ebf77268a070c80268807c3" },
  { address: "1000:147E", offset: 0x1147e, hex: "c606d780592ec606830101e83d0ec606" },
  { address: "1000:14A6", offset: 0x114a6, hex: "c7064c3d4001c7064e3dc8009ac1570000a1" },
  { address: "1000:1542", offset: 0x11542, hex: "2ec606e20059e80c002ec606e200" },
  { address: "1000:1557", offset: 0x11557, hex: "ff360460c70604604e00c606d78059ff367a" },
  { address: "1000:1595", offset: 0x11595, hex: "c60686104ec706341000008b1e341003db8b" },
  { address: "1000:15F4", offset: 0x115f4, hex: "2e3a1e83017401c3a122008ec033db268a1cf6c3807401c38936161fe8ed0c3b" },
  { address: "1000:17A7", offset: 0x117a7, hex: "a1430d3d3250740a3d33507401c3e83600c32e80367d0301" },
  { address: "1000:17BF", offset: 0x117bf, hex: "a1161fa3c177b91400b82fcd2e803e7d03007403b8d9cd9adeca0000" },
  { address: "1000:17EE", offset: 0x117ee, hex: "2ec70603044e002ec70601040000a124008e" },
  { address: "1000:183C", offset: 0x1183c, hex: "2e80360504012ea10104a3c177b91400b80ccc2e803e0504007403b862cb9adeca0000" },
  { address: "1000:2032", offset: 0x12032, hex: "8b1e161fa122008ec0268a070c802688" },
  { address: "1000:22C9", offset: 0x122c9, hex: "b9c409be0000a124008ec0268a042e3a0683017511a12200" },
  { address: "1000:24A5", offset: 0x124a5, hex: "833e772e1a7401c3e80400e80100c3bb" },
  { address: "1000:41BC", offset: 0x141bc, hex: "e80400e83e00cba124008ec033dbb9c4" },
  { address: "1000:5D12", offset: 0x15d12, hex: "c706181f05009af2620000a180f88ec0bf0000b9" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeCode(word) {
  return String.fromCharCode(word & 0xff, (word >>> 8) & 0xff);
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${signature.address}: turn/action code signature mismatch`);
    }
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function validateStage37ToggleData(buffer) {
  const entries = [
    {
      name: "head effect toggle",
      logicalAddress: `CS:${STAGE37_HEAD_TOGGLE_CS_OFFSET.toString(16).toUpperCase().padStart(4, "0")}`,
      fileOffset: AI_CODE_SEGMENT_FILE_BASE + STAGE37_HEAD_TOGGLE_CS_OFFSET,
    },
    {
      name: "shared hand effect toggle",
      logicalAddress: `CS:${STAGE37_HAND_TOGGLE_CS_OFFSET.toString(16).toUpperCase().padStart(4, "0")}`,
      fileOffset: AI_CODE_SEGMENT_FILE_BASE + STAGE37_HAND_TOGGLE_CS_OFFSET,
    },
  ].map((entry) => ({ ...entry, initialValue: buffer[entry.fileOffset] }));
  if (entries.some((entry) => entry.initialValue !== 0)) {
    throw new Error("stage-37 effect toggles no longer initialize to zero");
  }
  return {
    codeSegmentFileBase: AI_CODE_SEGMENT_FILE_BASE,
    derivation: "the main-loop far call at 0000:4A52 stores segment 1147h and offset 0036h for 1000:14A6, proving this AI code segment's static file base is 11470h",
    entries,
  };
}

function buildDescriptorIndex(descriptors) {
  if (!Array.isArray(descriptors?.records) || descriptors.records.length !== 39) {
    throw new Error("expected 39 native unit descriptors");
  }
  const byCode = new Map();
  for (const record of descriptors.records) {
    for (const code of record.codeVariants) {
      const values = byCode.get(code) ?? [];
      values.push({ record: record.record, name: record.normalizedName });
      byCode.set(code, values);
    }
  }
  return byCode;
}

function parseAiPriority(buffer, descriptorsByCode) {
  const fileOffset = DATA_LINEAR_BASE + AI_PRIORITY_DS_OFFSET;
  const entries = [];
  let cursor = fileOffset;
  for (let index = 0; index < 64; index += 1, cursor += 2) {
    const codeWord = buffer.readUInt16LE(cursor);
    if (codeWord === SENTINEL) {
      if (entries.length !== 39) {
        throw new Error(`expected 39 AI priority codes, got ${entries.length}`);
      }
      return {
        address: "1EBA:1036",
        fileOffset,
        entryCount: entries.length,
        sentinelFileOffset: cursor,
        entries,
      };
    }
    const code = decodeCode(codeWord);
    entries.push({
      priority: index,
      code,
      codeWord,
      descriptorMatches: descriptorsByCode.get(code) ?? [],
    });
  }
  throw new Error("AI priority table has no FFFF sentinel in 64 entries");
}

function extractStage37(battleTemplates, aiPriority, toggleData) {
  const stage = battleTemplates?.stages?.find((entry) => entry.stage === 37);
  if (stage === undefined) {
    throw new Error("battle template stage 37 is missing");
  }
  const expectedSlots = new Set([54, 55, 56]);
  const parts = stage.activeUnitInstances
    .filter((unit) => unit.side === 2 && expectedSlots.has(unit.unitSlot))
    .map((unit) => ({
      cell: unit.cell,
      x: unit.x,
      y: unit.y,
      unitSlot: unit.unitSlot,
      storedClass: unit.storedClass,
      descriptorClass: unit.descriptorClass,
      className: unit.className,
      perSlotBehavior: unit.perSlotBehavior,
      scenarioUnitFlag: unit.scenarioUnitFlag,
    }))
    .sort((left, right) => left.unitSlot - right.unitSlot);
  if (parts.length !== 3 || parts.some((part) => part.perSlotBehavior !== 0)) {
    throw new Error("stage 37 does not contain three behavior-0 side-2 boss parts");
  }
  const priorityCodes = new Set(aiPriority.entries.map((entry) => entry.code));
  if (!priorityCodes.has("2P") || !priorityCodes.has("3P")) {
    throw new Error("stage 37 boss codes are absent from AI priority table");
  }
  return {
    stage: 37,
    bRecord: stage.bRecord,
    parts,
    independentActionCells: parts.length,
    completedSpecialActionsPerEnemyPhaseWhileAllPartsSurvive: 3,
    head: {
      code: "2P",
      unitSlot: 56,
      function: "1000:17A7",
      toggle: toggleData.entries[0],
      target: "the acting head cell",
      sequenceFromInitialState: [
        {
          ordinal: 1,
          playerActionCode: "3I",
          visibleName: "高級回復",
          handler: "0000:CDD9",
          effect: "same-side area healing centered on the head; range-map values 1..4 heal 35/60/85/110 and each unit is capped at max life",
          directPresentationRecords: [
            { resource: "MAGIC.SWF", record: 20 },
            { resource: "E.SWF", record: 36 },
          ],
        },
        {
          ordinal: 2,
          playerActionCode: "3C",
          visibleName: "高級冰雪",
          handler: "0000:CD2F",
          effect: "no life damage; side-1 units in the five-value area are pushed to a lower-valued empty passable neighbor in down/up/left/right priority; defense magic blocks and is consumed",
          directPresentationRecords: [
            { resource: "MAGIC.SWF", record: 10 },
            { resource: "UN.SWF", record: 50 },
          ],
        },
      ],
      repetition: "the toggle is XORed before dispatch, so the zero initial state yields recovery first, then ice, alternating once per surviving head action",
      behavior: "dispatch the next sequence entry centered on the head cell, ignore the returned player-caster experience value, then set the head cell's action-spent bit",
    },
    hands: {
      code: "3P",
      unitSlots: [54, 55],
      function: "1000:17EE",
      toggle: toggleData.entries[1],
      targetSelection: {
        scanOrder: "linear board cells 0..2499",
        candidate: "sideMap[cell] == 1",
        acceptance: "AI randomBelow(5) == 0 for the current candidate",
        retry: "if at least one side-1 candidate was seen but none passed, restart the full scan; with the native stage-37 template's sole side-1 unit, selection is therefore eventual and deterministic",
        multipleTargetBias: "if scripts add multiple side-1 units, earlier linear cells have higher probability because the first accepted candidate ends the scan",
      },
      sharedSequenceFromInitialState: [
        {
          ordinal: 1,
          playerActionCode: "4L",
          visibleName: "究級落雷",
          handler: "0000:CB62",
          effect: "Manhattan area centered on the selected side-1 target; range-map values 1..5 deal 30/50/70/90/110; defense magic prevents damage and is then cleared",
          directPresentationRecords: [
            { resource: "MAGIC.SWF", record: 39 },
            { resource: "E.SWF", record: 43 },
            { resource: "MAGIC.SWF", record: 40 },
            { resource: "MAGIC.SWF", record: 26 },
          ],
        },
        {
          ordinal: 2,
          playerActionCode: "4F",
          visibleName: "究級炎暴",
          handler: "0000:CC0C",
          effect: "selected target damage = min(currentLife, 270, floor(maxLife * 44 / 100)); defense magic does not prevent damage but is cleared afterward",
          directPresentationRecords: [
            { resource: "MAGIC.SWF", record: 30 },
            { resource: "MAGIC.SWF", record: 83 },
            { resource: "MAGIC.SWF", record: 28 },
            { resource: "E.SWF", record: 51 },
            { resource: "MAGIC.SWF", record: 29 },
          ],
        },
      ],
      sharedToggleConsequence: "both hands mutate the same toggle; with both alive, consecutive hand actions are lightning then fire and restore the toggle to zero each enemy phase, while which physical hand receives which effect depends on scheduler order; one surviving hand alternates across phases",
      behavior: "each hand selects a side-1 target, dispatches the next shared sequence entry, ignores the returned player-caster experience value, then sets its own action-spent bit",
    },
    experience: "the reused player handlers return an experience value in CX, but the boss-part callers do not add it to any unit state",
    boundary: "all four effect families, formulas, first-use order and complete animation/audio timelines are bound through technique-presentations.json",
  };
}

async function extract(runtimePath, descriptorPath, battleTemplatePath, outputPath) {
  const [buffer, descriptors, battleTemplates] = await Promise.all([
    readFile(runtimePath),
    readFile(descriptorPath, "utf8").then(JSON.parse),
    readFile(battleTemplatePath, "utf8").then(JSON.parse),
  ]);
  const signatures = validateCodeSignatures(buffer);
  const toggleData = validateStage37ToggleData(buffer);
  const descriptorsByCode = buildDescriptorIndex(descriptors);
  const aiPriority = parseAiPriority(buffer, descriptorsByCode);
  const stage37 = extractStage37(battleTemplates, aiPriority, toggleData);

  const result = {
    format: "ANGEL2 module 29 turn phases and per-cell action state",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    unitDescriptors: descriptorPath,
    battleTemplates: battleTemplatePath,
    unitSlotCellByte: {
      lowBits: "bits 0..6 store the unit slot/index",
      actionSpentBit: "bit 7 (0x80)",
      available: "bit 7 clear",
      spent: "bit 7 set",
      reset: "1000:22C9 scans all 2500 cells and clears bit 7 only where sideMap[cell] equals the selected side",
    },
    standardTurnSequence: [
      "player-controlled side-1 actions continue while 1000:41BC reports an enabled, unspent selectable side-1 cell",
      "1000:1542/1557 runs the side-1 AI scheduler for remaining allied autonomous/special units",
      "0000:4E03 performs between-phase housekeeping and redraw work",
      "1000:147E selects side 1 and clears its action-spent bits for the next player phase",
      "1000:14A6 selects side 2, clears side-2 action bits, runs the enemy AI scheduler, applies the stage-26-only extra event, then clears side-2 action bits again",
      "the main loop evaluates defeat and victory after the enemy phase; if battle continues, 0000:4DCD increments the round, applies poison/status ticks and stage events before returning to the player phase",
    ],
    playerSelectionGate: {
      functions: ["0000:55D3", "1000:41C3"],
      conditions: [
        "sideMap[cell] == 1",
        "unitSlotCellByte bit 7 is clear",
        "loaded per-unit disable value at DS:31B7 is zero",
        "loaded autonomous/AI behavior value at DS:3BF6 is zero",
      ],
      phaseAdvance: "the recovered main loop enters the allied/enemy AI phases when no cell satisfies this gate",
    },
    actionCommitPoints: {
      move: {
        function: "0000:7A8C transfer path",
        behavior: "move clears the origin and copies only low 7 slot bits to the destination; movement alone does not set action-spent",
      },
      ordinaryAttack: {
        function: "0000:9123",
        behavior: "set bit 7 on the attacker cell after damage calculation is prepared",
      },
      shooting: {
        function: "0000:719B",
        behavior: "a successful 射擊 path sets bit 7 on the acting cell",
      },
      rest: {
        functions: ["0000:7528", "1000:5D12"],
        behavior: "restore floor(maxLife * 15 / 100), clamp to maxLife, then set bit 7 on the acting cell",
      },
      technique: {
        functions: ["0000:75E4", "0000:7BE5"],
        behavior: "a successful 技術 dispatch returns through the same per-cell bit-7 commit",
      },
      cancellation: "movement/action cancellation paths restore the previous cell and/or clear bit 7, so only a committed terminal action consumes the cell's phase action",
    },
    aiScheduler: {
      scheduler: "1000:1595",
      perCellVisitor: "1000:15F4",
      commit: "1000:2032",
      eligibility: "side matches selected side, action-spent bit clear, class code matches the current priority entry, and per-unit disable value is zero",
      randomDeferral: "PIT bit 0 can defer an eligible unit during a pass; the scheduler repeats while any eligible unit remains, so deferral does not grant or remove an action",
      completion: "every eligible unit cell is eventually committed once unless battle victory/defeat interrupts the scheduler",
      priorityTable: aiPriority,
    },
    stage37,
    stage26ExtraEnemyEvent: {
      stage: 26,
      function: "1000:24A5",
      behavior: "after normal enemy AI, invoke the stage-wide extra handler twice; it is not represented by a unit cell action bit. Each execution presents MAGIC/21 then MAGIC/14 for 385 native ticks and moves side-1 units in the selected column down by the farthest available one-to-three rows",
      completeRuleArtifact: "wd-stage26.json",
    },
    unresolved: [
      "some UI command-state words retain internal compatibility names even though attack, 射擊, 技術, rest and movement side effects are confirmed",
    ],
    verifiedCodeSignatures: signatures,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted ${signatures.length} turn/action signatures and ${aiPriority.entryCount} AI class priorities to ${outputPath}`);
}

function usage() {
  return "usage: angel2-turn-actions.mjs --extract RUNTIME.bin UNIT-DESCRIPTORS.json BATTLE-TEMPLATES.json OUTPUT.json";
}

async function main() {
  const [mode, runtimePath, descriptorPath, battleTemplatePath, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) {
    throw new Error(usage());
  }
  await extract(runtimePath, descriptorPath, battleTemplatePath, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
