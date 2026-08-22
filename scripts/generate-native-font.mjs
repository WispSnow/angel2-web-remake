#!/usr/bin/env node

/**
 * Builds the runtime asset for the original 16x15 bitmap font module 29 draws
 * the battle HUD, the round panel and the bottom stage label with, plus the
 * BIOS 8x8 ROM cells it stretches for half-width characters.
 *
 * Both halves live in one atlas on a uniform 16x16 grid: full-width glyphs
 * occupy rows 0..14 of their cell, the doubled ROM cells occupy columns 0..7 of
 * all 16 rows. That keeps a single image load and lets the runtime build one
 * dilated outline atlas over the same grid.
 *
 * Inputs are machine truth from reverse/tools/angel2-battle-text.mjs; nothing
 * here re-derives coordinates or metrics by hand.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { encodeRgbaPng } from "../reverse/tools/angel2-planar.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);

const CELL_WIDTH = 16;
const CELL_HEIGHT = 16;
const ATLAS_COLUMNS = 16;
const HALF_WIDTH_FIRST_CODE = 0x20;
const HALF_WIDTH_LAST_CODE = 0x7f;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const sources = [];
async function loadJson(relativePath) {
  const absolute = reversePath(relativePath);
  const buffer = await readFile(absolute);
  sources.push({
    id: path.basename(relativePath, ".json"),
    path: `reverse/${relativePath.split(path.sep).join("/")}`,
    sha256: sha256(buffer),
    bytes: buffer.length,
  });
  return JSON.parse(buffer.toString("utf8"));
}

const spec = await loadJson(path.join("parsed", "native", "battle-text.json"));
const fontData = await loadJson(path.join("parsed", "native", "battle-text-font.json"));
const hud = await loadJson(path.join("parsed", "native", "hud-presentations.json"));
const story = await loadJson(path.join("parsed", "native", "story-presentations.json"));
const inputUi = await loadJson(path.join("parsed", "native", "input-ui.json"));
const romFont = await readFile(reversePath("dumps", "bios-font-8x8.bin"));
sources.push({
  id: "bios-font",
  path: "reverse/dumps/bios-font-8x8.bin",
  sha256: sha256(romFont),
  bytes: romFont.length,
});
assert.equal(sha256(romFont), spec.halfWidthFont.dump.sha256, "BIOS font dump does not match the verified evidence");

const glyphs = Buffer.from(fontData.bitmapsBase64, "base64");
assert.equal(sha256(glyphs), fontData.bitmapsSha256, "merged glyph blob does not match its recorded digest");
const characters = [...fontData.characters];
assert.equal(characters.length, fontData.characterCount, "the merged font character list is not one code point per glyph");
assert.equal(glyphs.length, characters.length * fontData.glyphBytes, "the merged glyph blob does not match the character list");
assert.equal(fontData.glyphWidth, CELL_WIDTH, "the native glyph width changed");
assert.equal(fontData.glyphHeight, CELL_HEIGHT - 1, "the native glyph height no longer fits the 16px cell grid");

const halfWidthCount = HALF_WIDTH_LAST_CODE - HALF_WIDTH_FIRST_CODE + 1;
const totalCells = characters.length + halfWidthCount;
const atlasRows = Math.ceil(totalCells / ATLAS_COLUMNS);
const atlasWidth = ATLAS_COLUMNS * CELL_WIDTH;
const atlasHeight = atlasRows * CELL_HEIGHT;
const pixels = Buffer.alloc(atlasWidth * atlasHeight * 4);

function cellOrigin(cell) {
  return {
    x: (cell % ATLAS_COLUMNS) * CELL_WIDTH,
    y: Math.floor(cell / ATLAS_COLUMNS) * CELL_HEIGHT,
  };
}

function setPixel(x, y) {
  const target = (y * atlasWidth + x) * 4;
  pixels.fill(0xff, target, target + 4);
}

for (let glyph = 0; glyph < characters.length; glyph += 1) {
  const { x: cellX, y: cellY } = cellOrigin(glyph);
  for (let row = 0; row < fontData.glyphHeight; row += 1) {
    const bits = glyphs.readUInt16BE(glyph * fontData.glyphBytes + row * 2);
    for (let column = 0; column < CELL_WIDTH; column += 1) {
      if ((bits & (0x8000 >>> column)) !== 0) setPixel(cellX + column, cellY + row);
    }
  }
}

// 0000:EC6C stores every ROM row twice, so the released cell is the 8x8 face
// stretched to 8x16 rather than a second, taller ROM font.
assert.equal(spec.halfWidthFont.romRows * 2, spec.halfWidthFont.cellRows, "the ROM row doubling rule changed");
for (let index = 0; index < halfWidthCount; index += 1) {
  const code = HALF_WIDTH_FIRST_CODE + index;
  const { x: cellX, y: cellY } = cellOrigin(characters.length + index);
  for (let romRow = 0; romRow < spec.halfWidthFont.romRows; romRow += 1) {
    const bits = romFont[code * spec.halfWidthFont.romRows + romRow];
    for (let column = 0; column < spec.halfWidthFont.cellWidth; column += 1) {
      if ((bits & (0x80 >>> column)) === 0) continue;
      setPixel(cellX + column, cellY + romRow * 2);
      setPixel(cellX + column, cellY + romRow * 2 + 1);
    }
  }
}

/**
 * The stage label is the one battle string whose horizontal placement lives in
 * the data rather than in the code: every SAY label record carries its own tab
 * and space padding, and 0000:4F41 just drops the cursor at (120,333) and runs
 * it. Keyed by the visible text so the remake's own stage manifest can look up
 * the original padding without owning native stage numbers.
 */
