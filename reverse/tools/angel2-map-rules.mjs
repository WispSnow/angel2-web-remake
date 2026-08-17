#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const RECORD_COUNT = 39;
const RECORD_BYTES = 96;
const SERIALIZED_WORDS = 24;
const LOGICAL_TERRAIN_SLOTS = 23;
const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const MOVEMENT_PROFILE_TABLE = 0x1f1c;
const DEFENSE_PROFILE_TABLE = 0x26ba;
const PROFILE_ENTRY_BYTES = 4;
const PROFILE_STRIDE_BYTES = LOGICAL_TERRAIN_SLOTS * 2;
const RANGE_CODE_SEGMENT_LINEAR_BASE = 0x139d0;
const RANGE_CALLBACK_NEAR_OFFSET = 0x01cd;
const RANGE_CALLBACK_LINEAR_OFFSET =
  RANGE_CODE_SEGMENT_LINEAR_BASE + RANGE_CALLBACK_NEAR_OFFSET;
const EXPECTED_MODULE_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";

const EXPECTED_RANGE_MODE_IMMEDIATE_WRITES = [
  [0x062c5, 0x0030], [0x0636b, 0x0030], [0x06a01, 0x004d],
  [0x06e9f, 0x004d], [0x072bd, 0x0032], [0x0733e, 0x004d],
  [0x07345, 0x0030], [0x0748b, 0x0030], [0x0763b, 0x0030],
  [0x076c6, 0x004d], [0x11ff7, 0x0032], [0x1219a, 0x0041],
  [0x13fb1, 0x0032], [0x13fef, 0x0030], [0x14006, 0x0030],
  [0x1407e, 0x0032], [0x140c2, 0x0030], [0x1434d, 0x4d46],
  [0x14403, 0x4d46], [0x145a9, 0x4d46], [0x145f7, 0x4d46],
  [0x146d4, 0x4d46], [0x14aaa, 0x4d46], [0x14b1d, 0x4d46],
  [0x14bf9, 0x4d46], [0x14cc3, 0x4d46], [0x14cfd, 0x4d46],
];

const EXPECTED_RANGE_MODE_AX_WRITES = [
  0x11b03, 0x11b26, 0x11c12, 0x11c45, 0x11c79, 0x11cab,
  0x11ce1, 0x11d0f, 0x11d6b, 0x12048, 0x12091, 0x120e3,
  0x12110, 0x12131, 0x12197, 0x121d8,
];

const SCRIPTED_FM_WRITERS = [
  ["1000:434D", 0x1434d, 0],
  ["1000:4403", 0x14403, 1],
  ["1000:45A9", 0x145a9, 42],
  ["1000:45F7", 0x145f7, 42],
  ["1000:46D4", 0x146d4, 6],
  ["1000:4AAA", 0x14aaa, 20],
  ["1000:4B1D", 0x14b1d, 20],
  ["1000:4BF9", 0x14bf9, 21],
  ["1000:4CC3", 0x14cc3, 22],
  ["1000:4CFD", 0x14cfd, 22],
];

const EXPECTED_PHASE_BASE_MODE_IMMEDIATE_WRITES = [
  [0x114d8, 0x0059],
  [0x11519, 0x0041],
  [0x11570, 0x0041],
  [0x1168e, 0x0030],
];

const EXPECTED_PHASE_PURSUIT_MODE_IMMEDIATE_WRITES = [
  [0x114df, 0x5946],
  [0x11520, 0x4146],
  [0x11577, 0x4146],
];

