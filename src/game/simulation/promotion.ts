import {
  classFallbackPortraitFor,
  className,
  classStatsFor,
  isPromotionEligible,
  promotionTargetsFor,
  type ClassId,
} from "../content/classes";
import type { BattleUnit, UnitStats } from "../types";

export interface PromotionCommitResult {
  unitId: string;
  previousClassId: ClassId;
  classId: ClassId;
  previousExperience: number;
  previousStats: UnitStats;
  stats: UnitStats;
  life: number;
}

export function promotionQueue(
  units: readonly BattleUnit[],
  stageWidth: number,
): string[] {
  return units
    .filter(isPromotionEligible)
    .sort((left, right) =>
      (left.y * stageWidth + left.x) - (right.y * stageWidth + right.x))
    .map((unit) => unit.id);
}

export function promoteUnit(
  unit: BattleUnit,
  targetClassId: ClassId,
): PromotionCommitResult {
  if (!isPromotionEligible(unit)) {
    throw new Error(`${unit.name}目前不能轉職`);
  }
  if (!promotionTargetsFor(unit.classId).some((target) => target.id === targetClassId)) {
    throw new Error(`${targetClassId}不是${unit.name}的合法轉職候選`);
  }

  const previousClassId = unit.classId;
  const followsClassPortrait = unit.portrait
    === classFallbackPortraitFor(previousClassId, unit.side);
  const previousExperience = unit.experience;
  const previousStats = classStatsFor(unit);
  const life = unit.life;
  unit.classId = targetClassId;
  unit.className = className(targetClassId);
  if (followsClassPortrait) {
    unit.portrait = classFallbackPortraitFor(targetClassId, unit.side) ?? unit.portrait;
  }
  unit.experience = 0;
  const stats = classStatsFor(unit);
  return {
    unitId: unit.id,
    previousClassId,
    classId: targetClassId,
    previousExperience,
    previousStats,
    stats,
    life,
  };
}
