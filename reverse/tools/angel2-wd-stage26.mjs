#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;
const BOARD_WIDTH = 50;
const BOARD_CELLS = 2500;

const CODE_SIGNATURES = [
  ["0000:62F2", 75, "prepare-wd-line-effect", "64cd79721ec1cf28344614f71cdbea7598df8fce2871f289ebfac3e990797199"],
  ["0000:6392", 61, "prepare-stage26-column-effect", "8bbfec248721e9c39ac57028b8683e676428899c899dafd47fc4ab5a91a09064"],
  ["0000:63CF", 65, "finalize-effect-and-remove-dead", "7a90c7afbe41f173b7330cd142b5adb42c0938d46f710e56ddd2d47305d1fff2"],
  ["0000:6438", 21, "repeat-map-damage-on-one-cell", "e28cac9733bbc1f3c3b038c28596fccf687259d3d71ba7a523b569dd9696ee0e"],
  ["0000:644D", 42, "filter-wd-damage-by-selected-target-side", "f1172ecc59655bdd69937359a583f8bddc2e9cb5603e50d951c151a3febf0681"],
  ["0000:64AC", 11, "refresh-wd-effect-and-wait", "a45063acb0f826e61316dc6536ca7223061b00d6bba10aeac31645faa22a9f81"],
  ["0000:64B7", 16, "draw-descriptor-and-wait", "3353721d4dc04b0e6453ae019538a25e348e00cb3266ed86e6ddabc115166f3e"],
  ["0000:6548", 31, "draw-stage26-moving-descriptor", "b04dff1aa94cc29d06cf423b0969a2820b5d779f67f0401cb1296871918fb02a"],
  ["0000:783D", 11, "one-point-map-damage-defense-magic-gate", "a085ebf4b749e265439c5aa5e3c4d0acf6839cc04658861f73fdfa05006bff0b"],
  ["0000:CC3B", 21, "stage26-effect-wrapper", "db1ab3e96551f82c2480f0dc80f8d156d3b237bbae2690049966743de603c692"],
  ["0000:CCD2", 31, "wd-effect-wrapper", "5d36145dd7cae84766efe1fb2e346bf71964d2e46822bd5bb422e4cf5131307b"],
  ["1000:24A5", 15, "run-stage26-event-twice", "82f502bfd2a4dca2b324b8fdf740bfe580a001cb2dd512a7cf2f45b372beeb95"],
  ["1000:24B4", 84, "run-one-stage26-column-push", "43787c5e117730a179883d0ff9e31bd7aa4067ea1dd5211c9759b89041e49b8b"],
  ["1000:2508", 71, "push-one-stage26-unit", "54f6d99060a604bebce8f2df9cb190a297130ddeb435aabacf29b8edd129bb89"],
  ["1000:660E", 52, "load-and-run-wd-effect", "f48ae15ecee163635f22ca6b8746fcf3dd08af92dc0c8f1b140add5d4c22af96"],
  ["1000:6642", 43, "wd-growth-and-finish", "482e1164d934dbb20578d8966315affc5fbfd7d7831a9a9982a571b25db489a9"],
  ["1000:666D", 92, "advance-one-wd-line-cell", "4973f02d7589da14ad2c213a77480f578f97c9e614b33a8ce670cbe8bd95a4c4"],
  ["1000:66C9", 119, "finish-wd-line-frames", "17e08806794833f472780fe3889859700354938782451d038a5dbf74e90d17f5"],
  ["1000:7CD8", 275, "render-stage26-column-effect", "53ce41bf79edd898e62666ed7077ef4c60875491daef61e78c3ba6b1011bd7c3"],
  ["1000:7E09", 50, "build-target-to-source-line", "57f93061ccf2d084a954feb739216f4713c025102b451c28118de9eb3430ad43"],
  ["1000:937A", 32, "load-five-graphic-streams", "ec5bfb0e2d9f6298b475754f59eb896f7d68ee6887fea3e76367f9f1476986fc"],
];

