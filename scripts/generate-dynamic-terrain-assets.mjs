#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PALETTES,
  composePlanarImage,
  encodeRgbaPng,
  rawTileBundle,
} from "../reverse/tools/angel2-planar.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decodedB = path.join(root, "reverse/decoded/B");
const tileWidth = 40;
const tileHeight = 44;
const bytesPerPlane = 220;
const tileCount = 128;

// One entry per playable stage runtime id. `stageId` must stay identical to
// STAGE_RUNTIME_MANIFEST because BattleScene preloads the construction tile as
// `/assets/original/map-actions/<kind>/<stage.id>.png`; a name drift silently
// resolves to the Vite HTML fallback and Phaser renders a broken texture.
// The token pair is the evidence baseline: it is re-derived from the odd B
// template on every run and cross-checked against technique-rules.json.
const stages = [
  { stage: 0, stageId: "stage-00", ironPlateToken: 50, obstacleToken: 23 },
  { stage: 1, stageId: "stage-01", ironPlateToken: 64, obstacleToken: 18 },
  { stage: 2, stageId: "stage-02", ironPlateToken: 4, obstacleToken: 4 },
  { stage: 3, stageId: "stage-03", ironPlateToken: 28, obstacleToken: 36 },
  { stage: 4, stageId: "stage-04", ironPlateToken: 27, obstacleToken: 27 },
  { stage: 5, stageId: "stage-05", ironPlateToken: 27, obstacleToken: 27 },
  { stage: 6, stageId: "stage-06", ironPlateToken: 39, obstacleToken: 0 },
  { stage: 7, stageId: "stage-07", ironPlateToken: 3, obstacleToken: 4 },
  { stage: 8, stageId: "stage-08", ironPlateToken: 3, obstacleToken: 4 },
  { stage: 9, stageId: "stage-09", ironPlateToken: 7, obstacleToken: 7 },
  { stage: 10, stageId: "stage-10", ironPlateToken: 0, obstacleToken: 0 },
  { stage: 11, stageId: "stage-11", ironPlateToken: 2, obstacleToken: 2 },
  { stage: 12, stageId: "stage-12", ironPlateToken: 4, obstacleToken: 4 },
  { stage: 13, stageId: "stage-13", ironPlateToken: 38, obstacleToken: 41 },
  { stage: 14, stageId: "stage-14", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 15, stageId: "stage-15", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 16, stageId: "stage-16", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 17, stageId: "stage-17", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 18, stageId: "stage-18", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 19, stageId: "stage-19", ironPlateToken: 1, obstacleToken: 1 },
  { stage: 20, stageId: "stage-20", ironPlateToken: 21, obstacleToken: 18 },
  { stage: 21, stageId: "stage-21", ironPlateToken: 89, obstacleToken: 89 },
  { stage: 22, stageId: "stage-22", ironPlateToken: 65, obstacleToken: 69 },
  { stage: 23, stageId: "stage-23", ironPlateToken: 3, obstacleToken: 3 },
  { stage: 24, stageId: "stage-24", ironPlateToken: 3, obstacleToken: 3 },
  { stage: 26, stageId: "stage-26", ironPlateToken: 23, obstacleToken: 23 },
  { stage: 27, stageId: "stage-27", ironPlateToken: 3, obstacleToken: 57 },
  { stage: 28, stageId: "stage-28", ironPlateToken: 16, obstacleToken: 16 },
  { stage: 29, stageId: "stage-29", ironPlateToken: 16, obstacleToken: 16 },
  { stage: 30, stageId: "stage-30", ironPlateToken: 0, obstacleToken: 0 },
  { stage: 31, stageId: "stage-31", ironPlateToken: 77, obstacleToken: 77 },
  { stage: 32, stageId: "stage-32", ironPlateToken: 3, obstacleToken: 101 },
  { stage: 42, stageId: "stage-42-portal", ironPlateToken: 1, obstacleToken: 1 },
];
const constructions = [
  { kind: "iron-plate", sourceIndex: 1266, tokenKey: "ironPlateToken", ruleKey: "ironPlateSourceToken" },
  { kind: "obstacle", sourceIndex: 1316, tokenKey: "obstacleToken", ruleKey: "obstacleSourceToken" },
];

const techniqueRules = JSON.parse(
  await readFile(path.join(root, "reverse/parsed/native/technique-rules.json"), "utf8"),
);
const constructionRules = techniqueRules.terrainConstructionTokens;
for (const construction of constructions) {
  const cell = constructionRules.sourceCells[
    construction.kind === "iron-plate" ? "ironPlate" : "obstacle"
  ];
  if (cell.linearCell !== construction.sourceIndex) {
    throw new Error(`${construction.kind} source cell changed: ${cell.linearCell}`);
  }
}

for (const entry of stages) {
  const rule = constructionRules.stages.find(({ stage }) => stage === entry.stage);
  if (!rule) throw new Error(`missing technique-rules construction entry for stage ${entry.stage}`);
  const mapRecord = String(rule.bRecord).padStart(4, "0");
  const template = await readFile(path.join(decodedB, mapRecord, "00.raw"));
  const graphicsRecord = String(rule.bRecord - 1).padStart(4, "0");
  const planes = await Promise.all(Array.from({ length: 4 }, async (_, planeIndex) => {
    const buffer = await readFile(path.join(
      decodedB,
      graphicsRecord,
      `${String(planeIndex).padStart(2, "0")}.raw`,
    ));
    return rawTileBundle(
      buffer.subarray(0, tileCount * bytesPerPlane),
      tileWidth,
      tileHeight,
      `${graphicsRecord} plane ${planeIndex}`,
    );
  }));
  for (const construction of constructions) {
    const expectedToken = entry[construction.tokenKey];
    const actualToken = template[256 + construction.sourceIndex];
    if (actualToken !== expectedToken) {
      throw new Error(`stage ${entry.stage} ${construction.kind} token changed: expected ${expectedToken}, got ${actualToken}`);
    }
    if (rule[construction.ruleKey] !== expectedToken) {
      throw new Error(`stage ${entry.stage} ${construction.kind} token disagrees with technique-rules.json: ${rule[construction.ruleKey]}`);
    }
    const outputDirectory = path.join(
      root,
      "public/assets/original/map-actions",
      construction.kind,
    );
    await mkdir(outputDirectory, { recursive: true });
    const image = composePlanarImage(
      planes,
      expectedToken,
      null,
      PALETTES.gameplay.colors,
    );
    await writeFile(
      path.join(outputDirectory, `${entry.stageId}.png`),
      encodeRgbaPng(image.width, image.height, image.pixels),
    );
  }
}

console.log(`wrote ${stages.length * constructions.length} original construction terrain tiles`);
