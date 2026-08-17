import { describe, expect, it } from "vitest";
import endingPresentations from "../../reverse/parsed/native/ending-presentations.json";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE49_ENDING_ASSETS,
  STAGE49_EPILOGUE_MUSIC_BY_SELECTOR,
  STAGE49_EPILOGUE_SEGMENTS,
} from "../../src/game/content/stage49-ending";
import { Stage49EndingSession } from "../../src/game/simulation/stage49-ending";
import type { CampaignState, UnitClassId } from "../../src/game/types";
import { opaquePlateColors, paletteKeys } from "./postgame-plate-support";

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

  it("gives the zero-limit warrior statue a visible floor without touching its siblings", () => {
    // The native limit is 0, which in a browser means the plates never paint.
    const session = new Stage49EndingSession(campaignWith(), 0);
    advanceToEpilogue(session);
    const waits: (number | undefined)[] = [];
    for (let segment = 0; segment < 4; segment += 1) {
      waits.push(session.autoAdvanceMilliseconds);
      session.advance();
    }
    expect(waits).toEqual([23_740, 22_430, 22_430, 25_400]);
    expect(STAGE49_EPILOGUE_SEGMENTS[1]).toMatchObject({
      id: "warriorStatue",
      waitNativeTicks: 0,
    });
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
