#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage13-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0027/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  title: reversePath("parsed/dialogue/0131.json"),
  nextTitle: reversePath("parsed/dialogue/0132.json"),
  objectiveText: reversePath("parsed/dialogue/0096.json"),
  prebattleStory: reversePath("parsed/dialogue/0032.json"),
  map: reversePath("renders/battle-maps/confirmed/13.png"),
  minimap: reversePath("renders/battle-maps/minimap/13.png"),
  storyBackground15: reversePath("renders/planar/BK/0015/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0077.wav"),
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
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");
const techniqueRules = parseInput("techniqueRules");

if (templateBytes.length !== 8506) throw new Error(`B/0027 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "c510d86e0a2353e89cb9f15158fa7c409710f0e419650e16c742d80aa03da53a") {
  throw new Error(`B/0027 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 13, "stage 13 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 13, "stage 13 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 13, "stage 13 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 34, y: 34 }, { x: 35, y: 34 }, { x: 36, y: 34 },
    { x: 34, y: 35 }, { x: 35, y: 35 }, { x: 36, y: 35 },
    { x: 34, y: 36 }, { x: 35, y: 36 }, { x: 36, y: 36 },
    { x: 34, y: 37 }, { x: 35, y: 37 },
  ],
  maximumUnits: 12,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 13 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 13 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 13 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 13 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 13 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 36, y: 37 } }];

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
const playerClassOverrides = template.classArrays.side1SparseOverrides
  .map((nativeClassRecord, slot) => ({ slot, nativeClassRecord }))
  .filter(({ nativeClassRecord }) => nativeClassRecord !== 0);
assertEqual(playerClassOverrides, [
  { slot: 10, nativeClassRecord: 26 },
  { slot: 11, nativeClassRecord: 26 },
], "stage 13 side-1 class overrides");
assertEqual(template.perSlotBehaviorArrays.side1.filter((value) => value !== 0), [], "stage 13 side-1 AI behavior");

const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 24 ? { name: "瑪西爾", portraitRecord: 31 } : {}),
}));
assertEqual(enemyUnits, [
  { slot: 24, nativeClassRecord: 27, position: { x: 19, y: 17 }, aiBehavior: 0, name: "瑪西爾", portraitRecord: 31 },
  { slot: 43, nativeClassRecord: 23, position: { x: 22, y: 17 }, aiBehavior: 2 },
  { slot: 46, nativeClassRecord: 13, position: { x: 26, y: 17 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 6, position: { x: 28, y: 18 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 10, position: { x: 15, y: 20 }, aiBehavior: 2 },
  { slot: 42, nativeClassRecord: 29, position: { x: 17, y: 21 }, aiBehavior: 2 },
  { slot: 45, nativeClassRecord: 22, position: { x: 24, y: 21 }, aiBehavior: 2 },
  { slot: 48, nativeClassRecord: 20, position: { x: 23, y: 22 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 25, position: { x: 25, y: 22 }, aiBehavior: 0 },
], "stage 13 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 13, "stage 13 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 24, defeat: 0,
}, "stage 13 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 24 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊敗「瑪西爾」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "瑪西爾已離開戰場。",
};
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("打敗所有的敵人") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0096 objective wording changed");
}
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔外") throw new Error(`stage 13 title changed: ${titleText}`);
if (nextTitleText !== "龍塔第一層") throw new Error(`stage 14 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 13, "stage 13 event handler");
assertEqual(stageHandler.events, [], "stage 13 event program");
assertEqual(stageHandler.classification, "route only", "stage 13 event classification");
assertEqual(stageHandler.nativeSignals.specialCallCounts, {}, "stage 13 special event calls");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 13)) {
  throw new Error("stage 13 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(13)) {
  throw new Error("stage 13 unexpectedly entered the dynamic-board stage catalog");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: ["initial-template", "round-event-handler", "dynamic-board-catalog", "full-round-special-chain"],
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 27, nextStage: 14, presentationReplayed: false,
}, "stage 13 completed route");
const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 13, "stage 13 module 25 story");
if (storyEntry.record !== 32) throw new Error(`stage 13 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage }) => stage === 13, "stage 13 story music");
if (storyMusicEntry.magicRecord !== 77) throw new Error(`stage 13 story music changed: ${storyMusicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 13, `${table} stage 13 music`);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 29, loop: 28 }, enemy: { entry: 27, loop: 26 } }, "stage 13 music");

const portraitSpeakers = { 10: "蘇蘭達", 13: "多莉", 45: "希蜜", 46: "妮雅" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers, { includeBackground: true });
}
const storyPages = {
  "stage-13-prebattle-story": compileStory(parseInput("prebattleStory"), 32),
};
assertEqual(storyPages["stage-13-prebattle-story"].length, 10, "stage 13 prebattle waits");
assertEqual([...new Set(storyPages["stage-13-prebattle-story"].map(({ source }) => source.backgroundId))], [15], "stage 13 prebattle backgrounds");

const constructionTokens = requireEntry(techniqueRules.terrainConstructionTokens.stages, ({ stage }) => stage === 13, "stage 13 construction tokens");
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 38, obstacle: 41,
}, "stage 13 construction tokens");
const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({ id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length }));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-046\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-13/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage13-runtime.mjs from stage 13 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE13_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE13_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE13_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE13_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE13_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE13_TITLE = ${json(titleText)};\n`
  + `export const STAGE13_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE13_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE13_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE13_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE13_PLAYER_CLASS_OVERRIDES = ${json(playerClassOverrides)} as const;\n`
  + `export const STAGE13_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE13_CONSTRUCTION_TOKENS = ${json({ ironPlate: 38, obstacle: 41 })} as const;\n`
  + `export const STAGE13_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE13_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 32, enemyReinforcements, completedRoute: { module: 27, stage: 14, replayPresentation: false }, stableRemakeDecision: "REMAKE-046" })} as const;\n`
  + `export const STAGE13_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-13-prebattle-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage13-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage13-minimap.png")),
  copyFile(inputPaths.storyBackground15, path.join(publicAssetPath, "story-stage13-background-15.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage13.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage13-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage13-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage13-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage13-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-13-prebattle-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 13 maps, background, and music with identity ${contentIdentity}`);
