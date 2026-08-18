#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage3-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");

const inputPaths = {
  template: reversePath("decoded/B/0007/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0121.json"),
  objectiveText: reversePath("parsed/dialogue/0106.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  openingStory: reversePath("parsed/dialogue/0012.json"),
  victoryStory: reversePath("parsed/dialogue/0013.json"),
  map: reversePath("renders/battle-maps/confirmed/03.png"),
  minimap: reversePath("renders/battle-maps/minimap/03.png"),
  enemyMonkColor: reversePath("renders/planar/A/0003/25.png"),
  enemyMonkMask: reversePath("renders/planar/A/0002/25.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0009.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0008.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0037.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0036.wav"),
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
const template = inputBuffers.template;
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");
const titleDocument = parseInput("title");
const objectiveTextDocument = parseInput("objectiveText");

if (template.length !== 8506) throw new Error(`B/0007 length changed: ${template.length}`);
const templateHash = sha256(template);
if (templateHash !== "78551b1366721f8c7668299c21d41342c513b93c78628df7fc8f951eb9b35efa") {
  throw new Error(`B/0007 hash changed: ${templateHash}`);
}

const stageTemplate = requireEntry(battleTemplates.stages, ({ stage }) => stage === 3, "stage 3 battle template");
if (stageTemplate.bRecord !== 7 || stageTemplate.sha256 !== templateHash) {
  throw new Error("stage 3 battle-template source identity changed");
}
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 3, "stage 3 terrain mapping");
if (stageTerrain.bRecord !== 7 || stageTerrain.terrainTokenMapSha256 !== stageTemplate.sectionSha256.terrainTokenMap) {
  throw new Error("stage 3 terrain mapping no longer matches B/0007");
}

const compactUnit = (unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
});
const alliedUnits = stageTemplate.activeUnitInstances.filter(({ side }) => side === 1).map(compactUnit);
const enemyUnits = stageTemplate.activeUnitInstances.filter(({ side }) => side === 2).map(compactUnit);
assertEqual(alliedUnits, [
  { slot: 21, nativeClassRecord: null, position: { x: 30, y: 15 }, aiBehavior: 4 },
  { slot: 46, nativeClassRecord: null, position: { x: 28, y: 16 }, aiBehavior: 2 },
  { slot: 45, nativeClassRecord: null, position: { x: 30, y: 16 }, aiBehavior: 2 },
  { slot: 47, nativeClassRecord: null, position: { x: 25, y: 17 }, aiBehavior: 2 },
  { slot: 3, nativeClassRecord: null, position: { x: 28, y: 18 }, aiBehavior: 3 },
  { slot: 20, nativeClassRecord: null, position: { x: 31, y: 18 }, aiBehavior: 4 },
  { slot: 50, nativeClassRecord: null, position: { x: 33, y: 18 }, aiBehavior: 2 },
  { slot: 54, nativeClassRecord: null, position: { x: 18, y: 34 }, aiBehavior: 0 },
  { slot: 53, nativeClassRecord: null, position: { x: 19, y: 34 }, aiBehavior: 0 },
  { slot: 52, nativeClassRecord: null, position: { x: 20, y: 34 }, aiBehavior: 0 },
  { slot: 51, nativeClassRecord: null, position: { x: 21, y: 34 }, aiBehavior: 0 },
  { slot: 1, nativeClassRecord: null, position: { x: 16, y: 36 }, aiBehavior: 0 },
  { slot: 4, nativeClassRecord: null, position: { x: 18, y: 36 }, aiBehavior: 0 },
], "stage 3 allied roster");
assertEqual(enemyUnits, [
  { slot: 42, nativeClassRecord: 0, position: { x: 24, y: 13 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 0, position: { x: 27, y: 13 }, aiBehavior: 0 },
  { slot: 40, nativeClassRecord: 0, position: { x: 30, y: 13 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 24, position: { x: 20, y: 14 }, aiBehavior: 0 },
  { slot: 17, nativeClassRecord: 25, position: { x: 18, y: 15 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 0, position: { x: 23, y: 18 }, aiBehavior: 0 },
  { slot: 45, nativeClassRecord: 0, position: { x: 26, y: 20 }, aiBehavior: 0 },
  { slot: 47, nativeClassRecord: 0, position: { x: 33, y: 20 }, aiBehavior: 0 },
  { slot: 46, nativeClassRecord: 0, position: { x: 32, y: 22 }, aiBehavior: 0 },
  { slot: 50, nativeClassRecord: 22, position: { x: 32, y: 27 }, aiBehavior: 0 },
  { slot: 48, nativeClassRecord: 0, position: { x: 23, y: 28 }, aiBehavior: 0 },
  { slot: 49, nativeClassRecord: 0, position: { x: 31, y: 30 }, aiBehavior: 0 },
], "stage 3 enemy roster");

const actorSlots = new Set(alliedUnits.map(({ slot }) => slot));
const alliedActors = campaignRoster.displayResolution.actors
  .filter(({ slot }) => actorSlots.has(slot))
  .map(({ slot, portraitRecord, normalizedName }) => ({ slot, portraitRecord, normalizedName }));
if (alliedActors.length !== alliedUnits.length) throw new Error("stage 3 actor descriptor count changed");

// REMAKE-051: the named boss is whichever enemy actor the machine victory slot
// resolves to. Deriving it here keeps the objective text, the board unit and the
// portrait from drifting apart the way the guessed SAY record let them.
const bossActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 17,
  "stage 3 enemy boss actor",
);
assertEqual({ name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord }, {
  name: "梅蒂", portraitRecord: 16,
}, "stage 3 boss identity");
const generatedBoss = { slot: 17, name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord };

const objective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 3, "stage 3 objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: objective.victory.side, slot: objective.victory.unitSlot },
  defeat: { type: "any-unit-removed", side: objective.defeat.side, slots: objective.defeat.unitSlots },
  victoryText: `打敗敵將領「${bossActor.normalizedName}」`,
  defeatText: "「希蜜」或「黛西」戰敗",
  victoryStatusText: `敵將領「${bossActor.normalizedName}」已被擊倒。`,
};
assertEqual(generatedObjective.victory, { type: "unit-removed", side: 2, slot: 17 }, "stage 3 victory condition");
assertEqual(generatedObjective.defeat, { type: "any-unit-removed", side: 1, slots: [1, 3] }, "stage 3 defeat condition");
const objectiveText = objectiveTextDocument.actions.filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!objectiveText.includes("打敗敵將領「梅蒂")
  || !objectiveText.includes("黛西") || !objectiveText.includes("希蜜")) {
  throw new Error("SAY/0106 no longer contains the stage 3 objective text");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 3 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 106) {
  throw new Error(`stage 3 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}

const titleText = titleDocument.actions.filter(({ op }) => op === "text").map(({ text }) => text)
  .join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "救援友軍") throw new Error(`stage 3 title changed: ${titleText}`);

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 3,
  "stage 3 event handler",
);
if (handler.handler !== "1000:4497") throw new Error("stage 3 event handler address changed");
assertEqual(handler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [12] },
  { trigger: "live victory 999", sayRecords: [13] },
], "stage 3 event triggers");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 25,
  nextStage: 4,
  presentationReplayed: false,
}, "stage 3 completed route");

const playerMusic = requireEntry(musicDocument.stageTables.playerPhase.entries, ({ stage, reachable }) => stage === 3 && reachable, "stage 3 player music");
const enemyMusic = requireEntry(musicDocument.stageTables.enemyPhase.entries, ({ stage, reachable }) => stage === 3 && reachable, "stage 3 enemy music");
const musicRecords = {
  player: { entry: playerMusic.entryRecord, loop: playerMusic.loopRecord },
  enemy: { entry: enemyMusic.entryRecord, loop: enemyMusic.loopRecord },
};
assertEqual(musicRecords, {
  player: { entry: 9, loop: 8 },
  enemy: { entry: 37, loop: 36 },
}, "stage 3 music records");

const portraitSpeakers = { 43: "黛西", 44: "拉朵那", 45: "希蜜", 47: "士兵" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}

const storyPages = {
  "stage-03-opening-story": compileStory(parseInput("openingStory"), 12),
  "stage-03-victory-story": compileStory(parseInput("victoryStory"), 13),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [3, 7], "stage 3 story wait counts");

const terrain = template.subarray(256, 2756);
if (terrain.length !== 2500) throw new Error(`stage 3 terrain length changed: ${terrain.length}`);
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
const contentIdentity = `stage-03/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 12,
  victoryStoryRecord: 13,
  completedRoute: { module: 25, stage: 4, replayPresentation: false },
};

const generatedSource = `// Generated by scripts/generate-stage3-runtime.mjs from stage 3 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE3_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE3_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE3_SECTION_SHA256 = ${json(stageTemplate.sectionSha256)} as const;\n`
  + `export const STAGE3_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE3_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE3_TITLE = ${json(titleText)};\n`
  + `export const STAGE3_BOSS = ${json(generatedBoss)} as const;\n`
  + `export const STAGE3_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE3_DEPLOYMENT = { kind: "fixed" } as const;\n`
  + `export const STAGE3_ALLIED_ACTORS = ${json(alliedActors)} as const;\n`
  + `export const STAGE3_ALLIED_UNITS = ${json(alliedUnits)} as const;\n`
  + `export const STAGE3_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE3_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE3_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE3_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-03-opening-story" | "stage-03-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage3-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage3-minimap.png")),
]);

execFileSync("magick", [
  "-define", "png:exclude-chunk=date,time",
  inputPaths.enemyMonkColor,
  "(", inputPaths.enemyMonkMask, "-alpha", "extract", ")",
  "-alpha", "off",
  "-compose", "CopyOpacity",
  "-composite",
  path.join(publicAssetPath, "unit-enemy-monk.png"),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${terrain.length} terrain cells, ${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 3 map assets with content identity ${contentIdentity}`);
