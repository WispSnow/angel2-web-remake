#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage4-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const pulseAssetPath = path.join(publicAssetPath, "stage4-force-field-pulse");

const inputPaths = {
  template: reversePath("decoded/B/0009/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  behavior12: reversePath("parsed/native/behavior12-effects.json"),
  title: reversePath("parsed/dialogue/0122.json"),
  objectiveText: reversePath("parsed/dialogue/0086.json"),
  prebattleStory: reversePath("parsed/dialogue/0007.json"),
  openingStory: reversePath("parsed/dialogue/0008.json"),
  victoryStory: reversePath("parsed/dialogue/0174.json"),
  map: reversePath("renders/battle-maps/confirmed/04.png"),
  minimap: reversePath("renders/battle-maps/minimap/04.png"),
  allyMagician: reversePath("renders/planar/A/0002/06.png"),
  storyBackground: reversePath("renders/planar/BK/0003/00.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0076.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0039.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0038.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0005.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0004.wav"),
};

const pulseFramePaths = Array.from({ length: 13 }, (_, frame) =>
  reversePath("renders/planar/MAGIC/0026", `${String(frame).padStart(2, "0")}.png`));
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
const pulseFrameBuffers = await Promise.all(pulseFramePaths.map((file) => readFile(file)));
const parseInput = (id) => JSON.parse(inputBuffers[id].toString("utf8"));
const template = inputBuffers.template;
const battleTemplates = parseInput("battleTemplates");
const objectives = parseInput("objectives");
const terrainDocument = parseInput("terrain");
const lifecycle = parseInput("lifecycle");
const campaignRoster = parseInput("campaignRoster");
const eventsDocument = parseInput("events");
const musicDocument = parseInput("music");
const behavior12 = parseInput("behavior12").stage4;

if (template.length !== 8506) throw new Error(`B/0009 length changed: ${template.length}`);
const templateHash = sha256(template);
if (templateHash !== "a35181da51ba8e100213f9977ff2360edd543a597572b559a8154dca3d67e84b") {
  throw new Error(`B/0009 hash changed: ${templateHash}`);
}

const stageTemplate = requireEntry(battleTemplates.stages, ({ stage }) => stage === 4, "stage 4 battle template");
if (stageTemplate.bRecord !== 9 || stageTemplate.sha256 !== templateHash) {
  throw new Error("stage 4 battle-template source identity changed");
}
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 4, "stage 4 terrain mapping");
if (stageTerrain.bRecord !== 9 || stageTerrain.terrainTokenMapSha256 !== stageTemplate.sectionSha256.terrainTokenMap) {
  throw new Error("stage 4 terrain mapping no longer matches B/0009");
}

