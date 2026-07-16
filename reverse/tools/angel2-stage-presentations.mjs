#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const MODULE29_DATA_BASE = 0x1eba0;
const BIG5 = new TextDecoder("big5", { fatal: true });
const SPEECH_PUNCTUATION_CODES = new Set([0xa141, 0xa144, 0xa148, 0xa149, 0xa175, 0xa176]);

const CODE_SIGNATURES = [
  ["0000:0249", 0x00249, 0x00254, "request the preloaded movement VOC only when sound is enabled", "80c61e90cad1af31a66f45807eefadc0adb75ea032853f62ce7731ec9ffb0e35"],
  ["0000:0304", 0x00304, 0x00311, "configure a caller-supplied contextual line and enter the generic outcome-dialogue wrapper", "debc95c50459d0bc236d5e669886f56ceccffbd5abd61de5355b717d1b319f07"],
  ["0000:03D8", 0x003d8, 0x0045b, "load A/18, render the configured battle line, restore battle layers, and clear inputs", "072b194fbee53579a8275fb0bb612d8f490c0ee3c65400b717547d3adc9a283d"],
  ["0000:04EF", 0x004ef, 0x0053b, "choose an upper or lower contextual line from the current unit side", "b0e191f9b2695141f36c49b563146df9830ab89319f85260266064ea8c5b8e0e"],
  ["0000:48B8", 0x048b8, 0x048f7, "wait for VGA vertical retrace unless disabled, flip the CRTC page, and toggle A000/A800", "8ece6137dfedac3449e84476fd02bbc14a8b0f82060670b793d81ae834c4c163"],
  ["0000:7C50", 0x07c50, 0x07c5f, "redraw a scripted-movement cell and flip one VGA page", "e2ac4b6e8c3a29d2c3a99dd6fa44b8d014718426d8f7d0647f984f94bc5ec33d"],
  ["0000:7C5F", 0x07c5f, 0x07c7b, "recenter and redraw the battle viewport, unit layers, minimap, and pointer", "c935b8f0962be2dff84b28259f3f14afb1394ea8420fcb39c2be576cbc371d5c"],
  ["0000:7C8B", 0x07c8b, 0x07c92, "redraw and flip one focus-scroll step", "8de8b87aa0aee20999a1847a2821cc9f701ab5aff68346513facee8c929c4a4e"],
  ["0000:9733", 0x09733, 0x097b2, "repeat the stage-30 contextual line before advancing a defeated enemy form or converting allegiance", "868aa29804c705b3e767adebf5b3e109056081bec1f1820e8fa89b13eaf454e9"],
  ["0000:C97A", 0x0c97a, 0x0c9b9, "bind selector 22h to the current unit portrait and contextual-line pointer", "d1f0627841100cc403a6590cd72963ea9a73d5e87eed71e5f49700daba9e4595"],
  ["1000:51E5", 0x151e5, 0x151f4, "write side and unit-slot bytes without drawing", "b615cb66304ec56f3d2b02b0a5deb121f5428a9b154fc23188bbac0c01a4c091"],
  ["1000:533E", 0x1533e, 0x1536a, "focus each stage-6 reinforcement cell before writing its sequential side-1 slot", "3bf5f982a163efe30c7c7ecc256235680360cb7e31e2b146bffbdfe1725db2cc"],
  ["1000:7DF7", 0x17df7, 0x17e09, "build and validate a scripted path, neutralize the range map, and run movement", "06e8e77d90dbaef5890f396d4a6729e69fc9033255d712a0fa417c166438b74f"],
  ["1000:7E09", 0x17e09, 0x17f12, "build a target-to-source path with PIT-selected gradient-neighbor ordering", "1373b858649e777e3e30f5bcafc038c462e9ddc219cdf522f12190e1f994a49b"],
  ["1000:7F12", 0x17f12, 0x17f4a, "clear the 100-word scripted-movement path list", "bf5fc70de446046bbb268d12606c174fd3d51c4a09147789c2b20354b9c849dc"],
  ["1000:7F4A", 0x17f4a, 0x17f72, "temporarily disable pointer overlays around scripted movement", "bc9b09dae18a56aaeb6f1fd4f8e8e90056f7a6acf1a5edc5434731b3a5b1fe22"],
  ["1000:7F72", 0x17f72, 0x1805b, "load E/14, request playback, copy occupancy along the path, and redraw every cell", "1d092d6cdf86f38a00c59015c5aa5d5d1f545b8c0a9bcd94f9c54dec2f5943f4"],
  ["1000:828F", 0x1828f, 0x18329, "fall back to a reachable empty endpoint when the requested destination lacks a valid path", "2640d5fd7fde8f1b53dcd067ceff92c61c4b9a438696492bf389818dcc89d03e"],
  ["1000:8329", 0x18329, 0x1834a, "test for nonzero range scratch and empty side occupancy", "977c7d9b42f018459463709837a93a51cadbc903924e1cc58179b4100dcc0509"],
  ["1000:834E", 0x1834e, 0x1849a, "compute a clamped centered viewport, ease to it by page flips, and highlight the focused cell", "de1658b617674be283559ef57c484d808bda7e07b6a93434d8b1568198715fd9"],
  ["1000:849A", 0x1849a, 0x184cf, "scan occupied cells for the first matching portrait/resource id and focus it", "80d7f9537487fcd2d3567e1c583a368ad83afae28c72af08baeb7c1fada0fce6"],
];

