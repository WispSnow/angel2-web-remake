#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE_DATA_LINEAR_BASE = 0x1eba0;
const GRID_WIDTH = 50;
const GRID_HEIGHT = 50;
const TEMPLATE_BYTES = 8506;
const SIDE_MAP_OFFSET = 5256;

const CODE_SIGNATURES = [
  ["0000:2530", 0x2530, "bedc18e81aabe82403", "builds the minimap terrain/background before saving its four VGA planes"],
  ["0000:263B", 0x263b, "8b1621fb8b1e23fb81fae501721481fa7b02", "tests the mouse position against the minimap before accepting a click"],
  ["0000:2681", 0x2681, "33d2a19053bb0300f7e305e501a35318", "maps saved viewport-origin X to minimap pixels with 485 + 3*x"],
  ["0000:26DE", 0x26de, "e8be0083fa597401c333d2a1cf18bb0300f7e3", "builds the white hover-preview rectangle from the clamped preview origin"],
  ["0000:2744", 0x2744, "833e5318007418be5318e8ffa8be5d18e8f9a8", "draws the four current-viewport rectangle edges"],
  ["0000:279F", 0x279f, "a121fb8b1e23fb3de501721481fa7b02", "converts minimap mouse pixels to board coordinates"],
  ["0000:27EB", 0x27eb, "8b16813183c2063916cb1873098b1681318916cf18c3", "clamps hover-preview X origin"],
  ["0000:2824", 0x2824, "8b16853183c2043916cd1873098b1685318916d118c3", "clamps hover-preview Y origin"],
  ["0000:285D", 0x285d, "c7063a180000c70630180000c7063618a100b93200", "scans 50 minimap terrain rows at three-pixel steps"],
  ["0000:28DD", 0x28dd, "c7063a180000c7063618a100c70630180000b93200", "scans 50 minimap occupancy rows at three-pixel steps"],
  ["0000:2924", 0x2924, "a124008ec08b363218268a0c80f902740b80f901742d80f9ff", "dispatches only side-map values 2, 1, and 255"],
  ["0000:7CE2", 0x7ce2, "33d2bb3200f7f389168c53a38e53c3", "splits a linear 50-column cell index into cursor/focus x and y"],
  ["0000:7CF1", 0x7cf1, "33d2a18e53bb3200f7e303068c53a38857", "recombines cursor/focus x and y into a linear cell index"],
  ["0000:7D2D", 0x7d2d, "e80400e83a00c3", "re-centers and clamps both viewport axes"],
  ["0000:7D34", 0x7d34, "8b16813183c20639168c5373098b16813189169053c3", "clamps battle viewport X from cursor/focus X"],
  ["0000:7D6D", 0x7d6d, "8b16853183c20539168e5373098b16853189169253c3", "clamps battle viewport Y from cursor/focus Y"],
  ["0000:D050", 0xd050, "1eb8ba1e8ed8ad8bd0a346f5ada348f5", "reads a five-word solid VGA rectangle descriptor"],
];

