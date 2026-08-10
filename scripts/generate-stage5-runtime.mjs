#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage5-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  stage5Template: reversePath("decoded/B/0011/00.raw"),
  portalTemplate: reversePath("decoded/B/0085/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0123.json"),
  objectiveText: reversePath("parsed/dialogue/0087.json"),
  openingStory: reversePath("parsed/dialogue/0009.json"),
  victoryStory: reversePath("parsed/dialogue/0010.json"),
  portalArrivalStory: reversePath("parsed/dialogue/0011.json"),
  portalConfrontationStory: reversePath("parsed/dialogue/0018.json"),
  portalInterventionStory: reversePath("parsed/dialogue/0020.json"),
  portalDepartureStory: reversePath("parsed/dialogue/0019.json"),
  stage5Map: reversePath("renders/battle-maps/confirmed/05.png"),
  stage5Minimap: reversePath("renders/battle-maps/minimap/05.png"),
  portalMap: reversePath("renders/battle-maps/confirmed/42.png"),
  portalMinimap: reversePath("renders/battle-maps/minimap/42.png"),
  stage5PlayerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  stage5PlayerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
  stage5EnemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0027.wav"),
  stage5EnemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0026.wav"),
  portalPlayerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0035.wav"),
  portalPlayerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0034.wav"),
  portalEnemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0013.wav"),
  portalEnemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0012.wav"),
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
const stage5TemplateBytes = inputBuffers.stage5Template;
const portalTemplateBytes = inputBuffers.portalTemplate;
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");

for (const [label, bytes, expectedHash] of [
  ["B/0011", stage5TemplateBytes, "a59dc33bfaf974dff2168a03b6bffd10695e1427e213723e3aac7487ca0d1e84"],
  ["B/0085", portalTemplateBytes, "b2520bac6e0fd1656b2871b55f34cbd1110e22036e9bf13ba9f9193ec234f53f"],
]) {
  if (bytes.length !== 8506) throw new Error(`${label} length changed: ${bytes.length}`);
  if (sha256(bytes) !== expectedHash) throw new Error(`${label} hash changed: ${sha256(bytes)}`);
}

const stage5Template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 5, "stage 5 template");
const portalTemplate = requireEntry(battleTemplates.stages, ({ stage }) => stage === 42, "stage 42 template");
const stage5Terrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 5, "stage 5 terrain");
const portalTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 42, "stage 42 terrain");

