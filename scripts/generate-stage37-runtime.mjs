#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage37-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0075/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  title: reversePath("parsed/dialogue/0154.json"),
  objectiveText: reversePath("parsed/dialogue/0105.json"),
  openingStory: reversePath("parsed/dialogue/0081.json"),
  bossNotes: reversePath("notes/special-unit-behavior.md"),
  map: reversePath("renders/battle-maps/confirmed/37.png"),
  minimap: reversePath("renders/battle-maps/minimap/37.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0033.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0032.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0075 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "43629082cf8eddebd5bb7a35babb533ce7b84fd77bcb4acd285a7a4b786ceabe") {
  throw new Error(`B/0075 hash changed: ${sha256(templateBytes)}`);
}

const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");
const techniqueRules = parseInput("techniqueRules");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 37, "stage 37 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 37, "stage 37 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 37, "stage 37 lifecycle");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = template.deployment.cells.map(({ x, y }) => ({ x, y }));
const fixedPlacements = [{ slot: 0, position: { x: 23, y: 17 } }];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 37 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 37 fixed slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 37 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 37 optional slots");
assertEqual(openCells.length, 26, "stage 37 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 27, "stage 37 capacity");
assertEqual(
  template.activeUnitInstances.filter(({ side }) => side === 1)
    .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })),
  fixedPlacements,
  "stage 37 fixed player board",
);

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
  ({ stage }) => stage === 37,
  "stage 37 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 37 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "消滅「究極女神」的三個部位",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "究極女神的頭與兩隻手已全部被擊破。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
if (titleText !== "究極女神") throw new Error(`stage 37 title changed: ${titleText}`);
const visibleObjectiveText = dialogueText("objectiveText");
if (!visibleObjectiveText.includes("打敗「碧娜維姬」") || !visibleObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0105 objective wording changed");
}

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 37,
  "stage 37 handler",
);
if (handler.sha256 !== "62678f3776aa9e9a8cb9480f4aed580943017edb3f2f8bc2a945cfb4ff062be3") {
  throw new Error(`stage 37 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [{ trigger: "round 1", sayRecords: [81], actions: [] }], "stage 37 stories");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 25,
  nextStage: 49,
  presentationReplayed: false,
}, "stage 37 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 37,
  "stage 37 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources, behavior: storyEntry.behavior },
  { record: null, resources: [], behavior: "no module-25 story triplet" },
  "stage 37 absent module-25 story",
);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(37)) {
  throw new Error("stage 37 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 37)) {
  throw new Error("stage 37 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}

const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.descriptorClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
  }));
assertEqual(enemyUnits, [
  { slot: 56, nativeClassRecord: 37, position: { x: 23, y: 11 }, aiBehavior: 0 },
  { slot: 54, nativeClassRecord: 38, position: { x: 22, y: 12 }, aiBehavior: 0 },
  { slot: 55, nativeClassRecord: 38, position: { x: 24, y: 12 }, aiBehavior: 0 },
], "stage 37 boss parts");
const enemyReinforcements = {
  kind: "none",
  initialSide2: 3,
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
  ({ stage }) => stage === 37,
  `${table} stage 37 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, {
  player: { entry: 33, loop: 32 },
  enemy: { entry: 5, loop: 4 },
}, "stage 37 music");
const storyPages = {
  "stage-37-opening-story": compileNativeStory(
    parseInput("openingStory"),
    81,
    { 8: "碧娜維姬", 10: "蘇蘭達", 14: "琴斯", 46: "妮雅" },
    { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-37-opening-story"].length, 7, "stage 37 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 37,
  "stage 37 construction tokens",
);
assertEqual({
  ironPlate: constructionTokens.ironPlateSourceToken,
  obstacle: constructionTokens.obstacleSourceToken,
}, { ironPlate: 78, obstacle: 23 }, "stage 37 construction tokens");

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
identityHash.update("stableRemake\0REMAKE-084\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-37/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  unusedPrebattleMusicRecord: 77,
  openingStoryRecord: 81,
  victoryStoryRecord: null,
  visibleObjectiveRecord: {
    record: 105,
    text: visibleObjectiveText,
    conflict: "visible text names Bina Vige while the machine objective requires all side-2 parts absent",
  },
  enemyReinforcements,
  boss: {
    maximumLife: { default: 10000, highestDifficulty: 15000 },
    attack: { default: 100, highestDifficulty: 150 },
    defense: { default: 10, highestDifficulty: 15 },
    movement: 1,
    movable: false,
    concealedNumericFields: 9,
    headActions: ["recovery-3", "ice-3"],
    sharedHandActions: ["lightning-4", "fire-4"],
    handTargetGate: { randomBelow: 5, acceptedValue: 0, scan: "ascending-board-cells" },
  },
  completedRoute: { module: 25, stage: 49, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-005", "REMAKE-013", "REMAKE-084"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 27,
};
const generatedSource = `// Generated by scripts/generate-stage37-runtime.mjs from stage 37 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE37_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE37_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE37_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE37_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE37_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE37_TITLE = ${json(titleText)};\n`
  + `export const STAGE37_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE37_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE37_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE37_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE37_CONSTRUCTION_TOKENS = ${json({ ironPlate: 78, obstacle: 23 })} as const;\n`
  + `export const STAGE37_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE37_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE37_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-37-opening-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage37-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage37-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage37-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage37-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage37-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage37-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-37-opening-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 37 maps and battle music with identity ${contentIdentity}`);
