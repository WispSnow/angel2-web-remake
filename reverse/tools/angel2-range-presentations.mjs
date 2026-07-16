#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  PALETTES,
  composePlanarImage,
  encodeRgbaPng,
  rawTileBundle,
} from "./angel2-planar.mjs";

const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const MODULE29_DATA_BASE = 0x1eba0;
const GRID_WIDTH = 50;
const GRID_HEIGHT = 50;
const GRID_BYTES = GRID_WIDTH * GRID_HEIGHT;
const VIEWPORT_WIDTH = 10;
const VIEWPORT_HEIGHT = 7;
const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const TILE_BYTES_PER_PLANE = 220;
const TILE_COUNT = 128;
const TILES_BYTES_PER_PLANE = TILE_BYTES_PER_PLANE * TILE_COUNT;

const CODE_SIGNATURES = [
  ["0000:FFF0", 0x0fff0, 0x1001a, "bind terrain, range-scratch, unit-slot, side and tileset runtime segments", "bb4ad7d9730dc3a6c71415d4b46e2e041e3a3f080522ee4c27f6413b79802bfd"],
  ["0000:388A", 0x0388a, 0x038f5, "draw all four planes through the full-brightness or grid-lined terrain blitter", "85b7119c0c872e53073112d9daa8c28d18caf36cdd5ac6cb2120c4ab67c02a41"],
  ["0000:38F5", 0x038f5, 0x03960, "draw all four planes through the dither-mask terrain blitter", "c225cd1d9dca001d31a4b2e616a952f2bf1650e1b90785ac4e3febbfef748d37"],
  ["0000:3960", 0x03960, 0x03dca, "copy one complete 40x44 terrain plane, optionally dispatching the grid-lined variant", "d066242aa9f2eeea2acb80daf74a393e72bb44f793e0995107ef505b76e32534"],
  ["0000:3DCA", 0x03dca, 0x0427a, "copy one 40x44 terrain plane with the native map-grid edge treatment", "4d7777fabb8172aa70cbc3d9f27f83d409b13a483338a5830b9a9162bcf1fac5"],
  ["0000:427A", 0x0427a, 0x047ea, "copy one 40x44 terrain plane through alternating 11h/44h row masks", "c227a1935fc251499961bc5e82063d9ab44baf2ac3f07e22d060c58766d09e1a"],
  ["0000:7097", 0x07097, 0x07113, "build ordinary-attack targets, branch on zero/one/multiple targets and commit or cancel", "e8747fd3b82fdac980feac2dba6e7329a0f9dcec510476d079c894edc263ce3a"],
  ["0000:7113", 0x07113, 0x07148, "manual ordinary-attack target loop uses the scratch-map byte as its acceptance gate", "3f6d25bc02cd1e4218c038a4397942430865b6cec0629d42e001c6a1dba76323"],
  ["0000:7148", 0x07148, 0x0716d, "choose the only nonzero ordinary-attack direction slot without opening the target loop", "c783034d08e350c07a8b3c9a3dbf6180b400e918d9be6d0d450ab9b42856e76d"],
  ["0000:716D", 0x0716d, 0x0719b, "assign native shooting seeds 5, 8 or 6 from the current class code", "a8077fc28f1bf84fddf965450ec199397b3bd545e01e9897044d4daf78b3f026"],
  ["0000:719B", 0x0719b, 0x071de, "build the shooting range, run target selection and restore on cancellation", "0378c398b42fa311168da1e8c8a585e3785535699599e45c245205316dec5c85"],
  ["0000:71E8", 0x071e8, 0x0722b, "shooting target loop requires a nonzero scratch byte and side value greater than one", "bc3f18cf546e403cf534487e8e69a7b6b33cd347ef3b1b8510041d18a791667b"],
  ["0000:7310", 0x07310, 0x07336, "build player movement range, run destination selection and restore all-one neutral state", "4872a3efbdb3de9f599e809a7ebeb8b97a49df3200903c02049aac7cd0923e7f"],
  ["0000:734C", 0x0734c, 0x07426, "movement loop requires nonzero scratch and an empty unit-slot map destination", "799c6ca5c34bbaf9067cf061707e91767bedc63dfeca548ebba29d45de1dc16a"],
  ["0000:7632", 0x07632, 0x076a1, "build general targeted-technique range, select a validated occupied target and restore on cancel", "628cbac42c3b511204335d775d6b53fd910560f984059dcb6a6d81b65ab66307"],
  ["0000:76C0", 0x076c0, 0x076da, "build range-five construction map, run empty-cell selector and restore all-one neutral state", "f22405c203b053934be5a8c9459d83c224712732c4d2ba89f5b49a02c781e6e3"],
  ["0000:76DC", 0x076dc, 0x07720, "general technique target loop combines scratch, occupancy and action-specific validation", "e077dbce0f2eb3965b1f400b6c679cb2ce025c9060f463d274b3e59582329973"],
  ["0000:772D", 0x0772d, 0x077cd, "construction selector combines scratch and empty-cell gates before changing terrain", "f4046916cce9d31655d50f96077f39073ebe41a5c3de9915f39b60342e517d46"],
  ["0000:785E", 0x0785e, 0x07880, "return the focused range-scratch byte only while the pointer is over the battle viewport", "e6248655c75dd9f190f4cd2bd788cc5dbc7562e3b77e36a7dd1e099ff67642d3"],
  ["0000:7C00", 0x07c00, 0x07c20, "refresh both VGA pages before entering a target or destination selection loop", "c6647d28cde321067eabf88af50e95761de6a7110c26bae37d17c11cfdf0b1fb"],
  ["0000:7E2A", 0x07e2a, 0x07e6c, "load terrain, side, unit-slot and range-scratch bytes for one visible battle cell", "cb024451eb17f5796ea4acc79f1604419465d22d03cb53eef07b1ff782b946d9"],
  ["0000:7E6C", 0x07e6c, 0x07edd, "compare and update four source-byte caches independently for both VGA pages", "5d66a501c7e9e336a808c5998cb87787451884d2fc3d6ec5e652b18f40cc630b"],
  ["0000:7EDD", 0x07edd, 0x07f2d, "draw low-seven-bit visible map-effect sprite codes 1..127 through descriptor 0205h", "50ab07405c4f4b89bf80aefaabc745bf5c71453d06e9daece3243d4da743a1b4"],
  ["0000:8273", 0x08273, 0x082a4, "apply the shared text-color override for high-bit map-effect codes 81h..83h", "ea30230b0c0d8ed897f5f5a62bca0e56820390bcbbe58ca83eb483c1e78eda90"],
  ["0000:82A4", 0x082a4, 0x082cd, "dispatch nonzero scratch cells to full terrain and zero cells to dither-masked terrain", "26c3845369ef853ec5a81b8c6faa90f9c6f74ad5984470b21858715c40efd90d"],
  ["1000:39D4", 0x139d4, 0x139f5, "clear, seed, propagate and finalize the shared 50x50 range-scratch map", "628247f4254094f3b92ec45620357fd28e6e1c468021e90299ec55a3671cc826"],
  ["1000:3A6C", 0x13a6c, 0x13a8c, "clear all 2500 scratch bytes or restore all 2500 bytes to one", "229ad64d83f473e5b881f2b470922d89f48edd847a9aa4090131a1dbb6569791"],
  ["1000:3EF7", 0x13ef7, 0x13f6d, "ordinary attack clears the map and marks occupied orthogonal cells whose side differs from side one", "69328a3fac9a582788fc1b4fee44ce7331a502f7cbacb612a8e1a7c14fec86b7"],
  ["1000:3F84", 0x13f84, 0x13fc2, "shooting selects its excluded side, builds mode-two range and runs post-filters", "5022045d7df02945ceb546b095098cfd4e8f8e048f84cdcd03477c4c1bb097e7"],
  ["1000:4014", 0x14014, 0x14034, "clear shooter origin and its four orthogonal neighbors from the shooting map", "8d27ee9c6a6ce1ddc1301ec4fdbf6cb4e7a1d3dddbd0904edb5843f8a95daf37"],
  ["1000:4034", 0x14034, 0x1407e, "count reachable occupied cells whose side differs from the selected excluded side", "a6c0493d4ed579eb30adba734225d87d75c50cf8996de2a4c3e5de7d5556245d"],
  ["1000:40C2", 0x140c2, 0x140cd, "force mode zero and build a general targeted-technique range map", "0afd5799b1b46c3d1c13ba3fd786e99414d8c6986d81ccbf00e6e589a4efd111"],
  ["1000:84E0", 0x184e0, 0x1853a, "project a rectangular technique descriptor from a 50x50 origin into the visible 10x7 cache", "0f29632cf8561f9d3234dd186ba061d51982b8000f37f0762c4621130dbd83ee"],
  ["1000:853A", 0x1853a, 0x18596, "clip and write one nonzero descriptor word to DS:58A5 while invalidating both page caches", "20094b536c6d1458fa99e34f57d96ed0c97910feb5b3094ce02c5ede2c274c59"],
];

