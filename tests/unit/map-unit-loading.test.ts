import { describe, expect, test } from "vitest";
import {
  ALLY_MAP_UNIT_ASSETS,
  allyMapUnitAssetsForClasses,
} from "../../src/game/content/map-unit-assets";
import {
  promotionReachableClassIds,
  promotionTargetsFor,
} from "../../src/game/content/classes";
import { classPresentationAssetUrls } from "../../src/game/content/class-presentation-assets";
import { presentationActionIdsForClass } from "../../src/game/content/actions";
import { mapActionAtlasAssetsForActions } from "../../src/game/content/map-action-assets";
import { FULL_COMBAT_ATLASES } from "../../src/game/content/full-combat-atlases.generated";

describe("stage-scoped Phaser map-unit loading", () => {
  test("loads every legal in-stage promotion descendant without pulling unrelated classes", () => {
    const assets = allyMapUnitAssetsForClasses(["soldier"]);
    for (const classId of [
      "soldier",
      ...promotionTargetsFor("soldier").map(({ id }) => id),
      "magician",
      "magic-priest",
      "wizard",
    ] as const) expect(assets.has(classId), classId).toBe(true);
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

  test("stages the map, panorama, and technique assets for a second in-stage promotion", () => {
    const urls = new Set(classPresentationAssetUrls({
      allyClassIds: ["soldier"],
      encounterClassIds: ["soldier"],
      nativeStage: 8,
    }));
    expect(urls).toContain(ALLY_MAP_UNIT_ASSETS.magician);
    expect(urls).toContain("/assets/original/full-combat-atlases/left-magician.png");
    expect(urls).toContain("/assets/original/full-combat-atlases/right-magician.png");
    for (const asset of mapActionAtlasAssetsForActions(
      presentationActionIdsForClass("magician", 1),
    )) expect(urls).toContain(asset);
  });

  test("keeps every player promotion branch complete across repeated in-stage promotions", () => {
    const allyClassIds = Object.keys(ALLY_MAP_UNIT_ASSETS) as Array<
      keyof typeof ALLY_MAP_UNIT_ASSETS
    >;
    const fullCombatAtlasesByClass = new Map(allyClassIds.map((classId) => [
      classId,
      FULL_COMBAT_ATLASES.filter(({ id }) =>
        id === `left-${classId}` || id === `right-${classId}`),
    ]));

    for (const rootClassId of allyClassIds) {
      const urls = new Set(classPresentationAssetUrls({
        allyClassIds: [rootClassId],
        encounterClassIds: [rootClassId],
      }));
      for (const classId of promotionReachableClassIds([rootClassId])) {
        const mapAsset = ALLY_MAP_UNIT_ASSETS[
          classId as keyof typeof ALLY_MAP_UNIT_ASSETS
        ];
        expect(mapAsset, `${rootClassId} -> ${classId} map figure`).toBeDefined();
        if (mapAsset) expect(urls, `${rootClassId} -> ${classId} map figure`).toContain(mapAsset);

        const fullCombatAtlases = fullCombatAtlasesByClass.get(
          classId as keyof typeof ALLY_MAP_UNIT_ASSETS,
        ) ?? [];
        expect(fullCombatAtlases.length, `${rootClassId} -> ${classId} panorama`).toBeGreaterThan(0);
        for (const { image } of fullCombatAtlases) {
          expect(urls, `${rootClassId} -> ${classId} panorama`).toContain(image);
        }

        for (const side of [1, 2] as const) {
          for (const asset of mapActionAtlasAssetsForActions(
            presentationActionIdsForClass(classId, side),
          )) expect(urls, `${rootClassId} -> ${classId} technique`).toContain(asset);
        }
      }
    }
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
