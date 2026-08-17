#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRgbaPng } from "../reverse/tools/angel2-planar.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/startup.generated.ts");
const publicRoot = path.join(root, "public/assets/original/startup");

const inputPaths = {
  presentations: reversePath("parsed/native/title-presentations.json"),
  flow: reversePath("parsed/native/title-flow.json"),
  // 228 headerless 16x15 glyphs; A/23 in title-flow.json supplies their Big5
  // codes in the same order. Module 23 draws the scrolling intro rows and both
  // menus with these, so the remake ships them as a bitmap atlas.
  glyphs: reversePath("extracted/A/0024.bin"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const buffers = Object.fromEntries(await Promise.all(
  Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)]),
));
const parse = (id) => JSON.parse(buffers[id].toString("utf8"));
const presentations = parse("presentations");
const flow = parse("flow");

/**
 * DS:02C2, the title palette every BK/5x record is authored against. Only the
 * menu highlight needs it at runtime; the artwork ships already palette-mapped.
 */
const TITLE_PALETTE = [
  [0, 0, 0], [93, 65, 49], [162, 117, 81], [231, 138, 69],
  [255, 190, 105], [255, 219, 170], [247, 158, 158], [186, 170, 154],
  [0, 0, 166], [77, 138, 255], [186, 97, 255], [239, 32, 36],
  [40, 130, 0], [138, 202, 57], [255, 223, 16], [255, 255, 255],
];
const cssColor = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;

/** Kept in the native menu order; the runtime pairs them with DIFFICULTY_OPTIONS. */
const DIFFICULTY_LABELS = ["過關斬將", "勢均力敵", "困難重重", "無法無天"];

const GLYPH_WIDTH = 16;
const GLYPH_HEIGHT = 15;
const GLYPH_BYTES = 30;
const ATLAS_COLUMNS = 16;
const SCREEN = { width: 640, height: 350 };

const glyphResource = flow.titleGlyphResource;
assert.equal(glyphResource.glyphWidth, GLYPH_WIDTH);
assert.equal(glyphResource.glyphHeight, GLYPH_HEIGHT);
assert.equal(glyphResource.glyphBytes, GLYPH_BYTES);
assert.equal(buffers.glyphs.length, glyphResource.glyphCount * GLYPH_BYTES);
const glyphIndexByCharacter = new Map(glyphResource.glyphs.map(({ index, char }) => [char, index]));
assert.equal(
  glyphIndexByCharacter.size,
  glyphResource.glyphCount,
  "A/23 repeats a character, so a character-keyed atlas index would be ambiguous",
);

const atlasRows = Math.ceil(glyphResource.glyphCount / ATLAS_COLUMNS);
const atlasWidth = ATLAS_COLUMNS * GLYPH_WIDTH;
const atlasHeight = atlasRows * GLYPH_HEIGHT;
const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
for (let glyph = 0; glyph < glyphResource.glyphCount; glyph += 1) {
  const cellX = (glyph % ATLAS_COLUMNS) * GLYPH_WIDTH;
  const cellY = Math.floor(glyph / ATLAS_COLUMNS) * GLYPH_HEIGHT;
  for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
    const bits = buffers.glyphs.readUInt16BE(glyph * GLYPH_BYTES + row * 2);
    for (let column = 0; column < GLYPH_WIDTH; column += 1) {
      if ((bits & (0x8000 >>> column)) === 0) continue;
      const target = ((cellY + row) * atlasWidth + cellX + column) * 4;
      atlasPixels.fill(0xff, target, target + 4);
    }
  }
}

/**
 * Lays a Big5 string onto the native 16-pixel grid. The full-width ideographic
 * space `　` is glyph 0 in A/23, so blank padding is a real glyph draw and keeps
 * the original's hand-tuned centering intact.
 */
function layout(text, originX) {
  const glyphs = [];
  let x = originX;
  for (const character of text) {
    if (character === " ") { x += GLYPH_WIDTH / 2; continue; }
    const glyph = glyphIndexByCharacter.get(character);
    assert.notEqual(glyph, undefined, `startup character ${character} is missing from A/23`);
    if (character !== "　") glyphs.push([glyph, x]);
    x += GLYPH_WIDTH;
  }
  return { glyphs: glyphs.flat(), width: x - originX };
}

/** Native rows are centred on the 640-pixel screen after their own padding. */
function centredLine(text) {
  const measured = layout(text, 0);
  const originX = Math.floor((SCREEN.width - measured.width) / 2 / 8) * 8;
  return layout(text, originX).glyphs;
}

