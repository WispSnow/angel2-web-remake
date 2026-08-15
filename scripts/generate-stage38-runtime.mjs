#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage38-runtime.generated.ts");
const publicAssetPath = path.join(root, "public/assets/original");
const inputPaths = {
  template: reversePath("decoded/B/0077/00.raw"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  objectives: reversePath("parsed/native/battle-objectives.json"),
  terrain: reversePath("parsed/native/terrain-token-map.json"),
  lifecycle: reversePath("parsed/native/battle-lifecycle.json"),
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  events: reversePath("parsed/native/stage-events.json"),
  music: reversePath("parsed/native/music-catalog.json"),
  openingStory: reversePath("parsed/dialogue/0164.json"),
  victoryStory: reversePath("parsed/dialogue/0165.json"),
  map: reversePath("renders/battle-maps/confirmed/38.png"),
  minimap: reversePath("renders/battle-maps/minimap/38.png"),
  playerEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0033.wav"),
  playerLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0032.wav"),
  enemyEntryMusic: reversePath("converted/audio/rix-wav/MUSIC/0005.wav"),
  enemyLoopMusic: reversePath("converted/audio/rix-wav/MUSIC/0004.wav"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const encode = (bytes) => Buffer.from(bytes).toString("base64");
const json = (value) => JSON.stringify(value);
const required = (items, predicate, label) => {
  const item = items.find(predicate);
  if (!item) throw new Error(`missing ${label}`);
  return item;
};
const buffers = Object.fromEntries(
  await Promise.all(Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)])),
);
const parse = (id) => JSON.parse(buffers[id].toString("utf8"));
const templates = parse("battleTemplates");
const terrainDocument = parse("terrain");
const lifecycle = parse("lifecycle");
const roster = parse("campaignRoster");
const events = parse("events");
const music = parse("music");
const template = required(templates.stages, ({ stage }) => stage === 38, "stage 38 template");
const stageTerrain = required(terrainDocument.stages, ({ stage }) => stage === 38, "stage 38 terrain");
const stageLifecycle = required(lifecycle.deployment.stages, ({ stage }) => stage === 38, "stage 38 lifecycle");
if (buffers.template.length !== 8506) throw new Error("B/0077 length changed");

const eligibleSlots = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  25, 26, 27, 28, 29, 30, 31,
];
const fixedPlacements = [
  { slot: 0, position: { x: 29, y: 21 } },
  { slot: 1, position: { x: 30, y: 21 } },
];
const optionalSlots = eligibleSlots.filter((slot) => slot > 1);
const openCells = template.deployment.cells.map(({ x, y }) => ({ x, y }));
if (openCells.length !== 18 || stageLifecycle.maximumPlayerUnits !== 20) {
  throw new Error("stage 38 deployment contract changed");
}
const actorFor = (slot) => required(
  roster.displayResolution.actors,
  (actor) => actor.slot === slot,
  `campaign actor ${slot}`,
);
const enemyActorFor = (slot) => required(
  roster.displayResolution.enemyActors,
  (actor) => actor.slot === slot,
  `enemy actor ${slot}`,
);
const deploymentActors = eligibleSlots.map((slot) => {
  const actor = actorFor(slot);
  return { slot, portraitRecord: actor.portraitRecord, normalizedName: actor.normalizedName };
});
const enemyUnits = template.activeUnitInstances
  .filter(({ side }) => side === 2)
  .map(({ unitSlot, effectiveClass, x, y, perSlotBehavior }) => {
    const actor = enemyActorFor(unitSlot);
    return {
      slot: unitSlot,
      nativeClassRecord: effectiveClass,
      position: { x, y },
      aiBehavior: perSlotBehavior,
      ...(actor.portraitRecord !== 0xff
        ? { name: actor.normalizedName, portraitRecord: actor.portraitRecord }
        : {}),
    };
  });
if (enemyUnits.length !== 44 || enemyUnits.some(({ aiBehavior }) => aiBehavior !== 0)) {
  throw new Error("stage 38 enemy roster or behavior changed");
}
const namedEnemyActors = enemyUnits
  .filter((unit) => "name" in unit)
  .map(({ slot, name, portraitRecord }) => ({ slot, name, portraitRecord }))
  .sort((left, right) => left.slot - right.slot);
