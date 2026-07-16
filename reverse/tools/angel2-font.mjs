#!/usr/bin/env node

import { deflateSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const GLYPH_WIDTH = 16;
const GLYPH_HEIGHT = 15;
const GLYPH_BYTES = 30;
const big5Decoder = new TextDecoder("big5", { fatal: true });

function isBig5Trail(byte) {
  return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0xa1 && byte <= 0xfe);
}

function pairKey(lead, trail) {
  return `${lead.toString(16).padStart(2, "0")}${trail
    .toString(16)
    .padStart(2, "0")}`;
}

function decodePair(lead, trail) {
  return big5Decoder.decode(Uint8Array.of(lead, trail));
}

function parseNumRecord(buffer, fileName = "NUM record") {
  if (buffer.length < 2 || buffer.length % 2 !== 0) {
    throw new Error(`${fileName}: expected an even number of bytes ending in 0000h`);
  }
  if (buffer.at(-2) !== 0 || buffer.at(-1) !== 0) {
    throw new Error(`${fileName}: missing final 0000h terminator`);
  }

  const glyphs = [];
  const seen = new Set();
  for (let offset = 0; offset < buffer.length - 2; offset += 2) {
    const lead = buffer[offset];
    const trail = buffer[offset + 1];
    if (lead < 0x81 || lead > 0xfe || !isBig5Trail(trail)) {
      throw new Error(
        `${fileName}: invalid Big5 pair ${pairKey(lead, trail)} at byte ${offset}`,
      );
    }
    const key = pairKey(lead, trail);
    if (seen.has(key)) {
      throw new Error(`${fileName}: duplicate Big5 pair ${key}`);
    }
    seen.add(key);
    glyphs.push({ index: glyphs.length, big5: key, char: decodePair(lead, trail) });
  }
  return glyphs;
}

function collectUniqueBig5Pairs(buffer, fileName = "SAY record") {
  const pairs = [];
  const seen = new Set();

  for (let offset = 0; offset < buffer.length; offset += 1) {
    const lead = buffer[offset];
    if (lead < 0x81 || lead > 0xfe) {
      continue;
    }
    if (offset + 1 >= buffer.length || !isBig5Trail(buffer[offset + 1])) {
      throw new Error(`${fileName}: invalid Big5 lead byte at ${offset}`);
    }
    const trail = buffer[offset + 1];
    const key = pairKey(lead, trail);
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(key);
    }
    offset += 1;
  }

  return pairs;
}

function assertChaMatches(glyphs, buffer, fileName = "CHA record") {
  const expected = glyphs.length * GLYPH_BYTES;
  if (buffer.length !== expected) {
    throw new Error(
      `${fileName}: ${buffer.length} bytes, expected ${glyphs.length} * ` +
        `${GLYPH_BYTES} = ${expected}`,
    );
  }
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}

const crcTable = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodeGrayscalePng(width, height, pixels) {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * width, (y + 1) * width);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderGlyphSheet(glyphs, chaBuffer, scale, columns) {
  assertChaMatches(glyphs, chaBuffer);
  const cellWidth = GLYPH_WIDTH + 1;
  const cellHeight = GLYPH_HEIGHT + 1;
  const rows = Math.ceil(glyphs.length / columns);
  const baseWidth = 1 + columns * cellWidth;
  const baseHeight = 1 + rows * cellHeight;
  const base = Buffer.alloc(baseWidth * baseHeight, 255);

  for (const glyph of glyphs) {
    const column = glyph.index % columns;
    const row = Math.floor(glyph.index / columns);
    const originX = 1 + column * cellWidth;
    const originY = 1 + row * cellHeight;
    const glyphOffset = glyph.index * GLYPH_BYTES;

    for (let y = 0; y < GLYPH_HEIGHT; y += 1) {
      const bits = chaBuffer.readUInt16BE(glyphOffset + y * 2);
      for (let x = 0; x < GLYPH_WIDTH; x += 1) {
        if ((bits & (0x8000 >>> x)) !== 0) {
          base[(originY + y) * baseWidth + originX + x] = 0;
        }
      }
    }
  }

  const width = baseWidth * scale;
  const height = baseHeight * scale;
  const pixels = Buffer.alloc(width * height, 255);
  for (let y = 0; y < baseHeight; y += 1) {
    for (let x = 0; x < baseWidth; x += 1) {
      const value = base[y * baseWidth + x];
      for (let sy = 0; sy < scale; sy += 1) {
        const target = (y * scale + sy) * width + x * scale;
        pixels.fill(value, target, target + scale);
      }
    }
  }

  return encodeGrayscalePng(width, height, pixels);
}

