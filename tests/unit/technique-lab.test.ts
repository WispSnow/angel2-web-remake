import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TECHNIQUE_LAB_ATTACK_DOWN,
  TECHNIQUE_LAB_ATTACK_UP,
  TECHNIQUE_LAB_CONFUSION,
  TECHNIQUE_LAB_DEFENSE_UP,
  TECHNIQUE_LAB_DEFENSE_DOWN,
  TECHNIQUE_LAB_SPELL_SEAL,
  TECHNIQUE_LAB_MAGIC_GUARD,
  TECHNIQUE_LAB_PRAYER,
  TECHNIQUE_LAB_POISON,
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_DISPEL,
  TECHNIQUE_LAB_FIRE,
  TECHNIQUE_LAB_HEAL,
  TECHNIQUE_LAB_ICE,
  TECHNIQUE_LAB_IRON_PLATE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_OBSTACLE,
  TECHNIQUE_LAB_STOMP,
  TECHNIQUE_LAB_STOMPS,
  TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "../../src/game/content/technique-lab.generated";
import {
  TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS,
  TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS,
} from "../../src/game/content/technique-lab-formal-assets";
import {
  buildLightningTimeline,
  iceFrameAtGlobalIndex,
  lightningWaveDistance,
} from "../../src/game/map-technique-presentation";
import { TechniqueLabSession } from "../../src/game/technique-lab-session";
import { buildStompPresentationSteps } from "../../src/game/stomp-presentation";
import { STAGE1_ACTION_PRESENTATION } from "../../src/game/content/stage1-actions.generated";

