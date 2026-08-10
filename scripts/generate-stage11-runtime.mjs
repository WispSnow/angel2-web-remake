#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage11-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0023/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0128.json"),
  nextTitle: reversePath("parsed/dialogue/0129.json"),
  objectiveText: reversePath("parsed/dialogue/0093.json"),
  openingStory24: reversePath("parsed/dialogue/0024.json"),
  openingStory25: reversePath("parsed/dialogue/0025.json"),
  openingStory26: reversePath("parsed/dialogue/0026.json"),
  victoryStory: reversePath("parsed/dialogue/0027.json"),
  map: reversePath("renders/battle-maps/confirmed/11.png"),
  minimap: reversePath("renders/battle-maps/minimap/11.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0013.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0012.wav"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const encode = (bytes) => Buffer.from(bytes).toString("base64");
const json = (value) => JSON.stringify(value);
const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed:\nexpected ${JSON.stringify(expected)}\nreceived ${JSON.stringify(actual)}`);
  }
};
const requireEntry = (entries, predicate, label) => {
  const entry = entries.find(predicate);
  if (!entry) throw new Error(`missing ${label}`);
  return entry;
};

const inputBuffers = Object.fromEntries(
  await Promise.all(Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)])),
);
const parseInput = (id) => JSON.parse(inputBuffers[id].toString("utf8"));
const templateBytes = inputBuffers.template;
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");

if (templateBytes.length !== 8506) throw new Error(`B/0023 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "c14643db65fdbff3a656da7d43e29955b1d27b9386689155dbc1b05f39be292a") {
  throw new Error(`B/0023 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 11, "stage 11 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 11, "stage 11 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 11, "stage 11 lifecycle");
assertEqual(stageLifecycle, {
  stage: 11,
  stageKind: "normal_0_to_38",
  required: false,
  openCells: 0,
  eligibleUnits: 0,
  fixedUnits: 9,
  optionalUnits: 0,
  maximumPlayerUnits: 9,
  cells: [],
  eligibleUnitSlots: [],
  fixedPlayerUnitSlots: [9, 18, 17, 19, 16, 42, 8, 41, 40],
  optionalUnitSlots: [],
}, "stage 11 lifecycle");

const compactUnit = (unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
});
const alliedUnits = template.activeUnitInstances.filter(({ side }) => side === 1).map(compactUnit);
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map(compactUnit);
assertEqual(alliedUnits, [
  { slot: 9, nativeClassRecord: null, position: { x: 26, y: 2 }, aiBehavior: 0 },
  { slot: 18, nativeClassRecord: null, position: { x: 23, y: 32 }, aiBehavior: 0 },
  { slot: 17, nativeClassRecord: null, position: { x: 27, y: 32 }, aiBehavior: 0 },
  { slot: 19, nativeClassRecord: null, position: { x: 24, y: 34 }, aiBehavior: 0 },
  { slot: 16, nativeClassRecord: null, position: { x: 30, y: 34 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 22, position: { x: 22, y: 35 }, aiBehavior: 0 },
  { slot: 8, nativeClassRecord: null, position: { x: 26, y: 35 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 22, position: { x: 26, y: 38 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 22, position: { x: 30, y: 38 }, aiBehavior: 0 },
], "stage 11 allied units");
assertEqual(enemyUnits, [
  { slot: 21, nativeClassRecord: 23, position: { x: 36, y: 48 }, aiBehavior: 0 },
], "stage 11 enemy units");

const actorBySlot = new Map(campaignRoster.displayResolution.actors.map((actor) => [actor.slot, actor]));
const alliedActors = alliedUnits.map(({ slot }) => {
  const actor = actorBySlot.get(slot);
  if (!actor) throw new Error(`missing stage 11 allied actor ${slot}`);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 11, "stage 11 objective");
assertEqual(nativeObjective.victory.successCellRangesInclusive, [[0, 279]], "stage 11 victory cells");
assertEqual(nativeObjective.defeat, {
  ...nativeObjective.defeat,
  kind: "required_side1_slot_absent",
  side: 1,
  unitSlot: 8,
  resultWhenTrue: "defeat",
}, "stage 11 protected unit");
const generatedObjective = {
  victory: { type: "unit-in-cell-range", side: 1, slot: 8, width: 50, minimum: 0, maximum: 279 },
  defeat: { type: "unit-removed", side: 1, slot: 8 },
  victoryText: "護送「蘇蘭達」登上飛船",
  defeatText: "「蘇蘭達」戰敗",
  victoryStatusText: "蘇蘭達已帶領游騎兵抵達飛船登船區。",
};
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("打敗「碧娜維姬」")
  || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0093 objective conflict changed");
}
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "拯救蘇蘭達") throw new Error(`stage 11 title changed: ${titleText}`);
if (nextTitleText !== "飛船上遭遇敵人") throw new Error(`stage 10 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 11,
  "stage 11 event handler",
);
assertEqual(stageHandler.events, [
  {
    trigger: "round 1",
    sayRecords: [24, 25, 26],
    actions: [{ op: "clearCell", at: { cell: 126, hex: "0x007E", x: 26, y: 2 }, removed: { side: 1, unitSlot: 9 } }],
  },
  { trigger: "live victory 999", sayRecords: [27], actions: [] },
], "stage 11 event program");
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25,
  nextStage: 10,
  presentationReplayed: false,
}, "stage 11 completed route");

