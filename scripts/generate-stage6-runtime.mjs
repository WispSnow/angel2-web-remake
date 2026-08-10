#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage6-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0013/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  presentations: reversePath("parsed/native/stage-presentations.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0124.json"),
  objectiveText: reversePath("parsed/dialogue/0088.json"),
  prebattleStory: reversePath("parsed/dialogue/0014.json"),
  openingStory: reversePath("parsed/dialogue/0015.json"),
  retreatStory: reversePath("parsed/dialogue/0016.json"),
  allianceStory: reversePath("parsed/dialogue/0115.json"),
  map: reversePath("renders/battle-maps/confirmed/06.png"),
  minimap: reversePath("renders/battle-maps/minimap/06.png"),
  storyBackground5: reversePath("renders/planar/BK/0005/00.png"),
  storyBackground31: reversePath("renders/planar/BK/0031/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0078.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0003.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0002.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0031.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0030.wav"),
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
const presentationsDocument = parseInput("presentations");
const musicDocument = parseInput("music");

if (templateBytes.length !== 8506) throw new Error(`B/0013 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "b8f806c7b4f6941b3d008d9900153204c0224b2d0a9f77a58313c35924360f31") {
  throw new Error(`B/0013 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 6, "stage 6 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 6, "stage 6 terrain");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
  openCells: [
    { x: 23, y: 24 }, { x: 25, y: 24 },
    { x: 21, y: 26 }, { x: 23, y: 26 }, { x: 25, y: 26 },
    { x: 21, y: 28 }, { x: 23, y: 28 }, { x: 25, y: 28 },
  ],
  maximumUnits: 9,
};
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 6, "stage 6 lifecycle");
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 6 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 6 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 6 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 6 cells");
assertEqual(stageLifecycle.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 6 lifecycle eligible slots");
if (template.deployment.maximumPlayerUnitCount !== expectedDeployment.maximumUnits) {
  throw new Error("stage 6 deployment capacity changed");
}
const fixedPlacements = [{ slot: 0, position: { x: 21, y: 24 } }];

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
    const actor = unit.unitSlot === 19 ? enemyActorFor(19) : undefined;
    return {
      slot: unit.unitSlot,
      nativeClassRecord: unit.effectiveClass,
      position: { x: unit.x, y: unit.y },
      aiBehavior: unit.perSlotBehavior,
      ...(actor ? { name: actor.normalizedName, portraitRecord: actor.portraitRecord } : {}),
    };
  });
