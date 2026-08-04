import { describe, expect, it } from "vitest";
import {
  TURN_TRANSITION_DUST,
  TURN_TRANSITION_FRAME_NATIVE_TICKS,
  TURN_TRANSITION_HOLD_NATIVE_TICKS,
  turnTransitionFrames,
} from "../../src/game/turn-transition-presentation";

describe("native turn-transition presentation", () => {
  it("replays the 20-frame player run from left to right with both hops", () => {
    const frames = turnTransitionFrames("player");

    expect(TURN_TRANSITION_HOLD_NATIVE_TICKS).toBe(100);
    expect(TURN_TRANSITION_FRAME_NATIVE_TICKS).toBe(10);
    expect(frames).toHaveLength(20);
    expect(frames.map(({ x, y }) => [x, y])).toEqual([
      [-100, 240], [-60, 240],
      [-20, 240], [0, 220],
      [20, 200],
      [40, 200], [55, 220],
      [70, 240], [80, 225],
      [90, 210],
      [95, 210], [100, 225],
      [105, 240], [145, 240], [185, 240], [225, 240],
      [265, 240], [305, 240], [345, 240], [385, 240],
    ]);
    expect(frames.every(({ side, spriteFrame, nativeTicks }) =>
      side === "player" && spriteFrame === 0 && nativeTicks === 10)).toBe(true);
  });

  it("replays the 24-frame enemy run from right to left with its smaller hops", () => {
    const frames = turnTransitionFrames("enemy");

    expect(frames).toHaveLength(24);
    expect(frames.map(({ x, y }) => [x, y])).toEqual([
      [440, 190], [400, 210],
      [360, 230], [320, 210],
      [280, 190],
      [250, 190], [230, 210],
      [210, 230], [200, 220],
      [190, 210],
      [180, 210], [170, 220],
      [160, 230], [150, 225],
      [140, 220],
      [130, 220], [120, 225],
      [110, 230], [60, 230], [10, 230], [-40, 230], [-90, 230],
      [-140, 230], [-190, 230],
    ]);
    expect(frames.every(({ side, spriteFrame, nativeTicks }) =>
      side === "enemy" && spriteFrame === 1 && nativeTicks === 10)).toBe(true);
  });

  it("keeps the six A/26 edge puffs at the native screen coordinates", () => {
    expect(TURN_TRANSITION_DUST).toEqual([
      { frame: 0, x: 0, y: 200 },
      { frame: 1, x: 0, y: 244 },
      { frame: 2, x: 0, y: 288 },
      { frame: 3, x: 376, y: 200 },
      { frame: 4, x: 368, y: 244 },
      { frame: 5, x: 384, y: 288 },
    ]);
  });
});
