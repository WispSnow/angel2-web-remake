#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage2-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");

const inputPaths = {
  template: reversePath("decoded/B/0005/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  // Stage 2 is the non-sequential title record SAY/0163. Do not infer battle
  // banners from 119 + native stage: that sequence resumes at stage 3.
  title: reversePath("parsed/dialogue/0163.json"),
  objectiveText: reversePath("parsed/dialogue/0172.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  openingStory: reversePath("parsed/dialogue/0155.json"),
  victoryStory: reversePath("parsed/dialogue/0175.json"),
  map: reversePath("renders/battle-maps/confirmed/02.png"),
  minimap: reversePath("renders/battle-maps/minimap/02.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
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

if (template.length !== 8506) throw new Error(`B/0005 length changed: ${template.length}`);
const templateHash = sha256(template);
if (templateHash !== "a44ccd58359e5192665622781fae282bd0653404df0900eef4c1cc6b11146fc9") {
  throw new Error(`B/0005 hash changed: ${templateHash}`);
}

const stageTemplate = requireEntry(battleTemplates.stages, ({ stage }) => stage === 2, "stage 2 battle template");
if (stageTemplate.bRecord !== 5 || stageTemplate.sha256 !== templateHash) {
  throw new Error("stage 2 battle-template source identity changed");
}
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 2, "stage 2 terrain mapping");
if (stageTerrain.bRecord !== 5 || stageTerrain.terrainTokenMapSha256 !== stageTemplate.sectionSha256.terrainTokenMap) {
  throw new Error("stage 2 terrain mapping no longer matches B/0005");
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
  { slot: 44, nativeClassRecord: null, position: { x: 22, y: 32 }, aiBehavior: 11 },
  { slot: 45, nativeClassRecord: null, position: { x: 28, y: 32 }, aiBehavior: 11 },
  { slot: 43, nativeClassRecord: null, position: { x: 20, y: 33 }, aiBehavior: 11 },
  { slot: 41, nativeClassRecord: null, position: { x: 23, y: 33 }, aiBehavior: 11 },
  { slot: 40, nativeClassRecord: null, position: { x: 27, y: 33 }, aiBehavior: 11 },
  { slot: 42, nativeClassRecord: null, position: { x: 29, y: 33 }, aiBehavior: 11 },
  { slot: 0, nativeClassRecord: null, position: { x: 21, y: 35 }, aiBehavior: 0 },
  { slot: 24, nativeClassRecord: 6, position: { x: 25, y: 35 }, aiBehavior: 0 },
  { slot: 2, nativeClassRecord: null, position: { x: 28, y: 35 }, aiBehavior: 0 },
], "stage 2 allied roster");
assertEqual(enemyUnits, [
  { slot: 47, nativeClassRecord: 22, position: { x: 19, y: 21 }, aiBehavior: 0 },
  { slot: 18, nativeClassRecord: 22, position: { x: 25, y: 21 }, aiBehavior: 2 },
  { slot: 46, nativeClassRecord: 22, position: { x: 30, y: 21 }, aiBehavior: 0 },
  { slot: 51, nativeClassRecord: 0, position: { x: 24, y: 23 }, aiBehavior: 2 },
  { slot: 50, nativeClassRecord: 0, position: { x: 26, y: 23 }, aiBehavior: 2 },
], "stage 2 enemy roster");

const actorSlots = new Set(alliedUnits.map(({ slot }) => slot));
const alliedActors = campaignRoster.displayResolution.actors
  .filter(({ slot }) => actorSlots.has(slot))
  .map(({ slot, portraitRecord, normalizedName }) => ({ slot, portraitRecord, normalizedName }));
if (alliedActors.length !== alliedUnits.length) throw new Error("stage 2 actor descriptor count changed");

// REMAKE-051: the named boss is whichever enemy actor the machine victory slot
// resolves to. Deriving it here keeps the objective text, the board unit and the
// portrait from drifting apart the way the guessed SAY record let them.
const bossActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 18,
  "stage 2 enemy boss actor",
);
assertEqual({ name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord }, {
  name: "萊莉", portraitRecord: 19,
}, "stage 2 boss identity");
const generatedBoss = { slot: 18, name: bossActor.normalizedName, portraitRecord: bossActor.portraitRecord };

const objective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 2, "stage 2 objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: objective.victory.side, slot: objective.victory.unitSlot },
  defeat: { type: "unit-removed", side: objective.defeat.side, slot: objective.defeat.unitSlot },
  victoryText: `打敗敵人首領「${bossActor.normalizedName}」`,
  defeatText: "「妮雅」戰敗",
  victoryStatusText: `敵人首領「${bossActor.normalizedName}」已被擊倒。`,
};
assertEqual(generatedObjective.victory, { type: "unit-removed", side: 2, slot: 18 }, "stage 2 victory condition");
assertEqual(generatedObjective.defeat, { type: "unit-removed", side: 1, slot: 0 }, "stage 2 defeat condition");
const objectiveText = objectiveTextDocument.actions.filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!objectiveText.includes("打敗敵人首領「萊莉」") || !objectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0172 no longer contains the stage 2 objective text");
}
// REMAKE-051: the victory-condition record comes from the module-29 `DS:1273`
// stage table, not from a stage-number formula. Lock the lookup so this stage
// cannot silently quote another stage's text again.
const objectiveRecordEntries = parseInput("storyPresentations")
  .globalReachabilityAudit.tables.alternate.entries
  .filter(({ key, enabled }) => key === 2 && enabled);
