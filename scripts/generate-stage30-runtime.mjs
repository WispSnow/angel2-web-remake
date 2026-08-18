#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage30-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0061/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0147.json"),
  nextTitle: reversePath("parsed/dialogue/0148.json"),
  objectiveText: reversePath("parsed/dialogue/0097.json"),
  prebattleStory: reversePath("parsed/dialogue/0057.json"),
  openingStory: reversePath("parsed/dialogue/0058.json"),
  victoryStory: reversePath("parsed/dialogue/0059.json"),
  map: reversePath("renders/battle-maps/confirmed/30.png"),
  minimap: reversePath("renders/battle-maps/minimap/30.png"),
  storyBackground23: reversePath("renders/planar/BK/0023/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0078.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0061 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "bc65d12b2f6112b8c68139344f192b50fae1869774dd47851c45f58ddf98f9c7") {
  throw new Error(`B/0061 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 30, "stage 30 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 30, "stage 30 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 30, "stage 30 lifecycle");
assertEqual({
  required: stageLifecycle.required,
  openCells: stageLifecycle.openCells,
  eligibleUnits: stageLifecycle.eligibleUnits,
  fixedPlayerUnitSlots: stageLifecycle.fixedPlayerUnitSlots,
  maximumPlayerUnits: stageLifecycle.maximumPlayerUnits,
}, {
  required: false,
  openCells: 0,
  eligibleUnits: 0,
  fixedPlayerUnitSlots: [40, 7, 0],
  maximumPlayerUnits: 3,
}, "stage 30 fixed lifecycle");

const activeUnits = template.activeUnitInstances.map(({ side, unitSlot, effectiveClass, x, y, perSlotBehavior }) => ({
  side,
  slot: unitSlot,
  nativeClassRecord: effectiveClass,
  position: { x, y },
  aiBehavior: perSlotBehavior,
}));
assertEqual(activeUnits, [
  { side: 2, slot: 27, nativeClassRecord: 35, position: { x: 28, y: 17 }, aiBehavior: 0 },
  { side: 1, slot: 40, nativeClassRecord: null, position: { x: 30, y: 19 }, aiBehavior: 0 },
  { side: 1, slot: 7, nativeClassRecord: null, position: { x: 26, y: 25 }, aiBehavior: 0 },
  { side: 1, slot: 0, nativeClassRecord: null, position: { x: 28, y: 25 }, aiBehavior: 0 },
], "stage 30 initial board");
assertEqual(template.scenarioUnitFlags.filter((value) => value !== 0), [], "stage 30 roster flags");

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
const fixedAllies = activeUnits.filter(({ side }) => side === 1).map((unit) => {
  const actor = actorFor(unit.slot);
  return {
    slot: unit.slot,
    position: unit.position,
    name: actor.normalizedName,
    portraitRecord: actor.portraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});
assertEqual(fixedAllies, [
  { slot: 40, position: { x: 30, y: 19 }, name: "xxxx18", portraitRecord: 255, aiBehavior: 0 },
  { slot: 7, position: { x: 26, y: 25 }, name: "琴斯", portraitRecord: 14, aiBehavior: 0 },
  { slot: 0, position: { x: 28, y: 25 }, name: "妮雅", portraitRecord: 46, aiBehavior: 0 },
], "stage 30 fixed allies");
const vesta = enemyActorFor(27);
assertEqual({ name: vesta.normalizedName, portraitRecord: vesta.portraitRecord }, {
  name: "維絲塔", portraitRecord: 41,
}, "stage 30 Vesta identity");

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 30,
  "stage 30 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  victorySlot: nativeObjective.victory.unitSlot,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "required_side2_slot_absent",
  victorySlot: 27,
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 30 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 27 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "把女帝「維絲塔」打醒",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "維絲塔女帝已恢復神智。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "治癒維斯塔女帝") throw new Error(`stage 30 title changed: ${titleText}`);
if (nextTitleText !== "前往斯德林海峽") throw new Error(`stage 31 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("把女帝「維絲塔」打醒．") || !objectiveText.includes("「妮雅」戰敗．")) {
  throw new Error("SAY/0097 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 30),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 30),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 31),
}, { objective: 97, title: 147, next: 148 }, "stage 30 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 30,
  "stage 30 handler",
);
assertEqual({ handler: handler.handler, classification: handler.classification }, {
  handler: "1000:4F1E",
  classification: "dialogue and runtime class-array mutation",
}, "stage 30 handler identity");
const sequence = eventsDocument.module29BattleRuntime.stage30MultiClassSequence;
assertEqual(sequence.openingRound1.mutation,
  "set the side-2 slot-27 class record from 35 Empress to 0 Soldier without clearing its board cell, then rebuild all 57 side-2 slot states",
  "stage 30 opening mutation");
assertEqual(sequence.difficultyLimits.map(({ lvHard, classRecordLimitExclusive, enemyFormsToDefeat }) => ({
  lvHard, classRecordLimitExclusive, enemyFormsToDefeat,
})), [
  { lvHard: 0, classRecordLimitExclusive: 8, enemyFormsToDefeat: 8 },
  { lvHard: 1, classRecordLimitExclusive: 16, enemyFormsToDefeat: 16 },
  { lvHard: 2, classRecordLimitExclusive: 24, enemyFormsToDefeat: 24 },
  { lvHard: 3, classRecordLimitExclusive: 32, enemyFormsToDefeat: 32 },
], "stage 30 difficulty limits");
const formRecordsByDifficulty = sequence.difficultyLimits.map(({ sequence: forms }) =>
  forms.map(({ record }) => record));
assertEqual(formRecordsByDifficulty[3], Array.from({ length: 32 }, (_, index) => index),
  "stage 30 form records");
assertEqual(sequence.finalConversion.playerClassArrayWrite, {
  side: 1, unitSlot: 23, classRecord: 35, className: "女帝",
}, "stage 30 final conversion");

const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 30,
  "stage 30 module-25 story",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: 57, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"],
}, "stage 30 module-25 story");
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 30,
  "stage 30 story music",
);
if (storyMusicEntry.magicRecord !== 78) throw new Error(`stage 30 story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(30)) {
  throw new Error("stage 30 unexpectedly entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 30)) {
  throw new Error("stage 30 unexpectedly entered the full-round reinforcement chain");
}

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 30,
  `${table} stage 30 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, {
  player: { entry: 29, loop: 28 }, enemy: { entry: 5, loop: 4 },
}, "stage 30 music");

