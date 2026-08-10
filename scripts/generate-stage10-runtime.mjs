#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage10-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0021/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  title: reversePath("parsed/dialogue/0129.json"),
  nextTitle: reversePath("parsed/dialogue/0130.json"),
  objectiveText: reversePath("parsed/dialogue/0094.json"),
  prebattleStory: reversePath("parsed/dialogue/0028.json"),
  map: reversePath("renders/battle-maps/confirmed/10.png"),
  minimap: reversePath("renders/battle-maps/minimap/10.png"),
  storyBackground10: reversePath("renders/planar/BK/0010/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0074.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0037.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0036.wav"),
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

if (templateBytes.length !== 8506) throw new Error(`B/0021 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "58e69295400e8d5d44f81d8402508877d18c973e180b0d0e037bb6cc0b141859") {
  throw new Error(`B/0021 hash changed: ${sha256(templateBytes)}`);
}

const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 10, "stage 10 template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 10, "stage 10 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 10, "stage 10 lifecycle");
const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  fixedSlots: [0],
  optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
  openCells: [
    { x: 25, y: 22 }, { x: 26, y: 22 }, { x: 27, y: 22 }, { x: 28, y: 22 },
    { x: 25, y: 23 }, { x: 26, y: 23 }, { x: 27, y: 23 }, { x: 28, y: 23 },
    { x: 25, y: 24 }, { x: 26, y: 24 }, { x: 27, y: 24 }, { x: 28, y: 24 },
  ],
  maximumUnits: 13,
};
assertEqual(template.deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 10 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 10 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 10 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 10 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, expectedDeployment.maximumUnits, "stage 10 capacity");
const fixedPlacements = [{ slot: 0, position: { x: 27, y: 29 } }];

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
const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => {
  const actor = unit.unitSlot === 20 ? enemyActorFor(20) : undefined;
  return {
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
    ...(actor ? { name: actor.normalizedName, portraitRecord: actor.portraitRecord } : {}),
  };
});
assertEqual(enemyUnits, [
  { slot: 43, nativeClassRecord: 23, position: { x: 22, y: 13 }, aiBehavior: 0 },
  { slot: 42, nativeClassRecord: 8, position: { x: 24, y: 13 }, aiBehavior: 0 },
  { slot: 20, nativeClassRecord: 8, position: { x: 26, y: 13 }, aiBehavior: 0, name: "克諾絲", portraitRecord: 4 },
  { slot: 40, nativeClassRecord: 23, position: { x: 28, y: 13 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 23, position: { x: 30, y: 13 }, aiBehavior: 0 },
], "stage 10 enemies");
assertEqual(template.classArrays.side1SparseOverrides.filter((value) => value !== 0), [], "stage 10 side-1 class overrides");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 10, "stage 10 objective");
assertEqual({ victory: nativeObjective.victory.kind, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "all_side2_units_absent", defeat: 0,
}, "stage 10 native objective");
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "擊退全部追兵",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "飛船上的追兵已全數離場。",
};
const originalObjectiveText = parseInput("objectiveText").actions
  .filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjectiveText.includes("回到瓦爾克麗城") || !originalObjectiveText.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0094 objective conflict changed");
}
const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "飛船上遭遇敵人") throw new Error(`stage 10 title changed: ${titleText}`);
if (nextTitleText !== "落入沼澤") throw new Error(`stage 12 title changed: ${nextTitleText}`);

const stageHandler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 10, "stage 10 event handler");
assertEqual(stageHandler.events, [], "stage 10 event program");
assertEqual(stageHandler.classification, "route only", "stage 10 event classification");
assertEqual(stageHandler.nativeSignals.specialCallCounts, {}, "stage 10 special event calls");
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 10)) {
  throw new Error("stage 10 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(10)) {
  throw new Error("stage 10 unexpectedly entered the dynamic-board stage catalog");
}
const enemyReinforcements = {
  kind: "none",
  auditedSources: ["initial-template", "round-event-handler", "full-round-special-chain"],
};
assertEqual(stageHandler.outcomeRouting.loadedVictory1000, {
  nextModule: 25, nextStage: 12, presentationReplayed: false,
}, "stage 10 completed route");
const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 10, "stage 10 module 25 story");
if (storyEntry.record !== 28) throw new Error(`stage 10 prebattle story changed: ${storyEntry.record}`);
const storyMusicEntry = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage }) => stage === 10, "stage 10 story music");
if (storyMusicEntry.magicRecord !== 74) throw new Error(`stage 10 story music changed: ${storyMusicEntry.magicRecord}`);

const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 10, `${table} stage 10 music`);
const musicRecords = {
  player: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("playerPhase")),
  enemy: (({ entryRecord, loopRecord }) => ({ entry: entryRecord, loop: loopRecord }))(musicEntry("enemyPhase")),
};
assertEqual(musicRecords, { player: { entry: 29, loop: 28 }, enemy: { entry: 37, loop: 36 } }, "stage 10 music");

const portraitSpeakers = { 10: "蘇蘭達", 13: "多莉", 45: "希蜜", 46: "妮雅" };
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
const storyPages = { "stage-10-prebattle-story": compileStory(parseInput("prebattleStory"), 28) };
assertEqual(storyPages["stage-10-prebattle-story"].length, 15, "stage 10 story waits");
assertEqual([...new Set(storyPages["stage-10-prebattle-story"].map(({ source }) => source.backgroundId))], [10], "stage 10 story background");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({ id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length }));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-042\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-10/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage10-runtime.mjs from stage 10 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE10_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE10_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE10_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE10_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE10_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE10_TITLE = ${json(titleText)};\n`
  + `export const STAGE10_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE10_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE10_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE10_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE10_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE10_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE10_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 28, enemyReinforcements, completedRoute: { module: 25, stage: 12, replayPresentation: false }, stableRemakeDecision: "REMAKE-042" })} as const;\n`
  + `export const STAGE10_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-10-prebattle-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage10-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage10-minimap.png")),
  copyFile(inputPaths.storyBackground10, path.join(publicAssetPath, "story-stage10-background-10.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage10.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage10-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage10-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage10-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage10-enemy-loop.wav")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-10-prebattle-story"].length} dialogue checkpoints)`);
console.log(`wrote stage 10 maps, background, and music with identity ${contentIdentity}`);