const DATA_SIGNATURES = [
  ["DS:84BB[22h]", 0x84bb + 0x22 * 2, 0x84bb + 0x22 * 2 + 2, "selector-22h pointer value 8762h", "002ca57106ab95e8e104635a67a23da47c59c4a6d74038e4c2c0a6eb5b0eea97"],
  ["DS:8762", 0x8762, 0x8784, "stage-30 contextual line including dollar terminator", "6667853e4a4fe65483a78ddc691509136538b54070277fec31d6f17185c52165"],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function cell(value) {
  return { cell: value, hex: `0x${value.toString(16).toUpperCase().padStart(4, "0")}`, x: value % 50, y: Math.floor(value / 50) };
}

function verifySignatures(module29) {
  assert.equal(sha256(module29), MODULE29_SHA256, "module 29 hash mismatch");
  const code = CODE_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = module29.subarray(start, end);
    assert.equal(sha256(bytes), expected, `${address}: code signature mismatch`);
    return { address, fileOffset: start, bytes: bytes.length, role, sha256: expected };
  });
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = module29.subarray(MODULE29_DATA_BASE + start, MODULE29_DATA_BASE + end);
    assert.equal(sha256(bytes), expected, `${address}: data signature mismatch`);
    return { address, fileOffset: MODULE29_DATA_BASE + start, bytes: bytes.length, role, sha256: expected };
  });
  return { code, data };
}

function parseGlyphEvents(bytes) {
  const events = [];
  for (let offset = 0; offset < bytes.length;) {
    const first = bytes[offset];
    if (first <= 0x7f) {
      const character = String.fromCharCode(first);
      events.push({ offset, character, kind: character === "|" ? "line_break" : "ascii", voiceRecord: null, waitNativeTicks: character === "|" ? 0 : 8 });
      offset += 1;
      continue;
    }
    assert(offset + 1 < bytes.length, `truncated Big5 pair at ${offset}`);
    const second = bytes[offset + 1];
    const code = (first << 8) | second;
    const punctuation = SPEECH_PUNCTUATION_CODES.has(code);
    events.push({
      offset,
      character: BIG5.decode(bytes.subarray(offset, offset + 2)),
      kind: "big5",
      big5Code: `0x${code.toString(16).toUpperCase()}`,
      voiceRecord: punctuation ? null : 57 + (code % 15),
      voiceSuppressedReason: punctuation ? "native punctuation exclusion" : null,
      waitNativeTicks: 8,
    });
    offset += 2;
  }
  return events;
}

