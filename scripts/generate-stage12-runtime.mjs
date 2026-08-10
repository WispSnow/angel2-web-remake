#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage12-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0025/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0130.json"),
  nextTitle: reversePath("parsed/dialogue/0131.json"),
  objectiveText: reversePath("parsed/dialogue/0095.json"),
  prebattleStory: reversePath("parsed/dialogue/0029.json"),
  openingStory: reversePath("parsed/dialogue/0030.json"),
  victoryStory: reversePath("parsed/dialogue/0031.json"),
  map: reversePath("renders/battle-maps/confirmed/12.png"),
  minimap: reversePath("renders/battle-maps/minimap/12.png"),
  storyBackground10: reversePath("renders/planar/BK/0010/00.png"),
  storyBackground11: reversePath("renders/planar/BK/0011/00.png"),
  storyBackground12: reversePath("renders/planar/BK/0012/00.png"),
  storyBackground13: reversePath("renders/planar/BK/0013/00.png"),
  storyBackground14: reversePath("renders/planar/BK/0014/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0076.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0009.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0008.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0025 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "8b97b5d650ec9ed6adb0d22e031ea431bf65a2332e3ef7f36f86c69456c5f63e") {
  throw new Error(`B/0025 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 12, "stage 12 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 12, "stage 12 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 12, "stage 12 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 22, y: 18 }, { x: 24, y: 18 }, { x: 20, y: 19 }, { x: 26, y: 19 },
    { x: 20, y: 21 }, { x: 26, y: 21 }, { x: 22, y: 22 }, { x: 24, y: 22 },
  ],
  maximumUnits: 9,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 12 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 12 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 12 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 12 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 12 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 23, y: 20 } }];

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
}));
assertEqual(enemyUnits, [
  { slot: 40, nativeClassRecord: 26, position: { x: 39, y: 17 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 26, position: { x: 39, y: 20 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 26, position: { x: 39, y: 23 }, aiBehavior: 0 },
  { slot: 44, nativeClassRecord: 26, position: { x: 39, y: 26 }, aiBehavior: 0 },
  { slot: 43, nativeClassRecord: 26, position: { x: 39, y: 28 }, aiBehavior: 0 },
], "stage 12 enemies");
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 12 side-1 class overrides");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 12, "stage 12 objective");
assertEqual({ victory: nativeObjective.victory.kind, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "all_side2_units_absent", defeat: 0,
}, "stage 12 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊退全部水戰士",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "沼澤中的水戰士已全數離場。",
};
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const originalObjectiveText = dialogueText("objectiveText");
if (!originalObjectiveText.includes("攻擊瓦爾克麗城") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0095 objective conflict changed");
}
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "落入沼澤") throw new Error(`stage 12 title changed: ${titleText}`);
if (nextTitleText !== "龍塔外") throw new Error(`stage 13 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 12, "stage 12 event handler");
assertEqual(stageHandler.events, [
  { trigger: "round 1", sayRecords: [30], actions: [] },
  { trigger: "live victory 999", sayRecords: [31], actions: [] },
], "stage 12 event program");
assertEqual(stageHandler.classification, "dialogue only", "stage 12 event classification");
assertEqual(stageHandler.nativeSignals.specialCallCounts, {}, "stage 12 special event calls");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 12)) {
  throw new Error("stage 12 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(12)) {
  throw new Error("stage 12 unexpectedly entered the dynamic-board stage catalog");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: ["initial-template", "round-event-handler", "dynamic-board-catalog", "full-round-special-chain"],
};
const dynamicInstances = {
  kind: "water-warrior-split",
  rootSlots: [40, 41, 42, 44, 43],
  maximumBodiesPerRoot: 4,
  sharedLife: true,
  stageReinforcement: false,
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25, nextStage: 13, presentationReplayed: false,
}, "stage 12 completed route");
const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 12, "stage 12 module 25 story");
if (storyEntry.record !== 29) throw new Error(`stage 12 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage }) => stage === 12, "stage 12 story music");
if (storyMusicEntry.magicRecord !== 76) throw new Error(`stage 12 story music changed: ${storyMusicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 12, `${table} stage 12 music`);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 9, loop: 8 }, enemy: { entry: 25, loop: 24 } }, "stage 12 music");