assertEqual(enemyUnits, [
  { slot: 46, nativeClassRecord: 0, position: { x: 34, y: 29 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 0, position: { x: 32, y: 30 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 0, position: { x: 28, y: 32 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 20, position: { x: 26, y: 33 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 20, position: { x: 33, y: 33 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 22, position: { x: 28, y: 34 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 0, position: { x: 24, y: 35 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 0, position: { x: 25, y: 35 }, aiBehavior: 0 },
  { slot: 19, nativeClassRecord: 13, position: { x: 39, y: 36 }, aiBehavior: 0, name: "西艾蕾", portraitRecord: 5 },
], "stage 6 enemies");
if (template.classArrays.side1SparseOverrides[17] !== 22) {
  throw new Error("stage 6 slot 17 cavalry override changed");
}

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 6, "stage 6 objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: nativeObjective.victory.side, slot: nativeObjective.victory.unitSlot },
  defeat: { type: "unit-removed", side: nativeObjective.defeat.side, slot: nativeObjective.defeat.unitSlot },
  victoryText: "擊敗西艾蕾",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "西艾蕾已停止戰鬥。",
};
assertEqual(generatedObjective.victory, { type: "unit-removed", side: 2, slot: 19 }, "stage 6 victory");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 0 }, "stage 6 defeat");
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("首領「愛」") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0088 objective conflict changed");
}
const titleText = parseInput("title").actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "過異世界之門") throw new Error(`stage 6 title changed: ${titleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 6,
  "stage 6 event handler",
);
assertEqual(stageHandler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [15] },
  { trigger: "live victory 999", sayRecords: [16, 115] },
], "stage 6 event program");
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25,
  nextStage: 7,
  presentationReplayed: false,
}, "stage 6 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 6,
  "stage 6 module 25 story",
);
if (storyEntry.record !== 14) throw new Error(`stage 6 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 6,
  "stage 6 story music",
);
if (storyMusicEntry.magicRecord !== 78) throw new Error(`stage 6 story music changed: ${storyMusicEntry.magicRecord}`);

const victoryPresentation = requireEntry(
  presentationsDocument.dynamicSceneTimelines,
  ({ stage }) => stage === 6,
  "stage 6 victory tableau",
);
const victorySteps = requireEntry(
  victoryPresentation.events,
  ({ trigger }) => trigger === "live victory 999",
  "stage 6 live victory presentation",
).steps;
const tableauUnits = victorySteps
  .filter(({ op }) => op === "writeBoardCell")
  .map(({ side, unitSlot, at }) => ({ side, slot: unitSlot, position: { x: at.x, y: at.y } }));
assertEqual(tableauUnits, [
  { side: 1, slot: 0, position: { x: 6, y: 27 } },
  { side: 1, slot: 1, position: { x: 9, y: 28 } },
  { side: 1, slot: 2, position: { x: 7, y: 29 } },
  { side: 1, slot: 3, position: { x: 10, y: 29 } },
  { side: 1, slot: 4, position: { x: 8, y: 30 } },
  { side: 1, slot: 5, position: { x: 6, y: 31 } },
  { side: 1, slot: 6, position: { x: 9, y: 31 } },
  { side: 1, slot: 7, position: { x: 6, y: 33 } },
  { side: 1, slot: 17, position: { x: 11, y: 30 } },
], "stage 6 reinforcement tableau");
const rangerLeaderActor = actorFor(17);
const reinforcementActors = [
  ...tableauUnits.slice(0, 8).map((unit, index) => {
    const actor = actorFor(unit.slot);
    return { ...unit, storyId: `story:ranger:${index}`, name: actor.normalizedName, portraitRecord: actor.portraitRecord };
  }),
  {
    ...tableauUnits[8],
    storyId: "story:ranger-leader",
    name: rangerLeaderActor.normalizedName,
    portraitRecord: rangerLeaderActor.portraitRecord,
    nativeClassRecord: 22,
  },
];

const musicEntry = (table, stage) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === stage,
  `${table} stage ${stage} music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 6)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 6)),
};
assertEqual(musicRecords, { player: { entry: 3, loop: 2 }, enemy: { entry: 31, loop: 30 } }, "stage 6 music");

const portraitSpeakers = {
  0: "葛蒂拉斯", 2: "萊茵", 3: "汀塔琪", 5: "西艾蕾", 42: "蒙欣曼",
  43: "黛西", 45: "希蜜", 46: "妮雅", 48: "士兵", 52: "騎兵",
};
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers, { includeBackground: true });
}
const storyPages = {
  "stage-06-prebattle-story": compileStory(parseInput("prebattleStory"), 14),
  "stage-06-opening-story": compileStory(parseInput("openingStory"), 15),
  "stage-06-retreat-story": compileStory(parseInput("retreatStory"), 16),
  "stage-06-alliance-story": compileStory(parseInput("allianceStory"), 115),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [10, 6, 15, 10], "stage 6 story waits");
assertEqual(
  [...new Set(storyPages["stage-06-prebattle-story"].map(({ source }) => source.backgroundId))],
  [5, 31],
  "stage 6 prebattle backgrounds",
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
const contentIdentity = `stage-06/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage6-runtime.mjs from stage 6 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE6_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE6_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE6_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE6_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE6_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE6_TITLE = ${json(titleText)};\n`
  + `export const STAGE6_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE6_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE6_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE6_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE6_REINFORCEMENT_ACTORS = ${json(reinforcementActors)} as const;\n`
  + `export const STAGE6_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE6_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 14, openingStoryRecord: 15, retreatStoryRecord: 16, allianceStoryRecord: 115, completedRoute: { module: 25, stage: 7, replayPresentation: false } })} as const;\n`
  + `export const STAGE6_VICTORY_PRESENTATION = ${json(victoryPresentation)} as const;\n`
  + `export const STAGE6_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-06-prebattle-story" | "stage-06-opening-story" | "stage-06-retreat-story" | "stage-06-alliance-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage6-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage6-minimap.png")),
  copyFile(inputPaths.storyBackground5, path.join(publicAssetPath, "story-stage6-background-5.png")),
  copyFile(inputPaths.storyBackground31, path.join(publicAssetPath, "story-stage6-background-31.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage6.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage6-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage6-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage6-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage6-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 6 maps, backgrounds, and music with identity ${contentIdentity}`);
