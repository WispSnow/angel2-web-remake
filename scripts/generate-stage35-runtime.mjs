#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage35-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0071/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  behavior12Notes: reversePath("notes/behavior12-stage-effects.md"),
  title: reversePath("parsed/dialogue/0152.json"),
  nextTitle: reversePath("parsed/dialogue/0153.json"),
  objectiveText: reversePath("parsed/dialogue/0103.json"),
  openingStory: reversePath("parsed/dialogue/0067.json"),
  victoryStory: reversePath("parsed/dialogue/0068.json"),
  map: reversePath("renders/battle-maps/confirmed/35.png"),
  minimap: reversePath("renders/battle-maps/minimap/35.png"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0071 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "33d0556bed6990fe68e13286c920235ecab6f0f56912d54de122e47e6f0f8122") {
  throw new Error(`B/0071 hash changed: ${sha256(templateBytes)}`);
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
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 35, "stage 35 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 35, "stage 35 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 35, "stage 35 lifecycle");

const fixedSlots = [5, 3, 0, 8, 4, 2, 1, 18, 7];
assertEqual(template.deployment.required, false, "stage 35 deployment requirement");
assertEqual(template.deployment.eligibleUnitSlots, [], "stage 35 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, fixedSlots, "stage 35 fixed player slots");
assertEqual(template.deployment.fixedRosterUnitSlots, [], "stage 35 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, fixedSlots, "stage 35 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, [], "stage 35 optional slots");
assertEqual(template.deployment.cells, [], "stage 35 deployment cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 9, "stage 35 capacity");
assertEqual(template.scenarioUnitFlags.filter((value) => value !== 0), [], "stage 35 scenario flags");
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 35 side-1 class overrides");

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const fixedAlliedUnits = template.activeUnitInstances
  .filter(({ side }) => side === 1)
  .map(({ unitSlot, x, y, perSlotBehavior }) => {
    const actor = actorFor(unitSlot);
    return {
      slot: unitSlot,
      position: { x, y },
      portraitRecord: actor.portraitRecord,
      normalizedName: actor.normalizedName,
      aiBehavior: perSlotBehavior,
    };
  });
assertEqual(fixedAlliedUnits.map(({ slot }) => slot), fixedSlots, "stage 35 fixed board order");

const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map(({ unitSlot, effectiveClass, x, y, perSlotBehavior }) => ({
    slot: unitSlot,
    nativeClassRecord: effectiveClass,
    position: { x, y },
    aiBehavior: perSlotBehavior,
  }));
assertEqual(enemyUnits, [
  { slot: 39, nativeClassRecord: 13, position: { x: 23, y: 8 }, aiBehavior: 12 },
  { slot: 35, nativeClassRecord: 9, position: { x: 27, y: 8 }, aiBehavior: 12 },
  { slot: 36, nativeClassRecord: 8, position: { x: 28, y: 8 }, aiBehavior: 12 },
  { slot: 40, nativeClassRecord: 1, position: { x: 22, y: 9 }, aiBehavior: 12 },
  { slot: 44, nativeClassRecord: 11, position: { x: 23, y: 9 }, aiBehavior: 12 },
  { slot: 38, nativeClassRecord: 14, position: { x: 25, y: 9 }, aiBehavior: 12 },
  { slot: 41, nativeClassRecord: 3, position: { x: 26, y: 9 }, aiBehavior: 12 },
  { slot: 43, nativeClassRecord: 7, position: { x: 27, y: 9 }, aiBehavior: 12 },
  { slot: 37, nativeClassRecord: 13, position: { x: 28, y: 9 }, aiBehavior: 12 },
  { slot: 42, nativeClassRecord: 6, position: { x: 22, y: 10 }, aiBehavior: 12 },
], "stage 35 enemies");

const nativeObjective = requireEntry(
  objectives.normalStageObjectives,
  ({ stage }) => stage === 35,
  "stage 35 objective",
);
assertEqual({
  victoryKind: nativeObjective.victory.kind,
  defeatKind: nativeObjective.defeat.kind,
  defeatSlot: nativeObjective.defeat.unitSlot,
}, {
  victoryKind: "all_side2_units_absent",
  defeatKind: "required_side1_slot_absent",
  defeatSlot: 0,
}, "stage 35 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "時空異變的死亡之谷士兵已全數離場。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "時空異變") throw new Error(`stage 35 title changed: ${titleText}`);
if (nextTitleText !== "異世界的碧娜維姬") throw new Error(`stage 36 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗所有的敵人") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0103 objective wording changed");
}
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({
  objective: recordForStage(storyPresentations.globalReachabilityAudit.tables.alternate, 35),
  title: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 35),
  next: recordForStage(storyPresentations.globalReachabilityAudit.tables.postBattle, 36),
}, { objective: 103, title: 152, next: 153 }, "stage 35 dialogue records");

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 35,
  "stage 35 handler",
);
if (handler.sha256 !== "3b2f0036657b063b373d86dae2557b8d898fe9b9f6b9b6b4f81c79fba6241e47") {
  throw new Error(`stage 35 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events, [
  { trigger: "round 1", sayRecords: [67], actions: [] },
  { trigger: "live victory 999", sayRecords: [68], actions: [] },
], "stage 35 stories");
assertEqual(
  handler.outcomeRouting.loadedVictory1000,
  { nextModule: 27, nextStage: 36, presentationReplayed: false },
  "stage 35 completed route",
);
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 35,
  "stage 35 module-25 story",
);
assertEqual(
  { record: storyEntry.record, resources: storyEntry.resources, behavior: storyEntry.behavior },
  { record: null, resources: [], behavior: "no module-25 story triplet" },
  "stage 35 absent module-25 story",
);
const storyMusicEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageMagicRecords.entries,
  ({ stage }) => stage === 35,
  "stage 35 story music table entry",
);
if (storyMusicEntry.magicRecord !== 75) throw new Error(`stage 35 unused story music changed: ${storyMusicEntry.magicRecord}`);
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(35)) {
  throw new Error("stage 35 entered the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 35)) {
  throw new Error("stage 35 entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("defeat replacement is no longer stage-30 only");
}
const enemyReinforcements = {
  kind: "none",
  initialSide2: enemyUnits.length,
  narrativeCallsThemReinforcements: true,
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
  ({ stage }) => stage === 35,
  `${table} stage 35 music`,
);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(
  musicRecords,
  { player: { entry: 35, loop: 34 }, enemy: { entry: 13, loop: 12 } },
  "stage 35 music",
);
const portraitSpeakers = {
  10: "蘇蘭達",
  14: "琴斯",
  24: "蕾娜吉芙",
  45: "希蜜",
  46: "妮雅",
};
const storyPages = {
  "stage-35-opening-story": compileNativeStory(
    parseInput("openingStory"), 67, portraitSpeakers, { includeBackground: true },
  ),
  "stage-35-victory-story": compileNativeStory(
    parseInput("victoryStory"), 68, portraitSpeakers, { includeBackground: true },
  ),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-35-opening-story": 13,
  "stage-35-victory-story": 4,
}, "stage 35 story waits");

const constructionTokens = requireEntry(
  techniqueRules.terrainConstructionTokens.stages,
  ({ stage }) => stage === 35,
  "stage 35 construction tokens",
);
assertEqual(
  { ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken },
  { ironPlate: 0, obstacle: 0 },
  "stage 35 construction tokens",
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
identityHash.update("stableRemake\0REMAKE-076\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-35/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  unusedPrebattleMusicRecord: 75,
  openingStoryRecord: 67,
  victoryStoryRecord: 68,
  enemyReinforcements,
  enemyBehavior12: {
    kind: "consume-action-without-move-or-attack",
    slots: enemyUnits.map(({ slot }) => slot),
    routeTarget: null,
  },
  completedRoute: { module: 27, stage: 36, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-076"],
};
const generatedSource = `// Generated by scripts/generate-stage35-runtime.mjs from stage 35 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE35_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE35_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE35_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE35_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE35_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE35_TITLE = ${json(titleText)};\n`
  + `export const STAGE35_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE35_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE35_DEPLOYMENT = { kind: "fixed" } as const;\n`
  + `export const STAGE35_FIXED_ALLIED_UNITS = ${json(fixedAlliedUnits)} as const;\n`
  + `export const STAGE35_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE35_CONSTRUCTION_TOKENS = ${json({ ironPlate: 0, obstacle: 0 })} as const;\n`
  + `export const STAGE35_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE35_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE35_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage35-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage35-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 35 maps and battle music with identity ${contentIdentity}`);
