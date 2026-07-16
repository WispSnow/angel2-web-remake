#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE_25_DATA_BASE = 0x9140;

const VERIFIED_RANGES = [
  { module: 25, address: "0000:0092", start: 0x0092, end: 0x00c2, role: "route stage 49 to module 33, stage 6 to module 29, and every other stage to module 27", sha256: "c0f1883018a31bbecc8de6e55968a3fa1c6362d6622e9f82f23fc4becc3cc725" },
  { module: 25, address: "0000:05F2", start: 0x05f2, end: 0x06c0, role: "select the per-stage MAGIC record and optional SAY/NUM/CHA story triplet", sha256: "718e2f95a1b21280e0a997337e56547020eb480de7a449bd57e25ab4ce23dd8e" },
  { module: 25, address: "DS:0F88", start: MODULE_25_DATA_BASE + 0x0f88, end: MODULE_25_DATA_BASE + 0x1038, role: "stage to MAGIC record table with terminator", sha256: "22e36c748369975524564b0acbfc3ffc45fa6d1f976b0b945b80e38bbc45b8f4" },
  { module: 25, address: "DS:0E16", start: MODULE_25_DATA_BASE + 0x0e16, end: MODULE_25_DATA_BASE + 0x0e7a, role: "50-entry stage to story-triplet record table", sha256: "bf3ee2518715aadba2bae6211a5e9bfbbdadc8bdf89f1e849b0d062703fefe04" },
  { module: 27, address: "0000:00DC", start: 0x00dc, end: 0x00f7, role: "return module 25 after preparing stage 6, otherwise return module 29", sha256: "9f9e7765965722c4162a0d2fd444fe126cf47148fa693685f9647dacd0d67887" },
  { module: 27, address: "0000:056E", start: 0x056e, end: 0x062a, role: "prepare a stage template, run deployment when FF cells exist, and write JUST.TST", sha256: "254f9230d9e61b70589b3dc8af11186393ff8d061004d31149543443b3c6ebd1" },
  { module: 29, address: "0000:009C", start: 0x009c, end: 0x00d3, role: "when nextStage is 6, force module 27 before copying the transition to the parent", sha256: "63155530fe87cdde349aafea1cdce90fdadcc9058c9261339d7bdf35462ed242" },
  { module: 29, address: "0000:4DCD", start: 0x04dcd, end: 0x04e03, role: "begin a round, increment the round counter, tick statuses, and dispatch stage events", sha256: "77824c7a7d6b90161031e5e8139cef720c5d25f6db5078eb06d4fed1a8e39175" },
  { module: 29, address: "1000:42A8", start: 0x142a8, end: 0x14328, role: "seed the default transition and call all 38 per-stage battle-event handlers", sha256: "eba7ea30d43c3357155ae5cd80158e26f51d2ac9ca779a5bb59377566fee0cfe" },
  { module: 29, address: "1000:4328-51E5", start: 0x14328, end: 0x151e5, role: "all 38 guarded per-stage battle-event handlers", sha256: "4359decc7af6e2bfdd08c436c15ec75d2aeb10675906e6b61a2ae79fbc8a71e1" },
  { module: 29, address: "1000:457F", start: 0x1457f, end: 0x1466b, role: "stage-42 outcome presentation, scripted movement, portal disappearance, and stage-6 redirect", sha256: "07c70c3eacf4aeb530598e73ac2f89d1a1c0dc0f396964c91ae4a4f2343b8c58" },
  { module: 29, address: "1000:4B72", start: 0x14b72, end: 0x14c88, role: "stage-21 round-1 scout placement, dialogue, movement, and stage-22 redirect", sha256: "77f24db0c28b368d729241fe95240715e3ce63f9f4c4e0fdf296f07ed657e2b7" },
  { module: 29, address: "1000:4C88", start: 0x14c88, end: 0x14db5, role: "stage-22 round-1 empress/Kins entrance, dialogue, temporary removal, and enemy ambush placement", sha256: "1e63fecf6e564caf75afe46f39a38149f5afd18511e395bcbae20e787cf69006" },
  { module: 29, address: "1000:515C", start: 0x1515c, end: 0x15197, role: "stage-37 round-1 boss dialogue and victory redirect to internal stage 49", sha256: "62678f3776aa9e9a8cb9480f4aed580943017edb3f2f8bc2a945cfb4ff062be3" },
  { module: 29, address: "1000:5197", start: 0x15197, end: 0x151e5, role: "stage-38 rematch opening, live-victory dialogue, and module-46 redirect", sha256: "ef488a6451dc9ea34d06a0b3fc1cc961db1225f880a0ddc23e7f3ef36d805b3a" },
  { module: 29, address: "1000:51E5", start: 0x151e5, end: 0x151f4, role: "write CH to the side map and CL to the unit-slot map at cell BX", sha256: "b615cb66304ec56f3d2b02b0a5deb121f5428a9b154fc23188bbac0c01a4c091" },
  { module: 29, address: "1000:5319", start: 0x15319, end: 0x1533e, role: "remove every side-2 cell from both battle maps", sha256: "1ddd61af9885b893de39f9f1773d50ada5948b38070bcc7c639f946b73b2362d" },
  { module: 29, address: "1000:533E", start: 0x1533e, end: 0x1536a, role: "spawn sequential side-1 slots at a sentinel-terminated cell list", sha256: "3bf5f982a163efe30c7c7ecc256235680360cb7e31e2b146bffbdfe1725db2cc" },
  { module: 29, address: "1000:536A", start: 0x1536a, end: 0x15385, role: "from round 6 onward, reset all 75 side-2 per-slot AI behavior words to zero", sha256: "2b82330ce0e614c0e1a101da93fe7891ecb24da1d9fb641464030d442d920904" },
  { module: 29, address: "DS:2E5C", start: 0x219fc, end: 0x21a11, role: "stage-6 reinforcement slot counter, scratch cell, and eight-cell sentinel-terminated spawn list", sha256: "94b07326191c7414351349ef9972843a8f9b940601265343692593d17f42f040" },
  { module: 29, address: "DS:84BB[22h]", start: 0x2709f, end: 0x270a1, role: "selector 22h contextual-line pointer to DS:8762", sha256: "002ca57106ab95e8e104635a67a23da47c59c4a6d74038e4c2c0a6eb5b0eea97" },
  { module: 29, address: "DS:8762", start: 0x27302, end: 0x27324, role: "stage-30 contextual transition line including its dollar terminator", sha256: "6667853e4a4fe65483a78ddc691509136538b54070277fec31d6f17185c52165" },
  { module: 29, address: "0000:536B", start: 0x0536b, end: 0x0537b, role: "rebuild all 57 side-1 unit-slot states after the stage-30 allegiance conversion", sha256: "6a8970c80d392cd2c2e2ba037aa29a6126786c80a69fa71c5580a07cfac10c69" },
  { module: 29, address: "0000:537B", start: 0x0537b, end: 0x0538b, role: "rebuild all 57 side-2 unit-slot states after the stage-30 class-array mutation", sha256: "0ea476b4d7a977b0162956deeba1089dcf6a855e2c9d5e614ac3019176d58da4" },
  { module: 29, address: "0000:540D", start: 0x0540d, end: 0x05434, role: "rebuild 57 unit-slot states for the side selected by the wrapper mode", sha256: "3ec21da4e548ed94a86c5b92d46671bd3c51e912679b7704501238364d3c8208" },
  { module: 29, address: "0000:9733", start: 0x09733, end: 0x097b2, role: "stage-30 defeated-enemy reclassification sequence and final conversion to side-1 slot 23", sha256: "868aa29804c705b3e767adebf5b3e109056081bec1f1820e8fa89b13eaf454e9" },
  { module: 29, address: "0000:97B2", start: 0x097b2, end: 0x097dc, role: "map LV_HARD 0,1,2,3+ to stage-30 class-sequence limits 8,16,24,32", sha256: "1d3d0370ac52d6f31b9f9e23df74371ef31034494e7cdb4688b74714b6972fca" },
  { module: 29, address: "0000:C97A", start: 0x0c97a, end: 0x0c9b9, role: "select a contextual battle line, bind the current portrait, and enter the generic outcome-dialogue wrapper", sha256: "d1f0627841100cc403a6590cd72963ea9a73d5e87eed71e5f49700daba9e4595" },
  { module: 29, address: "1000:8BD1", start: 0x18bd1, end: 0x18c0f, role: "on LV_HARD 3, increase side-2 attack, defense, and maximum life fields by floor(value/2)", sha256: "58435f04cafc936f1dde3ba1f943ff2d578fefffb32ad3d274d5b5be63e785ec" },
  { module: 29, address: "1000:7DF7", start: 0x17df7, end: 0x17e09, role: "run scripted movement from SI to DI and refresh map state", sha256: "06e8e77d90dbaef5890f396d4a6729e69fc9033255d712a0fa417c166438b74f" },
  { module: 29, address: "1000:834A", start: 0x1834a, end: 0x1834e, role: "far wrapper that focuses and redraws linear cell AX", sha256: "2bb7c58ceb1cc7383836b71b15403552628c8eacc52f0ac21240cdc2c0990384" },
  { module: 29, address: "1000:849A", start: 0x1849a, end: 0x184cf, role: "scan occupied cells for portrait/resource id AX, then focus that unit", sha256: "80d7f9537487fcd2d3567e1c583a368ad83afae28c72af08baeb7c1fada0fce6" },
  { module: 29, address: "0000:BAB8", start: 0x0bab8, end: 0x0bac6, role: "run SAY script DS:80B5 with battle-story mode enabled", sha256: "3235bffcd9af721b3fbf6385e6f6f17080745d523ffa69fc180da75d66b108b5" },
  { module: 29, address: "1000:6084", start: 0x16084, end: 0x161ab, role: "full lightning-4 presentation followed by lightning damage resolution", sha256: "5f323fe6b01375c9217304d6c9236067b259fcdeac759d09172c4fc0bb783e8d" },
  { module: 33, address: "0000:00C7", start: 0x00c7, end: 0x00d5, role: "seed module 35 as the overlay-parent transition after the stage-49 presentation module", sha256: "0da6e399defe111822e1b76c67f0192c0a39edb9862b5886459a85960f621589" },
  { module: 33, address: "0000:02E0", start: 0x02e0, end: 0x02fa, role: "write AX to overlay-parent state word at relative offset DI", sha256: "d02247514d4c4d51a895d121a0c9f58d9c5b6df41aba0e5d56fab6235f56b397" },
  { module: 35, address: "0000:00AD", start: 0x00ad, end: 0x00d5, role: "seed module 27 and stage 38 as the overlay-parent transition", sha256: "379a65530cfc5af01e49c1e4587e2ecb160d20ab068a5c5bc6abf61d26ac4a48" },
  { module: 35, address: "0000:02E0", start: 0x02e0, end: 0x02fa, role: "write AX to overlay-parent state word at relative offset DI", sha256: "d02247514d4c4d51a895d121a0c9f58d9c5b6df41aba0e5d56fab6235f56b397" },
  { module: 46, address: "0000:00FE", start: 0x00fe, end: 0x0129, role: "call the non-returning terminal credits before unreachable module-27/stage-38 parent writes", sha256: "96c3bb4188dc2aeea6aab2caac707031cbefde32d4cb7f35cf7a5f62ff277312" },
  { module: 46, address: "0000:03CE", start: 0x03ce, end: 0x044d, role: "run credits, fades, and the final infinite The-end presentation without a normal return path", sha256: "17824db017e3cdcba392e5383d459ae28b5a63390d4f5b7bd190eec09f46b561" },
  { module: 46, address: "0000:034F", start: 0x034f, end: 0x0369, role: "write AX to overlay-parent state word at relative offset DI", sha256: "316b88fd8c695908e75597498f3505ebcd5a960c0252c19699efea297e649ea5" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hex(value, width = 4) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function cell(value) {
  return {
    cell: value,
    hex: hex(value),
    x: value % 50,
    y: Math.floor(value / 50),
  };
}

function verifyRanges(modules) {
  return VERIFIED_RANGES.map((range) => {
    const bytes = modules[range.module].subarray(range.start, range.end);
    const actual = sha256(bytes);
    assert(actual === range.sha256, `module ${range.module} ${range.address}: code/data signature mismatch`);
    return {
      module: range.module,
      address: range.address,
      fileOffset: range.start,
      bytes: bytes.length,
      role: range.role,
      sha256: actual,
    };
  });
}

function parseStageMagicRecords(module25) {
  const entries = [];
  for (let offset = MODULE_25_DATA_BASE + 0x0f88; ; offset += 4) {
    const stage = module25.readInt16LE(offset);
    const magicRecord = module25.readInt16LE(offset + 2);
    if (stage === -1) break;
    entries.push({
      tableIndex: entries.length,
      tableAddress: `DS:${hex(offset - MODULE_25_DATA_BASE).slice(2)}`,
      stage,
      magicRecord,
      selected: !entries.some((entry) => entry.stage === stage),
    });
  }
  const duplicateStages = [...new Set(entries.map((entry) => entry.stage).filter((stage, index, all) => all.indexOf(stage) !== index))];
  return {
    resource: "MAGIC.SWF",
    resourceIndex: 4,
    selectionRule: "linear search stops at the first matching stage and terminates at stage -1",
    entries,
    duplicateStages: duplicateStages.map((stage) => ({
      stage,
      entries: entries.filter((entry) => entry.stage === stage),
      consequence: "only the first entry is reachable",
    })),
  };
}

function parseStageStoryRecords(module25) {
  return Array.from({ length: 50 }, (_, stage) => {
    const record = module25.readInt16LE(MODULE_25_DATA_BASE + 0x0e16 + stage * 2);
    return {
      stage,
      record: record === -1 ? null : record,
      resources: record === -1 ? [] : ["SAY.SWF", "NUM.SWF", "CHA.SWF"],
      behavior: record === -1 ? "no module-25 story triplet" : "load the same record from resource indices 7, 9, and 10, then run the story renderer",
    };
  });
}

function formatModule29Address(fileOffset) {
  assert(fileOffset >= 0x10000 && fileOffset < 0x20000, `unexpected module-29 handler offset ${hex(fileOffset, 5)}`);
  return `1000:${(fileOffset - 0x10000).toString(16).toUpperCase().padStart(4, "0")}`;
}

function parseStageEventDispatcher(module29) {
  const start = 0x142a8;
  const expectedPrefix = Buffer.from("c70606001900a1772e40a30800", "hex");
  assert(module29.subarray(start, start + expectedPrefix.length).equals(expectedPrefix), "module 29 stage-event dispatcher prefix mismatch");
  let cursor = start + expectedPrefix.length;
  const handlers = [];
  while (module29[cursor] === 0xe8) {
    const target = cursor + 3 + module29.readInt16LE(cursor + 1);
    const prefix = module29.subarray(target, target + 8);
    assert(prefix[0] === 0x83 && prefix[1] === 0x3e && prefix[2] === 0x77 && prefix[3] === 0x2e, `${formatModule29Address(target)} does not begin with a current-stage comparison`);
    assert(prefix[5] === 0x74 && prefix[6] === 0x01 && prefix[7] === 0xc3, `${formatModule29Address(target)} stage guard differs from the expected form`);
    handlers.push({
      dispatchIndex: handlers.length,
      stage: prefix[4],
      handler: formatModule29Address(target),
      fileOffset: target,
    });
    cursor += 3;
  }
  assert(module29[cursor] === 0xcb, "module 29 far stage-event dispatcher does not end after its near-call list");
  assert(handlers.length === 38, `expected 38 stage-event handlers, got ${handlers.length}`);
  assert(new Set(handlers.map((handler) => handler.stage)).size === handlers.length, "stage-event dispatcher contains a duplicate stage guard");
  return {
    address: "1000:42A8",
    invocationSites: [
      { address: "0000:4DF5", timing: "after incrementing the full-round counter and applying round status ticks" },
      { address: "0000:4A74", timing: "after live victory 999 or loading completed-victory sentinel 1000" },
    ],
    defaultWritesOnEveryInvocation: { nextModule: 25, nextStage: "currentStage + 1" },
    handlerCount: handlers.length,
    stagesWithHandlers: handlers.map((handler) => handler.stage).sort((a, b) => a - b),
    stagesWithoutHandlersIn0To43: Array.from({ length: 44 }, (_, stage) => stage).filter((stage) => !handlers.some((handler) => handler.stage === stage)),
    handlers,
  };
}

function triggeredEvent(trigger, sayRecords = [], actions = [], extra = {}) {
  return { trigger, sayRecords, actions, ...extra };
}

const HANDLER_BEHAVIORS = {
  0: {
    classification: "scripted movement and dialogue",
    events: [
      triggeredEvent("round 1", [1], [{ op: "scriptedMove", side: 1, unitSlot: 0, from: cell(0x0488), to: cell(0x0531) }]),
      triggeredEvent("round 2", [2]),
      triggeredEvent("live victory 999", [3]),
    ],
  },
  1: {
    classification: "victory messenger entrance, dialogue, and route",
    events: [
      triggeredEvent("round 1", [5]),
      triggeredEvent("live victory 999", [6], [
        { op: "spawn", side: 1, unitSlot: 48, at: cell(0x06f9) },
        { op: "scriptedMove", side: 1, unitSlot: 48, from: cell(0x06f9), to: "cell of the unit found by portrait/resource id 0x2E" },
      ]),
    ],
  },
  2: { classification: "dialogue and route", events: [triggeredEvent("round 1", [155]), triggeredEvent("live victory 999", [175])] },
  3: { classification: "dialogue only", events: [triggeredEvent("round 1", [12]), triggeredEvent("live victory 999", [13])] },
  4: { classification: "dialogue and route", events: [triggeredEvent("round 1", [8]), triggeredEvent("live victory 999", [174])] },
  5: { classification: "dialogue and route", events: [triggeredEvent("round 1", [9]), triggeredEvent("live victory 999", [10])] },
  6: {
    classification: "victory reinforcement tableau and dialogue",
    events: [
      triggeredEvent("round 1", [15]),
      triggeredEvent("live victory 999", [16, 115], [
        { op: "spawnSequentialSide1Slots", slots: [0, 1, 2, 3, 4, 5, 6, 7], cells: [0x054c, 0x0581, 0x05b1, 0x05b4, 0x05e4, 0x0614, 0x0617, 0x0678].map(cell), nativeList: "DS:2E5F" },
        { op: "spawn", side: 1, unitSlot: 17, at: cell(0x05e7) },
        { op: "scriptedMove", side: 1, unitSlot: 17, from: cell(0x05e7), to: "cell of the unit found by portrait/resource id 0x2E" },
      ]),
    ],
  },
  7: { classification: "route only", events: [] },
  8: {
    classification: "dialogue, route, and preserved native omission",
    events: [
      triggeredEvent("round 1", [156]),
      triggeredEvent("live victory 999", [], [], {
        sayRecordWritesWithoutRenderer: [157],
        nativeQuirk: "the handler stores SAY record 157 after focusing a unit but never calls the battle-story renderer",
      }),
    ],
  },
  9: { classification: "dialogue and route", events: [triggeredEvent("round 1", [22]), triggeredEvent("live victory 999", [23])] },
  10: { classification: "route only", events: [] },
  11: {
    classification: "evacuation dialogue, board removal, and route",
    events: [
      triggeredEvent("round 1", [24, 25, 26], [{ op: "clearCell", at: cell(0x007e), removed: { side: 1, unitSlot: 9 } }]),
      triggeredEvent("live victory 999", [27]),
    ],
  },
  12: { classification: "dialogue only", events: [triggeredEvent("round 1", [30]), triggeredEvent("live victory 999", [31])] },
  13: { classification: "route only", events: [] },
  14: { classification: "dialogue, delayed enemy-AI reset, and route", events: [triggeredEvent("round 1", [33]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  15: { classification: "dialogue, delayed enemy-AI reset, and route", events: [triggeredEvent("round 1", [34]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  16: { classification: "dialogue, delayed enemy-AI reset, and route", events: [triggeredEvent("round 1", [35]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  17: { classification: "dialogue, delayed enemy-AI reset, and route", events: [triggeredEvent("round 1", [36]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  18: { classification: "dialogue, delayed enemy-AI reset, and route", events: [triggeredEvent("round 1", [37]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  19: { classification: "dialogue and delayed enemy-AI reset", events: [triggeredEvent("round 1", [38]), triggeredEvent("round 6 and every later active round", [], [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }])] },
  20: {
    classification: "guardian approach, enemy replacement, dragon battle, and victory tableau",
    events: [
      triggeredEvent("round 1", [40, 41, 71], [
        { op: "scriptedMove", side: 1, unitSlot: 32, from: cell(0x02d8), to: cell(0x036e) },
        { op: "clearAllCellsForSide", side: 2, removedStaticTemplateUnits: 16, nativeHelper: "1000:5319" },
        { op: "spawn", side: 2, unitSlot: 28, classRecord: 36, at: cell(0x033d) },
      ]),
      triggeredEvent("live victory 999", [72, 73, 74, 75], [
        { op: "spawn", side: 1, unitSlot: 7, at: cell(0x0348) },
        { op: "scriptedMove", side: 1, unitSlot: 7, from: cell(0x0348), to: cell(0x030f) },
      ]),
    ],
  },
  21: { classification: "scripted scouting interlude and route", events: [triggeredEvent("round 1", [43, 44], [{ op: "seeDetailedScene", stage: 21 }])] },
  22: { classification: "scripted round-1 ambush", events: [triggeredEvent("round 1", [76, 77, 78, 79], [{ op: "seeDetailedScene", stage: 22 }])] },
  23: { classification: "dialogue and route", events: [triggeredEvent("round 1", [46])] },
  24: { classification: "dialogue and route", events: [triggeredEvent("round 1", [47]), triggeredEvent("live victory 999", [48])] },
  26: { classification: "dialogue and route", events: [triggeredEvent("round 1", [49]), triggeredEvent("live victory 999", [50])] },
  27: { classification: "dialogue only", events: [triggeredEvent("round 1", [51]), triggeredEvent("live victory 999", [52])] },
  28: { classification: "dialogue only", events: [triggeredEvent("round 1", [54]), triggeredEvent("live victory 999", [55])] },
  30: {
    classification: "dialogue and runtime class-array mutation",
    detailStatus: "opening mutation and the downstream multi-class defeat/conversion sequence are closed",
    events: [
      triggeredEvent("round 1", [58], [
        { op: "focusCell", at: cell(0x036e), unit: { side: 2, unitSlot: 27, classRecord: 35, className: "女帝" } },
        {
          op: "contextualBattleLine",
          selector: 0x22,
          entry: "0000:C97A",
          textAddress: "DS:8762",
          text: "我．．．我好難過．．．|頭好痛啊！",
          renderer: "0000:0304 -> 03D8 -> 04EF",
        },
        { op: "setSide2ClassRecord", unitSlot: 27, from: 35, to: 0, address: "DS:55AE + slot*2", boardOccupancyChanged: false },
        { op: "rebuildAllSide2UnitSlotStates", slots: 57, entry: "0000:537B" },
      ]),
      triggeredEvent("live victory 999", [59]),
    ],
  },
  31: { classification: "dialogue and route", events: [triggeredEvent("round 1", [61]), triggeredEvent("live victory 999", [62])] },
  32: { classification: "dialogue and route", events: [triggeredEvent("round 1", [63]), triggeredEvent("live victory 999", [64])] },
  33: { classification: "dialogue and route", events: [triggeredEvent("round 1", [65])] },
  34: { classification: "dialogue and route", events: [triggeredEvent("round 1", [66])] },
  35: { classification: "dialogue and route", events: [triggeredEvent("round 1", [67]), triggeredEvent("live victory 999", [68])] },
  36: { classification: "dialogue and route", events: [triggeredEvent("round 1", [80])] },
  37: { classification: "final-boss dialogue and ending route", events: [triggeredEvent("round 1", [81])] },
  38: { classification: "postgame-rematch dialogue and terminal module route", events: [triggeredEvent("round 1", [164]), triggeredEvent("live victory 999", [165])] },
  42: { classification: "portal victory tableau and route", events: [triggeredEvent("live victory 999", [11, 18, 20, 19], [{ op: "seeDetailedScene", stage: 42 }])] },
};

const ROUTE_OVERRIDES = {
  1: { nextModule: 27, nextStage: 2 },
  2: { nextModule: 27, nextStage: 3 },
  4: { nextModule: 27, nextStage: 5 },
  5: { nextModule: 27, nextStage: 42 },
  7: { nextStage: 8 },
  8: { nextModule: 27, nextStage: 9 },
  9: { nextModule: 27, nextStage: 11 },
  10: { nextStage: 12 },
  11: { nextStage: 10 },
  13: { nextModule: 27, nextStage: 14 },
  14: { nextModule: 27, nextStage: 15 },
  15: { nextModule: 27, nextStage: 16 },
  16: { nextModule: 27, nextStage: 17 },
  17: { nextModule: 27, nextStage: 18 },
  18: { nextModule: 27, nextStage: 19 },
  20: { nextStage: 21 },
  21: { nextModule: 27, nextStage: 22 },
  23: { nextModule: 27, nextStage: 24 },
  24: { nextModule: 27, nextStage: 26 },
  26: { nextModule: 27, nextStage: 27 },
  30: { nextStage: 31 },
  31: { nextModule: 27, nextStage: 32 },
  32: { nextModule: 27, nextStage: 33 },
  33: { nextModule: 27, nextStage: 34 },
  34: { nextModule: 27, nextStage: 35 },
  35: { nextModule: 27, nextStage: 36 },
  36: { nextModule: 27, nextStage: 37 },
  37: { nextStage: 49 },
  38: { nextModule: 46 },
  42: { nextStage: 6 },
};

const SPECIAL_CALL_EXPECTATIONS = {
  0: { scriptedMove: 1 },
  1: { cellWrite: 1, scriptedMove: 1, loadUnitForCell: 1 },
  6: { cellWrite: 1, scriptedMove: 1, spawnCellList: 1 },
  11: { cellWrite: 1 },
  14: { delayedAiReset: 1 },
  15: { delayedAiReset: 1 },
  16: { delayedAiReset: 1 },
  17: { delayedAiReset: 1 },
  18: { delayedAiReset: 1 },
  19: { delayedAiReset: 1 },
  20: { cellWrite: 2, scriptedMove: 2, clearAllSide2: 1, loadUnitForCell: 2 },
  21: { cellWrite: 4, scriptedMove: 4 },
  22: { cellWrite: 10, scriptedMove: 2 },
  30: { loadUnitForCell: 1, contextualBattleLine: 1, rebuildSide2States: 1 },
  42: { cellWrite: 2, scriptedMove: 2, lightning4: 1 },
};

function directWordWrites(bytes, address) {
  const values = [];
  for (let offset = 0; offset <= bytes.length - 6; offset += 1) {
    if (bytes[offset] === 0xc7 && bytes[offset + 1] === 0x06 && bytes.readUInt16LE(offset + 2) === address) {
      values.push(bytes.readUInt16LE(offset + 4));
    }
  }
  return values;
}

function nearCallCount(bytes, fileOffset, targetFileOffset) {
  let count = 0;
  for (let offset = 0; offset <= bytes.length - 3; offset += 1) {
    if (bytes[offset] !== 0xe8) continue;
    const target = fileOffset + offset + 3 + bytes.readInt16LE(offset + 1);
    if (target === targetFileOffset) count += 1;
  }
  return count;
}

function farCallCount(bytes, targetFileOffset) {
  let count = 0;
  for (let offset = 0; offset <= bytes.length - 5; offset += 1) {
    if (bytes[offset] !== 0x9a) continue;
    const target = bytes.readUInt16LE(offset + 3) * 16 + bytes.readUInt16LE(offset + 1);
    if (target === targetFileOffset) count += 1;
  }
  return count;
}

function comparedRoundOrOutcomeValues(bytes) {
  const values = [];
  for (let offset = 0; offset < bytes.length; offset += 1) {
    if (offset <= bytes.length - 6 && bytes[offset] === 0x81 && bytes[offset + 1] === 0x3e && bytes.readUInt16LE(offset + 2) === 0x2f83) {
      values.push(bytes.readUInt16LE(offset + 4));
    }
    else if (offset <= bytes.length - 5 && bytes[offset] === 0x83 && bytes[offset + 1] === 0x3e && bytes.readUInt16LE(offset + 2) === 0x2f83) {
      values.push(bytes[offset + 4]);
    }
  }
  return [...new Set(values)];
}

function sameNumbers(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function parseStageHandlerCatalog(module29, dispatcher) {
  const orderedByAddress = [...dispatcher.handlers].sort((a, b) => a.fileOffset - b.fileOffset);
  const boundaries = new Map(orderedByAddress.map((handler, index) => [
    handler.stage,
    { start: handler.fileOffset, end: orderedByAddress[index + 1]?.fileOffset ?? 0x151e5 },
  ]));

  const handlers = dispatcher.handlers
    .map((binding) => {
      const behavior = HANDLER_BEHAVIORS[binding.stage];
      assert(behavior, `missing manual behavior classification for stage ${binding.stage}`);
      const { start, end } = boundaries.get(binding.stage);
      const bytes = module29.subarray(start, end);
      const sayRecordWrites = directWordWrites(bytes, 0x80b5);
      const expectedSayRecordWrites = behavior.events.flatMap((event) => [
        ...event.sayRecords,
        ...(event.sayRecordWritesWithoutRenderer ?? []),
      ]);
      assert(sameNumbers(sayRecordWrites, expectedSayRecordWrites), `stage ${binding.stage}: SAY record-write classification mismatch (${sayRecordWrites} != ${expectedSayRecordWrites})`);
      const storyRendererCalls = farCallCount(bytes, 0x0bab8);
      const expectedStoryRendererCalls = behavior.events.reduce((sum, event) => sum + event.sayRecords.length, 0);
      assert(storyRendererCalls === expectedStoryRendererCalls, `stage ${binding.stage}: battle-story call classification mismatch`);

      const defaultRoute = { nextModule: 25, nextStage: binding.stage + 1 };
      const resolvedRoute = { ...defaultRoute, ...(ROUTE_OVERRIDES[binding.stage] ?? {}) };
      const nativeNextModuleWrites = directWordWrites(bytes, 0x0006);
      const nativeNextStageWrites = directWordWrites(bytes, 0x0008);
      if (nativeNextModuleWrites.length > 0) assert(nativeNextModuleWrites.at(-1) === resolvedRoute.nextModule, `stage ${binding.stage}: next-module write differs from classified route`);
      if (nativeNextStageWrites.length > 0) assert(nativeNextStageWrites.at(-1) === resolvedRoute.nextStage, `stage ${binding.stage}: next-stage write differs from classified route`);

      const specialCallCounts = {
        cellWrite: nearCallCount(bytes, start, 0x151e5),
        scriptedMove: farCallCount(bytes, 0x17df7),
        spawnCellList: nearCallCount(bytes, start, 0x1533e),
        delayedAiReset: nearCallCount(bytes, start, 0x1536a),
        clearAllSide2: nearCallCount(bytes, start, 0x15319),
        loadUnitForCell: farCallCount(bytes, 0x05058),
        contextualBattleLine: farCallCount(bytes, 0x0c97a),
        rebuildSide2States: farCallCount(bytes, 0x0537b),
        lightning4: farCallCount(bytes, 0x16084),
      };
      for (const [signal, expected] of Object.entries(SPECIAL_CALL_EXPECTATIONS[binding.stage] ?? {})) {
        assert(specialCallCounts[signal] === expected, `stage ${binding.stage}: ${signal} call count ${specialCallCounts[signal]} != ${expected}`);
      }

      return {
        stage: binding.stage,
        dispatchIndex: binding.dispatchIndex,
        handler: binding.handler,
        fileOffset: start,
        endAddress: formatModule29Address(end),
        bytes: bytes.length,
        sha256: sha256(bytes),
        classification: behavior.classification,
        controlFlowStatus: "closed",
        detailStatus: behavior.detailStatus ?? "event triggers, SAY records, direct state changes, and outcome route closed",
        events: behavior.events,
        outcomeRouting: {
          liveVictory999: resolvedRoute,
          loadedVictory1000: { ...resolvedRoute, presentationReplayed: false },
          source: ROUTE_OVERRIDES[binding.stage] ? "handler writes merged over dispatcher defaults" : "dispatcher defaults; handler makes no transition override",
          stage42ReturnBridge: binding.stage === 42 ? { actualNextModule: 27, condition: "module29 sees nextStage == 6 before returning" } : undefined,
          stage38Module46Terminal: binding.stage === 38 ? { normalReturnReachable: false, terminalFunction: "module46 0000:03CE", unreachableTrailingWrites: { nextModule: 27, nextStage: 38 } } : undefined,
        },
        nativeSignals: {
          comparedRoundOrOutcomeValues: comparedRoundOrOutcomeValues(bytes),
          sayRecordWrites,
          storyRendererCalls,
          nextModuleWrites: nativeNextModuleWrites,
          nextStageWrites: nativeNextStageWrites,
          specialCallCounts: Object.fromEntries(Object.entries(specialCallCounts).filter(([, count]) => count > 0)),
        },
      };
    })
    .sort((a, b) => a.stage - b.stage);

  assert(handlers.length === 38 && handlers.every((handler) => handler.controlFlowStatus === "closed"), "not all stage-event handlers are structurally closed");
  return {
    scope: "all 38 handlers called by 1000:42A8; stages without a handler retain dispatcher defaults and have no event entry here",
    status: "38/38 handler control flow, dialogue record selection, direct event state changes, and outcome routing classified",
    stage30DownstreamRule: "the opening class-array reset seeds a deterministic difficulty-sized sequence of class records; the defeated-enemy handler advances the record until converting the cell to side 1 slot 23",
    handlers,
    handlerStages: handlers.map((handler) => handler.stage),
    dialogueRecordIds: [...new Set(handlers.flatMap((handler) => handler.nativeSignals.sayRecordWrites))].sort((a, b) => a - b),
    dynamicBoardStages: [0, 1, 6, 11, 20, 21, 22, 42],
    otherRuntimeStateStages: [14, 15, 16, 17, 18, 19, 30],
    dialogueOrRouteOnlyStages: handlers.map((handler) => handler.stage).filter((stage) => ![0, 1, 6, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 30, 42].includes(stage)),
  };
}

function buildStage30MultiClassSequence(templates, objectives, descriptors, titleFlow) {
  const template = templates.stages.find((stage) => stage.stage === 30);
  assert(template, "battle templates do not contain stage 30");
  const initial = template.activeUnitInstances.filter((unit) => unit.side === 2);
  assert(initial.length === 1 && initial[0].unitSlot === 27 && initial[0].descriptorClass === 35, "stage 30 initial Empress instance changed");
  const objective = objectiveForStage(objectives, 30);
  assert(objective.victory.kind === "required_side2_slot_absent" && objective.victory.unitSlot === 27, "stage 30 victory target changed");

  const difficultyLimits = [
    { lvHard: 0, classRecordLimitExclusive: 8 },
    { lvHard: 1, classRecordLimitExclusive: 16 },
    { lvHard: 2, classRecordLimitExclusive: 24 },
    { lvHard: 3, classRecordLimitExclusive: 32 },
  ].map((entry) => ({
    ...entry,
    uiLabel: titleFlow.difficultyMenu.options.find((option) => option.value === entry.lvHard)?.label,
    enemyFormsToDefeat: entry.classRecordLimitExclusive,
    sequence: descriptors.records.slice(0, entry.classRecordLimitExclusive).map((record) => ({ record: record.record, name: record.normalizedName })),
  }));

  return {
    stage: 30,
    status: "closed",
    initialTemplateUnit: initial[0],
    objective,
    difficultyState: {
      module29Address: "DS:0000",
      overlayParentBinding: "GO symbol LV_HARD at 146A:0064; module29 exports DS:0000 through parent-state offset 22h from the 42h block base",
      knownValues: [0, 1, 2, 3],
      uiLabels: titleFlow.difficultyMenu.options.map(({ value, label }) => ({ value, label })),
      uiLabelStatus: "closed by the module-23 native difficulty menu and its shared save-slot label table",
    },
    openingRound1: {
      effect: "SAY 58, focus side-2 slot 27 at cell 036Eh, then show selector-22h contextual line ‘我．．．我好難過．．．|頭好痛啊！’ through the standard battle outcome-dialogue window",
      mutation: "set the side-2 slot-27 class record from 35 Empress to 0 Soldier without clearing its board cell, then rebuild all 57 side-2 slot states",
    },
    onEachSide2Defeat: {
      entry: "0000:9733",
      precondition: "currentStage == 30 and defeated unit side == 2",
      steps: [
        "clear the defeated unit state's +02h accumulated experience",
        "show selector-22h contextual line ‘我．．．我好難過．．．|頭好痛啊！’ through 0000:C97A -> 0304 -> 03D8 -> 04EF",
        "compute nextClassRecord = currentClassRecord + 1",
        "if nextClassRecord is below the LV_HARD-dependent limit, write it to side-2 DS:55AE[slot] and rebuild all 57 side-2 slot states",
        "otherwise write class record 35 Empress to side-1 slot 23, rewrite the same board cell as side 1 / slot 23, and rebuild all 57 side-1 slot states",
      ],
      deterministic: true,
      notRandom: "0000:97B2 only maps LV_HARD to a class-record limit; it does not read PIT or any random source",
    },
    difficultyLimits,
    hardDifficultyEnemyBonus: {
      condition: "LV_HARD == 3 and current side == 2",
      formula: "attack, current/base attack, defense, current/base defense, and maximum life each become value + floor(value/2)",
      multiplierDescription: "1.5x with floor on the added half",
      entry: "1000:8BD1",
    },
    finalConversion: {
      playerClassArrayWrite: { side: 1, unitSlot: 23, classRecord: 35, className: "女帝" },
      boardRewrite: { from: { side: 2, unitSlot: 27 }, to: { side: 1, unitSlot: 23 }, cell: "the current defeated-unit cell" },
      victoryConsequence: "side-2 slot 27 is no longer present, so the stage-30 victory condition becomes true",
      liveVictoryDialogue: 59,
    },
  };
}

function objectiveForStage(objectives, stage) {
  const defeat = objectives.tables.defeat.entries.find((entry) => entry.stage === stage)?.condition;
  const victory = objectives.tables.victory.entries.find((entry) => entry.stage === stage)?.condition;
  assert(defeat && victory, `no complete objective pair for stage ${stage}`);
  return { defeat, victory };
}

function classInfo(descriptors, classRecord, inheritsCampaignClass = false) {
  if (inheritsCampaignClass) return { classRecord: null, className: null, classSource: "campaign state imported before template sparse overrides" };
  const descriptor = descriptors.records.find((record) => record.record === classRecord);
  assert(descriptor, `missing native descriptor record ${classRecord}`);
  return { classRecord, className: descriptor.normalizedName, classSource: "B.SWF stage class array" };
}

function stagedUnit(template, descriptors, side, unitSlot) {
  const array = side === 1 ? template.classArrays.side1SparseOverrides : template.classArrays.side2;
  const classRecord = array[unitSlot];
  return {
    side,
    unitSlot,
    ...classInfo(descriptors, classRecord, side === 1 && classRecord === 0),
  };
}

function spawn(template, descriptors, side, unitSlot, targetCell, extra = {}) {
  return { op: "spawn", unit: stagedUnit(template, descriptors, side, unitSlot), at: cell(targetCell), ...extra };
}

function move(side, unitSlot, source, destination) {
  return {
    op: "scriptedMove",
    side,
    unitSlot,
    from: cell(source),
    to: cell(destination),
    rangeSetup: { unitCode: "0A", propagationMode: "FM", budget: 50 },
  };
}

function story(script) {
  return { op: "battleStory", sayRecord: script };
}

function buildScenes(templates, objectives, descriptors, stageStoryRecords) {
  const stage21 = templates.stages.find((stage) => stage.stage === 21);
  const stage22 = templates.stages.find((stage) => stage.stage === 22);
  const stage37 = templates.stages.find((stage) => stage.stage === 37);
  const stage38 = templates.stages.find((stage) => stage.stage === 38);
  const stage42 = templates.stages.find((stage) => stage.stage === 42);
  assert(stage21 && stage22 && stage37 && stage38 && stage42, "battle templates do not contain all target stages");

  assert(stage21.activeSide1Count === 0 && stage21.activeSide2Count === 0 && !stage21.deployment.required, "stage 21 static-template assumptions changed");
  assert(stage22.activeSide1Count === 1 && stage22.activeSide2Count === 0 && stage22.deployment.openCellCount === 18, "stage 22 static-template assumptions changed");
  assert(stage37.activeSide1Count === 1 && stage37.activeSide2Count === 3 && stage37.deployment.openCellCount === 26, "stage 37 static-template assumptions changed");
  assert(stage38.activeSide1Count === 2 && stage38.activeSide2Count === 44 && stage38.deployment.openCellCount === 18, "stage 38 static-template assumptions changed");
  assert(stage42.activeSide1Count === 10 && stage42.activeSide2Count === 0 && !stage42.deployment.required, "stage 42 static-template assumptions changed");

  const stage21Units = [
    { slot: 0, source: 0x50c, destination: 0x81e },
    { slot: 1, source: 0x4db, destination: 0x852 },
    { slot: 24, source: 0x4d9, destination: 0x7ec },
    { slot: 8, source: 0x53c, destination: 0x84f },
  ];
  const stage22Enemies = [
    { slot: 2, at: 0x7b5 },
    { slot: 28, at: 0x4c6 },
    { slot: 40, at: 0x667 },
    { slot: 41, at: 0x6cb },
    { slot: 42, at: 0x7e8 },
    { slot: 43, at: 0x7e6 },
  ];

  const result = [
    {
      stage: 21,
      handler: "1000:4B72",
      kind: "scripted scouting interlude",
      staticTemplate: {
        bRecord: stage21.bRecord,
        sha256: stage21.sha256,
        activeSide1: 0,
        activeSide2: 0,
        deploymentCells: 0,
      },
      objective: objectiveForStage(objectives, 21),
      module25StoryRecord: stageStoryRecords[21].record,
      round1: [
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        ...stage21Units.flatMap(({ slot, source }) => [
          { op: "focusCell", at: cell(source), note: "native code focuses and redraws before writing the unit" },
          spawn(stage21, descriptors, 1, slot, source, { precededByCellFocus: true, directRedrawAfterWrite: false }),
        ]),
        story(43),
        ...stage21Units.map(({ slot, source, destination }) => move(1, slot, source, destination)),
        story(44),
      ],
      stateAfterRound1Event: {
        activeScriptedUnits: stage21Units.map(({ slot, destination }) => ({ ...stagedUnit(stage21, descriptors, 1, slot), at: cell(destination) })),
        activeScriptedEnemies: [],
        consequence: "the defeat guard now finds side-1 slot 0, while the all-side-2-absent victory guard is immediately true",
      },
      outcomes: {
        999: { nextModule: 27, nextStage: 22 },
        1000: { nextModule: 27, nextStage: 22, presentationReplayed: false },
      },
      interpretation: "not a player combat: the first-round event creates and moves four scouts, dialogue runs, victory resolves immediately, and the game enters stage-22 deployment directly",
    },
    {
      stage: 22,
      handler: "1000:4C88",
      kind: "deployment battle with a scripted round-1 ambush",
      staticTemplate: {
        bRecord: stage22.bRecord,
        sha256: stage22.sha256,
        activeSide1: 1,
        activeSide2: 0,
        fixedSide1Slots: stage22.deployment.fixedPlayerUnitSlots,
        deploymentCells: stage22.deployment.openCellCount,
        eligibleRosterSlots: stage22.deployment.eligibleUnitSlots,
        maximumPlayerUnits: stage22.deployment.maximumPlayerUnitCount,
      },
      objective: objectiveForStage(objectives, 22),
      module25StoryRecord: null,
      module25StorySkippedBy: "stage-21 outcome writes nextModule=27,nextStage=22",
      round1: [
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        { op: "focusCell", at: cell(0x5ca), note: "native code focuses and redraws before writing the temporary entrant" },
        spawn(stage22, descriptors, 1, 23, 0x5ca, { precededByCellFocus: true, directRedrawAfterWrite: false, temporary: true }),
        move(1, 23, 0x5ca, 0x68e),
        { op: "focusCell", at: cell(0x5cb), note: "the next write deliberately reuses cell 0x05CA rather than the focused 0x05CB" },
        spawn(stage22, descriptors, 1, 7, 0x5ca, { temporary: true, originalFocusCellMismatch: cell(0x5cb) }),
        move(1, 7, 0x5ca, 0x6c1),
        story(76),
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(77),
        spawn(stage22, descriptors, 2, 2, 0x7b5),
        { op: "focusCell", at: cell(0x7b5) },
        story(78),
        spawn(stage22, descriptors, 2, 28, 0x4c6),
        { op: "focusCell", at: cell(0x4c6) },
        story(79),
        { op: "clearCell", at: cell(0x68e), removed: { side: 1, unitSlot: 23 }, reason: "temporary story entrant leaves the active board" },
        { op: "clearCell", at: cell(0x6c1), removed: { side: 1, unitSlot: 7 }, reason: "temporary story entrant leaves the active board" },
        ...stage22Enemies.slice(2).map(({ slot, at }) => spawn(stage22, descriptors, 2, slot, at)),
      ],
      stateAfterRound1Event: {
        playerDeployment: "preserved from JUST.TST; the two temporary side-1 story units have been removed",
        addedEnemies: stage22Enemies.map(({ slot, at }) => ({ ...stagedUnit(stage22, descriptors, 2, slot), at: cell(at) })),
        victoryTarget: { side: 2, unitSlot: 28, at: cell(0x4c6) },
        nonRequiredEnemySlots: [2, 40, 41, 42, 43],
      },
      outcomes: {
        999: { nextModule: 25, nextStage: 23, source: "dispatcher default; the stage-22 handler does not override it" },
        1000: { nextModule: 25, nextStage: 23, presentationReplayed: false },
      },
      interpretation: "the six enemies are absent from the static side map and become active only after the round-1 story; destroying side-2 slot 28 alone satisfies victory",
      originalQuirk: "slot 7 is focused at cell 0x05CB but written to the now-vacant staging cell 0x05CA; this exact mismatch is present in native code",
    },
    {
      stage: 37,
      handler: "1000:515C",
      kind: "multi-part final boss battle followed by the main-ending route",
      staticTemplate: {
        bRecord: stage37.bRecord,
        sha256: stage37.sha256,
        activeSide1: stage37.activeSide1Count,
        activeSide2: stage37.activeSide2Count,
        activeUnits: stage37.activeUnitInstances,
        fixedSide1Slots: stage37.deployment.fixedPlayerUnitSlots,
        deploymentCells: stage37.deployment.openCellCount,
        eligibleRosterSlots: stage37.deployment.eligibleUnitSlots,
        maximumPlayerUnits: stage37.deployment.maximumPlayerUnitCount,
      },
      objective: objectiveForStage(objectives, 37),
      module25StoryRecord: stageStoryRecords[37].record,
      round1: [
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(81),
      ],
      outcomes: {
        999: { nextModule: 25, nextStage: 49, source: "handler overrides only the dispatcher's default nextStage" },
        1000: { nextModule: 25, nextStage: 49, presentationReplayed: false },
      },
      routingAfterVictory: {
        stage49StoryRecord: 70,
        module25Exit: { nextModule: 33, condition: "currentStage == 49" },
        module33OverlayParentSeed: { nextModule: 35 },
        module35OverlayParentSeed: { nextModule: 27, nextStage: 38 },
        exactSequence: [
          "module29 stage37 victory",
          "module25 internal stage49 story triplet record 70",
          "module33 presentation",
          "module35 presentation/bridge",
          "module27 stage38 deployment/JUST",
          "module29 stage38 bonus battle",
        ],
      },
      interpretation: "the three-part boss battle protects side-1 slot 0 and requires all three boss parts to be removed; its round-1 event is dialogue-only, and victory deliberately skips stage 38 until the stage-49/module-33/module-35 postgame chain has run",
    },
    {
      stage: 38,
      handler: "1000:5197",
      kind: "postgame otherworld rematch",
      staticTemplate: {
        bRecord: stage38.bRecord,
        sha256: stage38.sha256,
        activeSide1: stage38.activeSide1Count,
        activeSide2: stage38.activeSide2Count,
        fixedSide1Slots: stage38.deployment.fixedPlayerUnitSlots,
        deploymentCells: stage38.deployment.openCellCount,
        eligibleRosterSlots: stage38.deployment.eligibleUnitSlots,
        maximumPlayerUnits: stage38.deployment.maximumPlayerUnitCount,
      },
      objective: objectiveForStage(objectives, 38),
      module25StoryRecord: stageStoryRecords[38].record,
      round1: [
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(164),
      ],
      liveVictory999: [
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(165),
        { op: "setNextModule", nextModule: 46 },
      ],
      completedSave1000: [
        { op: "setNextModule", nextModule: 46, note: "skip the live-victory SAY 165 replay" },
      ],
      module46UnreachableOverlayParentWrites: {
        nextModule: 27,
        nextStage: 38,
        address: "0000:0101-0128",
        reachable: false,
        reason: "the preceding call enters module46 0000:03CE, which reaches the infinite final-screen loop at 0000:0725 and also has a defensive self-loop at 0000:0430",
      },
      interpretation: "SAY 164 explicitly frames this as enemies returning through the otherworld gate and demanding another challenge; SAY 165 declares peace after victory, then module 46 runs non-returning credits and a permanent The-end animation",
    },
    {
      stage: 42,
      handler: "1000:457F",
      kind: "immediate-victory portal bridge",
      staticTemplate: {
        bRecord: stage42.bRecord,
        sha256: stage42.sha256,
        activeSide1: 10,
        activeSide2: 0,
        activeUnits: stage42.activeUnitInstances,
        deploymentCells: 0,
      },
      objective: objectiveForStage(objectives, 42),
      module25StoryRecord: stageStoryRecords[42].record,
      round1: [],
      liveVictory999: [
        { op: "focusPortraitResource", portraitResourceId: 0x0e },
        move(1, 0, 0x4fa, 0x4c8),
        story(11),
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(18),
        { op: "focusCell", at: cell(0x52d), unit: { side: 1, unitSlot: 24 } },
        move(1, 24, 0x52d, 0x4c9),
        story(20),
        { op: "lightning4", target: cell(0x464), targetSide: 1, radiusOrRange: 7, targetUnit: { ...stagedUnit(stage42, descriptors, 1, 7) }, nativeHandler: "1000:6084" },
        { op: "clearCell", at: cell(0x464), removed: { side: 1, unitSlot: 7, classRecord: 3, className: "魔祭師" }, reason: "portal-story departure after the lightning presentation; do not model as an ordinary combat death" },
        { op: "clearCell", at: cell(0x463), removed: { side: 1, unitSlot: 23, classRecord: 35, className: "女帝" }, reason: "portal-story departure; do not model as an ordinary combat death" },
        { op: "focusPortraitResource", portraitResourceId: 0x2e },
        story(19),
        { op: "setNextStage", nextStage: 6 },
      ],
      completedSave1000: [
        { op: "setNextStage", nextStage: 6, note: "skip all live presentation and board mutations" },
      ],
      routingAfterHandler: {
        dispatcherDefaultNextModule: 25,
        handlerNextStage: 6,
        module29ReturnBridge: { nextModule: 27, condition: "nextStage == 6" },
        module27AfterPreparation: { nextModule: 25, condition: "currentStage == 6" },
        module25AfterStory: { nextModule: 29, condition: "currentStage == 6" },
        exactSequence: ["module29 stage42 outcome", "module27 stage6 deployment/JUST", "module25 stage6 story triplet record 14", "module29 stage6 battle"],
      },
      interpretation: "the empty side-2 map makes victory immediate; live outcome 999 plays the portal scene, while loaded sentinel 1000 only restores the same stage-6 route",
    },
  ];

  assert(result[0].outcomes[999].nextStage === 22, "stage 21 transition validation failed");
  assert(result[1].stateAfterRound1Event.addedEnemies.length === 6, "stage 22 enemy population validation failed");
  assert(result[1].stateAfterRound1Event.victoryTarget.unitSlot === 28, "stage 22 victory-target validation failed");
  assert(result[2].routingAfterVictory.exactSequence.length === 6, "stage 37 postgame route validation failed");
  assert(result[3].staticTemplate.activeSide2 === 44, "stage 38 rematch population validation failed");
  assert(result[4].routingAfterHandler.exactSequence.length === 4, "stage 42 route validation failed");
  return result;
}

async function loadNarrativeScripts(dialogueDirectory, ids) {
  return Promise.all(ids.map(async (id) => {
    const fileName = `${id.toString().padStart(4, "0")}.json`;
    const sourcePath = path.join(dialogueDirectory, fileName);
    const buffer = await readFile(sourcePath);
    const parsed = JSON.parse(buffer.toString("utf8"));
    assert(Array.isArray(parsed.actions), `${sourcePath}: missing dialogue actions`);
    return {
      sayRecord: id,
      parsedPath: sourcePath,
      parsedSha256: sha256(buffer),
      source: parsed.source,
      text: parsed.actions.filter((action) => action.op === "text").map((action) => action.text),
      speakerComments: [...new Set(parsed.actions.map((action) => action.comment).filter(Boolean))],
    };
  }));
}

async function extract(module25Path, module27Path, module29Path, module33Path, module35Path, module46Path, templatesPath, objectivesPath, descriptorsPath, titleFlowPath, dialogueDirectory, outputPath) {
  const [module25, module27, module29, module33, module35, module46, templatesBuffer, objectivesBuffer, descriptorsBuffer, titleFlowBuffer] = await Promise.all([
    readFile(module25Path), readFile(module27Path), readFile(module29Path), readFile(module33Path), readFile(module35Path), readFile(module46Path), readFile(templatesPath), readFile(objectivesPath), readFile(descriptorsPath), readFile(titleFlowPath),
  ]);
  const modules = { 25: module25, 27: module27, 29: module29, 33: module33, 35: module35, 46: module46 };
  const templates = JSON.parse(templatesBuffer.toString("utf8"));
  const objectives = JSON.parse(objectivesBuffer.toString("utf8"));
  const descriptors = JSON.parse(descriptorsBuffer.toString("utf8"));
  const titleFlow = JSON.parse(titleFlowBuffer.toString("utf8"));
  assert(titleFlow.difficultyMenu.options.map((option) => option.label).join("|") === "過關斬將|勢均力敵|困難重重|無法無天", "title-flow difficulty labels changed");
  const verifiedCodeAndDataRanges = verifyRanges(modules);
  const stageMagicRecords = parseStageMagicRecords(module25);
  const stageStoryRecords = parseStageStoryRecords(module25);
  const dispatcher = parseStageEventDispatcher(module29);
  const handlerBehaviorCatalog = parseStageHandlerCatalog(module29, dispatcher);
  const stage30MultiClassSequence = buildStage30MultiClassSequence(templates, objectives, descriptors, titleFlow);
  const scenes = buildScenes(templates, objectives, descriptors, stageStoryRecords);
  const narrativeScripts = await loadNarrativeScripts(dialogueDirectory, [...new Set([...handlerBehaviorCatalog.dialogueRecordIds, 70])].sort((a, b) => a - b));

  assert(stageMagicRecords.duplicateStages.length === 1 && stageMagicRecords.duplicateStages[0].stage === 38, "module 25 duplicate-stage table quirk changed");
  assert(stageStoryRecords[21].record === 42 && stageStoryRecords[22].record === null && stageStoryRecords[42].record === null, "target-stage story table values changed");
  assert(dispatcher.handlers.find((handler) => handler.stage === 21)?.handler === "1000:4B72", "stage 21 dispatcher binding changed");
  assert(dispatcher.handlers.find((handler) => handler.stage === 22)?.handler === "1000:4C88", "stage 22 dispatcher binding changed");
  assert(dispatcher.handlers.find((handler) => handler.stage === 37)?.handler === "1000:515C", "stage 37 dispatcher binding changed");
  assert(dispatcher.handlers.find((handler) => handler.stage === 38)?.handler === "1000:5197", "stage 38 dispatcher binding changed");
  assert(dispatcher.handlers.find((handler) => handler.stage === 42)?.handler === "1000:457F", "stage 42 dispatcher binding changed");

  const output = {
    format: "ANGEL2 native per-stage battle events and campaign routing",
    semanticVersion: 4,
    sources: [
      { module: 25, path: module25Path, bytes: module25.length, sha256: sha256(module25) },
      { module: 27, path: module27Path, bytes: module27.length, sha256: sha256(module27) },
      { module: 29, path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      { module: 33, path: module33Path, bytes: module33.length, sha256: sha256(module33) },
      { module: 35, path: module35Path, bytes: module35.length, sha256: sha256(module35) },
      { module: 46, path: module46Path, bytes: module46.length, sha256: sha256(module46) },
      { kind: "battleTemplates", path: templatesPath, bytes: templatesBuffer.length, sha256: sha256(templatesBuffer) },
      { kind: "battleObjectives", path: objectivesPath, bytes: objectivesBuffer.length, sha256: sha256(objectivesBuffer) },
      { kind: "unitDescriptors", path: descriptorsPath, bytes: descriptorsBuffer.length, sha256: sha256(descriptorsBuffer) },
      { kind: "titleFlow", path: titleFlowPath, bytes: titleFlowBuffer.length, sha256: sha256(titleFlowBuffer) },
    ],
    verifiedCodeAndDataRanges,
    module25CampaignStory: {
      currentStage: "DS:026A",
      stageMagicRecords,
      stageStoryRecords,
      exitRouting: {
        default: { nextModule: 27 },
        stage6: { nextModule: 29 },
        stage49: { nextModule: 33 },
      },
    },
    module27BattlePreparation: {
      currentStage: "DS:02B6",
      behavior: "prepare B.SWF template, run deployment when an FF cell exists, and write JUST.TST",
      exitRouting: {
        default: { nextModule: 29 },
        stage6: { nextModule: 25 },
      },
    },
    module29BattleRuntime: {
      currentStage: "DS:2E77",
      roundOrOutcome: "DS:2F83",
      dispatcher,
      handlerBehaviorCatalog,
      stage30MultiClassSequence,
      stage6ReturnBridge: "after battle return, nextStage 6 forces nextModule 27 regardless of DS:0006",
    },
    ordinaryPreBattleOrder: ["module25 optional stage story", "module27 template/deployment/JUST", "module29 battle"],
    stage6PreBattleOrder: ["module27 template/deployment/JUST", "module25 stage-6 story", "module29 battle"],
    postgameOrder: ["module29 stage37 victory", "module25 stage49 story 70", "module33", "module35", "module27 stage38 deployment/JUST", "module29 stage38 bonus battle", "module46"],
    scenes,
    narrativeScripts,
    validation: {
      verifiedRangeCount: verifiedCodeAndDataRanges.length,
      dispatcherHandlerCount: dispatcher.handlerCount,
      structurallyClosedHandlerCount: handlerBehaviorCatalog.handlers.filter((handler) => handler.controlFlowStatus === "closed").length,
      handlerDialogueRecordCount: handlerBehaviorCatalog.dialogueRecordIds.length,
      module25StoryTableEntries: stageStoryRecords.length,
      targetScenesClosed: [21, 22, 37, 38, 42],
      dynamicBoardScenesClosed: handlerBehaviorCatalog.dynamicBoardStages,
      otherRuntimeStateScenesClosedMechanically: handlerBehaviorCatalog.otherRuntimeStateStages,
      stage30HigherLevelMutationMeaningClosed: stage30MultiClassSequence.status === "closed",
      stage30DifficultyUiLabelsClosed: true,
      targetSceneDynamicPopulationClosed: true,
      stage6RoutingClosed: true,
      postgameRoutingClosed: true,
      implementationStarted: false,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`verified ${verifiedCodeAndDataRanges.length} ranges, structurally closed ${handlerBehaviorCatalog.handlers.length} stage handlers, and wrote ${handlerBehaviorCatalog.dialogueRecordIds.length} handler SAY records to ${outputPath}`);
}

function usage() {
  return "usage: angel2-stage-events.mjs --extract MODULE25.bin MODULE27.bin MODULE29.bin MODULE33.bin MODULE35.bin MODULE46.bin BATTLE_TEMPLATES.json BATTLE_OBJECTIVES.json UNIT_DESCRIPTORS.json TITLE_FLOW.json DIALOGUE_DIR OUTPUT.json";
}

const [command, module25Path, module27Path, module29Path, module33Path, module35Path, module46Path, templatesPath, objectivesPath, descriptorsPath, titleFlowPath, dialogueDirectory, outputPath] = process.argv.slice(2);
if (command !== "--extract" || [module25Path, module27Path, module29Path, module33Path, module35Path, module46Path, templatesPath, objectivesPath, descriptorsPath, titleFlowPath, dialogueDirectory, outputPath].some((value) => value === undefined)) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(module25Path, module27Path, module29Path, module33Path, module35Path, module46Path, templatesPath, objectivesPath, descriptorsPath, titleFlowPath, dialogueDirectory, outputPath).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { VERIFIED_RANGES, extract };
