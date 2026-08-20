#!/usr/bin/env node

/**
 * Closes the "native glyph rasterization" gap that
 * `unit-detail-hud-presentations.json` left open: which font module 29 draws
 * the battle HUD, the round panel and the bottom stage label with, how the
 * cursor advances, how the outline is built, and how the numeric/identity
 * fields are formatted before they reach the drawer.
 *
 * The tool also proves the container-wide claim the glyph note could not make
 * before: every 16x15 glyph array in `A/B/UN` has a Big5 code table beside it,
 * and every array plus all 176 `NUM`/`CHA` script subsets are slices of one
 * single font -- no character maps to two different bitmaps anywhere.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_DATA_BASE = 0x1eba0;
const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const BIOS_FONT_SHA256 = "30458156768e070bc34ec72ed3485f002620da4619e4b4bab956779249aca363";
const BIG5 = new TextDecoder("big5", { fatal: true });

const GLYPH_WIDTH = 16;
const GLYPH_HEIGHT = 15;
const GLYPH_BYTES = 30;

const CODE_SIGNATURES = [
  ["0000:4C44", 0x4c44, 0x4cef, "draw the battle chrome, bottom label bar rectangles and the stage label", "d2bb8f494501e754e1939f217d19219f8cb10b450886662d0731b666c8b70d99"],
  ["0000:4F41", 0x4f41, 0x4fce, "select the stage label SAY record, swap in its NUM/CHA subset font and draw at (120,333)", "a6f75d99a6b7e545f858c9688bcb2afa280929317f99bd965461b7cec8661c5e"],
  ["0000:5006", 0x5006, 0x5029, "load the battle Big5 code table UN/58 and glyph array UN/59", "904d8b09d7f81a89001e32e2ba3c0b9362aea8ee5afc723e7b0a3ccdcc5be419"],
  ["0000:E84C", 0xe84c, 0xe896, "blit one masked sprite descriptor in a single colour", "e8a966ae80d1dfb71d2f2bfccf00733c5938341b9d08a3aef56543f43b46e4f6"],
  ["0000:EA04", 0xea04, 0xeada, "draw one dollar-terminated Big5 string from the cursor", "b348fab85fc5087c2fbfbaba994575f313bfe961726393f4670ff7832d602c21"],
  ["0000:EADA", 0xeada, 0xeae5, "fetch the next source byte", "da735893bcc5c42e21ea875db36b16310facea499aa7fcf9b907a71c27e70ee5"],
  ["0000:EAE5", 0xeae5, 0xeb1a, "linear code-table lookup for one Big5 pair", "fa66893e0db8b8c4cfeba1aa2df1d690da38b8ed50b0e4113fa756f201b7e426"],
  ["0000:EB1A", 0xeb1a, 0xeb34, "copy the 30-byte glyph into the draw descriptor", "1fe47e71cd55e399e274e2a9c54e2d0ff81e91bf2daff5b531b8c331e642a26b"],
  ["0000:EB34", 0xeb34, 0xeb6b, "dispatch one single-byte character", "1104ac9a48fb3d2897aab294d0a51e5219387899a44aea5218e464d09733a5bb"],
  ["0000:EB6B", 0xeb6b, 0xec6c, "draw the half-width outline passes in normal and compact mode", "c6792bfc9c8a6d9f23745571f990d5241ce3189c71d024685bab4cd5c4c5be43"],
  ["0000:EC6C", 0xec6c, 0xecae, "build the 8x16 half-width cell from the BIOS 8x8 ROM font at F000:FA6E", "90724b2071259963a69646e3b84c4eb96dd403cef07ae7968a1166397cd78c72"],
  ["0000:ECCC", 0xeccc, 0xed03, "build the 17-row full-width outline mask", "75d1082ec6a1c1b60b567898de57d515da8b9620f9bc59b3f9e4c7e0172b7174"],
  ["0000:ED03", 0xed03, 0xed2f, "build the half-width outline mask", "2e9de6d2f41694b8813355f91c07a0800e65840d41e2c38b6064a74f41b7e840"],
  ["0000:EF56", 0xef56, 0xefb8, "format a five-character numeric field with leading spaces", "290a690b6648db9de05fa62514993770e5a3a04f24f073731152ddce846d22dc"],
  ["0000:EFFE", 0xeffe, 0xf02d, "right-align the occupation field", "53abeb0ac5fb8e3be9893efc5d81bb698389471df33d0b7505142711ca8bd878"],
  ["0000:F051", 0xf051, 0xf080, "left-align the unit name field", "b8b54e4999640790016094794832b8d329ae0ad9142daf9e4bcdc162afe70920"],
];

const DATA_SIGNATURES = [
  ["DS:3051-3065", 0x3051, 0x3065, "bottom label bar rectangles", "9460803365cfe3d3bd6634a6993b9938f222c5325ee0ed6f817b10c60df7a32d"],
  ["DS:30BA-316A", 0x30ba, 0x316a, "stage number to label SAY record table", "f68057ef4b136bccd6521720fc562b5a54ac67bda5e2564e227926430b766fc0"],
  ["DS:5DEF-5E04", 0x5def, 0x5e04, "identity row occupation, separator and name buffers", "aa53206a55eebb825ea70e40eb3fd55b06bc775134c36a7447182687538ec1dc"],
  ["DS:5FD1-5FFD", 0x5fd1, 0x5ffd, "unit-detail body 50% checkerboard pattern descriptor", "2ad73edb89243394589e253c4ed97ec159bfb265bd87c9ae002a65d7356f6e72"],
  ["DS:600B-6018", 0x600b, 0x6018, "visible round template", "836f58133b97818e3038d57677279b6b1cbd09a9e5a3f39f9855871e9f97b736"],
];

/** Startup pointer-table order in `GO.EXE`; module 29 passes these in `BX`. */
const LOADER_CONTAINERS = [
  "A.SWF", "C.SWF", "D.SWF", "E.SWF", "MAGIC.SWF", "M_00.SWF", "Y_00.SWF",
  "SAY.SWF", "MUSIC.SWF", "NUM.SWF", "CHA.SWF", "BK.SWF", "B.SWF", "UN.SWF",
];