const DATA_SIGNATURES = [
  [0x17ca, 0x182e, "shared-line-descriptors", "7cda2b5492851fe92d42a9bd5c8f968581f528b6dfbdccc1706dcd6c94de60a5"],
  [0x68a6, 0x68c8, "wd-descriptor-pointer-table-and-dynamic-descriptor", "1193bae39ea776af030d3cf49063d72ea461fe9a27a4f1c019ce44291d291ba6"],
  [0x724c, 0x73c2, "stage26-descriptor-tables-and-moving-column-descriptors", "9e3630cc45a3daeb7f58e33188771ae31dab249be72d871ed9d5f183c693bc0e"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function linearAddress(address) {
  const match = /^([0-9A-F]{4}):([0-9A-F]{4})$/i.exec(address);
  assert(match !== null, `invalid segmented address ${address}`);
  return Number.parseInt(match[1], 16) * 16 + Number.parseInt(match[2], 16);
}

function checkedSlice(buffer, start, end, label) {
  assert(start >= 0 && end >= start && end <= buffer.length,
    `${label}: ${start}..${end} outside ${buffer.length}-byte source`);
  return buffer.subarray(start, end);
}

function dsWord(buffer, offset) {
  return checkedSlice(buffer, DATA_LINEAR_BASE + offset, DATA_LINEAR_BASE + offset + 2,
    `DS:${hex(offset)}`).readUInt16LE(0);
}

function dsSignedWord(buffer, offset) {
  return checkedSlice(buffer, DATA_LINEAR_BASE + offset, DATA_LINEAR_BASE + offset + 2,
    `DS:${hex(offset)}`).readInt16LE(0);
}

function decodeDescriptor(buffer, offset) {
  const width = dsWord(buffer, offset + 4);
  const height = dsWord(buffer, offset + 6);
  assert(width > 0 && height > 0 && width * height <= 64,
    `DS:${hex(offset)}: invalid descriptor dimensions ${width}x${height}`);
  const tileCodes = Array.from({ length: width * height }, (_, index) =>
    dsWord(buffer, offset + 8 + index * 2));
  return {
    address: `DS:${hex(offset)}`,
    xOffset: dsSignedWord(buffer, offset),
    yOffset: dsSignedWord(buffer, offset + 2),
    width,
    height,
    tileCodes,
    low7BitFrameIndices: tileCodes.map((code) =>
      code === 0 ? null : (code & 0x7f) - 1),
  };
}

function parsePointerTable(buffer, offset) {
  const pointers = [];
  for (let index = 0; index < 64; index += 1) {
    const pointer = dsWord(buffer, offset + index * 2);
    if (pointer === 0xffff) return pointers;
    pointers.push(pointer);
  }
  throw new Error(`DS:${hex(offset)}: no FFFF terminator`);
}

function verifyCodeSignatures(buffer) {
  return CODE_SIGNATURES.map(([address, bytes, role, expectedSha256]) => {
    const start = linearAddress(address);
    const payload = checkedSlice(buffer, start, start + bytes, role);
    assert(sha256(payload) === expectedSha256, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: start, role, bytes, sha256: expectedSha256 };
  });
}

function verifyDataSignatures(buffer) {
  return DATA_SIGNATURES.map(([start, end, role, expectedSha256]) => {
    const payload = checkedSlice(buffer, DATA_LINEAR_BASE + start, DATA_LINEAR_BASE + end, role);
    assert(sha256(payload) === expectedSha256, `DS:${hex(start)}: ${role} signature mismatch`);
    return {
      address: `DS:${hex(start)}`,
      endExclusive: `DS:${hex(end)}`,
      fileOffset: DATA_LINEAR_BASE + start,
      role,
      bytes: end - start,
      sha256: expectedSha256,
    };
  });
}

function pushOneStage26Unit(sideMap, unitSlotMap, cell) {
  if (sideMap[cell] !== 1) return null;
  for (const delta of [150, 100, 50]) {
    const destination = cell + delta;
    if (sideMap[destination] !== 0) continue;
    sideMap[destination] = sideMap[cell];
    sideMap[cell] = 0;
    unitSlotMap[destination] = unitSlotMap[cell];
    unitSlotMap[cell] = 0;
    return { source: cell, destination, delta, rows: delta / BOARD_WIDTH };
  }
  return null;
}

function runOneStage26Push(sideMapInput, unitSlotMapInput) {
  const sideMap = Uint8Array.from(sideMapInput);
  const unitSlotMap = Uint8Array.from(unitSlotMapInput);
  const firstSide1Cell = sideMap.findIndex((value) => value === 1);
  if (firstSide1Cell < 0) {
    return { sideMap, unitSlotMap, firstSide1Cell: null, originCell: null, scannedCells: [], moves: [] };
  }
  assert(firstSide1Cell >= BOARD_WIDTH,
    "native stage-26 origin loop assumes the first side-1 unit is below row zero");
  let originCell = firstSide1Cell - BOARD_WIDTH;
  while (originCell >= 684) originCell -= BOARD_WIDTH;

  const scannedCells = [];
  const moves = [];
  let cell = originCell + 17 * BOARD_WIDTH;
  for (let index = 0; index < 17; index += 1, cell -= BOARD_WIDTH) {
    scannedCells.push(cell);
    const move = pushOneStage26Unit(sideMap, unitSlotMap, cell);
    if (move !== null) moves.push(move);
  }
  return { sideMap, unitSlotMap, firstSide1Cell, originCell, scannedCells, moves };
}

function validateStage26Simulation(stage26) {
  const sideMap = new Uint8Array(BOARD_CELLS);
  const unitSlotMap = new Uint8Array(BOARD_CELLS);
  for (const unit of stage26.activeUnitInstances) {
    sideMap[unit.cell] = unit.side;
    unitSlotMap[unit.cell] = unit.unitSlot;
  }
  const nativeInitial = runOneStage26Push(sideMap, unitSlotMap);
  assert(nativeInitial.firstSide1Cell === 1569, "unexpected stage-26 first fixed side-1 cell");
  assert(nativeInitial.originCell === 669, "unexpected stage-26 initial effect origin");
  assert(nativeInitial.moves.length === 0,
    "stage-26 fixed starting units should be below the native 17-cell scan band");

  const sampleSide = new Uint8Array(BOARD_CELLS);
  const sampleSlots = new Uint8Array(BOARD_CELLS);
  const column = 19;
  sampleSide[14 * BOARD_WIDTH + column] = 1;
  sampleSlots[14 * BOARD_WIDTH + column] = 4;
  sampleSide[17 * BOARD_WIDTH + column] = 2;
  sampleSlots[17 * BOARD_WIDTH + column] = 40;
  const farthestFirst = runOneStage26Push(sampleSide, sampleSlots);
  assert(farthestFirst.moves.length === 1 && farthestFirst.moves[0].rows === 2,
    "stage-26 push must try +3, then +2, then +1 rows");

  const occupied = new Uint8Array(BOARD_CELLS);
  const occupiedSlots = new Uint8Array(BOARD_CELLS);
  const source = 20 * BOARD_WIDTH + column;
  occupied[source] = 1;
  occupiedSlots[source] = 7;
  for (const delta of [50, 100, 150]) occupied[source + delta] = 2;
  const blocked = runOneStage26Push(occupied, occupiedSlots);
  assert(blocked.moves.length === 0, "fully occupied three-row destination band must block movement");

  return {
    nativeInitialState: {
      firstSide1Cell: nativeInitial.firstSide1Cell,
      originCell: nativeInitial.originCell,
      scanFirstCell: nativeInitial.scannedCells[0],
      scanLastCell: nativeInitial.scannedCells.at(-1),
      moves: nativeInitial.moves,
    },
    testedRules: [
      "the first side-1 cell is selected by row-major scan",
      "the origin is repeatedly shifted one row upward until its unsigned cell number is below 684",
      "17 cells are processed bottom-to-top in the selected column",
      "each side-1 unit tries +3, then +2, then +1 rows and stays when all three cells are occupied",
      "side map and unit-slot map move together",
    ],
  };
}

async function graphicCatalog(extractedRoot, decodedRoot, planarRoot, records) {
  const [extracted, decoded, planar] = await Promise.all([
    readFile(path.join(extractedRoot, "MAGIC/manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(decodedRoot, "MAGIC/manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(planarRoot, "MAGIC/manifest.json"), "utf8").then(JSON.parse),
  ]);
  const expectedFrames = new Map([[14, 11], [19, 10], [21, 30]]);
  const entries = [];
  for (const record of records) {
    const sourceEntry = extracted.records.find((entry) => entry.index === record);
    const decodedEntry = decoded.entries.find((entry) => entry.record === record);
    const planarEntry = planar.entries.find((entry) => entry.record === record);
    assert(sourceEntry !== undefined && !sourceEntry.missing && !sourceEntry.terminator,
      `MAGIC/${record}: extracted record unavailable`);
    assert(decodedEntry?.kind === "five_stream_package",
      `MAGIC/${record}: expected a five-stream graphic package`);
    assert(planarEntry?.rendered, `MAGIC/${record}: rendered frames unavailable`);
    assert(planarEntry.images.length === expectedFrames.get(record),
      `MAGIC/${record}: unexpected rendered frame count`);
    const stem = String(record).padStart(4, "0");
    const sourcePath = path.join(extractedRoot, `MAGIC/${stem}.bin`);
    const payload = await readFile(sourcePath);
    entries.push({
      key: `MAGIC/${record}`,
      record,
      sourcePath,
      sourceBytes: payload.length,
      sourceSha256: sha256(payload),
      decodedKind: decodedEntry.kind,
      decodedStreams: decodedEntry.streams.filter((stream) => stream.present).length,
      renderedFrames: planarEntry.images.length,
      renderedPaths: planarEntry.images.map((image) => path.join(planarRoot, "MAGIC", image.output)),
    });
  }
  return entries;
}

async function contactSheetCatalog(planarRoot) {
  const root = path.join(path.dirname(planarRoot), "contact-sheets/special-effects");
  const specs = [
    ["MAGIC-0019-wd.png", "WD frames 0..9 in row-major order"],
    ["MAGIC-0021-stage26-phase1.png", "stage-26 phase-one frames 0..29 in row-major order"],
    ["MAGIC-0014-stage26-phase2.png", "stage-26 phase-two frames 0..10 in row-major order"],
  ];
  return Promise.all(specs.map(async ([fileName, role]) => {
    const sheetPath = path.join(root, fileName);
    const payload = await readFile(sheetPath);
    return { path: sheetPath, role, bytes: payload.length, sha256: sha256(payload) };
  }));
}

async function extract(modulePath, extractedRoot, decodedRoot, planarRoot, battleTemplatesPath, outputPath) {
  const [buffer, battleTemplates, graphics, contactSheets] = await Promise.all([
    readFile(modulePath),
    readFile(battleTemplatesPath, "utf8").then(JSON.parse),
    graphicCatalog(extractedRoot, decodedRoot, planarRoot, [14, 19, 21]),
    contactSheetCatalog(planarRoot),
  ]);

  const wdPointers = parsePointerTable(buffer, 0x68a6);
  const wdDescriptors = wdPointers.map((pointer) => decodeDescriptor(buffer, pointer));
  const wdTileCodes = wdDescriptors.map((descriptor) => descriptor.tileCodes[0]);
  assert(JSON.stringify(wdTileCodes) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0x82]),
    "unexpected WD descriptor sequence");

  const phase1Pointers = parsePointerTable(buffer, 0x724c);
  const phase2Pointers = parsePointerTable(buffer, 0x7312);
  assert(phase1Pointers.length === 13, "stage-26 phase one must have 13 descriptors");
  assert(phase2Pointers.length === 4, "stage-26 phase two must have four descriptors");
  const movingPointers = [0x735e, 0x736e, 0x7380, 0x7394, 0x73aa];

  const stage26 = battleTemplates.stages.find((entry) => entry.stage === 26);
  assert(stage26 !== undefined && stage26.bRecord === 53,
    "battle template stage 26 / B record 53 is unavailable");
  const simulation = validateStage26Simulation(stage26);

  const wdCode = checkedSlice(buffer, linearAddress("1000:660E"), linearAddress("1000:6740"), "WD code");
  const stage26Code = checkedSlice(buffer, linearAddress("1000:7CD8"), linearAddress("1000:7DEB"), "stage-26 code");
  for (const [name, code] of [["WD", wdCode], ["stage26", stage26Code]]) {
    assert(code.indexOf(Buffer.from([0x9a, 0x20, 0x02, 0x00, 0x00])) < 0,
      `${name}: unexpected direct 0000:0220 audio request`);
    assert(code.indexOf(Buffer.from([0x9a, 0x24, 0x02, 0x00, 0x00])) < 0,
      `${name}: unexpected direct 0000:0224 audio request`);
  }

  const result = {
    format: "ANGEL2 WD and stage-26 special-effect rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      dataLinearBase: DATA_LINEAR_BASE,
      battleTemplates: battleTemplatesPath,
    },
    verifiedCodeSignatures: verifyCodeSignatures(buffer),
    verifiedDataSignatures: verifyDataSignatures(buffer),
    wd: {
      actionCode: "WD",
      users: [
        { classCode: "0P", className: "女帝" },
        { classCode: "1P", className: "龍" },
      ],
      aiBinding: {
        effectHandler: "0000:CCD2",
        targetGroup: "enemy",
        selectionRadius: 10,
        source: "DS:77BF",
        selectedTarget: "DS:77C1",
      },
      path: {
        builder: "1000:7E09",
        order: "selected target at list index 0, followed by predecessor cells through the source/caster",
        growthOrder: "walk backward from the last nonzero list entry/source to index 0/selected target",
        equalPredecessorTieBreak: "inherits the PIT-influenced direction order in 1000:7E5C",
      },
      damage: {
        requestedPerEligibleLineCell: 90,
        operation: "0000:6438 invokes the one-point map damage helper 90 times for each newly reached path cell",
        eligibleSide: "only units on the same side as the originally selected target; empty cells and the other side are skipped",
        saturation: "each decrement clamps at zero; dead units remain on the board until the final 0000:63CF pass",
        defenseMagic: "state +0C bit15 makes every one-point decrement return without damage; unlike 1V/2V/3V, WD never calls the defense-magic clear helper, so this cast does not consume the shield",
        attackDefenseTerrainStats: "not read by the WD damage loop",
        repeatedCellRule: "each path cell is damaged once during growth; finish frames do not apply damage",
      },
      presentation: {
        graphicResource: "MAGIC/19",
        directAudioRequest: null,
        descriptorPointerTable: "DS:68A6",
        descriptors: wdDescriptors,
        rawTileCodes: wdTileCodes,
        tileCodeBoundary: "1..10 select the ten MAGIC/19 frames; final 82h keeps its high-bit renderer role and low-seven-bit frame index 1",
        waitPerGrowthOrFinishStepNativeTicks: 20,
        finishSteps: wdPointers.length - 1,
        fixedWaitFormulaNativeTicks: `(lineCellCount + ${wdPointers.length - 1}) * 20`,
        synchronization: "a cell takes its 90 one-point damage before that growth frame is flushed; all deaths are removed only after growth and all ten finish steps",
      },
    },
    stage26EnemyPhaseTail: {
      stage: 26,
      battleTemplateRecord: "B/53",
      phaseBoundary: "after normal side-2 AI and before side-2 action bits are reset",
      executionsPerSide2Phase: 2,
      actionOwner: null,
      presentation: {
        wrapper: "0000:CC3B",
        renderer: "1000:7CD8",
        directAudioRequest: null,
        phase1: {
          graphicResource: "MAGIC/21",
          waitPerDescriptorNativeTicks: 15,
          descriptors: phase1Pointers.map((pointer) => decodeDescriptor(buffer, pointer)),
          drawCount: phase1Pointers.length,
          fixedWaitNativeTicks: phase1Pointers.length * 15,
        },
        phase2: {
          graphicResource: "MAGIC/14",
          waitPerDescriptorNativeTicks: 15,
          descriptors: phase2Pointers.map((pointer) => decodeDescriptor(buffer, pointer)),
          drawCount: phase2Pointers.length,
          fixedWaitNativeTicks: phase2Pointers.length * 15,
        },
        downwardColumnSweep: {
          waitPerDrawNativeTicks: 5,
          descriptors: movingPointers.map((pointer) => decodeDescriptor(buffer, pointer)),
          sequence: [
            "draw DS:735E, 736E, 7380 and 7394 once each while advancing the effect origin by +50 after every draw",
            "draw DS:73AA 15 times through 0000:6548, advancing +50 after every draw",
            "draw DS:73AA seven more times through 0000:64B7, advancing +50 after every draw",
          ],
          drawCount: 4 + 15 + 7,
          fixedWaitNativeTicks: (4 + 15 + 7) * 5,
        },
        totalFixedWaitPerExecutionNativeTicks:
          phase1Pointers.length * 15 + phase2Pointers.length * 15 + (4 + 15 + 7) * 5,
        settlementBoundary: "0000:63CF clears the presentation before 1000:24B4 mutates the two board maps; the new unit positions first become visible on a later normal redraw",
      },
      columnSelectionAndMovement: {
        selection: "scan all 2500 cells in row-major order and take the first side-1 cell; if none exists, return without presentation or movement",
        origin: "subtract 50 at least once, then continue until the unsigned cell value is below 684; this preserves the selected column near rows 12/13",
        scannedBand: "start at origin+850 and process 17 cells bottom-to-top, excluding the origin itself",
        eligibleUnits: "side 1 only",
        destinationPriority: ["source+150 (three rows down)", "source+100 (two rows down)", "source+50 (one row down)"],
        blockedRule: "do not move when all three candidate cells are occupied",
        mutation: "copy both side-map and unit-slot-map bytes to the chosen destination, then clear both source bytes",
        scanOrderConsequence: "bottom-to-top processing prevents a unit moved downward from being processed a second time during the same execution",
        damage: 0,
        statuses: "not read or changed",
        simulation,
      },
    },
    resourceCatalog: {
      graphicEntries: graphics,
      audioEntries: [],
      contactSheets,
    },
    evidenceBoundary: {
      confirmed: "WD target filtering, per-cell damage, defense-magic behavior, path/descriptor timing and resource; stage-26 trigger count, presentation resources/timing, column selection and exact two-map movement",
      preservedUnknown: "PIT sampling distribution for equal WD path predecessors and original player-facing names beyond internal code WD; the released nominal native timer tick is 10.000151 ms",
      implementation: "frozen until the phase-1 GDD review passes",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted WD/stage26 rules: ${result.verifiedCodeSignatures.length} code signatures, ` +
    `${result.verifiedDataSignatures.length} data signatures, ${graphics.length} graphics, ` +
    `${contactSheets.length} contact sheets`,
  );
  return result;
}

function usage() {
  return "usage: angel2-wd-stage26.mjs --extract MODULE29 EXTRACTED_ROOT DECODED_ROOT " +
    "PLANAR_ROOT BATTLE_TEMPLATES OUTPUT_JSON";
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode !== "--extract" || args.length !== 6) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { decodeDescriptor, extract, pushOneStage26Unit, runOneStage26Push };
