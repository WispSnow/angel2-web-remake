#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage14-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0029/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  title: reversePath("parsed/dialogue/0132.json"),
  nextTitle: reversePath("parsed/dialogue/0133.json"),
  objectiveText: reversePath("parsed/dialogue/0083.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  openingStory: reversePath("parsed/dialogue/0033.json"),
  map: reversePath("renders/battle-maps/confirmed/14.png"),
  minimap: reversePath("renders/battle-maps/minimap/14.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0023.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0022.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0029 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "3e48c074224c5fcb923b9c90739556010b744eff075fbbb539c44796c2772d1e") {
  throw new Error(`B/0029 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 14, "stage 14 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 14, "stage 14 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 14, "stage 14 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 23, y: 29 }, { x: 24, y: 29 }, { x: 25, y: 29 },
    { x: 26, y: 29 }, { x: 27, y: 29 }, { x: 23, y: 30 },
    { x: 27, y: 30 }, { x: 23, y: 31 }, { x: 27, y: 31 },
  ],
  maximumUnits: 10,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 14 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 14 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 14 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 14 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 14 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 25, y: 31 } }];

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
assertEqual(playerClassOverrides, [], "stage 14 side-1 class overrides");
assertEqual(template.perSlotBehaviorArrays.side1.filter((value) => value !== 0), [], "stage 14 side-1 AI behavior");

const fangActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 8,
  "stage 14 enemy actor Fang",
);
assertEqual({ name: fangActor.normalizedName, portraitRecord: fangActor.portraitRecord }, {
  name: "芳", portraitRecord: 34,
}, "stage 14 Fang identity");
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
  ...(unit.unitSlot === 8 ? { name: fangActor.normalizedName, portraitRecord: fangActor.portraitRecord } : {}),
}));
assertEqual(enemyUnits, [
  { slot: 41, nativeClassRecord: 10, position: { x: 23, y: 12 }, aiBehavior: 2 },
  { slot: 8, nativeClassRecord: 8, position: { x: 25, y: 12 }, aiBehavior: 1, name: "芳", portraitRecord: 34 },
  { slot: 49, nativeClassRecord: 27, position: { x: 27, y: 12 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 10, position: { x: 10, y: 20 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 13, position: { x: 13, y: 20 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 27, position: { x: 38, y: 20 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 23, position: { x: 40, y: 21 }, aiBehavior: 0 },
], "stage 14 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 14, "stage 14 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 8, defeat: 0,
}, "stage 14 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 8 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊敗「芳」",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "芳已離開戰場。",
};
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("打敗敵人首領「芳」") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0083 objective wording changed");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 14 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 83) {
  throw new Error(`stage 14 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔第一層") throw new Error(`stage 14 title changed: ${titleText}`);
if (nextTitleText !== "龍塔第二層") throw new Error(`stage 15 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 14,
  "stage 14 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [33], actions: [] },
  {
    trigger: "round 6 and every later active round",
    sayRecords: [],
    actions: [{ op: "fillSide2PerSlotAiBehavior", slots: 75, value: 0, address: "DS:5644" }],
  },
], "stage 14 event program");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 14)) {
  throw new Error("stage 14 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(14)) {
  throw new Error("stage 14 unexpectedly entered the dynamic-board stage catalog");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: [
    "initial-template", "round-event-handler", "dynamic-board-catalog",
    "full-round-special-chain", "defeat-replacement-and-form-chain",
  ],
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 27, nextStage: 15, presentationReplayed: false,
}, "stage 14 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 14,
  "stage 14 module 25 story",
);
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: null, resources: [],
}, "stage 14 module 25 story absence");
const stageMagicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 14,
  "stage 14 module 25 music table",
);
if (stageMagicEntry.magicRecord !== 78) throw new Error(`stage 14 MAGIC table changed: ${stageMagicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(
  musicDocument.stageTables[table].entries,
  ({ stage }) => stage === 14,
  `${table} stage 14 music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 11, loop: 10 }, enemy: { entry: 23, loop: 22 } }, "stage 14 music");

const portraitSpeakers = { 10: "蘇蘭達", 34: "芳", 46: "妮雅" };
const storyPages = {
  "stage-14-opening-story": compileNativeStory(
    parseInput("openingStory"), 33, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(storyPages["stage-14-opening-story"].length, 5, "stage 14 opening waits");
assertEqual(
  [...new Set(storyPages["stage-14-opening-story"].map(({ source }) => source.backgroundId))],
  [undefined],
  "stage 14 opening keeps the battle map background",
);

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 14,
  "stage 14 construction tokens",
);
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, {
  ironPlate: 1, obstacle: 1,
}, "stage 14 construction tokens");
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
identityHash.update("stableRemake\0REMAKE-047\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-14/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 33,
  nativeDelayedAiReset: {
    firstRound: 6,
    repeatsEveryActiveRound: true,
    operation: "fillSide2PerSlotAiBehavior",
    slots: 75,
    value: 0,
    stableRemakeEffect: "release-native-sentries-to-shared-expert-pursuit",
  },
  enemyReinforcements,
  completedRoute: { module: 27, stage: 15, replayPresentation: false },
  stableRemakeDecision: "REMAKE-047",
};

const generatedSource = `// Generated by scripts/generate-stage14-runtime.mjs from stage 14 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE14_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE14_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE14_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE14_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE14_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE14_TITLE = ${json(titleText)};\n`
  + `export const STAGE14_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE14_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE14_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE14_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE14_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE14_CONSTRUCTION_TOKENS = ${json({ ironPlate: 1, obstacle: 1 })} as const;\n`
  + `export const STAGE14_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE14_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE14_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-14-opening-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage14-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage14-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-14-opening-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 14 maps and music with identity ${contentIdentity}`);