function contextualLine(module29) {
  const pointer = module29.readUInt16LE(MODULE29_DATA_BASE + 0x84bb + 0x22 * 2);
  assert.equal(pointer, 0x8762, "selector 22h pointer changed");
  const start = MODULE29_DATA_BASE + pointer;
  let end = start;
  while (end < module29.length && module29[end] !== 0x24) end += 1;
  assert(end < module29.length, "stage-30 line lacks dollar terminator");
  const bytes = module29.subarray(start, end);
  const text = BIG5.decode(bytes);
  assert.equal(text, "我．．．我好難過．．．|頭好痛啊！", "stage-30 contextual text changed");
  const glyphEvents = parseGlyphEvents(bytes);
  const voiceRecordCounts = {};
  for (const event of glyphEvents) {
    if (event.voiceRecord !== null) voiceRecordCounts[`MAGIC/${event.voiceRecord}`] = (voiceRecordCounts[`MAGIC/${event.voiceRecord}`] ?? 0) + 1;
  }
  return {
    selector: 0x22,
    pointerTable: "DS:84BB",
    textAddress: "DS:8762",
    text,
    big5Hex: bytes.toString("hex").toUpperCase(),
    glyphEvents,
    counts: {
      visibleGlyphs: glyphEvents.filter((event) => event.kind !== "line_break").length,
      lineBreaks: glyphEvents.filter((event) => event.kind === "line_break").length,
      voicedBig5Glyphs: glyphEvents.filter((event) => event.voiceRecord !== null).length,
      normalTypingWaitNativeTicks: glyphEvents.reduce((sum, event) => sum + event.waitNativeTicks, 0),
    },
    voiceRecordCounts,
  };
}

function focus(value, note) {
  return { op: "focusCell", at: cell(value), ...(note ? { note } : {}) };
}

function focusPortrait(id, note) {
  return { op: "focusPortraitResource", portraitResourceId: id, ...(note ? { note } : {}) };
}

function write(side, unitSlot, value, note) {
  return { op: "writeBoardCell", side, unitSlot, at: cell(value), immediateRedraw: false, ...(note ? { note } : {}) };
}

function clear(value, removed, note) {
  return { op: "clearBoardCell", at: cell(value), removed, immediateRedraw: false, ...(note ? { note } : {}) };
}

function move(side, unitSlot, from, to, extra = {}) {
  return {
    op: "scriptedMove", side, unitSlot, from: cell(from), to: typeof to === "number" ? cell(to) : to,
    rangeSetup: { unitCode: "0A", propagationMode: "FM", budget: 50 },
    presentationPrimitive: "scriptedMovement",
    ...extra,
  };
}

function say(record) {
  return { op: "battleStory", sayRecord: record, presentation: "inherit reverse/parsed/native/story-presentations.json module29BattleStoryMode" };
}

function event(trigger, steps, extra = {}) {
  return { trigger, steps, ...extra };
}