/**
 * Every 16x15 glyph array recovered from the indexed containers, paired with
 * the Big5 code table that indexes it. `raw-glyph-assets.md` only had the
 * `A/23`->`A/24` pair; the remaining eight are asserted here by length, by
 * terminator and by decoding every code as a valid Big5 pair.
 */
const GLYPH_ARRAYS = [
  ["A", 8, 7, "battle/UI command, status, terrain and system vocabulary"],
  ["A", 12, 13, "story fragments"],
  ["A", 23, 24, "module 23 title, intro and difficulty labels"],
  ["UN", 7, 8, "person, class and attribute names"],
  ["UN", 9, 10, "module 35 epilogue text"],
  ["UN", 41, 42, "module 21 password prompts"],
  ["UN", 58, 59, "module 29 battle font: the extended UI glyph set"],
  ["B", 92, 93, "installer and runtime error prompts"],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function word(buffer, offset) {
  return buffer.readUInt16LE(MODULE29_DATA_BASE + offset);
}

function dataSlice(buffer, start, end) {
  return buffer.subarray(MODULE29_DATA_BASE + start, MODULE29_DATA_BASE + end);
}

function dollarString(buffer, offset) {
  let end = MODULE29_DATA_BASE + offset;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  assert(end < buffer.length, `DS:${hex(offset)} lacks a dollar terminator`);
  const raw = buffer.subarray(MODULE29_DATA_BASE + offset, end);
  return { address: `DS:${hex(offset)}`, text: BIG5.decode(raw), big5Hex: raw.toString("hex").toUpperCase() };
}

/** Code-point index of `address` inside the Big5 template that starts at `start`. */
function characterIndexOf(buffer, start, address) {
  let index = 0;
  for (let offset = start; offset < address; index += 1) {
    offset += buffer[MODULE29_DATA_BASE + offset] > 0x7f ? 2 : 1;
    assert(offset <= address, `DS:${hex(address)} is not on a character boundary`);
  }
  return index;
}

function verifySignatures(buffer) {
  const code = CODE_SIGNATURES.map(([address, start, end, role, expected]) => {
    assert.equal(sha256(buffer.subarray(start, end)), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: start, bytes: end - start, role, sha256: expected };
  });
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    assert.equal(sha256(dataSlice(buffer, start, end)), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: MODULE29_DATA_BASE + start, bytes: end - start, role, sha256: expected };
  });
  return { code, data };
}