const stageLabelPadding = {};
for (const label of spec.stageLabel.table.labels) {
  const visible = label.text.replaceAll("\t", "").trim();
  const existing = stageLabelPadding[visible];
  assert(
    existing === undefined || existing === label.text,
    `stage label ${visible} has two different paddings`,
  );
  stageLabelPadding[visible] = label.text;
}

const palette = hud.resourceValidation.paletteColors.map(
  ([red, green, blue]) => `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`,
);
assert.equal(palette.length, 16, "the gameplay palette is no longer 16 entries");

const statRows = hud.statRows.map(({ id, text, origin }) => {
  assert(text.includes("00000"), `stat row ${id} no longer carries a five-character numeric field`);
  return { id, template: text, x: origin.x, y: origin.y };
});
assert.equal(statRows.length, 5, "the unit detail no longer has exactly five stat rows");

// DS:5F8D/DS:5F9D packed icon positions, offset by the (iconX-6, iconY+20)
// counter origin so the runtime never repeats that arithmetic.
const { xPositions, yPositions, counterOrigin } = hud.statuses.packing;
assert.equal(counterOrigin, "(iconX-6, iconY+20)", "the status counter origin moved");
const statusCounters = xPositions.values.map((x, index) => ({ x: x - 6, y: yPositions.values[index] + 20 }));

/**
 * The SAY interpreters draw through the HUD's own glyph routine — module 29's
 * story glyph draw `0000:C23E` calls `0000:EA04` at `C25B` and `C280` — so the
 * atlas, the dilated outline and the three passes are the same. What differs is
 * the cursor: the interpreter advances a half-width character itself, by 8
 * pixels rather than the drawer's 9. Both story modes and both windows agree on
 * every value, so a disagreement here means the evidence changed shape.
 */
const storyModes = [story.module25StoryMode.text, story.module29BattleStoryMode.text];
for (const text of storyModes) {
  assert.equal(text.big5Advance, spec.cursor.advances.fullWidth, "the SAY Big5 advance left the shared font grid");
  assert.equal(text.lineAdvance, spec.cursor.lineFeed.deltaY, "the SAY line advance no longer matches the HUD drawer");
  assert.equal(text.asciiAdvance, storyModes[0].asciiAdvance, "the two SAY interpreters disagree on the ASCII advance");
}
const storyWindows = [story.module25StoryMode.windows, story.module29BattleStoryMode.windows];
const storyTextInset = storyWindows.flatMap((windows) => Object.values(windows).map(
  ({ frameAnchor, textOrigin }) => [textOrigin[0] - frameAnchor[0], textOrigin[1] - frameAnchor[1]],
));
for (const [x, y] of storyTextInset) {
  assert.deepEqual([x, y], storyTextInset[0], "the A/18 windows no longer share one text inset");
}

/**
 * Every native menu row carries its own spacing inside the Big5 string rather
 * than in the drawing code: the action menus are `B2BE 20202020 B0CA`, two
 * glyphs around four half-width spaces, while the system and group menus are
 * four adjacent glyphs. Keyed by the visible text so the remake can keep using
 * plain labels for its accessible names and look the padding up when drawing.
 */
const menuLabelPadding = {};
const menuGroups = [
  ...inputUi.menus.actionMenus,
  inputUi.menus.confirmation,
  inputUi.menus.system.menu,
  inputUi.menus.phaseAndBattleCommands.menu,
];
for (const menu of menuGroups) {
  for (const entry of menu.entries) {
    const text = entry.label.text;
    const visible = text.replaceAll(" ", "");
    const existing = menuLabelPadding[visible];
    assert(
      existing === undefined || existing === text,
      `menu label ${visible} has two different paddings`,
    );
    menuLabelPadding[visible] = text;
  }
}

const publicPath = path.join(root, "public", "assets", "original", "native-font.png");
await mkdir(path.dirname(publicPath), { recursive: true });
await writeFile(publicPath, encodeRgbaPng(atlasWidth, atlasHeight, pixels));

const identity = sha256(Buffer.concat([
  glyphs,
  romFont,
  Buffer.from(JSON.stringify(sources)),
]));

