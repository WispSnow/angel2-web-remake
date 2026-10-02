import { describe, expect, it } from "vitest";
import {
  STAGE27_IRON_PLATE_TERRAIN_SLOT,
  STAGE27_OBSTACLE_TERRAIN_SLOT,
  STAGE27_TERRAIN_TOKENS,
  STAGE27_TOKEN_TO_TERRAIN_SLOT,
} from "../../src/game/content/stage27";
import { TERRAIN_SLOT_NATIVE_NAMES } from "../../src/game/content/class-catalog.generated";
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
      terrainName: "紅布",
      attackBonusPercent: 0,
    });
  });

  it("falls back to the native debug-editor slot names with the two REMAKE-175 substitutions", () => {
    // DS:1585 as drawn by 0000:1B3A; slot 0 不可 reads as a place name 地圖邊界 and
    // the original typo 坡璧 is shown as 坡壁. Every other slot is verbatim.
    expect(TERRAIN_SLOT_NATIVE_NAMES).toEqual([
      "不可", "沙地", "草地", "樹林", "坡璧", "山地", "橋", "淺海",
      "淺澤", "深澤", "地磚", "城牆", "深海", "磁磚", "階梯", "王座",
      "紅布", "屋牆", "木板", "井", "杉欄", "木牌", "鐵板",
    ]);
    expect(Array.from({ length: 23 }, (_, slot) => terrainDisplayNameForSlot(slot))).toEqual([
      "地圖邊界", "沙地", "草地", "樹林", "坡壁", "山地", "橋", "淺海",
      "淺澤", "深澤", "地磚", "城牆", "深海", "磁磚", "階梯", "王座",
      "紅布", "屋牆", "木板", "井", "杉欄", "木牌", "鐵板",
    ]);
    // Stage 12 「落入沼澤」 is the board that uses slots 8 and 9; with no stage
    // override it shows the native marsh names, not the old desert reading.
    expect([8, 9].map((slot) => terrainDisplayNameForSlot(slot, "stage-12"))).toEqual(["淺澤", "深澤"]);
    expect(terrainDisplayNameForSlot(23)).toBe("未分類地形");
  });

  it("keeps the reviewed stage-specific visual names over the native fallback", () => {
    expect([0, 13, 14, 15, 16].map((slot) => terrainDisplayNameForSlot(slot, "stage-00"))).toEqual([
      "城牆與邊界",
      "宮殿地面",
      "宮殿階梯",
      "王座",
      "紅毯",
    ]);
    expect(terrainDisplayNameForSlot(3, "stage-01")).toBe("森林");
    expect(terrainDisplayNameForSlot(12, "stage-01")).toBe("河流");
    expect(terrainDisplayNameForSlot(4, "stage-02")).toBe("土坡");
    expect(terrainDisplayNameForSlot(11, "stage-02")).toBe("城牆");
    // Later boards that reuse a native slot for different-looking terrain (REMAKE-175).
    expect(terrainDisplayNameForSlot(12, "stage-06")).toBe("深淵");
    expect(terrainDisplayNameForSlot(12, "stage-10")).toBe("雲海");
    expect(["stage-23", "stage-24"].map((stage) => terrainDisplayNameForSlot(12, stage)))
      .toEqual(["斷崖", "斷崖"]);
    expect(["stage-04", "stage-05", "stage-20", "stage-34", "stage-35"]
      .map((stage) => terrainDisplayNameForSlot(16, stage))).toEqual(Array(5).fill("地毯"));
    expect(["stage-35", "stage-36"].map((stage) => terrainDisplayNameForSlot(20, stage)))
      .toEqual(["碎牆台", "碎牆台"]);
    // Boards where the native name already fits keep it: moats, red carpets, fences.
    expect(["stage-11", "stage-29"].map((stage) => terrainDisplayNameForSlot(12, stage)))
      .toEqual(["深海", "深海"]);
    expect(terrainDisplayNameForSlot(16, "stage-30")).toBe("紅布");
    expect(terrainDisplayNameForSlot(20, "stage-21")).toBe("杉欄");
    expect(Array.from({ length: 23 }, (_, slot) => terrainDisplayNameForSlot(slot)))
      .not.toContainEqual(expect.stringMatching(/槽\s*\d+/));
  });

  it("names every logical slot stage 27 actually places on its board", () => {
    // The native fallback would call the paved 鐵板 slot 木牌 and the 障礙 slot
    // 深澤, which reads wrong the moment an engineer builds one (REMAKE-175).
    expect(STAGE27_USED_TERRAIN_SLOTS.map((slot) => terrainDisplayNameForSlot(slot, "stage-27")))
      .toEqual([
        "地圖邊界", "岸邊沙地", "草地", "淺水", "障礙",
        "石砌街道", "城牆", "深水", "鐵板",
      ]);
    expect(terrainDisplayNameForSlot(STAGE27_IRON_PLATE_TERRAIN_SLOT, "stage-27")).toBe("鐵板");
    expect(terrainDisplayNameForSlot(STAGE27_OBSTACLE_TERRAIN_SLOT, "stage-27")).toBe("障礙");
  });
});