const expectedDeployment = {
  eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
  fixedSlots: [0, 24],
  optionalSlots: [1, 2, 3, 4, 20, 21],
  openCells: [
    { x: 23, y: 40 }, { x: 27, y: 40 }, { x: 23, y: 41 },
    { x: 27, y: 41 }, { x: 24, y: 42 }, { x: 26, y: 42 },
  ],
  maximumUnits: 8,
};
const deployment = stageTemplate.deployment;
const lifecycleDeployment = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 4, "stage 4 deployment lifecycle");
assertEqual(deployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 4 eligible deployment slots");
assertEqual(deployment.fixedPlayerUnitSlots, expectedDeployment.fixedSlots, "stage 4 fixed deployment slots");
assertEqual(deployment.optionalUnitSlots, expectedDeployment.optionalSlots, "stage 4 optional deployment slots");
assertEqual(deployment.cells.map(({ x, y }) => ({ x, y })), expectedDeployment.openCells, "stage 4 deployment cells");
assertEqual(lifecycleDeployment.eligibleUnitSlots, expectedDeployment.eligibleSlots, "stage 4 lifecycle eligible slots");
if (deployment.maximumPlayerUnitCount !== expectedDeployment.maximumUnits) throw new Error("stage 4 deployment capacity changed");

const fixedPlacements = expectedDeployment.fixedSlots.map((slot) => {
  const instance = requireEntry(stageTemplate.activeUnitInstances, (unit) => unit.side === 1 && unit.unitSlot === slot, `stage 4 fixed unit ${slot}`);
  return { slot, position: { x: instance.x, y: instance.y } };
});
assertEqual(fixedPlacements, [
  { slot: 0, position: { x: 25, y: 40 } },
  { slot: 24, position: { x: 25, y: 41 } },
], "stage 4 fixed placements");

const enemyUnits = stageTemplate.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map((unit) => ({
    slot: unit.unitSlot,
    nativeClassRecord: unit.effectiveClass,
    position: { x: unit.x, y: unit.y },
    aiBehavior: unit.perSlotBehavior,
  }));
assertEqual(enemyUnits, [
  { slot: 40, nativeClassRecord: 0, position: { x: 23, y: 15 }, aiBehavior: 0 },
  { slot: 41, nativeClassRecord: 0, position: { x: 27, y: 15 }, aiBehavior: 0 },
], "stage 4 enemies");

const playerClassOverrides = stageTemplate.classArrays.side1SparseOverrides
  .flatMap((nativeClassRecord, slot) => nativeClassRecord === 0 ? [] : [{ slot, nativeClassRecord }]);
assertEqual(playerClassOverrides, [{ slot: 24, nativeClassRecord: 6 }], "stage 4 player class overrides");

const deploymentActors = expectedDeployment.eligibleSlots.map((slot) => {
  const actor = requireEntry(campaignRoster.displayResolution.actors, (entry) => entry.slot === slot, `stage 4 campaign actor ${slot}`);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
assertEqual(deploymentActors, [
  { slot: 0, portraitRecord: 46, normalizedName: "妮雅" },
  { slot: 1, portraitRecord: 45, normalizedName: "希蜜" },
  { slot: 2, portraitRecord: 42, normalizedName: "蒙欣曼" },
  { slot: 3, portraitRecord: 43, normalizedName: "黛西" },
  { slot: 4, portraitRecord: 44, normalizedName: "拉朵那" },
  { slot: 20, portraitRecord: 1, normalizedName: "蕾奇蒂特" },
  { slot: 21, portraitRecord: 32, normalizedName: "愛歐里雅" },
  { slot: 24, portraitRecord: 0, normalizedName: "葛蒂拉斯" },
], "stage 4 deployment actors");

const objective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 4, "stage 4 objective");
const generatedObjective = {
  victory: { type: "unit-in-cell-range", side: objective.victory.side, slot: objective.victory.unitSlot, width: 50, minimum: 0, maximum: 174 },
  defeat: { type: "any-unit-removed", side: objective.defeat.side, slots: objective.defeat.unitSlots },
  victoryText: "護送葛蒂拉斯進入力場出口",
  defeatText: "「妮雅」或「葛蒂拉斯」戰敗",
  victoryStatusText: "葛蒂拉斯已帶領部隊穿過力場。",
};
assertEqual(generatedObjective.victory, { type: "unit-in-cell-range", side: 1, slot: 24, width: 50, minimum: 0, maximum: 174 }, "stage 4 victory condition");
assertEqual(generatedObjective.defeat, { type: "any-unit-removed", side: 1, slots: [0, 24] }, "stage 4 defeat condition");
const originalObjective = parseInput("objectiveText").actions.filter(({ op }) => op === "text").map(({ text }) => text).join("");
if (!originalObjective.includes("打敗敵人首領「倩」") || !originalObjective.includes("「妮雅」戰敗")) {
  throw new Error("SAY/0086 no longer contains the documented stage 4 objective conflict");
}

const titleText = parseInput("title").actions.filter(({ op }) => op === "text").map(({ text }) => text)
  .join("").replace(/[\t$]/gu, "").trim();
if (titleText !== "通過力場") throw new Error(`stage 4 title changed: ${titleText}`);

const handler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 4, "stage 4 event handler");
if (handler.handler !== "1000:44D7") throw new Error("stage 4 event handler address changed");
assertEqual(handler.events.map(({ trigger, sayRecords }) => ({ trigger, sayRecords })), [
  { trigger: "round 1", sayRecords: [8] },
  { trigger: "live victory 999", sayRecords: [174] },
], "stage 4 event triggers");
assertEqual(handler.outcomeRouting.loadedVictory1000, { nextModule: 27, nextStage: 5, presentationReplayed: false }, "stage 4 completed route");

const storyRecord = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 4, "stage 4 prebattle story record");
const storyMusic = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage, selected }) => stage === 4 && selected, "stage 4 story music");
const playerMusic = requireEntry(musicDocument.stageTables.playerPhase.entries, ({ stage, reachable }) => stage === 4 && reachable, "stage 4 player music");
const enemyMusic = requireEntry(musicDocument.stageTables.enemyPhase.entries, ({ stage, reachable }) => stage === 4 && reachable, "stage 4 enemy music");
if (storyRecord.record !== 7) throw new Error("stage 4 prebattle story record changed");
const musicRecords = {
  story: storyMusic.magicRecord,
  player: { entry: playerMusic.entryRecord, loop: playerMusic.loopRecord },
  enemy: { entry: enemyMusic.entryRecord, loop: enemyMusic.loopRecord },
};
assertEqual(musicRecords, { story: 76, player: { entry: 39, loop: 38 }, enemy: { entry: 5, loop: 4 } }, "stage 4 music records");