function parseRectangle(buffer, offset, id) {
  const [x, y, width, height, colorIndex] =
    Array.from({ length: 5 }, (_, index) => word(buffer, offset + index * 2));
  return { id, address: `DS:${hex(offset)}`, x, y, width, height, colorIndex };
}

/** `bytesPerRow`/`rows` header followed by the 1bpp rows 0000:E883 self-patches. */
function parsePattern(buffer, offset) {
  const bytesPerRow = word(buffer, offset);
  const rows = word(buffer, offset + 2);
  const data = dataSlice(buffer, offset + 4, offset + 4 + bytesPerRow * rows);
  return {
    address: `DS:${hex(offset)}`,
    bytesPerRow,
    rows,
    width: bytesPerRow * 8,
    rowsHex: Array.from({ length: rows }, (_, row) =>
      data.subarray(row * bytesPerRow, (row + 1) * bytesPerRow).toString("hex").toUpperCase()),
  };
}

function parseStageLabelTable(buffer) {
  const entries = [];
  for (let offset = 0x30ba; ; offset += 4) {
    const stage = word(buffer, offset);
    if (stage === 0xffff) return { address: "DS:30BA", entries, terminatorOffset: offset };
    entries.push({ stage, sayRecord: word(buffer, offset + 2) });
  }
}

function parseCodeTable(buffer, name) {
  assert.equal(buffer.length % 2, 0, `${name}: code table length is not a whole number of pairs`);
  assert.equal(buffer.readUInt16LE(buffer.length - 2), 0, `${name}: code table lacks its 0000 terminator`);
  const codes = [];
  for (let offset = 0; offset < buffer.length - 2; offset += 2) {
    const pair = buffer.subarray(offset, offset + 2);
    codes.push({ key: pair.toString("hex"), char: BIG5.decode(pair) });
  }
  return codes;
}

/**
 * Merges one code table + glyph array pair into the running font, asserting
 * that no character ever resolves to a second bitmap.
 */
function mergeFont(font, conflicts, codes, glyphs, source) {
  assert.equal(glyphs.length, codes.length * GLYPH_BYTES, `${source}: glyph array does not match its code table`);
  for (const [index, { key, char }] of codes.entries()) {
    const bitmap = glyphs.subarray(index * GLYPH_BYTES, (index + 1) * GLYPH_BYTES);
    const existing = font.get(key);
    if (existing === undefined) font.set(key, { char, bitmap });
    else if (!existing.bitmap.equals(bitmap)) conflicts.push({ source, char, key });
  }
}

async function readRecord(extractedRoot, container, record) {
  return readFile(path.join(extractedRoot, container, `${String(record).padStart(4, "0")}.bin`));
}

