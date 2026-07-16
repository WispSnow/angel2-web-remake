#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const NORMAL_STAGE_COUNT = 39;
const STAGE_RECORD_MAP = [
  ...Array.from({ length: NORMAL_STAGE_COUNT }, (_, stage) => stage * 2 + 1),
  1,
  49,
  65,
  85,
  87,
];
const TEMPLATE_BYTES = 8506;
const UNIT_SLOTS = 75;
const GRID_BYTES = 2500;

const LAYOUT = [
  { id: "scenarioConfig", offset: 0, bytes: 256, nativeTarget: "module27 DS:02B8; module29 DS:2E7D", meaning: "128 u16 terrain descriptor offsets; a raw terrain token indexes this table, then UN/0056 page 0 resolves the offset to a MAP logical slot" },
  { id: "terrainTokenMap", legacyId: "thirdStateMap", offset: 256, bytes: GRID_BYTES, nativeTarget: "module27 segment DS:004B; module29 segment DS:01A7", meaning: "50x50 raw terrain-token map; runtime resolves tokens to 23 logical terrain-profile slots" },
  { id: "unitSlotMap", offset: 2756, bytes: GRID_BYTES, nativeTarget: "module27 segment DS:004F; module29 segment DS:0022" },
  { id: "sideMap", offset: 5256, bytes: GRID_BYTES, nativeTarget: "module27 segment DS:0051; module29 segment DS:0024", meaning: "0 is empty, 1/2 are occupied by the two sides, and FF marks an unfilled player deployment cell before JUST.TST is written" },
  { id: "side2Classes", offset: 7756, bytes: 150, nativeTarget: "module27 DS:03E0; module29 DS:55AE" },
  { id: "side1ClassOverrides", offset: 7906, bytes: 150, nativeTarget: "module27 DS:050C; module29 DS:56DA" },
  { id: "side2PerSlotBehavior", legacyId: "side2PerSlotState", offset: 8056, bytes: 150, nativeTarget: "module27 DS:0476; module29 DS:5644", meaning: "AI behavior value assigned per side-2 unit slot" },
  { id: "side1PerSlotBehavior", legacyId: "side1PerSlotState", offset: 8206, bytes: 150, nativeTarget: "module27 DS:0708; module29 DS:3BFD", meaning: "AI behavior value assigned per side-1 unit slot" },
  { id: "scenarioUnitFlags", offset: 8356, bytes: 150, nativeTarget: "module27 DS:079E; consumed before JUST.TST serialization", meaning: "nonzero makes the corresponding campaign unit slot appear in the deployment roster; it is not serialized into JUST.TST" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function words(buffer, offset, count = UNIT_SLOTS) {
  return Array.from({ length: count }, (_, index) => buffer.readUInt16LE(offset + index * 2));
}

function section(buffer, layout) {
  return buffer.subarray(layout.offset, layout.offset + layout.bytes);
}

function className(record, unitNames) {
  if (record === 39) {
    return "手（运行时记录 39，描述符回退到记录 38）";
  }
  return unitNames[record] ?? null;
}

function parseTemplate(buffer, stage, unitNames = [], record = STAGE_RECORD_MAP[stage]) {
  if (buffer.length !== TEMPLATE_BYTES) {
    throw new Error(`stage ${stage}: expected ${TEMPLATE_BYTES} bytes, got ${buffer.length}`);
  }
  if (!Number.isInteger(record)) {
    throw new Error(`stage ${stage}: no B.SWF record mapping`);
  }
  const terrainTokenMap = section(buffer, LAYOUT[1]);
  const unitSlotMap = section(buffer, LAYOUT[2]);
  const sideMap = section(buffer, LAYOUT[3]);
  const side2Classes = words(buffer, LAYOUT[4].offset);
  const side1ClassOverrides = words(buffer, LAYOUT[5].offset);
  const side2PerSlotBehavior = words(buffer, LAYOUT[6].offset);
  const side1PerSlotBehavior = words(buffer, LAYOUT[7].offset);
  const scenarioUnitFlags = words(buffer, LAYOUT[8].offset);
  const deploymentCells = [];
  const activeUnitInstances = [];

  for (let cell = 0; cell < GRID_BYTES; cell += 1) {
    const side = sideMap[cell];
    if (side === 0xff) {
      deploymentCells.push({
        cell,
        x: cell % 50,
        y: Math.floor(cell / 50),
      });
      continue;
    }
    if (side !== 1 && side !== 2) {
      continue;
    }
    const rawUnitIndex = unitSlotMap[cell];
    const unitSlot = rawUnitIndex & 0x7f;
    const storedClass = side === 2 ? side2Classes[unitSlot] : side1ClassOverrides[unitSlot];
    const inheritsCampaignClass = side === 1 && storedClass === 0;
    const effectiveClass = inheritsCampaignClass ? null : storedClass;
    const descriptorClass = effectiveClass === 39 ? 38 : effectiveClass;
    activeUnitInstances.push({
      cell,
      x: cell % 50,
      y: Math.floor(cell / 50),
      side,
      rawUnitIndex,
      unitSlot,
      storedClass,
      effectiveClass,
      descriptorClass,
      className: effectiveClass === null ? null : className(effectiveClass, unitNames),
      inheritsCampaignClass,
      perSlotBehavior: side === 2 ? side2PerSlotBehavior[unitSlot] : side1PerSlotBehavior[unitSlot],
      scenarioUnitFlag: scenarioUnitFlags[unitSlot],
    });
  }

  const unusualClassSlots = side2Classes
    .map((value, slot) => ({ side: 2, slot, storedClass: value, descriptorClass: value === 39 ? 38 : value, className: className(value, unitNames) }))
    .filter((entry) => entry.storedClass >= 35);
  const unusualSide1ClassOverrideSlots = side1ClassOverrides
    .map((value, slot) => ({ side: 1, slot, storedClass: value, descriptorClass: value === 39 ? 38 : value, className: className(value, unitNames) }))
    .filter((entry) => entry.storedClass >= 35);
  const activeUnusualClassInstances = activeUnitInstances.filter(
    (instance) => instance.storedClass >= 35,
  );
  const eligibleDeploymentUnitSlots = scenarioUnitFlags
    .map((value, unitSlot) => ({ unitSlot, value }))
    .filter((entry) => entry.value !== 0);
  const fixedPlayerUnitSlots = activeUnitInstances
    .filter((instance) => instance.side === 1)
    .map((instance) => instance.unitSlot);
  const fixedPlayerUnitSlotSet = new Set(fixedPlayerUnitSlots);
  const optionalDeploymentUnitSlots = eligibleDeploymentUnitSlots
    .filter((entry) => !fixedPlayerUnitSlotSet.has(entry.unitSlot))
    .map((entry) => entry.unitSlot);
  const unknownSideValues = [...new Set(Array.from(sideMap))]
    .filter((value) => value !== 0 && value !== 1 && value !== 2 && value !== 0xff);
  if (unknownSideValues.length > 0) {
    throw new Error(
      `stage ${stage}: unsupported side-map values ${unknownSideValues.join(",")}`,
    );
  }

  const terrainDescriptorOffsets = words(buffer, LAYOUT[0].offset, 128);
  return {
    stage,
    stageKind: stage < NORMAL_STAGE_COUNT ? "normal_0_to_38" : "special_or_alternate_39_to_43",
    bRecord: record,
    decodedRecordPath: `${record.toString().padStart(4, "0")}/00.raw`,
    bytes: buffer.length,
    sha256: sha256(buffer),
    sectionSha256: Object.fromEntries(LAYOUT.map((entry) => [entry.id, sha256(section(buffer, entry))])),
    scenarioConfigWords: terrainDescriptorOffsets,
    terrainDescriptorOffsets,
    classArrays: {
      side2: side2Classes,
      side1SparseOverrides: side1ClassOverrides,
      side1OverrideRule: "zero preserves the class imported from campaign state; nonzero replaces it",
    },
    perSlotBehaviorArrays: { side2: side2PerSlotBehavior, side1: side1PerSlotBehavior },
    scenarioUnitFlags,
    deployment: {
      required: deploymentCells.length > 0,
      markerValue: 0xff,
      cells: deploymentCells,
      eligibleUnitSlots: eligibleDeploymentUnitSlots.map((entry) => entry.unitSlot),
      eligibleFlagValues: [...new Set(eligibleDeploymentUnitSlots.map((entry) => entry.value))],
      fixedPlayerUnitSlots,
      fixedPlayerUnitsCannotBeRemoved: true,
      optionalUnitSlots: optionalDeploymentUnitSlots,
      openCellCount: deploymentCells.length,
      initialPlayerUnitCount: fixedPlayerUnitSlots.length,
      maximumPlayerUnitCount:
        fixedPlayerUnitSlots.length + Math.min(
          deploymentCells.length,
          optionalDeploymentUnitSlots.length,
        ),
      remainingMarkersBecomeEmptyAtBattleLoad: true,
    },
    activeUnitCount: activeUnitInstances.length,
    activeSide1Count: activeUnitInstances.filter((instance) => instance.side === 1).length,
    activeSide2Count: activeUnitInstances.filter((instance) => instance.side === 2).length,
    activeUnitInstances,
    unusualClassSlots,
    unusualSide1ClassOverrideSlots,
    activeUnusualClassInstances,
    mapSummaries: {
      terrainTokenNonzeroCells: Array.from(terrainTokenMap).filter((value) => value !== 0).length,
      unitSlotNonzeroCells: Array.from(unitSlotMap).filter((value) => value !== 0).length,
      side1Cells: Array.from(sideMap).filter((value) => value === 1).length,
      side2Cells: Array.from(sideMap).filter((value) => value === 2).length,
      deploymentMarkerCells: deploymentCells.length,
      otherNonzeroSideCells: Array.from(sideMap).filter((value) => value !== 0 && value !== 1 && value !== 2).length,
    },
  };
}

async function extract(decodedBDirectory, outputFile, unitDescriptorFile) {
  let unitNames = [];
  if (unitDescriptorFile !== undefined) {
    const descriptors = JSON.parse(await readFile(unitDescriptorFile, "utf8"));
    unitNames = descriptors.records.map((record) => record.normalizedName);
  }

  const stages = [];
  for (let stage = 0; stage < STAGE_RECORD_MAP.length; stage += 1) {
    const record = STAGE_RECORD_MAP[stage];
    const recordDirectory = record.toString().padStart(4, "0");
    const buffer = await readFile(path.join(decodedBDirectory, recordDirectory, "00.raw"));
    stages.push(parseTemplate(buffer, stage, unitNames, record));
  }

  const output = {
    format: "ANGEL2 B.SWF per-stage battle templates",
    stageCount: STAGE_RECORD_MAP.length,
    normalStageCount: NORMAL_STAGE_COUNT,
    specialOrAlternateStageCount: STAGE_RECORD_MAP.length - NORMAL_STAGE_COUNT,
    stageToBRecordMap: STAGE_RECORD_MAP,
    stageToBRecordRule: "module27 table DS:08CA has 44 words; loader adds one. Stages 0..38 use records 1,3,...,77; stages 39..43 use records 1,49,65,85,87",
    nativePipeline: [
      "module27 0000:0718 indexes the 44-word DS:08CA table, adds one, and decodes that B.SWF record",
      "module27 0000:082D applies nonzero side-1 class overrides over imported campaign classes",
      "module27 0000:1907/1884 finds FF cells in the side map and drives the optional deployment screen",
      "module27 0000:0D61 converts the current FF cell to side 1 plus a selected unit slot, or restores an optional unit to FF when removed",
      "module27 0000:0FF8 serializes the resulting maps and arrays to JUST.TST",
      "module29 1000:5386 restores JUST.TST before a battle",
      "module29 1000:543B clears every FF marker that remains after deployment to an empty side-map cell",
      "module29 1000:55DB restores the 128 terrain descriptor offsets to DS:2E7D",
      "module29 0000:4E6B loads the paired even B record; 0000:7E2A and 47EA prove raw-token-indexed 40x44 tiles",
      "module29 0000:510C retains stored class 39 but clamps its descriptor lookup to record 38",
    ],
    layout: LAYOUT,
    notes: {
      rawMaps: "the complete 50x50 terrain-token, unit-slot, and side/occupancy maps remain losslessly available in each decoded B record; JSON stores hashes, counts, and active cells instead of duplicating all 7,500 bytes",
      terrainTokenMap: "module29 DS:01A7 addresses this map; the same raw token directly selects a 40x44 tile from the paired even B record and indexes DS:2E7D, whose offset into UN/0056 page 0 yields one of the 23 logical movement/defense profile slots",
      class39: "stage 37 uses stored class 39 for the second hand; runtime descriptor lookup falls back to native record 38 (手)",
      perSlotBehavior: "the two 75-word arrays are AI behavior assignments, not generic unit state and not DATA.SWF descriptor field 5; module29 copies the acting unit's value to DS:0D3F before decision dispatch",
      deployment: "FF in the side map marks each open deployment cell. A nonzero scenarioUnitFlag includes that campaign slot in the roster. Units already on side 1 are selected and locked; optional roster units can fill FF cells or be removed before the player presses 結束. The battle loader turns every unfilled FF marker into an ordinary empty cell.",
      specialMappings: "stages 39..41 reuse normal odd templates 1,49,65 while module29 derives even tilesets 78,80,82 from the stage number; stages 42 and 43 use records 85 and 87; odd 79/81/83 are not selected and exactly duplicate odd 21/49/65",
      unselectedOddRecordAudit: "reverse/parsed/native/b-record-audit.json enumerates all three runtime B.SWF read producers and proves odd 79/81/83 have no released read path",
    },
    unusualClassOccurrences: stages.flatMap((stage) => [
      ...stage.unusualClassSlots,
      ...stage.unusualSide1ClassOverrideSlots,
    ].map((entry) => ({ stage: stage.stage, ...entry }))),
    stages,
  };

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`parsed ${stages.length} battle templates to ${outputFile}`);
}

function usage() {
  return "usage: angel2-battle-templates.mjs --extract DECODED_B_DIR OUTPUT.json [UNIT_DESCRIPTORS.json]";
}

const [command, decodedBDirectory, outputFile, unitDescriptorFile] = process.argv.slice(2);
if (command !== "--extract" || decodedBDirectory === undefined || outputFile === undefined) {
  console.error(usage());
  process.exitCode = 1;
} else {
  extract(decodedBDirectory, outputFile, unitDescriptorFile).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { LAYOUT, NORMAL_STAGE_COUNT, STAGE_RECORD_MAP, parseTemplate };
