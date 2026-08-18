#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";
import { assertIdenticalImage, removeDuplicateImage } from "./lib/shared-image-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage1-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");

const inputPaths = {
  template: reversePath("decoded/B/0003/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  inputUi: reversePath("parsed/native/input-ui.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  presentations: reversePath("parsed/native/stage-presentations.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0120.json"),
  objectiveText: reversePath("parsed/dialogue/0098.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  prebattleStory: reversePath("parsed/dialogue/0004.json"),
  openingStory: reversePath("parsed/dialogue/0005.json"),
  victoryStory: reversePath("parsed/dialogue/0006.json"),
  map: reversePath("renders/battle-maps/confirmed/01.png"),
  minimap: reversePath("renders/battle-maps/minimap/01.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0072.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0011.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0010.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0027.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0026.wav"),
  storyBackground: reversePath("renders/planar/BK/0001/00.png"),
  allyMagician: reversePath("renders/planar/A/0002/06.png"),
  enemySisterColor: reversePath("renders/planar/A/0003/24.png"),
  enemySisterMask: reversePath("renders/planar/A/0002/24.png"),
  portraitGetilas: reversePath("renders/planar/D/0000/00.png"),
  portraitMengxinman: reversePath("renders/planar/D/0042/00.png"),
  portraitDaisy: reversePath("renders/planar/D/0043/00.png"),
  portraitLadonna: reversePath("renders/planar/D/0044/00.png"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const encode = (bytes) => Buffer.from(bytes).toString("base64");
const json = (value) => JSON.stringify(value);

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed:\nexpected ${JSON.stringify(expected)}\nreceived ${JSON.stringify(actual)}`);
  }
}

function requireEntry(entries, predicate, label) {
  const entry = entries.find(predicate);
  if (!entry) throw new Error(`missing ${label}`);
  return entry;
}

const inputBuffers = Object.fromEntries(
  await Promise.all(Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)])),
);
const parseInput = (id) => JSON.parse(inputBuffers[id].toString("utf8"));

const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const inputUi = parseInput("inputUi");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const presentationsDocument = parseInput("presentations");
const musicDocument = parseInput("music");
const titleDocument = parseInput("title");
const objectiveTextDocument = parseInput("objectiveText");
const storyDocuments = {
  "stage-01-prebattle-story": parseInput("prebattleStory"),
  "stage-01-opening-story": parseInput("openingStory"),
  "stage-01-victory-story": parseInput("victoryStory"),
};

const template = inputBuffers.template;
if (template.length !== 8506) throw new Error(`B/0003 length changed: ${template.length}`);
const templateHash = sha256(template);
if (templateHash !== "04b7a61948b5de57b76938cbf7e4e075f622fdb77d48b8e599439e56a0e6b093") {
  throw new Error(`B/0003 hash changed: ${templateHash}`);
}

const stageTemplate = requireEntry(battleTemplates.stages, (entry) => entry.stage === 1, "stage 1 battle template");
if (stageTemplate.sha256 !== templateHash || stageTemplate.bRecord !== 3) {
  throw new Error("stage 1 battle-template source identity changed");
}
const stageTerrain = requireEntry(terrainDocument.stages, (entry) => entry.stage === 1, "stage 1 terrain mapping");
if (stageTerrain.bRecord !== 3 || stageTerrain.terrainTokenMapSha256 !== stageTemplate.sectionSha256.terrainTokenMap) {
  throw new Error("stage 1 terrain mapping no longer matches B/0003");
}

const deployment = stageTemplate.deployment;
const lifecycleDeployment = requireEntry(lifecycle.deployment.stages, (entry) => entry.stage === 1, "stage 1 deployment lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 4, 24, 40, 41, 42, 43],
  fixedSlots: [42, 40, 43, 41, 0],
  optionalSlots: [1, 2, 4, 24],
  openCells: [{ x: 21, y: 33 }, { x: 23, y: 33 }, { x: 25, y: 33 }],
  maximumUnits: 8,
};
assertEqual(deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "eligible deployment slots");
assertEqual(deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "fixed deployment slots");
assertEqual(deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "optional deployment slots");
assertEqual(deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "open deployment cells");
if (deployment.maximumPlayerUnitCount !== expectedDeployment.maximumUnits) {
  throw new Error("stage 1 deployment capacity changed");
}
assertEqual(lifecycleDeployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "lifecycle eligible slots");
assertEqual(lifecycleDeployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "lifecycle fixed slots");
assertEqual(lifecycleDeployment.optionalUnitSlots, expectedDeployment.optionalSlots, "lifecycle optional slots");
assertEqual(lifecycleDeployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "lifecycle open cells");

const fixedPlacements = expectedDeployment.fixedSlots.map((slot) => {
  const instance = requireEntry(
    stageTemplate.activeUnitInstances,
    (unit) => unit.side === 1 && unit.unitSlot === slot,
    `fixed side 1 slot ${slot}`,
  );
  return { slot, position: { x: instance.x, y: instance.y } };
});
assertEqual(fixedPlacements, [
  { slot: 42, position: { x: 19, y: 33 } },
  { slot: 40, position: { x: 27, y: 33 } },
  { slot: 43, position: { x: 19, y: 34 } },
  { slot: 41, position: { x: 27, y: 34 } },
  { slot: 0, position: { x: 22, y: 36 } },
], "fixed player placements");

const enemyUnits = stageTemplate.activeUnitInstances
  .filter((unit) => unit.side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    className: unit.className,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
  }));
assertEqual(enemyUnits.map(({ slot, nativeClassRecord, position, aiBehavior }) => ({ slot, nativeClassRecord, position, aiBehavior })), [
  { slot: 40, nativeClassRecord: 0, position: { x: 22, y: 14 }, aiBehavior: 2 },
  { slot: 41, nativeClassRecord: 0, position: { x: 28, y: 14 }, aiBehavior: 2 },
  { slot: 43, nativeClassRecord: 24, position: { x: 23, y: 16 }, aiBehavior: 2 },
  { slot: 16, nativeClassRecord: 22, position: { x: 25, y: 16 }, aiBehavior: 1 },
  { slot: 42, nativeClassRecord: 24, position: { x: 27, y: 16 }, aiBehavior: 2 },
  { slot: 45, nativeClassRecord: 0, position: { x: 24, y: 18 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 0, position: { x: 26, y: 18 }, aiBehavior: 0 },
], "stage 1 enemy roster");

const playerClassOverrides = stageTemplate.classArrays.side1SparseOverrides
  .flatMap((nativeClassRecord, slot) => nativeClassRecord === 0 ? [] : [{ slot, nativeClassRecord }]);
assertEqual(playerClassOverrides, [{ slot: 24, nativeClassRecord: 6 }], "stage 1 player class overrides");

// REMAKE-051: the named boss is whichever enemy actor the machine victory slot
// resolves to. Deriving it here keeps the objective text, the board unit and the
// portrait from drifting apart the way the guessed SAY record let them.
const bossActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 16,
  "stage 1 enemy boss actor",
);
assertEqual({ name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord }, {
  name: "娜米", portraitRecord: 20,
}, "stage 1 boss identity");
const generatedBoss = { slot: 16, name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord };

const objective = requireEntry(objectives.normalStageObjectives, (entry) => entry.stage === 1, "stage 1 objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: objective.victory.side, slot: objective.victory.unitSlot },
  defeat: { type: "unit-removed", side: objective.defeat.side, slot: objective.defeat.unitSlot },
  victoryText: `打敗敵將領「${bossActor.normalizedName}」`,
  defeatText: "「妮雅」戰敗",
  victoryStatusText: `敵將領「${bossActor.normalizedName}」已被擊倒。`,
};
assertEqual(generatedObjective.victory, { type: "unit-removed", side: 2, slot: 16 }, "stage 1 victory condition");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 0 }, "stage 1 defeat condition");
const objectiveSourceText = objectiveTextDocument.actions.filter(({ op }) => op === "text").map(({ text }) => text);
if (!objectiveSourceText.some((text) => text.includes("打敗敵將領"))
  || !objectiveSourceText.some((text) => text.includes("娜米"))
  // SAY/0098 prints the defeat line as 「妮雅 」戰敗, so match the name and the
  // verdict separately instead of the closing bracket run.
  || !objectiveSourceText.some((text) => text.includes("妮雅") && text.includes("戰敗"))) {
  throw new Error("SAY/0098 no longer contains the stage 1 objective text");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 1 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 98) {
  throw new Error(`stage 1 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}

const titleText = titleDocument.actions
  .filter(({ op }) => op === "text")
  .map(({ text }) => text)
  .join("")
  .replace(/[\t$]/gu, "")
  .trim();
if (titleText !== "騎士城堡前") throw new Error(`stage 1 title changed: ${titleText}`);

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  (entry) => entry.stage === 1,
  "stage 1 event handler",
);
if (handler.handler !== "1000:43A3") throw new Error("stage 1 event handler address changed");
assertEqual(handler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [5] },
  { trigger: "live victory 999", sayRecords: [6] },
], "stage 1 event triggers");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 27,
  nextStage: 2,
  presentationReplayed: false,
}, "stage 1 completed route");

