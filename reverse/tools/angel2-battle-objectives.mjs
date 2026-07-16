#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CODE_SEGMENT_FILE_BASE = 0x12570;
const TABLES = [
  { id: "defeat", fileOffset: 0x12761, logicalOffset: 0x01f1 },
  { id: "victory", fileOffset: 0x1285f, logicalOffset: 0x02ef },
];
const ENTRY_BYTES = 6;
const SENTINEL = 0xffff;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function ghidraAddress(linear) {
  const segment = Math.floor(linear / 0x10000) * 0x1000;
  return `${hex(segment)}:${hex(linear & 0xffff)}`;
}

function classifyCondition(tableId, handlerOffset, parameter) {
  const exactSpecialHandlers = new Map([
    [0x004e, {
      kind: "any_required_side1_slots_absent",
      side: 1,
      unitSlots: [1, 3],
      resultWhenTrue: "defeat",
      evidence: "handler calls the side-1 slot-absence scanner for slots 1 and 3 and returns Y if either call returns Y",
    }],
    [0x0060, {
      kind: "any_required_side1_slots_absent",
      side: 1,
      unitSlots: [0, 24],
      resultWhenTrue: "defeat",
      evidence: "handler calls the side-1 slot-absence scanner for slots 0 and 24 and returns Y if either call returns Y",
    }],
    [0x0072, {
      kind: "any_required_side1_slots_absent",
      side: 1,
      unitSlots: [0, 9],
      resultWhenTrue: "defeat",
      evidence: "handler calls the side-1 slot-absence scanner for slots 0 and 9 and returns Y if either call returns Y",
    }],
    [0x0084, {
      kind: "any_side2_target_slots_absent",
      side: 2,
      unitSlots: [25, 26],
      resultWhenTrue: "victory",
      evidence: "handler calls the side-2 slot-absence scanner for slots 25 and 26 and returns Y if either call returns Y",
    }],
    [0x00ab, {
      kind: "side1_slot_cell_range_or_all_side2_absent",
      side: 1,
      unitSlot: 9,
      successCellRangesInclusive: [[0, 933]],
      alternative: "all_side2_units_absent",
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 9 and returns Y when its linear cell index is below 934; otherwise it calls the all-side-2-absent scanner",
    }],
    [0x00c0, {
      kind: "side1_slot_cell_range",
      side: 1,
      unitSlot: 8,
      successCellRangesInclusive: [[0, 279]],
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 8 and returns Y when its linear cell index is below 280",
    }],
    [0x00d5, {
      kind: "side1_slot_cell_range",
      side: 1,
      unitSlot: 0,
      successCellRangesInclusive: [[0, 524]],
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 0 and returns Y when its linear cell index is below 525",
    }],
    [0x00ea, {
      kind: "side1_slot_cell_range",
      side: 1,
      unitSlot: 0,
      successCellRangesInclusive: [[0, 1030]],
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 0 and returns Y when its linear cell index is below 1031",
    }],
    [0x00ff, {
      kind: "side1_slot_cell_range",
      side: 1,
      unitSlot: 0,
      successCellRangesInclusive: [[0, 575], [616, 625], [666, 675], [716, 725]],
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 0 and tests its linear cell index against four exact inclusive ranges",
    }],
    [0x013e, {
      kind: "side1_slot_cell_range",
      side: 1,
      unitSlot: 24,
      successCellRangesInclusive: [[0, 174]],
      resultWhenTrue: "victory",
      evidence: "handler finds side-1 slot 24 and returns Y when its linear cell index is below 175",
    }],
  ]);
  const special = exactSpecialHandlers.get(handlerOffset);
  if (special !== undefined) {
    if (special.resultWhenTrue !== tableId) {
      throw new Error(`handler CS:${hex(handlerOffset)} is attached to the unexpected ${tableId} table`);
    }
    return special;
  }
  if (tableId === "defeat" && handlerOffset === 0x0153) {
    return {
      kind: "required_side1_slot_absent",
      side: 1,
      unitSlot: parameter & 0x7f,
      resultWhenTrue: "defeat",
      evidence: "handler scans all 2500 cells for sideMap=1 and (unitSlotMap & 0x7f)=DL; returns Y only when none remains",
    };
  }
  if (tableId === "victory" && handlerOffset === 0x017e) {
    return {
      kind: "required_side2_slot_absent",
      side: 2,
      unitSlot: parameter & 0x7f,
      resultWhenTrue: "victory",
      evidence: "handler scans all 2500 cells for sideMap=2 and (unitSlotMap & 0x7f)=DL; returns Y only when none remains",
    };
  }
  if (tableId === "victory" && handlerOffset === 0x01a9) {
    return {
      kind: "all_side2_units_absent",
      side: 2,
      resultWhenTrue: "victory",
      evidence: "handler scans all 2500 sideMap cells and returns Y only when no value 2 remains",
    };
  }
  return {
    kind: "special_handler_not_yet_named",
    parameter,
  };
}

