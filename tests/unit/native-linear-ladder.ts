import {
  classDefinition,
  linearExperienceStepFor,
  nativePostThirdRowExperienceStepFor,
} from "../../src/game/content/classes";
import type { BattleSaveData, CompletedSaveData } from "../../src/game/types";

/**
 * REMAKE-159：v83..v120 把难度 1／2 的敌方经验记在原版 3 级后门槛上。从现行夹具造这些
 * 版本的存档时，side 2 经验换回那条阶梯——同一成长行、行内同样多的经验——迁移再按原路
 * 换回，所以「无损迁移」的断言仍直接比较现行夹具。
 */
export function onNativeLinearLadder<T extends BattleSaveData | CompletedSaveData>(save: T): T {
  if (save.kind !== "battle" || (save.difficulty !== 1 && save.difficulty !== 2)) return save;
  const battle = save as BattleSaveData;
  const units = battle.battle.units.map((unit) => {
    const currentStep = linearExperienceStepFor(unit.classId);
    const nativeStep = nativePostThirdRowExperienceStepFor(unit.classId);
    const third = classDefinition(unit.classId).dataRows[2].experienceThreshold;
    if (unit.side !== 2 || currentStep === undefined || nativeStep === undefined
      || unit.experience < third) return unit;
    const rows = Math.floor((unit.experience - third) / currentStep);
    const earned = unit.experience - third - rows * currentStep;
    if (earned >= nativeStep) {
      throw new Error(`${unit.id} has no native-ladder value on growth row ${rows + 3}`);
    }
    return { ...unit, experience: third + rows * nativeStep + earned };
  });
  return { ...battle, battle: { ...battle.battle, units } } as T;
}
