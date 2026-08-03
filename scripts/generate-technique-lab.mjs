#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const presentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const catalogPath = path.join(root, "src/game/content/class-catalog.generated.ts");
const outputPath = path.join(root, "src/game/content/technique-lab.generated.ts");
const publicRoot = path.join(root, "public/assets/original/technique-lab");
const planarRoot = path.join(root, "reverse/renders/planar/A");

const [rules, presentations, catalogSource] = await Promise.all([
  readFile(rulesPath, "utf8").then(JSON.parse),
  readFile(presentationsPath, "utf8").then(JSON.parse),
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

const menuLabels = new Map();
for (const classEntry of rules.techniqueMenu.classes) {
  for (const tier of classEntry.tiers) {
    for (const entry of tier.entries) menuLabels.set(entry.actionCode, entry.label.text.trim());
  }
}
const implementedByCode = {
  "1C": "ice-1",
  "1F": "fire-1",
  "1H": "heal-1",
  "1L": "lightning-1",
  "2L": "lightning-2",
  "3L": "lightning-3",
  "4L": "lightning-4",
};
const techniques = rules.techniqueMenu.uniqueVisibleActionCodes.map((nativeCode) => ({
  nativeCode,
  label: menuLabels.get(nativeCode) ?? nativeCode,
  implementationId: implementedByCode[nativeCode] ?? null,
}));

const graphicEntries = presentations.resourceCatalog.graphicEntries;
const requiredResources = [...new Set(lightningActions.flatMap((action) => [
  ...action.phases.map(({ resource }) => resource),
  action.commonHit.resource,
  action.commonHit.cleanup.resource,
]))];
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

const audioResources = [...new Set(lightningActions.flatMap((action) =>
  action.audioRequests.map(({ resource }) => resource)))];
const techniqueAudioAssets = {};
await mkdir(path.join(publicRoot, "audio"), { recursive: true });
for (const resource of audioResources) {
  const [, number] = resource.split("/");
  const filename = `${number}.wav`;
  await copyFile(
    path.join(root, "reverse/converted/audio/wav/E", `${number.padStart(4, "0")}.wav`),
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
  "1C": presentations.presentations.ice.cycle.waitPerDrawNativeTicks,
  ...Object.fromEntries(lightningActions.map((presentation) => [
    presentation.code,
    presentation.commonHit.cleanup.waitPerDrawNativeTicks,
  ])),
};
assertEqual(terminalHoldNativeTicks, {
  "1F": 10,
  "1H": 15,
  "1C": 10,
  "1L": 10,
  "2L": 10,
  "3L": 10,
  "4L": 10,
}, "implemented technique terminal holds");

const source = `// Generated by scripts/generate-technique-lab.mjs from native technique evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const TECHNIQUE_LAB_CATALOG = ${JSON.stringify(techniques, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_LIGHTNING = ${JSON.stringify(lightningDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_GRAPHIC_ASSETS = ${JSON.stringify(techniqueGraphicAssets, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_AUDIO_ASSETS = ${JSON.stringify(techniqueAudioAssets, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS = ${JSON.stringify(terminalHoldNativeTicks, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_UNIT_ASSETS = ${JSON.stringify(unitAssets, null, 2)} as const;\n`;

await writeFile(outputPath, source, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} and technique laboratory assets`);
