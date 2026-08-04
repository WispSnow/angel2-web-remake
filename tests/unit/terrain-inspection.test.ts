import { describe, expect, it } from "vitest";
import { inspectTerrain } from "../../src/game/terrain-inspection";
import type { BattleUnit, UnitStats } from "../../src/game/types";

const soldier: BattleUnit = {
  id: "1:0",
  side: 1,
  slot: 0,
  classId: "soldier",
  className: "士兵",
  name: "妮雅",
  portrait: 46,
  x: 29,
  y: 26,
  life: 160,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: {
    attackUp: 0,
    defenseUp: 0,
    magicGuard: 0,
    confusion: 0,
    attackDown: 0,
    defenseDown: 0,
    poison: 0,
    techniqueSeal: 0,
  },
};

const soldierStats: UnitStats = {
  attack: 39,
  defense: 21,
  maxLife: 160,
  movement: 4,
  level: 1,
};

describe("terrain inspection", () => {
  it("projects the current class movement and defense profiles without inventing attack bonuses", () => {
    expect(inspectTerrain({ x: 30, y: 27 }, 13, soldier, soldierStats)).toEqual({
      position: { x: 30, y: 27 },
      terrainSlot: 13,
      referenceUnit: {
        id: "1:0",
        name: "妮雅",
        classId: "soldier",
        className: "士兵",
      },
      movementRule: 1,
      movementCost: 1,
      traversable: true,
      attackBonusPercent: 0,
      defenseBonusPercent: 15,
      defenseBonusPoints: 3,
    });
  });

  it("marks blocked terrain without implying that its defense profile can be occupied", () => {
    expect(inspectTerrain({ x: 0, y: 0 }, 0, soldier, soldierStats)).toMatchObject({
      terrainSlot: 0,
      movementRule: 99,
      traversable: false,
      attackBonusPercent: 0,
      movementCost: undefined,
      defenseBonusPercent: undefined,
      defenseBonusPoints: undefined,
    });
  });

  it("keeps class-dependent fields explicit when no reference unit is available", () => {
    expect(inspectTerrain({ x: 4, y: 5 }, 16)).toEqual({
      position: { x: 4, y: 5 },
      terrainSlot: 16,
      attackBonusPercent: 0,
    });
  });
});
