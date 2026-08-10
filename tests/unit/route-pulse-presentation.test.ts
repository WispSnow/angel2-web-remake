import { describe, expect, it } from "vitest";
import { STAGE4_FORCE_FIELD_PRESENTATION } from "../../src/game/content/stage4";
import { routePulsePresentationTimeline } from "../../src/game/route-pulse-presentation";

describe("route-pulse presentation timeline", () => {
  it("reconstructs both native MAGIC/26 wave layers and the blank tail", () => {
    const timeline = routePulsePresentationTimeline(STAGE4_FORCE_FIELD_PRESENTATION);

    expect(timeline).toHaveLength(22);
    // `1000:6E88` writes 1 into every cell outside the barrier, so a single sweep code walks
    // the whole effect area through frames 0..10 before leaving the band for good.
    expect(timeline.map(({ sweepFrame }) => sweepFrame)).toEqual([
      ...Array.from({ length: 11 }, (_, index) => index),
      ...Array<undefined>(11).fill(undefined),
    ]);
    expect(timeline.map(({ frame }) => frame))
      .toEqual(Array.from({ length: 22 }, (_, index) => index % 2 === 0 ? 11 : 12));
    expect(timeline.map(({ visible }) => visible))
      .toEqual([...Array<boolean>(11).fill(true), ...Array<boolean>(11).fill(false)]);
    expect(timeline.reduce((total, frame) => total + frame.nativeTicks, 0)).toBe(44);
  });

  it("splits MAGIC/26 into a sweep range and the trailing electrocuted pair", () => {
    const definition = STAGE4_FORCE_FIELD_PRESENTATION;
    const timeline = routePulsePresentationTimeline(definition);
    const sweepFrames = [...new Set(timeline
      .map(({ sweepFrame }) => sweepFrame)
      .filter((frame): frame is number => frame !== undefined))];
    const markerFrames = [...new Set(timeline
      .filter(({ visible }) => visible)
      .map(({ frame }) => frame))];

    // The force-field pulse shares 1000:6D4C with the ultimate lightning, so it obeys the
    // same budget: frames = sweepWidth + 2, with the last pair reserved for the markers.
    expect(definition.frames).toHaveLength(definition.sweepWidth + 2);
    expect(sweepFrames).toEqual(Array.from({ length: definition.sweepWidth }, (_, index) => index));
    expect(markerFrames).toEqual([definition.sweepWidth, definition.sweepWidth + 1]);
    expect([...sweepFrames, ...markerFrames])
      .toEqual(definition.frames.map((_, frame) => frame));
  });
});