const CODE_SIGNATURES = [
  {
    address: "0000:1C45",
    offset: 0x1c45,
    hex: "b91800f3a5c3",
    meaning: "MAP serializer copies 24 words per window",
  },
  {
    address: "1000:4186",
    offset: 0x14186,
    hex: "8bebbb1c1fa1430d3b07740583c304ebf783c3028b1f03dd8b07c3",
    meaning: "first profile table lookup at DS:1F1C",
  },
  {
    address: "1000:41A1",
    offset: 0x141a1,
    hex: "8bebbbba26a1430d3b07740583c304ebf783c3028b1f03dd8b07cb",
    meaning: "second profile table lookup at DS:26BA",
  },
  {
    address: "1000:3EC6",
    offset: 0x13ec6,
    hex: "538bf003f68bb47d2e06a126008ec033db268a1c0703dbe8a6025bc3",
    meaning: "board terrain token resolves to a logical slot and then the first profile",
  },
  {
    address: "0000:946A",
    offset: 0x946a,
    hex: "a1a7018ec033db268a1d03db8b9f7d2e06a126008ec033c0268a07078bd803db9ad1079d13c3",
    meaning: "board terrain token resolves to a logical slot and then the second profile",
  },
  {
    address: "1000:000E",
    offset: 0x1000e,
    hex: "c7062600c031",
    meaning: "module initialization assigns runtime segment 31C0h to terrain-resource page pointer DS:0026",
  },
  {
    address: "0000:4D65",
    offset: 0x4d65,
    hex: "8b1680f881c200088bc28ec0bf0000b93800bb0d00e815b08b1680f881c20008bf0000a180f88ec0be00008bc28ed89a79343d19b8ba1e8ed81ea126008ec0a180f88ed8be000033ffb99808f3a41f1ea128008ec0a180f88ed833ffb99808f3a41fb8ba1e8ed8c3",
    meaning: "loads startup resource 13 / UN.SWF record 56, decodes 4400 bytes, and copies two 0x898-byte terrain pages to DS:0026/0028",
  },
  {
    address: "0000:285D",
    offset: 0x285d,
    hex: "c7063a180000c70630180000c7063618a100b9320051e80e008306301832830636180359e2efc3",
    meaning: "scans the full 50x50 terrain map and advances three pixels per minimap row",
  },
  {
    address: "0000:28A4",
    offset: 0x28a4,
    hex: "a1a7018ec08b36321833db268a1c80fb00742503db8b9f7d2ea128008ec033c0268a07a34518a13418a33d18a13618a33f18be3d18e874a7c3",
    meaning: "skips raw token 0 and resolves UN/0056 page 1 to the VGA color of a 3x3 minimap cell",
  },
  {
    address: "0000:D050",
    offset: 0xd050,
    hex: "1eb8ba1e8ed8ad8bd0a346f5ada348f5ad8bd8ad8bf8ada250f58bf38bc22bd2bb0800f7f3a34af58bda8a872ef5a24cf52bd28bc6030646f548bb0800f7f32b064af5a34df58bda8a8736f5a24ff5bace03b80502efbac403b8020fefbace03b80300efe82500bace03b8000fefbace03b80500efbac403b8020fefbace03b80400efbace03b808ffef1fc3",
    meaning: "renders a solid VGA rectangle from x, y, width, height, and palette color fields",
  },
  {
    address: "1000:0FBB",
    offset: 0x10fbb,
    hex: "b980001eb8ba1e8ec0a180f80500088ed8bf7d2ef3a51fc3",
    meaning: "WAR loader restores 128 terrain descriptor offsets to DS:2E7D",
  },
  {
    address: "1000:55DB",
    offset: 0x155db,
    hex: "1eb8ba1e8ec0a180f80500088ed8bf7d2eb98000f3a51fc3",
    meaning: "JUST loader restores the 256-byte B scenario configuration as 128 terrain descriptor offsets at DS:2E7D",
  },
  {
    address: "1000:8995",
    offset: 0x18995,
    hex: "1eb8ba1e8ed8b98000be7d2ea180f80500088ec0f3a51fc3",
    meaning: "WAR writer serializes the 128 terrain descriptor offsets from DS:2E7D",
  },
  {
    address: "0000:4E6B",
    offset: 0x4e6b,
    hex: "b8ba1e8ed88b36772ed1e6a180f88ec0bf00008bcebb0c00e80cafa180f8bead019a2a003719",
    meaning: "loads the current stage's even B.SWF record through startup-resource index 12 and decodes its first four streams",
  },
  {
    address: "0000:7E2A",
    offset: 0x7e2a,
    hex: "8b368057a1a7018ec0268a0ca124008ec0268a34a122008ec0268a14a1a9018ec0268a2c8b",
    meaning: "loads the raw terrain byte directly into CL before drawing the corresponding tile",
  },
  {
    address: "0000:47EA",
    offset: 0x47ea,
    hex: "33d28b1ec41cb85000f7e30306c21ca3c61c33d2a1c01cbbdc00f7e3a3c81cc3",
    meaning: "computes VGA destination row*80+xByte and tile-plane source offset token*00DCh",
  },
  {
    address: "0000:396C",
    offset: 0x396c,
    hex: "a182f88ec08b36c81c8bc18ed88b048b6c028a4c0426890526896d0226884d048b44058b6c078a4c092689455026896d5226884d54",
    meaning: "opaque tile blitter copies five bytes per row and advances the VGA destination by 80 bytes",
  },
  {
    address: "0000:7DEF",
    offset: 0x7def,
    hex: "c70682572800c70686570500a17e57a38057c6067a5700b90a0051e81d00e83806ff068b57ff06805783068257288306865705fe067a5759e2e0c3",
    meaning: "battle viewport draws ten cells per row and advances the horizontal destination by five bytes / 40 pixels",
  },
  {
    address: "0000:7DC0",
    offset: 0x7dc0,
    hex: "c6068a574ec7068b570000c70684571700c6067b5700b9070051e8120083067e5732830684572cfe067b5759e2ebc3",
    meaning: "battle viewport draws seven rows and advances the vertical destination by 44 scanlines",
  },
  {
    address: "0000:82A4",
    offset: 0x82a4,
    hex: "8b0e075a80fd00741032ed8b1686578b1e84578bc9e8ceb5c332ed8b1686578b1e84578bc9e829b6c3",
    meaning: "tile dispatcher keeps CL as the terrain tile index; nonzero CH draws the full tile and zero CH draws the native 11h/44h dither-masked tile",
  },
  {
    address: "1000:6963",
    offset: 0x16963,
    hex: "9af2049d13",
    meaning: "movement destination validation calls the first-profile lookup",
  },
  {
    address: "1000:696B",
    offset: 0x1696b,
    hex: "3d63007504b94e00c3",
    meaning: "movement destination rejects first-profile value 99",
  },
  {
    address: "1000:6974",
    offset: 0x16974,
    hex: "a1a9018ec0268a043ad07704b94e00c3",
    meaning: "movement destination compares its scratch-grid byte with DL",
  },
  {
    address: "1000:6984",
    offset: 0x16984,
    hex: "a124008ec0268a043c007404b94e00c3",
    meaning: "movement destination must be unoccupied in the side map",
  },
  {
    address: "0000:93C4",
    offset: 0x93c4,
    hex: "9af2049d135e3d630074e63d620074e1",
    meaning: "AI adjacent trial rejects first-profile values 99 and 98",
  },
  {
    address: "0000:7318",
    offset: 0x7318,
    hex: "8b1e161fe80bdda1c531a3181fe80e009a04009d13",
    meaning: "player movement feeds the current unit movement stat to the range builder",
  },
  {
    address: "1000:39D4",
    offset: 0x139d4,
    hex: "a1161fa3f71e9ad30e4711e82b00e88700e88503e86f00e89e00e8d403e8fa06cb",
    meaning: "range builder initializes and propagates the 50x50 scratch grid",
  },
  {
    address: "1000:3A5A",
    offset: 0x13a5a,
    hex: "a1a9018ec08b3ef71ea1181faac3",
    meaning: "range builder writes the supplied range value at the origin cell",
  },
  {
    address: "1000:3A6C",
    offset: 0x13a6c,
    hex: "a1a9018ec033ffb9c409b80000f3aac3",
    meaning: "range builder clears exactly 2500 scratch-grid bytes",
  },
  {
    address: "0000:7336",
    offset: 0x7336,
    hex: "813e430d304e7407c7060f1f4d00c3c7060f1f3000c3",
    meaning: "player movement selects weighted mode M, except unit code 0N (水戰士) selects uniform mode 0",
  },
  {
    address: "1000:3A0D",
    offset: 0x13a0d,
    hex: "833e0f1f597437813e0f1f4659742f813e0f1f43597427833e0f1f4d7427813e0f1f464d741f813e0f1f434d7417833e0f1f417410813e0f1f46417408c32ec606890002c32ec606890001c300",
    meaning: "side-aware range modes select side 2 for Y variants and side 1 for M/A variants",
  },
  {
    address: "1000:3B13",
    offset: 0x13b13,
    hex: "c7060b1fcd018b3e141f268a2d80fd007501c3a10f1f",
    meaning: "each nonzero grid cell installs near callback 01CDh and dispatches four orthogonal neighbor trials",
  },
  {
    address: "1000:3B9D",
    offset: RANGE_CALLBACK_LINEAR_OFFSET,
    hex: "e81000e83d00e86c00e89d00e8f600e84a01c3",
    meaning: "near callback 01CDh resolves to the six-way range propagation-mode dispatcher",
  },
  {
    address: "1000:3BB0",
    offset: 0x13bb0,
    hex: "833e0f1f307401c38bdf031e111fe88901e802033d63007416268a078acdfec9740d3ac1730926880fc606131f59c3c3",
    meaning: "mode 0 propagates current-1, rejects terrain rule 99, and does not consult occupancy",
  },
  {
    address: "1000:3BE0",
    offset: 0x13be0,
    hex: "833e0f1f317401c38bdf031e111fe85901e8d2023d63007418268a378acd2ac8720f740d3ace760926880fc606131f59c3c3",
    meaning: "mode 1 propagates current-terrainRule and rejects terrain rule 99",
  },
  {
    address: "1000:3C12",
    offset: 0x13c12,
    hex: "833e0f1f327401c38bdf031e111fe82701e8a0023d6300741a3c007416268a378acdfec9740d3ace760926880fc606131f59c3c3",
    meaning: "mode 2 propagates current-1 and rejects terrain rules 99 and 0",
  },
  {
    address: "1000:3C46",
    offset: 0x13c46,
    hex: "833e0f1f59740f833e0f1f4d7408833e0f1f417401c38bdf031e111fe8f2002e3a06890074043c00751be8d700e850023d630074103d6200740b268a3780feff7403e80100c38acd2ac8720f740d3ace760926880fc606131f59c3c3",
    meaning: "M/Y/A modes require empty-or-own-side occupancy, reject 98/99, and propagate current-terrainRule",
  },
  {
    address: "1000:3CA2",
    offset: 0x13ca2,
    hex: "813e0f1f46597411813e0f1f464d7409813e0f1f46417401c38bdf031e111fe893002e3a06890074043c007529e87800e8f1013d6300741e268a3780feff74168acdfec980f900740d3ace760926880fc606131f59c3c3",
    meaning: "FY/FM/FA modes require empty-or-own-side occupancy, reject 99, and propagate current-1",
  },
  {
    address: "1000:3CF9",
    offset: 0x13cf9,
    hex: "813e0f1f43597409813e0f1f434d7401c38bdf031e111fe844002e3a06890074043c00752be82900e8a2013d630074203d6100741b268a3780feff74138acdfec9740d3ace760926880fc606131f59c3c3",
    meaning: "CY/CM modes require empty-or-own-side occupancy, reject 97/99, and propagate current-1",
  },
  {
    address: "1000:3D6D",
    offset: 0x13d6d,
    hex: "813e0f1f46597436813e0f1f464d742e813e0f1f43597426813e0f1f434d741e813e0f1f46417416833e0f1f59740f83",
    meaning: "M/A/Y/FM/FA/FY/CM/CY reserve valid empty cells adjacent to opposing units before propagation; occupied cells are skipped",
  },
  {
    address: "1000:3DC5",
    offset: 0x13dc5,
    hex: "833e0f1f4d7437833e0f1f597430813e0f1f46597428813e0f1f464d7420813e0f1f43597418813e0f1f434d7410833e",
    meaning: "the same eight modes convert reserved enemy-adjacent cells into landing markers after propagation",
  },
  {
    address: "1000:3E23",
    offset: 0x13e23,
    hex: "3c0074043ac27501c306e841fde854fde846fde859fd07c3",
    meaning: "an opposing occupied cell dispatches four orthogonal reservation callbacks",
  },
  {
    address: "1000:3E3B",
    offset: 0x13e3b,
    hex: "8bfe033e111f268a2580fc007537a1a7018ec033db268a1d03db8baf7d2e06a126008ec033db268a5e000703dbe81b03",
    meaning: "valid empty attack-adjacent cells are reserved with FFh",
  },
  {
    address: "1000:3E81",
    offset: 0x13e81,
    hex: "3cff7401c3268a44ce3cff74043c01772a268a44323cff74043c01771e268a44",
    meaning: "a reserved cell becomes reachable when an orthogonal neighbor holds remaining > 1; the reserved cell's own entry cost is never subtracted",
  },
  {
    address: "1000:40EE",
    offset: 0x140ee,
    hex: "813e0f1f46597417833e0f1f597410813e0f1f46417408833e0f1f417401c3a1a9018ec0c7061a1f5f07e8f7fca12400",
    meaning: "Y/A/FY/FA maps increment nonzero values and then mark reachable opposing unit cells",
  },
  {
    address: "1000:412F",
    offset: 0x1412f,
    hex: "268a043c007501c3fec0268804c3",
    meaning: "nonzero range cells are incremented by one",
  },
  {
    address: "1000:413D",
    offset: 0x1413d,
    hex: "3c0074043ac27501c306a1a9018ec0268a64ce80fc017605b001268804268a643280fc017605b001268804268a640180",
    meaning: "an opposing unit cell becomes value 1 when an orthogonal neighbor is an attack-reachable value above 1",
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findPatternOffsets(buffer, pattern) {
  const offsets = [];
  for (let offset = 0; (offset = buffer.indexOf(pattern, offset)) >= 0; offset += 1) {
    offsets.push(offset);
  }
  return offsets;
}

function verifyImmediateWrites(moduleBuffer, pattern, expected, label) {
  const actual = findPatternOffsets(moduleBuffer, Buffer.from(pattern)).map((offset) =>
    [offset, moduleBuffer.readUInt16LE(offset + pattern.length)]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: writer audit mismatch`);
  }
  return actual.map(([offset, value]) => ({
    offset,
    offsetHex: `0x${hex(offset, 5)}`,
    value,
    valueHex: `0x${hex(value)}`,
    code: Buffer.from([value & 0xff, value >> 8]).toString("ascii").replace(/\0/g, ""),
  }));
}

function verifyAxWrites(moduleBuffer, pattern, expected, label) {
  const actual = findPatternOffsets(moduleBuffer, Buffer.from(pattern));
  if (!arraysEqual(actual, expected)) {
    throw new Error(`${label}: AX-writer audit mismatch`);
  }
  return actual.map((offset) => ({ offset, offsetHex: `0x${hex(offset, 5)}` }));
}

function auditRangeModeProducers(moduleBuffer) {
  const immediateWrites = verifyImmediateWrites(
    moduleBuffer,
    [0xc7, 0x06, 0x0f, 0x1f],
    EXPECTED_RANGE_MODE_IMMEDIATE_WRITES,
    "DS:1F0F immediate writes",
  );
  const axWrites = verifyAxWrites(
    moduleBuffer,
    [0xa3, 0x0f, 0x1f],
    EXPECTED_RANGE_MODE_AX_WRITES,
    "DS:1F0F AX writes",
  );
  const phaseBaseImmediateWrites = verifyImmediateWrites(
    moduleBuffer,
    [0x2e, 0xc7, 0x06, 0x7f, 0x01],
    EXPECTED_PHASE_BASE_MODE_IMMEDIATE_WRITES,
    "CS:017F immediate writes",
  );
  const phaseBaseAxWrites = verifyAxWrites(
    moduleBuffer,
    [0x2e, 0xa3, 0x7f, 0x01],
    [0x116b7],
    "CS:017F AX writes",
  );
  const phasePursuitImmediateWrites = verifyImmediateWrites(
    moduleBuffer,
    [0x2e, 0xc7, 0x06, 0x81, 0x01],
    EXPECTED_PHASE_PURSUIT_MODE_IMMEDIATE_WRITES,
    "CS:0181 immediate writes",
  );
  const phasePursuitAxWrites = verifyAxWrites(
    moduleBuffer,
    [0x2e, 0xa3, 0x81, 0x01],
    [],
    "CS:0181 AX writes",
  );
  const mode1ImmediateWriters = immediateWrites.filter((write) => write.value === 0x31);
  if (mode1ImmediateWriters.length !== 0) {
    throw new Error("unexpected reachable mode-1 producer");
  }
  const fmImmediateOffsets = immediateWrites
    .filter((write) => write.value === 0x4d46)
    .map((write) => write.offset);
  if (!arraysEqual(fmImmediateOffsets, SCRIPTED_FM_WRITERS.map((writer) => writer[1]))) {
    throw new Error("FM producer set no longer matches the scripted-stage audit");
  }
  return {
    evidenceLevel: "C",
    target: "DS:1F0F range propagation mode word",
    ghidraDirectReferenceCrossCheck: {
      totalWrites: immediateWrites.length + axWrites.length,
      immediateWrites: immediateWrites.length,
      axWrites: axWrites.length,
      statement: "the two opcode scans reproduce all 43 write references in the Ghidra direct-memory audit",
    },
    immediateWrites,
    axWriteSources: {
      literalMode0AtBehavior12Route: ["1000:1B03"],
      phaseBaseModeFromCs017f: [
        "1000:1B26", "1000:1C12", "1000:1C79", "1000:1CE1",
        "1000:1D0F", "1000:1D6B", "1000:2048", "1000:2091",
        "1000:20E3", "1000:2110", "1000:2131", "1000:2197",
      ],
      phasePursuitModeFromCs0181: ["1000:1C45", "1000:1CAB", "1000:21D8"],
    },
    phaseModeSources: {
      baseMode: {
        address: "CS:017F",
        reachableValues: ["0", "Y", "A"],
        immediateWrites: phaseBaseImmediateWrites,
        restoredWrite: phaseBaseAxWrites,
        note: "side 2 initializes Y, autonomous side 1 initializes A, and AI 水戰士 temporarily substitutes mode 0 before restoring the saved phase value",
      },
      pursuitMode: {
        address: "CS:0181",
        reachableValues: ["FY", "FA"],
        immediateWrites: phasePursuitImmediateWrites,
        axWrites: phasePursuitAxWrites,
      },
    },
    mode1: {
      handler: "1000:3BE0",
      producers: [],
      reachability: "no immediate or traced AX producer writes ASCII '1'; the branch is shipped but unreachable in the audited module",
      compatibilityPolicy: "retain its exact weighted/no-occupancy algorithm only in a low-level compatibility specification; it is not a visible original-game action",
    },
    fm: {
      handler: "1000:3CA2",
      producers: SCRIPTED_FM_WRITERS.map(([address, offset, stage]) => ({ address, offset, stage })),
      stages: uniqueSorted(SCRIPTED_FM_WRITERS.map((writer) => writer[2])),
      businessUse: "scripted story-unit movement with uniform cost 1, terrain rule 99 blocked, and propagation through empty or side-1 occupied cells",
    },
  };
}

/**
 * The enemy-adjacent FFh layer is often mistaken for an AI-only marking. Decode the mode
 * words each of its three passes compares, and check the two rules that decide how faithful
 * a remake's control zone has to be: an occupied cell is never reserved, and the conversion
 * test never subtracts the reserved cell's own terrain cost.
 */
function auditEnemyAdjacentReservation(moduleBuffer) {
  const decodeModeGate = (start, end, label) => {
    const codes = [];
    for (let offset = start; offset < end;) {
      // cmp word [1f0f], imm16 -> 81 3E 0F 1F lo hi ; cmp word [1f0f], imm8 -> 83 3E 0F 1F imm8
      if (moduleBuffer[offset] === 0x81 && moduleBuffer[offset + 1] === 0x3e
        && moduleBuffer.readUInt16LE(offset + 2) === 0x1f0f) {
        codes.push(moduleBuffer.subarray(offset + 4, offset + 6).toString("ascii"));
        offset += 8;
        continue;
      }
      if (moduleBuffer[offset] === 0x83 && moduleBuffer[offset + 1] === 0x3e
        && moduleBuffer.readUInt16LE(offset + 2) === 0x1f0f) {
        codes.push(String.fromCharCode(moduleBuffer[offset + 4]));
        offset += 7;
        continue;
      }
      break;
    }
    if (codes.length === 0) throw new Error(`${label}: no mode comparison decoded`);
    return codes;
  };
  const reservationModes = decodeModeGate(0x13d6d, 0x13dab, "1000:3D6D reservation gate");
  const conversionModes = decodeModeGate(0x13dc5, 0x13e03, "1000:3DC5 conversion gate");
  const finalPassModes = decodeModeGate(0x140ee, 0x1410d, "1000:40EE final-pass gate");
  for (const [label, modes] of [
    ["reservation", reservationModes],
    ["conversion", conversionModes],
  ]) {
    if (!modes.includes("M")) {
      throw new Error(`${label} gate no longer admits player mode M`);
    }
  }
  if (finalPassModes.includes("M")) {
    throw new Error("the final increment/opposing-cell pass unexpectedly admits mode M");
  }
  // 1000:3E3B: mov di,si / add di,[1f11] / mov ah,[es:di] / cmp ah,0 / jnz -> skip.
  // ES is the side map DS:[0024] at this point, so only empty cells continue to the
  // terrain-rule test and the FFh store.
  const emptyCellTest = moduleBuffer.subarray(0x13e41, 0x13e49);
  if (!emptyCellTest.equals(Buffer.from([0x26, 0x8a, 0x25, 0x80, 0xfc, 0x00, 0x75, 0x37]))) {
    throw new Error("1000:3E41 no longer gates the FFh reservation on an empty side-map byte");
  }
  // 1000:3E81 is 65 bytes long and contains nothing but the FFh test, four
  // `mov al,[es:si±(1|50)] / cmp al,0xff / jz next / cmp al,1 / ja convert` neighbor tests and
  // the two stores 0 / 1. Locking the whole body is what makes "the reserved cell's own entry
  // cost is never subtracted" a byte-checked fact instead of a transcription.
  const conversion = moduleBuffer.subarray(0x13e81, 0x13ec2);
  const expectedConversion = Buffer.from(
    "3cff7401c3268a44ce3cff74043c01772a268a44323cff74043c01771e268a44ff3cff"
    + "74043c017712268a44013cff74043c017706b000268804c3b001268804c3",
    "hex",
  );
  if (!conversion.equals(expectedConversion)) {
    throw new Error("1000:3E81 conversion body changed; re-verify whether it now charges an entry cost");
  }
  let neighborThresholdTests = 0;
  for (let index = 0; index + 2 < conversion.length; index += 1) {
    if (conversion[index] === 0x3c && conversion[index + 1] === 0x01
      && conversion[index + 2] === 0x77) neighborThresholdTests += 1;
  }
  if (neighborThresholdTests !== 4) {
    throw new Error(`1000:3E81 has ${neighborThresholdTests} \`cmp al,1 / ja\` neighbor tests, expected 4`);
  }
  return {
    evidenceLevel: "C",
    reservation: {
      entry: "1000:3D6D -> 1000:3E12 -> 1000:3E23 -> 1000:3B71 -> 1000:3E3B",
      appliesTo: reservationModes,
      rule: "for every opposing occupied cell, each orthogonal neighbor whose side-map byte is 0 and whose movement rule is neither 98 nor 99 is stored as FFh, which normal propagation can never overwrite",
      occupiedCellsAreNeverReserved: true,
      consequence: "a same-side unit standing next to an opposing unit leaves a traversable gap in the control zone, because modes M/A/Y propagate through own-side cells; it still cannot be used as a landing cell",
    },
    conversion: {
      entry: "1000:3DC5 -> 1000:3E12 -> 1000:3E81",
      appliesTo: conversionModes,
      rule: "a reserved cell becomes 1 when any orthogonal neighbor holds a raw remaining value above 1 and is not itself FFh; every other reserved cell is cleared to 0",
      neighborThresholdTests,
      chargesReservedCellEntryCost: false,
      nativeDefect: "the propagator subtracts each cell's terrain rule everywhere else, and `remaining > 1` is exactly the `cost == 1` condition for affording one more step; on cost 2..5 terrain the original therefore grants up to 4 extra movement points for the final step into contact",
      remakeDecision: "REMAKE-104 charges that step normally; see ../gdd/web-remake-rule-decisions.md",
    },
    finalPass: {
      entry: "1000:40EE -> 1000:412F / 1000:413D",
      appliesTo: finalPassModes,
      rule: "increment every nonzero cell, then write 1 into each opposing occupied cell that has an orthogonal neighbor above 1",
    },
  };
}

function readWords(buffer, offset, count) {
  return Array.from({ length: count }, (_, index) =>
    buffer.readUInt16LE(offset + index * 2));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function fingerprint(values) {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return sha256(buffer);
}

function verifySignatures(moduleBuffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = moduleBuffer.subarray(
      signature.offset,
      signature.offset + expected.length,
    );
    if (!actual.equals(expected)) {
      throw new Error(
        `${signature.address}: signature mismatch; expected ${signature.hex}, got ${actual.toString("hex")}`,
      );
    }
    return {
      address: signature.address,
      bytes: expected.length,
      sha256: sha256(actual),
      meaning: signature.meaning,
    };
  });
}

