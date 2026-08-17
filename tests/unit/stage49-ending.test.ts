import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import endingPresentations from "../../reverse/parsed/native/ending-presentations.json";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE49_ENDING_ASSETS,
  STAGE49_EPILOGUE_FONT,
  STAGE49_EPILOGUE_LAYOUT,
  STAGE49_EPILOGUE_MUSIC_BY_SELECTOR,
  STAGE49_EPILOGUE_SEGMENTS,
} from "../../src/game/content/stage49-ending";
import { Stage49EndingSession } from "../../src/game/simulation/stage49-ending";
import type { CampaignState, UnitClassId } from "../../src/game/types";
import { opaquePlateColors, paletteKeys, readPlatePixels } from "./postgame-plate-support";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function campaignWith(
  classes: readonly UnitClassId[] = [],
  recordCounters: readonly number[] = Array<number>(75).fill(0),
): CampaignState {
  return {
    stageId: "stage-37",
    ruleset: "stableRemake",
    difficulty: 0,
    roster: completeCampaignRoster(classes.map((classId, slot) => ({
      slot,
      classId,
      experience: 0,
      life: 100,
    }))),
    recordCounters: [...recordCounters],
    rngState: 0x49_49_49_49,
    rngCalls: 0,
  };
}

function advanceToEpilogue(session: Stage49EndingSession): void {
  for (let index = 0; index < 17 + 22; index += 1) session.advance();
}