function referencedSlots(condition) {
  if (Array.isArray(condition.unitSlots)) {
    return condition.unitSlots;
  }
  if (Number.isInteger(condition.unitSlot)) {
    return [condition.unitSlot];
  }
  return [];
}

function annotateCondition(condition, stageTemplate) {
  if (stageTemplate === undefined) {
    return condition;
  }
  const slots = new Set(referencedSlots(condition));
  const referencedInitialInstances = stageTemplate.activeUnitInstances
    .filter((instance) => instance.side === condition.side && slots.has(instance.unitSlot))
    .map((instance) => ({
      side: instance.side,
      unitSlot: instance.unitSlot,
      storedClass: instance.storedClass,
      className: instance.className,
      initialCell: instance.cell,
      initialX: instance.x,
      initialY: instance.y,
    }));
  return { ...condition, referencedInitialInstances };
}

function parseTable(buffer, table) {
  if (table.fileOffset !== CODE_SEGMENT_FILE_BASE + table.logicalOffset) {
    throw new Error(`${table.id}: inconsistent file/logical table offset`);
  }
  const entries = [];
  for (let cursor = table.fileOffset; cursor + ENTRY_BYTES <= buffer.length; cursor += ENTRY_BYTES) {
    const stage = buffer.readUInt16LE(cursor);
    if (stage === SENTINEL) {
      return {
        ...table,
        fileOffsetHex: `0x${hex(table.fileOffset, 5)}`,
        logicalAddress: `CS:${hex(table.logicalOffset)}`,
        sentinelFileOffset: cursor,
        entryCount: entries.length,
        entries,
      };
    }
    const handlerOffset = buffer.readUInt16LE(cursor + 2);
    const parameter = buffer.readUInt16LE(cursor + 4);
    const handlerLinear = CODE_SEGMENT_FILE_BASE + handlerOffset;
    entries.push({
      stage,
      handlerOffset,
      handlerLogicalAddress: `CS:${hex(handlerOffset)}`,
      handlerFileOffset: handlerLinear,
      handlerGhidraAddress: ghidraAddress(handlerLinear),
      parameter,
      condition: classifyCondition(table.id, handlerOffset, parameter),
    });
  }
  throw new Error(`${table.id}: missing FFFF table sentinel`);
}