function readProfileTable(moduleBuffer, tableOffset, id) {
  const entries = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const linear = DATA_LINEAR_BASE + tableOffset + index * PROFILE_ENTRY_BYTES;
    return {
      index,
      code: moduleBuffer.subarray(linear, linear + 2).toString("ascii"),
      pointer: moduleBuffer.readUInt16LE(linear + 2),
      pointerAddress: `${hex(DATA_SEGMENT)}:${hex(moduleBuffer.readUInt16LE(linear + 2))}`,
    };
  });
  const strides = entries.slice(1).map(
    (entry, index) => entry.pointer - entries[index].pointer,
  );
  if (strides.some((stride) => stride !== PROFILE_STRIDE_BYTES)) {
    throw new Error(`${id}: profile pointers do not use ${PROFILE_STRIDE_BYTES}-byte stride`);
  }
  if (new Set(entries.map((entry) => entry.code)).size !== RECORD_COUNT) {
    throw new Error(`${id}: profile codes are not unique`);
  }
  return {
    id,
    tableAddress: `${hex(DATA_SEGMENT)}:${hex(tableOffset)}`,
    entryCount: entries.length,
    entryBytes: PROFILE_ENTRY_BYTES,
    profileStrideBytes: PROFILE_STRIDE_BYTES,
    logicalWordsPerProfile: LOGICAL_TERRAIN_SLOTS,
    entries,
  };
}

