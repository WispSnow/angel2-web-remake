import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import titleFlow from "../../reverse/parsed/native/title-flow.json";
import titlePresentations from "../../reverse/parsed/native/title-presentations.json";
import {
  STARTUP_DISSOLVE_PATTERNS,
  STARTUP_FONT,
  STARTUP_INTRO,
  STARTUP_MENU_LABELS,
  STARTUP_PRETITLE,
  STARTUP_SCREEN,
  STARTUP_TEXT,
  STARTUP_TITLE,
} from "../../src/game/content/startup.generated";
import { DIFFICULTY_OPTIONS, difficultyHintFor } from "../../src/game/content/startup";
import { enemyScalingFor } from "../../src/game/content/enemy-scaling";
import { INTRO_BAND, INTRO_BAND_OFFSET } from "../../src/game/startup";
import { clipStartupGlyphRow } from "../../src/game/startup-screen";
import { readPlatePixels } from "./postgame-plate-support";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const glyphCharacter = (index: number) => titleFlow.titleGlyphResource.glyphs[index]?.char;

describe("module 23 startup presentation", () => {
  /**
   * 0000:0766 and 0000:07FB do not fade the title art in; they blit it through
   * the 8x8 patterns at 0000:0F0A. Steps 0-7 and 8-15 are two nested phases that
   * tile the cell exactly, which is why the upper art's every-other-step run and
   * the lower logo's full run both end fully covered.
   */
  it("ships the two nested, complementary dissolve phases", () => {
    expect(STARTUP_DISSOLVE_PATTERNS).toHaveLength(16);
    const density = (rows: readonly number[]) =>
      rows.reduce((total, row) => total + row.toString(2).replaceAll("0", "").length, 0);
    expect(STARTUP_DISSOLVE_PATTERNS.map(density))
      .toEqual([4, 8, 12, 16, 20, 24, 28, 32, 4, 8, 12, 16, 20, 24, 28, 32]);
    for (const phase of [0, 8]) {
      for (let step = phase; step < phase + 7; step += 1) {
        const inner = STARTUP_DISSOLVE_PATTERNS[step];
        const outer = STARTUP_DISSOLVE_PATTERNS[step + 1];
        expect(inner.every((row, index) => (row & outer[index]) === row)).toBe(true);
      }
    }
    // Every pixel of the cell is covered exactly once by the two final steps.
    expect(STARTUP_DISSOLVE_PATTERNS[7].every((row, index) =>
      (row & STARTUP_DISSOLVE_PATTERNS[15][index]) === 0
      && (row | STARTUP_DISSOLVE_PATTERNS[15][index]) === 0xff)).toBe(true);
    // Replaying either reveal in order leaves nothing undrawn.
    for (const steps of [STARTUP_TITLE.upperReveal.dissolveSteps, STARTUP_TITLE.lowerReveal.dissolveSteps]) {
      const covered = new Array<number>(8).fill(0);
      for (const step of steps) {
        STARTUP_DISSOLVE_PATTERNS[step].forEach((row, index) => { covered[index] |= row; });
      }
      expect(covered).toEqual(new Array<number>(8).fill(0xff));
    }
  });

  it("keeps the native pretitle, scroll and title timings", () => {
    expect(STARTUP_PRETITLE).toMatchObject({ x: 95, y: 77, fadeInSteps: 64, fadeOutSteps: 63, holdNativeTicks: 300 });
    expect(STARTUP_INTRO.scrollUpdates).toBe(591);
    expect(STARTUP_INTRO.nativeTicks).toBe(7092);
    expect(STARTUP_INTRO.ticksPerScrollUpdate).toBe(12);
    expect(STARTUP_INTRO.backgrounds.map(({ record }) => record)).toEqual([41, 43, 44, 45, 46, 47, 48]);
    expect(STARTUP_INTRO.backgroundChanges).toHaveLength(6);
    expect(STARTUP_TITLE.upperReveal.dissolveSteps).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(STARTUP_TITLE.lowerReveal.dissolveSteps).toHaveLength(16);
    expect(STARTUP_TITLE.upperReveal.ticksPerStep).toBe(5);
    expect(STARTUP_TITLE.idleReplayNativeTicks).toBe(1608);
    expect(STARTUP_TITLE.variants).toHaveLength(2);
  });

  /**
   * The rows do not appear whole at a target row. 0000:11DA clears the band,
   * draws the three rows and then fills DS:07C0 and DS:07CA with colour 0, so a
   * row entering at Y=316 shows one scanline, gains one per scroll update until
   * it clears the lower bar, and slides back under the upper bar the same way.
   */
  it("uncovers and covers each scrolling row one scanline per update", () => {
    const draw = titlePresentations.intro.draw;
    expect(STARTUP_INTRO.visibleWindow).toEqual(draw.visibleWindow);
    expect(draw.upperMask).toMatchObject({ y: 257, height: 16, colorIndex: 0 });
    expect(draw.lowerMask).toMatchObject({ y: 317, height: 16, colorIndex: 0 });
    expect(INTRO_BAND.bottom - INTRO_BAND.top).toBe(draw.visibleWindow.height);
    // REMAKE-113 slides the whole band down and 0000:2CCE puts the white cell one
    // row below the cursor, so the visible ramp is measured off that pass.
    const ramp = STARTUP_FONT.glyphHeight;
    const white = (nativeY: number) => clipStartupGlyphRow(
      nativeY + INTRO_BAND_OFFSET + STARTUP_TEXT.glyphOffset.dy, INTRO_BAND);
    // The reset row and the update after the last visible one stay fully masked.
    expect(white(STARTUP_INTRO.resetY)).toBeUndefined();
    expect(white(STARTUP_INTRO.visibleTopY - 1)).toBeUndefined();
    // The first row the lower bar lets through shows a single scanline, and the
    // last one before the upper bar swallows it shows a single scanline too.
    expect(white(STARTUP_INTRO.visibleBottomY - 1))
      .toEqual({ sourceY: 0, y: INTRO_BAND.bottom - 1, height: 1 });
    expect(white(STARTUP_INTRO.visibleTopY))
      .toEqual({ sourceY: ramp - 1, y: INTRO_BAND.top, height: 1 });
    const run = STARTUP_INTRO.visibleBottomY - STARTUP_INTRO.visibleTopY + 1;
    const heights = Array.from({ length: run }, (_, index) =>
      white(STARTUP_INTRO.visibleBottomY - index)?.height ?? 0);
    expect(Math.max(...heights)).toBe(ramp);
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBe(1);
    expect(heights.at(-1)).toBe(1);
    for (let index = 1; index < heights.length; index += 1) {
      expect(Math.abs(heights[index] - heights[index - 1])).toBeLessThanOrEqual(1);
    }
    // Fully readable for exactly the updates that fit inside the window.
    const window = INTRO_BAND.bottom - INTRO_BAND.top;
    expect(heights.filter((height) => height === ramp)).toHaveLength(window - ramp + 1);
  });

  /**
   * 0000:2CCE never draws a cell once: `0000:2F96` OR-s the 15 glyph rows into a
   * 17-row buffer at offsets 0, 1 and 2, that mask goes down twice in colour 0 at
   * (x, y) and (x+2, y), and only then the cell itself in colour 15 at
   * (x+1, y+1). The outline is invisible on the intro's black band but is what
   * keeps a highlighted menu label readable over the stipple painted under it.
   */
  it("carries the native outline pass on every drawn string", () => {
    const draw = titlePresentations.glyphText;
    expect(draw.colorIndex).toBe(15);
    expect(draw.outlineColorIndex).toBe(0);
    expect(draw.glyph).toMatchObject({ widthBytes: 2, rows: STARTUP_FONT.glyphHeight });
    expect(draw.outline).toMatchObject({ widthBytes: 2, rows: STARTUP_FONT.glyphHeight + 2 });
    expect(STARTUP_TEXT.outlineRows).toBe(draw.outline.rows);
    expect(STARTUP_TEXT.dilationRowOffsets).toEqual(draw.outlineDilationRowOffsets);
    expect(STARTUP_TEXT.outlinePasses).toEqual([{ dx: 0, dy: 0 }, { dx: 2, dy: 0 }]);
    expect(STARTUP_TEXT.glyphOffset).toEqual({ dx: 1, dy: 1 });
    expect(STARTUP_TEXT.color).toBe("#ffffff");
    expect(STARTUP_TEXT.outlineColor).toBe("#000000");
    // The mask reaches one row above and one below the cell it wraps.
    expect(STARTUP_TEXT.dilationRowOffsets.length - 1).toBe(2 * STARTUP_TEXT.glyphOffset.dy);
    // 0000:1AB1 lifts the highlight bar two rows above the cursor, which leaves
    // the outlined cell centred in the 20-row stipple.
    expect(STARTUP_MENU_LABELS.highlight.yOffset).toBe(-2);
  });

  /**
   * REMAKE-113: the native window sits 16 rows under the plate but 33 rows above
   * the screen bottom. The remake shifts the band, masks included, until those
   * two gutters match; nothing else about the scroll changes.
   */
  it("balances the shifted band between the plate and the screen bottom", async () => {
    const plate = await readPlatePixels(STARTUP_INTRO.backgrounds[0].src);
    expect(STARTUP_INTRO.backgrounds[0].y).toBe(0);
    const nativeTop = STARTUP_INTRO.visibleWindow.y;
    expect(INTRO_BAND.top).toBe(nativeTop + INTRO_BAND_OFFSET);
    expect(nativeTop - plate.height).toBe(16);
    expect(STARTUP_SCREEN.height - (nativeTop + STARTUP_INTRO.visibleWindow.height)).toBe(33);
    const above = INTRO_BAND.top - plate.height;
    const below = STARTUP_SCREEN.height - INTRO_BAND.bottom;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    // The lowest row a glyph can reach still fits on the 350-line screen.
    expect(INTRO_BAND.bottom - 1 + STARTUP_FONT.glyphHeight).toBeLessThan(STARTUP_SCREEN.height);
  });

  /**
   * The four difficulty names predate `REMAKE-103`, which only rebuilt rungs 1
   * and 2. The menu hint has to keep saying which rung still ships the native
   * side-2 numbers, so every part of it but the closing sentence is derived from
   * the scaling table rather than written out a second time.
   */
  it("keeps each difficulty hint in step with the enemy scaling table", () => {
    const notes = [
      "適合懷舊原版劇情，不會卡關。",
      "最推薦的均衡難度，比原版「困難重重」略難。",
      "比較有挑戰，但不至於繁瑣，比原版「無法無天」略易。",
      "骨灰挑戰，敵方數值和原版一致，比原版「無法無天」略難。",
    ];
    const hints = DIFFICULTY_OPTIONS.map(({ value }) => difficultyHintFor(value));
    expect(hints.map(({ growth }) => growth)).toEqual(["legacy", "linear", "linear", "legacy"]);
    expect(hints.map(({ sourceLabel }) => sourceLabel))
      .toEqual(["原版數值", "複刻調整", "複刻調整", "原版數值"]);
    expect(new Set(hints.map(({ detail }) => detail)).size).toBe(DIFFICULTY_OPTIONS.length);
    for (const [index, option] of DIFFICULTY_OPTIONS.entries()) {
      const hint = hints[index];
      const rule = enemyScalingFor(option.value);
      expect(hint.label).toBe(option.label);
      expect(hint.growth).toBe(rule.growth);
      expect(hint.sourceLabel).toBe(rule.growth === "legacy" ? "原版數值" : "複刻調整");
      expect(hint.detail).toContain(`敵方等級 ${rule.level}`);
      // Only difficulty 3 carries the native x1.5, and only 1 and 2 say that the
      // player's own growth is untouched.
      expect(hint.detail.includes("×1.5")).toBe(rule.statMultiplierPercent === 150);
      expect(hint.detail.includes("我方成長不變")).toBe(rule.growth === "linear");
      expect(hint.detail.endsWith(notes[index])).toBe(true);
    }
  });

  /** Every visible string is drawn with A/23+A/24, so the layouts must decode
   * back to the native text and sit on the 8-pixel cursor grid. */
  it("lays every intro row and menu label out with the native glyph font", () => {
    const rows = STARTUP_INTRO.lines.filter(({ text }) => text !== "");
    expect(rows).toHaveLength(17);
    expect(titlePresentations.intro.counts.narrativeLines).toBe(17);
    // 0000:1242 writes 00A0h to DS:510E before every row draw, so all 17 share
    // one left margin and their indents come from their own leading ideographic
    // spaces. Centring the padded line instead would apply the indent twice.
    const { textOriginX } = titlePresentations.intro.draw;
    const { x: bandX, width: bandWidth } = titlePresentations.intro.draw.visibleWindow;
    for (const row of rows) {
      const decoded = Array.from({ length: row.glyphs.length / 2 }, (_, index) =>
        glyphCharacter(row.glyphs[index * 2])).join("");
      expect(decoded).toBe(row.text.replaceAll("　", "").replaceAll(" ", ""));
      const indent = row.text.length - row.text.replace(/^　+/u, "").length;
      expect(row.glyphs[1]).toBe(textOriginX + indent * STARTUP_FONT.glyphWidth);
      for (let index = 0; index < row.glyphs.length; index += 2) {
        expect(row.glyphs[index + 1] % 8).toBe(0);
        expect(row.glyphs[index + 1]).toBeGreaterThanOrEqual(bandX);
        expect(row.glyphs[index + 1] + STARTUP_FONT.glyphWidth).toBeLessThanOrEqual(bandX + bandWidth);
      }
    }
    for (const group of [STARTUP_MENU_LABELS.title, STARTUP_MENU_LABELS.difficulty]) {
      for (const label of group.labels) {
        const decoded = Array.from({ length: label.glyphs.length / 2 }, (_, index) =>
          glyphCharacter(label.glyphs[index * 2])).join("");
        expect(decoded).toBe(label.text);
        expect(label.glyphs[1]).toBe(STARTUP_MENU_LABELS.textX);
      }
    }
    expect(STARTUP_MENU_LABELS.title.firstTextY).toBe(75);
    expect(STARTUP_MENU_LABELS.difficulty.firstTextY).toBe(51);
    expect(STARTUP_MENU_LABELS.highlight).toMatchObject({ x: 504, yOffset: -2, width: 96, height: 20 });
    // 0000:19F2/0000:1B7E draw the BK/40 surround in the same call as the labels.
    expect(STARTUP_MENU_LABELS.title.frame).toMatchObject({ x: 480, y: 45 });
    expect(STARTUP_MENU_LABELS.difficulty.frame).toMatchObject({ x: 480, y: 21 });
  });

  it("ships the A/24 glyph atlas bit for bit", async () => {
    const { glyphWidth, glyphHeight, columns, glyphCount } = STARTUP_FONT;
    const atlas = await readPlatePixels(STARTUP_FONT.src);
    expect(atlas.width).toBe(columns * glyphWidth);
    expect(atlas.height).toBe(Math.ceil(glyphCount / columns) * glyphHeight);
    const native = await readFile(path.join(workspace, "reverse/extracted/A/0024.bin"));
    expect(native.length).toBe(glyphCount * glyphHeight * 2);
    const mismatches: string[] = [];
    for (let glyph = 0; glyph < glyphCount; glyph += 1) {
      const cellX = (glyph % columns) * glyphWidth;
      const cellY = Math.floor(glyph / columns) * glyphHeight;
      for (let row = 0; row < glyphHeight; row += 1) {
        const bits = native.readUInt16BE(glyph * glyphHeight * 2 + row * 2);
        for (let column = 0; column < glyphWidth; column += 1) {
          const expected = (bits & (0x8000 >>> column)) !== 0;
          const offset = ((cellY + row) * atlas.width + cellX + column) * 4;
          const opaqueWhite = atlas.pixels[offset + 3] === 0xff && atlas.pixels[offset] === 0xff;
          if (opaqueWhite !== expected) mismatches.push(`${glyph}:${row}:${column}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