const timeline = requireEntry(
  presentationsDocument.dynamicSceneTimelines,
  (entry) => entry.stage === 1,
  "stage 1 presentation timeline",
);
const victoryTimeline = requireEntry(timeline.events, (entry) => entry.trigger === "live victory 999", "stage 1 victory presentation");
const messengerMove = requireEntry(victoryTimeline.steps, (entry) => entry.op === "scriptedMove", "stage 1 messenger move");
const eventProgram = {
  openingStoryRecord: 5,
  messenger: {
    side: messengerMove.side,
    slot: messengerMove.unitSlot,
    from: { x: messengerMove.from.x, y: messengerMove.from.y },
    targetPortrait: 46,
    movementMode: messengerMove.rangeSetup.propagationMode,
    movementBudget: messengerMove.rangeSetup.budget,
    storyRecord: 6,
  },
  completedRoute: { module: 27, stage: 2, replayPresentation: false },
};
assertEqual(eventProgram.messenger, {
  side: 1,
  slot: 48,
  from: { x: 35, y: 35 },
  targetPortrait: 46,
  movementMode: "FM",
  movementBudget: 50,
  storyRecord: 6,
}, "stage 1 messenger program");

const playerMusic = requireEntry(musicDocument.stageTables.playerPhase.entries, (entry) => entry.stage === 1 && entry.reachable, "stage 1 player music");
const enemyMusic = requireEntry(musicDocument.stageTables.enemyPhase.entries, (entry) => entry.stage === 1 && entry.reachable, "stage 1 enemy music");
const storyMusic = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, (entry) => entry.stage === 1 && entry.selected, "stage 1 story music");
const storyRecord = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, (entry) => entry.stage === 1, "stage 1 prebattle story record");
const musicRecords = {
  story: storyMusic.magicRecord,
  player: { entry: playerMusic.entryRecord, loop: playerMusic.loopRecord },
  enemy: { entry: enemyMusic.entryRecord, loop: enemyMusic.loopRecord },
};
assertEqual(musicRecords, {
  story: 72,
  player: { entry: 11, loop: 10 },
  enemy: { entry: 27, loop: 26 },
}, "stage 1 music records");
if (storyRecord.record !== 4) throw new Error("stage 1 prebattle story record changed");