function inspectRawGlyphArray(buffer) {
  if (buffer.length < 16 * GLYPH_BYTES || buffer.length % GLYPH_BYTES !== 0) {
    return null;
  }
  const glyphCount = buffer.length / GLYPH_BYTES;
  let blankFinalRows = 0;
  let setBits = 0;
  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    if (buffer.readUInt16BE(glyph * GLYPH_BYTES + 28) === 0) {
      blankFinalRows += 1;
    }
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      let bits = buffer.readUInt16BE(glyph * GLYPH_BYTES + row * 2);
      while (bits !== 0) {
        setBits += bits & 1;
        bits >>>= 1;
      }
    }
  }
  const blankFinalRowRatio = blankFinalRows / glyphCount;
  const setBitRatio = setBits / (glyphCount * GLYPH_WIDTH * GLYPH_HEIGHT);
  if (blankFinalRowRatio < 0.9 || setBitRatio < 0.15 || setBitRatio > 0.4) {
    return null;
  }
  return { glyphCount, blankFinalRowRatio, setBitRatio };
}

async function listRecordNames(directory) {
  return (await readdir(directory))
    .filter((name) => /^\d{4}\.bin$/.test(name))
    .sort();
}

async function verifyFamilies(numDirectory, sayDirectory, chaDirectory) {
  const [numNames, sayNames, chaNames] = await Promise.all([
    listRecordNames(numDirectory),
    listRecordNames(sayDirectory),
    listRecordNames(chaDirectory),
  ]);
  if (
    numNames.join("\n") !== sayNames.join("\n") ||
    numNames.join("\n") !== chaNames.join("\n")
  ) {
    throw new Error("NUM, SAY, and CHA record-name sets differ");
  }

  let totalGlyphs = 0;
  let sayOrderMatches = 0;
  let dosEofRecords = 0;
  const mismatches = [];

  for (const name of numNames) {
    const [numBuffer, sayBuffer, chaBuffer] = await Promise.all([
      readFile(path.join(numDirectory, name)),
      readFile(path.join(sayDirectory, name)),
      readFile(path.join(chaDirectory, name)),
    ]);
    const glyphs = parseNumRecord(numBuffer, `${numDirectory}/${name}`);
    assertChaMatches(glyphs, chaBuffer, `${chaDirectory}/${name}`);
    totalGlyphs += glyphs.length;
    if (sayBuffer.at(-1) === 0x1a) {
      dosEofRecords += 1;
    }

    const expected = glyphs.map((glyph) => glyph.big5);
    const actual = collectUniqueBig5Pairs(sayBuffer, `${sayDirectory}/${name}`);
    if (expected.join(" ") === actual.join(" ")) {
      sayOrderMatches += 1;
    }
    else {
      let firstDifference = 0;
      while (
        firstDifference < expected.length &&
        expected[firstDifference] === actual[firstDifference]
      ) {
        firstDifference += 1;
      }
      mismatches.push({
        record: name,
        expectedCount: expected.length,
        actualCount: actual.length,
        firstDifference,
        numPair: expected[firstDifference] ?? null,
        sayPair: actual[firstDifference] ?? null,
      });
    }
  }

  const result = {
    records: numNames.length,
    totalGlyphs,
    numTerminatorRecords: numNames.length,
    chaExactStrideRecords: numNames.length,
    sayDosEofRecords: dosEofRecords,
    sayUniqueOrderMatches: sayOrderMatches,
    mismatches,
  };
  console.log(JSON.stringify(result, null, 2));
  if (mismatches.length !== 0) {
    process.exitCode = 2;
  }
}

function parseRenderOptions(args) {
  let scale = 4;
  let columns = 16;
  const positional = [];
  for (const argument of args) {
    if (argument.startsWith("--scale=")) {
      scale = Number.parseInt(argument.slice("--scale=".length), 10);
    }
    else if (argument.startsWith("--columns=")) {
      columns = Number.parseInt(argument.slice("--columns=".length), 10);
    }
    else {
      positional.push(argument);
    }
  }
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) {
    throw new Error("--scale must be an integer from 1 to 32");
  }
  if (!Number.isInteger(columns) || columns < 1 || columns > 64) {
    throw new Error("--columns must be an integer from 1 to 64");
  }
  return { scale, columns, positional };
}

