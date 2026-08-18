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

/**
 * `REMAKE-110`：`stableRemake` 给每关一个 99 个完整回合的上限，超时判负。
 *
 * 原版没有这条规则。原版的 `DS:2F83` 同时是完整回合号和终局哨兵（`999` = 本次运行中的
 * 胜利，`1000` = 已完成胜利），HUD 又只画五字符缓冲的后三位，所以回合号涨到 999 会被
 * 误读成胜利——那是一个潜在冲突，不是设计出来的限时规则。本上限是明确的复刻产品决定。
 *
 * 语义是「没有第 100 回合」：回合号在回合边界推进到 `STAGE_ROUND_LIMIT + 1` 的那一刻
 * 判负，所以玩家实际打满 99 个完整回合。第 99 回合内达成的胜利照常成立。判据只读回合
 * 号，因此不需要新的存档字段，读档后也能原样重算。
 */
export const STAGE_ROUND_LIMIT = 99;

/**
 * 上限本身是个安全阀，触发时必须已经预告过——突然判负等于没收玩家的一局。最后这些
 * 回合里，回合框进入警告态，回合开始信息栏也逐条报剩余回合数。
 */
export const STAGE_ROUND_LIMIT_WARNING_ROUNDS = 10;

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
