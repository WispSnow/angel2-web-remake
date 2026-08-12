#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage23-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0047/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0141.json"),
  nextTitle: reversePath("parsed/dialogue/0142.json"),
  objectiveText: reversePath("parsed/dialogue/0091.json"),
  openingStory: reversePath("parsed/dialogue/0046.json"),
  map: reversePath("renders/battle-maps/confirmed/23.png"),
  minimap: reversePath("renders/battle-maps/minimap/23.png"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0047 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "1b19094f1efa3385567d1c0bf17a0f49be0bb711b1c4c64dd13b4706f313f045") {
  throw new Error(`B/0047 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 23, "stage 23 template");
const precedingTemplate = requireEntry(
  battleTemplates.stages,
  ({ stage }) => stage === 22,
  "stage 22 template",
);
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 23, "stage 23 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 23, "stage 23 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 23, y: 37 }, { x: 24, y: 37 }, { x: 25, y: 37 }, { x: 26, y: 37 },
  { x: 27, y: 37 }, { x: 23, y: 38 }, { x: 24, y: 38 }, { x: 26, y: 38 },
  { x: 27, y: 38 }, { x: 23, y: 39 }, { x: 24, y: 39 }, { x: 25, y: 39 },
  { x: 26, y: 39 }, { x: 27, y: 39 },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 23 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 23 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 23 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 23 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 15, "stage 23 capacity");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const kinsNativeClassRecord = precedingTemplate.classArrays.side1SparseOverrides[7];
assertEqual(kinsNativeClassRecord, 3, "Kins stage 22 campaign-entry class");
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return {
    slot,
    portraitRecord: actor.portraitRecord,
    normalizedName: actor.normalizedName,
    ...(slot === 7 ? { campaignEntryNativeClassRecord: kinsNativeClassRecord } : {}),
  };
});

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 23,
  "stage 23 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  victorySlot: nativeObjective.victory.unitSlot,
  victoryRanges: nativeObjective.victory.successCellRangesInclusive,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "side1_slot_cell_range",
  victorySlot: 0,
  victoryRanges: [[0, 524]],
  defeatSlot: 0,
}, "stage 23 native objective");
const generatedObjective = {
  victory: { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 0, maximum: 524 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "「妮雅」到達死亡之谷的頂端",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "妮雅已抵達死亡之谷頂端。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "死亡之谷中") throw new Error(`stage 23 title changed: ${titleText}`);
if (nextTitleText !== "死亡之谷城堡前") throw new Error(`stage 24 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("妮雅") || !objectiveText.includes("死亡之谷的頂端")) {
  throw new Error("SAY/0091 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 23),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 23),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 24),
}, { objective: 91, title: 141, next: 142 }, "stage 23 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 23,
  "stage 23 handler",
);
if (handler.sha256 !== "d4964d7e2578c44786fb434e9858fc2d6d3b57fda8323a3931023cbab9bac9f1") {
  throw new Error(`stage 23 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [{ trigger: "round 1", sayRecords: [46], actions: [] }], "stage 23 round-one story");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 24, presentationReplayed: false },
  "stage 23 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 23,
  "stage 23 module-25 record",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: 45, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"] },
  "stage 23 prebattle story",
);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(23)) {
  throw new Error("stage 23 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 23)) {
  throw new Error("stage 23 entered the full-round reinforcement chain");
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
if (enemyUnits.length !== 21) throw new Error(`stage 23 enemy count changed: ${enemyUnits.length}`);
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  [{ slot: 0, position: { x: 25, y: 38 } }],
  "stage 23 fixed player board",
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
  ({ stage }) => stage === 23,
  `${table} stage 23 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 19, loop: 18 }, enemy: { entry: 27, loop: 26 } },
  "stage 23 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  14: "琴斯",
  41: "維絲塔",
  43: "黛西",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-23-opening-story": compileNativeStory(
    parseInput("openingStory"), 46, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-23-opening-story": 4,
}, "stage 23 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 23,
  "stage 23 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 3, obstacle: 3 },
  "stage 23 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-054\0REMAKE-058\0REMAKE-059\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-23/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 46,
  enemyReinforcements,
  completedRoute: { module: 27, stage: 24, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-054", "REMAKE-058", "REMAKE-059"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements: [{ slot: 0, position: { x: 25, y: 38 } }],
  optionalSlots,
  openCells,
  maximumUnits: 15,
};
const generatedSource = `// Generated by scripts/generate-stage23-runtime.mjs from stage 23 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE23_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE23_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE23_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE23_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE23_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE23_TITLE = ${json(titleText)};\n`
  + `export const STAGE23_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE23_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE23_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE23_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE23_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE23_CONSTRUCTION_TOKENS = ${json({ ironPlate: 3, obstacle: 3 })} as const;\n`
  + `export const STAGE23_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE23_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE23_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage23-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage23-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage23-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage23-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage23-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage23-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 23 maps and music with identity ${contentIdentity}`);
