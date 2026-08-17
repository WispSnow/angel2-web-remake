import { describe, expect, it } from "vitest";
import {
  STAGE2_GENERIC_ALLY_SLOT_SWAP,
  STAGE3_GENERIC_ALLY_SLOT_SWAP,
} from "../../src/game/content/generic-ally-stage-swap";
import { STAGE2_SEMANTIC_ALLIED_UNITS } from "../../src/game/content/stage2";
import { STAGE3_SEMANTIC_ALLIED_UNITS } from "../../src/game/content/stage3";

const SWAPPED_OUT_OF_STAGE2 = [40, 41, 42, 43];
const SWAPPED_OUT_OF_STAGE3 = [51, 52, 53, 54];

const bySlot = (units: readonly { slot: number }[]) =>
  new Map(units.map((unit) => [unit.slot, unit]));

describe("REMAKE-108 stage 2/3 generic ally slot swap", () => {
  it("moves the two slot blocks between the stages without touching anything else", () => {
    const stage2 = STAGE2_SEMANTIC_ALLIED_UNITS.map(({ slot }) => slot);
    const stage3 = STAGE3_SEMANTIC_ALLIED_UNITS.map(({ slot }) => slot);

    for (const slot of SWAPPED_OUT_OF_STAGE2) {
      expect(stage2, `stage 2 still hosts ${slot}`).not.toContain(slot);
      expect(stage3, `stage 3 is missing ${slot}`).toContain(slot);
    }
    for (const slot of SWAPPED_OUT_OF_STAGE3) {
      expect(stage3, `stage 3 still hosts ${slot}`).not.toContain(slot);
      expect(stage2, `stage 2 is missing ${slot}`).toContain(slot);
    }

    // 未登记的通用槽与全部具名角色保持原样。
    expect([...stage2].sort((a, b) => a - b)).toEqual([0, 2, 24, 44, 45, 51, 52, 53, 54]);
    expect([...stage3].sort((a, b) => a - b))
      .toEqual([1, 3, 4, 20, 21, 40, 41, 42, 43, 45, 46, 47, 50]);
    expect(new Set(stage2).size).toBe(stage2.length);
    expect(new Set(stage3).size).toBe(stage3.length);
  });

  it("keeps every native landing cell, behavior and class-inheritance rule", () => {
    // 落点、行为与 `initialClassId` 都来自原版模板，覆写只改槽号。
    expect(bySlot(STAGE2_SEMANTIC_ALLIED_UNITS).get(51))
      .toMatchObject({ position: { x: 20, y: 33 }, aiBehavior: 11, initialClassId: undefined });
    expect(bySlot(STAGE2_SEMANTIC_ALLIED_UNITS).get(54))
      .toMatchObject({ position: { x: 29, y: 33 }, aiBehavior: 11, initialClassId: undefined });
    expect(bySlot(STAGE3_SEMANTIC_ALLIED_UNITS).get(40))
      .toMatchObject({ position: { x: 18, y: 34 }, aiBehavior: 0, initialClassId: undefined });
    expect(bySlot(STAGE3_SEMANTIC_ALLIED_UNITS).get(43))
      .toMatchObject({ position: { x: 21, y: 34 }, aiBehavior: 0, initialClassId: undefined });
  });

  it("orders each stage's swapped block so the slot letters read left to right", () => {
    const ascendingByX = (units: readonly { slot: number; position: { x: number } }[], block: readonly number[]) =>
      units
        .filter(({ slot }) => block.includes(slot))
        .sort((left, right) => left.position.x - right.position.x)
        .map(({ slot }) => slot);

    expect(ascendingByX(STAGE2_SEMANTIC_ALLIED_UNITS, SWAPPED_OUT_OF_STAGE3))
      .toEqual([51, 52, 53, 54]);
    expect(ascendingByX(STAGE3_SEMANTIC_ALLIED_UNITS, SWAPPED_OUT_OF_STAGE2))
      .toEqual([40, 41, 42, 43]);
  });

  it("declares two injective maps whose images are free in the target stage", () => {
    for (const [swap, block] of [
      [STAGE2_GENERIC_ALLY_SLOT_SWAP, SWAPPED_OUT_OF_STAGE3],
      [STAGE3_GENERIC_ALLY_SLOT_SWAP, SWAPPED_OUT_OF_STAGE2],
    ] as const) {
      const images = [...swap.values()];
      expect(new Set(images).size).toBe(images.length);
      expect([...images].sort((a, b) => a - b)).toEqual([...block]);
    }
    expect([...STAGE2_GENERIC_ALLY_SLOT_SWAP.keys()].sort((a, b) => a - b))
      .toEqual(SWAPPED_OUT_OF_STAGE2);
    expect([...STAGE3_GENERIC_ALLY_SLOT_SWAP.keys()].sort((a, b) => a - b))
      .toEqual(SWAPPED_OUT_OF_STAGE3);
  });
});
