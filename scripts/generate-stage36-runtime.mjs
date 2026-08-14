#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage36-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0073/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  aiNotes: reversePath("notes/ai-decision-system.md"),
  title: reversePath("parsed/dialogue/0153.json"),
  nextTitle: reversePath("parsed/dialogue/0154.json"),
  objectiveText: reversePath("parsed/dialogue/0104.json"),
  openingStory: reversePath("parsed/dialogue/0080.json"),
  map: reversePath("renders/battle-maps/confirmed/36.png"),
  minimap: reversePath("renders/battle-maps/minimap/36.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0019.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0018.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0073 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "8dfe4efa6b160024299d8eb5e316e1cafa8bb204e0a211d21739aadaadbf1c13") {
  throw new Error(`B/0073 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 36, "stage 36 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 36, "stage 36 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 36, "stage 36 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = template.deployment.cells.map(({ x, y }) => ({ x, y }));
const fixedPlacements = [{ slot: 0, position: { x: 24, y: 27 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 36 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 36 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 36 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 36 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 36 optional slots");
assertEqual(openCells.length, 27, "stage 36 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 28, "stage 36 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 36 fixed player board",
);
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 36 side-1 class overrides");

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
  ({ stage }) => stage === 36,
  "stage 36 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  victorySlot: nativeObjective.victory.unitSlot,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "required_side2_slot_absent",
  victorySlot: 1,
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 36 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 1 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗「碧娜維姬」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "碧娜維姬已被擊敗，異世界的追擊戰告一段落。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "異世界的碧娜維姬") throw new Error(`stage 36 title changed: ${titleText}`);
if (nextTitleText !== "究極女神") throw new Error(`stage 37 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗「碧娜維姬」") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0104 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 36),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 36),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 37),
}, { objective: 104, title: 153, next: 154 }, "stage 36 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 36,
  "stage 36 handler",
);
if (handler.sha256 !== "1a1728a24f61e5d6a164a2fb583c53cff835caa16569b903445ba7100695458d") {
  throw new Error(`stage 36 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [80], actions: [] },
], "stage 36 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 37, presentationReplayed: false },
  "stage 36 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 36,
  "stage 36 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources, behavior: storyEntry.behavior },
  { record: null, resources: [], behavior: "no module-25 story triplet" },
  "stage 36 absent module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 36,
  "stage 36 story music table entry",
);
if (storyMusicEntry.magicRecord !== 76) throw new Error(`stage 36 unused story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(36)) {
  throw new Error("stage 36 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 36)) {
  throw new Error("stage 36 entered the full-round reinforcement chain");
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
    ...(unit.unitSlot === 1
      ? {
          name: enemyActorFor(unit.unitSlot).normalizedName,
          portraitRecord: enemyActorFor(unit.unitSlot).portraitRecord,
        }
      : {}),
  }));
assertEqual(enemyUnits.length, 30, "stage 36 enemy count");
assertEqual(enemyUnits.find(({ slot }) => slot === 1), {
  slot: 1,
  nativeClassRecord: 31,
  position: { x: 23, y: 13 },
  aiBehavior: 1,
  name: "碧娜維姬",
  portraitRecord: 8,
}, "stage 36 Bina Vige");
assertEqual(
  Object.fromEntries([0, 1, 2].map((behavior) => [
    behavior,
    enemyUnits.filter(({ aiBehavior }) => aiBehavior === behavior).length,
  ])),
  { 0: 5, 1: 1, 2: 24 },
  "stage 36 behavior counts",
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
  ({ stage }) => stage === 36,
  `${table} stage 36 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 19, loop: 18 }, enemy: { entry: 13, loop: 12 } },
  "stage 36 music",
);
const portraitSpeakers = {
  8: "碧娜維姬",
  14: "琴斯",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-36-opening-story": compileNativeStory(
    parseInput("openingStory"), 80, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-36-opening-story": 10,
}, "stage 36 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 36,
  "stage 36 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 23, obstacle: 23 },
  "stage 36 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-078\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-36/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  unusedPrebattleMusicRecord: 76,
  openingStoryRecord: 80,
  victoryStoryRecord: null,
  enemyReinforcements,
  enemyBehaviorGroups: {
    sentry: enemyUnits.filter(({ aiBehavior }) => aiBehavior === 1).map(({ slot }) => slot),
    default: enemyUnits.filter(({ aiBehavior }) => aiBehavior === 0).map(({ slot }) => slot),
    gatedPursuit: enemyUnits.filter(({ aiBehavior }) => aiBehavior === 2).map(({ slot }) => slot),
  },
  completedRoute: { module: 27, stage: 37, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-078"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 28,
};
const generatedSource = `// Generated by scripts/generate-stage36-runtime.mjs from stage 36 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE36_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE36_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE36_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE36_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE36_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE36_TITLE = ${json(titleText)};\n`
  + `export const STAGE36_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE36_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE36_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE36_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE36_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE36_CONSTRUCTION_TOKENS = ${json({ ironPlate: 23, obstacle: 23 })} as const;\n`
  + `export const STAGE36_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE36_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE36_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage36-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage36-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage36-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage36-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage36-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage36-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 36 maps and battle music with identity ${contentIdentity}`);
