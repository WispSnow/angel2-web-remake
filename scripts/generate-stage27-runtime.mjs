#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage27-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0055/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  title: reversePath("parsed/dialogue/0144.json"),
  nextTitle: reversePath("parsed/dialogue/0145.json"),
  objectiveText: reversePath("parsed/dialogue/0094.json"),
  openingStory: reversePath("parsed/dialogue/0051.json"),
  victoryStory: reversePath("parsed/dialogue/0052.json"),
  map: reversePath("renders/battle-maps/confirmed/27.png"),
  minimap: reversePath("renders/battle-maps/minimap/27.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0003.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0002.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0055 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "73fca3043a847f57ea3dd8667f19a2bbbf8525b909037961717d614407628a24") {
  throw new Error(`B/0055 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 27, "stage 27 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 27, "stage 27 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 27, "stage 27 lifecycle");

const campaignSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const fixedSlots = [22, 41, 44, 43, 45, 42, 40, 57, 56, 58, 0];
const optionalSlots = campaignSlots.filter((slot) => slot !== 0);
const openCells = [
  { x: 35, y: 36 }, { x: 36, y: 36 }, { x: 37, y: 36 }, { x: 38, y: 36 },
  { x: 39, y: 36 }, { x: 40, y: 36 }, { x: 41, y: 36 }, { x: 35, y: 37 },
  { x: 36, y: 37 }, { x: 37, y: 37 }, { x: 38, y: 37 }, { x: 40, y: 37 },
  { x: 41, y: 37 }, { x: 35, y: 38 }, { x: 36, y: 38 }, { x: 37, y: 38 },
  { x: 38, y: 38 }, { x: 39, y: 38 }, { x: 40, y: 38 }, { x: 41, y: 38 },
];
assertEqual(template.deployment.eligibleUnitSlots, campaignSlots, "stage 27 native eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, fixedSlots, "stage 27 fixed slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [0], "stage 27 fixed roster slots");
assertEqual(
  template.deployment.fixedBoardOnlyUnitSlots,
  [22, 41, 44, 43, 45, 42, 40, 57, 56, 58],
  "stage 27 fixed board-only slots",
);
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 27 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 27 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 31, "stage 27 capacity");

const fixedPlacements = template.activeUnitInstances
  .filter(({ side }) => side === 1)
  .map(({ unitSlot, x, y }) => ({ slot: unitSlot, position: { x, y } }));
assertEqual(fixedPlacements.map(({ slot }) => slot), fixedSlots, "stage 27 fixed board order");
const fixedAlliedUnits = template.activeUnitInstances
  .filter(({ side, unitSlot }) => side === 1 && unitSlot !== 0)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
  }));
assertEqual(fixedAlliedUnits.filter(({ aiBehavior }) => aiBehavior === 2).length, 7, "stage 27 automatic ally count");
assertEqual(fixedAlliedUnits.filter(({ aiBehavior }) => aiBehavior === 0).length, 3, "stage 27 engineer count");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);

const eliolaActor = actorFor(22);
assertEqual(
  {
    slot: eliolaActor.slot,
    name: eliolaActor.normalizedName,
    portraitRecord: eliolaActor.portraitRecord,
  },
  { slot: 22, name: "愛莉歐拉", portraitRecord: 0xff },
  "stage 27 Eliola actor descriptor",
);
const eliolaIdentity = {
  slot: eliolaActor.slot,
  normalizedName: eliolaActor.normalizedName,
  portraitRecord: eliolaActor.portraitRecord,
};

// 十名固定棋盘单位的 side-1 角色描述符肖像字节全是 FFh。模块 29 `0000:51B9` 在这种
// 情况下按职业短码查 DS:39A6 回退表，先覆写肖像记录（DS:3192），再把单位名指针
// （DS:3190）改写为职业名指针（DS:31BB）。REMAKE-120 保留这个原版事实，同时把槽 22
// 描述符中的「愛莉歐拉」恢复为 stableRemake 玩家向姓名；肖像仍按当前职业回退。
assertEqual(
  fixedAlliedUnits.map(({ slot }) => actorFor(slot).portraitRecord),
  fixedAlliedUnits.map(() => 0xff),
  "stage 27 fixed board-only actors use the class visual fallback",
);
const deploymentActors = campaignSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 27,
  "stage 27 objective",
);
const victoryRanges = [[0, 575], [616, 625], [666, 675], [716, 725]];
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  victorySlot: nativeObjective.victory.unitSlot,
  victoryRanges: nativeObjective.victory.successCellRangesInclusive,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "side1_slot_cell_range",
  victorySlot: 0,
  victoryRanges,
  defeatSlot: 0,
}, "stage 27 native objective");
const generatedObjective = {
  victory: {
    type: "any-of",
    conditions: victoryRanges.map(([minimum, maximum]) => ({
      type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum, maximum,
    })),
  },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "「妮雅」回到瓦爾克麗城",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "妮雅已回到瓦爾克麗城。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "趕回瓦爾克麗城") throw new Error(`stage 27 title changed: ${titleText}`);
if (nextTitleText !== "保衛瓦爾克麗城") throw new Error(`stage 28 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("妮雅") || !objectiveText.includes("回到瓦爾克麗城")) {
  throw new Error("SAY/0094 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 27),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 27),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 28),
}, { objective: 94, title: 144, next: 145 }, "stage 27 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 27,
  "stage 27 handler",
);
if (handler.sha256 !== "57ab5cebb7a896d3f652d3d6dca2a851c7a909cf447a9b39b0463d1f1a16bc39") {
  throw new Error(`stage 27 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [51], actions: [] },
  { trigger: "live victory 999", sayRecords: [52], actions: [] },
], "stage 27 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 25, nextStage: 28, presentationReplayed: false },
  "stage 27 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 27,
  "stage 27 module-25 record",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources },
  { record: null, resources: [] },
  "stage 27 module-25 story",
);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(27)) {
  throw new Error("stage 27 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 27)) {
  throw new Error("stage 27 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}

const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
  }));
if (enemyUnits.length !== 5) throw new Error(`stage 27 enemy count changed: ${enemyUnits.length}`);
assertEqual(enemyUnits.map(({ aiBehavior }) => aiBehavior), [0, 0, 0, 0, 0], "stage 27 enemy behaviors");
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
  ({ stage }) => stage === 27,
  `${table} stage 27 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 3, loop: 2 }, enemy: { entry: 5, loop: 4 } },
  "stage 27 music",
);
const portraitSpeakers = { 45: "希蜜", 46: "妮雅", 47: "士兵", 57: "戰士" };
const storyPages = {
  "stage-27-opening-story": compileNativeStory(
    parseInput("openingStory"), 51, portraitSpeakers, { includeBackground: true },
  ),
  "stage-27-victory-story": compileNativeStory(
    parseInput("victoryStory"), 52, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-27-opening-story": 6,
  "stage-27-victory-story": 10,
}, "stage 27 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 27,
  "stage 27 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 3, obstacle: 57 },
  "stage 27 construction tokens",
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
const stableRemakeDecisions = ["REMAKE-064", "REMAKE-067", "REMAKE-120"];
const identityHash = createHash("sha256");
identityHash.update(`stableRemake\0${stableRemakeDecisions.join("\0")}\0`);
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-27/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  module25StoryRecord: null,
  openingStoryRecord: 51,
  victoryStoryRecord: 52,
  alliedControl: {
    automaticBehavior2Slots: fixedAlliedUnits.filter(({ aiBehavior }) => aiBehavior === 2).map(({ slot }) => slot),
    playerBehavior0FixedSlots: fixedSlots.filter((slot) => slot === 0
      || fixedAlliedUnits.some((unit) => unit.slot === slot && unit.aiBehavior === 0)),
    firstRoundAutomaticPosture: "sentry",
    normalPostureFromRound: 2,
  },
  enemyReinforcements,
  completedRoute: { module: 25, stage: 28, replayPresentation: false },
  stableRemakeDecisions,
};
const deployment = {
  kind: "interactive",
  eligibleSlots: [...fixedSlots, ...optionalSlots],
  fixedPlacements,
  optionalSlots,
  openCells,
  maximumUnits: 31,
};
const generatedSource = `// Generated by scripts/generate-stage27-runtime.mjs from stage 27 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE27_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE27_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE27_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE27_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE27_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE27_TITLE = ${json(titleText)};\n`
  + `export const STAGE27_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE27_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE27_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE27_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE27_ELIOLA_IDENTITY = ${json(eliolaIdentity)} as const;\n`
  + `export const STAGE27_FIXED_ALLIED_UNITS = ${json(fixedAlliedUnits)} as const;\n`
  + `export const STAGE27_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE27_CONSTRUCTION_TOKENS = ${json({ ironPlate: 3, obstacle: 57 })} as const;\n`
  + `export const STAGE27_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE27_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE27_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage27-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage27-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 27 maps and music with identity ${contentIdentity}`);