const DATA_SIGNATURES = [
  ["DS:1853", 0x1853, "000000001d0001000000000000001d00010000000000000001001400000000000000010014000000", "four black current-viewport edges: 29x1 and 1x20"],
  ["DS:187B", 0x187b, "000000001d0001000f00000000001d0001000f0000000000010014000f0000000000010014000f00", "four white hover-preview edges: 29x1 and 1x20"],
  ["DS:18A3", 0x18a3, "0000000004000400000000000000020002000b0000000000020002000a0000000000020002000f00", "occupancy rectangles: black 4x4 plus side-2/side-1/value-255 2x2 colors 11/10/15"],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function verifySignatures(moduleBuffer, signatures, data = false) {
  return signatures.map(([address, relativeOffset, hex, meaning]) => {
    const offset = relativeOffset + (data ? MODULE_DATA_LINEAR_BASE : 0);
    const expected = Buffer.from(hex, "hex");
    const actual = moduleBuffer.subarray(offset, offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${address}: native signature mismatch at file offset 0x${offset.toString(16)}`);
    }
    return { address, fileOffset: offset, bytes: expected.length, sha256: sha256(actual), meaning };
  });
}

async function extract(modulePath, decodedBDirectory, battleTemplatesPath, outputPath) {
  const [moduleBuffer, battleTemplates] = await Promise.all([
    readFile(modulePath),
    readFile(battleTemplatesPath, "utf8").then(JSON.parse),
  ]);
  if (battleTemplates.stages?.length !== 44) {
    throw new Error("expected 44 mapped battle stages");
  }

  const valueCounts = new Map();
  const stageCounts = [];
  let occupiedEdgeCells = 0;
  for (const stage of battleTemplates.stages) {
    const record = stage.bRecord.toString().padStart(4, "0");
    const template = await readFile(path.join(decodedBDirectory, record, "00.raw"));
    if (template.length !== TEMPLATE_BYTES) {
      throw new Error(`${record}: expected ${TEMPLATE_BYTES} bytes, got ${template.length}`);
    }
    const counts = new Map();
    for (let cell = 0; cell < GRID_WIDTH * GRID_HEIGHT; cell += 1) {
      const value = template[SIDE_MAP_OFFSET + cell];
      counts.set(value, (counts.get(value) ?? 0) + 1);
      valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
      if ((value === 1 || value === 2 || value === 0xff) &&
          (cell % GRID_WIDTH === GRID_WIDTH - 1 || Math.floor(cell / GRID_WIDTH) === GRID_HEIGHT - 1)) {
        occupiedEdgeCells += 1;
      }
    }
    stageCounts.push({
      stage: stage.stage,
      bRecord: stage.bRecord,
      counts: Object.fromEntries([...counts].sort((a, b) => a[0] - b[0])),
    });
  }

  const result = {
    format: "ANGEL2 native battle-minimap rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    evidenceLevel: "C",
    sources: {
      module: { path: modulePath, bytes: moduleBuffer.length, sha256: sha256(moduleBuffer) },
      battleTemplates: battleTemplatesPath,
      decodedBDirectory,
    },
    verifiedCodeSignatures: verifySignatures(moduleBuffer, CODE_SIGNATURES),
    verifiedDataSignatures: verifySignatures(moduleBuffer, DATA_SIGNATURES, true),
    geometry: {
      grid: { columns: 50, rows: 50 },
      nativeTopLeft: { x: 485, y: 161 },
      cellPixels: { width: 3, height: 3 },
      terrainPixels: { width: 150, height: 150 },
      battleViewport: { columns: 10, rows: 7 },
      viewportBorder: {
        colorIndex: 0,
        horizontal: { width: 29, height: 1 },
        vertical: { width: 1, height: 20 },
        totalOuterExtent: { width: 30, height: 21 },
      },
      hoverPreviewBorder: { sameGeometryAsViewportBorder: true, colorIndex: 15 },
    },
    layers: [
      "saved four-plane minimap background containing terrain and panel decoration",
      "current battle viewport border in palette color 0",
      "mouse-hover preview viewport border in palette color 15 when the pointer is inside the minimap",
      "occupancy markers, drawn after the viewport borders during refresh",
    ],
    occupancy: {
      source: "50x50 side/occupancy map (odd B record offset 5256; runtime segment pointer DS:0024)",
      observedValueDomain: [...valueCounts.keys()].sort((a, b) => a - b),
      totalValueCounts: Object.fromEntries([...valueCounts].sort((a, b) => a[0] - b[0])),
      stageCounts,
      rules: {
        1: { outer: [4, 4, 0], inner: [1, 1, 2, 2, 10] },
        2: { outer: [4, 4, 0], inner: [1, 1, 2, 2, 11] },
        255: { outer: [4, 4, 0], inner: [1, 1, 2, 2, 15], semanticStatus: "white occupancy marker; business name unresolved" },
      },
      occupiedEdgeCells,
    },
    viewportState: {
      savedWarWords: [
        { decodedOffset: 0, native: "DS:5390", meaning: "viewport origin X / top-left column" },
        { decodedOffset: 2, native: "DS:5392", meaning: "viewport origin Y / top-left row" },
        { decodedOffset: 4, native: "DS:538C", meaning: "battlefield cursor/focus X / column" },
        { decodedOffset: 6, native: "DS:538E", meaning: "battlefield cursor/focus Y / row" },
      ],
      linearIndexConversions: {
        cursorFocus: "index = cursorFocusY * 50 + cursorFocusX",
        viewportOrigin: "index = viewportOriginY * 50 + viewportOriginX",
      },
      recenterClamp: {
        x: "if focusX < minX+6 then minX; else if focusX > maxX-7 then maxX-11; else focusX-4",
        y: "if focusY < minY+5 then minY; else if focusY > maxY-5 then maxY-8; else focusY-3",
      },
      minimapClick: "a primary-button click inside the minimap uses hoverOriginX+4 and hoverOriginY+3 as focus, then invokes the same recenter clamp",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`verified ${result.verifiedCodeSignatures.length} minimap code signatures`);
  console.log(`verified ${result.verifiedDataSignatures.length} minimap data signatures`);
  console.log(`wrote ${outputPath}`);
}

const [modulePath, decodedBDirectory, battleTemplatesPath, outputPath] = process.argv.slice(2);
if ([modulePath, decodedBDirectory, battleTemplatesPath, outputPath].some((value) => value === undefined)) {
  console.error("usage: angel2-minimap-rules.mjs MODULE29.bin DECODED_B_DIR battle-templates.json OUTPUT.json");
  process.exitCode = 1;
} else {
  extract(modulePath, decodedBDirectory, battleTemplatesPath, outputPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
