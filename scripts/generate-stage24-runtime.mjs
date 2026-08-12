#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage24-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0049/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0142.json"),
  nextTitle: reversePath("parsed/dialogue/0143.json"),
  objectiveText: reversePath("parsed/dialogue/0092.json"),
  openingStory: reversePath("parsed/dialogue/0047.json"),
  victoryStory: reversePath("parsed/dialogue/0048.json"),
  map: reversePath("renders/battle-maps/confirmed/24.png"),
  minimap: reversePath("renders/battle-maps/minimap/24.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0005.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0004.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0049 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "f60f4765fac3be76781b690839e5b4e2707a6f023caa1c2f89b017d8368fbaa7") {
  throw new Error(`B/0049 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 24, "stage 24 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 24, "stage 24 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 24, "stage 24 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 25, y: 38 }, { x: 26, y: 38 }, { x: 27, y: 38 }, { x: 28, y: 38 },
  { x: 29, y: 38 }, { x: 25, y: 39 }, { x: 26, y: 39 }, { x: 28, y: 39 },
  { x: 29, y: 39 }, { x: 25, y: 40 }, { x: 26, y: 40 }, { x: 27, y: 40 },
  { x: 28, y: 40 }, { x: 29, y: 40 },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 24 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 24 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 24 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 24 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 15, "stage 24 capacity");

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
  ({ stage }) => stage === 24,
  "stage 24 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  victorySlot: nativeObjective.victory.unitSlot,
  victoryRanges: nativeObjective.victory.successCellRangesInclusive,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "side1_slot_cell_range",
  victorySlot: 0,
  victoryRanges: [[0, 1030]],
  defeatSlot: 0,
}, "stage 24 native objective");
const generatedObjective = {
  victory: { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 0, maximum: 1030 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "「妮雅」到達死亡之谷的城堡",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "妮雅已抵達死亡之谷城堡。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "死亡之谷城堡前") throw new Error(`stage 24 title changed: ${titleText}`);
if (nextTitleText !== "遭遇碧娜維姬") throw new Error(`stage 26 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("妮雅") || !objectiveText.includes("死亡之谷的城堡")) {
  throw new Error("SAY/0092 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 24),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 24),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 26),
}, { objective: 92, title: 142, next: 143 }, "stage 24 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 24,
  "stage 24 handler",
);
if (handler.sha256 !== "c86b8d1ccaf06d0c8e403b04a085925f5c49a9a470e8838499aa2b4b2fb61544") {
  throw new Error(`stage 24 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [47], actions: [] },
  { trigger: "live victory 999", sayRecords: [48], actions: [] },
], "stage 24 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 26, presentationReplayed: false },
  "stage 24 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 24,
  "stage 24 module-25 record",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: null, resources: [] },
  "stage 24 module-25 story",
);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(24)) {
  throw new Error("stage 24 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 24)) {
  throw new Error("stage 24 entered the full-round reinforcement chain");
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
if (enemyUnits.length !== 22) throw new Error(`stage 24 enemy count changed: ${enemyUnits.length}`);
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  [{ slot: 0, position: { x: 27, y: 39 } }],
  "stage 24 fixed player board",
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
  ({ stage }) => stage === 24,
  `${table} stage 24 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 11, loop: 10 }, enemy: { entry: 5, loop: 4 } },
  "stage 24 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  14: "琴斯",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-24-opening-story": compileNativeStory(
    parseInput("openingStory"), 47, portraitSpeakers, { includeBackground: true },
  ),
  "stage-24-victory-story": compileNativeStory(
    parseInput("victoryStory"), 48, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-24-opening-story": 4,
  "stage-24-victory-story": 9,
}, "stage 24 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 24,
  "stage 24 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 3, obstacle: 3 },
  "stage 24 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-061\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-24/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  module25StoryRecord: null,
  openingStoryRecord: 47,
  victoryStoryRecord: 48,
  enemyReinforcements,
  completedRoute: { module: 27, stage: 26, replayPresentation: false },
  skippedNativeStage: 25,
  stableRemakeDecisions: ["REMAKE-061"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements: [{ slot: 0, position: { x: 27, y: 39 } }],
  optionalSlots,
  openCells,
  maximumUnits: 15,
};
const generatedSource = `// Generated by scripts/generate-stage24-runtime.mjs from stage 24 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE24_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE24_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE24_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE24_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE24_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE24_TITLE = ${json(titleText)};\n`
  + `export const STAGE24_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE24_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE24_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE24_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE24_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE24_CONSTRUCTION_TOKENS = ${json({ ironPlate: 3, obstacle: 3 })} as const;\n`
  + `export const STAGE24_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE24_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE24_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage24-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage24-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage24-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage24-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage24-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage24-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 24 maps and music with identity ${contentIdentity}`);