const DATA_SIGNATURES = [
  ["DS:58A5-58EA", 0x58a5, 0x58eb, "initial zero-filled 70-byte visible map-effect sprite cache", "82fcfd5215175da9e65ca7c4fb927a1fb0e61f09d54987c368e8e16ebd9c2969"],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function verifySignatures(module29) {
  assert.equal(sha256(module29), MODULE29_SHA256, "module 29 hash mismatch");
  const code = CODE_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = module29.subarray(start, end);
    assert.equal(sha256(bytes), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: start, bytes: bytes.length, role, sha256: expected };
  });
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = module29.subarray(MODULE29_DATA_BASE + start, MODULE29_DATA_BASE + end);
    assert.equal(sha256(bytes), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: MODULE29_DATA_BASE + start, bytes: bytes.length, role, sha256: expected };
  });
  return { code, data };
}

function mostFrequentNonzero(values) {
  const counts = new Map();
  for (const value of values) {
    if (value !== 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  assert(counts.size > 0, "representative battle template contains no nonzero terrain token");
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
}

function applyNativeDither(image) {
  const pixels = Buffer.from(image.pixels);
  let retainedPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    const mask = y % 2 === 0 ? 0x11 : 0x44;
    for (let x = 0; x < image.width; x += 1) {
      const retained = (mask & (0x80 >>> (x & 7))) !== 0;
      const offset = (y * image.width + x) * 4;
      if (retained) {
        retainedPixels += 1;
      }
      else {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
      pixels[offset + 3] = 255;
    }
  }
  return { ...image, pixels, retainedPixels };
}

function blitScaled(target, targetWidth, source, targetX, targetY, scale) {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = targetX + sourceX * scale + dx;
          const y = targetY + sourceY * scale + dy;
          const targetOffset = (y * targetWidth + x) * 4;
          source.pixels.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
        }
      }
    }
  }
}

