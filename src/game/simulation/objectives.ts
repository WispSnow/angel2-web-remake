import type { StageObjectiveCondition, StageObjectiveDefinition } from "../content/stages";
import type { BattleOutcome, Side } from "../types";

export interface ObjectiveUnitIdentity {
  side: Side;
  slot: number;
  x?: number;
  y?: number;
}

export function objectiveConditionSatisfied(
  units: readonly ObjectiveUnitIdentity[],
  condition: StageObjectiveCondition,
): boolean {
  if (condition.type === "any-of") {
    return condition.conditions.some((candidate) => objectiveConditionSatisfied(units, candidate));
  }
  if (condition.type === "eliminate-side") {
    return !units.some((unit) => unit.side === condition.side);
  }
  if (condition.type === "any-unit-removed") {
    return condition.slots.some((slot) => !units.some(
      (unit) => unit.side === condition.side && unit.slot === slot,
    ));
  }
  if (condition.type === "unit-in-cell-range") {
    return units.some((unit) => unit.side === condition.side
      && unit.slot === condition.slot
      && unit.x !== undefined
      && unit.y !== undefined
      && unit.y * condition.width + unit.x >= condition.minimum
      && unit.y * condition.width + unit.x <= condition.maximum);
  }
  return !units.some(
    (unit) => unit.side === condition.side && unit.slot === condition.slot,
  );
}

/**
 * Slots the victory condition names outright, i.e. the units whose removal is
 * itself the win. Wipe-out and escort conditions name nobody, so their rank
 * and file stay ordinary even when one of them happens to be the last alive.
 */
export function slotsNamedByCondition(
  condition: StageObjectiveCondition,
  side: Side,
): readonly number[] {
  if (condition.type === "any-of") {
    return condition.conditions.flatMap((candidate) => slotsNamedByCondition(candidate, side));
  }
  if (condition.type === "any-unit-removed") {
    return condition.side === side ? [...condition.slots] : [];
  }
  if (condition.type === "unit-removed") {
    return condition.side === side ? [condition.slot] : [];
  }
  return [];
}

export function battleOutcomeForObjective(
  units: readonly ObjectiveUnitIdentity[],
  objective: StageObjectiveDefinition,
): BattleOutcome {
  // Native battle resolution gives loss precedence if both terminal conditions
  // become true during the same committed action.
  if (objectiveConditionSatisfied(units, objective.defeat)) return "defeat";
  if (objectiveConditionSatisfied(units, objective.victory)) return "victory";
  return "ongoing";
}
