#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage21-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0043/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  presentations: reversePath("parsed/native/stage-presentations.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0139.json"),
  nextTitle: reversePath("parsed/dialogue/0140.json"),
  prebattleStory: reversePath("parsed/dialogue/0042.json"),
  scoutingStory: reversePath("parsed/dialogue/0043.json"),
  discoveryStory: reversePath("parsed/dialogue/0044.json"),
  map: reversePath("renders/battle-maps/confirmed/21.png"),
  minimap: reversePath("renders/battle-maps/minimap/21.png"),
  storyBackground: reversePath("renders/planar/BK/0016/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0077.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0007.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0006.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0031.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0030.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0043 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "ab200d36a4febad9bc7c8bbf9c8a79c893096e3a933885d71bddd7e18a9f666c") {
  throw new Error(`B/0043 hash changed: ${sha256(templateBytes)}`);
}

const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const presentations = parseInput("presentations");
const musicDocument = parseInput("music");
const techniqueRules = parseInput("techniqueRules");
const storyPresentations = parseInput("storyPresentations");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 21, "stage 21 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 21, "stage 21 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 21, "stage 21 lifecycle");

assertEqual({
  activeSide1Count: template.activeSide1Count,
  activeSide2Count: template.activeSide2Count,
  deployment: template.deployment,
}, {
  activeSide1Count: 0,
  activeSide2Count: 0,
  deployment: {
    required: false,
    markerValue: 255,
    cells: [],
    eligibleUnitSlots: [],
    eligibleFlagValues: [],
    fixedPlayerUnitSlots: [],
    fixedRosterUnitSlots: [],
    fixedBoardOnlyUnitSlots: [],
    fixedPlayerUnitsCannotBeRemoved: true,
    optionalUnitSlots: [],
    openCellCount: 0,
    initialPlayerUnitCount: 0,
    initialRosterSelectedCount: 0,
    maximumPlayerUnitCount: 0,
    remainingMarkersBecomeEmptyAtBattleLoad: true,
  },
}, "stage 21 empty template");
assertEqual(stageLifecycle, {
  stage: 21,
  stageKind: "normal_0_to_38",
  required: false,
  openCells: 0,
  eligibleUnits: 0,
  fixedUnits: 0,
  fixedRosterUnits: 0,
  fixedBoardOnlyUnits: 0,
  optionalUnits: 0,
  maximumPlayerUnits: 0,
  cells: [],
  eligibleUnitSlots: [],
  fixedPlayerUnitSlots: [],
  fixedRosterUnitSlots: [],
  fixedBoardOnlyUnitSlots: [],
  optionalUnitSlots: [],
}, "stage 21 lifecycle");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 21, "stage 21 objective");
assertEqual({ victory: nativeObjective.victory.kind, defeat: nativeObjective.defeat.kind, slot: nativeObjective.defeat.unitSlot }, {
  victory: "all_side2_units_absent", defeat: "required_side1_slot_absent", slot: 0,
}, "stage 21 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "完成村莊偵察",
  defeatText: "「妮雅」離場",
  victoryStatusText: "偵察過場完成。",
};

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const actorSpecs = [
  { slot: 0, source: { x: 42, y: 25 }, destination: { x: 28, y: 41 } },
  { slot: 1, source: { x: 43, y: 24 }, destination: { x: 30, y: 42 } },
  { slot: 24, source: { x: 41, y: 24 }, destination: { x: 28, y: 40 } },
  { slot: 8, source: { x: 40, y: 26 }, destination: { x: 27, y: 42 } },
];
const scouts = actorSpecs.map((spec) => {
  const actor = actorFor(spec.slot);
  return {
    ...spec,
    name: actor.normalizedName,
    portraitRecord: actor.portraitRecord,
    classSource: "campaign-roster",
  };
});
assertEqual(scouts.map(({ slot, name, portraitRecord }) => ({ slot, name, portraitRecord })), [
  { slot: 0, name: "妮雅", portraitRecord: 46 },
  { slot: 1, name: "希蜜", portraitRecord: 45 },
  { slot: 24, name: "葛蒂拉斯", portraitRecord: 0 },
  { slot: 8, name: "蘇蘭達", portraitRecord: 10 },
], "stage 21 scout identities");

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "焦土森林村莊外") throw new Error(`stage 21 title changed: ${titleText}`);
if (nextTitleText !== "焦土森林村莊中") throw new Error(`stage 22 title changed: ${nextTitleText}`);
const titleTable = storyPresentations.globalReachabilityAudit.tables.postBattle;
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({ title: recordForStage(titleTable, 21), next: recordForStage(titleTable, 22) }, {
  title: 139, next: 140,
}, "stage 21 title records");

