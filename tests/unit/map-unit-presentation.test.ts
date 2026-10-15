import { describe, expect, it } from "vitest";
import {
  MAP_UNIT_VISUAL_OFFSETS,
  mapUnitVerticalOffset,
  mapUnitVisualOffset,
} from "../../src/game/content/map-unit-presentation";

describe("map-unit presentation anchors", () => {
  it("keeps native canvases intact while correcting the measured horizontal silhouettes", () => {
    expect(MAP_UNIT_VISUAL_OFFSETS).toEqual({
      soldier: { 1: -2, 2: -2 },
      "magic-archer": { 1: -1, 2: -1 },
      crossbow: { 1: -3, 2: -3 },
      "curse-master": { 1: 3, 2: -3 },
    });

    expect(mapUnitVisualOffset("crossbow", 1)).toBe(-3);
    expect(mapUnitVisualOffset("crossbow", 2)).toBe(-3);
    expect(mapUnitVisualOffset("curse-master", 1)).toBe(3);
    expect(mapUnitVisualOffset("curse-master", 2)).toBe(-3);
    expect(mapUnitVisualOffset("magic-archer", 1)).toBe(-1);
    expect(mapUnitVisualOffset("magic-archer", 2)).toBe(-1);
    expect(mapUnitVisualOffset("cavalry", 1)).toBe(0);
    expect(mapUnitVisualOffset("cavalry", 2)).toBe(0);
  });

  it("puts the 45-row boss-part frames' top-left on the cell origin like module 29", () => {
    expect(mapUnitVerticalOffset("head")).toBe(2);
    expect(mapUnitVerticalOffset("hand")).toBe(2);
    expect(mapUnitVerticalOffset("dragon")).toBe(0);
    expect(mapUnitVerticalOffset("soldier")).toBe(0);
  });
});