async function buildFont(extractedRoot) {
  const font = new Map();
  const conflicts = [];
  const arrays = [];
  for (const [container, tableRecord, glyphRecord, role] of GLYPH_ARRAYS) {
    const table = await readRecord(extractedRoot, container, tableRecord);
    const glyphs = await readRecord(extractedRoot, container, glyphRecord);
    const codes = parseCodeTable(table, `${container}/${tableRecord}`);
    mergeFont(font, conflicts, codes, glyphs, `${container}/${glyphRecord}`);
    arrays.push({
      container,
      codeTableRecord: tableRecord,
      glyphRecord,
      glyphCount: codes.length,
      role,
      codeTableSha256: sha256(table),
      glyphSha256: sha256(glyphs),
    });
  }
  const numNames = (await readdir(path.join(extractedRoot, "NUM")))
    .filter((name) => name.endsWith(".bin")).sort();
  let scriptGlyphs = 0;
  for (const name of numNames) {
    const record = Number(path.basename(name, ".bin"));
    const table = await readRecord(extractedRoot, "NUM", record);
    const glyphs = await readRecord(extractedRoot, "CHA", record);
    const codes = parseCodeTable(table, `NUM/${record}`);
    mergeFont(font, conflicts, codes, glyphs, `CHA/${record}`);
    scriptGlyphs += codes.length;
  }
  assert.deepEqual(conflicts, [], "a character resolves to two different bitmaps, so the sources are not one font");
  const ordered = [...font.entries()].sort(([left], [right]) => (left < right ? -1 : 1));
  return {
    arrays,
    scriptSubsets: { records: numNames.length, glyphInstances: scriptGlyphs },
    characters: ordered.map(([, value]) => value.char).join(""),
    big5Hex: ordered.map(([key]) => key.toUpperCase()),
    bitmaps: Buffer.concat(ordered.map(([, value]) => value.bitmap)),
  };
}

