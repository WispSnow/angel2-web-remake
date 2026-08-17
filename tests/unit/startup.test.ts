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
  STARTUP_TITLE,
} from "../../src/game/content/startup.generated";
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

  /** Every visible string is drawn with A/23+A/24, so the layouts must decode
   * back to the native text and sit on the 8-pixel cursor grid. */
  it("lays every intro row and menu label out with the native glyph font", () => {
    const rows = STARTUP_INTRO.lines.filter(({ text }) => text !== "");
    expect(rows).toHaveLength(17);
    expect(titlePresentations.intro.counts.narrativeLines).toBe(17);
    for (const row of rows) {
      const decoded = Array.from({ length: row.glyphs.length / 2 }, (_, index) =>
        glyphCharacter(row.glyphs[index * 2])).join("");
      expect(decoded).toBe(row.text.replaceAll("　", "").replaceAll(" ", ""));
      for (let index = 0; index < row.glyphs.length; index += 2) {
        expect(row.glyphs[index + 1] % 8).toBe(0);
        expect(row.glyphs[index + 1]).toBeGreaterThanOrEqual(0);
        expect(row.glyphs[index + 1] + STARTUP_FONT.glyphWidth).toBeLessThanOrEqual(640);
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
