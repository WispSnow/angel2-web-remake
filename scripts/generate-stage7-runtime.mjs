#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage7-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0015/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0125.json"),
  objectiveText: reversePath("parsed/dialogue/0109.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  prebattleStory: reversePath("parsed/dialogue/0017.json"),
  map: reversePath("renders/battle-maps/confirmed/07.png"),
  minimap: reversePath("renders/battle-maps/minimap/07.png"),
  storyBackground6: reversePath("renders/planar/BK/0006/00.png"),
  storyBackground7: reversePath("renders/planar/BK/0007/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0079.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0025.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0024.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0015 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "3a010cc4038fad67cf39b9897ade02bbc742507aef09bb5ab3b212815e1bbce7") {
  throw new Error(`B/0015 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 7, "stage 7 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 7, "stage 7 terrain");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
  fixedSlots: [0, 1],
  optionalSlots: [2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
  openCells: [
    { x: 24, y: 19 }, { x: 18, y: 20 }, { x: 14, y: 22 },
    { x: 25, y: 23 }, { x: 30, y: 23 },
  ],
  maximumUnits: 7,
};
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 7, "stage 7 lifecycle");
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 7 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 7 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 7 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 7 cells");
assertEqual(stageLifecycle.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 7 lifecycle eligible slots");
if (template.deployment.maximumPlayerUnitCount !== expectedDeployment.maximumUnits) {
  throw new Error("stage 7 deployment capacity changed");
}
const fixedPlacements = [
  { slot: 0, position: { x: 22, y: 28 } },
  { slot: 1, position: { x: 26, y: 28 } },
];

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
const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => {
    const actor = unit.unitSlot === 18 ? enemyActorFor(18) : undefined;
    return {
      slot: unit.unitSlot,
      nativeClassRecord: unit.effectiveClass,
      position: { x: unit.x, y: unit.y },
      aiBehavior: unit.perSlotBehavior,
      ...(actor ? { name: actor.normalizedName, portraitRecord: actor.portraitRecord } : {}),
    };
  });
assertEqual(enemyUnits, [
  { slot: 44, nativeClassRecord: 6, position: { x: 14, y: 12 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 30, position: { x: 24, y: 12 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 6, position: { x: 34, y: 12 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: 0, position: { x: 30, y: 14 }, aiBehavior: 0 },
  { slot: 18, nativeClassRecord: 13, position: { x: 35, y: 16 }, aiBehavior: 0, name: "萊莉", portraitRecord: 19 },
  { slot: 52, nativeClassRecord: 0, position: { x: 32, y: 25 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 6, position: { x: 35, y: 30 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 30, position: { x: 13, y: 32 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 0, position: { x: 35, y: 33 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 0, position: { x: 17, y: 34 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 0, position: { x: 30, y: 36 }, aiBehavior: 0 },
], "stage 7 enemies");
assertEqual(
  template.classArrays.side1SparseOverrides.filter((value) => value !== 0),
  [],
  "stage 7 side-1 class overrides",
);

const bossActor = enemyActorFor(18);
const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 7, "stage 7 objective");
// REMAKE-030 (rev. 2026-08-15): the objective panel quotes SAY/0109 verbatim.
// The earlier remake-authored "擊敗萊莉" existed only because REMAKE-030 believed
// the original text said 妖龍 and had to be corrected; REMAKE-051 disproved that.
const generatedObjective = {
  victory: { type: "unit-removed", side: nativeObjective.victory.side, slot: nativeObjective.victory.unitSlot },
  defeat: { type: "unit-removed", side: nativeObjective.defeat.side, slot: nativeObjective.defeat.unitSlot },
  victoryText: `打敗入侵的敵首領「${bossActor.normalizedName}」`,
  defeatText: "「妮雅」戰敗",
  victoryStatusText: `${bossActor.normalizedName}已停止戰鬥。`,
};
assertEqual(generatedObjective.victory, { type: "unit-removed", side: 2, slot: 18 }, "stage 7 victory");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 0 }, "stage 7 defeat");
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
// Both panel lines must appear verbatim in SAY/0109; the generator may only drop
// the record's trailing "．" separators, never reword the sentence.
if (!originalObjectiveText.includes(generatedObjective.victoryText)
  || !originalObjectiveText.includes(generatedObjective.defeatText)) {
  throw new Error(`stage 7 objective text is not verbatim SAY/0109: ${JSON.stringify(generatedObjective)}`);
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 7 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 109) {
  throw new Error(`stage 7 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}
const titleText = parseInput("title").actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "來到異世界") throw new Error(`stage 7 title changed: ${titleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 7,
  "stage 7 event handler",
);
assertEqual(stageHandler.events, [], "stage 7 event program");
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25,
  nextStage: 8,
  presentationReplayed: false,
}, "stage 7 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 7,
  "stage 7 module 25 story",
);
if (storyEntry.record !== 17) throw new Error(`stage 7 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 7,
  "stage 7 story music",
);
if (storyMusicEntry.magicRecord !== 79) throw new Error(`stage 7 story music changed: ${storyMusicEntry.magicRecord}`);

const musicEntry = (table, stage) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === stage,
  `${table} stage ${stage} music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 7)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 7)),
};
assertEqual(musicRecords, { player: { entry: 29, loop: 28 }, enemy: { entry: 25, loop: 24 } }, "stage 7 music");

const portraitSpeakers = {
  10: "蘇蘭達", 44: "拉朵那", 45: "希蜜", 46: "妮雅", 52: "騎兵",
};
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers, { includeBackground: true });
}
const storyPages = {
  "stage-07-prebattle-story": compileStory(parseInput("prebattleStory"), 17),
};
assertEqual(storyPages["stage-07-prebattle-story"].length, 30, "stage 7 story waits");
assertEqual(
  [...new Set(storyPages["stage-07-prebattle-story"].map(({ source }) => source.backgroundId))],
  [6, 7],
  "stage 7 prebattle backgrounds",
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
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-07/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage7-runtime.mjs from stage 7 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE7_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE7_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE7_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE7_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE7_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE7_TITLE = ${json(titleText)};\n`
  + `export const STAGE7_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE7_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE7_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE7_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE7_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE7_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 17, completedRoute: { module: 25, stage: 8, replayPresentation: false } })} as const;\n`
  + `export const STAGE7_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-07-prebattle-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage7-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage7-minimap.png")),
  copyFile(inputPaths.storyBackground6, path.join(publicAssetPath, "story-stage7-background-6.png")),
  copyFile(inputPaths.storyBackground7, path.join(publicAssetPath, "story-stage7-background-7.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage7.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage7-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage7-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage7-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage7-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-07-prebattle-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 7 maps, backgrounds, and music with identity ${contentIdentity}`);
