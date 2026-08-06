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
const stages = [
  { stage: 0, mapRecord: 1, graphicsRecord: 0, ironPlateToken: 50, obstacleToken: 23 },
  { stage: 1, mapRecord: 3, graphicsRecord: 2, ironPlateToken: 64, obstacleToken: 18 },
  { stage: 2, mapRecord: 5, graphicsRecord: 4, ironPlateToken: 4, obstacleToken: 4 },
  { stage: 3, mapRecord: 7, graphicsRecord: 6, ironPlateToken: 28, obstacleToken: 36 },
  { stage: 4, mapRecord: 9, graphicsRecord: 8, ironPlateToken: 27, obstacleToken: 27 },
];
const constructions = [
  { kind: "iron-plate", sourceIndex: 1266, tokenKey: "ironPlateToken" },
  { kind: "obstacle", sourceIndex: 1316, tokenKey: "obstacleToken" },
];

for (const entry of stages) {
  const mapRecord = String(entry.mapRecord).padStart(4, "0");
  const template = await readFile(path.join(decodedB, mapRecord, "00.raw"));
  const graphicsRecord = String(entry.graphicsRecord).padStart(4, "0");
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
      path.join(outputDirectory, `stage-${String(entry.stage).padStart(2, "0")}.png`),
      encodeRgbaPng(image.width, image.height, image.pixels),
    );
  }
}

console.log(`wrote ${stages.length * constructions.length} original construction terrain tiles`);