function fill(pixels, color) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
}

async function buildRepresentativeComparison(decodedBRoot, battleTemplatesPath) {
  const battleTemplates = JSON.parse(await readFile(battleTemplatesPath, "utf8"));
  const stage = battleTemplates.stages.find((candidate) => candidate.stage === 0);
  assert.equal(stage?.bRecord, 1, "stage zero must use B/1 template and B/0 tileset");
  const [template, ...planeBuffers] = await Promise.all([
    readFile(path.join(decodedBRoot, "0001", "00.raw")),
    ...Array.from({ length: 4 }, (_, plane) =>
      readFile(path.join(decodedBRoot, "0000", `${plane.toString().padStart(2, "0")}.raw`))),
  ]);
  assert.equal(template.length, 8506, "B/1 battle template size changed");
  for (const [plane, buffer] of planeBuffers.entries()) {
    assert.equal(buffer.length, TILES_BYTES_PER_PLANE + 1024, `B/0 plane ${plane} size changed`);
    assert(buffer.subarray(TILES_BYTES_PER_PLANE).every((value) => value === 0), `B/0 plane ${plane} zero tail changed`);
  }
  const terrainTokens = template.subarray(256, 256 + GRID_BYTES);
  const [token, occurrences] = mostFrequentNonzero(terrainTokens);
  const planes = planeBuffers.map((buffer, plane) => rawTileBundle(
    buffer.subarray(0, TILES_BYTES_PER_PLANE),
    TILE_WIDTH,
    TILE_HEIGHT,
    `B/0 plane ${plane}`,
  ));
  assert(planes.every((plane) => plane.images.length === TILE_COUNT), "B/0 tile count changed");
  const opaque = composePlanarImage(planes, token, null, PALETTES.gameplay.colors);
  const dithered = applyNativeDither(opaque);
  assert.equal(dithered.retainedPixels, TILE_WIDTH * TILE_HEIGHT / 4, "native dither must retain exactly one quarter of terrain pixels");

  const scale = 4;
  const gap = 16;
  const width = TILE_WIDTH * scale * 2 + gap;
  const height = TILE_HEIGHT * scale;
  const pixels = Buffer.alloc(width * height * 4);
  fill(pixels, PALETTES.gameplay.colors[0]);
  blitScaled(pixels, width, opaque, 0, 0, scale);
  blitScaled(pixels, width, dithered, TILE_WIDTH * scale + gap, 0, scale);
  return {
    png: encodeRgbaPng(width, height, pixels),
    metadata: {
      sourceStage: 0,
      tilesetRecord: 0,
      templateRecord: 1,
      terrainToken: token,
      occurrencesInStage: occurrences,
      sourcePlaneSha256: planeBuffers.map(sha256),
      palette: "gameplay",
      originalTile: { width: TILE_WIDTH, height: TILE_HEIGHT },
      comparison: { left: "nonzero scratch / full-brightness terrain", right: "zero scratch / 11h-44h dither-masked terrain", scale, gapPixels: gap },
      retainedPixels: dithered.retainedPixels,
      totalPixels: TILE_WIDTH * TILE_HEIGHT,
      retainedFraction: 0.25,
    },
  };
}

