import { describe, expect, test } from "vitest";
import { computeDesktopIntegerWindowTarget } from "../../src/game/desktop-runtime";

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
