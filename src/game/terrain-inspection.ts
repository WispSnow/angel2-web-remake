import {
  movementRulesFor,
  terrainDefensePercentFor,
} from "./content/classes";
import { TERRAIN_SLOT_NATIVE_NAMES } from "./content/class-catalog.generated";
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
 * `REMAKE-175`: the fallback is the original developers' slot names from the
 * debug terrain editor (DS:1585, `[OF]`), with two `[DD]` substitutions:
 * slot 0's 「不可」 is a rule flag rather than a place, and slot 4's 「坡璧」 is a
 * typo for 坡壁. Stages may still give a narrower look-of-this-board label below
 * without changing the canonical numeric rule identity.
 */
const TERRAIN_SLOT_DISPLAY_SUBSTITUTIONS: Readonly<Partial<Record<number, string>>> = {
  0: "地圖邊界",
  4: "坡壁",
};

const TERRAIN_SLOT_DISPLAY_NAMES: readonly string[] = TERRAIN_SLOT_NATIVE_NAMES.map(
  (name, slot) => TERRAIN_SLOT_DISPLAY_SUBSTITUTIONS[slot] ?? name,
);

/** `[DD]` look-of-this-board refinements; each still names the same native slot. */
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
  // REMAKE-175: the boards below reuse slot 12 (深海), 16 (紅布) or 20 (杉欄) for
  // terrain that looks nothing like the native name, so they name what is drawn.
  "stage-04": { 16: "地毯" },
  "stage-05": { 16: "地毯" },
  "stage-06": { 12: "深淵" },
  "stage-10": { 12: "雲海" },
  "stage-20": { 16: "地毯" },
  "stage-23": { 12: "斷崖" },
  "stage-24": { 12: "斷崖" },
  // Valkyrie's coastal city. Slots 9 and 21 exist on the base board only as the
  // engineer's two construction source cells `(16,26)` and `(16,25)`, so their
  // labels double as the names of whatever `2K` and `1K` build. They keep the
  // technique names over the native slot names 深澤／木牌 (REMAKE-175).
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
  "stage-34": { 16: "地毯" },
  // Includes the three REMAKE-170 wall cells the simulation resolves as slot 20.
  "stage-35": { 16: "地毯", 20: "碎牆台" },
  "stage-36": { 20: "碎牆台" },
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