function parseSerializedRecords(mapBuffer, unitDescriptors) {
  if (mapBuffer.length !== RECORD_COUNT * RECORD_BYTES) {
    throw new Error(`MAP.SWF: expected ${RECORD_COUNT * RECORD_BYTES} bytes`);
  }
  if (unitDescriptors.recordCount !== RECORD_COUNT) {
    throw new Error("unit descriptor record count does not match MAP.SWF");
  }
  return Array.from({ length: RECORD_COUNT }, (_, record) => {
    const base = record * RECORD_BYTES;
    const movementWindow = readWords(mapBuffer, base, SERIALIZED_WORDS);
    const terrainDefenseWindow = readWords(
      mapBuffer,
      base + SERIALIZED_WORDS * 2,
      SERIALIZED_WORDS,
    );
    const descriptor = unitDescriptors.records[record];
    return {
      record,
      code: descriptor.descriptors[0].code,
      codeVariants: descriptor.codeVariants,
      name: descriptor.normalizedName,
      specialRecord: record >= 35,
      movementRules: movementWindow.slice(0, LOGICAL_TERRAIN_SLOTS),
      movementOverlapWord: movementWindow[LOGICAL_TERRAIN_SLOTS],
      terrainDefensePercents: terrainDefenseWindow.slice(
        0,
        LOGICAL_TERRAIN_SLOTS,
      ),
      terrainDefenseOverlapWord:
        terrainDefenseWindow[LOGICAL_TERRAIN_SLOTS],
      movementProfileSha256: fingerprint(
        movementWindow.slice(0, LOGICAL_TERRAIN_SLOTS),
      ),
      terrainDefenseProfileSha256: fingerprint(
        terrainDefenseWindow.slice(0, LOGICAL_TERRAIN_SLOTS),
      ),
    };
  });
}

