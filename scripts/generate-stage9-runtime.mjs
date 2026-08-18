#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage9-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0019/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  behavior12: reversePath("parsed/native/behavior12-effects.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0127.json"),
  nextTitle: reversePath("parsed/dialogue/0128.json"),
  objectiveText: reversePath("parsed/dialogue/0110.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  openingStory: reversePath("parsed/dialogue/0022.json"),
  victoryStory: reversePath("parsed/dialogue/0023.json"),
  map: reversePath("renders/battle-maps/confirmed/09.png"),
  minimap: reversePath("renders/battle-maps/minimap/09.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0039.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0038.wav"),
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
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const behavior12Document = parseInput("behavior12");
const musicDocument = parseInput("music");

if (templateBytes.length !== 8506) throw new Error(`B/0019 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "2bb101d2275f0df56c1def57510d3384e7cd94959311444a8d016abf4ef7769f") {
  throw new Error(`B/0019 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 9, "stage 9 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 9, "stage 9 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 9, "stage 9 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 9, 12, 13, 14, 20, 21, 24],
  fixedSlots: [9, 0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
  openCells: [
    { x: 14, y: 38 }, { x: 15, y: 38 }, { x: 17, y: 38 }, { x: 18, y: 38 },
    { x: 15, y: 39 }, { x: 16, y: 39 }, { x: 18, y: 39 },
  ],
  maximumUnits: 9,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 9 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 9 fixed slots");
// Both side-1 board occupants carry a nonzero scenarioUnitFlag, so stage 9 has no
// board-only unit and every fixed slot is also a locked roster entry.
assertEqual(template.deployment.fixedRosterUnitSlots, expectedDeployment.fixedSlots, "stage 9 fixed roster slots");
assertEqual(template.deployment.fixedBoardOnlyUnitSlots, [], "stage 9 fixed board-only slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 9 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 9 cells");
assertEqual(stageLifecycle, {
  stage: 9,
  stageKind: "normal_0_to_38",
  required: true,
  openCells: 7,
  eligibleUnits: 14,
  fixedUnits: 2,
  fixedRosterUnits: 2,
  fixedBoardOnlyUnits: 0,
  optionalUnits: 12,
  maximumPlayerUnits: 9,
  cells: template.deployment.cells,
  eligibleUnitSlots: expectedDeployment.eligibleSlots,
  fixedPlayerUnitSlots: expectedDeployment.fixedSlots,
  fixedRosterUnitSlots: expectedDeployment.fixedSlots,
  fixedBoardOnlyUnitSlots: [],
  optionalUnitSlots: expectedDeployment.optionalSlots,
}, "stage 9 lifecycle");

const fixedPlacements = [
  { slot: 9, position: { x: 16, y: 38 } },
  { slot: 0, position: { x: 17, y: 39 } },
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
const fixedClassOverrides = template.activeUnitInstances
  .filter(({ side, unitSlot }) => side === 1 && unitSlot === 9)
  .map(({ unitSlot, effectiveClass }) => ({ slot: unitSlot, nativeClassRecord: effectiveClass }));
assertEqual(fixedClassOverrides, [{ slot: 9, nativeClassRecord: 5 }], "stage 9 Dori class override");

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
  { slot: 48, nativeClassRecord: 0, position: { x: 31, y: 16 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 0, position: { x: 33, y: 16 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 29, position: { x: 15, y: 18 }, aiBehavior: 4 },
  { slot: 50, nativeClassRecord: 25, position: { x: 34, y: 18 }, aiBehavior: 0 },
  { slot: 52, nativeClassRecord: 22, position: { x: 17, y: 19 }, aiBehavior: 2 },
  { slot: 19, nativeClassRecord: 13, position: { x: 17, y: 20 }, aiBehavior: 3, name: "西艾蕾", portraitRecord: 5 },
  { slot: 51, nativeClassRecord: 0, position: { x: 19, y: 20 }, aiBehavior: 2 },
  { slot: 42, nativeClassRecord: 0, position: { x: 15, y: 21 }, aiBehavior: 4 },
  { slot: 40, nativeClassRecord: 24, position: { x: 19, y: 21 }, aiBehavior: 4 },
  { slot: 41, nativeClassRecord: 0, position: { x: 16, y: 22 }, aiBehavior: 4 },
  { slot: 46, nativeClassRecord: 13, position: { x: 33, y: 22 }, aiBehavior: 2 },
  { slot: 43, nativeClassRecord: 24, position: { x: 18, y: 23 }, aiBehavior: 4 },
  { slot: 45, nativeClassRecord: 0, position: { x: 35, y: 23 }, aiBehavior: 2 },
  { slot: 47, nativeClassRecord: 0, position: { x: 32, y: 24 }, aiBehavior: 2 },
], "stage 9 enemies");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 9, "stage 9 objective");
assertEqual(nativeObjective.defeat.unitSlots, [0, 9], "stage 9 protected slots");
assertEqual(nativeObjective.victory, {
  kind: "side1_slot_cell_range_or_all_side2_absent",
  side: 1,
  unitSlot: 9,
  successCellRangesInclusive: [[0, 933]],
  alternative: "all_side2_units_absent",
  resultWhenTrue: "victory",
  evidence: nativeObjective.victory.evidence,
  referencedInitialInstances: nativeObjective.victory.referencedInitialInstances,
}, "stage 9 native victory");
const generatedObjective = {
  victory: {
    type: "any-of",
    conditions: [
      { type: "unit-in-cell-range", side: 1, slot: 9, width: 50, minimum: 0, maximum: 933 },
      { type: "eliminate-side", side: 2 },
    ],
  },
  defeat: { type: "any-unit-removed", side: 1, slots: [0, 9] },
  victoryText: "護送「多莉」抵達死亡之谷頂端，或擊退全部敵軍",
  defeatText: "「妮雅」或「多莉」戰敗",
  victoryStatusText: "多莉已登上飛船，或谷中敵軍已全數離場。",
};
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("護送「多莉」到達目地")
  || !originalObjectiveText.includes("「妮雅」戰敗")
  || !originalObjectiveText.includes("「多莉」戰敗")) {
  throw new Error("SAY/0110 objective wording changed");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 9 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 110) {
  throw new Error(`stage 9 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "找尋傳說中的飛船") throw new Error(`stage 9 title changed: ${titleText}`);
if (nextTitleText !== "拯救蘇蘭達") throw new Error(`stage 11 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 9,
  "stage 9 event handler",
);
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [22], actions: [] },
  { trigger: "live victory 999", sayRecords: [23], actions: [] },
], "stage 9 event program");
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 27,
  nextStage: 11,
  presentationReplayed: false,
}, "stage 9 completed route");
const storyEntry = requireEntry(
  eventsDocument.module25CampaignStory.stageStoryRecords,
  ({ stage }) => stage === 9,
  "stage 9 module 25 story entry",
);
if (storyEntry.record !== null) throw new Error(`stage 9 unexpectedly gained module 25 story ${storyEntry.record}`);

