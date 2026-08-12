#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage26-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0053/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  remainingPresentations: reversePath("parsed/native/remaining-technique-presentations.json"),
  stage26Effect: reversePath("parsed/native/wd-stage26.json"),
  title: reversePath("parsed/dialogue/0143.json"),
  nextTitle: reversePath("parsed/dialogue/0144.json"),
  objectiveText: reversePath("parsed/dialogue/0093.json"),
  openingStory: reversePath("parsed/dialogue/0049.json"),
  victoryStory: reversePath("parsed/dialogue/0050.json"),
  map: reversePath("renders/battle-maps/confirmed/26.png"),
  minimap: reversePath("renders/battle-maps/minimap/26.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0053 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "c706b1c95b8baabee85c37ecfed074f50ea640a94ded33543ac5d4a352433dd5") {
  throw new Error(`B/0053 hash changed: ${sha256(templateBytes)}`);
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
const remainingPresentations = parseInput("remainingPresentations");
const stage26EffectDocument = parseInput("stage26Effect");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 26, "stage 26 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 26, "stage 26 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 26, "stage 26 lifecycle");

const eligibleSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31];
const fixedSlots = [1, 0, 8, 7];
const optionalSlots = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31];
const openCells = [13, 14, 15, 16, 17, 18, 20, 21, 23, 24, 25, 27, 28, 29, 31, 32, 33, 34]
  .map((x) => ({ x, y: 31 }));