const deploymentUi = {
  columns: inputUi.deployment.navigation.columns,
  feedbackText: lifecycle.deployment.nativeUiStrings,
};
assertEqual(deploymentUi.columns.map(({ pointerX, rows }) => ({ pointerX, rows })), [
  { pointerX: 57, rows: [59, 119, 179, 239, 299] },
  { pointerX: 201, rows: [59, 119, 179, 239, 299] },
  { pointerX: 345, rows: [59, 119, 179, 239, 299] },
  { pointerX: 440, rows: [35, 65, 95] },
  { pointerX: 540, rows: [35] },
], "stage 1 deployment focus columns");

const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = requireEntry(
    campaignRoster.displayResolution.actors,
    (entry) => entry.slot === slot,
    `campaign roster actor ${slot}`,
  );
  return {
    slot,
    portraitRecord: actor.portraitRecord,
    normalizedName: actor.normalizedName,
  };
});
assertEqual(deploymentActors, [
  { slot: 0, portraitRecord: 46, normalizedName: "妮雅" },
  { slot: 1, portraitRecord: 45, normalizedName: "希蜜" },
  { slot: 2, portraitRecord: 42, normalizedName: "蒙欣曼" },
  { slot: 4, portraitRecord: 44, normalizedName: "拉朵那" },
  { slot: 24, portraitRecord: 0, normalizedName: "葛蒂拉斯" },
  { slot: 40, portraitRecord: 255, normalizedName: "xxxx18" },
  { slot: 41, portraitRecord: 255, normalizedName: "xxxx19" },
  { slot: 42, portraitRecord: 255, normalizedName: "xxxx20" },
  { slot: 43, portraitRecord: 255, normalizedName: "xxxx21" },
], "stage 1 deployment actor descriptors");

