#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";
import { assertIdenticalImage, removeDuplicateImage } from "./lib/shared-image-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage19-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0039/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0137.json"),
  nextTitle: reversePath("parsed/dialogue/0138.json"),
  objectiveText: reversePath("parsed/dialogue/0088.json"),
  openingStory: reversePath("parsed/dialogue/0038.json"),
  map: reversePath("renders/battle-maps/confirmed/19.png"),
  minimap: reversePath("renders/battle-maps/minimap/19.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0021.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0020.wav"),
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
const techniqueRules = parseInput("techniqueRules");
const storyPresentations = parseInput("storyPresentations");

if (templateBytes.length !== 8506) throw new Error(`B/0039 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "cd33d9cab1a41e6598ce71a8888f76e48b5e8d450d9ebbe3dbe292620b33dc17") {
  throw new Error(`B/0039 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 19, "stage 19 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 19, "stage 19 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 19, "stage 19 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 23, y: 32 }, { x: 24, y: 32 }, { x: 25, y: 32 }, { x: 26, y: 32 },
    { x: 27, y: 32 }, { x: 23, y: 33 }, { x: 27, y: 33 }, { x: 23, y: 34 },
    { x: 27, y: 34 },
  ],
  maximumUnits: 10,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 19 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 19 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 19 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 19 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 19 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 25, y: 33 } }];

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
const playerClassOverrides = template.classArrays.side1SparseOverrides
  .map((nativeClassRecord, slot) => ({ slot, nativeClassRecord }))
  .filter(({ nativeClassRecord }) => nativeClassRecord !== 0);
assertEqual(playerClassOverrides, [], "stage 19 side-1 class overrides");
assertEqual(template.perSlotBehaviorArrays.side1.filter((value) => value !== 0), [], "stage 19 side-1 AI behavior");

const aiActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 13,
  "stage 19 enemy actor Ai",
);
assertEqual({ name: aiActor.normalizedName, portraitRecord: aiActor.portraitRecord }, {
  name: "愛", portraitRecord: 39,
}, "stage 19 Ai identity");
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 13 ? { name: aiActor.normalizedName, portraitRecord: aiActor.portraitRecord } : {}),
}));
assertEqual(enemyUnits, [
  { slot: 31, nativeClassRecord: 28, position: { x: 21, y: 12 }, aiBehavior: 1 },
  { slot: 13, nativeClassRecord: 8, position: { x: 25, y: 12 }, aiBehavior: 1, name: "愛", portraitRecord: 39 },
  { slot: 30, nativeClassRecord: 28, position: { x: 29, y: 12 }, aiBehavior: 1 },
  { slot: 52, nativeClassRecord: 27, position: { x: 21, y: 13 }, aiBehavior: 6 },
  { slot: 46, nativeClassRecord: 29, position: { x: 22, y: 13 }, aiBehavior: 1 },
  { slot: 38, nativeClassRecord: 30, position: { x: 24, y: 13 }, aiBehavior: 1 },
  { slot: 36, nativeClassRecord: 25, position: { x: 26, y: 13 }, aiBehavior: 1 },
  { slot: 40, nativeClassRecord: 29, position: { x: 28, y: 13 }, aiBehavior: 1 },
  { slot: 47, nativeClassRecord: 27, position: { x: 29, y: 13 }, aiBehavior: 4 },
  { slot: 51, nativeClassRecord: 27, position: { x: 22, y: 14 }, aiBehavior: 6 },
  { slot: 45, nativeClassRecord: 29, position: { x: 23, y: 14 }, aiBehavior: 1 },
  { slot: 35, nativeClassRecord: 6, position: { x: 25, y: 14 }, aiBehavior: 1 },
  { slot: 41, nativeClassRecord: 29, position: { x: 27, y: 14 }, aiBehavior: 1 },
  { slot: 48, nativeClassRecord: 27, position: { x: 28, y: 14 }, aiBehavior: 4 },
  { slot: 55, nativeClassRecord: 7, position: { x: 22, y: 15 }, aiBehavior: 6 },
  { slot: 50, nativeClassRecord: 7, position: { x: 23, y: 15 }, aiBehavior: 5 },
  { slot: 44, nativeClassRecord: 29, position: { x: 24, y: 15 }, aiBehavior: 1 },
  { slot: 43, nativeClassRecord: 29, position: { x: 25, y: 15 }, aiBehavior: 1 },
  { slot: 42, nativeClassRecord: 29, position: { x: 26, y: 15 }, aiBehavior: 1 },
  { slot: 49, nativeClassRecord: 7, position: { x: 27, y: 15 }, aiBehavior: 3 },
  { slot: 54, nativeClassRecord: 7, position: { x: 28, y: 15 }, aiBehavior: 4 },
], "stage 19 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 19, "stage 19 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 13, defeat: 0,
}, "stage 19 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 13 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊敗「愛」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "愛已離開戰場。",
};