if (JSON.stringify(namedEnemyActors) !== JSON.stringify([
  { slot: 2, name: "葛蒂拉斯", portraitRecord: 0 },
  { slot: 3, name: "庫安梅伊", portraitRecord: 12 },
  { slot: 4, name: "艾西柯羅", portraitRecord: 6 },
  { slot: 5, name: "菲伊魯茵", portraitRecord: 25 },
  { slot: 6, name: "芙瑪羅妮", portraitRecord: 11 },
  { slot: 7, name: "蕾娜吉芙", portraitRecord: 24 },
  { slot: 15, name: "哈釘", portraitRecord: 15 },
  { slot: 16, name: "娜米", portraitRecord: 20 },
  { slot: 17, name: "梅蒂", portraitRecord: 16 },
  { slot: 18, name: "萊莉", portraitRecord: 19 },
  { slot: 19, name: "西艾蕾", portraitRecord: 5 },
  { slot: 20, name: "克諾絲", portraitRecord: 4 },
  { slot: 21, name: "麗蘭特", portraitRecord: 28 },
  { slot: 22, name: "菲尼雅", portraitRecord: 29 },
  { slot: 23, name: "阿莉絲", portraitRecord: 30 },
  { slot: 24, name: "瑪西爾", portraitRecord: 31 },
])) throw new Error("stage 38 named enemy descriptor projection changed");
const nativeObjective = required(
  JSON.parse((await readFile(reversePath("parsed/native/battle-objectives.json"))).toString("utf8")).normalStageObjectives,
  ({ stage }) => stage === 38,
  "stage 38 objective",
);
if (nativeObjective.victory.kind !== "all_side2_units_absent"
  || nativeObjective.defeat.kind !== "required_side1_slot_absent"
  || nativeObjective.defeat.unitSlot !== 0) throw new Error("stage 38 objective changed");