describe("map technique laboratory evidence", () => {
  it("splits every lightning tier's hit resource into a sweep range and two marker frames", () => {
    // REMAKE-049: `0000:65A5` paints frames `0..sweepWidth - 1` across the band
    // and `1000:6E46` overlays the two `runtimeTileCodes` frames on enemy cells.
    // 2L/3L/4L therefore budget exactly `sweepWidth + 2` frames, with the marker
    // codes pointing at the resource's last two "unit electrocuted" frames. 1L's
    // MAGIC/31 has no character art and reuses two mid-sequence spark frames, so
    // it is the one tier whose markers are not the final pair.
    expect(Object.values(TECHNIQUE_LAB_LIGHTNING).map((definition) => {
      const { resource, sweepWidth, runtimeTileCodes } = definition.commonHit;
      const frames = TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS[
        resource as keyof typeof TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS
      ].length;
      return {
        code: definition.code,
        frames,
        sweepWidth,
        markerFrames: runtimeTileCodes.map((tileCode) => tileCode - 1),
        markersAreFinalPair: runtimeTileCodes.at(-1) === frames,
      };
    })).toEqual([
      { code: "1L", frames: 12, sweepWidth: 9, markerFrames: [4, 5], markersAreFinalPair: false },
      { code: "2L", frames: 7, sweepWidth: 5, markerFrames: [5, 6], markersAreFinalPair: true },
      { code: "3L", frames: 6, sweepWidth: 4, markerFrames: [4, 5], markersAreFinalPair: true },
      { code: "4L", frames: 13, sweepWidth: 11, markerFrames: [11, 12], markersAreFinalPair: true },
    ]);
    for (const definition of Object.values(TECHNIQUE_LAB_LIGHTNING)) {
      const { resource, sweepWidth, runtimeTileCodes } = definition.commonHit;
      const frames = TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS[
        resource as keyof typeof TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS
      ].length;
      for (const tileCode of runtimeTileCodes) {
        expect(tileCode - 1).toBeGreaterThanOrEqual(0);
        expect(tileCode - 1).toBeLessThan(frames);
      }
      expect(sweepWidth).toBeLessThanOrEqual(frames);
    }
  });

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
    expect(hit).toMatchObject({
      rangeThresholdStart: 3,
      rangeThresholdDecrementPerWaveDraw: 1,
      waveDrawsPerIteration: 2,
    });
    expect([0, 1, 2, 3].map((frame) => lightningWaveDistance(hit, frame, 4)))
      .toEqual([1, 2, 3, 4]);
    expect([0, 1, 2, 3].map((frame) => lightningWaveDistance(hit, frame, 1)))
      .toEqual([-2, -1, 0, 1]);
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
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/50"])
      .toBe("/assets/original/audio/un/50.wav");
    expect(Object.values(TECHNIQUE_LAB_ICE).every(({ centerMode }) => centerMode === "actor position"))
      .toBe(true);
  });

  it("keeps every implemented final effect for its native post-draw wait", () => {
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS).toEqual({
      "1D": 0,
      "2D": 0,
      "3D": 0,
      "1K": 0,
      "2K": 0,
      "1F": 10,
      "2F": 10,
      "3F": 15,
      "4F": 10,
      "1H": 15,
      "2H": 15,
      "3H": 15,
      "1I": 15,
      "2I": 15,
      "3I": 15,
      "1C": 10,
      "2C": 10,
      "3C": 10,
      "4C": 10,
      "1L": 10,
      "2L": 10,
      "3L": 10,
      "4L": 10,
      "AA": 15,
      "AD": 15,
      "FM": 15,
      "IP": 10,
      "LA": 15,
      "OJ": 60,
      "SA": 15,
      "SD": 15,
      "SN": 25,
      "TR": 5,
    });
  });

  it("builds 2F from twelve native descriptors instead of playing its 21 tiles as frames", () => {
    const fire = TECHNIQUE_LAB_FIRE["2F"];
    expect(fire).toMatchObject({
      code: "2F",
      selectionRadius: 6,
      percentMaxLife: 26,
      damageCap: 156,
      experienceBase: 10,
      experienceRandom: [0, 1],
      fixedGraphicWaitNativeTicks: 120,
      audioRequests: [{ resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 }],
    });
    expect(fire.phases).toHaveLength(1);
    expect(fire.phases[0].descriptorSequence).toHaveLength(12);
    expect(fire.phases[0].descriptorSequence.map(({ width, height }) => [width, height]))
      .toEqual([[1, 1], [1, 1], [1, 1], ...Array.from({ length: 9 }, () => [1, 2])]);
    expect(fire.phases[0].descriptorSequence.flatMap(({ low7BitFrameIndices }) =>
      low7BitFrameIndices)).toEqual(Array.from({ length: 21 }, (_, index) => index));
  });

  it("builds 3F from thirteen native descriptors and preserves its blank 15-tick tail", () => {
    const fire = TECHNIQUE_LAB_FIRE["3F"];
    expect(fire).toMatchObject({
      code: "3F",
      selectionRadius: 7,
      percentMaxLife: 32,
      damageCap: 192,
      experienceBase: 12,
      experienceRandom: [0, 2],
      fixedGraphicWaitNativeTicks: 195,
      audioRequests: [{ resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 }],
    });
    expect(fire.phases).toHaveLength(1);
    expect(fire.phases[0].descriptorSequence).toHaveLength(13);
    expect(fire.phases[0].descriptorSequence.map(({ width, height }) => [width, height]))
      .toEqual([
        [1, 1],
        [2, 1],
        ...Array.from({ length: 4 }, () => [3, 1]),
        ...Array.from({ length: 7 }, () => [3, 2]),
      ]);
    expect(fire.phases[0].descriptorSequence.at(-1)?.low7BitFrameIndices)
      .toEqual([null, null, null, null, null, null]);
    expect(fire.phases[0].descriptorSequence.slice(0, -1)
      .flatMap(({ low7BitFrameIndices }) => low7BitFrameIndices))
      .toEqual(Array.from({ length: 51 }, (_, index) => index));
  });

  it("builds 2H as seven six-tile heart descriptors repeated before the shared tail", () => {
    const heal = TECHNIQUE_LAB_HEAL["2H"];
    expect(heal).toMatchObject({
      code: "2H",
      selectionRadius: 6,
      maxLifePercent: 36,
      experienceBase: 12,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 215,
      audioRequests: [{ resource: "E/36", afterFixedWaitNativeTicks: 0 }],
    });
    expect(heal.phases.map(({ resource, drawCount, waitPerDrawNativeTicks }) => ({
      resource,
      drawCount,
      waitPerDrawNativeTicks,
    }))).toEqual([
      { resource: "MAGIC/37", drawCount: 14, waitPerDrawNativeTicks: 10 },
      { resource: "MAGIC/0", drawCount: 5, waitPerDrawNativeTicks: 15 },
    ]);
    expect(heal.phases[0].descriptorSequence.every(({ width, height }) =>
      width === 3 && height === 2)).toBe(true);
    expect(heal.phases[0].descriptorSequence.flatMap(({ low7BitFrameIndices }) =>
      low7BitFrameIndices)).toEqual([
      ...Array.from({ length: 42 }, (_, index) => index),
      ...Array.from({ length: 42 }, (_, index) => index),
    ]);
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/36"])
      .toBe("/assets/original/audio/e/36.wav");
  });

  it("keeps all seventeen shared recovery stages for 2I while changing only its rules", () => {
    const recovery = STAGE1_ACTION_PRESENTATION.recovery2;
    expect(recovery).toMatchObject({
      actionCodes: ["1I", "2I", "3I"],
      fixedGraphicWaitNativeTicks: 255,
      tierPresentationDifferences: false,
      audioRequests: [{ resource: "E/36", afterFixedWaitNativeTicks: 0 }],
      presentation: {
        resource: "MAGIC/20",
        drawCount: 17,
        waitPerDrawNativeTicks: 15,
      },
    });
    expect(recovery.presentation.descriptorSequence.map(({ tileCodes }) => tileCodes[0]))
      .toEqual([1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1, 1, 0, 0]);
  });

  it("projects 3I with its distinct radius-four and four-ring recovery values", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("3I")).toBe(true);
    expect(session.effectCells()).toHaveLength(25);
    const center = session.effectCenter()!;
    expect(session.effectCells().find(({ position }) =>
      position.x === center.x && position.y === center.y)?.value).toBe(4);
    expect(session.effectCells().filter(({ value }) => value === 1)).toHaveLength(12);
    expect(STAGE1_ACTION_PRESENTATION.recovery3.presentation.descriptorSequence
      .map(({ tileCodes }) => tileCodes[0]))
      .toEqual([1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1, 1, 0, 0]);
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

  it("keeps AA as twenty two-tile MAGIC/16 pairs over 300 ticks with UN/51", () => {
    expect(TECHNIQUE_LAB_ATTACK_UP).toMatchObject({
      code: "AA",
      visibleName: "攻擊提升",
      selectionRadius: 4,
      effectiveAttackDelta: 20,
      statusCounter: 3,
      experienceBase: 10,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 300,
      audioRequests: [{ resource: "UN/51", afterFixedWaitNativeTicks: 0 }],
    });
    expect(TECHNIQUE_LAB_ATTACK_UP.phases[0].runtimeTileCodePairs).toEqual(
      Array.from({ length: 20 }, (_, index) => [index + 1, index + 21]),
    );
    expect(TECHNIQUE_LAB_ATTACK_UP.phases[0]).toMatchObject({
      resource: "MAGIC/16",
      drawCount: 20,
      waitPerDrawNativeTicks: 15,
      descriptor: { xOffset: 0, yOffset: -1, width: 1, height: 2 },
    });
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/51"])
      .toBe("/assets/original/audio/un/51.wav");
  });

  it("keeps AD as the eleven four-tile MAGIC/33 shield states over 165 ticks with UN/52", () => {
    expect(TECHNIQUE_LAB_DEFENSE_UP).toMatchObject({
      code: "AD",
      visibleName: "防禦提升",
      selectionRadius: 4,
      effectiveDefenseDelta: 20,
      statusCounter: 3,
      experienceBase: 10,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 165,
      audioRequests: [{ resource: "UN/52", afterFixedWaitNativeTicks: 0 }],
    });
    const phase = TECHNIQUE_LAB_DEFENSE_UP.phases[0];
    expect(phase).toMatchObject({
      resource: "MAGIC/33",
      drawCount: 11,
      waitPerDrawNativeTicks: 15,
    });
    expect(phase.descriptorSequence.map(({ xOffset, yOffset, width, height }) => ({
      xOffset,
      yOffset,
      width,
      height,
    }))).toEqual(Array.from({ length: 11 }, () => ({
      xOffset: -1,
      yOffset: -1,
      width: 2,
      height: 2,
    })));
    expect(phase.descriptorSequence.map(({ low7BitFrameIndices }) => low7BitFrameIndices))
      .toEqual([0, 4, 8, 12, 16, 20, 16, 12, 8, 4, 0]
        .map((frame) => [frame, frame + 1, frame + 2, frame + 3]));
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/52"])
      .toBe("/assets/original/audio/un/52.wav");
  });

  it("keeps all 1D stomp draws, page flips, audio requests, and explicit waits distinct", () => {
    const steps = buildStompPresentationSteps(TECHNIQUE_LAB_STOMP.presentation);
    expect(TECHNIQUE_LAB_STOMP).toMatchObject({
      selectionRadius: 5,
      damageBase: 10,
      audioResource: "MAGIC/82",
      presentation: {
        targetImpactAnchor: { x: 240, y: 390 },
      },
      action: {
        code: "1D",
        drawXCoordinate: 160,
        shadowDrawYCoordinate: 338,
        graphicByTargetSide: { side1: "MAGIC/50", side2: "MAGIC/49" },
      },
    });
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex !== undefined)).toHaveLength(33);
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex === undefined)).toHaveLength(12);
    expect(steps.filter(({ audioAfter }) => audioAfter)).toHaveLength(4);
    expect(steps.reduce((total, { explicitNativeTicks }) => total + explicitNativeTicks, 0)).toBe(13);
    expect(steps.at(-1)?.endDisplayNativeTicks).toBe(45);
    expect(steps.filter(({ phase }) => phase === "rising").map(({ y }) => y))
      .toEqual([25, 55, 85, 115, 145, 175]);
    expect(steps.filter(({ phase }) => phase === "quake").map(({ y }) => y))
      .toEqual(Array.from({ length: 3 }, () => [145, 125, 110, 125, 145, 175]).flat());
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["MAGIC/82"])
      .toBe("/assets/original/audio/magic/82.wav");
  });

  it("keeps 2D on the shared stomp timeline but uses its native shadow y and 15..29 damage", () => {
    const male = TECHNIQUE_LAB_STOMPS["2D"];
    const steps = buildStompPresentationSteps(male.presentation);
    expect(male).toMatchObject({
      selectionRadius: 5,
      damageBase: 15,
      audioResource: "MAGIC/82",
      presentation: {
        targetImpactAnchor: { x: 240, y: 390 },
      },
      action: {
        code: "2D",
        drawXCoordinate: 160,
        shadowDrawYCoordinate: 368,
        graphicByTargetSide: { side1: "MAGIC/52", side2: "MAGIC/51" },
      },
    });
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex !== undefined)).toHaveLength(33);
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex === undefined)).toHaveLength(12);
    expect(steps.filter(({ audioAfter }) => audioAfter)).toHaveLength(4);
    expect(steps.reduce((total, { explicitNativeTicks }) => total + explicitNativeTicks, 0)).toBe(13);
  });

  it("keeps 3D on the shared stomp timeline but uses its native shadow y and 20..39 damage", () => {
    const female = TECHNIQUE_LAB_STOMPS["3D"];
    const steps = buildStompPresentationSteps(female.presentation);
    expect(female).toMatchObject({
      selectionRadius: 5,
      damageBase: 20,
      audioResource: "MAGIC/82",
      presentation: {
        targetImpactAnchor: { x: 240, y: 390 },
      },
      action: {
        code: "3D",
        drawXCoordinate: 160,
        shadowDrawYCoordinate: 368,
        graphicByTargetSide: { side1: "MAGIC/54", side2: "MAGIC/53" },
      },
    });
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex !== undefined)).toHaveLength(33);
    expect(steps.filter(({ graphicDrawIndex }) => graphicDrawIndex === undefined)).toHaveLength(12);
    expect(steps.filter(({ audioAfter }) => audioAfter)).toHaveLength(4);
    expect(steps.reduce((total, { explicitNativeTicks }) => total + explicitNativeTicks, 0)).toBe(13);
  });

  it("exposes all 33 native menu techniques as implemented", () => {
    expect(TECHNIQUE_LAB_CATALOG).toHaveLength(33);
    expect(TECHNIQUE_LAB_CATALOG.filter(({ implementationId }) => implementationId !== null)
      .map(({ nativeCode }) => nativeCode))
      .toEqual(["1C", "1D", "1F", "1H", "1I", "1K", "1L", "2C", "2D", "2F", "2H", "2I", "2K", "2L", "3C", "3D", "3F", "3H", "3I", "3L", "4C", "4F", "4L", "AA", "AD", "FM", "IP", "LA", "OJ", "SA", "SD", "SN", "TR"]);
    expect(TECHNIQUE_LAB_IRON_PLATE).toMatchObject({
      code: "1K",
      logicalTerrainSlot: 3,
      tile: "/assets/original/map-actions/iron-plate/stage-01.png",
      playerRoute: { neighborOffsets: [50, -50, 1, -1], experience: 0 },
    });
    expect(TECHNIQUE_LAB_OBSTACLE).toMatchObject({
      code: "2K",
      logicalTerrainSlot: 3,
      tile: "/assets/original/map-actions/obstacle/stage-01.png",
      playerRoute: { neighborOffsets: [50, -50, 1, -1], experience: 0 },
    });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "4F"))
      .toMatchObject({ label: "究級炎暴", implementationId: "fire-4" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "2F"))
      .toMatchObject({ label: "中級炎暴", implementationId: "fire-2" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "3F"))
      .toMatchObject({ label: "高級炎暴", implementationId: "fire-3" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "2H"))
      .toMatchObject({ label: "中級治療", implementationId: "heal-2" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "3H"))
      .toMatchObject({ label: "高級治療", implementationId: "heal-3" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "2I"))
      .toMatchObject({ label: "中級回復", implementationId: "recovery-2" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "3I"))
      .toMatchObject({ label: "高級回復", implementationId: "recovery-3" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "AA"))
      .toMatchObject({ label: "攻擊提昇", implementationId: "attack-up" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "AD"))
      .toMatchObject({ label: "防禦提昇", implementationId: "defense-up" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "FM"))
      .toMatchObject({ label: "防  魔", implementationId: "magic-guard" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "IP"))
      .toMatchObject({ label: "施  毒", implementationId: "poison" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "LA"))
      .toMatchObject({ label: "混  亂", implementationId: "confusion" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "OJ"))
      .toMatchObject({ label: "祈  禱", implementationId: "prayer" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "SA"))
      .toMatchObject({ label: "攻擊下降", implementationId: "attack-down" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "SD"))
      .toMatchObject({ label: "防禦下降", implementationId: "defense-down" });
    expect(TECHNIQUE_LAB_CATALOG.find(({ nativeCode }) => nativeCode === "SN"))
      .toMatchObject({ label: "禁  咒", implementationId: "spell-seal" });
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS["3I"]).toBe(15);
  });

  it("keeps OJ procedural, resource-free, per-recipient, and input-skippable", () => {
    expect(TECHNIQUE_LAB_PRAYER).toMatchObject({
      family: "OJ",
      visibleName: "祈禱",
      ignoredNativeSelectionWord: 4,
      eligibleSide: 1,
      gateBit: 0,
      outcomeRoll: [0, 3],
      amountRoll: [5, 14],
      resourceLoads: {
        graphicArchiveRecords: [],
        audioArchiveRecords: [],
      },
      presentation: {
        type: "procedural screen drawing",
        fixedArchiveFrameSequence: false,
        resultHold: {
          iterations: 30,
          waitPerIterationNativeTicks: 2,
          maximumNativeTicksPerTriggeredUnit: 60,
        },
      },
      procedural: {
        screen: { width: 640, height: 400 },
        fieldRows: 16,
      },
    });
    expect(TECHNIQUE_LAB_PRAYER.presentation.resultStrings).toEqual({
      heal: "生 命 加|00000 點.",
      experience: "經 驗 加|00000 點.",
      attackUp: "攻擊增加",
      defenseUp: "防禦增加",
    });
    expect(TECHNIQUE_LAB_PRAYER.synchronizationRule)
      .toContain("each passing allied unit is resolved independently");
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.OJ).toBe(60);
  });

  it("keeps FM on the exact AA graphic and audio timeline with its own status mutation", () => {
    expect(TECHNIQUE_LAB_MAGIC_GUARD).toMatchObject({
      code: "FM",
      selectionRadius: 7,
      statusCounter: 1,
      experienceBase: 10,
      experienceRandom: [0, 3],
      mutation: "unit+0C = 8001h",
      fixedGraphicWaitNativeTicks: 300,
      audioRequests: [{ resource: "UN/51", afterFixedWaitNativeTicks: 0 }],
    });
    expect(TECHNIQUE_LAB_MAGIC_GUARD.phases[0].runtimeTileCodePairs)
      .toEqual(TECHNIQUE_LAB_ATTACK_UP.phases[0].runtimeTileCodePairs);
    expect(TECHNIQUE_LAB_MAGIC_GUARD.phases[0]).toMatchObject({
      resource: "MAGIC/16",
      drawCount: 20,
      waitPerDrawNativeTicks: 15,
    });
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.FM).toBe(15);
  });

  it("preserves the two-stage IP timeline, delayed E/58 cue, and boss immunity metadata", () => {
    expect(TECHNIQUE_LAB_POISON).toMatchObject({
      code: "IP",
      selectionRadius: 6,
      statusCounter: 3,
      experienceBase: 14,
      experienceRandom: [0, 3],
      immuneClassIds: ["dragon", "head", "hand"],
      fixedGraphicWaitNativeTicks: 290,
      audioRequests: [{ resource: "E/58", afterFixedWaitNativeTicks: 130 }],
    });
    expect(TECHNIQUE_LAB_POISON.phases.map(({ resource, drawCount, waitPerDrawNativeTicks }) => ({
      resource,
      drawCount,
      waitPerDrawNativeTicks,
    }))).toEqual([
      { resource: "MAGIC/17", drawCount: 13, waitPerDrawNativeTicks: 10 },
      { resource: "MAGIC/18", drawCount: 16, waitPerDrawNativeTicks: 10 },
    ]);
    expect(TECHNIQUE_LAB_POISON.phases[0].runtimeTileCodeStates.at(-1)).toEqual([1, 2, 3, 4]);
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/58"])
      .toBe("/assets/original/audio/e/58.wav");
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.IP).toBe(10);
  });

  it("preserves LA's eleven 3x2 descriptors, silent timeline, and boss immunity metadata", () => {
    expect(TECHNIQUE_LAB_CONFUSION).toMatchObject({
      code: "LA",
      selectionRadius: 5,
      statusCounter: 3,
      experienceBase: 14,
      experienceRandom: [0, 3],
      immuneClassIds: ["dragon", "head", "hand"],
      fixedGraphicWaitNativeTicks: 165,
      audioRequests: [],
    });
    expect(TECHNIQUE_LAB_CONFUSION.phases).toHaveLength(1);
    expect(TECHNIQUE_LAB_CONFUSION.phases[0]).toMatchObject({
      resource: "MAGIC/44",
      drawCount: 11,
      waitPerDrawNativeTicks: 15,
    });
    expect(TECHNIQUE_LAB_CONFUSION.phases[0].descriptorSequence).toHaveLength(11);
    expect(TECHNIQUE_LAB_CONFUSION.phases[0].descriptorSequence.map(
      ({ width, height, xOffset, yOffset }) => ({ width, height, xOffset, yOffset }),
    )).toEqual(Array.from({ length: 11 }, () => ({
      width: 3,
      height: 2,
      xOffset: -1,
      yOffset: -1,
    })));
    expect(TECHNIQUE_LAB_CONFUSION.phases[0].descriptorSequence[0].low7BitFrameIndices)
      .toEqual([0, 1, 2, 3, 4, 5]);
    expect(TECHNIQUE_LAB_CONFUSION.phases[0].descriptorSequence.at(-1)?.low7BitFrameIndices)
      .toEqual([42, 43, 44, 45, 46, 47]);
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.LA).toBe(15);
  });

  it("keeps SA as eleven 1x2 MAGIC/46 descriptors over 165 ticks with E/8", () => {
    expect(TECHNIQUE_LAB_ATTACK_DOWN).toMatchObject({
      code: "SA",
      visibleName: "攻擊下降",
      selectionRadius: 4,
      effectiveAttackDelta: -20,
      statusCounter: 3,
      experienceBase: 10,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 165,
      audioRequests: [{ resource: "E/8", afterFixedWaitNativeTicks: 0 }],
    });
    const phase = TECHNIQUE_LAB_ATTACK_DOWN.phases[0];
    expect(phase).toMatchObject({
      resource: "MAGIC/46",
      drawCount: 11,
      waitPerDrawNativeTicks: 15,
    });
    expect(phase.descriptorSequence.map(({ xOffset, yOffset, width, height }) => ({
      xOffset,
      yOffset,
      width,
      height,
    }))).toEqual(Array.from({ length: 11 }, () => ({
      xOffset: 0,
      yOffset: -1,
      width: 1,
      height: 2,
    })));
    expect(phase.descriptorSequence.map(({ low7BitFrameIndices }) => low7BitFrameIndices))
      .toEqual(Array.from({ length: 11 }, (_, index) => [index * 2, index * 2 + 1]));
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/8"])
      .toBe("/assets/original/audio/e/8.wav");
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.SA).toBe(15);
  });

  it("keeps SD as ten 2x2 MAGIC/45 descriptors over 150 ticks with E/8", () => {
    expect(TECHNIQUE_LAB_DEFENSE_DOWN).toMatchObject({
      code: "SD",
      visibleName: "防禦下降",
      selectionRadius: 4,
      effectiveDefenseDelta: -20,
      statusCounter: 3,
      experienceBase: 10,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 150,
      audioRequests: [{ resource: "E/8", afterFixedWaitNativeTicks: 0 }],
    });
    const phase = TECHNIQUE_LAB_DEFENSE_DOWN.phases[0];
    expect(phase).toMatchObject({
      resource: "MAGIC/45",
      drawCount: 10,
      waitPerDrawNativeTicks: 15,
    });
    expect(phase.descriptorSequence.map(({ xOffset, yOffset, width, height }) => ({
      xOffset,
      yOffset,
      width,
      height,
    }))).toEqual(Array.from({ length: 10 }, () => ({
      xOffset: -1,
      yOffset: -1,
      width: 2,
      height: 2,
    })));
    expect(phase.descriptorSequence.map(({ low7BitFrameIndices }) => low7BitFrameIndices))
      .toEqual(Array.from({ length: 10 }, (_, index) =>
        Array.from({ length: 4 }, (_, frame) => index * 4 + frame)));
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/8"])
      .toBe("/assets/original/audio/e/8.wav");
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.SD).toBe(15);
  });

  it("keeps SN as nine silent 3x2 MAGIC/36 descriptors over 225 ticks", () => {
    expect(TECHNIQUE_LAB_SPELL_SEAL).toMatchObject({
      code: "SN",
      visibleName: "禁咒",
      selectionRadius: 7,
      statusCounter: 3,
      immuneClassIds: ["dragon"],
      experienceBase: 14,
      experienceRandom: [0, 3],
      fixedGraphicWaitNativeTicks: 225,
      audioRequests: [],
    });
    const phase = TECHNIQUE_LAB_SPELL_SEAL.phases[0];
    expect(phase).toMatchObject({
      resource: "MAGIC/36",
      drawCount: 9,
      waitPerDrawNativeTicks: 25,
    });
    expect(phase.descriptorSequence.map(({ xOffset, yOffset, width, height }) => ({
      xOffset,
      yOffset,
      width,
      height,
    }))).toEqual(Array.from({ length: 9 }, () => ({
      xOffset: -1,
      yOffset: -1,
      width: 3,
      height: 2,
    })));
    expect(phase.descriptorSequence.at(-1)?.low7BitFrameIndices)
      .toEqual([null, null, null, 42, 43, 44]);
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS.SN).toBe(25);
  });

  it("switches ultimate fire to MAGIC/29 before the five rising-column draws", () => {
    const fire = TECHNIQUE_LAB_FIRE["4F"];
    expect(fire).toMatchObject({
      selectionRadius: 7,
      percentMaxLife: 44,
      damageCap: 270,
      fixedGraphicWaitNativeTicks: 290,
    });
    expect(fire.phases.map(({ resource, drawCount }) => ({ resource, drawCount })))
      .toEqual([
        { resource: "MAGIC/30", drawCount: 12 },
        { resource: "MAGIC/28", drawCount: 8 },
        { resource: "MAGIC/29", drawCount: 9 },
      ]);
    expect(fire.phases[1].anchorOffsetSequence).toEqual(
      Array.from({ length: 8 }, () => ({ x: 0, y: 0 })),
    );
    expect(fire.phases[2].anchorOffsetSequence.slice(0, 4)).toEqual(
      Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
    );
    expect(fire.phases[2].anchorOffsetSequence.slice(4).map(({ y }) => y))
      .toEqual([0, -1, -2, -3, -4]);
    expect(fire.phases[2].descriptorSequence.slice(4).map(({ low7BitFrameIndices }) =>
      low7BitFrameIndices)).toEqual(Array.from({ length: 5 }, () => [
      null, 18, null,
      null, 19, null,
      null, 19, null,
      null, 20, null,
      null, null, null,
    ]));
    expect(fire.audioRequests).toEqual([
      { resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
      { resource: "E/51", entry: "0000:0224", afterFixedWaitNativeTicks: 120 },
    ]);
    expect(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/51"])
      .toBe("/assets/original/audio/e/51.wav");
  });

  it("preserves the exact 3H four-phase draw order, delayed sound, and common tail", () => {
    const heal = TECHNIQUE_LAB_HEAL["3H"];
    expect(heal).toMatchObject({
      selectionRadius: 7,
      maxLifePercent: 48,
      experienceBase: 15,
      experienceRandom: [0, 2],
      fixedGraphicWaitNativeTicks: 235,
      audioRequests: [{ resource: "E/36", afterFixedWaitNativeTicks: 30 }],
    });
    expect(heal.phases.map(({ resource, drawCount, waitPerDrawNativeTicks }) => ({
      resource,
      drawCount,
      waitPerDrawNativeTicks,
    }))).toEqual([
      { resource: "MAGIC/42", drawCount: 5, waitPerDrawNativeTicks: 6 },
      { resource: "MAGIC/41", drawCount: 18, waitPerDrawNativeTicks: 5 },
      { resource: "MAGIC/42", drawCount: 5, waitPerDrawNativeTicks: 8 },
      { resource: "MAGIC/0", drawCount: 5, waitPerDrawNativeTicks: 15 },
    ]);
    expect(heal.phases[1].descriptorSequence.map(({ low7BitFrameIndices }) =>
      low7BitFrameIndices[0])).toEqual([
      0, 6, 12, 18, 24, 30,
      0, 6, 12, 18, 24, 30,
      0, 6, 12, 18, 24, 30,
    ]);
    expect(heal.phases[2].descriptorSequence.map(({ low7BitFrameIndices }) =>
      low7BitFrameIndices[0])).toEqual([24, 18, 12, 6, 0]);
    expect(heal.phases[3].descriptorSequence.map(({ low7BitFrameIndices }) =>
      low7BitFrameIndices[0])).toEqual([0, 1, 2, 3, 4]);
    expect(TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS["3H"]).toBe(15);
  });

  it("keeps absent side-1 boss-part art unavailable instead of fabricating it", () => {
    expect(Object.keys(TECHNIQUE_LAB_UNIT_ASSETS)).toHaveLength(39);
    expect(TECHNIQUE_LAB_UNIT_ASSETS.dragon).toMatchObject({ nativeRecord: 36, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.head).toMatchObject({ nativeRecord: 37, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.hand).toMatchObject({ nativeRecord: 38, ally: null });
    expect(TECHNIQUE_LAB_UNIT_ASSETS.dragon.enemy).toMatch(/enemy-dragon\.png$/u);
    const dragonFigure = fs.readFileSync(path.resolve(
      "public",
      TECHNIQUE_LAB_UNIT_ASSETS.dragon.enemy.slice(1),
    ));
    expect(createHash("sha256").update(dragonFigure).digest("hex"))
      .toBe("b6afd8336cffb56b933a1e3a1099c302bee292c817c4296331d97ef41d4bb3e4");
  });
});

describe("map technique laboratory session", () => {
  it("places either side, assigns actor and target, and previews tier damage", () => {
    const session = new TechniqueLabSession();
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier", "cavalry"]);
    expect(session.affectedUnits().map((unit) => session.lightningDamageFor(unit))).toEqual([50, 20]);

    expect(session.setActionCode("2F")).toBe(true);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!)).toBe("26% · 上限 156");

    expect(session.setActionCode("3F")).toBe(true);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!)).toBe("32% · 上限 192");

    expect(session.setActionCode("2H")).toBe(true);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual([]);
    session.setTool("target");
    session.interact(19, 20);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!)).toBe("+36% · q經驗");

    expect(session.setActionCode("3H")).toBe(true);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!)).toBe("+48% · q經驗");

    expect(session.setActionCode("2I")).toBe(true);
    session.setTool("target");
    session.interact(20, 19);
    expect(session.effectCells()).toHaveLength(13);
    expect(session.affectedUnits().map(({ classId }) => classId).sort())
      .toEqual(["magician", "soldier"]);
    expect(session.affectedUnits().map((unit) => session.damagePreviewFor(unit)).sort())
      .toEqual(["+50 · 總量經驗", "+50 · 總量經驗"]);

    session.setActionCode("4L");
    session.setTool("target");
    session.interact(23, 18);
    expect(session.affectedUnits().map(({ classId }) => classId))
      .toEqual(["soldier", "cavalry", "sister"]);
    expect(session.affectedUnits().map((unit) => session.lightningDamageFor(unit)))
      .toEqual([110, 70, 50]);

    session.setActionCode("4C");
    expect(session.effectCells()).toHaveLength(61);
    expect(session.state.target).toEqual({ x: 21, y: 18 });

    session.setPlacementSide(1);
    session.setPlacementClass("wizard");
    session.setTool("place");
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

  it("accepts AA, AD, FM, IP, LA, SA, SD, and SN while keeping allied boss-part graphics unavailable", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("AA")).toBe(true);
    session.setTool("target");
    session.interact(19, 20);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("攻擊 +20 · 狀態 3");
    expect(session.setActionCode("AD")).toBe(true);
    expect(session.state.actionCode).toBe("AD");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("防禦 +20 · 狀態 3");
    expect(session.setActionCode("FM")).toBe(true);
    expect(session.state.actionCode).toBe("FM");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("防魔 · 狀態 1 · 一次性保護");
    expect(session.setActionCode("IP")).toBe(true);
    session.setTool("target");
    session.interact(23, 18);
    expect(session.state.actionCode).toBe("IP");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("中毒狀態 3 · 每輪折半但不致死");
    expect(session.setActionCode("LA")).toBe(true);
    expect(session.state.actionCode).toBe("LA");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("混亂狀態 3 · 自動行動只移動／撤退");
    expect(session.setActionCode("SA")).toBe(true);
    expect(session.state.actionCode).toBe("SA");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("攻擊 -20 · 狀態 3");
    expect(session.setActionCode("SD")).toBe(true);
    expect(session.state.actionCode).toBe("SD");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("防禦 -20 · 狀態 3");
    expect(session.setActionCode("SN")).toBe(true);
    expect(session.state.actionCode).toBe("SN");
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["soldier"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("禁咒狀態 3 · 技術不可用");
    session.setPlacementSide(2);
    expect(session.setPlacementClass("head")).toBe(true);
    session.setTool("place");
    expect(session.interact(23, 18)).toBe(true);
    expect(session.affectedUnits().map(({ classId }) => classId)).toEqual(["head"]);
    expect(session.damagePreviewFor(session.affectedUnits()[0]!))
      .toBe("禁咒狀態 3 · 頭／手專屬行動不受影響");
    session.setPlacementSide(1);
    expect(session.setPlacementClass("dragon")).toBe(false);
    expect(session.state.placementClass).toBe("soldier");
  });

  it("previews OJ with a fixed row-major allied scan and no selectable target", () => {
    const session = new TechniqueLabSession();
    session.setTool("target");
    expect(session.setActionCode("OJ")).toBe(true);
    expect(session.state.actionCode).toBe("OJ");
    expect(session.state.tool).toBe("actor");
    expect(session.effectCenter()).toEqual({ x: 21, y: 18 });
    expect(session.state.target).toEqual({ x: 21, y: 18 });
    expect(session.effectCells()).toEqual([]);
    session.setTool("target");
    expect(session.state.tool).toBe("actor");
    expect(session.interact(23, 18)).toBe(true);
    expect(session.actor()?.id).toBe("lab-2");
    expect(session.state.target).toEqual({ x: 23, y: 18 });

    expect(session.prayerPreview().map(({ unit, passed, outcome, rolledAmount }) => ({
      id: unit.id,
      passed,
      outcome,
      rolledAmount,
    }))).toEqual([
      { id: "lab-1", passed: false, outcome: undefined, rolledAmount: undefined },
      { id: "lab-5", passed: true, outcome: "healing", rolledAmount: 8 },
    ]);
    expect(session.affectedUnits().map(({ id }) => id)).toEqual(["lab-5"]);
    expect(session.damagePreviewFor(session.state.units.find(({ id }) => id === "lab-1")!))
      .toBe("門失敗");
    expect(session.damagePreviewFor(session.state.units.find(({ id }) => id === "lab-5")!))
      .toBe("生命 +8");
    expect(session.prayerPreview()).toEqual(session.prayerPreview());
  });

  it("previews 1D as the target diamond unioned with the fixed 10x7 rules viewport", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("1D")).toBe(true);
    expect(session.effectCells()).toContainEqual({ position: { x: 15, y: 13 }, value: 1 });
    expect(session.effectCells()).toContainEqual({ position: { x: 23, y: 18 }, value: 1 });
    expect(session.effectCells()).toContainEqual(expect.objectContaining({
      position: { x: 25, y: 18 },
    }));
    expect(session.affectedUnits().map(({ classId }) => classId))
      .toEqual(["soldier", "cavalry", "sister"]);
    expect(session.affectedUnits().map((unit) => session.damagePreviewFor(unit)))
      .toEqual(["10..19", "10..19", "10..19"]);
  });

  it("previews 1K as an empty destination plus valid four-neighbor terrain writes", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("1K")).toBe(true);
    expect(session.state.target).toEqual({ x: 22, y: 18 });
    expect(session.affectedUnits()).toEqual([]);
    expect(session.effectCells()).toEqual([
      { position: { x: 22, y: 19 }, value: 3 },
      { position: { x: 22, y: 17 }, value: 3 },
      { position: { x: 23, y: 18 }, value: 3 },
      { position: { x: 21, y: 18 }, value: 3 },
    ]);
    session.setTool("target");
    expect(session.interact(23, 18)).toBe(false);
    expect(session.state.target).toEqual({ x: 22, y: 18 });
  });

  it("previews 2K with the same four-neighbor route and the stage-1 obstacle slot", () => {
    const session = new TechniqueLabSession();
    expect(session.setActionCode("2K")).toBe(true);
    expect(session.state.target).toEqual({ x: 22, y: 18 });
    expect(session.affectedUnits()).toEqual([]);
    expect(session.effectCells()).toEqual([
      { position: { x: 22, y: 19 }, value: 3 },
      { position: { x: 22, y: 17 }, value: 3 },
      { position: { x: 23, y: 18 }, value: 3 },
      { position: { x: 21, y: 18 }, value: 3 },
    ]);
  });
});
