import { classFallbackPortraitFor, className } from "../content/classes";
import { initialEnemyExperience, statsFor } from "../content/stage0";
import type {
  BattleUnit,
  Difficulty,
  PortraitRecord,
  Position,
  UnitClassId,
} from "../types";
import { emptyUnitStatuses } from "./status";

/**
 * 叶子模块：`battle.ts` 需要它来建原版Debug EDIT 放上场的模板敌人，而 `fixed-stage-battle.ts`
 * 反过来要 `BattleScenario` 类型；把敌人工厂放在这里才不会让两者互相导入。
 */
export interface FixedStageEnemyUnitDefinition {
  slot: number;
  position: Position;
  classId: UnitClassId;
  name: string;
  /** Omit for a generic class identity; named actors must provide their record. */
  portrait?: PortraitRecord;
  aiBehavior: number;
}

/** Whether this ruleset applies the shared enemy difficulty experience loop. */
export type FixedStageEnemyExperienceSeeding = "difficulty" | "none" | "difficulty-unless-lawless";

export function createFixedStageEnemy(
  definition: FixedStageEnemyUnitDefinition,
  difficulty: Difficulty,
  experienceSeeding: FixedStageEnemyExperienceSeeding = "difficulty",
): BattleUnit {
  const experience = experienceSeeding === "none"
    || (experienceSeeding === "difficulty-unless-lawless" && difficulty === 3)
    ? 0
    : initialEnemyExperience(definition.classId, difficulty);
  const unit: BattleUnit = {
    id: `2:${definition.slot}`,
    side: 2,
    slot: definition.slot,
    classId: definition.classId,
    className: className(definition.classId),
    name: definition.name,
    portrait: definition.portrait
      ?? classFallbackPortraitFor(definition.classId, 2)
      ?? 48 as PortraitRecord,
    x: definition.position.x,
    y: definition.position.y,
    life: 0,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
  unit.life = statsFor(unit, difficulty).maxLife;
  return unit;
}