const handler = required(
  events.module29BattleRuntime.handlerBehaviorCatalog.handlers,
  ({ stage }) => stage === 38,
  "stage 38 event handler",
);
if (JSON.stringify(handler.events) !== JSON.stringify([
  { trigger: "round 1", sayRecords: [164], actions: [] },
  { trigger: "live victory 999", sayRecords: [165], actions: [] },
])) throw new Error("stage 38 event sequence changed");
const scene = required(events.scenes, ({ stage }) => stage === 38, "stage 38 event scene");
if (JSON.stringify(scene.round1) !== JSON.stringify([
  { op: "focusPortraitResource", portraitResourceId: 46 },
  { op: "battleStory", sayRecord: 164 },
])) throw new Error("stage 38 opening presentation changed");
if (actorFor(0).portraitRecord !== scene.round1[0].portraitResourceId) {
  throw new Error("stage 38 opening focus no longer resolves to Nia");
}
const musicEntry = (table) => required(music.stageTables[table].entries, ({ stage }) => stage === 38, `${table} stage 38 music`);
const musicRecords = {
  player: { entry: musicEntry("playerPhase").entryRecord, loop: musicEntry("playerPhase").loopRecord },
  enemy: { entry: musicEntry("enemyPhase").entryRecord, loop: musicEntry("enemyPhase").loopRecord },
};
const portraitSpeakers = Object.fromEntries(
  [
    ...roster.displayResolution.actors.map(({ portraitRecord, normalizedName }) => [portraitRecord, normalizedName]),
    ...roster.displayResolution.classFallbacks.map(({ portraitRecord, normalizedName }) => [portraitRecord, normalizedName]),
  ],
);
const storyPages = {
  "stage-38-opening-story": compileNativeStory(parse("openingStory"), 164, portraitSpeakers),
  "stage-38-victory-story": compileNativeStory(parse("victoryStory"), 165, portraitSpeakers),
};
const terrain = buffers.template.subarray(256, 2756);
const tokenToSlot = new Uint8Array(128).fill(0);
for (const mapping of stageTerrain.configuredMappings) tokenToSlot[mapping.token] = mapping.logicalSlot;
const sources = Object.entries(inputPaths).map(([id, file]) => ({
  id,
  path: path.relative(root, file),
  sha256: sha256(buffers[id]),
  bytes: buffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-087\0");
for (const source of sources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const contentIdentity = `stage-38/evidence-${identityHash.digest("hex")}`;
const eventProgram = {
  prebattleStoryRecord: null,
  openingStoryRecord: 164,
  openingFocus: {
    portraitRecord: scene.round1[0].portraitResourceId,
    actor: { side: 1, slot: 0 },
    staticEnemiesPresentBeforeStory: true,
  },
  victoryStoryRecord: 165,
  enemyReinforcements: {
    kind: "none",
    initialSide2: 44,
    auditedSources: ["initial-template", "round-event-handler", "dynamic-board-catalog", "full-round-special-chain", "defeat-replacement-and-form-chain"],
  },
  completedRoute: { module: 46, stage: 39, presentationReplayed: false },
  stableRemakeDecisions: ["REMAKE-087"],
};
const deployment = { kind: "interactive", eligibleSlots, fixedPlacements, optionalSlots, openCells, maximumUnits: 20 };
const generatedObjective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "打敗所有回到異世界的敵人",
  defeatText: "「妮雅」戰敗",
  victoryStatusText: "異世界的敵人已全部擊破，王室墓園恢復寧靜。",
};
const generatedSource = `// Generated by scripts/generate-stage38-runtime.mjs from stage 38 machine evidence.\n// Do not hand-edit: regenerate after the evidence pipeline changes.\nimport type { DialoguePage } from "../types";\n\n`
  + `export const STAGE38_CONTENT_IDENTITY = ${json(contentIdentity)};\n`
  + `export const STAGE38_SOURCES = ${json(sources)} as const;\n`
  + `export const STAGE38_SECTION_SHA256 = ${json(template.sectionSha256)} as const;\n`
  + `export const STAGE38_TERRAIN_TOKENS_BASE64 = ${json(encode(terrain))};\n`
  + `export const STAGE38_TOKEN_TO_SLOT_BASE64 = ${json(encode(tokenToSlot))};\n`
  + `export const STAGE38_TITLE = "異世界";\n`
  + `export const STAGE38_OBJECTIVE = ${json(generatedObjective)} as const;\n`
  + `export const STAGE38_DEPLOYMENT = ${json(deployment)} as const;\n`
  + `export const STAGE38_DEPLOYMENT_ACTORS = ${json(deploymentActors)} as const;\n`
  + `export const STAGE38_ENEMY_UNITS = ${json(enemyUnits)} as const;\n`
  + `export const STAGE38_CONSTRUCTION_TOKENS = ${json({ ironPlate: 0, obstacle: 0 })} as const;\n`
  + `export const STAGE38_MUSIC_RECORDS = ${json(musicRecords)} as const;\n`
  + `export const STAGE38_EVENT_PROGRAM = ${json(eventProgram)} as const;\n`
  + `export const STAGE38_STORY_PAGES = ${json(storyPages)} as const satisfies Readonly<Record<\n  "stage-38-opening-story" | "stage-38-victory-story", readonly DialoguePage[]\n>>;\n`;
await writeFile(outputPath, generatedSource, "utf8");
await mkdir(publicAssetPath, { recursive: true });
await Promise.all([
  copyFile(inputPaths.map, path.join(publicAssetPath, "stage38-map.png")),
  copyFile(inputPaths.minimap, path.join(publicAssetPath, "stage38-minimap.png")),
  copyFile(inputPaths.playerEntryMusic, path.join(publicAssetPath, "battle-stage38-player-entry.wav")),
  copyFile(inputPaths.playerLoopMusic, path.join(publicAssetPath, "battle-stage38-player-loop.wav")),
  copyFile(inputPaths.enemyEntryMusic, path.join(publicAssetPath, "battle-stage38-enemy-entry.wav")),
  copyFile(inputPaths.enemyLoopMusic, path.join(publicAssetPath, "battle-stage38-enemy-loop.wav")),
]);
console.log(`wrote ${path.relative(root, outputPath)} (${storyPages["stage-38-opening-story"].length}/${storyPages["stage-38-victory-story"].length} dialogue checkpoints)`);