describe("stage 49 main ending", () => {
  it("plays 17 story checkpoints and 22 native roster cards before the epilogue", () => {
    const session = new Stage49EndingSession(campaignWith(), 0);
    expect(session.storyPage?.source.wait).toBe(1);
    for (let index = 1; index < 17; index += 1) session.advance();
    expect(session.section).toBe("story");
    expect(session.storyPage?.source.wait).toBe(17);
    session.advance();
    expect(session.section).toBe("roster");
    expect(session.rosterCard).toMatchObject({
      actor: { slot: 0, portraitRecord: 46, name: "妮雅" },
      className: "士兵",
      nativeClassRecord: 0,
      record: 0,
    });
    for (let index = 1; index < 22; index += 1) session.advance();
    expect(session.rosterCard?.actor).toMatchObject({ slot: 21, name: "愛歐里雅" });
    session.advance();
    expect(session.section).toBe("epilogue");
  });

  it("uses native class-family precedence: cavalry ties first, then fighter, then strict mage", () => {
    expect(new Stage49EndingSession(campaignWith(["cavalry", "warrior"]), 0)
      .dominantClassFamily).toBe("cavalry");
    expect(new Stage49EndingSession(campaignWith(Array<UnitClassId>(23).fill("warrior")), 0)
      .dominantClassFamily).toBe("fighter");
    expect(new Stage49EndingSession(campaignWith(Array<UnitClassId>(23).fill("magician")), 0)
      .dominantClassFamily).toBe("mage");
  });

  it("selects both strict >100 outcomes at their exact native thresholds", () => {
    const low = new Stage49EndingSession(campaignWith(), 100);
    advanceToEpilogue(low);
    low.advance();
    low.advance();
    expect(low.epiloguePresentation).toMatchObject({
      segment: { id: "saveCountOutcome" },
      variant: { selector: 1, illustrationRecords: [19, 20] },
    });
    low.advance();
    expect(low.epiloguePresentation).toMatchObject({
      segment: { id: "recordTotalOutcome" },
      variant: { selector: 0, illustrationRecords: [15, 16], music: "MUSIC/40" },
    });

    const counters = Array<number>(75).fill(0);
    counters[0] = 101;
    const high = new Stage49EndingSession(campaignWith([], counters), 101);
    advanceToEpilogue(high);
    high.advance();
    high.advance();
    expect(high.epiloguePresentation?.variant).toMatchObject({
      selector: 0,
      illustrationRecords: [17, 18],
    });
    high.advance();
    expect(high.epiloguePresentation?.variant).toMatchObject({
      selector: 1,
      illustrationRecords: [2, 3],
      music: "UN/49",
    });
  });

  it("keeps the record-total branch music selected across all four epilogue segments", () => {
    // Native module 35 starts the closing track at entry (0000:0457/045A),
    // before the first segment, so it must not arrive only with segment 4.
    const counters = Array<number>(75).fill(0);
    counters[3] = 101;
    const prosperous = new Stage49EndingSession(campaignWith(), 0);
    const decline = new Stage49EndingSession(campaignWith([], counters), 0);
    advanceToEpilogue(prosperous);
    advanceToEpilogue(decline);
    for (let segment = 0; segment < 4; segment += 1) {
      expect(prosperous.section).toBe("epilogue");
      expect(prosperous.index).toBe(segment);
      expect(prosperous.epilogueMusicSelector).toBe(0);
      expect(decline.epilogueMusicSelector).toBe(1);
      prosperous.advance();
      decline.advance();
    }
    expect(STAGE49_EPILOGUE_MUSIC_BY_SELECTOR.map(({ track }) => track))
      .toEqual(["MUSIC/40", "UN/49"]);
  });

  /**
   * Module 35 zeroes the hold counter at 0000:0529, before 0000:069E types the
   * text out at 24 native ticks per full-width glyph, so a segment lasts for
   * whichever is longer. The warrior statue's zero limit is therefore not the
   * flash it looks like: its 46 glyphs hold the screen for 1104 ticks on their
   * own, and no invented floor is needed.
   */
  it("holds each epilogue segment for its typing time or its native limit", () => {
    const session = new Stage49EndingSession(campaignWith(), 0);
    advanceToEpilogue(session);
    const waits: (number | undefined)[] = [];
    const typing: number[] = [];
    for (let segment = 0; segment < 4; segment += 1) {
      waits.push(session.autoAdvanceMilliseconds);
      typing.push(session.epiloguePresentation?.variant.typingNativeTicks ?? -1);
      session.advance();
    }
    expect(typing).toEqual([2160, 1104, 1920, 1656]);
    expect(waits).toEqual([23_740, 11_040, 22_430, 25_400]);
    expect(STAGE49_EPILOGUE_SEGMENTS[1]).toMatchObject({
      id: "warriorStatue",
      waitNativeTicks: 0,
    });
  });

  it("types every epilogue variant with the native font, cadence and layout", () => {
    const glyphTable = endingPresentations.glyphSets.epilogueAndCredits.glyphs;
    const { originX, originY, fullWidthAdvance, halfWidthAdvance, lineAdvance, glyphNativeTicks }
      = STAGE49_EPILOGUE_LAYOUT;
    for (const segment of STAGE49_EPILOGUE_SEGMENTS) {
      for (const variant of segment.variants) {
        const count = variant.glyphs.length / 3;
        expect(Number.isInteger(count)).toBe(true);
        expect(variant.typingNativeTicks).toBe(count * glyphNativeTicks);
        // The atlas indices must decode back to the visible text, in order.
        expect(Array.from({ length: count }, (_, index) =>
          glyphTable[variant.glyphs[index * 3]]?.char).join(""))
          .toBe(variant.text.replaceAll("\n", ""));
        // Every glyph sits on the native cursor grid the module walks.
        for (let index = 0; index < count; index += 1) {
          const x = variant.glyphs[index * 3 + 1];
          const y = variant.glyphs[index * 3 + 2];
          expect((x - originX) % halfWidthAdvance).toBe(0);
          expect((y - originY) % lineAdvance).toBe(0);
          expect(x).toBeGreaterThanOrEqual(originX);
          expect(x + fullWidthAdvance).toBeLessThanOrEqual(STAGE49_EPILOGUE_LAYOUT.screenWidth);
        }
        expect(variant.inkColor).toBe("#ffffff");
        expect(variant.shadowColor).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  /**
   * The runtime cannot rebuild module 35's smeared scratch buffer, so it draws
   * the plain glyph at six offsets instead. That substitution is only legal if
   * it paints the same pixels the native three-pass draw does — including the
   * ink that must survive on top — so assert it for every shipped variant.
   */
  it("matches the native smeared-shadow draw with its six-offset substitute", async () => {
    const native = await readFile(path.join(workspace, "reverse/extracted/UN/0010.bin"));
    const { screenWidth, screenHeight, inkOffset, shadowOffsets } = STAGE49_EPILOGUE_LAYOUT;
    const glyphRows = (glyph: number) =>
      Array.from({ length: 15 }, (_, row) => native.readUInt16BE(glyph * 30 + row * 2));
    const paint = (
      surface: Uint8Array,
      rows: readonly number[],
      x: number,
      y: number,
      value: number,
    ) => {
      for (let row = 0; row < rows.length; row += 1) {
        for (let column = 0; column < 16; column += 1) {
          if ((rows[row] & (0x8000 >>> column)) === 0) continue;
          const px = x + column;
          const py = y + row;
          if (px < 0 || px >= screenWidth || py < 0 || py >= screenHeight) continue;
          surface[py * screenWidth + px] = value;
        }
      }
    };
    for (const segment of STAGE49_EPILOGUE_SEGMENTS) {
      for (const variant of segment.variants) {
        const nativeSurface = new Uint8Array(screenWidth * screenHeight);
        const remakeSurface = new Uint8Array(screenWidth * screenHeight);
        for (let index = 0; index < variant.glyphs.length; index += 3) {
          const [glyph, x, y] = [
            variant.glyphs[index],
            variant.glyphs[index + 1],
            variant.glyphs[index + 2],
          ];
          const rows = glyphRows(glyph);
          // 0000:1D1C ORs the glyph into a 17-row buffer at row offsets 0, 1, 2.
          const smeared = new Array<number>(17).fill(0);
          for (let offset = 0; offset < 3; offset += 1) {
            for (let row = 0; row < 15; row += 1) smeared[row + offset] |= rows[row];
          }
          paint(nativeSurface, smeared, x, y, 1);
          paint(nativeSurface, smeared, x + 2, y, 1);
          paint(nativeSurface, rows, x + inkOffset[0], y + inkOffset[1], 2);
        }
        for (const [offsetX, offsetY] of shadowOffsets) {
          for (let index = 0; index < variant.glyphs.length; index += 3) {
            paint(
              remakeSurface,
              glyphRows(variant.glyphs[index]),
              variant.glyphs[index + 1] + inkOffset[0] + offsetX,
              variant.glyphs[index + 2] + inkOffset[1] + offsetY,
              1,
            );
          }
        }
        for (let index = 0; index < variant.glyphs.length; index += 3) {
          paint(
            remakeSurface,
            glyphRows(variant.glyphs[index]),
            variant.glyphs[index + 1] + inkOffset[0],
            variant.glyphs[index + 2] + inkOffset[1],
            2,
          );
        }
        expect(Buffer.compare(Buffer.from(remakeSurface), Buffer.from(nativeSurface))).toBe(0);
      }
    }
  });

  it("ships the UN/10 glyph atlas bit for bit", async () => {
    const { glyphWidth, glyphHeight, columns, glyphCount } = STAGE49_EPILOGUE_FONT;
    const atlas = await readPlatePixels(STAGE49_EPILOGUE_FONT.src);
    expect(atlas.width).toBe(columns * glyphWidth);
    expect(atlas.height).toBe(Math.ceil(glyphCount / columns) * glyphHeight);
    const native = await readFile(path.join(workspace, "reverse/extracted/UN/0010.bin"));
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
          const opaqueWhite = atlas.pixels[offset + 3] === 0xff
            && atlas.pixels[offset] === 0xff
            && atlas.pixels[offset + 1] === 0xff
            && atlas.pixels[offset + 2] === 0xff;
          if (opaqueWhite !== expected) mismatches.push(`${glyph}:${row}:${column}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  /**
   * Module 35 fades in a dedicated 16-color DAC table per illustration pair, so
   * shipping the gameplay-palette planar masters recolored every epilogue plate
   * into saturated dithering. Each shipped half must therefore stay inside its
   * own pair's palette.
   */
  it("ships every epilogue plate under its own native module-35 palette", async () => {
    const variants = endingPresentations.module35ConditionalEpilogue.illustrationVariantTable;
    expect(variants).toHaveLength(8);
    for (const variant of variants) {
      const allowed = paletteKeys(variant.palette.colors);
      expect(allowed.size).toBeGreaterThan(1);
      for (const record of variant.records) {
        const colors = await opaquePlateColors(STAGE49_ENDING_ASSETS.epilogue(record));
        expect(colors.size).toBeGreaterThan(1);
        expect([...colors].filter((color) => !allowed.has(color))).toEqual([]);
      }
    }
  });

  it("ends at the hidden-stage boundary without entering stage 38 or credits", () => {
    const session = new Stage49EndingSession(campaignWith(), 0);
    advanceToEpilogue(session);
    for (let index = 0; index < 4; index += 1) session.advance();
    expect(session.section).toBe("stage38-boundary");
    session.advance();
    expect(session.section).toBe("stage38-boundary");
  });
});