const pretitle = presentations.pretitle;
assert.equal(pretitle.graphic, "UN/53");
assert.equal(pretitle.fadeIn.dacWrites, 64);
assert.equal(pretitle.fadeOut.dacWrites, 63);
assert.equal(pretitle.hold.maximumFixedNativeTicks, 300);

const intro = presentations.intro;
assert.equal(intro.counts.totalEntries, 35);
assert.equal(intro.scroll.scrollUpdateCountUntilTerminator, 591);
assert.deepEqual(intro.scroll.initialRowY, [267, 287, 307]);
assert.equal(intro.scroll.resetY, 317);
assert.deepEqual(intro.scroll.visibleDrawYRange, [316, 258]);
assert.equal(intro.loop.waitNativeTicksPerIteration, 4);
assert.equal(intro.loop.scrollUpdateEveryIterations, 3);
assert.equal(intro.backgroundTransition.loopsPerTransition, 128);

const introBackgrounds = [
  { record: 41, ...intro.initialBackground },
  ...intro.shippedBackgroundSequence,
].map(({ record, graphic, x, y }) => ({
  record: record ?? Number(graphic.split("/")[1]),
  src: `/assets/original/startup/intro/${(record ?? Number(graphic.split("/")[1]))}.png`,
  x: x ?? 24,
  y: y ?? 0,
}));
assert.deepEqual(introBackgrounds.map(({ record }) => record), [41, 43, 44, 45, 46, 47, 48]);

// Each control entry consumes a scroll update even though it draws nothing, so
// the background swap is timed by the update that reads it, not by the row that
// follows it.
const backgroundChanges = [];
{
  let backgroundIndex = 0;
  let entryIndex = 0;
  for (const assignment of intro.scroll.assignments) {
    while (entryIndex < assignment.entryIndex) {
      if (intro.controlAndTextEntries[entryIndex].type === "background-control") {
        backgroundIndex += 1;
        backgroundChanges.push({ update: assignment.update, index: backgroundIndex });
      }
      entryIndex += 1;
    }
    entryIndex = assignment.entryIndex + 1;
  }
}
assert.equal(backgroundChanges.length, 6);

const introLines = intro.scroll.assignments.map(({ update, slot, entryIndex }) => {
  const entry = intro.controlAndTextEntries[entryIndex];
  const text = entry.type === "narrative" ? entry.text.trimEnd() : "";
  return { update, slot, text, glyphs: text === "" ? [] : centredLine(text) };
});
assert.equal(introLines.filter(({ text }) => text !== "").length, 17);

const title = presentations.title;
assert.deepEqual(title.upperReveal.dissolveSteps, [1, 3, 5, 7, 9, 11, 13, 15]);
assert.equal(title.lowerReveal.dissolveSteps.length, 16);
assert.equal(title.menuIdle.fixedNativeTicksBeforeReplay, 1608);
const titleVariants = [title.variant0, title.variant1].map((variant, index) => ({
  upper: `/assets/original/startup/title/upper-${index}.png`,
  lower: `/assets/original/startup/title/lower-${index}.png`,
  upperRecord: Number(variant.upper.split("/")[1]),
  lowerRecord: Number(variant.lower.split("/")[1]),
}));
assert.deepEqual(titleVariants.map(({ upperRecord, lowerRecord }) => [upperRecord, lowerRecord]),
  [[52, 53], [54, 55]]);

const labels = presentations.titleMenuLabels;
const menuGroup = (texts, group) => ({
  firstTextY: group.firstTextY,
  labels: texts.map((text) => ({ text, glyphs: layout(text, labels.textX).glyphs })),
});
const titlePalette = presentations.resourceCatalog.graphics
  .find(({ key }) => key === "BK/51").palette ?? null;
const menuLabels = {
  textX: labels.textX,
  rowPitch: labels.rowPitch,
  highlight: {
    x: labels.highlightBar.x,
    yOffset: labels.highlightBar.yOffset,
    width: labels.highlightBar.width,
    height: labels.highlightBar.height,
    color: cssColor(TITLE_PALETTE[labels.highlightBar.colorIndex]),
  },
  title: menuGroup(["遊戲開始", "繼續遊戲"], labels.title),
  difficulty: menuGroup(
    DIFFICULTY_LABELS,
    labels.difficulty,
  ),
};
assert.equal(menuLabels.title.firstTextY, 75);
assert.equal(menuLabels.difficulty.firstTextY, 51);

