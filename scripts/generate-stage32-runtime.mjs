#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage32-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0065/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0149.json"),
  nextTitle: reversePath("parsed/dialogue/0150.json"),
  objectiveText: reversePath("parsed/dialogue/0100.json"),
  openingStory: reversePath("parsed/dialogue/0063.json"),
  victoryStory: reversePath("parsed/dialogue/0064.json"),
  map: reversePath("renders/battle-maps/confirmed/32.png"),
  minimap: reversePath("renders/battle-maps/minimap/32.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0039.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0038.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0065 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "f4ab3da4e6f60db88dda34542f4d7bbc8511e89147ed4d72ee5710da515cefc4") {
  throw new Error(`B/0065 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 32, "stage 32 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 32, "stage 32 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 32, "stage 32 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 20, y: 23 }, { x: 33, y: 23 },
  { x: 20, y: 26 }, { x: 33, y: 26 },
  { x: 22, y: 28 }, { x: 24, y: 28 }, { x: 28, y: 28 }, { x: 30, y: 28 },
  { x: 23, y: 43 }, { x: 24, y: 43 }, { x: 25, y: 43 }, { x: 26, y: 43 },
  { x: 27, y: 43 }, { x: 28, y: 43 }, { x: 29, y: 43 },
];
const fixedPlacements = [{ slot: 0, position: { x: 26, y: 28 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 32 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 32 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 32 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 32 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 32 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 32 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 16, "stage 32 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 32 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 32 side-1 class overrides");

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
  ({ stage }) => stage === 32,
  "stage 32 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 32 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "斯德林海峽的兩支騎士部隊已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "斯德林海峽") throw new Error(`stage 32 title changed: ${titleText}`);
if (nextTitleText !== "拉那洛城外") throw new Error(`stage 33 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗所有的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0100 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 32),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 32),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 33),
}, { objective: 100, title: 149, next: 150 }, "stage 32 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 32,
  "stage 32 handler",
);
if (handler.sha256 !== "9d7c97da0054a25745c5973b34a770f3be1f078319fcdb9aea7e286b36b81549") {
  throw new Error(`stage 32 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [63], actions: [] },
  { trigger: "live victory 999", sayRecords: [64], actions: [] },
], "stage 32 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 33, presentationReplayed: false },
  "stage 32 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 32,
  "stage 32 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources, behavior: storyEntry.behavior },
  { record: null, resources: [], behavior: "no module-25 story triplet" },
  "stage 32 absent module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 32,
  "stage 32 story music table entry",
);
if (storyMusicEntry.magicRecord !== 72) throw new Error(`stage 32 unused story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(32)) {
  throw new Error("stage 32 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 32)) {
  throw new Error("stage 32 entered the full-round reinforcement chain");
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
    ...([5, 6].includes(unit.unitSlot)
      ? {
          name: enemyActorFor(unit.unitSlot).normalizedName,
          portraitRecord: enemyActorFor(unit.unitSlot).portraitRecord,
        }
      : {}),
  }));
assertEqual(enemyUnits, [
  { slot: 56, nativeClassRecord: 15, position: { x: 37, y: 10 }, aiBehavior: 0 },
  { slot: 6, nativeClassRecord: 14, position: { x: 26, y: 18 }, aiBehavior: 0, name: "芙瑪羅妮", portraitRecord: 11 },
  { slot: 37, nativeClassRecord: 16, position: { x: 31, y: 18 }, aiBehavior: 0 },
  { slot: 38, nativeClassRecord: 17, position: { x: 32, y: 19 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 7, position: { x: 17, y: 20 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 33, position: { x: 21, y: 20 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 1, position: { x: 22, y: 20 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 7, position: { x: 23, y: 20 }, aiBehavior: 0 },
  { slot: 39, nativeClassRecord: 18, position: { x: 31, y: 20 }, aiBehavior: 0 },
  { slot: 31, nativeClassRecord: 3, position: { x: 24, y: 21 }, aiBehavior: 0 },
  { slot: 30, nativeClassRecord: 4, position: { x: 28, y: 21 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 9, position: { x: 17, y: 22 }, aiBehavior: 0 },
  { slot: 34, nativeClassRecord: 11, position: { x: 24, y: 22 }, aiBehavior: 0 },
  { slot: 32, nativeClassRecord: 5, position: { x: 25, y: 22 }, aiBehavior: 0 },
  { slot: 36, nativeClassRecord: 31, position: { x: 26, y: 22 }, aiBehavior: 0 },
  { slot: 35, nativeClassRecord: 32, position: { x: 27, y: 22 }, aiBehavior: 0 },
  { slot: 33, nativeClassRecord: 10, position: { x: 28, y: 22 }, aiBehavior: 0 },
  { slot: 5, nativeClassRecord: 14, position: { x: 26, y: 23 }, aiBehavior: 0, name: "菲伊魯茵", portraitRecord: 25 },
], "stage 32 enemies");
const enemyReinforcements = {
  kind: "none",
  initialSide2: enemyUnits.length,
  narrativeCallsThemReinforcements: true,
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
  ({ stage }) => stage === 32,
  `${table} stage 32 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 39, loop: 38 }, enemy: { entry: 13, loop: 12 } },
  "stage 32 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  11: "芙瑪羅妮",
  14: "琴斯",
  25: "菲伊魯茵",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-32-opening-story": compileNativeStory(
    parseInput("openingStory"), 63, portraitSpeakers, { includeBackground: true },
  ),
  "stage-32-victory-story": compileNativeStory(
    parseInput("victoryStory"), 64, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-32-opening-story": 6,
  "stage-32-victory-story": 4,
}, "stage 32 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 32,
  "stage 32 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 3, obstacle: 101 },
  "stage 32 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-073\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-32/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  unusedPrebattleMusicRecord: 72,
  openingStoryRecord: 63,
  victoryStoryRecord: 64,
  enemyReinforcements,
  completedRoute: { module: 27, stage: 33, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-073"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 16,
};
const generatedSource = `// Generated by scripts/generate-stage32-runtime.mjs from stage 32 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE32_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE32_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE32_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE32_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE32_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE32_TITLE = ${json(titleText)};\n`
  + `export const STAGE32_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE32_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE32_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE32_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE32_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE32_CONSTRUCTION_TOKENS = ${json({ ironPlate: 3, obstacle: 101 })} as const;\n`
  + `export const STAGE32_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE32_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE32_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage32-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage32-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 32 maps and battle music with identity ${contentIdentity}`);
