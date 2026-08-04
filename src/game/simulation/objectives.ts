import type { StageObjectiveCondition, StageObjectiveDefinition } from "../content/stages";
import type { BattleOutcome, Side } from "../types";

export interface ObjectiveUnitIdentity {
  side: Side;
  slot: number;
}

export function objectiveConditionSatisfied(
  units: readonly ObjectiveUnitIdentity[],
  condition: StageObjectiveCondition,
): boolean {
  if (condition.type === "eliminate-side") {
    return !units.some((unit) => unit.side === condition.side);
  }
  if (condition.type === "any-unit-removed") {
    return condition.slots.some((slot) => !units.some(
      (unit) => unit.side === condition.side && unit.slot === slot,
    ));
  }
  return !units.some(
    (unit) => unit.side === condition.side && unit.slot === condition.slot,
  );
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