function validateRecordCodes(records, profileTable, label) {
  const codes = new Set(profileTable.entries.map((entry) => entry.code));
  for (const record of records) {
    if (!record.codeVariants.some((code) => codes.has(code))) {
      throw new Error(`${label}: record ${record.record} has no matching profile code`);
    }
  }
}

function validatePlayerMovementProfiles(records) {
  const waterWarriors = records.filter((record) => record.code === "0N");
  if (waterWarriors.length !== 1 || waterWarriors[0].record !== 26 ||
      waterWarriors[0].name !== "水戰士") {
    throw new Error("expected exactly record 26 0N/水戰士 for player movement mode 0");
  }
  if (waterWarriors[0].movementRules.includes(98)) {
    throw new Error("0N/水戰士 unexpectedly contains movement rule 98");
  }
  const recordsWith98 = records.filter((record) => record.movementRules.includes(98));
  if (recordsWith98.length === 0 || recordsWith98.some((record) => record.code === "0N")) {
    throw new Error("movement-rule 98 profile partition no longer matches the player-mode branch");
  }
  return {
    uniformModeRecord: waterWarriors[0].record,
    uniformModeCode: waterWarriors[0].code,
    uniformModeName: waterWarriors[0].name,
    uniformModeProfileContains98: false,
    weightedModeRecordsContaining98: recordsWith98.map((record) => record.record),
  };
}