const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 20, 21, 24],
  openCells: [
    { x: 23, y: 33 }, { x: 27, y: 33 }, { x: 23, y: 34 },
    { x: 25, y: 34 }, { x: 27, y: 34 },
  ],
  maximumUnits: 6,
};
const stage5Lifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 5, "stage 5 lifecycle");
assertEqual(stage5Template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 5 eligible slots");
assertEqual(stage5Template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 5 fixed slots");
assertEqual(stage5Template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 5 optional slots");
assertEqual(stage5Template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 5 deployment cells");
assertEqual(stage5Lifecycle.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 5 lifecycle eligible slots");
if (stage5Template.deployment.maximumPlayerUnitCount !== expectedDeployment.maximumUnits) {
  throw new Error("stage 5 deployment capacity changed");
}
const fixedPlacements = [{ slot: 0, position: { x: 25, y: 33 } }];

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
const enemyUnits = stage5Template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => {
    const actor = unit.unitSlot === 25 || unit.unitSlot === 26
      ? enemyActorFor(unit.unitSlot)
      : undefined;
    return {
      slot: unit.unitSlot,
      nativeClassRecord: unit.effectiveClass,
      position: { x: unit.x, y: unit.y },
      aiBehavior: unit.perSlotBehavior,
      ...(actor ? { name: actor.normalizedName, portraitRecord: actor.portraitRecord } : {}),
    };
  });
assertEqual(enemyUnits, [
  { slot: 44, nativeClassRecord: 20, position: { x: 23, y: 15 }, aiBehavior: 1 },
  { slot: 40, nativeClassRecord: 20, position: { x: 27, y: 15 }, aiBehavior: 1 },
  { slot: 25, nativeClassRecord: 0, position: { x: 23, y: 16 }, aiBehavior: 1, name: "汀塔琪", portraitRecord: 3 },
  { slot: 26, nativeClassRecord: 0, position: { x: 27, y: 16 }, aiBehavior: 1, name: "萊茵", portraitRecord: 2 },
  { slot: 51, nativeClassRecord: 28, position: { x: 20, y: 18 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 22, position: { x: 31, y: 18 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 0, position: { x: 20, y: 21 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 0, position: { x: 31, y: 21 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 0, position: { x: 20, y: 25 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 0, position: { x: 31, y: 25 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 0, position: { x: 20, y: 28 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 0, position: { x: 31, y: 28 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 0, position: { x: 20, y: 32 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 0, position: { x: 31, y: 32 }, aiBehavior: 0 },
], "stage 5 enemies");
assertEqual(
  stage5Template.classArrays.side1SparseOverrides.filter((value) => value !== 0),
  [],
  "stage 5 side-1 class overrides",
);

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 5, "stage 5 objective");
const generatedObjective = {
  victory: { type: "any-unit-removed", side: nativeObjective.victory.side, slots: nativeObjective.victory.unitSlots },
  defeat: { type: "unit-removed", side: nativeObjective.defeat.side, slot: nativeObjective.defeat.unitSlot },
  victoryText: "擊敗汀塔琪或萊茵任一人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "汀塔琪或萊茵已停止戰鬥。",
};
assertEqual(generatedObjective.victory, { type: "any-unit-removed", side: 2, slots: [25, 26] }, "stage 5 victory");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 0 }, "stage 5 defeat");
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("首領「麗」") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0087 objective conflict changed");
}
const titleText = parseInput("title").actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "遭遇丁塔琪") throw new Error(`stage 5 title changed: ${titleText}`);

const stage5Handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 5,
  "stage 5 event handler",
);
assertEqual(stage5Handler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [9] },
  { trigger: "live victory 999", sayRecords: [10] },
], "stage 5 event program");
assertEqual(stage5Handler.outcomeRouting.loadedVictory1000, {
  nextModule: 27,
  nextStage: 42,
  presentationReplayed: false,
}, "stage 5 completed route");

const portalScene = requireEntry(eventsDocument.scenes, ({ stage }) => stage === 42, "stage 42 portal scene");
assertEqual(portalScene.liveVictory999.map(({ op }) => op), [
  "focusPortraitResource", "scriptedMove", "battleStory", "focusPortraitResource",
  "battleStory", "focusCell", "scriptedMove", "battleStory", "lightning4",
  "clearCell", "clearCell", "focusPortraitResource", "battleStory", "setNextStage",
], "stage 42 operation order");
const portalUnits = portalTemplate.activeUnitInstances.map((unit) => {
  const actor = actorFor(unit.unitSlot);
  return {
    slot: unit.unitSlot,
    position: { x: unit.x, y: unit.y },
    nativeClassRecord: unit.inheritsCampaignClass ? null : unit.effectiveClass,
    name: actor.normalizedName,
    portraitRecord: actor.portraitRecord,
  };
});
assertEqual(portalUnits.map(({ slot, position, nativeClassRecord }) => ({ slot, position, nativeClassRecord })), [
  { slot: 5, position: { x: 21, y: 22 }, nativeClassRecord: null },
  { slot: 23, position: { x: 23, y: 22 }, nativeClassRecord: 35 },
  { slot: 7, position: { x: 24, y: 22 }, nativeClassRecord: 3 },
  { slot: 6, position: { x: 27, y: 22 }, nativeClassRecord: null },
  { slot: 3, position: { x: 21, y: 24 }, nativeClassRecord: null },
  { slot: 4, position: { x: 27, y: 24 }, nativeClassRecord: null },
  { slot: 2, position: { x: 22, y: 25 }, nativeClassRecord: null },
  { slot: 0, position: { x: 24, y: 25 }, nativeClassRecord: null },
  { slot: 1, position: { x: 26, y: 25 }, nativeClassRecord: null },
  { slot: 24, position: { x: 25, y: 26 }, nativeClassRecord: null },
], "stage 42 tableau");

const musicEntry = (table, stage) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === stage,
  `${table} stage ${stage} music`,
);
const stage5MusicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 5)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 5)),
};
const portalMusicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 42)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 42)),
};
assertEqual(stage5MusicRecords, { player: { entry: 29, loop: 28 }, enemy: { entry: 27, loop: 26 } }, "stage 5 music");
assertEqual(portalMusicRecords, { player: { entry: 35, loop: 34 }, enemy: { entry: 13, loop: 12 } }, "stage 42 music");

