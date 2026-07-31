import type { Position, UnitStatuses } from "../../types";
import type { Stage0ActionId } from "../../content/stage0-actions.generated";

export type BattleActionId = Stage0ActionId;

export interface BattleActionIntent {
  actionId: BattleActionId;
  actorId: string;
  targetId: string;
}

export interface SpecialActionResult {
  actionId: BattleActionId;
  actorId: string;
  targetId: string;
  target: Position;
  damage: number;
  healing: number;
  blocked: boolean;
  targetDied: boolean;
  experienceGained: number;
}

export interface PreparedBattleAction {
  intent: BattleActionIntent;
  result: SpecialActionResult;
  rngBefore: number;
  rngAfter: number;
  actorExperienceBefore: number;
  actorExperienceAfter: number;
  targetLifeBefore: number;
  targetLifeAfter: number;
  targetStatusesBefore: UnitStatuses;
  targetStatusesAfter: UnitStatuses;
}
