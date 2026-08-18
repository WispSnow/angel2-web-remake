#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage22-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0045/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  presentations: reversePath("parsed/native/stage-presentations.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0140.json"),
  nextTitle: reversePath("parsed/dialogue/0141.json"),
  objectiveText: reversePath("parsed/dialogue/0090.json"),
  searchStory: reversePath("parsed/dialogue/0076.json"),
  reunionStory: reversePath("parsed/dialogue/0077.json"),
  betrayalStory: reversePath("parsed/dialogue/0078.json"),
  dragonStory: reversePath("parsed/dialogue/0079.json"),
  postbattleStory: reversePath("parsed/dialogue/0045.json"),
  map: reversePath("renders/battle-maps/confirmed/22.png"),
  minimap: reversePath("renders/battle-maps/minimap/22.png"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0045 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "3a4ed8fdc4100a70eeb68dede3632761f619cc93372b8879363af4d65a4c8d5b") {
  throw new Error(`B/0045 hash changed: ${sha256(templateBytes)}`);
}

const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const presentations = parseInput("presentations");
const musicDocument = parseInput("music");
const techniqueRules = parseInput("techniqueRules");
const storyPresentations = parseInput("storyPresentations");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 22, "stage 22 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 22, "stage 22 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 22, "stage 22 lifecycle");

const eligibleSlots = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31];
const optionalSlots = eligibleSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 22, y: 31 }, { x: 23, y: 31 }, { x: 24, y: 31 }, { x: 25, y: 32 },
  { x: 25, y: 33 }, { x: 26, y: 33 }, { x: 22, y: 34 }, { x: 25, y: 34 },
  { x: 26, y: 34 }, { x: 25, y: 35 }, { x: 27, y: 35 }, { x: 23, y: 36 },
  { x: 24, y: 36 }, { x: 25, y: 36 }, { x: 26, y: 36 }, { x: 22, y: 37 },
  { x: 23, y: 37 }, { x: 24, y: 37 },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 22 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [0], "stage 22 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 22 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 22 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 19, "stage 22 capacity");
assertEqual(template.activeUnitInstances.map(({ side, unitSlot, x, y }) => ({ side, slot: unitSlot, position: { x, y } })), [
  { side: 1, slot: 0, position: { x: 23, y: 34 } },
], "stage 22 static board");

const actorFor = (slot) => requireEntry(campaignRoster.displayResolution.actors, (actor) => actor.slot === slot, `campaign actor ${slot}`);
const enemyActorFor = (slot) => requireEntry(campaignRoster.displayResolution.enemyActors, (actor) => actor.slot === slot, `enemy actor ${slot}`);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return {
    slot,
    portraitRecord: actor.portraitRecord,
    normalizedName: actor.normalizedName,
    ...(slot >= 25 ? { nativeClassOverride: template.classArrays.side1SparseOverrides[slot] } : {}),
  };
});
assertEqual(deploymentActors.filter(({ slot }) => slot >= 25).map(({ slot, nativeClassOverride }) => ({ slot, nativeClassOverride })),
  [25, 26, 27, 28, 29, 30, 31].map((slot) => ({ slot, nativeClassOverride: 8 })),
  "stage 22 half-dragon overrides");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 22, "stage 22 objective");
