#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage17-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0035/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0135.json"),
  nextTitle: reversePath("parsed/dialogue/0136.json"),
  objectiveText: reversePath("parsed/dialogue/0086.json"),
  openingStory: reversePath("parsed/dialogue/0036.json"),
  map: reversePath("renders/battle-maps/confirmed/17.png"),
  minimap: reversePath("renders/battle-maps/minimap/17.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0007.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0006.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0035 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "9f5c738148c085d258b84048faa09eedfeaf1814d969d7ad7c3b6d5f06a7c900") {
  throw new Error(`B/0035 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 17, "stage 17 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 17, "stage 17 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 17, "stage 17 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 23, y: 23 }, { x: 24, y: 23 }, { x: 25, y: 23 },
    { x: 26, y: 23 }, { x: 24, y: 24 }, { x: 23, y: 26 },
    { x: 24, y: 26 }, { x: 25, y: 26 }, { x: 26, y: 26 },
  ],
  maximumUnits: 10,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 17 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 17 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 17 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 17 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 17 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 25, y: 24 } }];

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
assertEqual(playerClassOverrides, [], "stage 17 side-1 class overrides");
assertEqual(template.perSlotBehaviorArrays.side1.filter((value) => value !== 0), [], "stage 17 side-1 AI behavior");

const qianActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 11,
  "stage 17 enemy actor Qian",
);
assertEqual({ name: qianActor.normalizedName, portraitRecord: qianActor.portraitRecord }, {
  name: "倩", portraitRecord: 37,
}, "stage 17 Qian identity");
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 11 ? { name: qianActor.normalizedName, portraitRecord: qianActor.portraitRecord } : {}),
}));
assertEqual(enemyUnits, [
  { slot: 11, nativeClassRecord: 8, position: { x: 25, y: 12 }, aiBehavior: 1, name: "倩", portraitRecord: 37 },
  { slot: 43, nativeClassRecord: 6, position: { x: 26, y: 12 }, aiBehavior: 1 },
  { slot: 39, nativeClassRecord: 25, position: { x: 17, y: 17 }, aiBehavior: 8 },
  { slot: 42, nativeClassRecord: 27, position: { x: 18, y: 17 }, aiBehavior: 8 },
  { slot: 41, nativeClassRecord: 7, position: { x: 19, y: 17 }, aiBehavior: 7 },
  { slot: 40, nativeClassRecord: 7, position: { x: 31, y: 17 }, aiBehavior: 5 },
  { slot: 35, nativeClassRecord: 27, position: { x: 32, y: 17 }, aiBehavior: 6 },
  { slot: 44, nativeClassRecord: 30, position: { x: 33, y: 17 }, aiBehavior: 6 },
  { slot: 51, nativeClassRecord: 29, position: { x: 25, y: 32 }, aiBehavior: 0 },
  { slot: 52, nativeClassRecord: 29, position: { x: 23, y: 34 }, aiBehavior: 0 },
  { slot: 54, nativeClassRecord: 29, position: { x: 25, y: 34 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: 29, position: { x: 27, y: 34 }, aiBehavior: 0 },
], "stage 17 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 17, "stage 17 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 11, defeat: 0,
}, "stage 17 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 11 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊敗「倩」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "倩已離開戰場。",
};

// REMAKE-051: the per-stage objective and title records come from the module-29 key
// tables, not from a stage-number formula. Lock both lookups to the machine evidence so a
// future stage cannot silently inherit a guessed record.
const objectiveRecordTable = storyPresentations.globalReachabilityAudit.tables.alternate;
const titleRecordTable = storyPresentations.globalReachabilityAudit.tables.postBattle;
const recordForStage = (table, stage, label) => {
  const entries = table.entries.filter((entry) => entry.key === stage && entry.enabled);
  if (entries.length !== 1) throw new Error(`${label} is not a single enabled entry: ${entries.length}`);
  return entries[0].dialogueRecord;
};
assertEqual({
  objective: recordForStage(objectiveRecordTable, 17, "stage 17 objective record"),
  title: recordForStage(titleRecordTable, 17, "stage 17 title record"),
  nextTitle: recordForStage(titleRecordTable, 18, "stage 18 title record"),
}, { objective: 86, title: 135, nextTitle: 136 }, "stage 17 dialogue records");

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("倩") || !originalObjectiveText.includes("妮雅")
  || !originalObjectiveText.includes("戰敗")) {
  throw new Error("SAY/0086 objective wording changed");
}
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔第四層") throw new Error(`stage 17 title changed: ${titleText}`);
if (nextTitleText !== "龍塔第五層") throw new Error(`stage 18 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 17,
  "stage 17 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [36], actions: [] },
  {
    trigger: "round 6 and every later active round",
    sayRecords: [],
    actions: [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }],
  },
], "stage 17 event program");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 17)) {
  throw new Error("stage 17 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(17)) {
  throw new Error("stage 17 unexpectedly entered the dynamic-board stage catalog");
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
  nextModule: 27, nextStage: 18, presentationReplayed: false,
}, "stage 17 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 17,
  "stage 17 module 25 story",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: null, resources: [],
}, "stage 17 module 25 story absence");
const stageMagicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 17,
  "stage 17 module 25 music table",
);
if (stageMagicEntry.magicRecord !== 73) throw new Error(`stage 17 MAGIC table changed: ${stageMagicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 17,
  `${table} stage 17 music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 7, loop: 6 }, enemy: { entry: 21, loop: 20 } }, "stage 17 music");

const portraitSpeakers = { 37: "倩" };
const storyPages = {
  "stage-17-opening-story": compileNativeStory(
    parseInput("openingStory"), 36, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-17-opening-story"].length, 3, "stage 17 opening waits");
assertEqual(
  [...new Set(storyPages["stage-17-opening-story"].map(({ source }) => source.backgroundId))],
  [undefined],
  "stage 17 opening keeps the battle map background",
);
assertEqual(
  [...new Set(storyPages["stage-17-opening-story"].map(({ upper }) => upper?.portrait))],
  [37],
  "stage 17 opening is a Qian monologue",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 17,
  "stage 17 construction tokens",
);
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 1, obstacle: 1,
}, "stage 17 construction tokens");
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
const contentIdentity = `stage-17/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 36,
  nativeDelayedAiReset: {
    firstRound: 6,
    repeatsEveryActiveRound: true,
    operation: "fillSide2PerSlotAiBehavior",
    slots: 75,
    value: 0,
    stableRemakeEffect: "release-native-sentries-to-shared-expert-pursuit",
  },
  enemyReinforcements,
  completedRoute: { module: 27, stage: 18, replayPresentation: false },
  stableRemakeDecision: "REMAKE-051",
};

const generatedSource = `// Generated by scripts/generate-stage17-runtime.mjs from stage 17 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE17_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE17_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE17_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE17_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE17_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE17_TITLE = ${json(titleText)};\n`
  + `export const STAGE17_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE17_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE17_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE17_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE17_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE17_CONSTRUCTION_TOKENS = ${json({ ironPlate: 1, obstacle: 1 })} as const;\n`
  + `export const STAGE17_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE17_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE17_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-17-opening-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage17-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage17-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-17-opening-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 17 maps and music with identity ${contentIdentity}`);