function profileGroups(records, field) {
  const groups = new Map();
  for (const record of records) {
    const key = fingerprint(record[field]);
    const group = groups.get(key) ?? {
      sha256: key,
      values: record[field],
      records: [],
      codes: [],
      names: [],
    };
    group.records.push(record.record);
    group.codes.push(record.code);
    group.names.push(record.name);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) => left.records[0] - right.records[0],
  );
}

function slotSummary(records, field) {
  const ordinary = records.filter((record) => !record.specialRecord);
  return Array.from({ length: LOGICAL_TERRAIN_SLOTS }, (_, slot) => ({
    slot,
    visibleName: null,
    allValues: uniqueSorted(records.map((record) => record[field][slot])),
    ordinaryValues: uniqueSorted(ordinary.map((record) => record[field][slot])),
  }));
}

function validateOverlapLayout(moduleBuffer, movementTable, defenseTable, records) {
  const lastMovement = movementTable.entries.at(-1);
  const lastMovementOverlapAddress = lastMovement.pointer + PROFILE_STRIDE_BYTES;
  const lastDefense = defenseTable.entries.at(-1);
  const lastDefenseOverlapAddress = lastDefense.pointer + PROFILE_STRIDE_BYTES;
  const movementTail = records.at(-1).movementOverlapWord;
  const defenseTail = records.at(-1).terrainDefenseOverlapWord;
  const expectedMovementTail = moduleBuffer.readUInt16LE(
    DATA_LINEAR_BASE + lastMovementOverlapAddress,
  );
  const expectedDefenseTail = moduleBuffer.readUInt16LE(
    DATA_LINEAR_BASE + lastDefenseOverlapAddress,
  );
  if (movementTail !== expectedMovementTail || defenseTail !== expectedDefenseTail) {
    throw new Error("serialized overlap words do not match the native table boundaries");
  }
  return {
    logicalProfileBytes: PROFILE_STRIDE_BYTES,
    serializedWindowBytes: SERIALIZED_WORDS * 2,
    overlapBytesPerWindow: 2,
    interpretation:
      "the 24th serialized word is the word immediately following a 23-word runtime profile and is not a 24th logical terrain slot",
    movementRecord38Overlap: {
      value: movementTail,
      hex: `0x${hex(movementTail)}`,
      address: `${hex(DATA_SEGMENT)}:${hex(lastMovementOverlapAddress)}`,
      overlaps: "the first code word of the terrain-defense profile table ('0A')",
    },
    terrainDefenseRecord38Overlap: {
      value: defenseTail,
      hex: `0x${hex(defenseTail)}`,
      address: `${hex(DATA_SEGMENT)}:${hex(lastDefenseOverlapAddress)}`,
      overlaps: "the word immediately following the last terrain-defense profile",
    },
  };
}

