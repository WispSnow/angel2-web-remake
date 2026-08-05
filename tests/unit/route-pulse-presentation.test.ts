import { describe, expect, it } from "vitest";
import { STAGE4_FORCE_FIELD_PRESENTATION } from "../../src/game/content/stage4";
import { routePulsePresentationTimeline } from "../../src/game/route-pulse-presentation";

describe("route-pulse presentation timeline", () => {
  it("reconstructs the native MAGIC/26 wave and its blank tail", () => {
    const timeline = routePulsePresentationTimeline(STAGE4_FORCE_FIELD_PRESENTATION);

    expect(timeline).toHaveLength(22);
    expect(timeline.map(({ frame }) => frame))
      .toEqual(Array.from({ length: 22 }, (_, index) => index % 2 === 0 ? 11 : 12));
    expect(timeline.map(({ visible }) => visible))
      .toEqual([...Array<boolean>(11).fill(true), ...Array<boolean>(11).fill(false)]);
    expect(timeline.reduce((total, frame) => total + frame.nativeTicks, 0)).toBe(44);
  });

  it("keeps one stable impact visible when reduced motion is requested", () => {
    expect(routePulsePresentationTimeline(STAGE4_FORCE_FIELD_PRESENTATION, true)).toEqual([{
      frame: 12,
      draw: 0,
      nativeTicks: 15,
      visible: true,
    }]);
  });
});
