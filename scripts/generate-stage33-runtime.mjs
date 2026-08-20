#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage33-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0067/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0150.json"),
  nextTitle: reversePath("parsed/dialogue/0151.json"),
  objectiveText: reversePath("parsed/dialogue/0101.json"),
  openingStory: reversePath("parsed/dialogue/0065.json"),
  map: reversePath("renders/battle-maps/confirmed/33.png"),
  minimap: reversePath("renders/battle-maps/minimap/33.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0019.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0018.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0067 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "02dd9e67086e72dc9ff45a783f7385df21c6d58249fec739e63c9a7605a60d56") {
  throw new Error(`B/0067 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 33, "stage 33 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 33, "stage 33 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 33, "stage 33 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 19, y: 42 }, { x: 21, y: 42 }, { x: 23, y: 42 },
  { x: 25, y: 42 }, { x: 27, y: 42 }, { x: 29, y: 42 },
  { x: 31, y: 42 }, { x: 33, y: 42 }, { x: 35, y: 42 },
];
const fixedPlacements = [{ slot: 0, position: { x: 27, y: 44 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 33 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 33 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 33 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 33 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 33 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 33 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 10, "stage 33 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 33 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 33 side-1 class overrides");

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
const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 33,
  "stage 33 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 33 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "拉那洛城外的守軍已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "拉那洛城外") throw new Error(`stage 33 title changed: ${titleText}`);
if (nextTitleText !== "拉那洛城內") throw new Error(`stage 34 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗所有的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0101 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 33),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 33),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 34),
}, { objective: 101, title: 150, next: 151 }, "stage 33 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 33,
  "stage 33 handler",
);
if (handler.sha256 !== "57ec93026db6330742d0f9214af6e7bdca432a82d19d22b07dddafd594081f29") {
  throw new Error(`stage 33 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [65], actions: [] },
], "stage 33 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 34, presentationReplayed: false },
  "stage 33 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 33,
  "stage 33 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources, behavior: storyEntry.behavior },
  { record: null, resources: [], behavior: "no module-25 story triplet" },
  "stage 33 absent module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 33,
  "stage 33 story music table entry",
);
if (storyMusicEntry.magicRecord !== 73) throw new Error(`stage 33 unused story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(33)) {
  throw new Error("stage 33 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 33)) {
  throw new Error("stage 33 entered the full-round reinforcement chain");
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
    ...([23, 24].includes(unit.unitSlot)
      ? {
          name: enemyActorFor(unit.unitSlot).normalizedName,
          portraitRecord: enemyActorFor(unit.unitSlot).portraitRecord,
        }
      : {}),
  }));
assertEqual(enemyUnits, [
  { slot: 55, nativeClassRecord: 14, position: { x: 18, y: 8 }, aiBehavior: 0 },
  { slot: 56, nativeClassRecord: 14, position: { x: 34, y: 8 }, aiBehavior: 0 },
  { slot: 39, nativeClassRecord: 7, position: { x: 23, y: 10 }, aiBehavior: 2 },
  { slot: 37, nativeClassRecord: 7, position: { x: 24, y: 10 }, aiBehavior: 0 },
  { slot: 36, nativeClassRecord: 7, position: { x: 28, y: 10 }, aiBehavior: 0 },
  { slot: 38, nativeClassRecord: 7, position: { x: 29, y: 10 }, aiBehavior: 2 },
  { slot: 31, nativeClassRecord: 16, position: { x: 20, y: 12 }, aiBehavior: 2 },
  { slot: 23, nativeClassRecord: 18, position: { x: 25, y: 12 }, aiBehavior: 0, name: "阿莉絲", portraitRecord: 30 },
  { slot: 24, nativeClassRecord: 18, position: { x: 27, y: 12 }, aiBehavior: 0, name: "瑪西爾", portraitRecord: 31 },
  { slot: 30, nativeClassRecord: 16, position: { x: 32, y: 12 }, aiBehavior: 2 },
  { slot: 34, nativeClassRecord: 7, position: { x: 22, y: 15 }, aiBehavior: 2 },
  { slot: 35, nativeClassRecord: 7, position: { x: 30, y: 15 }, aiBehavior: 2 },
  { slot: 47, nativeClassRecord: 11, position: { x: 19, y: 25 }, aiBehavior: 1 },
  { slot: 49, nativeClassRecord: 31, position: { x: 22, y: 25 }, aiBehavior: 1 },
  { slot: 51, nativeClassRecord: 4, position: { x: 23, y: 25 }, aiBehavior: 1 },
  { slot: 54, nativeClassRecord: 32, position: { x: 24, y: 25 }, aiBehavior: 1 },
  { slot: 46, nativeClassRecord: 11, position: { x: 25, y: 25 }, aiBehavior: 1 },
  { slot: 45, nativeClassRecord: 11, position: { x: 27, y: 25 }, aiBehavior: 1 },
  { slot: 53, nativeClassRecord: 32, position: { x: 28, y: 25 }, aiBehavior: 1 },
  { slot: 52, nativeClassRecord: 4, position: { x: 29, y: 25 }, aiBehavior: 1 },
  { slot: 50, nativeClassRecord: 31, position: { x: 30, y: 25 }, aiBehavior: 1 },
  { slot: 48, nativeClassRecord: 11, position: { x: 33, y: 25 }, aiBehavior: 1 },
  { slot: 40, nativeClassRecord: 9, position: { x: 29, y: 27 }, aiBehavior: 1 },
  { slot: 41, nativeClassRecord: 9, position: { x: 24, y: 29 }, aiBehavior: 1 },
  { slot: 32, nativeClassRecord: 16, position: { x: 14, y: 31 }, aiBehavior: 0 },
  { slot: 33, nativeClassRecord: 16, position: { x: 40, y: 31 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 9, position: { x: 34, y: 32 }, aiBehavior: 1 },
  { slot: 43, nativeClassRecord: 9, position: { x: 30, y: 35 }, aiBehavior: 1 },
  { slot: 44, nativeClassRecord: 9, position: { x: 32, y: 38 }, aiBehavior: 1 },
], "stage 33 enemies");
const enemyReinforcements = {
  kind: "none",
  initialSide2: enemyUnits.length,
  narrativeCallsThemReinforcements: false,
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
  ({ stage }) => stage === 33,
  `${table} stage 33 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 19, loop: 18 }, enemy: { entry: 27, loop: 26 } },
  "stage 33 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-33-opening-story": compileNativeStory(
    parseInput("openingStory"), 65, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-33-opening-story": 6,
}, "stage 33 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 33,
  "stage 33 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 2, obstacle: 2 },
  "stage 33 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-074\0REMAKE-119\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-33/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  unusedPrebattleMusicRecord: 73,
  openingStoryRecord: 65,
  victoryStoryRecord: null,
  enemyReinforcements,
  completedRoute: { module: 27, stage: 34, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-074", "REMAKE-119"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 10,
};
const generatedSource = `// Generated by scripts/generate-stage33-runtime.mjs from stage 33 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE33_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE33_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE33_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE33_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE33_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE33_TITLE = ${json(titleText)};\n`
  + `export const STAGE33_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE33_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE33_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE33_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE33_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE33_CONSTRUCTION_TOKENS = ${json({ ironPlate: 2, obstacle: 2 })} as const;\n`
  + `export const STAGE33_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE33_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE33_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage33-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage33-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 33 maps and battle music with identity ${contentIdentity}`);