const generatedSources = Object.entries(inputPaths).map(([id, file]) => ({
  id,
  path: path.relative(root, file),
  sha256: sha256(buffers[id]),
  bytes: buffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-102\0");
for (const source of generatedSources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const identity = `startup/evidence-${identityHash.digest("hex")}`;

const generated = `// Generated by scripts/generate-startup-runtime.mjs from module-23 evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n\n`
  + `export const STARTUP_IDENTITY = ${json(identity)};\n`
  + `export const STARTUP_SOURCES = ${json(generatedSources)} as const;\n`
  + `export const STARTUP_SCREEN = ${json(SCREEN)} as const;\n`
  + `/** A/23+A/24: the 228-glyph font module 23 draws the intro and both menus with. */\n`
  + `export const STARTUP_FONT = ${json({
    src: "/assets/original/startup/font.png",
    glyphWidth: GLYPH_WIDTH,
    glyphHeight: GLYPH_HEIGHT,
    columns: ATLAS_COLUMNS,
    glyphCount: glyphResource.glyphCount,
  })} as const;\n`
  + `/** 0000:0F0A: eight bytes per step, one row per scanline, wrapping every 8. */\n`
  + `export const STARTUP_DISSOLVE_PATTERNS = ${
    json(presentations.dissolve.patterns.map(({ rows }) => rows))} as const;\n`
  + `export const STARTUP_PRETITLE = ${json({
    src: "/assets/original/startup/pretitle.png",
    x: pretitle.draw.x,
    y: pretitle.draw.y,
    fadeInSteps: pretitle.fadeIn.dacWrites,
    fadeOutSteps: pretitle.fadeOut.dacWrites,
    holdNativeTicks: pretitle.hold.maximumFixedNativeTicks,
  })} as const;\n`
  + `export const STARTUP_INTRO = ${json({
    backgrounds: introBackgrounds,
    backgroundChanges,
    lines: introLines,
    scrollUpdates: intro.scroll.scrollUpdateCountUntilTerminator,
    initialRowY: intro.scroll.initialRowY,
    resetY: intro.scroll.resetY,
    visibleTopY: intro.scroll.visibleDrawYRange[1],
    visibleBottomY: intro.scroll.visibleDrawYRange[0],
    nativeTicks: intro.scroll.fixedWaitNativeTicks,
    ticksPerScrollUpdate: intro.loop.waitNativeTicksPerIteration
      * intro.loop.scrollUpdateEveryIterations,
    transitionLoops: intro.backgroundTransition.loopsPerTransition,
  })} as const;\n`
  + `export const STARTUP_TITLE = ${json({
    background: "/assets/original/startup/title/background.png",
    variants: titleVariants.map(({ upper, lower }) => ({ upper, lower })),
    backgroundFadeSteps: title.palette.fadeInDacWrites,
    upperReveal: title.upperReveal,
    lowerReveal: title.lowerReveal,
    preMusicHoldNativeTicks: title.preMusicHold.maximumFixedNativeTicks,
    idleReplayNativeTicks: title.menuIdle.fixedNativeTicksBeforeReplay,
  })} as const;\n`
  + `export const STARTUP_MENU_LABELS = ${json(menuLabels)} as const;\n`;

await writeFile(outputPath, generated, "utf8");
await mkdir(path.join(publicRoot, "title"), { recursive: true });
const titleFrame = (record) =>
  reversePath("renders/title-presentations/frames/BK", String(record).padStart(4, "0"), "00.png");
await Promise.all([
  writeFile(path.join(publicRoot, "font.png"), encodeRgbaPng(atlasWidth, atlasHeight, atlasPixels)),
  copyFile(
    reversePath("renders/title-presentations/frames/UN/0053/00.png"),
    path.join(publicRoot, "pretitle.png"),
  ),
  copyFile(titleFrame(51), path.join(publicRoot, "title/background.png")),
  ...titleVariants.flatMap(({ upperRecord, lowerRecord }, index) => [
    copyFile(titleFrame(upperRecord), path.join(publicRoot, "title", `upper-${index}.png`)),
    copyFile(titleFrame(lowerRecord), path.join(publicRoot, "title", `lower-${index}.png`)),
  ]),
]);

console.log(`wrote ${path.relative(root, outputPath)} (${introLines.length} scroll rows, `
  + `${glyphResource.glyphCount} glyphs, ${presentations.dissolve.patterns.length} dissolve steps)`);
console.log(`wrote startup assets with identity ${identity}`);