async function extract(module29Path, decodedBRoot, battleTemplatesPath, outputJsonPath, outputPngPath) {
  const module29 = await readFile(module29Path);
  const signatures = verifySignatures(module29);
  const comparison = await buildRepresentativeComparison(decodedBRoot, battleTemplatesPath);

  const output = {
    format: "ANGEL2 battle range, target-selection and visible map-effect presentation specification",
    evidenceLevel: "C",
    source: { module: 29, path: normalizePath(module29Path), sha256: MODULE29_SHA256 },
    verifiedCodeSignatures: signatures.code,
    verifiedDataSignatures: signatures.data,
    boardLayers: {
      terrainTokens: { pointer: "DS:01A7", runtimeSegment: "2EAFh", dimensions: [GRID_WIDTH, GRID_HEIGHT], bytes: GRID_BYTES, visibleRegister: "CL" },
      rangeScratch: { pointer: "DS:01A9", runtimeSegment: "2F4Ch", dimensions: [GRID_WIDTH, GRID_HEIGHT], bytes: GRID_BYTES, visibleRegister: "CH" },
      unitSlots: { pointer: "DS:0022", runtimeSegment: "3086h", dimensions: [GRID_WIDTH, GRID_HEIGHT], visibleRegister: "DL" },
      sideOccupancy: { pointer: "DS:0024", runtimeSegment: "3123h", dimensions: [GRID_WIDTH, GRID_HEIGHT], visibleRegister: "DH" },
      visibleMapEffects: { address: "DS:58A5", dimensions: [VIEWPORT_WIDTH, VIEWPORT_HEIGHT], bytes: VIEWPORT_WIDTH * VIEWPORT_HEIGHT, relation: "separate descriptor-projected sprite layer; not the range/target map" },
    },
    visibleCellCache: {
      pageA000: { terrain: "DS:578D", unitSlot: "DS:57D3", side: "DS:5819", rangeScratch: "DS:585F" },
      pageA800: { terrain: "DS:58EB", unitSlot: "DS:5931", side: "DS:5977", rangeScratch: "DS:59BD" },
      redrawRule: "redraw the cell when any of the four source bytes differs on the current VGA page",
      rangeChangeRule: "the scratch byte participates directly in both page caches, so a zero/nonzero transition redraws that cell",
    },
    rangeRendering: {
      neutralState: { value: 1, operation: "fill all 2500 bytes", function: "1000:3A7C", visual: "all terrain remains full brightness" },
      selectableState: { predicate: "scratch[cell] != 0", visual: "draw the full terrain tile; when 地图方格 is enabled, use the native grid-lined full-tile branch" },
      excludedState: { predicate: "scratch[cell] == 0", visual: "draw the same terrain tile after masking every plane; no separate colored range sprite is used" },
      mask: {
        evenRows: "0x11 repeated across all five source bytes",
        oddRows: "0x44 repeated across all five source bytes",
        bitOrder: "MSB first",
        retainedPixelsPerByte: 2,
        retainedFraction: 0.25,
        unretainedColorIndex: 0,
        dimensions: { width: TILE_WIDTH, height: TILE_HEIGHT, bytesPerRowPerPlane: 5 },
      },
      comparisonArtifact: { path: normalizePath(outputPngPath), sha256: sha256(comparison.png), ...comparison.metadata },
    },
    selectionContract: {
      inputGate: "0000:785E returns rangeScratch[focusedLinearCell] only while the pointer lies over the battle viewport; every manual destination/target loop rejects zero",
      refresh: "0000:7C00 updates cursor/view cells and redraws the 10x7 viewport on both VGA pages before waiting for input",
      primary: "a nonzero scratch byte is necessary but action-specific occupancy/faction validation can still reject the cell",
      secondary: "set action state CT and restore the action-specific saved cell/viewport/pointer state; surrounding action wrappers restore the scratch map to all ones",
    },
    actionBindings: {
      ordinaryAttack: {
        builder: "1000:3EF7 -> 3F04 -> near callback 0571h resolved at file offset 13F41h",
        geometry: "the four orthogonal cells in native order -50, -1, +50, +1",
        validCell: "sideOccupancy[cell] is nonzero and is not side 1",
        scratchValue: 1,
        branching: { zeroTargets: "show native no-target feedback and cancel", oneTarget: "copy the only nonzero directional target automatically", multipleTargets: "enter 0000:7113 manual loop" },
      },
      movement: {
        builder: "0000:7310 reads the current movement stat and calls the shared weighted/uniform range builder",
        validCell: "scratch[cell] != 0 and unitSlots[cell] == 0",
        valueMeaning: "nonzero values retain the movement propagation's remaining-range gradient; rendering and primary-input validation only test zero versus nonzero",
        cancelAndExit: "restore saved pre-move state as applicable, rebuild while continuing undo flow, then fill the scratch map with one when leaving the wrapper",
      },
      shooting: {
        classSeeds: [
          { classCode: "3A", seed: 5 },
          { classCode: "0I", seed: 8 },
          { classCode: "1I", seed: 6 },
          { classCode: "all other callers", seed: 5 },
        ],
        propagationMode: "2; uniform cost one and terrain-rule values 0/99 block propagation",
        postFilter: "clear shooter origin and all four orthogonal neighbors",
        selectableManhattanDistance: "2 through seed-1, subject to terrain propagation",
        playerTarget: "scratch[cell] != 0 and sideOccupancy[cell] > 1",
      },
      targetedTechniques: {
        builder: "the selected technique supplies DS:1F18; 1000:40C2 forces propagation mode 0 and calls the shared builder",
        commonTarget: "scratch[cell] != 0, occupancy is nonzero, and ANGEL2_VALIDATE_TECHNIQUE_TARGET accepts the action-specific faction/type rule",
        selfTargetExceptions: "C1..C4, JO and other direct branches bypass manual target selection and use the acting cell",
      },
      construction: {
        builder: "K1/K2 use seed 5 with mode M",
        validCell: "scratch[cell] != 0 and unitSlots[cell] == 0",
        result: "move to the chosen empty cell, then edit its four orthogonal terrain neighbors through the construction action code",
      },
    },
    visibleMapEffectLayer: {
      producer: {
        function: "1000:84E0",
        input: "AX is a 50x50 linear effect origin; SI begins xOffset, yOffset, width, height followed by width*height words",
        projection: "convert origin to x/y, add descriptor offsets, clip to viewport DS:5390/5392 and write the low byte to DS:58A5[(boardY-viewY)*10+(boardX-viewX)]",
        invalidation: "each nonzero visible write sets both per-page terrain-cache bytes to FFh to force composition",
      },
      consumers: {
        lowCodes: "1..127 draw frame code-1 through dynamic descriptor 0205h on both pages; 0, 83h and all high-bit codes skip this sprite path",
        highCodes: "81h, 82h and 83h all set the unit text/number foreground color field DS:F93C to palette index 15 before unit drawing",
      },
      boundary: "this 70-byte layer carries technique/map-effect sprite codes and must not be implemented as movement, attack or target-range storage",
    },
    evidenceBoundary: {
      confirmed: "all range-scratch producers used by player movement, ordinary attack, shooting, targeted techniques and construction; exact zero/nonzero terrain rendering; primary/secondary selection gates; neutral restoration; and the separate DS:58A5 descriptor projection/consumers",
      preservedUnknown: "low-level names for dynamic descriptor 0205h and high-bit codes 81h..83h, plus any visual behavior that depends on externally patched unreachable code; the released nominal native timer tick is 10.000151 ms",
      implementation: "frozen until the phase-1 GDD review passes",
    },
    validation: {
      codeSignatures: signatures.code.length,
      dataSignatures: signatures.data.length,
      boardBytes: GRID_BYTES,
      visibleCells: VIEWPORT_WIDTH * VIEWPORT_HEIGHT,
      ditherRetainedPixels: comparison.metadata.retainedPixels,
      ditherTotalPixels: comparison.metadata.totalPixels,
      implementationFrozen: true,
    },
  };

  await Promise.all([
    mkdir(path.dirname(outputJsonPath), { recursive: true }),
    mkdir(path.dirname(outputPngPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`),
    writeFile(outputPngPath, comparison.png),
  ]);
  console.log(`verified ${signatures.code.length} code and ${signatures.data.length} data signatures; wrote ${outputJsonPath} and ${outputPngPath}`);
}

function usage() {
  return "usage: angel2-range-presentations.mjs --extract MODULE29 DECODED_B_ROOT BATTLE_TEMPLATES OUTPUT_JSON OUTPUT_PNG";
}

const [command, ...args] = process.argv.slice(2);
if (command !== "--extract" || args.length !== 5) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(...args).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { extract };
