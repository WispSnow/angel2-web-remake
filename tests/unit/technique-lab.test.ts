import { describe, expect, it } from "vitest";
import {
  TECHNIQUE_LAB_AUDIO_ASSETS,
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_DISPEL,
  TECHNIQUE_LAB_ICE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "../../src/game/content/technique-lab.generated";
import {
  buildLightningTimeline,
  iceFrameAtGlobalIndex,
  lightningWaveDistance,
} from "../../src/game/map-technique-presentation";
import { TechniqueLabSession } from "../../src/game/technique-lab-session";

describe("map technique laboratory evidence", () => {
  it("builds every lightning tier at its exact native duration", () => {
    expect(Object.values(TECHNIQUE_LAB_LIGHTNING).map((definition) => {
      const timeline = buildLightningTimeline(definition);
      return {
        code: definition.code,
        duration: timeline.at(-1)?.endNativeTicks,
        mainDraws: timeline.filter(({ frame }) => frame.kind === "main").length,
        waveDraws: timeline.filter(({ frame }) => frame.kind === "wave").length,
        cleanupDraws: timeline.filter(({ frame }) => frame.kind === "cleanup").length,
      };
    })).toEqual([
      { code: "1L", duration: 414, mainDraws: 32, waveDraws: 22, cleanupDraws: 5 },
      { code: "2L", duration: 257, mainDraws: 21, waveDraws: 16, cleanupDraws: 5 },
      { code: "3L", duration: 348, mainDraws: 27, waveDraws: 14, cleanupDraws: 5 },
      { code: "4L", duration: 304, mainDraws: 32, waveDraws: 30, cleanupDraws: 5 },
    ]);
    expect(TECHNIQUE_LAB_LIGHTNING["2L"].commonHit.runtimeTileCodes).toEqual([6, 7]);
    expect(TECHNIQUE_LAB_LIGHTNING["3L"].commonHit.runtimeTileCodes).toEqual([5, 6]);
    expect(TECHNIQUE_LAB_LIGHTNING["4L"].commonHit.runtimeTileCodes).toEqual([12, 13]);
    const hit = TECHNIQUE_LAB_LIGHTNING["2L"].commonHit;
    expect([0, 1, 2, 3].map((frame) => lightningWaveDistance(hit, frame, 4)))
      .toEqual([1, 1, 2, 2]);
  });

  it("raises the advanced-lightning cloud so the bolt bottom lands on the selected cell", () => {
    const lightning = TECHNIQUE_LAB_LIGHTNING["3L"];
    expect(lightning.phases[0].anchorOffsetSequence).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        x: 0,
        y: index < 3 ? 0 : -Math.floor(index / 3),
      })),
    );
    expect(lightning.phases[1].anchorOffsetSequence).toEqual(
      Array.from({ length: 15 }, () => ({ x: 0, y: -4 })),
    );
    lightning.phases[1].descriptorSequence.forEach((descriptor, index) => {
      const anchor = lightning.phases[1].anchorOffsetSequence[index];
      expect(anchor.y + descriptor.yOffset + descriptor.height - 1).toBe(0);
    });
  });

  it("descends ultimate lightning and keeps every full bolt planted on the selected cell", () => {
    const lightning = TECHNIQUE_LAB_LIGHTNING["4L"];
    expect(lightning.phases[0].anchorOffsetSequence).toEqual(
      Array.from({ length: 18 }, (_, index) => ({
        x: 0,
        y: -8 + Math.floor(index / 2),
      })),
    );
    expect(lightning.phases.slice(1).map(({ anchorOffsetSequence }) => anchorOffsetSequence))
      .toEqual([
        Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
        Array.from({ length: 6 }, () => ({ x: 0, y: 1 })),
        Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
      ]);
    lightning.phases.slice(1).forEach((phase) => {
      phase.descriptorSequence.forEach((descriptor, index) => {
        const anchor = phase.anchorOffsetSequence[index];
        expect(anchor.y + descriptor.yOffset + descriptor.height - 1).toBe(0);
      });
    });
  });

  it("plays every ice tier as six-frame rings expanding from the actor center", () => {
    expect(Object.values(TECHNIQUE_LAB_ICE).map((definition) => ({
      code: definition.code,
      duration: definition.fixedGraphicWaitNativeTicks,
      ranges: definition.rangeValueSequence,
      distances: definition.distanceFromCenterSequence,
    }))).toEqual([
      { code: "1C", duration: 120, ranges: [2, 1], distances: [1, 2] },
      { code: "2C", duration: 180, ranges: [3, 2, 1], distances: [1, 2, 3] },
      { code: "3C", duration: 240, ranges: [4, 3, 2, 1], distances: [1, 2, 3, 4] },
      { code: "4C", duration: 300, ranges: [5, 4, 3, 2, 1], distances: [1, 2, 3, 4, 5] },
    ]);
    const ice1 = TECHNIQUE_LAB_ICE["1C"];
    expect([0, 5, 6, 11].map((frame) => iceFrameAtGlobalIndex(ice1, frame)))
      .toEqual([
        expect.objectContaining({ cycleIndex: 0, sourceFrame: 0, rangeValue: 2, distanceFromCenter: 1 }),
        expect.objectContaining({ cycleIndex: 0, sourceFrame: 5, rangeValue: 2, distanceFromCenter: 1 }),
        expect.objectContaining({ cycleIndex: 1, sourceFrame: 0, rangeValue: 1, distanceFromCenter: 2 }),
        expect.objectContaining({ cycleIndex: 1, sourceFrame: 5, rangeValue: 1, distanceFromCenter: 2 }),
      ]);
    expect(iceFrameAtGlobalIndex(ice1, 12)).toBeUndefined();
    expect(TECHNIQUE_LAB_AUDIO_ASSETS["UN/50"])
      .toBe("/assets/original/technique-lab/audio/un-50.wav");
    expect(Object.values(TECHNIQUE_LAB_ICE).every(({ centerMode }) => centerMode === "actor position"))
      .toBe(true);
  });

  it("keeps every implemented final effect for its native post-draw wait", () => {
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS).toEqual({
      "1F": 10,
      "1H": 15,
      "1C": 10,
      "2C": 10,
      "3C": 10,
      "4C": 10,
      "1L": 10,
      "2L": 10,
      "3L": 10,
      "4L": 10,
      "TR": 5,
    });
  });

  it("uses the original 50-frame, 250-tick dispel presentation", () => {
    expect(TECHNIQUE_LAB_DISPEL).toMatchObject({
      code: "TR",
      visibleName: "破邪",
      fixedGraphicWaitNativeTicks: 250,
      audioRequests: [],
    });
    expect(TECHNIQUE_LAB_DISPEL.phases.map(({ drawCount }) => drawCount)).toEqual([24, 26]);
    expect(TECHNIQUE_LAB_DISPEL.phases.reduce(
      (total, { runtimeTileCodeStates }) => total + runtimeTileCodeStates.length,
      0,
    )).toBe(50);
  });

  it("exposes the full native menu while gating unfinished techniques", () => {
    expect(TECHNIQUE_LAB_CATALOG).toHaveLength(33);
    expect(TECHNIQUE_LAB_CATALOG.filter(({ implementationId }) => implementationId !== null)
      .map(({ nativeCode }) => nativeCode))
      .toEqual(["1C", "1F", "1H", "1L", "2C", "2L", "3C", "3L", "4C", "4L", "TR"]);
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "4F"))
      .toMatchObject({ label: "究級炎暴", implementationId: null });
  });

  it("keeps absent side-1 boss-part art unavailable instead of fabricating it", () => {
    expect(Object.keys(TECHNIQUE_LAB_UNIT_ASSETS)).toHaveLength(39);
    expect(TECHNIQUE_LAB_UNIT_ASSETS.dragon).toMatchObject({ nativeRecord: 36, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.head).toMatchObject({ nativeRecord: 37, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.hand).toMatchObject({ nativeRecord: 38, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.dragon.enemy).toMatch(/enemy-dragon\.png$/u);
  });
});

describe("map technique laboratory session", () => {
  it("places either side, assigns actor and target, and previews tier damage", () => {
    const session = new TechniqueLabSession();
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier", "cavalry"]);
    expect(session.affectedUnits().map((unit) => session.lightningDamageFor(unit))).toEqual([50, 20]);

    session.setActionCode("4L");
    expect(session.affectedUnits().map(({ classId }) => classId))
      .toEqual(["soldier", "cavalry", "sister"]);
    expect(session.affectedUnits().map((unit) => session.lightningDamageFor(unit)))
      .toEqual([110, 70, 50]);

    session.setActionCode("4C");
    expect(session.effectCells()).toHaveLength(61);
    expect(session.state.target).toEqual({ x: 21, y: 18 });

    session.setPlacementSide(1);
    session.setPlacementClass("wizard");
    session.interact(24, 20);
    expect(session.state.units.find(({ x, y }) => x === 24 && y === 20))
      .toMatchObject({ side: 1, classId: "wizard" });
    session.setTool("actor");
    session.interact(24, 20);
    expect(session.actor()?.classId).toBe("wizard");
    expect(session.state.target).toEqual({ x: 24, y: 20 });
    session.setTool("target");
    expect(session.state.tool).toBe("actor");
    expect(session.interact(25, 20)).toBe(false);
    expect(session.state.target).toEqual({ x: 24, y: 20 });
  });

  it("rejects unfinished techniques and missing allied boss-part graphics", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("4F")).toBe(false);
    expect(session.state.actionCode).toBe("1L");
    session.setPlacementSide(1);
    expect(session.setPlacementClass("dragon")).toBe(false);
    expect(session.state.placementClass).toBe("soldier");
  });
});
