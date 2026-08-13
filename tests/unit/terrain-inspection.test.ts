import { describe, expect, it } from "vitest";
import {
  STAGE27_IRON_PLATE_TERRAIN_SLOT,
  STAGE27_OBSTACLE_TERRAIN_SLOT,
  STAGE27_TERRAIN_TOKENS,
  STAGE27_TOKEN_TO_TERRAIN_SLOT,
} from "../../src/game/content/stage27";
import {
  inspectTerrain,
  terrainDisplayNameForSlot,
} from "../../src/game/terrain-inspection";
import type { BattleUnit, UnitStats } from "../../src/game/types";

const STAGE27_USED_TERRAIN_SLOTS = [...new Set(
  [...STAGE27_TERRAIN_TOKENS].map((token) => STAGE27_TOKEN_TO_TERRAIN_SLOT[token]),
)].sort((left, right) => left - right);

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
    expect(inspectTerrain({ x: 30, y: 27 }, 13, soldier, soldierStats, "stage-00")).toEqual({
      position: { x: 30, y: 27 },
      terrainSlot: 13,
      terrainName: "宮殿地面",
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
      terrainName: "地圖邊界",
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
      terrainName: "通道",
      attackBonusPercent: 0,
    });
  });

  it("uses stage-specific visual names and broad remake classifications without exposing slot ids", () => {
    expect([0, 13, 14, 15, 16].map((slot) => terrainDisplayNameForSlot(slot, "stage-00"))).toEqual([
      "城牆與邊界",
      "宮殿地面",
      "宮殿階梯",
      "王座",
      "紅毯",
    ]);
    expect(terrainDisplayNameForSlot(3, "stage-01")).toBe("森林");
    expect(terrainDisplayNameForSlot(11, "stage-02")).toBe("城牆");
    expect(terrainDisplayNameForSlot(7)).toBe("海域");
    expect(terrainDisplayNameForSlot(17)).toBe("未分類地形");
    expect(terrainDisplayNameForSlot(23)).toBe("未分類地形");
    expect(Array.from({ length: 23 }, (_, slot) => terrainDisplayNameForSlot(slot)))
      .not.toContainEqual(expect.stringMatching(/槽\s*\d+/));
  });

  it("names every logical slot stage 27 actually places on its board", () => {
    // The generic table would call the paved 鐵板 slot 冰面 and the 障礙 slot
    // 流沙與陷阱, which reads wrong the moment an engineer builds one.
    expect(STAGE27_USED_TERRAIN_SLOTS.map((slot) => terrainDisplayNameForSlot(slot, "stage-27")))
      .toEqual([
        "地圖邊界", "岸邊沙地", "草地", "淺水", "障礙",
        "石砌街道", "城牆", "深水", "鐵板",
      ]);
    expect(terrainDisplayNameForSlot(STAGE27_IRON_PLATE_TERRAIN_SLOT, "stage-27")).toBe("鐵板");
    expect(terrainDisplayNameForSlot(STAGE27_OBSTACLE_TERRAIN_SLOT, "stage-27")).toBe("障礙");
  });
});