const storyPages = {
  "stage-30-prebattle-story": compileNativeStory(
    parseInput("prebattleStory"), 57,
    { 45: "希蜜", 46: "妮雅", 47: "士兵", 14: "琴斯", 10: "蘇蘭達" },
    { includeBackground: true },
  ),
  "stage-30-opening-story": compileNativeStory(
    parseInput("openingStory"), 58,
    { 46: "妮雅", 55: "祭司", 41: "維絲塔", 14: "琴斯" },
  ),
  "stage-30-victory-story": compileNativeStory(
    parseInput("victoryStory"), 59,
    { 55: "祭司", 46: "妮雅", 14: "琴斯" },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-30-prebattle-story": 17,
  "stage-30-opening-story": 18,
  "stage-30-victory-story": 6,
}, "stage 30 story checkpoints");
assertEqual([...new Set(storyPages["stage-30-prebattle-story"].map(({ source }) => source.backgroundId))],
  [23], "stage 30 prebattle background");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 30,
  "stage 30 construction tokens",
);
assertEqual({
  ironPlate: constructionTokens.ironPlateSourceToken,
  obstacle: constructionTokens.obstacleSourceToken,
}, { ironPlate: 0, obstacle: 0 }, "stage 30 construction tokens");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-071\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-30/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 57,
  prebattleBackgroundRecord: 23,
  prebattleMusicRecord: 78,
  nativeHandler: "1000:4F1E",
  openingStoryRecord: 58,
  openingFormTransition: { from: 35, to: 0, side: 2, slot: 27, position: { x: 28, y: 17 } },
  contextualLine: { selector: 34, address: "DS:8762", text: "我．．．我好難過．．．\n頭好痛啊！" },
  formRecordsByDifficulty,
  finalConversion: { from: { side: 2, slot: 27 }, to: { side: 1, slot: 23, classRecord: 35 } },
  victoryStoryRecord: 59,
  completedRoute: { module: 25, stage: 31, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-071"],
};
const generatedSource = `// Generated by scripts/generate-stage30-runtime.mjs from stage 30 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE30_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE30_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE30_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE30_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE30_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE30_TITLE = ${json(titleText)};\n`
  + `export const STAGE30_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE30_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE30_FIXED_ALLIED_UNITS = ${json(fixedAllies)} as const;\n`
  + `export const STAGE30_INITIAL_ENEMY = ${json({ slot: 27, nativeClassRecord: 35, position: { x: 28, y: 17 }, name: vesta.normalizedName, portraitRecord: vesta.portraitRecord, aiBehavior: 0 })} as const;\n`
  + `export const STAGE30_FORM_RECORDS_BY_DIFFICULTY = ${json(formRecordsByDifficulty)} as const;\n`
  + `export const STAGE30_CONSTRUCTION_TOKENS = ${json({ ironPlate: 0, obstacle: 0 })} as const;\n`
  + `export const STAGE30_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE30_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE30_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage30-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage30-minimap.png")),
  copyFile(inputPaths.storyBackground23, path.join(publicAssetPath, "story-stage30-background-23.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (17/18/6 dialogue checkpoints)`);
console.log(`wrote stage 30 maps, story assets, and battle music with identity ${contentIdentity}`);
