import type { StageObjectiveCondition, StageObjectiveDefinition } from "../content/stages";
import type { BattleOutcome, Position, Side } from "../types";

export interface ObjectiveUnitIdentity {
  side: Side;
  slot: number;
  x?: number;
  y?: number;
}

/**
 * Expands only the positional branches of a stage objective into their exact
 * board cells. The renderer consumes this read-only projection for destination
 * guidance; objective evaluation remains the sole source of victory truth.
 */
export function objectiveDestinationCells(
  condition: StageObjectiveCondition,
  battlefield: Readonly<{ width: number; height: number }>,
): Position[] {
  if (condition.type === "any-of") {
    const unique = new Map<string, Position>();
    for (const candidate of condition.conditions) {
      for (const position of objectiveDestinationCells(candidate, battlefield)) {
        unique.set(`${position.x},${position.y}`, position);
      }
    }
    return [...unique.values()];
  }
  if (
    condition.type !== "unit-in-cell-range"
    || condition.width <= 0
    || battlefield.width <= 0
    || battlefield.height <= 0
  ) return [];

  const minimum = Math.max(0, condition.minimum);
  const maximum = Math.min(
    condition.maximum,
    condition.width * battlefield.height - 1,
  );
  if (maximum < minimum) return [];

  const cells: Position[] = [];
  for (let cell = minimum; cell <= maximum; cell += 1) {
    const position = {
      x: cell % condition.width,
      y: Math.floor(cell / condition.width),
    };
    if (position.x < battlefield.width) cells.push(position);
  }
  return cells;
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