const portraitSpeakers = { 0: "葛蒂拉斯", 10: "蘇蘭達", 13: "多莉", 42: "蒙欣曼", 45: "希蜜", 46: "妮雅" };
function compileStory(document, record) {
  const windows = { upper: { open: false, text: "", portrait: undefined }, lower: { open: false, text: "", portrait: undefined } };
  let activeSlot;
  let backgroundId;
  let wait = 0;
  const pages = [];
  for (const action of document.actions) {
    if (action.op === "set_background") backgroundId = action.backgroundId;
    else if (action.op === "show_portrait") windows[action.slot].portrait = action.portraitId;
    else if (action.op === "hide_portrait") windows[action.slot].portrait = undefined;
    else if (action.op === "open_window") {
      windows[action.slot].open = true;
      if (action.replaceText) windows[action.slot].text = "";
      activeSlot = action.slot;
    } else if (action.op === "close_window") windows[action.slot].open = false;
    else if (action.op === "text") { windows[action.slot].text += action.text; activeSlot = action.slot; }
    else if (action.op === "line_break") {
      if (!activeSlot) throw new Error(`SAY/${record} line break has no active window`);
      windows[activeSlot].text += "\n";
    } else if (action.op === "wait_for_input") {
      wait += 1;
      const page = { activeSlot, source: { record, wait, address: `SAY/${String(record).padStart(4, "0")}:${action.line}`, ...(backgroundId === undefined ? {} : { backgroundId }) } };
      for (const slot of ["upper", "lower"]) {
        const state = windows[slot];
        if (!state.open) continue;
        page[slot] = { text: state.text, ...(state.portrait === undefined ? {} : { portrait: state.portrait, speaker: portraitSpeakers[state.portrait] }) };
      }
      pages.push(page);
    }
  }
  return pages;
}
const storyPages = {
  "stage-12-prebattle-story": compileStory(parseInput("prebattleStory"), 29),
  "stage-12-opening-story": compileStory(parseInput("openingStory"), 30),
  "stage-12-victory-story": compileStory(parseInput("victoryStory"), 31),
};
assertEqual(storyPages["stage-12-prebattle-story"].length, 11, "stage 12 prebattle waits");
assertEqual(storyPages["stage-12-opening-story"].length, 6, "stage 12 opening waits");
assertEqual(storyPages["stage-12-victory-story"].length, 6, "stage 12 victory waits");
assertEqual([...new Set(storyPages["stage-12-prebattle-story"].map(({ source }) => source.backgroundId))], [10, 11, 12, 13], "stage 12 prebattle backgrounds");
assertEqual([...new Set(storyPages["stage-12-opening-story"].map(({ source }) => source.backgroundId))], [14], "stage 12 opening background");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({ id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length }));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-043\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-12/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage12-runtime.mjs from stage 12 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE12_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE12_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE12_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE12_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE12_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE12_TITLE = ${json(titleText)};\n`
  + `export const STAGE12_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE12_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE12_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE12_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE12_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE12_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE12_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 29, openingStoryRecord: 30, victoryStoryRecord: 31, enemyReinforcements, dynamicInstances, completedRoute: { module: 25, stage: 13, replayPresentation: false }, stableRemakeDecision: "REMAKE-043" })} as const;\n`
  + `export const STAGE12_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-12-prebattle-story" | "stage-12-opening-story" | "stage-12-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage12-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage12-minimap.png")),
  ...[10, 11, 12, 13, 14].map((record) => copyFile(
    inputPaths[`storyBackground${record}`],
    path.join(publicAssetPath, `story-stage12-background-${record}.png`),
  )),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage12.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage12-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage12-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage12-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage12-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 12 maps, backgrounds, and music with identity ${contentIdentity}`);