const escortRoute = {
  actorId: "1:9",
  movement: behavior12Document.stage9.movementOverride,
  width: 50,
  waypoints: behavior12Document.stage9.waypointThresholds.slice(0, 3).map((entry) => ({
    actorCellAtLeast: entry.actorCellAtLeast,
    goal: { x: entry.goalCell % 50, y: Math.floor(entry.goalCell / 50) },
  })),
  victoryMaximumCell: 933,
  stableRemakeDecision: "REMAKE-040",
};
assertEqual(escortRoute, {
  actorId: "1:9",
  movement: 7,
  width: 50,
  waypoints: [
    { actorCellAtLeast: 1316, goal: { x: 16, y: 25 } },
    { actorCellAtLeast: 1184, goal: { x: 34, y: 22 } },
    { actorCellAtLeast: 934, goal: { x: 34, y: 17 } },
  ],
  victoryMaximumCell: 933,
  stableRemakeDecision: "REMAKE-040",
}, "stage 9 escort route");

const musicEntry = (table, stage) => requireEntry(
  musicDocument.stageTables[table].entries,
  (entry) => entry.stage === stage,
  `${table} stage ${stage} music`,
);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase", 9)),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase", 9)),
};
assertEqual(musicRecords, { player: { entry: 39, loop: 38 }, enemy: { entry: 5, loop: 4 } }, "stage 9 music");

const portraitSpeakers = { 13: "多莉", 46: "妮雅" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}
const storyPages = {
  "stage-09-opening-story": compileStory(parseInput("openingStory"), 22),
  "stage-09-victory-story": compileStory(parseInput("victoryStory"), 23),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [5, 3], "stage 9 story waits");

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
identityHash.update("stableRemake\0REMAKE-039\0REMAKE-040\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-09/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage9-runtime.mjs from stage 9 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE9_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE9_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE9_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE9_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE9_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE9_TITLE = ${json(titleText)};\n`
  + `export const STAGE9_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE9_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE9_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE9_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE9_FIXED_CLASS_OVERRIDES = ${json(fixedClassOverrides)} as const;\n`
  + `export const STAGE9_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE9_ESCORT_ROUTE = ${json(escortRoute)} as const;\n`
  + `export const STAGE9_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE9_EVENT_PROGRAM = ${json({ openingStoryRecord: 22, victoryStoryRecord: 23, completedRoute: { module: 27, stage: 11, replayPresentation: false }, stableRemakeDecisions: ["REMAKE-039", "REMAKE-040"] })} as const;\n`
  + `export const STAGE9_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-09-opening-story" | "stage-09-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage9-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage9-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 9 maps and music with identity ${contentIdentity}`);
