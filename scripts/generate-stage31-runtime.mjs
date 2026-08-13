#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage31-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0063/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0148.json"),
  nextTitle: reversePath("parsed/dialogue/0149.json"),
  objectiveText: reversePath("parsed/dialogue/0099.json"),
  prebattleStory: reversePath("parsed/dialogue/0060.json"),
  openingStory: reversePath("parsed/dialogue/0061.json"),
  victoryStory: reversePath("parsed/dialogue/0062.json"),
  map: reversePath("renders/battle-maps/confirmed/31.png"),
  minimap: reversePath("renders/battle-maps/minimap/31.png"),
  storyBackground23: reversePath("renders/planar/BK/0023/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0079.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0037.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0036.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0063 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "1e40d2eed894ba31506ef0fb750af88f2efa43f81f6905e19775ea48384be8da") {
  throw new Error(`B/0063 hash changed: ${sha256(templateBytes)}`);
}

const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");
const techniqueRules = parseInput("techniqueRules");
const storyPresentations = parseInput("storyPresentations");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 31, "stage 31 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 31, "stage 31 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 31, "stage 31 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot > 4);
const openCells = [
  { x: 21, y: 23 }, { x: 26, y: 23 }, { x: 29, y: 23 },
  { x: 21, y: 25 }, { x: 26, y: 25 }, { x: 29, y: 25 },
  { x: 21, y: 27 }, { x: 26, y: 27 }, { x: 29, y: 27 },
  { x: 22, y: 31 }, { x: 26, y: 31 }, { x: 29, y: 32 },
];
const fixedPlacements = [
  { slot: 4, position: { x: 25, y: 12 } },
  { slot: 3, position: { x: 22, y: 14 } },
  { slot: 2, position: { x: 27, y: 14 } },
  { slot: 1, position: { x: 25, y: 15 } },
  { slot: 0, position: { x: 26, y: 33 } },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 31 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [4, 3, 2, 1, 0], "stage 31 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [4, 3, 2, 1, 0], "stage 31 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 31 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 31 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 31 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 17, "stage 31 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 31 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 31 side-1 class overrides");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const enemyActorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.enemyActors,
  (actor) => actor.slot === slot,
  `enemy actor ${slot}`,
);

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 31,
  "stage 31 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 31 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "斯德林海峽的伏兵已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "前往斯德林海峽") throw new Error(`stage 31 title changed: ${titleText}`);
if (nextTitleText !== "斯德林海峽") throw new Error(`stage 32 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗所有的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0099 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 31),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 31),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 32),
}, { objective: 99, title: 148, next: 149 }, "stage 31 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 31,
  "stage 31 handler",
);
if (handler.sha256 !== "dd09b721febeda628412363773a4d96e945007529f7a5f57d8df0305fe562a4a") {
  throw new Error(`stage 31 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [61], actions: [] },
  { trigger: "live victory 999", sayRecords: [62], actions: [] },
], "stage 31 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 32, presentationReplayed: false },
  "stage 31 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 31,
  "stage 31 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: 60, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"] },
  "stage 31 module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 31,
  "stage 31 story music",
);
if (storyMusicEntry.magicRecord !== 79) throw new Error(`stage 31 story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(31)) {
  throw new Error("stage 31 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 31)) {
  throw new Error("stage 31 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}

const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
    ...(unit.unitSlot === 5
      ? {
          name: enemyActorFor(5).normalizedName,
          portraitRecord: enemyActorFor(5).portraitRecord,
        }
      : {}),
  }));
assertEqual(enemyUnits, [
  { slot: 5, nativeClassRecord: 14, position: { x: 16, y: 14 }, aiBehavior: 0, name: "菲伊魯茵", portraitRecord: 25 },
  { slot: 55, nativeClassRecord: 14, position: { x: 15, y: 23 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 14, position: { x: 39, y: 23 }, aiBehavior: 0 },
  { slot: 51, nativeClassRecord: 8, position: { x: 37, y: 24 }, aiBehavior: 0 },
  { slot: 54, nativeClassRecord: 8, position: { x: 13, y: 25 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: 8, position: { x: 16, y: 25 }, aiBehavior: 0 },
  { slot: 52, nativeClassRecord: 8, position: { x: 35, y: 25 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 8, position: { x: 39, y: 25 }, aiBehavior: 0 },
  { slot: 56, nativeClassRecord: 14, position: { x: 15, y: 26 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 14, position: { x: 37, y: 26 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 16, position: { x: 23, y: 41 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 17, position: { x: 24, y: 41 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 18, position: { x: 26, y: 41 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 16, position: { x: 28, y: 41 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 18, position: { x: 29, y: 41 }, aiBehavior: 0 },
], "stage 31 enemies");
const enemyReinforcements = {
  kind: "none",
  initialSide2: enemyUnits.length,
  auditedSources: [
    "initial-template",
    "round-event-handler",
    "dynamic-board-catalog",
    "full-round-special-chain",
    "defeat-replacement-and-form-chain",
  ],
};

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 31,
  `${table} stage 31 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 11, loop: 10 }, enemy: { entry: 37, loop: 36 } },
  "stage 31 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  25: "菲伊魯茵",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-31-prebattle-story": compileNativeStory(
    parseInput("prebattleStory"), 60, portraitSpeakers, { includeBackground: true },
  ),
  "stage-31-opening-story": compileNativeStory(
    parseInput("openingStory"), 61, portraitSpeakers, { includeBackground: true },
  ),
  "stage-31-victory-story": compileNativeStory(
    parseInput("victoryStory"), 62, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-31-prebattle-story": 14,
  "stage-31-opening-story": 8,
  "stage-31-victory-story": 2,
}, "stage 31 story waits");
assertEqual(
  [...new Set(storyPages["stage-31-prebattle-story"].map(({ source }) => source.backgroundId))],
  [23],
  "stage 31 prebattle background",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 31,
  "stage 31 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 77, obstacle: 77 },
  "stage 31 construction tokens",
);

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
identityHash.update("stableRemake\0REMAKE-072\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-31/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 60,
  prebattleBackgroundRecord: 23,
  prebattleMusicRecord: 79,
  openingStoryRecord: 61,
  victoryStoryRecord: 62,
  enemyReinforcements,
  completedRoute: { module: 27, stage: 32, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-072"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 17,
};
const generatedSource = `// Generated by scripts/generate-stage31-runtime.mjs from stage 31 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE31_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE31_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE31_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE31_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE31_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE31_TITLE = ${json(titleText)};\n`
  + `export const STAGE31_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE31_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE31_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE31_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE31_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE31_CONSTRUCTION_TOKENS = ${json({ ironPlate: 77, obstacle: 77 })} as const;\n`
  + `export const STAGE31_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE31_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE31_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage31-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage31-minimap.png")),
  copyFile(inputPaths.storyBackground23, path.join(publicAssetPath, "story-stage31-background-23.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage31.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage31-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage31-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage31-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage31-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 31 maps, story assets, and battle music with identity ${contentIdentity}`);
