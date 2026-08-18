#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage20-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const storyBackgroundPath = path.join(publicAssetPath, "story-stage20-background.svg");
const inputPaths = {
  template: reversePath("decoded/B/0041/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  techniqueRules: reversePath("parsed/native/technique-rules.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  wd: reversePath("parsed/native/wd-stage26.json"),
  title: reversePath("parsed/dialogue/0138.json"),
  nextTitle: reversePath("parsed/dialogue/0139.json"),
  objectiveText: reversePath("parsed/dialogue/0089.json"),
  prebattleStory: reversePath("parsed/dialogue/0039.json"),
  contactStory: reversePath("parsed/dialogue/0040.json"),
  guardianStory: reversePath("parsed/dialogue/0041.json"),
  dragonStory: reversePath("parsed/dialogue/0071.json"),
  victory1Story: reversePath("parsed/dialogue/0072.json"),
  victory2Story: reversePath("parsed/dialogue/0073.json"),
  victory3Story: reversePath("parsed/dialogue/0074.json"),
  victory4Story: reversePath("parsed/dialogue/0075.json"),
  map: reversePath("renders/battle-maps/confirmed/20.png"),
  minimap: reversePath("renders/battle-maps/minimap/20.png"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0076.wav"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0029.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0028.wav"),
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
if (templateBytes.length !== 8506) throw new Error(`B/0041 length changed: ${templateBytes.length}`);
if (sha256(templateBytes) !== "83cc30afe8f91545c5622adbfe8380fd8a48de87bcd25ebc4d5d14dca163953e") {
  throw new Error(`B/0041 hash changed: ${sha256(templateBytes)}`);
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
const wdDocument = parseInput("wd");
const template = requireEntry(battleTemplates.stages, ({ stage }) => stage === 20, "stage 20 template");
const portalTemplate = requireEntry(battleTemplates.stages, ({ stage }) => stage === 42, "stage 42 portal template");
const stageTerrain = requireEntry(terrainDocument.stages, ({ stage }) => stage === 20, "stage 20 terrain");
const stageLifecycle = requireEntry(lifecycle.deployment.stages, ({ stage }) => stage === 20, "stage 20 lifecycle");

const eligibleSlots = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24];
const optionalSlots = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const openCells = [
  { x: 28, y: 19 }, { x: 29, y: 19 }, { x: 30, y: 19 }, { x: 32, y: 19 },
  { x: 28, y: 20 }, { x: 29, y: 20 }, { x: 30, y: 20 }, { x: 31, y: 20 }, { x: 32, y: 20 },
  { x: 28, y: 21 }, { x: 29, y: 21 }, { x: 30, y: 21 }, { x: 31, y: 21 }, { x: 32, y: 21 },
];
assertEqual(template.deployment.eligibleUnitSlots, eligibleSlots, "stage 20 eligible slots");
assertEqual(template.deployment.fixedPlayerUnitSlots, [32, 0, 24], "stage 20 fixed slots");
assertEqual(template.deployment.optionalUnitSlots, optionalSlots, "stage 20 optional slots");
assertEqual(template.deployment.cells.map(({ x, y }) => ({ x, y })), openCells, "stage 20 cells");
assertEqual(stageLifecycle.maximumPlayerUnits, 17, "stage 20 capacity");
const fixedPlacements = [
  { slot: 32, position: { x: 28, y: 14 } },
  { slot: 0, position: { x: 30, y: 18 } },
  { slot: 24, position: { x: 31, y: 19 } },
];

const actorFor = (slot) => requireEntry(
  campaignRoster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const deploymentActors = [...eligibleSlots, 32].map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
assertEqual(deploymentActors.find(({ slot }) => slot === 32), {
  slot: 32, portraitRecord: 65, normalizedName: "守護者",
}, "stage 20 guardian identity");
const kins = actorFor(7);
const kinsPortalUnit = requireEntry(
  portalTemplate.activeUnitInstances,
  ({ side, unitSlot }) => side === 1 && unitSlot === 7,
  "stage 42 Kins class source",
);
const dragonActor = requireEntry(
  campaignRoster.displayResolution.enemyActors,
  ({ slot }) => slot === 28,
  "stage 20 demon dragon identity",
);
assertEqual({ name: kins.normalizedName, portrait: kins.portraitRecord }, { name: "琴斯", portrait: 14 }, "Kins identity");
assertEqual({
  nativeClassRecord: kinsPortalUnit.effectiveClass,
  className: kinsPortalUnit.className,
}, {
  nativeClassRecord: 3,
  className: "魔祭師",
}, "Kins canonical story class");
assertEqual({ name: dragonActor.normalizedName, portrait: dragonActor.portraitRecord }, { name: "妖龍", portrait: 66 }, "demon dragon identity");

const enemyUnits = template.activeUnitInstances.filter(({ side }) => side === 2).map((unit) => ({
  slot: unit.unitSlot,
  nativeClassRecord: unit.effectiveClass,
  position: { x: unit.x, y: unit.y },
  aiBehavior: unit.perSlotBehavior,
}));
assertEqual(enemyUnits, [
  [55, 25, 14], [54, 34, 14], [53, 25, 15], [40, 34, 15],
  [52, 25, 16], [41, 34, 16], [51, 25, 17], [42, 34, 17],
  [50, 25, 18], [43, 34, 18], [49, 25, 19], [44, 34, 19],
  [48, 25, 20], [45, 34, 20], [47, 25, 21], [46, 34, 21],
].map(([slot, x, y]) => ({ slot, nativeClassRecord: 8, position: { x, y }, aiBehavior: 0 })), "stage 20 narrative tableau");

const nativeObjective = requireEntry(objectives.normalStageObjectives, ({ stage }) => stage === 20, "stage 20 objective");
assertEqual({ victory: nativeObjective.victory.kind, slot: nativeObjective.victory.unitSlot, defeat: nativeObjective.defeat.unitSlot }, {
  victory: "required_side2_slot_absent", slot: 28, defeat: 0,
}, "stage 20 native objective");
const generatedObjective = {
  victory: { type: "unit-removed", side: 2, slot: 28 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗妖龍",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "妖龍已被擊退。",
};

const dialogueText = (id) => parseInput(id).actions.filter(({ op }) => op === "text")
  .map(({ text }) => text).join("").replace(/[\t$]/gu, "").trim();
const titleText = dialogueText("title");
const nextTitleText = dialogueText("nextTitle");
if (titleText !== "龍塔頂部") throw new Error(`stage 20 title changed: ${titleText}`);
if (nextTitleText !== "焦土森林村莊外") throw new Error(`stage 21 title changed: ${nextTitleText}`);
const objectiveText = dialogueText("objectiveText");
if (!objectiveText.includes("打敗妖龍") || !objectiveText.includes("妮雅")) {
  throw new Error("SAY/0089 objective wording changed");
}
const objectiveTable = storyPresentations.globalReachabilityAudit.tables.alternate;
const titleTable = storyPresentations.globalReachabilityAudit.tables.postBattle;
const recordForStage = (table, stage) => requireEntry(
  table.entries,
  (entry) => entry.key === stage && entry.enabled,
  `dialogue record for stage ${stage}`,
).dialogueRecord;
assertEqual({ objective: recordForStage(objectiveTable, 20), title: recordForStage(titleTable, 20), next: recordForStage(titleTable, 21) }, {
  objective: 89, title: 138, next: 139,
}, "stage 20 dialogue records");

const handler = requireEntry(eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.handlers, ({ stage }) => stage === 20, "stage 20 handler");
if (handler.sha256 !== "b79b7cca739b22907ec735eef1c3dee33aba66942f410551f2a689aa5f03953a") {
  throw new Error(`stage 20 handler hash changed: ${handler.sha256}`);
}
assertEqual(handler.events.map(({ trigger, sayRecords, actions }) => ({
  trigger,
  sayRecords,
  ops: actions.map(({ op }) => op),
})), [
  { trigger: "round 1", sayRecords: [40, 41, 71], ops: ["scriptedMove", "clearAllCellsForSide", "spawn"] },
  { trigger: "live victory 999", sayRecords: [72, 73, 74, 75], ops: ["spawn", "scriptedMove"] },
], "stage 20 event choreography");
assertEqual(handler.outcomeRouting.loadedVictory1000, {
  nextModule: 25, nextStage: 21, presentationReplayed: false,
}, "stage 20 completed route");
if (!eventsDocument.module29BattleRuntime.handlerBehaviorCatalog.dynamicBoardStages.includes(20)) {
  throw new Error("stage 20 left the dynamic-board catalog");
}
if (eventsDocument.module29BattleRuntime.fullRoundSpecials.stages.some(({ stage }) => stage === 20)) {
  throw new Error("stage 20 unexpectedly entered the full-round reinforcement chain");
}
if (eventsDocument.module29BattleRuntime.stage30MultiClassSequence.stage !== 30) {
  throw new Error("the defeat-replacement and form-conversion chain is no longer stage-30 only");
}
const reinforcementAudit = {
  kind: "round-1-tableau-replacement-only",
  removedSide2Slots: enemyUnits.map(({ slot }) => slot),
  spawnedActor: { side: 2, slot: 28, nativeClassRecord: 36, position: { x: 29, y: 16 } },
  laterReinforcements: false,
  auditedSources: ["initial-template", "round-event-handler", "dynamic-board-catalog", "full-round-special-chain", "defeat-replacement-and-form-chain"],
};

const storyEntry = requireEntry(eventsDocument.module25CampaignStory.stageStoryRecords, ({ stage }) => stage === 20, "stage 20 prebattle story");
assertEqual({ record: storyEntry.record, resources: storyEntry.resources }, {
  record: 39, resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"],
}, "stage 20 module 25 story");
const storyMusicEntry = requireEntry(eventsDocument.module25CampaignStory.stageMagicRecords.entries, ({ stage }) => stage === 20, "stage 20 story music");
if (storyMusicEntry.magicRecord !== 76) throw new Error(`stage 20 story music changed: ${storyMusicEntry.magicRecord}`);
const musicEntry = (table) => requireEntry(musicDocument.stageTables[table].entries, ({ stage }) => stage === 20, `${table} stage 20 music`);
const musicRecords = {
  story: 76,
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
assertEqual(musicRecords, { story: 76, player: { entry: 29, loop: 28 }, enemy: { entry: 25, loop: 24 } }, "stage 20 music");

const portraitSpeakers = {
  0: "葛蒂拉斯", 10: "蘇蘭達", 14: "琴斯", 45: "希蜜", 46: "妮雅",
  56: "龍王", 65: "守護者", 66: "妖龍", 67: "龍王",
};
const storyPages = {
  "stage-20-prebattle-story": compileNativeStory(parseInput("prebattleStory"), 39, portraitSpeakers, { includeBackground: true }),
  "stage-20-contact-story": compileNativeStory(parseInput("contactStory"), 40, portraitSpeakers, { includeBackground: true }),
  "stage-20-guardian-story": compileNativeStory(parseInput("guardianStory"), 41, portraitSpeakers, { includeBackground: true }),
  "stage-20-opening-story": compileNativeStory(parseInput("dragonStory"), 71, portraitSpeakers, { includeBackground: true }),
  "stage-20-victory-1-story": compileNativeStory(parseInput("victory1Story"), 72, portraitSpeakers, { includeBackground: true }),
  "stage-20-victory-2-story": compileNativeStory(parseInput("victory2Story"), 73, portraitSpeakers, { includeBackground: true }),
  "stage-20-victory-3-story": compileNativeStory(parseInput("victory3Story"), 74, portraitSpeakers, { includeBackground: true }),
  "stage-20-victory-story": compileNativeStory(parseInput("victory4Story"), 75, portraitSpeakers, { includeBackground: true }),
};
assertEqual(Object.fromEntries(Object.entries(storyPages).map(([id, pages]) => [id, pages.length])), {
  "stage-20-prebattle-story": 6,
  "stage-20-contact-story": 9,
  "stage-20-guardian-story": 34,
  "stage-20-opening-story": 7,
  "stage-20-victory-1-story": 5,
  "stage-20-victory-2-story": 11,
  "stage-20-victory-3-story": 17,
  "stage-20-victory-story": 15,
}, "stage 20 story waits");

const constructionTokens = requireEntry(techniqueRules.terrainConstructionTokens.stages, ({ stage }) => stage === 20, "stage 20 construction tokens");
assertEqual({ ironPlate: constructionTokens.ironPlateSourceToken, obstacle: constructionTokens.obstacleSourceToken }, { ironPlate: 21, obstacle: 18 }, "stage 20 construction tokens");
assertEqual({ code: wdDocument.wd.actionCode, radius: wdDocument.wd.aiBinding.selectionRadius, damage: wdDocument.wd.damage.requestedPerEligibleLineCell }, {
  code: "WD", radius: 10, damage: 90,
}, "stage 20 WD dependency");

const terrain = templateBytes.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id, path: path.relative(root, file), sha256: sha256(inputBuffers[id]), bytes: inputBuffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-052\0REMAKE-054\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-20/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: 39,
  roundOne: { contactStoryRecord: 40, guardianStoryRecord: 41, dragonStoryRecord: 71 },
  guardianMove: { side: 1, slot: 32, from: { x: 28, y: 14 }, to: { x: 28, y: 17 }, movementBudget: 50 },
  reinforcementAudit,
  victory: {
    actor: { side: 1, slot: 7, nativeClassRecord: 3, name: "琴斯", portraitRecord: 14 },
    from: { x: 40, y: 16 }, to: { x: 33, y: 15 }, movementBudget: 50,
    storyRecords: [72, 73, 74, 75],
  },
  completedRoute: { module: 25, stage: 21, replayPresentation: false },
  stableRemakeDecisions: ["REMAKE-052", "REMAKE-054"],
};
const deployment = {
  kind: "interactive", eligibleSlots: [...eligibleSlots, 32], fixedPlacements,
  optionalSlots, openCells, maximumUnits: 17,
};

const generatedSource = `// Generated by scripts/generate-stage20-runtime.mjs from stage 20 machine evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE20_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE20_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE20_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE20_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE20_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE20_TITLE = ${json(titleText)};\n`
  + `export const STAGE20_NEXT_TITLE = ${json(nextTitleText)};\n`
  + `export const STAGE20_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE20_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE20_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE20_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE20_DRAGON = ${json({ slot: 28, nativeClassRecord: 36, position: { x: 29, y: 16 }, name: dragonActor.normalizedName, portraitRecord: dragonActor.portraitRecord, aiBehavior: 0 })} as const;\n`
  + `export const STAGE20_KINS = ${json({ slot: 7, nativeClassRecord: kinsPortalUnit.effectiveClass, position: { x: 40, y: 16 }, name: kins.normalizedName, portraitRecord: kins.portraitRecord })} as const;\n`
  + `export const STAGE20_CONSTRUCTION_TOKENS = ${json({ ironPlate: 21, obstacle: 18 })} as const;\n`
  + `export const STAGE20_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE20_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE20_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n`
  + `  ${Object.keys(storyPages).map(json).join(" | ")}, readonly DialoguePage[]\n>>;\n`;

await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
const storyBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="960 572 640 400">
  <image href="data:image/png;base64,${encode(inputBuffers.map)}" width="2000" height="2200" style="image-rendering:pixelated"/>
</svg>\n`;
await writeFile(storyBackgroundPath, storyBackground, "utf8");
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage20-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage20-minimap.png")),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${Object.values(storyPages).reduce((sum, pages) => sum + pages.length, 0)} dialogue checkpoints)`);
console.log(`wrote stage 20 maps, native-framebuffer story crop, and music with identity ${contentIdentity}`);
