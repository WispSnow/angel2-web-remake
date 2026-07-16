#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  PALETTES,
  composePlanarImage,
  encodeRgbaPng,
  rawTileBundle,
} from "./angel2-planar.mjs";

const GRID_WIDTH = 50;
const GRID_HEIGHT = 50;
const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const TILE_COUNT = 128;
const TILE_PLANE_BYTES = 220;
const TRAILING_BYTES_PER_PLANE = 1024;
const TEMPLATE_BYTES = 8506;
const CONFIG_WORDS = 128;
const TERRAIN_MAP_OFFSET = 256;
const UNIT_INDEX_MAP_OFFSET = TERRAIN_MAP_OFFSET + GRID_WIDTH * GRID_HEIGHT;
const SIDE_MAP_OFFSET = UNIT_INDEX_MAP_OFFSET + GRID_WIDTH * GRID_HEIGHT;
const MINIMAP_CELL_WIDTH = 3;
const MINIMAP_CELL_HEIGHT = 3;
const MINIMAP_OCCUPANCY_COLORS = new Map([[1, 10], [2, 11], [0xff, 15]]);

function parseBattleTemplate(buffer, fileName = "B template record") {
  if (buffer.length !== TEMPLATE_BYTES) {
    throw new Error(`${fileName}: expected ${TEMPLATE_BYTES} bytes, got ${buffer.length}`);
  }
  const terrainDescriptorOffsets = Array.from({ length: CONFIG_WORDS }, (_, index) =>
    buffer.readUInt16LE(index * 2));
  const terrainTokens = Array.from(buffer.subarray(
    TERRAIN_MAP_OFFSET,
    TERRAIN_MAP_OFFSET + GRID_WIDTH * GRID_HEIGHT,
  ));
  const unitIndexMap = Array.from(buffer.subarray(
    UNIT_INDEX_MAP_OFFSET,
    UNIT_INDEX_MAP_OFFSET + GRID_WIDTH * GRID_HEIGHT,
  ));
  const sideOccupancyMap = Array.from(buffer.subarray(
    SIDE_MAP_OFFSET,
    SIDE_MAP_OFFSET + GRID_WIDTH * GRID_HEIGHT,
  ));
  return { terrainDescriptorOffsets, terrainTokens, unitIndexMap, sideOccupancyMap };
}

function blit(target, targetWidth, source, x, y, transparentBlack) {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      if (source.pixels[sourceOffset + 3] === 0 ||
          (transparentBlack && source.pixels[sourceOffset] === 0 &&
            source.pixels[sourceOffset + 1] === 0 && source.pixels[sourceOffset + 2] === 0)) {
        continue;
      }
      const targetOffset = ((y + sourceY) * targetWidth + x + sourceX) * 4;
      source.pixels.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
}