const scene = requireEntry(eventsDocument.scenes, ({ stage }) => stage === 21, "stage 21 scene");
const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 21,
  "stage 21 handler",
);
if (handler.sha256 !== "77f24db0c28b368d729241fe95240715e3ce63f9f4c4e0fdf296f07ed657e2b7") {
  throw new Error(`stage 21 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events.map(({ trigger, sayRecords, actions }) => ({
  trigger, sayRecords, ops: actions.map(({ op }) => op),
})), [
  { trigger: "round 1", sayRecords: [43, 44], ops: ["seeDetailedScene"] },
], "stage 21 handler choreography");
assertEqual(handler.outcomeRouting, {
  liveVictory999: { nextModule: 27, nextStage: 22 },
  loadedVictory1000: { nextModule: 27, nextStage: 22, presentationReplayed: false },
  source: "handler writes merged over dispatcher defaults",
}, "stage 21 route");
const focusPortraitOp = requireEntry(
  scene.round1,
  ({ op }) => op === "focusPortraitResource",
  "stage 21 round-1 portrait focus",
);
assertEqual(
  { index: scene.round1.indexOf(focusPortraitOp), portrait: focusPortraitOp.portraitResourceId },
  { index: 0, portrait: 46 },
  "stage 21 round-1 portrait focus",
);
assertEqual(scene.round1.filter(({ op }) => op === "spawn").map(({ unit, at }) => ({
  slot: unit.unitSlot,
  classSource: unit.classSource,
  position: { x: at.x, y: at.y },
})), scouts.map(({ slot, source }) => ({
  slot,
  classSource: "campaign state imported before template sparse overrides",
  position: source,
})), "stage 21 scripted spawns");
assertEqual(scene.round1.filter(({ op }) => op === "scriptedMove").map(({ unitSlot, from, to, rangeSetup }) => ({
  slot: unitSlot,
  from: { x: from.x, y: from.y },
  to: { x: to.x, y: to.y },
  movementBudget: rangeSetup.budget,
})), scouts.map(({ slot, source, destination }) => ({
  slot, from: source, to: destination, movementBudget: 50,
})), "stage 21 scripted movement");
const presentation = requireEntry(presentations.dynamicSceneTimelines, ({ stage }) => stage === 21, "stage 21 presentation");
if (presentation.classification !== "noninteractive four-scout interlude") {
  throw new Error(`stage 21 presentation changed: ${presentation.classification}`);
}
if (!eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(21)) {
  throw new Error("stage 21 left the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 21)) {
  throw new Error("stage 21 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("the defeat-replacement and form-conversion chain is no longer stage-30 only");
}
const reinforcementAudit = {
  kind: "round-1-four-scout-interlude",
  initialSide1: 0,
  initialSide2: 0,
  spawnedSide1Slots: scouts.map(({ slot }) => slot),
  spawnedSide2Slots: [],
  laterReinforcements: false,
  auditedSources: [
    "initial-template",
    "round-event-handler",
    "dynamic-board-catalog",
    "full-round-special-chain",
    "defeat-replacement-and-form-chain",
  ],
};

const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 21, "stage 21 prebattle story");
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: 42, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"],
}, "stage 21 module 25 story");
const storyMusicEntry = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage }) => stage === 21, "stage 21 story music");
if (storyMusicEntry.magicRecord !== 77) throw new Error(`stage 21 story music changed: ${storyMusicEntry.magicRecord}`);
const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 21, `${table} stage 21 music`);
const musicRecords = {
  story: 77,
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, { story: 77, player: { entry: 7, loop: 6 }, enemy: { entry: 31, loop: 30 } }, "stage 21 music");

const portraitSpeakers = {
  0: "葛蒂拉斯", 10: "蘇蘭達", 43: "黛西", 45: "希蜜", 46: "妮雅", 65: "守護者",
};
const storyPages = {
  "stage-21-prebattle-story": compileNativeStory(parseInput("prebattleStory"), 42, portraitSpeakers, { includeBackground: true }),
  "stage-21-scouting-story": compileNativeStory(parseInput("scoutingStory"), 43, portraitSpeakers, { includeBackground: true }),
  "stage-21-discovery-story": compileNativeStory(parseInput("discoveryStory"), 44, portraitSpeakers, { includeBackground: true }),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-21-prebattle-story": 4,
  "stage-21-scouting-story": 14,
  "stage-21-discovery-story": 3,
}, "stage 21 story waits");

const constructionTokens = requireEntry(techniqueRules.terrainConstructionTokens.stages, ({ stage }) => stage === 21, "stage 21 construction tokens");
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 89, obstacle: 89,
}, "stage 21 construction tokens");
const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-055\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-21/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 42,
  roundOneStoryRecords: [43, 44],
  scouts,
  focusPortraitRecord: focusPortraitOp.portraitResourceId,
  movementBudget: 50,
  reinforcementAudit,
  skipOrdinaryVictoryAndSavePrompt: true,
  completedRoute: { module: 27, stage: 22, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-055"],
};

const generatedSource = `// Generated by scripts/generate-stage21-runtime.mjs from stage 21 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE21_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE21_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE21_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE21_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE21_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE21_TITLE = ${json(titleText)};\n`
  + `export const STAGE21_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE21_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE21_DEPLOYMENT = ${json({ kind: "fixed" })} as const;\n`
  + `export const STAGE21_SCOUTS = ${json(scouts)} as const;\n`
  + `export const STAGE21_CONSTRUCTION_TOKENS = ${json({ ironPlate: 89, obstacle: 89 })} as const;\n`
  + `export const STAGE21_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE21_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE21_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage21-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage21-minimap.png")),
  copyFile(inputPaths.storyBackground, path.join(publicAssetPath, "story-stage21-background-16.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 21 maps, BK/16 story background, and music with identity ${contentIdentity}`);
