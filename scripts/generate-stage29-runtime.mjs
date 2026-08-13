#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage29-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0059/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0146.json"),
  nextTitle: reversePath("parsed/dialogue/0147.json"),
  objectiveText: reversePath("parsed/dialogue/0096.json"),
  prebattleStory: reversePath("parsed/dialogue/0056.json"),
  map: reversePath("renders/battle-maps/confirmed/29.png"),
  minimap: reversePath("renders/battle-maps/minimap/29.png"),
  storyBackground23: reversePath("renders/planar/BK/0023/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0077.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0035.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0034.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0059 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "0149c70f337a4f82cfe31dde46792c6e10379e0107c3c6796cc1bb305dc29751") {
  throw new Error(`B/0059 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 29, "stage 29 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 29, "stage 29 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 29, "stage 29 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 39, y: 25 }, { x: 40, y: 25 }, { x: 41, y: 25 }, { x: 42, y: 25 },
  { x: 43, y: 25 }, { x: 39, y: 26 }, { x: 40, y: 26 }, { x: 42, y: 26 },
  { x: 43, y: 26 }, { x: 39, y: 27 }, { x: 40, y: 27 }, { x: 41, y: 27 },
  { x: 42, y: 27 }, { x: 43, y: 27 },
];
const fixedPlacements = [{ slot: 0, position: { x: 41, y: 26 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 29 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 29 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 29 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 29 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 29 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 29 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 15, "stage 29 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 29 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 29 side-1 class overrides");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const enemyActorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.enemyActors,
  (actor) => actor.slot === slot,
  `enemy actor ${slot}`,
);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
assertEqual(deploymentActors.find(({ slot }) => slot === 22), {
  slot: 22,
  portraitRecord: 0xff,
  normalizedName: "愛莉歐拉",
}, "stage 29 slot-22 raw deployment identity");

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 29,
  "stage 29 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 29 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "騎士城堡前的敵軍已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "騎士城堡前") throw new Error(`stage 29 title changed: ${titleText}`);
if (nextTitleText !== "治癒維斯塔女帝") throw new Error(`stage 30 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗所有的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0096 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 29),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 29),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 30),
}, { objective: 96, title: 146, next: 147 }, "stage 29 dialogue records");

const dispatcher = eventsDocument.module29BattleRuntime.dispatcher;
if (!dispatcher.stagesWithoutHandlersIn0To43.includes(29)) {
  throw new Error("stage 29 is no longer listed among stages without handlers");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlerStages.includes(29)
  || eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers.some(({ stage }) => stage === 29)) {
  throw new Error("stage 29 unexpectedly gained a round/outcome handler");
}
assertEqual(dispatcher.defaultWritesOnEveryInvocation, {
  nextModule: 25,
  nextStage: "currentStage + 1",
}, "stage 29 default route source");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 29,
  "stage 29 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: 56, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"] },
  "stage 29 module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 29,
  "stage 29 story music",
);
if (storyMusicEntry.magicRecord !== 77) throw new Error(`stage 29 story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(29)) {
  throw new Error("stage 29 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 29)) {
  throw new Error("stage 29 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}

const bossActor = enemyActorFor(4);
assertEqual({ name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord }, {
  name: "艾西柯羅",
  portraitRecord: 6,
}, "stage 29 Eschero identity");
const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
    ...(unit.unitSlot === 4
      ? { name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord }
      : {}),
  }));
assertEqual(enemyUnits, [
  { slot: 47, nativeClassRecord: 12, position: { x: 36, y: 13 }, aiBehavior: 2 },
  { slot: 52, nativeClassRecord: 11, position: { x: 37, y: 13 }, aiBehavior: 0 },
  { slot: 4, nativeClassRecord: 14, position: { x: 40, y: 13 }, aiBehavior: 0, name: "艾西柯羅", portraitRecord: 6 },
  { slot: 51, nativeClassRecord: 11, position: { x: 42, y: 13 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: 11, position: { x: 38, y: 15 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 11, position: { x: 40, y: 15 }, aiBehavior: 0 },
  { slot: 56, nativeClassRecord: 18, position: { x: 45, y: 15 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 18, position: { x: 30, y: 16 }, aiBehavior: 0 },
  { slot: 55, nativeClassRecord: 18, position: { x: 36, y: 16 }, aiBehavior: 0 },
  { slot: 54, nativeClassRecord: 11, position: { x: 39, y: 17 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 18, position: { x: 30, y: 18 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 12, position: { x: 32, y: 18 }, aiBehavior: 2 },
  { slot: 46, nativeClassRecord: 12, position: { x: 40, y: 19 }, aiBehavior: 2 },
  { slot: 45, nativeClassRecord: 12, position: { x: 43, y: 19 }, aiBehavior: 2 },
  { slot: 49, nativeClassRecord: 12, position: { x: 34, y: 21 }, aiBehavior: 2 },
], "stage 29 enemies");
assertEqual(
  enemyUnits.reduce((counts, { aiBehavior }) => ({
    ...counts,
    [aiBehavior]: (counts[aiBehavior] ?? 0) + 1,
  }), {}),
  { 0: 10, 2: 5 },
  "stage 29 enemy behaviors",
);
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
  ({ stage }) => stage === 29,
  `${table} stage 29 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 35, loop: 34 }, enemy: { entry: 13, loop: 12 } },
  "stage 29 music",
);
const portraitSpeakers = { 42: "蒙欣曼", 45: "希蜜", 46: "妮雅" };
const storyPages = {
  "stage-29-prebattle-story": compileNativeStory(
    parseInput("prebattleStory"), 56, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-29-prebattle-story"].length, 7, "stage 29 story waits");
assertEqual(
  [...new Set(storyPages["stage-29-prebattle-story"].map(({ source }) => source.backgroundId))],
  [23],
  "stage 29 prebattle background",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 29,
  "stage 29 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 16, obstacle: 16 },
  "stage 29 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-069\0REMAKE-070\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-29/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 56,
  prebattleBackgroundRecord: 23,
  prebattleMusicRecord: 77,
  nativeHandler: null,
  openingStoryRecord: null,
  victoryStoryRecord: null,
  enemyReinforcements,
  completedRoute: { module: 25, stage: 30, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-069", "REMAKE-070"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 15,
};
const generatedSource = `// Generated by scripts/generate-stage29-runtime.mjs from stage 29 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE29_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE29_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE29_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE29_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE29_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE29_TITLE = ${json(titleText)};\n`
  + `export const STAGE29_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE29_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE29_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE29_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE29_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE29_CONSTRUCTION_TOKENS = ${json({ ironPlate: 16, obstacle: 16 })} as const;\n`
  + `export const STAGE29_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE29_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE29_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage29-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage29-minimap.png")),
  copyFile(inputPaths.storyBackground23, path.join(publicAssetPath, "story-stage29-background-23.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage29.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage29-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage29-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage29-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage29-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-29-prebattle-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 29 maps, story assets, and battle music with identity ${contentIdentity}`);