const objectiveRecordTable = storyPresentations.globalReachabilityAudit.tables.alternate;
const titleRecordTable = storyPresentations.globalReachabilityAudit.tables.postBattle;
const recordForStage = (table, stage, label) => {
  const entries = table.entries.filter((entry) => entry.key === stage && entry.enabled);
  if (entries.length !== 1) throw new Error(`${label} is not a single enabled entry: ${entries.length}`);
  return entries[0].dialogueRecord;
};
assertEqual({
  objective: recordForStage(objectiveRecordTable, 19, "stage 19 objective record"),
  title: recordForStage(titleRecordTable, 19, "stage 19 title record"),
  nextTitle: recordForStage(titleRecordTable, 20, "stage 20 title record"),
}, { objective: 88, title: 137, nextTitle: 138 }, "stage 19 dialogue records");

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("愛") || !originalObjectiveText.includes("妮雅")
  || !originalObjectiveText.includes("戰敗")) throw new Error("SAY/0088 objective wording changed");
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔第六層") throw new Error(`stage 19 title changed: ${titleText}`);
if (nextTitleText !== "龍塔頂部") throw new Error(`stage 20 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 19,
  "stage 19 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [38], actions: [] },
  {
    trigger: "round 6 and every later active round",
    sayRecords: [],
    actions: [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }],
  },
], "stage 19 event program");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 19)) {
  throw new Error("stage 19 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(19)) {
  throw new Error("stage 19 unexpectedly entered the dynamic-board stage catalog");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("the defeat-replacement and form-conversion chain is no longer stage-30 only");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: [
    "initial-template", "round-event-handler", "dynamic-board-catalog",
    "full-round-special-chain", "defeat-replacement-and-form-chain",
  ],
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25, nextStage: 20, presentationReplayed: false,
}, "stage 19 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 19,
  "stage 19 module 25 story",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: null, resources: [],
}, "stage 19 module 25 story absence");
const stageMagicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 19,
  "stage 19 module 25 music table",
);
if (stageMagicEntry.magicRecord !== 75) throw new Error(`stage 19 MAGIC table changed: ${stageMagicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 19,
  `${table} stage 19 music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 11, loop: 10 }, enemy: { entry: 21, loop: 20 } }, "stage 19 music");

const portraitSpeakers = { 39: "愛", 10: "蘇蘭達" };
const storyPages = {
  "stage-19-opening-story": compileNativeStory(
    parseInput("openingStory"), 38, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-19-opening-story"].length, 4, "stage 19 opening waits");
assertEqual(
  [...new Set(storyPages["stage-19-opening-story"].map(({ source }) => source.backgroundId))],
  [undefined],
  "stage 19 opening keeps the battle map background",
);
assertEqual(
  [...new Set(storyPages["stage-19-opening-story"].flatMap(({ upper, lower }) => [upper?.portrait, lower?.portrait]).filter(Boolean))],
  [39, 10],
  "stage 19 opening portraits",
);
assertEqual(storyPages["stage-19-opening-story"][2].lower?.speaker, "蘇蘭達", "stage 19 lower speaker");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 19,
  "stage 19 construction tokens",
);
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 1, obstacle: 1,
}, "stage 19 construction tokens");

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
identityHash.update("stableRemake\0REMAKE-051\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-19/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 38,
  nativeDelayedAiReset: {
    firstRound: 6,
    repeatsEveryActiveRound: true,
    operation: "fillSide2PerSlotAiBehavior",
    slots: 75,
    value: 0,
    stableRemakeEffect: "release-native-sentries-to-shared-expert-pursuit",
  },
  enemyReinforcements,
  completedRoute: { module: 25, stage: 20, replayPresentation: false },
  stableRemakeDecision: "REMAKE-051",
};

const generatedSource = `// Generated by scripts/generate-stage19-runtime.mjs from stage 19 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE19_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE19_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE19_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE19_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE19_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE19_TITLE = ${json(titleText)};\n`
  + `export const STAGE19_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE19_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE19_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE19_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE19_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE19_CONSTRUCTION_TOKENS = ${json({ ironPlate: 1, obstacle: 1 })} as const;\n`
  + `export const STAGE19_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE19_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE19_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-19-opening-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  assertIdenticalImage(inputPaths.map, reversePath("renders/battle-maps/confirmed/14.png"), "stage 19 map"),
  assertIdenticalImage(inputPaths.minimap, reversePath("renders/battle-maps/minimap/14.png"), "stage 19 minimap"),
  removeDuplicateImage(path.join(publicAssetPath, "stage19-map.png")),
  removeDuplicateImage(path.join(publicAssetPath, "stage19-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-19-opening-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 19 maps and music with identity ${contentIdentity}`);