function buildTimelines() {
  const stage6Cells = [0x054c, 0x0581, 0x05b1, 0x05b4, 0x05e4, 0x0614, 0x0617, 0x0678];
  const stage21Units = [
    [0, 0x050c, 0x081e], [1, 0x04db, 0x0852], [24, 0x04d9, 0x07ec], [8, 0x053c, 0x084f],
  ];
  return [
    {
      stage: 0, handler: "1000:4328", classification: "scripted opening movement",
      events: [
        event("round 1", [move(1, 0, 0x0488, 0x0531), say(1)]),
        event("round 2", [focusPortrait(0x2e), say(2)]),
        event("live victory 999", [focusPortrait(0x2e), say(3)]),
      ],
    },
    {
      stage: 1, handler: "1000:43A3", classification: "victory messenger entrance",
      events: [
        event("round 1", [focusPortrait(0x2e), say(5)]),
        event("live victory 999", [
          focusPortrait(0x2e, "save the focused unit cell as the messenger destination"),
          write(1, 48, 0x06f9),
          focus(0x06f9, "first redraw that exposes the newly written messenger"),
          move(1, 48, 0x06f9, "saved cell of the first occupied unit whose portrait/resource id is 0x2E", { endpointRuntimeResolved: true }),
          focusPortrait(0x2e), say(6),
        ]),
      ],
    },
    {
      stage: 6, handler: "1000:466B", classification: "victory reinforcement tableau",
      events: [
        event("round 1", [focusPortrait(0x05), say(15)]),
        event("live victory 999", [
          say(16),
          ...stage6Cells.flatMap((value, slot) => [
            focus(value, slot === 0 ? "focus precedes the write; this first unit is not visible until a later redraw" : "redraw reveals prior writes before this cell is written"),
            write(1, slot, value, "native 1000:533E performs no redraw after the write"),
          ]),
          focus(0x05e7, "reveals the completed eight-unit formation"),
          write(1, 17, 0x05e7),
          focusPortrait(0x2e, "save the destination cell"),
          focus(0x05e7, "first direct redraw that exposes slot 17"),
          move(1, 17, 0x05e7, "saved cell of portrait/resource id 0x2E", { endpointRuntimeResolved: true }),
          focusPortrait(0x2e), say(115),
        ]),
      ],
    },
    {
      stage: 11, handler: "1000:477C", classification: "evacuation dialogue and delayed removal",
      events: [
        event("round 1", [focusPortrait(0x0a), say(24), focusPortrait(0x0d), say(25), focusPortrait(0x0a), say(26), clear(0x007e, { side: 1, unitSlot: 9 }, "no explicit redraw follows; ordinary battle refresh exposes the disappearance")]),
        event("live victory 999", [focusPortrait(0x0d), say(27)]),
      ],
    },
    {
      stage: 20, handler: "1000:4A5B", classification: "guardian approach, dragon replacement, and victory tableau",
      events: [
        event("round 1", [
          focusPortrait(0x2e), say(40), focus(0x02d8), move(1, 32, 0x02d8, 0x036e), say(41),
          { op: "clearAllSide2Cells", removedStaticTemplateUnits: 16, immediateRedraw: false },
          write(2, 28, 0x033d, "class record 36 Dragon"),
          focus(0x033d, "single redraw exposes both the mass removal and replacement Dragon"), say(71),
        ]),
        event("live victory 999", [
          write(1, 7, 0x0348), focus(0x0348, "first redraw that exposes the entrant"),
          move(1, 7, 0x0348, 0x030f), say(72), say(73), say(74), say(75),
        ]),
      ],
    },
    {
      stage: 21, handler: "1000:4B72", classification: "noninteractive four-scout interlude",
      events: [event("round 1", [
        focusPortrait(0x2e),
        ...stage21Units.flatMap(([slot, source]) => [focus(source, "focus precedes the board write"), write(1, slot, source)]),
        say(43),
        ...stage21Units.map(([slot, source, destination]) => move(1, slot, source, destination)),
        say(44),
      ], { consequence: "side 2 remains empty, so victory resolves immediately and routes to stage 22" })],
    },
    {
      stage: 22, handler: "1000:4C88", classification: "round-1 entrance and ambush",
      events: [event("round 1", [
        focusPortrait(0x2e), focus(0x05ca), write(1, 23, 0x05ca), move(1, 23, 0x05ca, 0x068e),
        focus(0x05cb, "native mismatch: the next unit is written to adjacent cell 05CAh"), write(1, 7, 0x05ca), move(1, 7, 0x05ca, 0x06c1),
        say(76), focusPortrait(0x2e), say(77),
        write(2, 2, 0x07b5), focus(0x07b5, "first redraw exposing side-2 slot 2"), say(78),
        write(2, 28, 0x04c6, "class record 36 Dragon and the stage victory target"), focus(0x04c6, "first redraw exposing side-2 slot 28"), say(79),
        clear(0x068e, { side: 1, unitSlot: 23 }), clear(0x06c1, { side: 1, unitSlot: 7 }),
        write(2, 40, 0x0667), write(2, 41, 0x06cb), write(2, 42, 0x07e8), write(2, 43, 0x07e6),
        { op: "returnToBattleLoop", note: "the final six memory-only writes/clears become visible on the normal battle refresh" },
      ])],
    },
    {
      stage: 30, handler: "1000:4F1E plus 0000:9733", classification: "repeating contextual line and form transition",
      events: [
        event("round 1", [focusPortrait(0x2e), say(58), focus(0x036e), { op: "contextualBattleLine", selector: 0x22, textAddress: "DS:8762" }, { op: "setSide2ClassRecord", unitSlot: 27, from: 35, to: 0, immediateRedraw: false }, { op: "rebuildAllSide2UnitStates", slots: 57, immediateRedraw: false }]),
        event("each side-2 form defeat before the limit", [{ op: "contextualBattleLine", selector: 0x22, textAddress: "DS:8762", portrait: "current defeated form" }, { op: "incrementSide2ClassRecordAndRebuild", immediateRedraw: false }]),
        event("final side-2 form defeat", [{ op: "contextualBattleLine", selector: 0x22, textAddress: "DS:8762", portrait: "current defeated form" }, { op: "convertCellToSide1Slot23Empress", classRecord: 35, immediateRedraw: false }]),
        event("live victory 999", [focusPortrait(0x2e), say(59)]),
      ],
    },
    {
      stage: 42, handler: "1000:457F", classification: "immediate-victory portal bridge",
      events: [
        event("live victory 999", [
          focusPortrait(0x0e), move(1, 0, 0x04fa, 0x04c8), say(11), focusPortrait(0x2e), say(18),
          focus(0x052d), move(1, 24, 0x052d, 0x04c9), say(20),
          { op: "lightning4", target: cell(0x0464), targetSide: 1, presentation: "full 4L chain; fixed graphic waits total 304 native ticks before damage settlement", assets: ["MAGIC/39", "MAGIC/40", "MAGIC/26", "MAGIC/6", "E/43"] },
          clear(0x0464, { side: 1, unitSlot: 7 }, "story departure, not ordinary combat death"), clear(0x0463, { side: 1, unitSlot: 23 }, "story departure, not ordinary combat death"),
          focusPortrait(0x2e, "redraw exposes both departures"), say(19), { op: "route", nextStage: 6 },
        ]),
        event("loaded victory 1000", [{ op: "route", nextStage: 6 }], { presentationReplayed: false, boardMutationsReplayed: false }),
      ],
    },
  ];
}