if (objectiveRecordEntries.length !== 1 || objectiveRecordEntries[0].dialogueRecord !== 172) {
  throw new Error(`stage 2 objective record changed: ${JSON.stringify(objectiveRecordEntries)}`);
}

const titleText = titleDocument.actions.filter(({ op }) => op === "text").map(({ text }) => text)
  .join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "攻打騎士堡") throw new Error(`stage 2 title changed: ${titleText}`);

const handler = requireEntry(
  eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 2,
  "stage 2 event handler",
);
if (handler.handler !== "1000:4443") throw new Error("stage 2 event handler address changed");
assertEqual(handler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [155] },
  { trigger: "live victory 999", sayRecords: [175] },
], "stage 2 event triggers");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 27,
  nextStage: 3,
  presentationReplayed: false,
}, "stage 2 completed route");

const playerMusic = requireEntry(musicDocument.stageTables.playerPhase.entries, ({ stage, reachable }) => stage === 2 && reachable, "stage 2 player music");
const enemyMusic = requireEntry(musicDocument.stageTables.enemyPhase.entries, ({ stage, reachable }) => stage === 2 && reachable, "stage 2 enemy music");
const musicRecords = {
  player: { entry: playerMusic.entryRecord, loop: playerMusic.loopRecord },
  enemy: { entry: enemyMusic.entryRecord, loop: enemyMusic.loopRecord },
};
assertEqual(musicRecords, {
  player: { entry: 29, loop: 28 },
  enemy: { entry: 37, loop: 36 },
}, "stage 2 music records");

const portraitSpeakers = { 46: "妮雅", 47: "士兵" };
function compileStory(document, record) {
  return compileNativeStory(document, record, portraitSpeakers);
}

const storyPages = {
  "stage-02-opening-story": compileStory(parseInput("openingStory"), 155),
  "stage-02-victory-story": compileStory(parseInput("victoryStory"), 175),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [1, 3], "stage 2 story wait counts");

const terrain = template.subarray(256, 2756);
if (terrain.length !== 2500) throw new Error(`stage 2 terrain length changed: ${terrain.length}`);
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
const contentIdentity = `stage-02/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  openingStoryRecord: 155,
  victoryStoryRecord: 175,
  completedRoute: { module: 27, stage: 3, replayPresentation: false },
};

const generatedSource = `// Generated by scripts/generate-stage2-runtime.mjs from stage 2 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE2_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE2_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE2_SECTION_SHA256 = ${json(stageTemplate.sectionSha256)} as const;\n`
  + `export const STAGE2_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE2_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE2_TITLE = ${json(titleText)};\n`
  + `export const STAGE2_BOSS = ${json(generatedBoss)} as const;\n`
  + `export const STAGE2_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE2_DEPLOYMENT = { kind: "fixed" } as const;\n`
  + `export const STAGE2_ALLIED_ACTORS = ${json(alliedActors)} as const;\n`
  + `export const STAGE2_ALLIED_UNITS = ${json(alliedUnits)} as const;\n`
  + `export const STAGE2_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE2_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE2_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE2_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-02-opening-story" | "stage-02-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage2-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage2-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage2-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage2-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage2-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage2-enemy-loop.wav")),
]);