async function renderOne(numFile, chaFile, outputFile, scale, columns) {
  const [numBuffer, chaBuffer] = await Promise.all([
    readFile(numFile),
    readFile(chaFile),
  ]);
  const glyphs = parseNumRecord(numBuffer, numFile);
  assertChaMatches(glyphs, chaBuffer, chaFile);
  const png = renderGlyphSheet(glyphs, chaBuffer, scale, columns);
  const manifestFile = outputFile.replace(/\.png$/i, "") + ".json";

  await mkdir(path.dirname(outputFile), { recursive: true });
  await Promise.all([
    writeFile(outputFile, png),
    writeFile(
      manifestFile,
      `${JSON.stringify(
        {
          format: "ANGEL2 16x15 monochrome Big5 glyph set",
          glyphWidth: GLYPH_WIDTH,
          glyphHeight: GLYPH_HEIGHT,
          glyphBytes: GLYPH_BYTES,
          glyphs,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
  console.log(`rendered ${glyphs.length} glyphs to ${outputFile}`);
  return {
    record: path.basename(outputFile, path.extname(outputFile)),
    glyphs: glyphs.length,
    atlas: path.basename(outputFile),
    metadata: path.basename(manifestFile),
  };
}

async function renderAll(numDirectory, chaDirectory, outputDirectory, scale, columns) {
  const names = await listRecordNames(numDirectory);
  const entries = [];
  for (const name of names) {
    const stem = name.slice(0, -4);
    entries.push(await renderOne(
      path.join(numDirectory, name),
      path.join(chaDirectory, name),
      path.join(outputDirectory, `${stem}.png`),
      scale,
      columns,
    ));
  }
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify({
      format: "ANGEL2 mapped 16x15 monochrome Big5 glyph atlases",
      records: entries.length,
      glyphs: entries.reduce((total, entry) => total + entry.glyphs, 0),
      glyphWidth: GLYPH_WIDTH,
      glyphHeight: GLYPH_HEIGHT,
      glyphBytes: GLYPH_BYTES,
      entries,
    }, null, 2)}\n`,
  );
}

async function renderRawRoot(extractedDirectory, outputDirectory, scale, columns) {
  const groups = (await readdir(extractedDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "CHA")
    .map((entry) => entry.name)
    .sort();
  const entries = [];
  for (const group of groups) {
    const inputDirectory = path.join(extractedDirectory, group);
    for (const name of await listRecordNames(inputDirectory)) {
      const inputFile = path.join(inputDirectory, name);
      const buffer = await readFile(inputFile);
      const inspection = inspectRawGlyphArray(buffer);
      if (inspection === null) {
        continue;
      }
      const glyphs = Array.from({ length: inspection.glyphCount }, (_, index) => ({ index }));
      const stem = name.slice(0, -4);
      const relativeAtlas = path.join(group, `${stem}.png`);
      const relativeMetadata = path.join(group, `${stem}.json`);
      const atlasFile = path.join(outputDirectory, relativeAtlas);
      const metadataFile = path.join(outputDirectory, relativeMetadata);
      await mkdir(path.dirname(atlasFile), { recursive: true });
      await Promise.all([
        writeFile(atlasFile, renderGlyphSheet(glyphs, buffer, scale, columns)),
        writeFile(metadataFile, `${JSON.stringify({
          format: "ANGEL2 raw 16x15 monochrome glyph array",
          source: path.join(group, name),
          glyphWidth: GLYPH_WIDTH,
          glyphHeight: GLYPH_HEIGHT,
          glyphBytes: GLYPH_BYTES,
          ...inspection,
        }, null, 2)}\n`),
      ]);
      entries.push({
        group,
        record: Number.parseInt(stem, 10),
        source: path.join(group, name),
        glyphs: inspection.glyphCount,
        blankFinalRowRatio: inspection.blankFinalRowRatio,
        setBitRatio: inspection.setBitRatio,
        atlas: relativeAtlas,
        metadata: relativeMetadata,
      });
    }
  }
  await mkdir(outputDirectory, { recursive: true });
  const manifest = {
    format: "ANGEL2 additional raw 16x15 monochrome glyph atlases",
    records: entries.length,
    glyphs: entries.reduce((total, entry) => total + entry.glyphs, 0),
    glyphWidth: GLYPH_WIDTH,
    glyphHeight: GLYPH_HEIGHT,
    glyphBytes: GLYPH_BYTES,
    entries,
  };
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`rendered ${manifest.glyphs} raw glyphs from ${manifest.records} records`);
}

function usage() {
  return [
    "usage:",
    "  angel2-font.mjs --verify NUM_DIR SAY_DIR CHA_DIR",
    "  angel2-font.mjs --render NUM.bin CHA.bin OUTPUT.png [--scale=4] [--columns=16]",
    "  angel2-font.mjs --render-all NUM_DIR CHA_DIR OUTPUT_DIR [--scale=4] [--columns=16]",
    "  angel2-font.mjs --render-raw-root EXTRACTED_DIR OUTPUT_DIR [--scale=4] [--columns=16]",
  ].join("\n");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "--verify") {
    if (rest.length !== 3) {
      throw new Error(usage());
    }
    await verifyFamilies(...rest);
    return;
  }

  if (command === "--render" || command === "--render-all" || command === "--render-raw-root") {
    const { scale, columns, positional } = parseRenderOptions(rest);
    const expected = command === "--render-raw-root" ? 2 : 3;
    if (positional.length !== expected) {
      throw new Error(usage());
    }
    if (command === "--render") {
      await renderOne(...positional, scale, columns);
    }
    else if (command === "--render-all") {
      await renderAll(...positional, scale, columns);
    }
    else {
      await renderRawRoot(...positional, scale, columns);
    }
    return;
  }

  throw new Error(usage());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export {
  collectUniqueBig5Pairs,
  inspectRawGlyphArray,
  parseNumRecord,
  renderGlyphSheet,
};