if (behavior12.actor.unitSlot !== 24 || behavior12.actor.side !== 1 || behavior12.actor.perSlotBehavior !== 12) {
  throw new Error("stage 4 route-pulse actor changed");
}
if (behavior12.presentation.resource.sourceSha256 !== "9e8b712c5d7c09a773fc525158a095434ca504a5cec3dc9cfc98b99e307719d3") {
  throw new Error("stage 4 force-field graphic identity changed");
}
const routePulse = {
  kind: "route-pulse",
  actorId: "1:24",
  route: { goal: { x: behavior12.routeGoalCell % 50, y: Math.floor(behavior12.routeGoalCell / 50) }, movement: behavior12.movementOverride, accept: "lower-cell-index" },
  safeArea: { mode: "uniform", seed: behavior12.preparation.seed, impassableMovementRule: 99 },
  effect: { side: 1, numerator: 1, denominator: 2, rounding: "floor" },
  presentationId: "stage-04-force-field-pulse",
};
assertEqual(routePulse.route, { goal: { x: 25, y: 2 }, movement: 3, accept: "lower-cell-index" }, "stage 4 route-pulse route");
assertEqual(routePulse.safeArea, { mode: "uniform", seed: 3, impassableMovementRule: 99 }, "stage 4 route-pulse safe area");

const safeCells = behavior12.safeRegion.cells.map(({ x, y }) => ({ x, y }));
const dangerCells = behavior12.safeRegion.deploymentCells
  .filter(({ safeFromFirstEffect }) => !safeFromFirstEffect)
  .map(({ x, y }) => ({ x, y }));
assertEqual(dangerCells, [{ x: 23, y: 40 }, { x: 27, y: 40 }], "stage 4 first-pulse danger cells");
const forceFieldPresentation = {
  id: "stage-04-force-field-pulse",
  resource: "MAGIC/26",
  frames: pulseFramePaths.map((_, frame) => `/assets/original/stage4-force-field-pulse/${String(frame).padStart(2, "0")}.png`),
  runtimeTileCodes: behavior12.presentation.runtimeTileCodes,
  effectRangeValue: behavior12.presentation.invertedRangeMaximum,
  rangeThresholdStart: behavior12.presentation.rangeThresholdStart,
  rangeThresholdDecrementPerDraw: behavior12.presentation.rangeThresholdDecrementPerDraw,
  sweepWidth: behavior12.presentation.sweepWidth,
  iterations: behavior12.presentation.iterations,
  drawsPerIteration: behavior12.presentation.drawsPerIteration,
  waitPerDrawNativeTicks: behavior12.presentation.waitPerDrawNativeTicks,
  minimumStaticFeedbackNativeTicks: 15,
  fixedGraphicWaitNativeTicks: behavior12.presentation.fixedGraphicWaitNativeTicks,
};
assertEqual({
  runtimeTileCodes: forceFieldPresentation.runtimeTileCodes,
  effectRangeValue: forceFieldPresentation.effectRangeValue,
  rangeThresholdStart: forceFieldPresentation.rangeThresholdStart,
  rangeThresholdDecrementPerDraw: forceFieldPresentation.rangeThresholdDecrementPerDraw,
  sweepWidth: forceFieldPresentation.sweepWidth,
  iterations: forceFieldPresentation.iterations,
  drawsPerIteration: forceFieldPresentation.drawsPerIteration,
  waitPerDrawNativeTicks: forceFieldPresentation.waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: forceFieldPresentation.fixedGraphicWaitNativeTicks,
}, {
  runtimeTileCodes: [12, 13], effectRangeValue: 1, rangeThresholdStart: 0,
  rangeThresholdDecrementPerDraw: 1, sweepWidth: 11, iterations: 11,
  drawsPerIteration: 2, waitPerDrawNativeTicks: 2, fixedGraphicWaitNativeTicks: 44,
}, "stage 4 force-field timing");