async function renderMap(
  decodedDirectory,
  battleTemplatesPath,
  stageIndex,
  outputFile,
  paletteName = "gameplay",
) {
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= 44) {
    throw new Error(`stage index must be an integer from 0 through 43, got ${stageIndex}`);
  }
  const palette = PALETTES[paletteName];
  if (palette === undefined) {
    throw new Error(`unknown palette ${paletteName}`);
  }

  const battleTemplates = JSON.parse(await readFile(battleTemplatesPath, "utf8"));
  const stage = battleTemplates.stages?.find((entry) => entry.stage === stageIndex);
  if (stage === undefined || stage.bRecord % 2 !== 1) {
    throw new Error(`stage ${stageIndex}: no odd B template record mapping`);
  }
  const mapRecordNumber = stage.bRecord;
  const tilesetRecordNumber = mapRecordNumber - 1;
  const tilesetRecord = tilesetRecordNumber.toString().padStart(4, "0");
  const mapRecord = mapRecordNumber.toString().padStart(4, "0");
  const planeBuffers = await Promise.all(Array.from({ length: 4 }, (_, plane) =>
    readFile(path.join(decodedDirectory, tilesetRecord, `${plane.toString().padStart(2, "0")}.raw`))));
  const planes = planeBuffers.map((buffer, plane) =>
    rawTileBundle(
      buffer.subarray(0, TILE_COUNT * TILE_PLANE_BYTES),
      TILE_WIDTH,
      TILE_HEIGHT,
      `${tilesetRecord} plane ${plane}`,
    ));
  if (planeBuffers.some((buffer) =>
    buffer.length !== TILE_COUNT * TILE_PLANE_BYTES + TRAILING_BYTES_PER_PLANE)) {
    throw new Error(`${tilesetRecord}: expected 29184 bytes in every color plane`);
  }
  if (planeBuffers.some((buffer) =>
    !buffer.subarray(TILE_COUNT * TILE_PLANE_BYTES).every((value) => value === 0))) {
    throw new Error(`${tilesetRecord}: expected a zero-filled 1024-byte tail in every color plane`);
  }
  if (planes.some((plane) => plane.images.length !== TILE_COUNT)) {
    throw new Error(`${tilesetRecord}: expected ${TILE_COUNT} tiles in every color plane`);
  }
  const template = parseBattleTemplate(
    await readFile(path.join(decodedDirectory, mapRecord, "00.raw")),
    mapRecord,
  );
  const tiles = Array.from({ length: TILE_COUNT }, (_, index) =>
    composePlanarImage(planes, index, null, palette.colors));

  const width = GRID_WIDTH * TILE_WIDTH;
  const height = GRID_HEIGHT * TILE_HEIGHT;
  const pixels = Buffer.alloc(width * height * 4);
  const invalidReferences = [];
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const token = template.terrainTokens[y * GRID_WIDTH + x];
      if (token >= tiles.length) {
        invalidReferences.push({ x, y, token, reason: "tile_index_out_of_range" });
        continue;
      }
      blit(pixels, width, tiles[token], x * TILE_WIDTH, y * TILE_HEIGHT, false);
    }
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, encodeRgbaPng(width, height, pixels));
  const metadata = {
    format: "ANGEL2 B.SWF battle background reconstruction",
    evidenceLevel: "C",
    stage: stageIndex,
    stageKind: stage.stageKind,
    tilesetRecord: tilesetRecordNumber,
    mapRecord: mapRecordNumber,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    tileCount: TILE_COUNT,
    tilePlaneBytes: TILE_PLANE_BYTES,
    trailingBytesPerPlane: TRAILING_BYTES_PER_PLANE,
    trailingBytesRole: "zero_padding_outside_the_raw_token_addressable_tile_region",
    nativeViewport: { columns: 10, rows: 7, xPixelStep: 40, yPixelStep: 44 },
    layerRule:
      "the byte in the 50x50 terrain-token map directly selects the same-numbered 40x44 tile from the paired even B record",
    nativeEvidence:
      "module29 0000:7E2A loads CL from DS:01A7; 0000:82A4 forwards CX; 0000:47EA uses token*00DCh as the plane source offset; 0000:3960/427A copy 44 rows of five bytes; 0000:7DEF/7DC0 advance 40 pixels across ten columns and 44 pixels across seven rows",
    palette: paletteName,
    terrainDescriptorOffsets: template.terrainDescriptorOffsets,
    invalidReferences,
    output: path.basename(outputFile),
  };
  await writeFile(`${outputFile}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`rendered battle stage ${stageIndex} to ${outputFile}`);
  console.log(`invalid tile references: ${invalidReferences.length}`);
  return metadata;
}

function fillPixels(pixels, width, height, color) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

function fillRectangle(pixels, width, x, y, rectangleWidth, rectangleHeight, color) {
  const height = pixels.length / 4 / width;
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(width, x + rectangleWidth);
  const endY = Math.min(height, y + rectangleHeight);
  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      const offset = (row * width + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

async function renderMinimapAll(
  decodedDirectory,
  battleTemplatesPath,
  terrainTokenMapPath,
  outputDirectory,
  paletteName = "gameplay",
  includeOccupancy = false,
) {
  const palette = PALETTES[paletteName];
  if (palette === undefined) {
    throw new Error(`unknown palette ${paletteName}`);
  }
  const [battleTemplates, terrainTokenMap] = await Promise.all([
    readFile(battleTemplatesPath, "utf8").then(JSON.parse),
    readFile(terrainTokenMapPath, "utf8").then(JSON.parse),
  ]);
  if (battleTemplates.stages?.length !== 44 || terrainTokenMap.stages?.length !== 44) {
    throw new Error("expected 44 battle-template and terrain-mapping stages");
  }

  const width = GRID_WIDTH * MINIMAP_CELL_WIDTH;
  const height = GRID_HEIGHT * MINIMAP_CELL_HEIGHT;
  const entries = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const stage of battleTemplates.stages) {
    const mappingStage = terrainTokenMap.stages.find((entry) => entry.stage === stage.stage);
    if (mappingStage === undefined || mappingStage.bRecord !== stage.bRecord) {
      throw new Error(`stage ${stage.stage}: terrain mapping does not match B template`);
    }
    const tokenMappings = new Map(mappingStage.configuredMappings.map((entry) => [entry.token, entry]));
    const record = stage.bRecord.toString().padStart(4, "0");
    const template = parseBattleTemplate(
      await readFile(path.join(decodedDirectory, record, "00.raw")),
      record,
    );
    const pixels = Buffer.alloc(width * height * 4);
    fillPixels(pixels, width, height, palette.colors[0]);
    const usedColors = new Set();
    const occupancyCounts = { side1: 0, side2: 0, value255: 0 };
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        const token = template.terrainTokens[y * GRID_WIDTH + x];
        if (token === 0) {
          continue;
        }
        const mapping = tokenMappings.get(token);
        if (mapping === undefined) {
          throw new Error(`stage ${stage.stage}: token ${token} has no minimap-color mapping`);
        }
        const colorIndex = mapping.minimapColorIndex;
        const color = palette.colors[colorIndex];
        if (color === undefined) {
          throw new Error(`stage ${stage.stage}: invalid minimap color index ${colorIndex}`);
        }
        usedColors.add(colorIndex);
        fillRectangle(
          pixels,
          width,
          x * MINIMAP_CELL_WIDTH,
          y * MINIMAP_CELL_HEIGHT,
          MINIMAP_CELL_WIDTH,
          MINIMAP_CELL_HEIGHT,
          color,
        );
      }
    }
    if (includeOccupancy) {
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const side = template.sideOccupancyMap[y * GRID_WIDTH + x];
          const innerColorIndex = MINIMAP_OCCUPANCY_COLORS.get(side);
          if (innerColorIndex === undefined) {
            continue;
          }
          if (side === 1) occupancyCounts.side1 += 1;
          if (side === 2) occupancyCounts.side2 += 1;
          if (side === 0xff) occupancyCounts.value255 += 1;
          const pixelX = x * MINIMAP_CELL_WIDTH;
          const pixelY = y * MINIMAP_CELL_HEIGHT;
          fillRectangle(pixels, width, pixelX, pixelY, 4, 4, palette.colors[0]);
          fillRectangle(
            pixels,
            width,
            pixelX + 1,
            pixelY + 1,
            2,
            2,
            palette.colors[innerColorIndex],
          );
        }
      }
    }
    const output = `${stage.stage.toString().padStart(2, "0")}.png`;
    await writeFile(path.join(outputDirectory, output), encodeRgbaPng(width, height, pixels));
    entries.push({
      stage: stage.stage,
      stageKind: stage.stageKind,
      mapRecord: stage.bRecord,
      width,
      height,
      usedPaletteIndexes: [...usedColors].sort((left, right) => left - right),
      ...(includeOccupancy ? { occupancyCounts } : {}),
      output,
    });
  }
  const manifest = {
    format: includeOccupancy ?
      "ANGEL2 confirmed terrain and occupancy minimap renders" :
      "ANGEL2 confirmed terrain minimap renders",
    evidenceLevel: "C",
    palette: paletteName,
    stageCount: entries.length,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    cellWidth: MINIMAP_CELL_WIDTH,
    cellHeight: MINIMAP_CELL_HEIGHT,
    nativeTopLeft: { x: 485, y: 161 },
    nativeRule:
      "raw token 0 is skipped; every other token resolves through the B descriptor table and UN/0056 page 1 to the VGA color of a 3x3 minimap cell",
    ...(includeOccupancy ? {
      occupancyRule: {
        values: {
          1: { outer: { width: 4, height: 4, colorIndex: 0 }, inner: { x: 1, y: 1, width: 2, height: 2, colorIndex: 10 } },
          2: { outer: { width: 4, height: 4, colorIndex: 0 }, inner: { x: 1, y: 1, width: 2, height: 2, colorIndex: 11 } },
          255: { outer: { width: 4, height: 4, colorIndex: 0 }, inner: { x: 1, y: 1, width: 2, height: 2, colorIndex: 15 } },
        },
        semanticCaution: "value 255 is confirmed as a white occupancy marker; its gameplay/business name remains unresolved",
      },
      occupancyNativeEvidence:
        "module29 0000:28DD/2904/2924 scan the full side map and call 0000:D050 with DS:18A3/18AD/18B7/18C1 rectangle structures",
    } : {}),
    nativeEvidence:
      "module29 0000:285D/2884 scan 50x50 cells at three-pixel steps; 0000:28A4 resolves the second UN/0056 page; 0000:D050 draws the solid rectangle",
    entries,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`rendered all ${entries.length} ${includeOccupancy ? "terrain/occupancy" : "terrain"} minimaps`);
  return manifest;
}

async function renderAll(
  decodedDirectory,
  battleTemplatesPath,
  outputDirectory,
  paletteName = "gameplay",
) {
  const entries = [];
  for (let stage = 0; stage < 44; stage += 1) {
    const output = `${stage.toString().padStart(2, "0")}.png`;
    const metadata = await renderMap(
      decodedDirectory,
      battleTemplatesPath,
      stage,
      path.join(outputDirectory, output),
      paletteName,
    );
    entries.push({
      stage: metadata.stage,
      stageKind: metadata.stageKind,
      tilesetRecord: metadata.tilesetRecord,
      mapRecord: metadata.mapRecord,
      width: metadata.gridWidth * metadata.tileWidth,
      height: metadata.gridHeight * metadata.tileHeight,
      invalidTileReferences: metadata.invalidReferences.length,
      output,
      metadata: `${output}.json`,
    });
  }
  const manifest = {
    format: "ANGEL2 confirmed 50x50 battle-map renders",
    evidenceLevel: "C",
    palette: paletteName,
    stageCount: entries.length,
    tileCountPerTileset: TILE_COUNT,
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    nativeViewport: { columns: 10, rows: 7, xPixelStep: 40, yPixelStep: 44 },
    allTileReferencesValid: entries.every((entry) => entry.invalidTileReferences === 0),
    entries,
  };
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`rendered all ${entries.length} mapped battle stages`);
  return manifest;
}

function usage() {
  return (
    "usage: angel2-battle-map.mjs --render DECODED_B_DIR " +
    "battle-templates.json STAGE OUTPUT.png [gameplay|intro|ega]\n" +
    "   or: angel2-battle-map.mjs --render-all DECODED_B_DIR " +
    "battle-templates.json OUTPUT_DIR [gameplay|intro|ega]\n" +
    "   or: angel2-battle-map.mjs --render-minimap-all DECODED_B_DIR " +
    "battle-templates.json terrain-token-map.json OUTPUT_DIR [gameplay|intro|ega]\n" +
    "   or: angel2-battle-map.mjs --render-minimap-occupancy-all DECODED_B_DIR " +
    "battle-templates.json terrain-token-map.json OUTPUT_DIR [gameplay|intro|ega]"
  );
}

async function main() {
  const args = process.argv.slice(2);
  const [command, decodedDirectory, battleTemplatesPath] = args;
  if (command === "--render-minimap-all" || command === "--render-minimap-occupancy-all") {
    const [, , , terrainTokenMapPath, outputDirectory, palette = "gameplay"] = args;
    if (outputDirectory === undefined) {
      throw new Error(usage());
    }
    await renderMinimapAll(
      decodedDirectory,
      battleTemplatesPath,
      terrainTokenMapPath,
      outputDirectory,
      palette,
      command === "--render-minimap-occupancy-all",
    );
    return;
  }
  if (command === "--render-all") {
    const [, , , outputDirectory, palette = "gameplay"] = args;
    if (outputDirectory === undefined) {
      throw new Error(usage());
    }
    await renderAll(decodedDirectory, battleTemplatesPath, outputDirectory, palette);
    return;
  }
  const [, , , stageIndexText, outputFile, palette = "gameplay"] = args;
  if (command !== "--render" || outputFile === undefined || !/^\d+$/.test(stageIndexText)) {
    throw new Error(usage());
  }
  await renderMap(
    decodedDirectory,
    battleTemplatesPath,
    Number.parseInt(stageIndexText, 10),
    outputFile,
    palette,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { parseBattleTemplate, renderAll, renderMap, renderMinimapAll };