const fixedPlacements = [
  { slot: 1, position: { x: 19, y: 31 } },
  { slot: 0, position: { x: 22, y: 31 } },
  { slot: 8, position: { x: 26, y: 31 } },
  { slot: 7, position: { x: 30, y: 31 } },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 26 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, fixedSlots, "stage 26 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 26 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 26 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 22, "stage 26 capacity");
assertEqual(template.activeUnitInstances.filter(({ side }) => side === 1)
  .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } })), fixedPlacements, "stage 26 fixed board");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 26, "stage 26 objective");
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
}, "stage 26 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 1 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗「碧娜維姬」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "碧娜維姬已被擊敗。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "遭遇碧娜維姬") throw new Error(`stage 26 title changed: ${titleText}`);
if (nextTitleText !== "趕回瓦爾克麗城") throw new Error(`stage 27 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("碧娜維姬") || !objectiveText.includes("妮雅")) {
  throw new Error("SAY/0093 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 26),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 26),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 27),
}, { objective: 93, title: 143, next: 144 }, "stage 26 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 26,
  "stage 26 handler",
);
if (handler.sha256 !== "f8cb0225a6c959198ec9bdff8db7ddf07a97b9fa55bd56ec4a68af1e2b5698b3") {
  throw new Error(`stage 26 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [49], actions: [] },
  { trigger: "live victory 999", sayRecords: [50], actions: [] },
], "stage 26 stories");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 27, nextStage: 27, presentationReplayed: false,
}, "stage 26 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 26,
  "stage 26 module-25 record",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: null, resources: [],
}, "stage 26 module-25 story");
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(26)) {
  throw new Error("stage 26 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 26)) {
  throw new Error("stage 26 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}

const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 1 ? { name: "碧娜維姬", portraitRecord: 8 } : {}),
}));
if (enemyUnits.length !== 8) throw new Error(`stage 26 enemy count changed: ${enemyUnits.length}`);
assertEqual(enemyUnits.find(({ slot }) => slot === 1), {
  slot: 1,
  nativeClassRecord: 32,
  position: { x: 22, y: 15 },
  aiBehavior: 1,
  name: "碧娜維姬",
  portraitRecord: 8,
}, "stage 26 boss identity");
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
  ({ stage }) => stage === 26,
  `${table} stage 26 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, {
  player: { entry: 29, loop: 28 }, enemy: { entry: 27, loop: 26 },
}, "stage 26 music");

const portraitSpeakers = {
  8: "碧娜維姬",
  10: "蘇蘭達",
  14: "琴斯",
  40: "嵐",
  41: "女帝",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-26-opening-story": compileNativeStory(
    parseInput("openingStory"), 49, portraitSpeakers, { includeBackground: true },
  ),
  "stage-26-victory-story": compileNativeStory(
    parseInput("victoryStory"), 50, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-26-opening-story": 24,
  "stage-26-victory-story": 34,
}, "stage 26 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 26,
  "stage 26 construction tokens",
);
assertEqual({
  ironPlate: constructionTokens.ironPlateSourceToken,
  obstacle: constructionTokens.obstacleSourceToken,
}, { ironPlate: 23, obstacle: 23 }, "stage 26 construction tokens");

const graphicEntries = stage26EffectDocument.resourceCatalog.graphicEntries;
const graphicEntry = (key) => requireEntry(graphicEntries, (entry) => entry.key === key, `${key} graphic`);
const phase1Entry = graphicEntry("MAGIC/21");
const phase2Entry = graphicEntry("MAGIC/14");
assertEqual(phase1Entry.renderedPaths.length, 30, "stage 26 phase-one frames");
assertEqual(phase2Entry.renderedPaths.length, 11, "stage 26 phase-two frames");
const nativeTail = stage26EffectDocument.stage26EnemyPhaseTail;
assertEqual({
  stage: nativeTail.stage,
  battleTemplateRecord: nativeTail.battleTemplateRecord,
  executions: nativeTail.executionsPerSide2Phase,
  wait: nativeTail.presentation.totalFixedWaitPerExecutionNativeTicks,
  damage: nativeTail.columnSelectionAndMovement.damage,
}, {
  stage: 26,
  battleTemplateRecord: "B/53",
  executions: 2,
  wait: 385,
  damage: 0,
}, "stage 26 enemy-phase tail");
const trimDescriptor = ({ xOffset, yOffset, width, height, low7BitFrameIndices }) => ({
  xOffset, yOffset, width, height, low7BitFrameIndices,
});
const phase1Descriptors = nativeTail.presentation.phase1.descriptors.map(trimDescriptor);
const phase2Descriptors = nativeTail.presentation.phase2.descriptors.map(trimDescriptor);
const sweepDescriptors = nativeTail.presentation.downwardColumnSweep.descriptors.map(trimDescriptor);
const sweepDescriptorSequence = [
  ...sweepDescriptors.slice(0, 4),
  ...Array.from({ length: 22 }, () => sweepDescriptors[4]),
];
assertEqual(sweepDescriptorSequence.length, 26, "stage 26 sweep draw count");
const columnPush = {
  definitionId: "stage-26-column-push",
  presentationId: "stage-26-column-push-presentation",
  executions: 2,
  originCellUpperBoundExclusive: 684,
  scannedRows: 17,
  destinationRowDeltas: [3, 2, 1],
  phase1Descriptors,
  phase2Descriptors,
  sweepDescriptorSequence,
  waitPerPhaseDescriptorNativeTicks: 15,
  waitPerSweepDescriptorNativeTicks: 5,
  totalFixedWaitPerExecutionNativeTicks: 385,
};

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
identityHash.update("stableRemake\0REMAKE-063\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-26/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  module25StoryRecord: null,
  openingStoryRecord: 49,
  victoryStoryRecord: 50,
  enemyReinforcements,
  enemyPhaseTail: {
    timing: "after-side-2-ai",
    executions: 2,
    actionOwner: null,
    presentationBeforeMovement: true,
  },
  completedRoute: { module: 27, stage: 27, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-063"],
};
const deployment = {
  kind: "interactive",
  eligibleSlots,
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 22,
};
const generatedSource = `// Generated by scripts/generate-stage26-runtime.mjs from stage 26 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE26_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE26_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE26_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE26_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE26_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE26_TITLE = ${json(titleText)};\n`
  + `export const STAGE26_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE26_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE26_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE26_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE26_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE26_CONSTRUCTION_TOKENS = ${json({ ironPlate: 23, obstacle: 23 })} as const;\n`
  + `export const STAGE26_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE26_COLUMN_PUSH = ${json(columnPush)} as const;\n`
  + `export const STAGE26_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE26_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
const phase1Destination = path.join(publicAssetPath, "stage26-column-push/phase1");
const phase2Destination = path.join(publicAssetPath, "stage26-column-push/phase2");
await Promise.all([mkdir(phase1Destination, { recursive: true }), mkdir(phase2Destination, { recursive: true })]);
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage26-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage26-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage26-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage26-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage26-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage26-enemy-loop.wav")),
  ...phase1Entry.renderedPaths.map((source, index) => copyFile(
    path.join(root, source),
    path.join(phase1Destination, `${String(index).padStart(2, "0")}.png`),
  )),
  ...phase2Entry.renderedPaths.map((source, index) => copyFile(
    path.join(root, source),
    path.join(phase2Destination, `${String(index).padStart(2, "0")}.png`),
  )),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 26 maps, music, and column-push frames with identity ${contentIdentity}`);
