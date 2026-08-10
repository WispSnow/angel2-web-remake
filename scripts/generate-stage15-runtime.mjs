#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage15-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0031/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  title: reversePath("parsed/dialogue/0133.json"),
  nextTitle: reversePath("parsed/dialogue/0134.json"),
  objectiveText: reversePath("parsed/dialogue/0098.json"),
  openingStory: reversePath("parsed/dialogue/0034.json"),
  map: reversePath("renders/battle-maps/confirmed/15.png"),
  minimap: reversePath("renders/battle-maps/minimap/15.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0019.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0018.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0031 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "d36a3a15b6e2e0445bc508d822ae3152c144fb5a86d3b8615fdaf0ffcb81a49c") {
  throw new Error(`B/0031 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 15, "stage 15 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 15, "stage 15 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 15, "stage 15 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 23, y: 29 }, { x: 24, y: 29 }, { x: 25, y: 29 },
    { x: 26, y: 29 }, { x: 27, y: 29 }, { x: 23, y: 30 },
    { x: 27, y: 30 }, { x: 23, y: 31 }, { x: 27, y: 31 },
  ],
  maximumUnits: 10,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 15 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 15 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 15 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 15 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 15 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 25, y: 31 } }];

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
assertEqual(playerClassOverrides, [], "stage 15 side-1 class overrides");
assertEqual(template.perSlotBehaviorArrays.side1.filter((value) => value !== 0), [], "stage 15 side-1 AI behavior");

const lanActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 9,
  "stage 15 enemy actor Lan",
);
assertEqual({ name: lanActor.normalizedName, portraitRecord: lanActor.portraitRecord }, {
  name: "蘭", portraitRecord: 35,
}, "stage 15 Lan identity");
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 9 ? { name: lanActor.normalizedName, portraitRecord: lanActor.portraitRecord } : {}),
}));
assertEqual(enemyUnits, [
  { slot: 52, nativeClassRecord: 7, position: { x: 10, y: 18 }, aiBehavior: 0 },
  { slot: 51, nativeClassRecord: 7, position: { x: 40, y: 18 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 23, position: { x: 23, y: 23 }, aiBehavior: 2 },
  { slot: 47, nativeClassRecord: 6, position: { x: 24, y: 23 }, aiBehavior: 1 },
  { slot: 9, nativeClassRecord: 8, position: { x: 25, y: 23 }, aiBehavior: 1, name: "蘭", portraitRecord: 35 },
  { slot: 41, nativeClassRecord: 23, position: { x: 26, y: 23 }, aiBehavior: 2 },
  { slot: 48, nativeClassRecord: 20, position: { x: 23, y: 26 }, aiBehavior: 1 },
  { slot: 44, nativeClassRecord: 29, position: { x: 24, y: 26 }, aiBehavior: 1 },
  { slot: 45, nativeClassRecord: 29, position: { x: 25, y: 26 }, aiBehavior: 1 },
  { slot: 49, nativeClassRecord: 20, position: { x: 26, y: 26 }, aiBehavior: 1 },
], "stage 15 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 15, "stage 15 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 9, defeat: 0,
}, "stage 15 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 9 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊敗「蘭」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "蘭已離開戰場。",
};
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("娜米") || !originalObjectiveText.includes("妮雅") || !originalObjectiveText.includes("戰敗")) {
  throw new Error("SAY/0098 objective wording changed");
}
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔第二層") throw new Error(`stage 15 title changed: ${titleText}`);
if (nextTitleText !== "龍塔第三層") throw new Error(`stage 16 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 15,
  "stage 15 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [34], actions: [] },
  {
    trigger: "round 6 and every later active round",
    sayRecords: [],
    actions: [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }],
  },
], "stage 15 event program");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 15)) {
  throw new Error("stage 15 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(15)) {
  throw new Error("stage 15 unexpectedly entered the dynamic-board stage catalog");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: [
    "initial-template", "round-event-handler", "dynamic-board-catalog",
    "full-round-special-chain", "defeat-replacement-and-form-chain",
  ],
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 27, nextStage: 16, presentationReplayed: false,
}, "stage 15 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 15,
  "stage 15 module 25 story",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: null, resources: [],
}, "stage 15 module 25 story absence");
const stageMagicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 15,
  "stage 15 module 25 music table",
);
if (stageMagicEntry.magicRecord !== 79) throw new Error(`stage 15 MAGIC table changed: ${stageMagicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 15,
  `${table} stage 15 music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 19, loop: 18 }, enemy: { entry: 21, loop: 20 } }, "stage 15 music");

const portraitSpeakers = { 10: "蘇蘭達", 35: "蘭", 46: "妮雅" };
const storyPages = {
  "stage-15-opening-story": compileNativeStory(
    parseInput("openingStory"), 34, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-15-opening-story"].length, 5, "stage 15 opening waits");
assertEqual(
  [...new Set(storyPages["stage-15-opening-story"].map(({ source }) => source.backgroundId))],
  [undefined],
  "stage 15 opening keeps the battle map background",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 15,
  "stage 15 construction tokens",
);
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 1, obstacle: 1,
}, "stage 15 construction tokens");
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
identityHash.update("stableRemake\0REMAKE-048\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-15/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 34,
  nativeDelayedAiReset: {
    firstRound: 6,
    repeatsEveryActiveRound: true,
    operation: "fillSide2PerSlotAiBehavior",
    slots: 75,
    value: 0,
    stableRemakeEffect: "release-native-sentries-to-shared-expert-pursuit",
  },
  enemyReinforcements,
  completedRoute: { module: 27, stage: 16, replayPresentation: false },
  stableRemakeDecision: "REMAKE-048",
};

const generatedSource = `// Generated by scripts/generate-stage15-runtime.mjs from stage 15 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE15_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE15_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE15_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE15_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE15_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE15_TITLE = ${json(titleText)};\n`
  + `export const STAGE15_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE15_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE15_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE15_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE15_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE15_CONSTRUCTION_TOKENS = ${json({ ironPlate: 1, obstacle: 1 })} as const;\n`
  + `export const STAGE15_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE15_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE15_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-15-opening-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage15-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage15-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage15-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage15-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage15-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage15-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-15-opening-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 15 maps and music with identity ${contentIdentity}`);