assertEqual({ victory: nativeObjective.victory.kind, victorySlot: nativeObjective.victory.unitSlot, defeatSlot: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", victorySlot: 28, defeatSlot: 0,
}, "stage 22 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 28 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗妖龍",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "妖龍已被擊退。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "焦土森林村莊中") throw new Error(`stage 22 title changed: ${titleText}`);
if (nextTitleText !== "死亡之谷中") throw new Error(`stage 23 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗妖龍") || !objectiveText.includes("妮雅")) throw new Error("SAY/0090 objective wording changed");
const recordForStage = (table, stage) => requireEntry(table.entries, (entry) => entry.key === stage && entry.enabled, `dialogue record for stage ${stage}`).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 22),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 22),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 23),
}, { objective: 90, title: 140, next: 141 }, "stage 22 dialogue records");

const handler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 22, "stage 22 handler");
if (handler.sha256 !== "1e63fecf6e564caf75afe46f39a38149f5afd18511e395bcbae20e787cf69006") {
  throw new Error(`stage 22 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events.map(({ trigger, sayRecords, actions }) => ({ trigger, sayRecords, ops: actions.map(({ op }) => op) })), [
  { trigger: "round 1", sayRecords: [76, 77, 78, 79], ops: ["seeDetailedScene"] },
], "stage 22 event choreography");
assertEqual(handler.outcomeRouting.loadedVictory1000, { nextModule: 25, nextStage: 23, presentationReplayed: false }, "stage 22 completed route");
const scene = requireEntry(eventsDocument.scenes, ({ stage }) => stage === 22, "stage 22 scene");
const spawns = scene.round1.filter(({ op }) => op === "spawn").map(({ unit, at, originalFocusCellMismatch }) => ({
  side: unit.side, slot: unit.unitSlot, nativeClassRecord: unit.classRecord,
  position: { x: at.x, y: at.y },
  ...(originalFocusCellMismatch ? { focusPosition: { x: originalFocusCellMismatch.x, y: originalFocusCellMismatch.y } } : {}),
}));
assertEqual(spawns, [
  { side: 1, slot: 23, nativeClassRecord: 35, position: { x: 32, y: 29 } },
  { side: 1, slot: 7, nativeClassRecord: 3, position: { x: 32, y: 29 }, focusPosition: { x: 33, y: 29 } },
  { side: 2, slot: 2, nativeClassRecord: 3, position: { x: 23, y: 39 } },
  { side: 2, slot: 28, nativeClassRecord: 36, position: { x: 22, y: 24 } },
  { side: 2, slot: 40, nativeClassRecord: 3, position: { x: 39, y: 32 } },
  { side: 2, slot: 41, nativeClassRecord: 3, position: { x: 39, y: 34 } },
  { side: 2, slot: 42, nativeClassRecord: 3, position: { x: 24, y: 40 } },
  { side: 2, slot: 43, nativeClassRecord: 3, position: { x: 22, y: 40 } },
], "stage 22 scripted spawns");
assertEqual(scene.round1.filter(({ op }) => op === "scriptedMove").map(({ unitSlot, from, to, rangeSetup }) => ({
  slot: unitSlot, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, movementBudget: rangeSetup.budget,
})), [
  { slot: 23, from: { x: 32, y: 29 }, to: { x: 28, y: 33 }, movementBudget: 50 },
  { slot: 7, from: { x: 32, y: 29 }, to: { x: 29, y: 34 }, movementBudget: 50 },
], "stage 22 scripted movement");
assertEqual(scene.round1.filter(({ op }) => op === "clearCell").map(({ removed }) => removed), [
  { side: 1, unitSlot: 23 }, { side: 1, unitSlot: 7 },
], "stage 22 temporary departures");
const presentation = requireEntry(presentations.dynamicSceneTimelines, ({ stage }) => stage === 22, "stage 22 presentation");
if (presentation.classification !== "round-1 entrance and ambush") throw new Error(`stage 22 presentation changed: ${presentation.classification}`);
if (!eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(22)) throw new Error("stage 22 left the dynamic-board catalog");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 22)) throw new Error("stage 22 entered the full-round reinforcement chain");
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) throw new Error("defeat replacement is no longer stage-30 only");
const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 22, "stage 22 module-25 record");
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, { record: null, resources: [] }, "stage 22 module-25 story absence");

