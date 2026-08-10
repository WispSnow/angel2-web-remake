#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;
const BOARD_WIDTH = 50;
const BOARD_CELLS = 2500;
const PATH_WORD_CAPACITY = 100;

const CODE_SIGNATURES = [
  ["1000:1595", 0x11595, 0x115ef, "AI class-priority scheduler", "01be904e0ac0ee61a1be8a3a138fa9276e71e1a17726fb1136de5c787d6076ef"],
  ["1000:1AF8", 0x11af8, 0x11b56, "behavior-12 route", "f72a7d9ea7d7305d1d8e16e349785cf0adacf8e269ef2d4c0dc30fc9ae3644e9"],
  ["1000:1B56", 0x11b56, 0x11bbe, "behavior-12 stage goal selector", "0b77f5ea48f4ca135af94a2d1331a8fbc2f7709e30180856a716cc121968bd6f"],
  ["1000:1BBE", 0x11bbe, 0x11bd9, "stage-4 effect wrapper", "8e2ed51e5acabd7502d3588ea5cc2368ca2fde22ba361b9a35f9e898fcb5e897"],
  ["1000:2032", 0x12032, 0x12044, "mark current AI cell acted", "cc4bf6e67ff10549383afcdc2b0a434949f8d76b1f80715873c6ea08217648dd"],
  ["1000:240F", 0x1240f, 0x12424, "range-builder VGA rectangle copy tail", "cf1f4077727a7eda840531c5a154fabe54681eb6911136f19f7a371fc24fb098"],
  ["1000:3A8C", 0x13a8c, 0x13af5, "range propagation and presentation tail", "52fb564ee72e54956a516dcec3d7a088b5814707b5396f681f5b3efb6981deb2"],
  ["0000:633D", 0x0633d, 0x06392, "prepare stage-4 range effect", "57c332650e986295fa8161aa15028208637865821f6d1a148b91f4778bb0e946"],
  ["0000:63CF", 0x063cf, 0x06410, "finalize effect and remove zero-life units", "7a90c7afbe41f173b7330cd142b5adb42c0938d46f710e56ddd2d47305d1fff2"],
  ["0000:6599", 0x06599, 0x065a5, "clear effect layer and run the sweep writer over the window", "b37a3e5958dd34678bec7e286bbb102ce228e0cab81cccbc7d84eb03efdc4544"],
  ["0000:65A5", 0x065a5, 0x065cd, "sweep writer: range value minus threshold, no side or occupancy test", "37c5a5d84317f20d975f308923cfcb495361656ca920d242abae0e872b691486"],
  ["0000:97DC", 0x097dc, 0x09821, "10x7 camera-window iterator", "0aca5c7ceceb1ed2f0761221e52554b2e686018417c99b64a417b302c5c4fd71"],
  ["0000:9821", 0x09821, 0x09851, "per-cell dispatch with BL = range byte", "6c39636a0118b57843f0973f02155c1d8a19db3cb373d46b00cda233ddd7c8f7"],
  ["1000:6CF8", 0x16cf8, 0x16d39, "load and run stage-4 life-halving effect", "d48875ed31ab3d378b733dbe4584662232175bc7a3bfee735ba7b9328dd8c010"],
  ["1000:6D40", 0x16d40, 0x16d4c, "stage-4 wave, halve, finalize", "40ff2c902ef61a30cbd371d12bbe3e26b17d26c7276225b58670a5e3c5c11346"],
  ["1000:6D4C", 0x16d4c, 0x16d94, "lightning range wave", "5a560aea86334493894db590984fcc90597625a5e1c6bf7c49ed36ce00e3df5e"],
  ["1000:6E25", 0x16e25, 0x16e46, "find range maximum minus one", "d6ec564f023b740a3beb5506c00411a97abeda7c05fcd1fbd4c72f1835a2e847"],
  ["1000:6E46", 0x16e46, 0x16e88, "draw wave on matching occupied cells", "5366efea15e596ae811b3e85e8bd82801ac42428615d9388a6ad65c835cb7c22"],
  ["1000:6E88", 0x16e88, 0x16ea9, "invert zero and nonzero range cells", "78f7ab26b0ef65a7c04eab29e0ef9075c991b36aab87290efc846841b9d8fb41"],
  ["1000:6EA9", 0x16ea9, 0x16edf, "halve matching side-1 unit life", "ac60dd9485b30b1fff7835585fe6174b0cc6d3f11d401fadd5bd6f9785dc00a0"],
  ["1000:7E09", 0x17e09, 0x17e3b, "build target-to-source path", "57f93061ccf2d084a954feb739216f4713c025102b451c28118de9eb3430ad43"],
  ["1000:7E3B", 0x17e3b, 0x17e5c, "emit gradient path entries", "7c2737c3ec6e5418ba56c237549205d1ebb7bf63473c7b922fd45d732da9ab6b"],
  ["1000:7E5C", 0x17e5c, 0x17ec9, "choose PIT-ordered gradient neighbors", "7f32c38e63cc8be4683179ddfdef0a06f26b21d184c8d4dab98221dc93f46f90"],
  ["1000:7EFB", 0x17efb, 0x17f12, "accept equal-or-higher gradient neighbor", "a27eb7b298d4a02dbe418121e5cf2be8f0a73cf1efc97c8eaa3dd297c64ba63f"],
  ["1000:7F12", 0x17f12, 0x17f22, "clear 100-word path list", "6c1639de8b0312b6ca9f438b67117c208f8b2d4e3918a27e55d004bb4446f40a"],
  ["1000:7F4A", 0x17f4a, 0x17f72, "scripted movement wrapper", "bc9b09dae18a56aaeb6f1fd4f8e8e90056f7a6acf1a5edc5434731b3a5b1fe22"],
  ["1000:7F72", 0x17f72, 0x18069, "path animation with E/14", "0d09bc21c82ec87ac63296b0456c392ec623f5cd01d0b1aae888e169b6131880"],
  ["1000:828F", 0x1828f, 0x18329, "fallback to reachable empty path cell", "2640d5fd7fde8f1b53dcd067ceff92c61c4b9a438696492bf389818dcc89d03e"],
  ["0000:D4EE", 0x0d4ee, 0x0d597, "VGA rectangle copy that leaves DI advanced", "e1084ba2522b87160a597b6bf72fa7c6501f9e6a76508d9497268d7b88cb22b0"],
  ["0000:FFF0", 0x0fff0, 0x1001a, "three adjacent 2500-byte grid segment pointers", "bb4ad7d9730dc3a6c71415d4b46e2e041e3a3f080522ee4c27f6413b79802bfd"],
];

