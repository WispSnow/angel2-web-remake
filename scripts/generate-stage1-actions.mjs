#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const presentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const outputPath = path.join(root, "src/game/content/stage1-actions.generated.ts");
const publicRoot = path.join(root, "public/assets/original");

const [rules, presentations] = await Promise.all([
  readFile(rulesPath, "utf8").then(JSON.parse),
  readFile(presentationsPath, "utf8").then(JSON.parse),
]);

const requireEntry = (entries, predicate, label) => {
  const entry = entries.find(predicate);
  if (!entry) throw new Error(`missing ${label}`);
  return entry;
};

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const lightningDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1L",
  "1L dispatch entry",
);
const iceDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1C",
  "1C dispatch entry",
);
const lightningTier = requireEntry(
  rules.rules.families.L.tiers,
  ({ code }) => code === "1L",
  "1L rules tier",
);
const iceTier = requireEntry(
  rules.rules.families.C.tiers,
  ({ code }) => code === "1C",
  "1C rules tier",
);
const lightningPresentation = requireEntry(
  presentations.presentations.lightning.actions,
  ({ code }) => code === "1L",
  "1L presentation",
);
const icePresentation = requireEntry(
  presentations.presentations.ice.actions,
  ({ code }) => code === "1C",
  "1C presentation",
);

assertEqual({
  selectionRadius: lightningDispatch.selectionRadius,
  effectRadius: lightningTier.effectRadius,
  damageByRangeValue: lightningTier.damageByRangeValue,
  fixedGraphicWaitNativeTicks: lightningPresentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 4,
  effectRadius: 3,
  damageByRangeValue: { 1: 20, 2: 35, 3: 50 },
  fixedGraphicWaitNativeTicks: 414,
}, "initial lightning contract");
assertEqual({
  selectionRadius: iceDispatch.selectionRadius,
  effectRadius: iceTier.effectRadius,
  experienceBase: iceTier.experienceBase,
  experienceRandom: iceTier.experienceRandom,
  cycles: icePresentation.cycles,
  fixedGraphicWaitNativeTicks: icePresentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 2,
  effectRadius: 3,
  experienceBase: 8,
  experienceRandom: [0, 1],
  cycles: 2,
  fixedGraphicWaitNativeTicks: 120,
}, "initial ice contract");

const graphicEntries = presentations.resourceCatalog.graphicEntries;
const copyGraphic = async (key, outputDirectory) => {
  const entry = requireEntry(graphicEntries, (candidate) => candidate.key === key, `${key} graphic`);
  const destination = path.join(publicRoot, "map-actions", outputDirectory);
  await mkdir(destination, { recursive: true });
  const paths = [];
  for (const [index, source] of entry.renderedPaths.entries()) {
    const filename = `${String(index).padStart(2, "0")}.png`;
    await copyFile(path.join(root, source), path.join(destination, filename));
    paths.push(`/assets/original/map-actions/${outputDirectory}/${filename}`);
  }
  return paths;
};

const assets = {
  lightning1: {
    main: await copyGraphic("MAGIC/8", "lightning-1/main"),
    hit: await copyGraphic("MAGIC/31", "lightning-1/hit"),
    cleanup: await copyGraphic("MAGIC/6", "lightning-1/cleanup"),
  },
  ice1: {
    expansion: await copyGraphic("MAGIC/10", "ice-1/expansion"),
  },
};

await Promise.all([
  mkdir(path.join(publicRoot, "audio/e"), { recursive: true }),
  mkdir(path.join(publicRoot, "audio/un"), { recursive: true }),
]);
await Promise.all([
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0043.wav"),
    path.join(publicRoot, "audio/e/43.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/UN/0050.wav"),
    path.join(publicRoot, "audio/un/50.wav"),
  ),
]);

const definitions = {
  "lightning-1": {
    id: "lightning-1",
    nativeCode: "1L",
    label: "初級落雷",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: lightningDispatch.selectionRadius,
      effectRadius: lightningTier.effectRadius,
    },
    damage: {
      type: "magic-area",
      byRangeValue: lightningTier.damageByRangeValue,
    },
    experience: { addKillReward: true },
    presentationId: "lightning-1",
  },
  "ice-1": {
    id: "ice-1",
    nativeCode: "1C",
    label: "初級冰雪",
    kind: "technique",
    target: "area",
    range: {
      mode: 0,
      selectionRadius: iceDispatch.selectionRadius,
      effectRadius: iceTier.effectRadius,
    },
    displacement: {
      directions: ["down", "up", "left", "right"],
      requireLowerRangeValue: true,
    },
    experience: {
      base: iceTier.experienceBase,
      randomMinimum: iceTier.experienceRandom[0],
      randomMaximum: iceTier.experienceRandom[1],
    },
    presentationId: "ice-1",
  },
};

const timeline = {
  lightning1: lightningPresentation,
  ice1: {
    ...icePresentation,
    cycle: presentations.presentations.ice.cycle,
    audioResource: presentations.presentations.ice.audioResource,
  },
};

const source = `// Generated by scripts/generate-stage1-actions.mjs from native technique evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const STAGE1_ACTION_DEFINITIONS = ${JSON.stringify(definitions, null, 2)} as const;\n\n`
  + `export type Stage1ActionId = keyof typeof STAGE1_ACTION_DEFINITIONS;\n\n`
  + `export const STAGE1_ACTION_PRESENTATION = ${JSON.stringify(timeline, null, 2)} as const;\n\n`
  + `export const STAGE1_ACTION_PRESENTATION_ASSETS = ${JSON.stringify(assets, null, 2)} as const;\n\n`
  + `export const STAGE1_ACTION_AUDIO_ASSETS = ${JSON.stringify({
    "e-43": "/assets/original/audio/e/43.wav",
    "un-50": "/assets/original/audio/un/50.wav",
  }, null, 2)} as const;\n`;

await writeFile(outputPath, source, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} and stage-1 technique assets`);
