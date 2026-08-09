import type { BattleActionId } from "../../content/actions";
import type { Position, UnitStatuses } from "../../types";

export type { BattleActionId };

export type ActionBlockReason = "magicGuard" | "frozen" | "classImmune";
export type PrayerOutcomeKind = "healing" | "experience" | "attackUp" | "defenseUp";

export interface BattleActionIntent {
  actionId: BattleActionId;
  actorId: string;
  targetId?: string;
  target?: Position;
  /** REMAKE-035: explicit actor-to-target path for magic-archer line damage. */
  linePath?: readonly Position[];
  /** Rules-significant only for native actions whose effect unions the current 10x7 view. */
  viewportOrigin?: Position;
}

export interface SpecialActionAffectedUnit {
  unitId: string;
  positionBefore: Position;
  positionAfter: Position;
  lifeBefore: number;
  lifeAfter: number;
  experienceBefore: number;
  experienceAfter: number;
  actionDisabledBefore: boolean;
  actionDisabledAfter: boolean;
  statusesBefore: UnitStatuses;
  statusesAfter: UnitStatuses;
  damage: number;
  healing: number;
  blocked: boolean;
  blockReason?: ActionBlockReason;
  died: boolean;
  moved: boolean;
  prayerOutcome?: PrayerOutcomeKind;
  /** The native result text shows the roll even when healing is capped or frozen-blocked. */
  prayerRolledAmount?: number;
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
  blockReason?: ActionBlockReason;
  targetDied: boolean;
  experienceGained: number;
  affectedUnits: readonly SpecialActionAffectedUnit[];
  effectCells: readonly SpecialActionEffectCell[];
  prayerEligibleUnitIds?: readonly string[];
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
