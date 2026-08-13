import {
  movementRulesFor,
  terrainDefensePercentFor,
} from "./content/classes";
import type { BattleUnit, Position, UnitStats } from "./types";

export interface TerrainInspection {
  position: Position;
  terrainSlot: number;
  terrainName: string;
  referenceUnit?: Pick<BattleUnit, "id" | "name" | "classId" | "className">;
  movementRule?: number;
  movementCost?: number;
  traversable?: boolean;
  attackBonusPercent: 0;
  defenseBonusPercent?: number;
  defenseBonusPoints?: number;
}

/**
 * [DD] Player-facing visual classifications for the original numeric rule slots.
 * The original runtime has no visible slot-name table, and some tilesets reuse a
 * slot for visually related materials, so active stages may provide a narrower
 * label below without changing the canonical numeric rule identity.
 */
const TERRAIN_SLOT_DISPLAY_NAMES: readonly string[] = [
  "地圖邊界",
  "沙地",
  "平原",
  "森林",
  "山地",
  "陡坡",
  "橋樑",
  "海域",
  "沙漠",
  "流沙與陷阱",
  "石砌地面",
  "城牆與岩壁",
  "深水與斷崖",
  "室內地面",
  "階梯",
  "要地",
  "通道",
  "未分類地形",
  "木板地面",
  "水井",
  "場景設施",
  "冰面",
  "未分類地形",
];

const STAGE_TERRAIN_DISPLAY_NAMES: Readonly<
  Record<string, Readonly<Partial<Record<number, string>>>>
> = {
  "stage-00": {
    0: "城牆與邊界",
    13: "宮殿地面",
    14: "宮殿階梯",
    15: "王座",
    16: "紅毯",
  },
  "stage-01": {
    0: "地圖邊界",
    1: "沙地",
    2: "平原",
    3: "森林",
    5: "山地",
    6: "橋樑",
    10: "石砌道路",
    11: "城牆",
    12: "河流",
  },
  "stage-02": {
    0: "地圖邊界",
    2: "平原",
    3: "森林",
    4: "土坡",
    6: "橋樑",
    10: "石砌地面",
    11: "城牆",
    12: "河流",
  },
  "stage-03": {
    0: "地圖邊界",
    1: "沙地",
    2: "平原",
    3: "森林",
    5: "山地",
  },
  // Valkyrie's coastal city. Slots 9 and 21 exist on the base board only as the
  // engineer's two construction source cells `(16,26)` and `(16,25)`, so their
  // labels double as the names of whatever `2K` and `1K` build.
  "stage-27": {
    0: "地圖邊界",
    1: "岸邊沙地",
    2: "草地",
    7: "淺水",
    9: "障礙",
    10: "石砌街道",
    11: "城牆",
    12: "深水",
    21: "鐵板",
  },
};

export function terrainDisplayNameForSlot(
  terrainSlot: number,
  stageId?: string,
): string {
  const stageName = stageId
    ? STAGE_TERRAIN_DISPLAY_NAMES[stageId]?.[terrainSlot]
    : undefined;
  return stageName ?? TERRAIN_SLOT_DISPLAY_NAMES[terrainSlot] ?? "未分類地形";
}

/**
 * Projects the evidence-backed terrain profiles into player-facing details.
 * Movement and defense are class-specific; terrain never increases attack.
 */
export function inspectTerrain(
  position: Position,
  terrainSlot: number,
  referenceUnit?: BattleUnit,
  referenceStats?: UnitStats,
  stageId?: string,
): TerrainInspection {
  const terrainName = terrainDisplayNameForSlot(terrainSlot, stageId);
  if (!referenceUnit || !referenceStats) {
    return {
      position: { ...position },
      terrainSlot,
      terrainName,
      attackBonusPercent: 0,
    };
  }

  const movementRule = movementRulesFor(referenceUnit.classId)[terrainSlot] ?? 99;
  const traversable = movementRule < 98;
  const defenseBonusPercent = terrainDefensePercentFor(referenceUnit.classId, terrainSlot);
  return {
    position: { ...position },
    terrainSlot,
    terrainName,
    referenceUnit: {
      id: referenceUnit.id,
      name: referenceUnit.name,
      classId: referenceUnit.classId,
      className: referenceUnit.className,
    },
    movementRule,
    movementCost: traversable ? movementRule : undefined,
    traversable,
    attackBonusPercent: 0,
    defenseBonusPercent: traversable ? defenseBonusPercent : undefined,
    defenseBonusPoints: traversable
      ? Math.floor(referenceStats.defense * defenseBonusPercent / 100)
      : undefined,
  };
}
