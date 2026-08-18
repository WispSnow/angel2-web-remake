#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";
import { assertIdenticalImage, removeDuplicateImage } from "./lib/shared-image-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage8-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0017/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0126.json"),
  objectiveText: reversePath("parsed/dialogue/0162.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  prebattleStory: reversePath("parsed/dialogue/0021.json"),
  openingStory: reversePath("parsed/dialogue/0156.json"),
  victoryStory: reversePath("parsed/dialogue/0157.json"),
  map: reversePath("renders/battle-maps/confirmed/08.png"),
  minimap: reversePath("renders/battle-maps/minimap/08.png"),
  storyBackground6: reversePath("renders/planar/BK/0006/00.png"),
  storyBackground7: reversePath("renders/planar/BK/0007/00.png"),
  storyBackground8: reversePath("renders/planar/BK/0008/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0072.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
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
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");

if (templateBytes.length !== 8506) throw new Error(`B/0017 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "50d0a4c046cbfd152641b7dac6a7e06f92fc07793bc6c0b257518f0dbabab219") {
  throw new Error(`B/0017 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 8, "stage 8 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 8, "stage 8 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 8, "stage 8 lifecycle");
assertEqual(stageLifecycle, {
  stage: 8,
  stageKind: "normal_0_to_38",
  required: false,
  openCells: 0,
  eligibleUnits: 0,
  fixedUnits: 8,
  // No scenarioUnitFlag is nonzero, so every side-1 board occupant stays board-only
  // and stage 8 publishes no roster entry at all.
  fixedRosterUnits: 0,
  fixedBoardOnlyUnits: 8,
  optionalUnits: 0,
  maximumPlayerUnits: 8,
  cells: [],
  eligibleUnitSlots: [],
  fixedPlayerUnitSlots: [40, 43, 41, 18, 8, 42, 17, 44],
  fixedRosterUnitSlots: [],
  fixedBoardOnlyUnitSlots: [40, 43, 41, 18, 8, 42, 17, 44],
  optionalUnitSlots: [],
}, "stage 8 lifecycle");

const compactUnit = (unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
});
const alliedUnits = template.activeUnitInstances.filter(({ side }) => side === 1).map(compactUnit);
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map(compactUnit);
assertEqual(alliedUnits, [
  { slot: 40, nativeClassRecord: 22, position: { x: 27, y: 24 }, aiBehavior: 2 },
  { slot: 43, nativeClassRecord: 22, position: { x: 29, y: 26 }, aiBehavior: 2 },
  { slot: 41, nativeClassRecord: 22, position: { x: 31, y: 27 }, aiBehavior: 2 },
  { slot: 18, nativeClassRecord: null, position: { x: 24, y: 29 }, aiBehavior: 0 },
  { slot: 8, nativeClassRecord: 22, position: { x: 23, y: 30 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 22, position: { x: 21, y: 31 }, aiBehavior: 2 },
  { slot: 17, nativeClassRecord: null, position: { x: 22, y: 31 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 22, position: { x: 24, y: 32 }, aiBehavior: 2 },
], "stage 8 allied units");
assertEqual(enemyUnits, [
  { slot: 45, nativeClassRecord: 22, position: { x: 22, y: 12 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 22, position: { x: 34, y: 12 }, aiBehavior: 0 },
  { slot: 36, nativeClassRecord: 22, position: { x: 34, y: 23 }, aiBehavior: 0 },
  { slot: 30, nativeClassRecord: 6, position: { x: 35, y: 24 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 0, position: { x: 15, y: 35 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 0, position: { x: 20, y: 35 }, aiBehavior: 0 },
  { slot: 35, nativeClassRecord: 0, position: { x: 30, y: 35 }, aiBehavior: 0 },
  { slot: 38, nativeClassRecord: 22, position: { x: 22, y: 36 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 22, position: { x: 13, y: 37 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 0, position: { x: 21, y: 37 }, aiBehavior: 0 },
  { slot: 39, nativeClassRecord: 22, position: { x: 35, y: 37 }, aiBehavior: 0 },
], "stage 8 enemy units");

const actorBySlot = new Map(campaignRoster.displayResolution.actors.map((actor) => [actor.slot, actor]));
const alliedActors = alliedUnits.map(({ slot }) => {
  const actor = actorBySlot.get(slot);
  if (!actor) throw new Error(`missing stage 8 allied actor ${slot}`);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 8, "stage 8 objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: nativeObjective.victory.side },
  defeat: { type: "unit-removed", side: nativeObjective.defeat.side, slot: nativeObjective.defeat.unitSlot },
  victoryText: "擊退龍塔襲擊者",
  defeatText: "「蘇蘭達」戰敗",
  victoryStatusText: "龍塔襲擊部隊已全數離開戰場。",
};
assertEqual(generatedObjective.victory, { type: "eliminate-side", side: 2 }, "stage 8 victory");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 8 }, "stage 8 defeat");
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("打敗所有的敵人")
  || !originalObjectiveText.includes("「蘇蘭達」戰敗")) {
  throw new Error("SAY/0162 objective wording changed");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 8 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 162) {
  throw new Error(`stage 8 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}
const titleText = parseInput("title").actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "營地遭到偷襲") throw new Error(`stage 8 title changed: ${titleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 8,
  "stage 8 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [156], actions: [] },
  {
    trigger: "live victory 999",
    sayRecords: [],
    actions: [],
    sayRecordWritesWithoutRenderer: [157],
    nativeQuirk: "the handler stores SAY record 157 after focusing a unit but never calls the battle-story renderer",
  },
], "stage 8 event program");
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 27,
  nextStage: 9,
  presentationReplayed: false,
}, "stage 8 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 8,
  "stage 8 module 25 story",
);
if (storyEntry.record !== 21) throw new Error(`stage 8 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 8,
  "stage 8 story music",
);
if (storyMusicEntry.magicRecord !== 72) throw new Error(`stage 8 story music changed: ${storyMusicEntry.magicRecord}`);

const musicEntry = (table, stage) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === stage,
  `${table} stage ${stage} music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 8)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 8)),
};
assertEqual(musicRecords, { player: { entry: 29, loop: 28 }, enemy: { entry: 13, loop: 12 } }, "stage 8 music");

const portraitSpeakers = { 10: "蘇蘭達", 13: "多莉", 45: "希蜜", 46: "妮雅", 52: "騎兵" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers, { includeBackground: true });
}
const storyPages = {
  "stage-08-prebattle-story": compileStory(parseInput("prebattleStory"), 21),
  "stage-08-opening-story": compileStory(parseInput("openingStory"), 156),
  "stage-08-victory-story": compileStory(parseInput("victoryStory"), 157),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [34, 2, 1], "stage 8 story waits");
assertEqual(
  [...new Set(storyPages["stage-08-prebattle-story"].map(({ source }) => source.backgroundId))],
  [7, 6, 8],
  "stage 8 prebattle backgrounds",
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
identityHash.update("stableRemake\0REMAKE-032\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-08/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 21,
  openingStoryRecord: 156,
  nativeOmittedVictoryStoryRecord: 157,
  stableRemakeVictoryStoryRecord: 157,
  stableRemakeDecision: "REMAKE-032",
  completedRoute: { module: 27, stage: 9, replayPresentation: false },
};

const generatedSource = `// Generated by scripts/generate-stage8-runtime.mjs from stage 8 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE8_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE8_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE8_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE8_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE8_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE8_TITLE = ${json(titleText)};\n`
  + `export const STAGE8_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE8_DEPLOYMENT = { kind: "fixed" } as const;\n`
  + `export const STAGE8_ALLIED_ACTORS = ${json(alliedActors)} as const;\n`
  + `export const STAGE8_ALLIED_UNITS = ${json(alliedUnits)} as const;\n`
  + `export const STAGE8_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE8_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE8_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE8_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-08-prebattle-story" | "stage-08-opening-story" | "stage-08-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage8-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage8-minimap.png")),
  assertIdenticalImage(inputPaths.storyBackground6, reversePath("renders/planar/BK/0006/00.png"), "stage 8 story background 6"),
  assertIdenticalImage(inputPaths.storyBackground7, reversePath("renders/planar/BK/0007/00.png"), "stage 8 story background 7"),
  removeDuplicateImage(path.join(publicAssetPath, "story-stage8-background-6.png")),
  removeDuplicateImage(path.join(publicAssetPath, "story-stage8-background-7.png")),
  copyFile(inputPaths.storyBackground8, path.join(publicAssetPath, "story-stage8-background-8.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 8 maps, backgrounds, and music with identity ${contentIdentity}`);
