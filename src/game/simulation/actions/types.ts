import type { BattleActionId } from "../../content/actions";
import type { Position, UnitStatuses } from "../../types";

export type { BattleActionId };

export interface BattleActionIntent {
  actionId: BattleActionId;
  actorId: string;
  targetId?: string;
  target?: Position;
}

export interface SpecialActionAffectedUnit {
  unitId: string;
  positionBefore: Position;
  positionAfter: Position;
  lifeBefore: number;
  lifeAfter: number;
  statusesBefore: UnitStatuses;
  statusesAfter: UnitStatuses;
  damage: number;
  healing: number;
  blocked: boolean;
  died: boolean;
  moved: boolean;
}

export interface SpecialActionEffectCell {
  position: Position;
  value: number;
}

export interface SpecialActionResult {
  actionId: BattleActionId;
  actorId: string;
  targetId?: string;
  target: Position;
  damage: number;
  healing: number;
  blocked: boolean;
  targetDied: boolean;
  experienceGained: number;
  affectedUnits: readonly SpecialActionAffectedUnit[];
  effectCells: readonly SpecialActionEffectCell[];
}

export interface PreparedBattleAction {
  intent: BattleActionIntent;
  result: SpecialActionResult;
  rngBefore: number;
  rngAfter: number;
  rngCallsBefore: number;
  rngCallsAfter: number;
  actorExperienceBefore: number;
  actorExperienceAfter: number;
  targetLifeBefore: number;
  targetLifeAfter: number;
  targetStatusesBefore: UnitStatuses;
  targetStatusesAfter: UnitStatuses;
  affectedUnits: readonly SpecialActionAffectedUnit[];
}
