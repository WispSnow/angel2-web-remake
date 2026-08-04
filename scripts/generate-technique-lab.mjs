#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const presentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const remainingPresentationsPath = path.join(
  root,
  "reverse/parsed/native/remaining-technique-presentations.json",
);
const catalogPath = path.join(root, "src/game/content/class-catalog.generated.ts");
const outputPath = path.join(root, "src/game/content/technique-lab.generated.ts");
const publicRoot = path.join(root, "public/assets/original/technique-lab");
const planarRoot = path.join(root, "reverse/renders/planar/A");

const [rules, presentations, remainingPresentations, catalogSource] = await Promise.all([
  readFile(rulesPath, "utf8").then(JSON.parse),
  readFile(presentationsPath, "utf8").then(JSON.parse),
  readFile(remainingPresentationsPath, "utf8").then(JSON.parse),
  readFile(catalogPath, "utf8"),
]);

const classIdsMatch = catalogSource.match(/export const CLASS_IDS = (\[[\s\S]*?\]) as const;/);
if (!classIdsMatch) throw new Error("could not read CLASS_IDS from generated class catalog");
const classIds = JSON.parse(classIdsMatch[1]);
if (classIds.length !== 39) throw new Error(`expected 39 class records, received ${classIds.length}`);

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const lightningActions = presentations.presentations.lightning.actions;
const lightningTiers = rules.rules.families.L.tiers;
const icePresentation = presentations.presentations.ice;
const iceActions = icePresentation.actions;
const iceTiers = rules.rules.families.C.tiers;
const dispelPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "TR");
if (!dispelPresentation) throw new Error("missing TR dispel presentation");
assertEqual(
  lightningActions.map(({ code, effectRadius, fixedGraphicWaitNativeTicks }) => ({
    code,
    effectRadius,
    fixedGraphicWaitNativeTicks,
  })),
  [
    { code: "1L", effectRadius: 3, fixedGraphicWaitNativeTicks: 414 },
    { code: "2L", effectRadius: 4, fixedGraphicWaitNativeTicks: 257 },
    { code: "3L", effectRadius: 4, fixedGraphicWaitNativeTicks: 348 },
    { code: "4L", effectRadius: 5, fixedGraphicWaitNativeTicks: 304 },
  ],
  "lightning presentation contracts",
);
const lightning3 = lightningActions.find(({ code }) => code === "3L");
if (!lightning3) throw new Error("missing 3L lightning presentation");
assertEqual(
  lightning3.phases.map(({ anchorOffsetSequence }) => anchorOffsetSequence),
  [
    Array.from({ length: 12 }, (_, index) => ({
      x: 0,
      y: index < 3 ? 0 : -Math.floor(index / 3),
    })),
    Array.from({ length: 15 }, () => ({ x: 0, y: -4 })),
  ],
  "3L rising cloud and strike-point anchors",
);
const lightning4 = lightningActions.find(({ code }) => code === "4L");
if (!lightning4) throw new Error("missing 4L lightning presentation");
assertEqual(
  lightning4.phases.map(({ anchorOffsetSequence }) => anchorOffsetSequence),
  [
    Array.from({ length: 18 }, (_, index) => ({
      x: 0,
      y: -8 + Math.floor(index / 2),
    })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 6 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
  ],
  "4L descending bolt and strike-point anchors",
);
assertEqual(
  iceActions.map(({
    code,
    effectRadius,
    cycles,
    rangeValueSequence,
    distanceFromCenterSequence,
    fixedGraphicWaitNativeTicks,
  }) => ({
    code,
    effectRadius,
    cycles,
    rangeValueSequence,
    distanceFromCenterSequence,
    fixedGraphicWaitNativeTicks,
  })),
  [
    { code: "1C", effectRadius: 3, cycles: 2, rangeValueSequence: [2, 1], distanceFromCenterSequence: [1, 2], fixedGraphicWaitNativeTicks: 120 },
    { code: "2C", effectRadius: 4, cycles: 3, rangeValueSequence: [3, 2, 1], distanceFromCenterSequence: [1, 2, 3], fixedGraphicWaitNativeTicks: 180 },
    { code: "3C", effectRadius: 5, cycles: 4, rangeValueSequence: [4, 3, 2, 1], distanceFromCenterSequence: [1, 2, 3, 4], fixedGraphicWaitNativeTicks: 240 },
    { code: "4C", effectRadius: 6, cycles: 5, rangeValueSequence: [5, 4, 3, 2, 1], distanceFromCenterSequence: [1, 2, 3, 4, 5], fixedGraphicWaitNativeTicks: 300 },
  ],
  "ice inner-to-outer range-stage contracts",
);

const menuLabels = new Map();
for (const classEntry of rules.techniqueMenu.classes) {
  for (const tier of classEntry.tiers) {
    for (const entry of tier.entries) menuLabels.set(entry.actionCode, entry.label.text.trim());
  }
}
const implementedByCode = {
  "1C": "ice-1",
  "2C": "ice-2",
  "3C": "ice-3",
  "4C": "ice-4",
  "1F": "fire-1",
  "1H": "heal-1",
  "1I": "recovery-1",
  "1L": "lightning-1",
  "2L": "lightning-2",
  "3L": "lightning-3",
  "4L": "lightning-4",
  "TR": "dispel",
};
const techniques = rules.techniqueMenu.uniqueVisibleActionCodes.map((nativeCode) => ({
  nativeCode,
  label: menuLabels.get(nativeCode) ?? nativeCode,
  implementationId: implementedByCode[nativeCode] ?? null,
}));

const graphicEntries = [
  ...presentations.resourceCatalog.graphicEntries,
  ...remainingPresentations.resourceCatalog.graphicEntries,
];
const requiredResources = [...new Set(lightningActions.flatMap((action) => [
  ...action.phases.map(({ resource }) => resource),
  action.commonHit.resource,
  action.commonHit.cleanup.resource,
])), dispelPresentation.dynamicPresentation.resource];
const techniqueGraphicAssets = {};
for (const resource of requiredResources) {
  const entry = graphicEntries.find(({ key }) => key === resource);
  if (!entry) throw new Error(`missing ${resource} graphic entry`);
  const directory = resource.replace("/", "-").toLowerCase();
  const destination = path.join(publicRoot, "lightning", directory);
  await mkdir(destination, { recursive: true });
  techniqueGraphicAssets[resource] = [];
  for (const [index, source] of entry.renderedPaths.entries()) {
    const filename = `${String(index).padStart(2, "0")}.png`;
    await copyFile(path.join(root, source), path.join(destination, filename));
    techniqueGraphicAssets[resource].push(
      `/assets/original/technique-lab/lightning/${directory}/${filename}`,
    );
  }
}

const audioResources = [...new Set([
  ...lightningActions.flatMap((action) => action.audioRequests.map(({ resource }) => resource)),
  icePresentation.audioResource,
])];
const techniqueAudioAssets = {};
await mkdir(path.join(publicRoot, "audio"), { recursive: true });
for (const resource of audioResources) {
  const [group, number] = resource.split("/");
  const filename = group === "E" ? `${number}.wav` : `${group.toLowerCase()}-${number}.wav`;
  await copyFile(
    path.join(root, "reverse/converted/audio/wav", group, `${number.padStart(4, "0")}.wav`),
    path.join(publicRoot, "audio", filename),
  );
  techniqueAudioAssets[resource] = `/assets/original/technique-lab/audio/${filename}`;
}

function copyAlphaMask(colorFrame, maskFrame, output) {
  execFileSync("magick", [
    "-define", "png:exclude-chunk=date,time",
    colorFrame,
    "(", maskFrame, "-alpha", "extract", ")",
    "-alpha", "off",
    "-compose", "CopyOpacity",
    "-composite",
    output,
  ]);
}

const unitDirectory = path.join(publicRoot, "units");
await mkdir(unitDirectory, { recursive: true });
const unitAssets = {};
for (const [record, classId] of classIds.entries()) {
  const frame = `${String(record).padStart(2, "0")}.png`;
  const allyFilename = `ally-${classId}.png`;
  const enemyFilename = `enemy-${classId}.png`;
  const allySource = path.join(planarRoot, "0002", frame);
  const enemySource = path.join(planarRoot, "0003", frame);
  const allyOutput = path.join(unitDirectory, allyFilename);
  const enemyOutput = path.join(unitDirectory, enemyFilename);
  const ally = record <= 35
    ? `/assets/original/technique-lab/units/${allyFilename}`
    : null;
  if (ally) await copyFile(allySource, allyOutput);
  if (record <= 35) copyAlphaMask(enemySource, allySource, enemyOutput);
  else await copyFile(enemySource, enemyOutput);
  unitAssets[classId] = {
    nativeRecord: record,
    ally,
    enemy: `/assets/original/technique-lab/units/${enemyFilename}`,
  };
}

const lightningDefinitions = Object.fromEntries(lightningActions.map((presentation) => {
  const tier = lightningTiers.find(({ code }) => code === presentation.code);
  if (!tier) throw new Error(`missing ${presentation.code} lightning rules tier`);
  return [presentation.code, {
    ...presentation,
    selectionRadius: tier.selectionRadius,
    damageByRangeValue: tier.damageByRangeValue,
  }];
}));
const iceDefinitions = Object.fromEntries(iceActions.map((presentation) => {
  const tier = iceTiers.find(({ code }) => code === presentation.code);
  if (!tier) throw new Error(`missing ${presentation.code} ice rules tier`);
  return [presentation.code, {
    ...presentation,
    centerMode: rules.rules.families.C.centerMode,
    dispatchSelectionWord: tier.dispatchSelectionWord,
    cycle: icePresentation.cycle,
    audioResource: icePresentation.audioResource,
    soundRequestEntry: icePresentation.soundRequestEntry,
  }];
}));

const fire1Presentation = presentations.presentations.fire.actions
  .find(({ code }) => code === "1F");
const heal1Presentation = presentations.presentations.heal.actions
  .find(({ code }) => code === "1H");
if (!fire1Presentation || !heal1Presentation) {
  throw new Error("missing initial fire/heal presentation for technique laboratory");
}
const terminalHoldNativeTicks = {
  "1F": fire1Presentation.phases.at(-1).waitPerDrawNativeTicks,
  "1H": heal1Presentation.phases.at(-1).waitPerDrawNativeTicks,
  "1I": 15,
  ...Object.fromEntries(iceActions.map(({ code }) => [
    code,
    icePresentation.cycle.waitPerDrawNativeTicks,
  ])),
  ...Object.fromEntries(lightningActions.map((presentation) => [
    presentation.code,
    presentation.commonHit.cleanup.waitPerDrawNativeTicks,
  ])),
  "TR": dispelPresentation.phases.at(-1).waitPerDrawNativeTicks,
};
assertEqual(terminalHoldNativeTicks, {
  "1F": 10,
  "1H": 15,
  "1I": 15,
  "1C": 10,
  "2C": 10,
  "3C": 10,
  "4C": 10,
  "1L": 10,
  "2L": 10,
  "3L": 10,
  "4L": 10,
  "TR": 5,
}, "implemented technique terminal holds");

const source = `// Generated by scripts/generate-technique-lab.mjs from native technique evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const TECHNIQUE_LAB_CATALOG = ${JSON.stringify(techniques, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_LIGHTNING = ${JSON.stringify(lightningDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_ICE = ${JSON.stringify(iceDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_DISPEL = ${JSON.stringify(dispelPresentation, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_GRAPHIC_ASSETS = ${JSON.stringify(techniqueGraphicAssets, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_AUDIO_ASSETS = ${JSON.stringify(techniqueAudioAssets, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS = ${JSON.stringify(terminalHoldNativeTicks, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_UNIT_ASSETS = ${JSON.stringify(unitAssets, null, 2)} as const;\n`;

await writeFile(outputPath, source, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} and technique laboratory assets`);
