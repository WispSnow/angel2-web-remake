#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage28-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0057/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0145.json"),
  nextTitle: reversePath("parsed/dialogue/0146.json"),
  objectiveText: reversePath("parsed/dialogue/0095.json"),
  prebattleStory: reversePath("parsed/dialogue/0053.json"),
  openingStory: reversePath("parsed/dialogue/0054.json"),
  victoryStory: reversePath("parsed/dialogue/0055.json"),
  map: reversePath("renders/battle-maps/confirmed/28.png"),
  minimap: reversePath("renders/battle-maps/minimap/28.png"),
  storyBackground22: reversePath("renders/planar/BK/0022/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0076.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0027.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0026.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0057 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "957c9681a8b2c2bf8eb869731e8480e7c3655ea830eb90154885b96aa3ed1512") {
  throw new Error(`B/0057 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 28, "stage 28 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 28, "stage 28 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 28, "stage 28 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 25, y: 21 }, { x: 26, y: 21 }, { x: 27, y: 21 }, { x: 28, y: 21 },
  { x: 29, y: 21 }, { x: 30, y: 21 }, { x: 31, y: 21 }, { x: 32, y: 21 },
  { x: 25, y: 22 }, { x: 32, y: 22 }, { x: 22, y: 23 }, { x: 23, y: 23 },
  { x: 24, y: 23 }, { x: 25, y: 23 }, { x: 32, y: 23 }, { x: 22, y: 24 },
  { x: 32, y: 24 }, { x: 22, y: 25 }, { x: 32, y: 25 }, { x: 22, y: 26 },
  { x: 32, y: 26 }, { x: 22, y: 27 }, { x: 32, y: 27 }, { x: 22, y: 28 },
  { x: 23, y: 28 }, { x: 24, y: 28 }, { x: 25, y: 28 }, { x: 26, y: 28 },
  { x: 27, y: 28 }, { x: 28, y: 28 }, { x: 29, y: 28 }, { x: 30, y: 28 },
  { x: 31, y: 28 }, { x: 32, y: 28 },
];
const fixedPlacements = [{ slot: 0, position: { x: 28, y: 24 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 28 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 28 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 28 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 28 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 28 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 28 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 29, "stage 28 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 28 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 28 side-1 class overrides");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 28,
  "stage 28 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 28 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗攻擊瓦爾克麗城的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "攻擊瓦爾克麗城的敵人已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "保衛瓦爾克麗城") throw new Error(`stage 28 title changed: ${titleText}`);
if (nextTitleText !== "騎士城堡前") throw new Error(`stage 29 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗攻擊瓦爾克麗城的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0095 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 28),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 28),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 29),
}, { objective: 95, title: 145, next: 146 }, "stage 28 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 28,
  "stage 28 handler",
);
if (handler.sha256 !== "1cccbd6ad47bf9f501137f0943aec590de4c1cc76ca3cd5bd78c6ba16536d128") {
  throw new Error(`stage 28 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [54], actions: [] },
  { trigger: "live victory 999", sayRecords: [55], actions: [] },
], "stage 28 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 25, nextStage: 29, presentationReplayed: false },
  "stage 28 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 28,
  "stage 28 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: 53, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"] },
  "stage 28 module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 28,
  "stage 28 story music",
);
if (storyMusicEntry.magicRecord !== 76) throw new Error(`stage 28 story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(28)) {
  throw new Error("stage 28 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 28)) {
  throw new Error("stage 28 entered the full-round reinforcement chain");
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
  }));
assertEqual(enemyUnits, [
  { slot: 41, nativeClassRecord: 14, position: { x: 39, y: 12 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 14, position: { x: 43, y: 12 }, aiBehavior: 0 },
  { slot: 55, nativeClassRecord: 1, position: { x: 27, y: 15 }, aiBehavior: 0 },
  { slot: 56, nativeClassRecord: 1, position: { x: 29, y: 15 }, aiBehavior: 0 },
  { slot: 57, nativeClassRecord: 1, position: { x: 32, y: 15 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 33, position: { x: 34, y: 16 }, aiBehavior: 0 },
  { slot: 54, nativeClassRecord: 1, position: { x: 36, y: 17 }, aiBehavior: 0 },
  { slot: 51, nativeClassRecord: 33, position: { x: 37, y: 20 }, aiBehavior: 0 },
  { slot: 52, nativeClassRecord: 33, position: { x: 38, y: 22 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: 33, position: { x: 38, y: 25 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 32, position: { x: 22, y: 33 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 21, position: { x: 24, y: 33 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 32, position: { x: 26, y: 33 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 21, position: { x: 29, y: 33 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 32, position: { x: 30, y: 33 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 23, position: { x: 41, y: 39 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 23, position: { x: 37, y: 40 }, aiBehavior: 0 },
], "stage 28 enemies");
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
  ({ stage }) => stage === 28,
  `${table} stage 28 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 11, loop: 10 }, enemy: { entry: 27, loop: 26 } },
  "stage 28 music",
);
const portraitSpeakers = {
  42: "蒙欣曼",
  43: "黛西",
  44: "拉朵那",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-28-prebattle-story": compileNativeStory(
    parseInput("prebattleStory"), 53, portraitSpeakers, { includeBackground: true },
  ),
  "stage-28-opening-story": compileNativeStory(
    parseInput("openingStory"), 54, portraitSpeakers, { includeBackground: true },
  ),
  "stage-28-victory-story": compileNativeStory(
    parseInput("victoryStory"), 55, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-28-prebattle-story": 14,
  "stage-28-opening-story": 5,
  "stage-28-victory-story": 8,
}, "stage 28 story waits");
assertEqual(
  [...new Set(storyPages["stage-28-prebattle-story"].map(({ source }) => source.backgroundId))],
  [22],
  "stage 28 prebattle background",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 28,
  "stage 28 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 16, obstacle: 16 },
  "stage 28 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-068\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-28/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 53,
  prebattleBackgroundRecord: 22,
  prebattleMusicRecord: 76,
  openingStoryRecord: 54,
  victoryStoryRecord: 55,
  enemyReinforcements,
  completedRoute: { module: 25, stage: 29, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-068"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 29,
};
const generatedSource = `// Generated by scripts/generate-stage28-runtime.mjs from stage 28 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE28_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE28_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE28_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE28_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE28_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE28_TITLE = ${json(titleText)};\n`
  + `export const STAGE28_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE28_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE28_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE28_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE28_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE28_CONSTRUCTION_TOKENS = ${json({ ironPlate: 16, obstacle: 16 })} as const;\n`
  + `export const STAGE28_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE28_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE28_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage28-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage28-minimap.png")),
  copyFile(inputPaths.storyBackground22, path.join(publicAssetPath, "story-stage28-background-22.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage28.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage28-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage28-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage28-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage28-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 28 maps, story assets, and battle music with identity ${contentIdentity}`);