const portraitSpeakers = { 0: "葛蒂拉斯", 42: "蒙欣曼", 43: "黛西", 44: "拉朵那", 45: "希蜜", 46: "妮雅", 47: "士兵" };
function compileStory(document, record) {
  const windows = {
    upper: { open: false, text: "", portrait: undefined },
    lower: { open: false, text: "", portrait: undefined },
  };
  let activeSlot;
  let wait = 0;
  const pages = [];
  for (const action of document.actions) {
    if (action.op === "show_portrait") windows[action.slot].portrait = action.portraitId;
    else if (action.op === "hide_portrait") windows[action.slot].portrait = undefined;
    else if (action.op === "open_window") {
      windows[action.slot].open = true;
      if (action.replaceText) windows[action.slot].text = "";
      activeSlot = action.slot;
    } else if (action.op === "close_window") windows[action.slot].open = false;
    else if (action.op === "text") {
      windows[action.slot].text += action.text;
      activeSlot = action.slot;
    } else if (action.op === "line_break") {
      if (!activeSlot) throw new Error(`SAY/${record} line break has no active window`);
      windows[activeSlot].text += "\n";
    } else if (action.op === "wait_for_input") {
      wait += 1;
      const page = { activeSlot, source: { record, wait, address: `SAY/${String(record).padStart(4, "0")}:${action.line}` } };
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
  "stage-04-prebattle-story": compileStory(parseInput("prebattleStory"), 7),
  "stage-04-opening-story": compileStory(parseInput("openingStory"), 8),
  "stage-04-victory-story": compileStory(parseInput("victoryStory"), 174),
};
assertEqual(Object.values(storyPages).map((pages) => pages.length), [26, 3, 3], "stage 4 story wait counts");

const terrain = template.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = [
  ...Object.entries(inputPaths).map(([id, file]) => ({ id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length })),
  ...pulseFramePaths.map((file, frame) => ({ id: `pulseFrame${frame}`, path: path.relative(root, file), sha256: sha256(pulseFrameBuffers[frame]), bytes: pulseFrameBuffers[frame].length })),
];
const identityHash = createHash("sha256");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-04/evidence-${identityHash.digest("hex")}`;

const generatedSource = `// Generated by scripts/generate-stage4-runtime.mjs from stage 4 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE4_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE4_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE4_SECTION_SHA256 = ${json(stageTemplate.sectionSha256)} as const;\n`
  + `export const STAGE4_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE4_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE4_TITLE = ${json(titleText)};\n`
  + `export const STAGE4_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE4_DEPLOYMENT = ${json({ kind: "interactive", eligibleSlots: expectedDeployment.eligibleSlots, fixedPlacements, optionalSlots: expectedDeployment.optionalSlots, openCells: expectedDeployment.openCells, maximumUnits: expectedDeployment.maximumUnits })} as const;\n`
  + `export const STAGE4_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE4_PLAYER_CLASS_OVERRIDES = ${json(playerClassOverrides)} as const;\n`
  + `export const STAGE4_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE4_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE4_EVENT_PROGRAM = ${json({ prebattleStoryRecord: 7, openingStoryRecord: 8, victoryStoryRecord: 174, completedRoute: { module: 27, stage: 5, replayPresentation: false } })} as const;\n`
  + `export const STAGE4_STORY_PRESENTATION = ${json({ prebattleBackgroundId: 3 })} as const;\n`
  + `export const STAGE4_ROUTE_PULSE = ${json(routePulse)} as const;\n`
  + `export const STAGE4_INITIAL_SAFE_CELLS = ${json(safeCells)} as const;\n`
  + `export const STAGE4_INITIAL_DANGER_CELLS = ${json(dangerCells)} as const;\n`
  + `export const STAGE4_FORCE_FIELD_PRESENTATION = ${json(forceFieldPresentation)} as const;\n`
  + `export const STAGE4_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  "stage-04-prebattle-story" | "stage-04-opening-story" | "stage-04-victory-story", readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await mkdir(pulseAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage4-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage4-minimap.png")),
  copyFile(inputPaths.allyMagician, path.join(publicAssetPath, "unit-ally-magician.png")),
  copyFile(inputPaths.storyBackground, path.join(publicAssetPath, "story-stage4-background.png")),
  copyFile(inputPaths.storyMusic, path.join(publicAssetPath, "story-stage4.wav")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage4-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage4-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage4-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage4-enemy-loop.wav")),
  ...pulseFramePaths.map((source, frame) => copyFile(source, path.join(pulseAssetPath, `${String(frame).padStart(2, "0")}.png`))),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${terrain.length} terrain cells, ${Object.values(storyPages).flat().length} dialogue checkpoints)`);
console.log(`wrote stage 4 map, music, story background and force-field assets with identity ${contentIdentity}`);
