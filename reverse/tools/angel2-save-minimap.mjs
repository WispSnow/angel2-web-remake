#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PALETTES, encodeRgbaPng } from "./angel2-planar.mjs";

const GRID = 50;
const CELL_PIXELS = 3;
const OUTPUT_PIXELS = GRID * CELL_PIXELS;
const SAVE_BYTES = 11972;
const TERRAIN_MAP_OFFSET = 5308;
const UNIT_MAP_OFFSET = 8;
const SIDE_MAP_OFFSET = 2508;
const DESCRIPTOR_OFFSET = 10688;
const TERRAIN_PAGE_BYTES = 2200;
const OCCUPANCY_COLORS = new Map([[1, 10], [2, 11], [0xff, 15]]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function fillRectangle(pixels, x, y, width, height, color) {
  for (let row = Math.max(0, y); row < Math.min(OUTPUT_PIXELS, y + height); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(OUTPUT_PIXELS, x + width); column += 1) {
      const offset = (row * OUTPUT_PIXELS + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

function drawViewportBorder(pixels, originX, originY, color) {
  const x = originX * CELL_PIXELS;
  const y = originY * CELL_PIXELS;
  fillRectangle(pixels, x, y, 29, 1, color);
  fillRectangle(pixels, x, y + 20, 29, 1, color);
  fillRectangle(pixels, x, y, 1, 20, color);
  fillRectangle(pixels, x + 29, y, 1, 20, color);
}

async function render(decodedDirectory, terrainResourcePath, outputDirectory, paletteName = "gameplay") {
  const palette = PALETTES[paletteName];
  if (palette === undefined) {
    throw new Error(`unknown palette ${paletteName}`);
  }
  const terrainResource = await readFile(terrainResourcePath);
  if (terrainResource.length !== TERRAIN_PAGE_BYTES * 2) {
    throw new Error(`expected a 4400-byte UN/0056 terrain resource, got ${terrainResource.length}`);
  }

  await mkdir(outputDirectory, { recursive: true });
  const entries = [];
  for (let slot = 0; slot < 5; slot += 1) {
    const fileName = `WAR${slot}.TST.decoded.bin`;
    const state = await readFile(path.join(decodedDirectory, fileName));
    if (state.length !== SAVE_BYTES) {
      throw new Error(`${fileName}: expected ${SAVE_BYTES} bytes, got ${state.length}`);
    }
    const viewportState = {
      viewportOriginX: state.readUInt16LE(0),
      viewportOriginY: state.readUInt16LE(2),
      cursorFocusX: state.readUInt16LE(4),
      cursorFocusY: state.readUInt16LE(6),
    };
    const pixels = Buffer.alloc(OUTPUT_PIXELS * OUTPUT_PIXELS * 4);
    fillRectangle(pixels, 0, 0, OUTPUT_PIXELS, OUTPUT_PIXELS, palette.colors[0]);
    const usedTerrainColors = new Set();
    for (let cell = 0; cell < GRID * GRID; cell += 1) {
      const token = state[TERRAIN_MAP_OFFSET + cell];
      if (token === 0) {
        continue;
      }
      const descriptor = state.readUInt16LE(DESCRIPTOR_OFFSET + token * 2);
      const colorIndex = terrainResource[TERRAIN_PAGE_BYTES + descriptor];
      if (descriptor >= TERRAIN_PAGE_BYTES || colorIndex > 15) {
        throw new Error(`${fileName}: invalid token ${token} descriptor/color mapping`);
      }
      usedTerrainColors.add(colorIndex);
      fillRectangle(
        pixels,
        (cell % GRID) * CELL_PIXELS,
        Math.floor(cell / GRID) * CELL_PIXELS,
        CELL_PIXELS,
        CELL_PIXELS,
        palette.colors[colorIndex],
      );
    }

    drawViewportBorder(
      pixels,
      viewportState.viewportOriginX,
      viewportState.viewportOriginY,
      palette.colors[0],
    );

    const occupancyCounts = { side1: 0, side2: 0, value255: 0 };
    const activeInstances = [];
    for (let cell = 0; cell < GRID * GRID; cell += 1) {
      const side = state[SIDE_MAP_OFFSET + cell];
      const colorIndex = OCCUPANCY_COLORS.get(side);
      if (colorIndex === undefined) {
        continue;
      }
      if (side === 1) occupancyCounts.side1 += 1;
      if (side === 2) occupancyCounts.side2 += 1;
      if (side === 0xff) occupancyCounts.value255 += 1;
      const x = cell % GRID;
      const y = Math.floor(cell / GRID);
      if (side === 1 || side === 2) {
        activeInstances.push({ x, y, side, rawUnitIndex: state[UNIT_MAP_OFFSET + cell] });
      }
      fillRectangle(pixels, x * CELL_PIXELS, y * CELL_PIXELS, 4, 4, palette.colors[0]);
      fillRectangle(pixels, x * CELL_PIXELS + 1, y * CELL_PIXELS + 1, 2, 2, palette.colors[colorIndex]);
    }

    const output = `WAR${slot}.png`;
    await writeFile(path.join(outputDirectory, output), encodeRgbaPng(OUTPUT_PIXELS, OUTPUT_PIXELS, pixels));
    entries.push({
      slot,
      source: fileName,
      decodedSha256: sha256(state),
      viewportState,
      occupancyCounts,
      activeInstances,
      usedTerrainPaletteIndexes: [...usedTerrainColors].sort((a, b) => a - b),
      output,
    });
  }

  const manifest = {
    format: "ANGEL2 numbered-save native minimap reconstructions",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    evidenceLevel: "C",
    palette: paletteName,
    width: OUTPUT_PIXELS,
    height: OUTPUT_PIXELS,
    layerOrder: ["terrain", "black current-viewport border", "occupancy markers"],
    hoverPreviewOmitted: "mouse position is not serialized in the numbered save state",
    nativeEvidence: "module29 0000:25ED refreshes the saved minimap background, calls 0000:2744 for viewport edges, then 0000:28DD for occupancy; 0000:2681 derives the border from DS:5390/5392",
    terrainResource: { path: terrainResourcePath, sha256: sha256(terrainResource) },
    entries,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`rendered ${entries.length} numbered-save minimaps`);
}

const [decodedDirectory, terrainResourcePath, outputDirectory, palette = "gameplay"] = process.argv.slice(2);
if (outputDirectory === undefined) {
  console.error("usage: angel2-save-minimap.mjs DECODED_SAVE_DIR UN56.raw OUTPUT_DIR [gameplay|intro|ega]");
  process.exitCode = 1;
} else {
  render(decodedDirectory, terrainResourcePath, outputDirectory, palette).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