const portraitSpeakers = {
  0: "葛蒂拉斯", 2: "萊茵", 3: "汀塔琪", 14: "琴斯", 42: "蒙欣曼",
  45: "希蜜", 46: "妮雅", 47: "士兵",
};
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}
const storyPages = {
  "stage-05-opening-story": compileStory(parseInput("openingStory"), 9),
  "stage-05-victory-story": compileStory(parseInput("victoryStory"), 10),
  "stage-42-portal-arrival-story": compileStory(parseInput("portalArrivalStory"), 11),
  "stage-42-portal-confrontation-story": compileStory(parseInput("portalConfrontationStory"), 18),
  "stage-42-portal-intervention-story": compileStory(parseInput("portalInterventionStory"), 20),
  "stage-42-portal-departure-story": compileStory(parseInput("portalDepartureStory"), 19),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [9, 11, 1, 6, 2, 16], "stage 5/42 story waits");

const terrainData = (templateBytes, stageTerrainEntry) => {
  const tokenToSlot = new Uint8Array(128).fill(0);
  for (const mapping of stageTerrainEntry.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
  return {
    terrain: templateBytes.subarray(256, 2756),
    tokenToSlot,
  };
};
const stage5TerrainData = terrainData(stage5TemplateBytes, stage5Terrain);
const portalTerrainData = terrainData(portalTemplateBytes, portalTerrain);
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id,
  path: path.relative(root, file),
  sha256: sha256(inputBuffers[id]),
  bytes: inputBuffers[id].length,
}));
const identityHash = createHash("sha256");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-05/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage5-runtime.mjs from stage 5 / scene 42 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE5_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE5_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE5_SECTION_SHA256 = ${json(stage5Template.sectionSha256)} as const;\n`
  + `export const STAGE42_SECTION_SHA256 = ${json(portalTemplate.sectionSha256)} as const;\n`
  + `export const STAGE5_TERRAIN_TOKENS_BASE64 = ${json(encode(stage5TerrainData.terrain))};\n`
  + `export const STAGE5_TOKEN_TO_SLOT_BASE64 = ${json(encode(stage5TerrainData.tokenToSlot))};\n`
  + `export const STAGE42_TERRAIN_TOKENS_BASE64 = ${json(encode(portalTerrainData.terrain))};\n`
  + `export const STAGE42_TOKEN_TO_SLOT_BASE64 = ${json(encode(portalTerrainData.tokenToSlot))};\n`
  + `export const STAGE5_TITLE = ${json(titleText)};\n`
  + `export const STAGE5_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE5_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE5_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE5_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE42_PORTAL_UNITS = ${json(portalUnits)} as const;\n`
  + `export const STAGE5_MUSIC_RECORDS = ${json(stage5MusicRecords)} as const;\n`
  + `export const STAGE42_MUSIC_RECORDS = ${json(portalMusicRecords)} as const;\n`
  + `export const STAGE5_EVENT_PROGRAM = ${json({ openingStoryRecord: 9, victoryStoryRecord: 10, completedRoute: { module: 27, stage: 42, replayPresentation: false } })} as const;\n`
  + `export const STAGE42_EVENT_PROGRAM = ${json(portalScene)} as const;\n`
  + `export const STAGE5_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-05-opening-story" | "stage-05-victory-story" | "stage-42-portal-arrival-story" | "stage-42-portal-confrontation-story" | "stage-42-portal-intervention-story" | "stage-42-portal-departure-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.stage5Map, path.join(publicAssetPath, "stage5-map.png")),
  copyFile(inputPaths.stage5Minimap, path.join(publicAssetPath, "stage5-minimap.png")),
  copyFile(inputPaths.portalMap, path.join(publicAssetPath, "stage42-portal-map.png")),
  copyFile(inputPaths.portalMinimap, path.join(publicAssetPath, "stage42-portal-minimap.png")),
  copyFile(inputPaths.stage5PlayerEntryMusic, path.join(publicAssetPath, "battle-stage5-player-entry.wav")),
  copyFile(inputPaths.stage5PlayerLoopMusic, path.join(publicAssetPath, "battle-stage5-player-loop.wav")),
  copyFile(inputPaths.stage5EnemyEntryMusic, path.join(publicAssetPath, "battle-stage5-enemy-entry.wav")),
  copyFile(inputPaths.stage5EnemyLoopMusic, path.join(publicAssetPath, "battle-stage5-enemy-loop.wav")),
  copyFile(inputPaths.portalPlayerEntryMusic, path.join(publicAssetPath, "battle-stage42-player-entry.wav")),
  copyFile(inputPaths.portalPlayerLoopMusic, path.join(publicAssetPath, "battle-stage42-player-loop.wav")),
  copyFile(inputPaths.portalEnemyEntryMusic, path.join(publicAssetPath, "battle-stage42-enemy-entry.wav")),
  copyFile(inputPaths.portalEnemyLoopMusic, path.join(publicAssetPath, "battle-stage42-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 5 / scene 42 maps and music with identity ${contentIdentity}`);