async function extract(mapPath, modulePath, descriptorsPath, outputPath) {
  const [mapBuffer, moduleBuffer, descriptorsText] = await Promise.all([
    readFile(mapPath),
    readFile(modulePath),
    readFile(descriptorsPath, "utf8"),
  ]);
  const moduleSha256 = sha256(moduleBuffer);
  if (moduleSha256 !== EXPECTED_MODULE_SHA256) {
    throw new Error(`module 29 SHA-256 mismatch: ${moduleSha256}`);
  }
  const unitDescriptors = JSON.parse(descriptorsText);
  const verifiedCodeSignatures = verifySignatures(moduleBuffer);
  const enemyAdjacentReservation = auditEnemyAdjacentReservation(moduleBuffer);
  const rangeModeProducerAudit = auditRangeModeProducers(moduleBuffer);
  const movementProfileTable = readProfileTable(
    moduleBuffer,
    MOVEMENT_PROFILE_TABLE,
    "movementRules",
  );
  const terrainDefenseProfileTable = readProfileTable(
    moduleBuffer,
    DEFENSE_PROFILE_TABLE,
    "terrainDefensePercents",
  );
  const records = parseSerializedRecords(mapBuffer, unitDescriptors);
  validateRecordCodes(records, movementProfileTable, "movement table");
  validateRecordCodes(records, terrainDefenseProfileTable, "defense table");
  const playerMovementProfileValidation = validatePlayerMovementProfiles(records);
  const serializedOverlap = validateOverlapLayout(
    moduleBuffer,
    movementProfileTable,
    terrainDefenseProfileTable,
    records,
  );
  const ordinaryRecords = records.filter((record) => !record.specialRecord);
  const result = {
    format: "ANGEL2 MAP.SWF native movement and terrain-defense rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    sources: {
      map: { path: mapPath, bytes: mapBuffer.length, sha256: sha256(mapBuffer) },
      module: {
        path: modulePath,
        bytes: moduleBuffer.length,
        sha256: moduleSha256,
      },
      unitDescriptors: descriptorsPath,
    },
    recordCount: records.length,
    recordBytes: RECORD_BYTES,
    serializedWordsPerWindow: SERIALIZED_WORDS,
    logicalTerrainSlots: LOGICAL_TERRAIN_SLOTS,
    serializedOverlap,
    profileTables: {
      movementRules: movementProfileTable,
      terrainDefensePercents: terrainDefenseProfileTable,
    },
    semantics: {
      movementRules: {
        evidenceLevel: "C",
        confirmedRole: "the first logical profile is queried by movement destination and AI adjacent-trial code",
        confirmedValues: {
          99: "player movement destination is rejected; AI adjacent trial is also rejected",
          98: "normal player mode M rejects it during propagation and AI adjacent trial rejects it; the later player destination precheck only needs to reject 99 because a mode-M path cannot assign a reachable value to rule 98",
        },
        confirmedInterpretation:
          "ordinary values 1..5 are destination-terrain step costs in weighted modes; player mode M subtracts the value from remaining range",
        ordinaryValueDomain: uniqueSorted(
          ordinaryRecords.flatMap((record) => record.movementRules),
        ),
        allValueDomain: uniqueSorted(records.flatMap((record) => record.movementRules)),
      },
      terrainDefensePercents: {
        evidenceLevel: "C",
        confirmedRole:
          "the second logical profile is selected by the board terrain slot and multiplied by effective defense, then divided by 100",
        formula: "terrainDefense = floor(effectiveDefense * terrainPercent / 100)",
        ordinaryValueDomain: uniqueSorted(
          ordinaryRecords.flatMap((record) => record.terrainDefensePercents),
        ),
        allValueDomain: uniqueSorted(
          records.flatMap((record) => record.terrainDefensePercents),
        ),
      },
      terrainBoard: {
        evidenceLevel: "C",
        confirmed:
          "DS:01A7 addresses the 50x50 raw terrain-token map; the odd B record's first 256 bytes supply 128 offsets at DS:2E7D; each offset dereferences the first UN.SWF record-56 page to yield the logical profile slot and the second page to yield the 3x3 minimap-cell VGA color; raw token also directly selects one of 128 40x44 tiles, and the remaining 1024 bytes in every plane are zero-filled outside the addressable region",
        nameBindingAudit:
          "logical slots use canonical numeric IDs 0..22; a separate audit of all six module29 DS:2E7D read sites found no glyph, string, or HUD-name consumer; A/0007 vocabulary remains unbound and must not be assigned by adjacency",
      },
      rangeBuilder: {
        evidenceLevel: "C",
        confirmed: [
          "player movement passes the unit's current movement stat to the range builder",
          "the builder clears 2500 bytes, writes the range value at the origin, and repeatedly scans four orthogonal neighbors in forward and reverse passes",
          "the stored near callback offset 01CDh resolves against code-segment linear base 139D0h to static file offset 13B9Dh",
          "each update computes a positive remaining-range candidate and replaces a target only when the candidate is greater than the target's prior value",
          "the destination must pass the first-profile 99 check, a nonzero scratch-grid comparison, and an empty-side-map check",
        ],
        gridValueMeaning:
          "remaining range including the current cell; the origin is seeded with movement, so a path is reachable only when its accumulated step cost is strictly less than movement",
        exactUpdate:
          "candidate = currentRemaining - stepCost; update target iff subtraction does not underflow, candidate > 0, candidate > previousTarget, and the active mode's terrain/occupancy filters pass",
        traversal:
          "four orthogonal offsets -50,-1,+50,+1; whole-grid forward and reverse scans repeat until neither pass changes a cell",
        internalCallbackResolution: {
          codeSegmentLinearBase: `0x${RANGE_CODE_SEGMENT_LINEAR_BASE.toString(16).toUpperCase()}`,
          storedNearOffset: `0x${RANGE_CALLBACK_NEAR_OFFSET.toString(16).toUpperCase().padStart(4, "0")}`,
          resolvedFileOffset: `0x${RANGE_CALLBACK_LINEAR_OFFSET.toString(16).toUpperCase()}`,
          resolvedSyntheticAddress: "1000:3B9D",
        },
        producerAudit: rangeModeProducerAudit,
        modes: [
          {
            codes: ["0"],
            stepCost: "1",
            rejectedMovementRules: [99],
            occupancy: "not consulted during propagation",
          },
          {
            codes: ["1"],
            stepCost: "movementRule",
            rejectedMovementRules: [99],
            occupancy: "not consulted during propagation",
            runtimeReachability: "no producer writes this mode in the shipped module; handler 1000:3BE0 is dead/legacy code",
          },
          {
            codes: ["2"],
            stepCost: "1",
            rejectedMovementRules: [0, 99],
            occupancy: "not consulted during propagation",
          },
          {
            codes: ["M", "Y", "A"],
            stepCost: "movementRule",
            rejectedMovementRules: [98, 99],
            occupancy: "target must be empty or occupied by the selected side; scratch value 255 is not overwritten",
            selectedSide: "M/A -> side 1; Y -> side 2",
          },
          {
            codes: ["FM", "FY", "FA"],
            stepCost: "1",
            rejectedMovementRules: [99],
            occupancy: "target must be empty or occupied by the selected side; scratch value 255 is not overwritten",
            selectedSide: "FM/FA -> side 1; FY -> side 2",
            businessBindings: "FM -> scripted stage movement in stages 0/1/6/20/21/22/42; FY/FA -> AI pursuit and leader-cohesion movement",
          },
          {
            codes: ["CM", "CY"],
            stepCost: "1",
            rejectedMovementRules: [97, 99],
            occupancy: "target must be empty or occupied by the selected side; scratch value 255 is not overwritten",
            selectedSide: "CM -> side 1; CY -> side 2",
          },
        ],
        enemyAdjacentReservation,
        aiTargetMarkers: {
          appliesTo: enemyAdjacentReservation.finalPass.appliesTo,
          scopeCorrection: "only the increment/opposing-cell pass is AI-only; the FFh reservation and its conversion also run for player mode M, so this layer is the shared control zone rather than an AI marking (see enemyAdjacentReservation)",
          beforePropagation: "valid empty cells orthogonally adjacent to opposing units are reserved as FFh so normal propagation does not overwrite them; occupied cells are never reserved",
          adjacencyFinalization: "a reserved cell connected to the propagated range is converted to value 1 before the final pass, using an orthogonal-neighbor `remaining > 1` test that never subtracts the reserved cell's own terrain cost",
          finalPass: "all nonzero cells are incremented; an opposing occupied cell with any orthogonal neighbor above 1 is then written as value 1",
          resultingValues: {
            attackAdjacentPosition: 2,
            reachableOpposingUnitCell: 1,
            otherReachableCells: "their propagated remaining-range value plus one",
          },
          consumer: "AI attack-position and pursuit selectors use these markers; detailed selection rules are in ai-rules.json",
        },
        playerMovement: {
          defaultMode: "M",
          exception: "unit code 0N (record 26 水戰士) selects mode 0",
          defaultBehavior:
            "weighted destination-terrain cost; rules 98/99 are blocked; propagation may cross empty or friendly side-1 cells but not enemy cells",
          waterWarriorBehavior:
            "uniform cost 1; only rule 99 is blocked; occupancy is ignored while propagating; the final destination still must be empty",
          value98:
            "all current player profiles that actually contain 98 use mode M, where 98 is explicitly rejected; 水戰士 uses mode 0 but its profile contains no 98",
          finalDestination:
            "must have a positive propagated scratch value, must not have movement rule 99, and must be empty in the side/occupancy map",
          profileValidation: playerMovementProfileValidation,
        },
      },
    },
    terrainSlots: Array.from({ length: LOGICAL_TERRAIN_SLOTS }, (_, slot) => ({
      slot,
      visibleName: null,
      movementValues: slotSummary(records, "movementRules")[slot],
      terrainDefenseValues: slotSummary(records, "terrainDefensePercents")[slot],
    })),
    movementProfileGroups: profileGroups(records, "movementRules"),
    terrainDefenseProfileGroups: profileGroups(records, "terrainDefensePercents"),
    records,
    verifiedCodeSignatures,
    unresolved: [
      "logical terrain slots 0..22 have no discovered native visible-name binding; optional editor aliases must remain explicitly inferred",
      "range mode 1 has no producer and is retained only as unreachable compatibility behavior; all FM producers are bound to scripted stage movement",
    ],
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ${records.length} MAP records, ${LOGICAL_TERRAIN_SLOTS} logical terrain slots, ` +
      `${verifiedCodeSignatures.length} verified code signatures`,
  );
  return result;
}

function usage() {
  return (
    "usage: angel2-map-rules.mjs --extract MAP.SWF 0029-unpacked.bin " +
    "unit-descriptors.json OUTPUT.json"
  );
}

async function main() {
  const [command, mapPath, modulePath, descriptorsPath, outputPath] =
    process.argv.slice(2);
  if (command !== "--extract" || outputPath === undefined) {
    throw new Error(usage());
  }
  await extract(mapPath, modulePath, descriptorsPath, outputPath);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});

export { extract };