const DATA_SIGNATURES = [
  ["DS:D8A", DATA_LINEAR_BASE + 0x0d8a, DATA_LINEAR_BASE + 0x0d9a, "80x44 VGA copy descriptor", "d27d068f360bdbdc014b9b2dd0ba0d8944304fbd49dcff9974c864df6692a474"],
  ["CS:034F", 0x10000 + 0x034f, 0x10000 + 0x0359, "bytes immediately after the 100-word path list", "85e7b4c0eff587dcf10918f1b8452187e873a95d157334cc7273225059657e2e"],
  ["SEG:2FE9", 0x2fe90, 0x2fe90 + BOARD_CELLS, "third unused zero grid", "3debe114d12fa2726ed5d9e4668db3791241297d3a2bb3a00a130f5a9c607cdc"],
];

const PIT_DIRECTION_ORDERS = [
  [-50, -1, 50, 1],
  [1, 50, -1, -50],
  [-1, 50, 1, -50],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function checkedSlice(buffer, start, end, label) {
  assert(start >= 0 && end >= start && end <= buffer.length,
    `${label}: ${start}..${end} outside ${buffer.length}-byte source`);
  return buffer.subarray(start, end);
}

function verifySignatures(buffer, specs) {
  return specs.map(([address, start, end, role, expectedSha256]) => {
    const payload = checkedSlice(buffer, start, end, role);
    assert(sha256(payload) === expectedSha256, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: start, bytes: end - start, role, sha256: expectedSha256 };
  });
}

function stageTerrain(stage, decodedRoot) {
  return readFile(path.join(decodedRoot, stage.decodedRecordPath));
}

function tokenSlotMap(terrainTokens, stageMapping) {
  const mapping = new Map(stageMapping.configuredMappings.map((entry) => [entry.token, entry.logicalSlot]));
  return Array.from(terrainTokens, (token) => {
    const slot = mapping.get(token);
    assert(slot !== undefined, `stage ${stageMapping.stage}: terrain token ${token} has no logical slot`);
    return slot;
  });
}

function buildRangeMap({ origin, seed, terrainSlots, movementRules, sideMap = null, weighted = false }) {
  const range = new Uint8Array(0x10000);
  range[origin] = seed;
  let changed = true;
  while (changed) {
    changed = false;
    for (const reverse of [false, true]) {
      for (let cursor = 0; cursor < BOARD_CELLS; cursor += 1) {
        const cell = reverse ? BOARD_CELLS - 1 - cursor : cursor;
        const current = range[cell];
        if (current === 0) continue;
        for (const neighbor of [cell - 50, cell - 1, cell + 50, cell + 1]) {
          if (neighbor < 0 || neighbor >= BOARD_CELLS) continue;
          const rule = movementRules[terrainSlots[neighbor]];
          if (rule === 99 || (weighted && rule === 98)) continue;
          if (weighted && sideMap !== null && sideMap[neighbor] !== 0 && (sideMap[neighbor] & 0x7f) !== 1) continue;
          const candidate = current - (weighted ? rule : 1);
          if (candidate > 0 && candidate > range[neighbor]) {
            range[neighbor] = candidate;
            changed = true;
          }
        }
      }
    }
  }
  return range;
}

function traceGradient(range, start, residuePattern, maximumEntries = 500) {
  assert(residuePattern.length > 0 && residuePattern.every((value) => value >= 0 && value <= 2),
    "PIT residue pattern must contain only 0, 1, or 2");
  const cells = [];
  let cell = start;
  for (let index = 0; index < maximumEntries; index += 1) {
    cells.push(cell);
    let best = range[cell];
    let next = null;
    const residue = residuePattern[index % residuePattern.length];
    for (const delta of PIT_DIRECTION_ORDERS[residue]) {
      const neighbor = (cell + delta + 0x10000) & 0xffff;
      const value = range[neighbor];
      if (value >= best) {
        best = value;
        next = neighbor;
      }
    }
    if (next === null) {
      return {
        terminated: true,
        entries: cells.length,
        exceedsNativePathCapacity: cells.length > PATH_WORD_CAPACITY,
        endCell: cell,
        cells,
      };
    }
    cell = next;
  }
  return {
    terminated: false,
    entries: cells.length,
    exceedsNativePathCapacity: cells.length > PATH_WORD_CAPACITY,
    endCell: cell,
    cells,
  };
}

function findFallbackDestination(pathCells, movementRange, sideMap) {
  for (let pathIndex = 0; pathIndex < pathCells.length; pathIndex += 1) {
    const cell = pathCells[pathIndex];
    if (movementRange[cell] === 0) continue;
    for (const candidate of [cell, cell + 50, cell - 50, cell + 1, cell - 1]) {
      if (candidate < 0 || candidate >= BOARD_CELLS) continue;
      if (movementRange[candidate] !== 0 && sideMap[candidate] === 0) {
        return { pathIndex, candidate, x: candidate % BOARD_WIDTH, y: Math.floor(candidate / BOARD_WIDTH) };
      }
    }
  }
  return null;
}

function summarizeTrace(trace) {
  return {
    terminated: trace.terminated,
    entries: trace.entries,
    exceedsNativePathCapacity: trace.exceedsNativePathCapacity,
    endCell: trace.endCell,
    firstCells: trace.cells.slice(0, 16),
    lastCells: trace.cells.slice(-16),
  };
}

async function extract(modulePath, decodedRoot, battleTemplatesPath, terrainMapPath, mapRulesPath,
  techniquePresentationsPath, outputPath) {
  const [buffer, templates, terrainMap, mapRules, presentations] = await Promise.all([
    readFile(modulePath),
    readFile(battleTemplatesPath, "utf8").then(JSON.parse),
    readFile(terrainMapPath, "utf8").then(JSON.parse),
    readFile(mapRulesPath, "utf8").then(JSON.parse),
    readFile(techniquePresentationsPath, "utf8").then(JSON.parse),
  ]);
  const stage4 = templates.stages.find((entry) => entry.stage === 4);
  const stage9 = templates.stages.find((entry) => entry.stage === 9);
  const stage4TerrainMap = terrainMap.stages.find((entry) => entry.stage === 4);
  const stage9TerrainMap = terrainMap.stages.find((entry) => entry.stage === 9);
  assert(stage4?.bRecord === 9 && stage9?.bRecord === 19, "stage 4/9 battle template mapping changed");
  assert(stage4TerrainMap?.bRecord === 9 && stage9TerrainMap?.bRecord === 19,
    "stage 4/9 terrain mapping changed");

  const [stage4Raw, stage9Raw] = await Promise.all([
    stageTerrain(stage4, decodedRoot),
    stageTerrain(stage9, decodedRoot),
  ]);
  const stage4Terrain = stage4Raw.subarray(256, 2756);
  const stage9Terrain = stage9Raw.subarray(256, 2756);
  const stage4Slots = tokenSlotMap(stage4Terrain, stage4TerrainMap);
  const stage9Slots = tokenSlotMap(stage9Terrain, stage9TerrainMap);
  const stage4Rules = mapRules.records[6].movementRules;
  const stage9Rules = mapRules.records[5].movementRules;
  assert(mapRules.records[6].name === "魔術士" && mapRules.records[5].name === "咒術師",
    "behavior-12 class/profile binding changed");

  const stage4Actor = stage4.activeUnitInstances.find((unit) => unit.side === 1 && unit.perSlotBehavior === 12);
  const stage9Actor = stage9.activeUnitInstances.find((unit) => unit.side === 1 && unit.perSlotBehavior === 12);
  assert(stage4Actor?.cell === 2075 && stage4Actor.unitSlot === 24,
    "stage-4 behavior-12 actor changed");
  assert(stage9Actor?.cell === 1916 && stage9Actor.unitSlot === 9,
    "stage-9 behavior-12 actor changed");

  const safeRange = buildRangeMap({
    origin: stage4Actor.cell,
    seed: 3,
    terrainSlots: stage4Slots,
    movementRules: stage4Rules,
  });
  const safeCells = Array.from({ length: BOARD_CELLS }, (_, cell) => cell)
    .filter((cell) => safeRange[cell] !== 0)
    .map((cell) => ({ cell, x: cell % BOARD_WIDTH, y: Math.floor(cell / BOARD_WIDTH), rangeValue: safeRange[cell] }));
  const safeSet = new Set(safeCells.map((entry) => entry.cell));
  const deploymentCells = stage4.deployment.cells.map((entry) => ({
    ...entry,
    safeFromFirstEffect: safeSet.has(entry.cell),
  }));
  assert(safeCells.length === 13, `expected 13 stage-4 seed-3 safe cells, got ${safeCells.length}`);
  assert(deploymentCells.filter((entry) => !entry.safeFromFirstEffect).map((entry) => entry.cell).join(",") === "2023,2027",
    "stage-4 initial unsafe deployment cells changed");

  const descriptor = Array.from({ length: 8 }, (_, index) =>
    buffer.readUInt16LE(DATA_LINEAR_BASE + 0x0d8a + index * 2));
  assert(JSON.stringify(descriptor) === JSON.stringify([0, 0, 80, 44, 0, 0, 0xa800, 0xa000]),
    "DS:D8A VGA rectangle descriptor changed");
  const byteWidth = descriptor[2] / 8;
  const staleDi = (descriptor[3] - 1) * 80 + byteWidth;
  assert(staleDi === 3450, `unexpected stale DI ${staleDi}`);
  const rangeSegment = 0x2f4c;
  const unusedSegment = 0x2fe9;
  const relativeToUnusedGrid = rangeSegment * 16 + staleDi - unusedSegment * 16;
  assert(relativeToUnusedGrid === 938, `unexpected third-grid relative offset ${relativeToUnusedGrid}`);
  const unusedGrid = checkedSlice(buffer, unusedSegment * 16, unusedSegment * 16 + BOARD_CELLS, "unused grid");
  assert(unusedGrid.every((value) => value === 0), "third unused grid is no longer zero-initialized");

  const nominalStage9Origin = 884;
  const sideMap = Uint8Array.from(stage9Raw.subarray(5256, 7756));
  sideMap[stage9Actor.cell] = 0;
  sideMap[nominalStage9Origin] = 1;
  for (let cell = 0; cell < BOARD_CELLS; cell += 1) {
    if (sideMap[cell] === 0xff) sideMap[cell] = 0;
  }
  const farRange = buildRangeMap({
    origin: nominalStage9Origin,
    seed: 50,
    terrainSlots: stage9Slots,
    movementRules: stage9Rules,
  });
  const movementRange = buildRangeMap({
    origin: nominalStage9Origin,
    seed: 7,
    terrainSlots: stage9Slots,
    movementRules: stage9Rules,
    sideMap,
    weighted: true,
  });
  const traceSpecs = [
    { id: "repeat_012", residues: [0, 1, 2] },
    { id: "repeat_01", residues: [0, 1] },
    { id: "repeat_001", residues: [0, 0, 1] },
    { id: "constant_0", residues: [0] },
  ];
  const traces = traceSpecs.map((spec) => {
    const trace = traceGradient(farRange, staleDi, spec.residues);
    const fallback = trace.terminated && !trace.exceedsNativePathCapacity
      ? findFallbackDestination(trace.cells, movementRange, sideMap)
      : null;
    return { ...spec, ...summarizeTrace(trace), nominalFallbackDestination: fallback };
  });
  assert(traces[0].entries === 87 && traces[0].endCell === nominalStage9Origin &&
    traces[0].nominalFallbackDestination?.candidate === 880,
  "stage-9 repeat-012 reference trace changed");
  assert(traces[1].entries === 87 && traces[1].nominalFallbackDestination?.candidate === 834,
    "stage-9 repeat-01 reference trace changed");
  assert(traces[2].entries === 138 && traces[2].exceedsNativePathCapacity,
    "stage-9 repeat-001 overflow trace changed");
  assert(!traces[3].terminated && traces[3].exceedsNativePathCapacity,
    "stage-9 constant-zero nontermination trace changed");

  const magic26 = presentations.resourceCatalog.graphicEntries.find((entry) => entry.key === "MAGIC/26");
  const magic26ContactSheet = presentations.resourceCatalog.contactSheets.find((entry) =>
    entry.path.includes("MAGIC-0026"));
  assert(magic26?.decodedStreams === 5 && magic26.renderedFrames === 13,
    "MAGIC/26 catalog entry changed");
  assert(magic26ContactSheet !== undefined, "MAGIC/26 contact sheet is unavailable");
  const effectCode = checkedSlice(buffer, 0x16cf8, 0x16edf, "stage-4 effect code");
  for (const call of [Buffer.from([0x9a, 0x20, 0x02, 0x00, 0x00]), Buffer.from([0x9a, 0x24, 0x02, 0x00, 0x00])]) {
    assert(effectCode.indexOf(call) < 0, "stage-4 effect unexpectedly makes a direct VOC request");
  }
  // The wave at 1000:6D4C is shared with every lightning technique: each of the two
  // draws per iteration calls the sweep writer far (0000:6599) and then the marker
  // writer near (1000:6E46). Locking the call sites keeps the two-layer claim byte-checked
  // here instead of relying on the technique audit alone.
  const waveCode = checkedSlice(buffer, 0x16d4c, 0x16d94, "shared lightning wave");
  const sweepCall = Buffer.from([0x9a, 0x99, 0x65, 0x00, 0x00]);
  const markerCalls = [
    [0x16d6d, Buffer.from([0xe8, 0xd6, 0x00])],
    [0x16d84, Buffer.from([0xe8, 0xbf, 0x00])],
  ];
  assert(waveCode.indexOf(sweepCall) === 0x16d62 - 0x16d4c
    && waveCode.indexOf(sweepCall, 0x16d63 - 0x16d4c) === 0x16d79 - 0x16d4c,
    "shared wave no longer calls the sweep writer twice per iteration");
  for (const [offset, opcode] of markerCalls) {
    assert(checkedSlice(buffer, offset, offset + opcode.length, "marker call").equals(opcode)
      && offset + opcode.length + opcode.readInt16LE(1) === 0x16e46,
      `shared wave marker call at ${offset.toString(16)} no longer targets 1000:6E46`);
  }
  // 1000:6E46 filters on DS:1EF6h, but nothing on the behavior-12 path writes it, so the
  // marker side is whatever the previous attack or technique left behind. The damage pass
  // at 1000:6EC4 hardcodes side 1 instead.
  const targetedSideWrites = [
    [0x0633d, 0x06392], [0x06599, 0x065cd], [0x097dc, 0x09851],
    [0x064a1, 0x064ac], [0x063cf, 0x06410], [0x16cf8, 0x16edf], [0x11bbe, 0x11bd9],
  ].flatMap(([start, end]) => {
    const region = checkedSlice(buffer, start, end, "behavior-12 chain");
    return [
      Buffer.from([0xa3, 0xf6, 0x1e]), Buffer.from([0xc6, 0x06, 0xf6, 0x1e]),
      Buffer.from([0xc7, 0x06, 0xf6, 0x1e]), Buffer.from([0x88, 0x06, 0xf6, 0x1e]),
      Buffer.from([0x88, 0x16, 0xf6, 0x1e]), Buffer.from([0x88, 0x1e, 0xf6, 0x1e]),
      Buffer.from([0x88, 0x26, 0xf6, 0x1e]),
    ].filter((pattern) => region.indexOf(pattern) >= 0).map(() => start);
  });
  assert(targetedSideWrites.length === 0,
    "the behavior-12 chain now writes DS:1EF6h; the marker side is no longer stale");
  assert(checkedSlice(buffer, 0x16ec4, 0x16ec6, "damage side test").equals(Buffer.from([0x3c, 0x01])),
    "stage-4 damage pass no longer hardcodes side 1");
  const stage4Wave = {
    invertedRangeMaximum: 1,
    rangeMaximumMinusOne: 0,
    rangeThresholdStart: 0,
    rangeThresholdDecrementPerDraw: 1,
    sweepWidth: 11,
    iterations: 11,
    drawsPerIteration: 2,
    waitPerDrawNativeTicks: 2,
  };
  const stage4WaveDraws = stage4Wave.iterations * stage4Wave.drawsPerIteration;
  const stage4VisibleDraws = Array.from({ length: stage4WaveDraws }, (_, draw) => {
    const threshold = stage4Wave.rangeThresholdStart
      - draw * stage4Wave.rangeThresholdDecrementPerDraw;
    const distance = stage4Wave.invertedRangeMaximum - threshold;
    return distance >= 0 && distance <= stage4Wave.sweepWidth;
  }).filter(Boolean).length;
  assert(stage4VisibleDraws === 11 && stage4WaveDraws - stage4VisibleDraws === 11,
    "stage-4 visible wave and blank tail changed");

  const result = {
    format: "ANGEL2 behavior-12 stage-4 effect and stage-9 stale-DI audit",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    evidenceLevel: "C for code/data mechanics; PIT-visible stage-9 outcome remains timing-dependent",
    source: {
      module: modulePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      battleTemplates: battleTemplatesPath,
      terrainTokenMap: terrainMapPath,
      mapRules: mapRulesPath,
      techniquePresentations: techniquePresentationsPath,
    },
    verifiedCodeSignatures: verifySignatures(buffer, CODE_SIGNATURES),
    verifiedDataSignatures: verifySignatures(buffer, DATA_SIGNATURES),
    stage4: {
      stage: 4,
      actor: stage4Actor,
      routeGoalCell: 125,
      movementOverride: 3,
      effectRunsAfterEveryBehavior12MovementAttempt: true,
      preparation: {
        centerCell: "post-attempt DS:1F16 actor cell",
        mode: "0",
        seed: 3,
        propagation: "uniform cost 1; no occupancy filtering; current class movement-rule value 99 remains impassable",
        passedButUnusedCx: 40,
      },
      safeRegion: {
        rule: "pre-inversion nonzero cells are safe; with uniform terrain this is path cost <= 2 from the actor",
        initialActorCell: stage4Actor.cell,
        cells: safeCells,
        initialFixedSide1Units: stage4.activeUnitInstances
          .filter((unit) => unit.side === 1)
          .map((unit) => ({ ...unit, safeFromFirstEffect: safeSet.has(unit.cell) })),
        deploymentCells,
      },
      presentation: {
        resource: magic26,
        contactSheet: magic26ContactSheet,
        runtimeTileCodes: [12, 13],
        ...stage4Wave,
        visibleDraws: stage4VisibleDraws,
        blankTailDraws: stage4WaveDraws - stage4VisibleDraws,
        fixedGraphicWaitNativeTicks: stage4WaveDraws * stage4Wave.waitPerDrawNativeTicks,
        directVocRequest: null,
        cleanupGraphicResource: null,
        sharedWaveRoutine: "1000:6D4C, the same routine every lightning technique uses",
        drawLayers: {
          sweep: "0000:6599 -> 0000:97DC -> 0000:65A5 clears the DS:58A5h 10x7 effect layer and writes `rangeValue - threshold` as the sprite code for every cell of the visible camera window whose inverted range byte is nonzero; 0000:7EDD renders frame `code - 1` and draws nothing for code 0. No side and no occupancy test, so the whole on-screen area outside the barrier flashes. Every inverted cell holds 1, so all of them advance through frames 0..10 in lockstep",
          marker: "1000:6E46 overlays runtimeTileCodes 12/13 (frames 11/12, the MAGIC/26 electrocuted-character art) on cells inside the same band whose side byte equals DS:1EF6h. Two independent reasons keep it off screen in the shipped build: the band test at 1000:6E5F compares AX while AH still holds the range-map segment's high byte, and nothing on the behavior-12 path ever writes DS:1EF6h",
        },
      },
      resolution: {
        targetFilter: "side map byte exactly 1 and inverted range byte nonzero",
        lifeFormula: "currentLife = floor(currentLife / 2)",
        defenseMagic: "not read or consumed",
        otherCombatStats: "attack, defense, terrain defense, max life, and experience are not used",
        death: "the common finalizer immediately removes units reduced from 1 life to 0",
      },
    },
    stage9: {
      stage: 9,
      actor: stage9Actor,
      movementOverride: 7,
      waypointThresholds: [
        { actorCellAtLeast: 1316, goalCell: 1266 },
        { actorCellAtLeast: 1184, goalCell: 1134 },
        { actorCellAtLeast: 934, goalCell: 884 },
        { actorCellBelow: 934, effect: "write DS:2F83=999 without assigning DI" },
      ],
      staleRegisterMechanism: {
        rangeBuilderTail: "1000:3A8C -> 1000:240F -> 0000:D4EA/D4EE",
        vgaCopyDescriptor: {
          address: "DS:D8A",
          sourceX: "focused grid x plus 40, wrapped by subtracting 96; always byte-aligned",
          sourceY: "focused grid y",
          widthPixels: descriptor[2],
          heightRows: descriptor[3],
          destinationX: descriptor[4],
          destinationY: descriptor[5],
          sourceSegment: descriptor[6],
          destinationSegment: descriptor[7],
        },
        returnedDi: staleDi,
        formula: `(44 - 1) * 80 + ${byteWidth} = ${staleDi}`,
        boardDomain: "0..2499",
        staleDiIsOutsideBoard: true,
      },
      adjacentGridLayout: {
        terrainGridSegment: "2EAF",
        rangeGridSegment: "2F4C",
        unusedThirdGridSegment: "2FE9",
        paragraphStride: "009Dh = 2512 bytes for each 2500-byte grid plus 12 bytes padding",
        stalePhysicalLocation: `SEG:2FE9 + ${relativeToUnusedGrid}`,
        initialByte: unusedGrid[relativeToUnusedGrid],
        thirdGridDirectConsumers: 0,
      },
      pathBug: {
        builder: "1000:7E09/7E3B/7E5C/7EFB",
        list: { segment: "CS", offset: "028B", capacityWords: PATH_WORD_CAPACITY, boundsCheck: false },
        pitResidue: "CS:00E9 = (CS:00E9 + PIT channel-0 byte) mod 3",
        directionOrders: PIT_DIRECTION_ORDERS.map((deltas, residue) => ({ residue, deltas })),
        comparison: "a neighbor is accepted when neighborRange >= currentBest; equal zero therefore moves through the adjacent zero grid",
        consequences: [
          "a terminating trace can re-enter the live 2500-byte range map, after which 1000:828F chooses a reachable empty cell and rebuilds a normal movement path",
          "the rebuilt path uses 1000:7F4A/7F72 and therefore can visibly play E/14 and move the actor once more after victory 999 was written",
          "a trace longer than 100 entries overwrites CS memory beginning at 0353h; native behavior after that point is not safely reproducible as a bounded gameplay rule",
        ],
        deterministicReferenceTraces: traces,
        nominalTraceAssumptions: "actor has reached waypoint cell 884; unfilled deployment markers are empty; other units retain the static stage-9 template positions",
      },
      settlementTiming: {
        scheduler: "the normal AI scheduler completes unless an objective evaluator independently requests an early stop",
        flagTransition: "999 becomes 1000 only when 0000:4DCD begins the next full round",
        visibleBoundary: "a successful stale-path fallback can move first; remaining autonomous/enemy processing may occur before 1000 reaches the standard settlement branch",
      },
      reproductionPolicy: {
        originalEvidence: "preserve the stale-DI and unbounded-path facts in the archaeology/GDD layer",
        safeCompatibilityDefault: "recommended later implementation: on actorCell < 934, set victory 999 and consume the action without invoking the stale path builder",
        optionalBugMode: "only a diagnostic native-bug mode should emulate the adjacent-memory walk and path overflow; do not make web memory corruption part of normal gameplay",
      },
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted behavior-12 stage 4/9 audit with ${result.verifiedCodeSignatures.length} code and ${result.verifiedDataSignatures.length} data signatures to ${outputPath}`);
}

function usage() {
  return "usage: angel2-behavior12-effects.mjs --extract MODULE29.bin DECODED-B-DIR BATTLE-TEMPLATES.json TERRAIN-TOKEN-MAP.json MAP-RULES.json TECHNIQUE-PRESENTATIONS.json OUTPUT.json";
}

async function main() {
  const [mode, modulePath, decodedRoot, battleTemplatesPath, terrainMapPath, mapRulesPath,
    techniquePresentationsPath, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) throw new Error(usage());
  await extract(modulePath, decodedRoot, battleTemplatesPath, terrainMapPath, mapRulesPath,
    techniquePresentationsPath, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { buildRangeMap, extract, findFallbackDestination, traceGradient };