const portraitSpeakers = {
  42: "蒙欣曼",
  43: "黛西",
  45: "希蜜",
  46: "妮雅",
  47: "士兵",
};

function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}

const storyRecords = {
  "stage-01-prebattle-story": 4,
  "stage-01-opening-story": 5,
  "stage-01-victory-story": 6,
};
const storyPages = Object.fromEntries(Object.entries(storyDocuments).map(([id, document]) => [
  id,
  compileStory(document, storyRecords[id]),
]));
assertEqual(Object.values(storyPages).map((pages) => pages.length), [13, 5, 12], "stage 1 story wait counts");

const terrain = template.subarray(256, 2756);
if (terrain.length !== 2500) throw new Error(`stage 1 terrain length changed: ${terrain.length}`);
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
const contentIdentity = `stage-01/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage1-runtime.mjs from stage 1 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE1_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE1_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE1_SECTION_SHA256 = ${json(stageTemplate.sectionSha256)} as const;\n`
  + `export const STAGE1_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE1_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE1_TITLE = ${json(titleText)};\n`
  + `export const STAGE1_BOSS = ${json(generatedBoss)} as const;\n`
  + `export const STAGE1_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE1_DEPLOYMENT = ${json({
    kind: "interactive",
    eligibleSlots: expectedDeployment.eligibleSlots,
    fixedPlacements,
    optionalSlots: expectedDeployment.optionalSlots,
    openCells: expectedDeployment.openCells,
    maximumUnits: expectedDeployment.maximumUnits,
  })} as const;\n`
  + `export const STAGE1_DEPLOYMENT_UI = ${json(deploymentUi)} as const;\n`
  + `export const STAGE1_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE1_PLAYER_CLASS_OVERRIDES = ${json(playerClassOverrides)} as const;\n`
  + `export const STAGE1_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE1_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE1_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE1_STORY_PRESENTATION = ${json({ prebattleBackgroundId: 1 })} as const;\n`
  + `export const STAGE1_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-01-prebattle-story" | "stage-01-opening-story" | "stage-01-victory-story",\n`
  + `  readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage1-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage1-minimap.png")),
  assertIdenticalImage(inputPaths.storyBackground, reversePath("renders/planar/BK/0001/00.png"), "stage 1 story background"),
  removeDuplicateImage(path.join(publicAssetPath, "story-stage1-background.png")),
  copyFile(inputPaths.allyMagician, path.join(publicAssetPath, "unit-ally-magician.png")),
  copyFile(inputPaths.portraitGetilas, path.join(publicAssetPath, "portrait-0.png")),
  copyFile(inputPaths.portraitMengxinman, path.join(publicAssetPath, "portrait-42.png")),
  copyFile(inputPaths.portraitDaisy, path.join(publicAssetPath, "portrait-43.png")),
  copyFile(inputPaths.portraitLadonna, path.join(publicAssetPath, "portrait-44.png")),
]);

execFileSync("magick", [
  "-define", "png:exclude-chunk=date,time",
  inputPaths.enemySisterColor,
  "(", inputPaths.enemySisterMask, "-alpha", "extract", ")",
  "-alpha", "off",
  "-compose", "CopyOpacity",
  "-composite",
  path.join(publicAssetPath, "unit-enemy-sister.png"),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${terrain.length} terrain cells, ${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 1 map assets with content identity ${contentIdentity}`);