const reinforcementSpecial = requireEntry(
  eventsDocument.module29BattleRuntime.fullRoundSpecials.stages,
  ({ stage }) => stage === 11,
  "stage 11 full-round reinforcement",
);
assertEqual(eventsDocument.module29BattleRuntime.fullRoundSpecials.invocation, {
  address: "0000:4E08",
  timing: "after all side-1 manual and autonomous actions, immediately before side-2 AI scheduling",
  frequency: "once per full round, including round 1",
}, "stage 11 reinforcement invocation");
assertEqual(reinforcementSpecial, {
  stage: 11,
  handler: "1000:5240",
  behavior: "spawn one side-2 reinforcement per full round",
  spawnCellSearch: {
    start: { cell: 2432, hex: "0x0980", x: 32, y: 48 },
    direction: -1,
    selection: "first cell whose side-map byte is zero",
  },
  candidateSlots: {
    minimum: 40,
    maximum: 79,
    selection: "first slot not currently present as side 2 anywhere on the 2500-cell board",
    reuseAfterRemoval: true,
    simultaneousLimit: 40,
    lifetimeLimit: null,
  },
  immediateSide2Activation: true,
  prngCalls: 0,
}, "stage 11 reinforcement program");

const side2ClassCount = template.classArrays.side2.length;
const side2BehaviorCount = template.perSlotBehaviorArrays.side2.length;
const reinforcementCandidates = Array.from(
  { length: reinforcementSpecial.candidateSlots.maximum - reinforcementSpecial.candidateSlots.minimum + 1 },
  (_, index) => {
    const slot = reinforcementSpecial.candidateSlots.minimum + index;
    return {
      slot,
      nativeClassRecord: slot < side2ClassCount
        ? template.classArrays.side2[slot]
        : template.classArrays.side1SparseOverrides[slot - side2ClassCount],
      aiBehavior: slot < side2BehaviorCount
        ? template.perSlotBehaviorArrays.side2[slot]
        : template.perSlotBehaviorArrays.side1[slot - side2BehaviorCount],
    };
  },
);
assertEqual(reinforcementCandidates.map(({ slot, nativeClassRecord, aiBehavior }) => [
  slot,
  nativeClassRecord,
  aiBehavior,
]), Array.from({ length: 40 }, (_, index) => {
  const slot = 40 + index;
  const classBySlot = new Map([[40, 22], [41, 23], [42, 22], [43, 23], [44, 22], [45, 8]]);
  return [slot, classBySlot.get(slot) ?? 0, slot === 44 || slot === 45 ? 2 : 0];
}), "stage 11 reinforcement candidate records");
const reinforcementProgram = {
  timing: "before-side-2-ai",
  frequency: "once-per-round",
  firstRound: 1,
  spawnStart: reinforcementSpecial.spawnCellSearch.start,
  spawnScanDirection: reinforcementSpecial.spawnCellSearch.direction,
  slotReuseAfterRemoval: reinforcementSpecial.candidateSlots.reuseAfterRemoval,
  simultaneousLimit: reinforcementSpecial.candidateSlots.simultaneousLimit,
  lifetimeLimit: reinforcementSpecial.candidateSlots.lifetimeLimit,
  immediateActivation: reinforcementSpecial.immediateSide2Activation,
  prngCalls: reinforcementSpecial.prngCalls,
  candidates: reinforcementCandidates,
};

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === 11,
  `${table} stage 11 music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 11, loop: 10 }, enemy: { entry: 13, loop: 12 } }, "stage 11 music");

const portraitSpeakers = { 10: "蘇蘭達", 13: "多莉", 45: "希蜜", 46: "妮雅", 52: "騎兵" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}
const openingPages = [
  ...compileStory(parseInput("openingStory24"), 24),
  ...compileStory(parseInput("openingStory25"), 25),
  ...compileStory(parseInput("openingStory26"), 26),
];
const storyPages = {
  "stage-11-opening-story": openingPages,
  "stage-11-victory-story": compileStory(parseInput("victoryStory"), 27),
};
assertEqual([openingPages.length, storyPages["stage-11-victory-story"].length], [13, 3], "stage 11 story waits");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id,
  path: path.relative(root, file),
  sha256: sha256(inputBuffers[id]),
  bytes: inputBuffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-041\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-11/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecords: [24, 25, 26],
  departure: { cell: 126, side: 1, slot: 9, timing: "after-opening-story" },
  victoryStoryRecord: 27,
  completedRoute: { module: 25, stage: 10, replayPresentation: false },
  stableRemakeDecision: "REMAKE-041",
};

const generatedSource = `// Generated by scripts/generate-stage11-runtime.mjs from stage 11 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE11_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE11_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE11_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE11_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE11_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE11_TITLE = ${json(titleText)};\n`
  + `export const STAGE11_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE11_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE11_DEPLOYMENT = { kind: "fixed" } as const;\n`
  + `export const STAGE11_ALLIED_ACTORS = ${json(alliedActors)} as const;\n`
  + `export const STAGE11_ALLIED_UNITS = ${json(alliedUnits)} as const;\n`
  + `export const STAGE11_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE11_REINFORCEMENT_PROGRAM = ${json(reinforcementProgram)} as const;\n`
  + `export const STAGE11_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE11_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE11_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-11-opening-story" | "stage-11-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage11-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage11-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage11-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage11-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage11-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage11-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 11 maps and music with identity ${contentIdentity}`);