const temporaryActors = [
  { ...spawns[0], ...(() => { const actor = actorFor(23); return { name: actor.normalizedName, portraitRecord: actor.portraitRecord }; })(), destination: { x: 28, y: 33 }, movementBudget: 50 },
  { ...spawns[1], ...(() => { const actor = actorFor(7); return { name: actor.normalizedName, portraitRecord: actor.portraitRecord }; })(), destination: { x: 29, y: 34 }, movementBudget: 50 },
];
const enemies = spawns.filter(({ side }) => side === 2).map((enemy) => {
  const actor = enemyActorFor(enemy.slot);
  const genericIdentity = actor.portraitRecord === 255;
  return {
    ...enemy,
    ...(genericIdentity ? {} : {
      name: actor.normalizedName,
      portraitRecord: actor.portraitRecord,
    }),
    aiBehavior: template.perSlotBehaviorArrays.side2[enemy.slot],
  };
});
assertEqual(enemies.map(({ slot, nativeClassRecord, position }) => ({ slot, nativeClassRecord, position })), scene.stateAfterRound1Event.addedEnemies.map(({ unitSlot, classRecord, at }) => ({
  slot: unitSlot, nativeClassRecord: classRecord, position: { x: at.x, y: at.y },
})), "stage 22 post-event enemies");
const reinforcementAudit = {
  kind: "round-1-six-enemy-ambush",
  initialSide2: 0,
  temporarySide1Slots: [23, 7],
  spawnedSide2Slots: enemies.map(({ slot }) => slot),
  victoryTargetSlot: 28,
  laterReinforcements: false,
  auditedSources: ["initial-template", "round-event-handler", "dynamic-board-catalog", "full-round-special-chain", "defeat-replacement-and-form-chain"],
};

const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 22, `${table} stage 22 music`);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, { player: { entry: 35, loop: 34 }, enemy: { entry: 13, loop: 12 } }, "stage 22 music");
const portraitSpeakers = {
  0: "葛蒂拉斯",
  10: "蘇蘭達",
  14: "琴斯",
  41: "維絲塔",
  43: "黛西",
  45: "希蜜",
  46: "妮雅",
  66: "妖龍",
};
const storyPages = {
  "stage-22-search-story": compileNativeStory(parseInput("searchStory"), 76, portraitSpeakers, { includeBackground: true }),
  "stage-22-reunion-story": compileNativeStory(parseInput("reunionStory"), 77, portraitSpeakers, { includeBackground: true }),
  "stage-22-betrayal-story": compileNativeStory(parseInput("betrayalStory"), 78, portraitSpeakers, { includeBackground: true }),
  "stage-22-dragon-story": compileNativeStory(parseInput("dragonStory"), 79, portraitSpeakers, { includeBackground: true }),
  "stage-22-postbattle-story": compileNativeStory(parseInput("postbattleStory"), 45, portraitSpeakers, { includeBackground: true }),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-22-search-story": 1,
  "stage-22-reunion-story": 19,
  "stage-22-betrayal-story": 11,
  "stage-22-dragon-story": 4,
  "stage-22-postbattle-story": 15,
}, "stage 22 story waits");
const constructionTokens = requireEntry(techniqueRules.terrainConstructionTokens.stages, ({ stage }) => stage === 22, "stage 22 construction tokens");
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, { ironPlate: 65, obstacle: 69 }, "stage 22 construction tokens");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({ id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length }));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-056\0REMAKE-059\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-22/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  roundOneStoryRecords: [76, 77, 78, 79],
  postbattleStoryRecord: 45,
  focusPortraitRecord: 46,
  temporaryActors,
  enemies,
  reinforcementAudit,
  completedRoute: { module: 25, stage: 23, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-056", "REMAKE-059"],
};
const deployment = {
  kind: "interactive", eligibleSlots, fixedPlacements: [{ slot: 0, position: { x: 23, y: 34 } }],
  optionalSlots, openCells, maximumUnits: 19,
};
const generatedSource = `// Generated by scripts/generate-stage22-runtime.mjs from stage 22 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE22_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE22_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE22_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE22_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE22_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE22_TITLE = ${json(titleText)};\n`
  + `export const STAGE22_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE22_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE22_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE22_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE22_TEMPORARY_ACTORS = ${json(temporaryActors)} as const;\n`
  + `export const STAGE22_ENEMIES = ${json(enemies)} as const;\n`
  + `export const STAGE22_CONSTRUCTION_TOKENS = ${json({ ironPlate: 65, obstacle: 69 })} as const;\n`
  + `export const STAGE22_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE22_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE22_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage22-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage22-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 22 maps and music with identity ${contentIdentity}`);
