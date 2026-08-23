import { describe, expect, test } from "vitest";
import {
  computeDesktopIntegerWindowTarget,
  computeDesktopPageZoom,
} from "../../src/game/desktop-runtime";

describe("desktop integer window sizing", () => {
  test("matches the client window to the nearest whole device-pixel factor", () => {
    expect(computeDesktopIntegerWindowTarget({
      viewportWidth: 1280,
      availableGameHeight: 740,
      chromeHeight: 60,
      devicePixelRatio: 1,
      screenAvailableWidth: 1920,
      screenAvailableHeight: 1040,
    })).toEqual({ width: 1280, height: 760, scale: 2, deviceFactor: 2 });
  });

  test("uses logical window pixels while preserving integer physical pixels on HiDPI", () => {
    expect(computeDesktopIntegerWindowTarget({
      viewportWidth: 1280,
      availableGameHeight: 740,
      chromeHeight: 60,
      devicePixelRatio: 1.25,
      screenAvailableWidth: 1920,
      screenAvailableHeight: 1040,
    })).toEqual({ width: 1536, height: 900, scale: 2.4, deviceFactor: 3 });
  });

  test("never grows the exact-size window past the current monitor", () => {
    expect(computeDesktopIntegerWindowTarget({
      viewportWidth: 1280,
      availableGameHeight: 740,
      chromeHeight: 60,
      devicePixelRatio: 1.25,
      screenAvailableWidth: 1280,
      screenAvailableHeight: 800,
    })).toEqual({ width: 1024, height: 620, scale: 1.6, deviceFactor: 2 });
  });
});

/**
 * `LogicalSize` 用作業系統的邏輯像素，整數倍模式量到的卻是 CSS 像素。頁面縮放
 * （「介面縮放」或玩家按的 `Ctrl +/-`）只進 `devicePixelRatio`，不進視窗的
 * `scaleFactor()`，兩者相除才是換算用的倍率。
 */
describe("desktop page zoom", () => {
  test("is 1 when only the operating system scales the window", () => {
    expect(computeDesktopPageZoom(1, 1)).toBe(1);
    expect(computeDesktopPageZoom(2, 2)).toBe(1);
    expect(computeDesktopPageZoom(1.5, 1.5)).toBe(1);
  });

  test("separates page zoom from the operating system factor", () => {
    expect(computeDesktopPageZoom(1.5, 1)).toBe(1.5);
    expect(computeDesktopPageZoom(3, 2)).toBe(1.5);
    expect(computeDesktopPageZoom(1, 2)).toBe(.5);
  });

  test("falls back to 1 rather than resizing the window by a nonsense factor", () => {
    for (const scaleFactor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeDesktopPageZoom(2, scaleFactor)).toBe(1);
    }
    // A zero ratio would otherwise collapse the window to nothing.
    expect(computeDesktopPageZoom(0, 2)).toBe(.5);
  });
});