async function extract(module29Path, stageEventsPath, feedbackPath, storyPath, titleFlowPath, techniquePath, audioManifestPath, e14Path, outputPath) {
  const [module29, stageEventsBuffer, feedbackBuffer, storyBuffer, titleFlowBuffer, techniqueBuffer, audioManifestBuffer, e14] = await Promise.all([
    readFile(module29Path), readFile(stageEventsPath), readFile(feedbackPath), readFile(storyPath), readFile(titleFlowPath), readFile(techniquePath), readFile(audioManifestPath), readFile(e14Path),
  ]);
  const stageEvents = JSON.parse(stageEventsBuffer.toString("utf8"));
  const feedback = JSON.parse(feedbackBuffer.toString("utf8"));
  const story = JSON.parse(storyBuffer.toString("utf8"));
  const titleFlow = JSON.parse(titleFlowBuffer.toString("utf8"));
  const technique = JSON.parse(techniqueBuffer.toString("utf8"));
  const audioManifest = JSON.parse(audioManifestBuffer.toString("utf8"));
  const signatures = verifySignatures(module29);
  const transitionLine = contextualLine(module29);
  const timelines = buildTimelines();

  assert.equal(stageEvents.semanticVersion, 4, "stage-events semantic version changed");
  assert.equal(stageEvents.validation.dispatcherHandlerCount, 38, "stage-event handler coverage changed");
  assert.deepEqual(stageEvents.validation.dynamicBoardScenesClosed, [0, 1, 6, 11, 20, 21, 22, 42]);
  assert.equal(stageEvents.validation.stage30DifficultyUiLabelsClosed, true);
  assert(feedback.battleFeedbackWrapper.configuratorTable.some((entry) => entry.kind === "contextualBattleLine" && entry.address === "0000:0304" && entry.callback === "0000:04EF"), "feedback spec lost contextual-line binding");
  assert.equal(feedback.outcomeText.pacingAndSkip.normalVisibleGlyphWaitNativeTicks, 8);
  assert.equal(story.module29BattleStoryMode.text.normalGlyphWaitNativeTicks, 8);
  assert.equal(titleFlow.difficultyMenu.options.map((option) => option.label).join("|"), "過關斬將|勢均力敵|困難重重|無法無天");
  const lightning4 = technique.presentations.lightning.actions.find((action) => action.code === "4L");
  assert.equal(lightning4?.entry, "1000:6084");
  assert.equal(lightning4.fixedGraphicWaitNativeTicks, 304);
  const e14Manifest = audioManifest.entries.find((entry) => entry.group === "E" && entry.record === 14);
  assert(e14Manifest, "audio manifest lacks E/14");
  assert.equal(sha256(e14), "f16bdce41ef0dc30b0dc93429322ea94fb33c64503776ef99bc58cd3088c343e");
  assert.equal(e14Manifest.sourceSha256, sha256(e14));
  assert.equal(e14Manifest.durationSeconds, 1.261);
  assert.deepEqual(timelines.map((entry) => entry.stage), [0, 1, 6, 11, 20, 21, 22, 30, 42]);

  const source = (kind, sourcePath, buffer) => ({ kind, path: normalizePath(sourcePath), bytes: buffer.length, sha256: sha256(buffer) });
  const output = {
    format: "ANGEL2 special per-stage audiovisual presentation and visibility specification",
    semanticVersion: 1,
    evidenceLevel: "C",
    phase: "resource extraction and original-GDD reconstruction only",
    sources: [
      source("module29", module29Path, module29), source("stageEvents", stageEventsPath, stageEventsBuffer),
      source("feedbackPresentations", feedbackPath, feedbackBuffer), source("storyPresentations", storyPath, storyBuffer),
      source("titleFlow", titleFlowPath, titleFlowBuffer), source("techniquePresentations", techniquePath, techniqueBuffer),
      source("audioManifest", audioManifestPath, audioManifestBuffer), source("movementVocE14", e14Path, e14),
    ],
    verifiedCodeSignatures: signatures.code,
    verifiedDataSignatures: signatures.data,
    sharedPrimitives: {
      boardWrite: {
        entry: "1000:51E5",
        behavior: "write side and unit-slot bytes only; spawning, clearing, or replacing a unit does not itself redraw either VGA page",
        visibilityBoundary: "the change first becomes visible on a later focus redraw, scripted-movement redraw, battle-SAY restoration, or ordinary battle-loop refresh",
      },
      focusCell: {
        entry: "1000:834A -> 834E",
        viewport: { cells: [10, 7], centeredOffset: [-4, -3], clampedByMapBounds: true },
        easing: "before each adjustment redraw and flip; normally move the viewport origin one cell per axis, but for an absolute difference >=6 divisible by 4 move difference/4; repeat until both axes match, then perform one final highlighted-cell redraw",
        timing: "one VGA vertical-retrace page flip per scroll iteration plus the final focus redraw; no native timer-tick wait and no direct sound/resource load",
      },
      focusPortrait: {
        entry: "1000:849A",
        behavior: "scan all 2500 occupied cells in linear order, load each unit, compare portrait/resource id, and focus the first match; return without redraw when no match exists",
      },
      scriptedMovement: {
        entry: "1000:7DF7 -> 7E09/828F/7F4A/7F72",
        pathList: { address: "CS:028B", capacityCells: 100, constructionOrder: "target to source", playbackOrder: "source to target" },
        rangeSource: "the caller first builds a seed-50 FM range with unit code 0A; path construction follows nondecreasing range-gradient neighbors back to the source",
        tieBreak: {
          source: "PIT channel 0 port 40h accumulated modulo 3",
          reachableOrders: [
            { remainder: 0, neighborOffsets: [-50, -1, 50, 1] },
            { remainder: 1, neighborOffsets: [1, 50, -1, -50] },
            { remainder: 2, neighborOffsets: [-1, 50, 1, -50] },
          ],
          nativeQuirk: "a remainder-3 branch (-50,+1,+50,-1) exists but is unreachable because the dividend is reduced modulo 3",
          consequence: "equal-gradient routes are intentionally PIT-dependent; endpoint and movement rules remain deterministic",
        },
        invalidEndpointFallback: "scan the path list and orthogonal neighbors for a nonzero-range, empty-side cell, replace the endpoint, and rebuild; otherwise stop at the last valid path cell",
        audio: { resource: "E/14", requestEntry: "0000:0249", gate: "sound setting bit 0", playback: "asynchronous with movement", ...e14Manifest },
        frameSequence: "clear the source occupancy, copy side/unit-slot bytes through every path-list cell including the source, and after each copy redraw the recentered 10x7 viewport, overlays, minimap and pointer followed by one vertical-retrace page flip; redraw the endpoint once more after the loop",
        interpolation: "none; the native presentation is discrete cell-to-cell motion",
        explicitNativeTimerWait: false,
      },
      battleStory: {
        entry: story.module29BattleStoryMode.wrapper,
        sourceSpec: normalizePath(storyPath),
        behavior: "all 72 stage-handler SAY calls inherit the already closed battle-story interpreter, windows, portraits, per-glyph speech, input waits, and battle-layer restoration",
      },
      contextualTransitionLine: {
        entry: "0000:C97A -> C97E -> 0304 -> 03D8 -> 04EF",
        ...transitionLine,
        portrait: "current unit portrait/resource id loaded from the cell supplied in BX",
        windowPlacement: "upper for side 1, lower for side 2",
        assets: ["A/18", "current D/<portrait>", "MAGIC/57..71 when 說話 is enabled"],
        typing: feedback.outcomeText.pacingAndSkip,
        manualConfirmation: false,
        restoration: "generic wrapper restores battle tileset, viewport, minimap, HUD/page state, then clears both primary and secondary inputs",
        reachability: "stage 30 round 1 and every defeated side-2 form transition, including the final allegiance conversion",
      },
      lightning4: {
        entry: lightning4.entry,
        sourceSpec: normalizePath(techniquePath),
        fixedGraphicWaitNativeTicks: lightning4.fixedGraphicWaitNativeTicks,
        audioRequests: lightning4.audioRequests,
        settlement: "the complete 4L presentation finishes before its damage resolution; stage 42 then performs two explicit story removals",
      },
    },
    handlerPresentationCoverage: {
      totalHandlers: 38,
      dialogueOrRouteOnlyHandlers: 23,
      silentAiMutationHandlers: [14, 15, 16, 17, 18, 19],
      dynamicBoardHandlers: [0, 1, 6, 11, 20, 21, 22, 42],
      contextualFormTransitionHandlers: [30],
      closedBy: [normalizePath(stageEventsPath), normalizePath(storyPath), normalizePath(feedbackPath), normalizePath(techniquePath), normalizePath(outputPath)],
    },
    dynamicSceneTimelines: timelines,
    evidenceBoundary: {
      confirmed: "all special handler ordering, focus-before/after-write visibility, scripted-movement path construction and fallback, movement audio, per-cell redraw/page-flip cadence, stage-30 contextual line, and stage-42 inherited 4L presentation",
      preservedNativeVariability: "equal-gradient scripted paths use PIT-dependent tie order and VGA refresh frequency remains host-dependent; the released nominal native timer tick is 10.000151 ms",
      noMissingPresentationRule: "PIT route variation and VGA refresh are preservation parameters, not unresolved event-control flow",
    },
    validation: {
      codeSignatures: signatures.code.length,
      dataSignatures: signatures.data.length,
      handlerCoverage: 38,
      dynamicBoardScenesClosed: 8,
      contextualTransitionScenesClosed: 1,
      specialTimelineStagesClosed: timelines.map((entry) => entry.stage),
      movementVocClosed: true,
      stage30ContextualTextClosed: true,
      stage30DifficultyLabelsClosed: true,
      stage42LightningPresentationClosedByReference: true,
      implementationFrozen: true,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`verified ${signatures.code.length} code and ${signatures.data.length} data signatures; closed ${timelines.length} special-stage timelines to ${outputPath}`);
}

function usage() {
  return "usage: angel2-stage-presentations.mjs --extract MODULE29 STAGE_EVENTS FEEDBACK STORY TITLE_FLOW TECHNIQUE AUDIO_MANIFEST E14 OUTPUT";
}

const [command, ...args] = process.argv.slice(2);
if (command !== "--extract" || args.length !== 9) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(...args).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { extract };
