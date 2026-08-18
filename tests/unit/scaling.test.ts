import { describe, expect, test } from "vitest";
import {
  computeGameOffset,
  computeGameScale,
  LOGICAL_SCREEN_WIDTH,
} from "../../src/game/scaling";

describe("logical screen scaling", () => {
  test("sharp and smooth keep filling the available width", () => {
    for (const mode of ["sharp", "smooth"] as const) {
      expect(computeGameScale(1280, 1, mode)).toBe(1);
      expect(computeGameScale(640, 2, mode)).toBe(1);
      expect(computeGameScale(480, 1, mode)).toBe(.75);
      expect(computeGameScale(468, 2, mode)).toBeCloseTo(.73125, 10);
    }
  });

  test("integer snaps to whole device pixels instead of whole CSS pixels", () => {
    // Browser zoom and HiDPI both land in devicePixelRatio, so a CSS scale of 1
    // is already uneven at ratio 1.5: this is the case the mode exists for.
    expect(computeGameScale(640, 1.5, "integer")).toBeCloseTo(1 / 1.5, 10);
    expect(computeGameScale(640, 1.5, "integer") * 1.5).toBeCloseTo(1, 10);
    expect(computeGameScale(640, 1.25, "integer")).toBeCloseTo(1 / 1.25, 10);

    // Whole ratios are already pixel exact and must not be shrunk.
    expect(computeGameScale(640, 1, "integer")).toBe(1);
    expect(computeGameScale(640, 2, "integer")).toBe(1);
    expect(computeGameScale(1280, 3, "integer")).toBe(1);

    // A fractional fit drops to the next whole device factor.
    expect(computeGameScale(468, 2, "integer")).toBe(.5);
    expect(computeGameScale(600, 3, "integer")).toBeCloseTo(2 / 3, 10);
  });

  test("integer falls back to the fitted scale when no whole factor fits", () => {
    // Below one device pixel per source pixel there is nothing to snap to, and
    // rounding up would overflow the viewport instead of letterboxing inside it.
    expect(computeGameScale(320, 1, "integer")).toBe(.5);
    expect(computeGameScale(320, 1.5, "integer")).toBe(.5);
    expect(computeGameScale(640, 0, "integer")).toBe(1);
  });

  test("never scales past 1:1 in any mode", () => {
    for (const mode of ["sharp", "smooth", "integer"] as const) {
      expect(computeGameScale(4096, 1, mode)).toBe(1);
    }
  });

  test("letterboxes on whole device pixels so the screen stays on the grid", () => {
    expect(computeGameOffset(640, 1, 1)).toBe(0);
    expect(computeGameOffset(640, 2, .5)).toBe(160);
    // (468 - 320) / 2 = 74 exactly at ratio 2, so no rounding is needed.
    expect(computeGameOffset(468, 2, .5)).toBe(74);
    // (469 - 320) / 2 = 74.5 CSS px is 149 device px: floor keeps the grid.
    expect(computeGameOffset(469, 2, .5)).toBe(74.5);
    // (471 - 320) / 2 = 75.5 CSS px is 75.5 device px at ratio 1: floor to 75.
    expect(computeGameOffset(471, 1, .5)).toBe(75);
    // A viewport narrower than the scaled screen has no slack to distribute.
    expect(computeGameOffset(LOGICAL_SCREEN_WIDTH - 340, 1, 1)).toBe(0);
  });
});
