import { describe, expect, test } from "vitest";
import {
  ALLY_MAP_UNIT_ASSETS,
  allyMapUnitAssetsForClasses,
} from "../../src/game/content/map-unit-assets";
import { promotionTargetsFor } from "../../src/game/content/classes";

describe("stage-scoped Phaser map-unit loading", () => {
  test("loads current classes and only their immediate promotion choices", () => {
    const assets = allyMapUnitAssetsForClasses(["soldier"]);
    const expected = new Set([
      "soldier",
      ...promotionTargetsFor("soldier").map(({ id }) => id),
    ]);
    expect(new Set(assets.keys())).toEqual(expected);
    expect(assets.size).toBeLessThan(Object.keys(ALLY_MAP_UNIT_ASSETS).length);
    expect(assets.has("empress")).toBe(false);
  });

  test("deduplicates shared current and promotion classes", () => {
    const soldierTarget = promotionTargetsFor("soldier")[0]?.id;
    if (!soldierTarget) throw new Error("soldier must have a promotion target");
    const assets = allyMapUnitAssetsForClasses(["soldier", soldierTarget, "soldier"]);
    expect([...assets.keys()].filter((classId) => classId === "soldier")).toHaveLength(1);
    expect(assets.get("soldier")).toBe(ALLY_MAP_UNIT_ASSETS.soldier);
  });
});
