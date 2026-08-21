import { describe, expect, test } from "vitest";
import {
  ALLY_MAP_UNIT_ASSETS,
  allyMapUnitAssetsForClasses,
} from "../../src/game/content/map-unit-assets";
import { promotionTargetsFor } from "../../src/game/content/classes";
import { classPresentationAssetUrls } from "../../src/game/content/class-presentation-assets";
import { presentationActionIdsForClass } from "../../src/game/content/actions";
import { mapActionAtlasAssetsForActions } from "../../src/game/content/map-action-assets";

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

  test("prepares map figures, full-combat textures, and shared technique atlases per class", () => {
    const urls = new Set(classPresentationAssetUrls({
      allyClassIds: ["magician"],
      encounterClassIds: ["magician"],
      nativeStage: 1,
    }));
    expect(urls).toContain(ALLY_MAP_UNIT_ASSETS.magician);
    expect(urls).toContain("/assets/original/full-combat-atlases/left-magician.png");
    expect(urls).toContain("/assets/original/full-combat-atlases/right-magician.png");
    expect([...urls].some((url) => url.startsWith("/assets/original/full-combat-atlases/")
      && url.endsWith(".json"))).toBe(false);
    expect(urls).toContain("/assets/original/full-combat/backgrounds/08.png");
    expect(urls).toContain("/assets/original/full-combat/backgrounds/18.png");

    const actionIds = new Set([
      ...presentationActionIdsForClass("magician", 1),
      ...presentationActionIdsForClass("magician", 2),
    ]);
    for (const asset of mapActionAtlasAssetsForActions(actionIds)) expect(urls).toContain(asset);
    expect(urls).not.toContain("/assets/original/full-combat-atlases/right-dragon.png");
  });

  test("respects original one-sided full-combat records while retaining special effects", () => {
    const urls = new Set(classPresentationAssetUrls({
      allyClassIds: [],
      encounterClassIds: ["dragon"],
    }));
    expect(urls).toContain("/assets/original/full-combat-atlases/right-dragon.png");
    expect(urls).not.toContain("/assets/original/full-combat-atlases/left-dragon.png");
    expect(urls).toContain("/assets/original/map-action-atlases/wd.png");
    expect(urls).toContain("/assets/original/map-action-atlases/wd.json");
  });
});