async function extract(modulePath, extractedRoot, biosFontPath, outputJsonPath) {
  const module29 = await readFile(modulePath);
  assert.equal(sha256(module29), MODULE29_SHA256, "module 29 image changed");
  const biosFont = await readFile(biosFontPath);
  assert.equal(biosFont.length, 2048, "the BIOS 8x8 ROM font dump must be 256 cells of 8 rows");
  assert.equal(sha256(biosFont), BIOS_FONT_SHA256, "BIOS 8x8 ROM font dump changed");

  const signatures = verifySignatures(module29);
  const font = await buildFont(extractedRoot);
  const battleTable = font.arrays.find((entry) => entry.container === "UN" && entry.glyphRecord === 59);
  assert(battleTable !== undefined, "the module 29 battle glyph array is missing");

  const stageLabels = parseStageLabelTable(module29);
  const labelTexts = new Map();
  for (const entry of stageLabels.entries) {
    if (entry.sayRecord === 0 || labelTexts.has(entry.stage)) continue;
    const say = await readRecord(extractedRoot, "SAY", entry.sayRecord);
    const end = say.indexOf(0x24);
    assert(end > 0, `SAY/${entry.sayRecord}: stage label lacks a dollar terminator`);
    const raw = say.subarray(0, end);
    labelTexts.set(entry.stage, {
      stage: entry.stage,
      sayRecord: entry.sayRecord,
      text: BIG5.decode(raw),
      big5Hex: raw.toString("hex").toUpperCase(),
    });
  }

  const output = {
    format: "angel2-battle-text/1",
    source: { module: path.basename(modulePath), sha256: MODULE29_SHA256, dataBase: `0x${MODULE29_DATA_BASE.toString(16)}` },
    verifiedCodeSignatures: signatures.code,
    verifiedDataSignatures: signatures.data,
    coordinateSpace: { width: 640, height: 350 },
    font: {
      loader: {
        function: "0000:5006",
        container: LOADER_CONTAINERS[13],
        loaderIndex: 13,
        codeTableRecord: 58,
        glyphRecord: 59,
      },
      glyphWidth: GLYPH_WIDTH,
      glyphHeight: GLYPH_HEIGHT,
      glyphBytes: GLYPH_BYTES,
      rowEncoding: "one big-endian uint16 per row, bit 15 leftmost",
      battleGlyphCount: battleTable.glyphCount,
      lookup: {
        function: "0000:EAE5",
        method: "linear scan of the loaded code table for the raw Big5 pair",
        scanLimitBytes: 0xbb8,
        sentinelWord: "2424",
        missBehaviour: "the scan returns the index it stopped on, so an absent character draws whatever glyph sits there; the remake skips it instead",
      },
      merged: {
        rationale: "every glyph array and every NUM/CHA script subset is a slice of one font",
        rawArrays: font.arrays,
        scriptSubsets: font.scriptSubsets,
        characterCount: font.characters.length,
        conflicts: 0,
        bitmapsSha256: sha256(font.bitmaps),
      },
    },
    halfWidthFont: {
      function: "0000:EC6C",
      source: "BIOS 8x8 ROM font at F000:FA6E",
      dump: { file: path.basename(biosFontPath), bytes: biosFont.length, sha256: BIOS_FONT_SHA256 },
      cellWidth: 8,
      romRows: 8,
      cellRows: 16,
      rowDoubling: "each ROM row is stored twice unless the compact-mode byte at CS:ECAD is 'N'",
      compactModeByte: { address: "CS:ECAD", releasedDefault: "Y" },
      codeRange: [0x20, 0x7f],
    },
    cursor: {
      function: "0000:EA04",
      terminators: ["$", "\r", "\u0000"],
      lineFeed: { character: "|", resetsToStartX: true, deltaY: 20 },
      advances: { fullWidth: 16, halfWidth: 9, halfWidthCompact: 8, space: 8, tab: 72 },
      trailingByteTerminators: ["\r", "\n"],
    },
    outline: {
      fullWidth: { function: "0000:ECCC", maskRows: 17, dilationRowOffsets: [0, 1, 2] },
      halfWidth: { function: "0000:ED03", maskRows: 16, dilationRowOffsets: [0, 2] },
      passes: [{ dx: 0, dy: 0 }, { dx: 2, dy: 0 }],
      inkOffset: { dx: 1, dy: 1 },
      compactHalo: {
        mode: "compact",
        colorIndex: 0,
        passes: [{ dx: -1, dy: 0 }, { dx: 3, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }],
      },
    },
    colors: { inkVariable: "DS:F93C", outlineVariable: "DS:F93E", battleInkIndex: 15, battleOutlineIndex: 0 },
    numericField: {
      function: "0000:EF56",
      characters: 5,
      formatting: "five decimal digits, then leading zeroes become spaces; a field that emptied keeps its last digit",
    },
    identityRow: {
      occupation: { function: "0000:EFFE", buffer: dollarString(module29, 0x5def), align: "right", origin: { x: 484, y: 124 } },
      separator: { ...dollarString(module29, 0x5df8), origin: { x: 552, y: 124 } },
      unitName: { function: "0000:F051", buffer: dollarString(module29, 0x5dfb), align: "left", origin: { x: 564, y: 124 } },
      fieldBytes: 8,
      note: "both fields are space padded to eight bytes, so a short occupation starts further right and the two fields can touch at x=564",
    },
    round: {
      origin: { x: 516, y: 327 },
      template: dollarString(module29, 0x600b),
      conversionBuffer: "DS:6006",
      // 0000:892B copies the last three converted characters into DS:600E..6010;
      // expressed as code-point indices so the runtime never handles raw Big5.
      digitIndices: [0x600e, 0x600f, 0x6010].map((address) =>
        characterIndexOf(module29, 0x600b, address)),
    },
    unitDetailBody: {
      function: "0000:8962",
      pattern: parsePattern(module29, 0x5fd1),
      fill: { x: 480, startY: 150, repeats: 0x56, deltaY: 2, colorIndex: 0 },
      note: "the body is not opaque: a 50% checkerboard in colour 0 is stamped over whatever the panel already held",
    },
    stageLabel: {
      selector: "0000:4F41",
      origin: { x: 120, y: 333 },
      font: "the label reuses the NUM/CHA subset of its own SAY record, not the UN/58+59 battle font",
      barRectangles: [parseRectangle(module29, 0x3051, "labelBarOuter"), parseRectangle(module29, 0x305b, "labelBarInner")],
      chrome: "A/0 frames 6 and 7 are drawn afterwards at (0,331) and (400,331), so the outer colour-14 band is only visible between x=80 and x=399",
      table: { ...stageLabels, labels: [...labelTexts.values()] },
    },
    evidenceBoundary: {
      confirmed: "battle font binding, glyph lookup, cursor advances, both outline shapes, ink/outline colours, numeric and identity formatting, round template, body checkerboard, stage label bar and per-stage label records",
      preservedUnknown: "the ROM font is host BIOS data rather than shipped game data, so the dump records what DOSBox-X exposes at F000:FA6E; the eight-byte identity buffers overflow for names longer than four full-width characters and no released name does so",
    },
    validation: {
      codeSignatures: signatures.code.length,
      dataSignatures: signatures.data.length,
      glyphArrays: font.arrays.length,
      mergedCharacters: font.characters.length,
      stageLabels: labelTexts.size,
    },
  };

  await mkdir(path.dirname(outputJsonPath), { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`);
  const charactersPath = `${outputJsonPath.replace(/\.json$/, "")}-font.json`;
  await writeFile(charactersPath, `${JSON.stringify({
    format: "angel2-battle-text-font/1",
    glyphWidth: GLYPH_WIDTH,
    glyphHeight: GLYPH_HEIGHT,
    glyphBytes: GLYPH_BYTES,
    characterCount: font.characters.length,
    bitmapsSha256: sha256(font.bitmaps),
    characters: font.characters,
    big5Hex: font.big5Hex,
    bitmapsBase64: font.bitmaps.toString("base64"),
  }, null, 2)}\n`);
  console.log(
    `verified ${signatures.code.length} code and ${signatures.data.length} data signatures; `
    + `merged ${font.characters.length} conflict-free glyphs from ${font.arrays.length} arrays and `
    + `${font.scriptSubsets.records} script subsets; wrote ${outputJsonPath} and ${charactersPath}`,
  );
}

/**
 * 0000:EC6C reads the host BIOS rather than a game resource, so the half-width
 * cells have to be dumped from a running DOS instead of extracted. This writes
 * the 47-byte COM that copies 2,048 bytes from F000:FA6E into FONT8.BIN:
 *
 *   mov ah,3Ch / xor cx,cx / mov dx,fname / int 21h   ; create
 *   mov bx,ax  / mov cx,800h / push ds
 *   mov ax,0F000h / mov ds,ax / mov dx,0FA6Eh
 *   mov ah,40h / int 21h / pop ds                     ; write
 *   mov ah,3Eh / int 21h / mov ax,4C00h / int 21h     ; close, exit
 */
async function emitDumpCom(outputPath) {
  const program = Buffer.concat([
    Buffer.from([
      0xb4, 0x3c, 0x31, 0xc9, 0xba, 0x25, 0x01, 0xcd, 0x21,
      0x89, 0xc3, 0xb9, 0x00, 0x08, 0x1e,
      0xb8, 0x00, 0xf0, 0x8e, 0xd8, 0xba, 0x6e, 0xfa, 0xb4, 0x40, 0xcd, 0x21, 0x1f,
      0xb4, 0x3e, 0xcd, 0x21, 0xb8, 0x00, 0x4c, 0xcd, 0x21,
    ]),
    Buffer.from("FONT8.BIN\0", "ascii"),
  ]);
  assert.equal(program.length, 0x25 + 10, "the filename is no longer at the offset DX points to");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, program);
  console.log(`wrote ${outputPath}; run it under DOSBox-X and keep the FONT8.BIN it produces`);
}

function usage() {
  return [
    "usage: angel2-battle-text.mjs --extract MODULE29 EXTRACTED_ROOT BIOS_FONT OUTPUT_JSON",
    "       angel2-battle-text.mjs --emit-dump-com OUTPUT_COM",
  ].join("\n");
}

const [command, ...args] = process.argv.slice(2);
if (command === "--emit-dump-com" && args.length === 1) {
  emitDumpCom(args[0]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
else if (command !== "--extract" || args.length !== 4) {
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