const quote = (value) => JSON.stringify(value);
const module = `// Generated by scripts/generate-native-font.mjs from module-29 battle-text evidence.
// Do not hand-edit: regenerate with \`pnpm content:font\` after the evidence pipeline changes.

export const NATIVE_FONT_IDENTITY = ${quote(`native-font/evidence-${identity}`)};
export const NATIVE_FONT_SOURCES = ${JSON.stringify(sources)} as const;

/**
 * One atlas on a 16x16 cell grid. Cells \`0..fullWidthCount-1\` are the merged
 * original 16x15 glyphs; the remaining cells are ASCII \`0x20..0x7F\` from the
 * BIOS 8x8 ROM font with every row doubled, 8 pixels wide.
 */
export const NATIVE_FONT = {
  src: "/assets/original/native-font.png",
  cellWidth: ${CELL_WIDTH},
  cellHeight: ${CELL_HEIGHT},
  columns: ${ATLAS_COLUMNS},
  fullWidthCount: ${characters.length},
  fullWidthRows: ${fontData.glyphHeight},
  halfWidthBase: ${characters.length},
  halfWidthFirstCode: ${HALF_WIDTH_FIRST_CODE},
  halfWidthCount: ${halfWidthCount},
  halfWidthWidth: ${spec.halfWidthFont.cellWidth},
} as const;

/** Atlas order for the full-width cells: index \`n\` is code point \`n\` here. */
export const NATIVE_FONT_CHARACTERS = ${quote(fontData.characters)};

/** The gameplay VGA DAC entries every native battle colour index refers to. */
export const NATIVE_GAMEPLAY_PALETTE = ${JSON.stringify(palette)} as const;

/** 0000:EA04 cursor rules; every advance is in native 640x350 pixels. */
export const NATIVE_TEXT = {
  terminators: ${JSON.stringify(spec.cursor.terminators)},
  lineFeed: ${JSON.stringify(spec.cursor.lineFeed)},
  advances: ${JSON.stringify(spec.cursor.advances)},
  outline: ${JSON.stringify(spec.outline)},
  colors: ${JSON.stringify(spec.colors)},
  numericFieldCharacters: ${spec.numericField.characters},
  identityFieldBytes: ${spec.identityRow.fieldBytes},
} as const;

/** 0000:8B2B, 0000:8C30, 0000:88E4 and 0000:4F41 origins, in native pixels. */
export const NATIVE_TEXT_ORIGINS = {
  occupation: ${JSON.stringify(spec.identityRow.occupation.origin)},
  separator: ${JSON.stringify(spec.identityRow.separator.origin)},
  unitName: ${JSON.stringify(spec.identityRow.unitName.origin)},
  round: ${JSON.stringify(spec.round.origin)},
  stageLabel: ${JSON.stringify(spec.stageLabel.origin)},
} as const;

/**
 * DS:5E64..DS:5EA2 templates and their 0000:8C30 origins. Each \`00000\` run is
 * a five-character numeric field, so the row is one native string rather than a
 * label column plus a right-aligned value column.
 */
export const NATIVE_STAT_ROWS = ${JSON.stringify(statRows, null, 2)} as const;

/** Packed status counter origins; active statuses fill them in scan order. */
export const NATIVE_STATUS_COUNTERS = ${JSON.stringify(statusCounters)} as const;

/**
 * Module 25 \`0000:0736\` and module 29 \`0000:BE14\`: the A/18 dialogue, promotion
 * and outcome windows hand each glyph to the same \`0000:EA04\` drawer the HUD
 * uses, but run their own cursor, whose half-width advance is 8 rather than 9.
 * \`inset\` is the text origin relative to the window frame, identical for both
 * interpreters and both windows.
 */
export const NATIVE_STORY_TEXT = {
  halfWidthAdvance: ${storyModes[0].asciiAdvance},
  inset: { x: ${storyTextInset[0][0]}, y: ${storyTextInset[0][1]} },
} as const;

/** Visible menu label to the space-padded original string the cursor ran on. */
export const NATIVE_MENU_LABEL_PADDING: Readonly<Record<string, string>> = ${
  JSON.stringify(menuLabelPadding, null, 2)
};

export const NATIVE_IDENTITY_SEPARATOR = ${quote(spec.identityRow.separator.text)};

/** DS:600B with its three converted digits still to be substituted. */
export const NATIVE_ROUND_TEMPLATE = ${quote(spec.round.template.text)};
export const NATIVE_ROUND_DIGIT_INDICES = ${JSON.stringify(spec.round.digitIndices)} as const;

/** DS:3051 and DS:305B, drawn before the A/0 bottom chrome covers both ends. */
export const NATIVE_STAGE_LABEL_BAR = ${JSON.stringify(spec.stageLabel.barRectangles)} as const;

/** Visible label text to the padded SAY record the original ran the cursor on. */
export const NATIVE_STAGE_LABEL_PADDING: Readonly<Record<string, string>> = ${
  JSON.stringify(stageLabelPadding, null, 2).split("\n").join("\n")
};
`;

const modulePath = path.join(root, "src", "game", "content", "native-font.generated.ts");
await writeFile(modulePath, module);

console.log(
  `wrote ${path.relative(root, publicPath)} (${atlasWidth}x${atlasHeight}, `
  + `${characters.length} original glyphs + ${halfWidthCount} ROM cells) and `
  + `${path.relative(root, modulePath)}`,
);