async function extract(runtimePath, outputPath, battleTemplatesPath) {
  const [buffer, battleTemplates] = await Promise.all([
    readFile(runtimePath),
    battleTemplatesPath === undefined
      ? Promise.resolve(null)
      : readFile(battleTemplatesPath, "utf8").then(JSON.parse),
  ]);
  const tables = Object.fromEntries(
    TABLES.map((table) => [table.id, parseTable(buffer, table)]),
  );
  const stage37Defeat = tables.defeat.entries.find((entry) => entry.stage === 37);
  const stage37Victory = tables.victory.entries.find((entry) => entry.stage === 37);
  if (
    stage37Defeat?.condition.kind !== "required_side1_slot_absent" ||
    stage37Defeat.condition.unitSlot !== 0 ||
    stage37Victory?.condition.kind !== "all_side2_units_absent"
  ) {
    throw new Error("stage 37 objective invariants no longer match the recovered runtime");
  }
  const stageTemplates = new Map(
    (battleTemplates?.stages ?? []).map((stage) => [stage.stage, stage]),
  );
  const normalStageObjectives = Array.from({ length: 39 }, (_, stage) => {
    const defeat = tables.defeat.entries.find((entry) => entry.stage === stage);
    const victory = tables.victory.entries.find((entry) => entry.stage === stage);
    if (defeat === undefined || victory === undefined) {
      throw new Error(`stage ${stage}: missing objective table entry`);
    }
    const template = stageTemplates.get(stage);
    return {
      stage,
      defeat: annotateCondition(defeat.condition, template),
      victory: annotateCondition(victory.condition, template),
      initialActiveSide1Count: template?.activeSide1Count ?? null,
      initialActiveSide2Count: template?.activeSide2Count ?? null,
    };
  });
  const classifiedEntries = [...tables.defeat.entries, ...tables.victory.entries]
    .filter((entry) => entry.condition.kind !== "special_handler_not_yet_named").length;

  const result = {
    format: "ANGEL2 module 29 stage objective dispatch tables",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    battleTemplates: battleTemplatesPath ?? null,
    codeSegmentFileBase: CODE_SEGMENT_FILE_BASE,
    dispatcherEvidence: {
      defeatEntry: "1000:257C selects logical CS:01F1 and calls 1000:258E",
      victoryEntry: "1000:2583 selects logical CS:02EF and calls 1000:258E",
      tableEntry: "stage:u16, near_handler_offset:u16, initial_DX_parameter:u16",
      resultConvention: "condition handlers return DX=0x59 ('Y') when their condition is satisfied",
      ghidraNote: "Ghidra addresses are flat canonical addresses; logical near offsets use the code segment whose file base is 0x12570",
    },
    tables,
    semanticCoverage: {
      totalEntries: tables.defeat.entryCount + tables.victory.entryCount,
      classifiedEntries,
      allEntriesClassified: classifiedEntries === tables.defeat.entryCount + tables.victory.entryCount,
      uniqueHandlers: new Set(
        [...tables.defeat.entries, ...tables.victory.entries].map((entry) => entry.handlerOffset),
      ).size,
      adjacentUnreferencedHandler: {
        logicalAddress: "CS:0096",
        handlerGhidraAddress: "1000:2606",
        condition: {
          kind: "side1_slot_cell_range",
          side: 1,
          unitSlot: 24,
          successCellRangesInclusive: [[0, 874]],
        },
        evidence: "function is adjacent to the dispatch handlers but has no entry in either recovered table and no static incoming reference",
      },
    },
    normalStageObjectives,
    confirmedStage37Objective: {
      stage: 37,
      defeat: stage37Defeat.condition,
      victory: stage37Victory.condition,
      interpretation: "protect side-1 slot 0 and eliminate all side-2 units; the head and both hands must all be removed",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ${tables.defeat.entryCount} defeat and ${tables.victory.entryCount} victory objectives to ${outputPath}`,
  );
}

function usage() {
  return "usage: angel2-battle-objectives.mjs --extract MODULE29-UNPACKED.bin OUTPUT.json [BATTLE-TEMPLATES.json]";
}

const [command, runtimePath, outputPath, battleTemplatesPath] = process.argv.slice(2);
if (command !== "--extract" || runtimePath === undefined || outputPath === undefined) {
  console.error(usage());
  process.exitCode = 1;
} else {
  extract(runtimePath, outputPath, battleTemplatesPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { CODE_SEGMENT_FILE_BASE, TABLES, classifyCondition, parseTable };
