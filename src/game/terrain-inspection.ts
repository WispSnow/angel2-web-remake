import {
  movementRulesFor,
  terrainDefensePercentFor,
} from "./content/classes";
import type { BattleUnit, Position, UnitStats } from "./types";

export interface TerrainInspection {
  position: Position;
  terrainSlot: number;
  referenceUnit?: Pick<BattleUnit, "id" | "name" | "classId" | "className">;
  movementRule?: number;
  movementCost?: number;
  traversable?: boolean;
  attackBonusPercent: 0;
  defenseBonusPercent?: number;
  defenseBonusPoints?: number;
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
): TerrainInspection {
  if (!referenceUnit || !referenceStats) {
    return {
      position: { ...position },
      terrainSlot,
      attackBonusPercent: 0,
    };
  }

  const movementRule = movementRulesFor(referenceUnit.classId)[terrainSlot] ?? 99;
  const traversable = movementRule < 98;
  const defenseBonusPercent = terrainDefensePercentFor(referenceUnit.classId, terrainSlot);
  return {
    position: { ...position },
    terrainSlot,
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
