import { classCombatRole, terrainDefensePercentFor } from "../content/classes";
import type { BattleUnit, Position, UnitStats } from "../types";
import type { AlliedAiAction } from "./ai-contracts";
import { effectiveAttack, effectiveDefense } from "./status";
import { positionKey, reachableCells, type GridBattlefield } from "./grid";

type SisterActionId = "fire-1" | "heal-1";

export interface EnemyThreatContext {
  width: number;
  battlefield: GridBattlefield;
  units: readonly BattleUnit[];
  unit: (id: string) => BattleUnit | undefined;
  statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => UnitStats;
  movementPath: (id: string, destination: Position) => Position[];
  planSisterAction: (
    unit: BattleUnit,
    actionId: SisterActionId,
  ) => AlliedAiAction | undefined;
}

function minimumOrdinaryDamage(
  context: EnemyThreatContext,
  attacker: BattleUnit,
  defender: BattleUnit,
): number {
  if (defender.actionDisabled) return 0;
  const attackerStats = context.statsFor(attacker);
  const defenderStats = context.statsFor(defender);
  const defenderDefense = effectiveDefense(defenderStats.defense, defender.statuses);
  const terrainDefense = Math.floor(
    defenderDefense
    * terrainDefensePercentFor(
      defender.classId,
      context.battlefield.terrainSlotAt(defender),
    )
    / 100,
  );
  return Math.max(
    0,
    effectiveAttack(attackerStats.attack, attacker.statuses)
      - defenderDefense
      - terrainDefense,
  ) + 8;
}

function planOrdinaryAttack(
  context: EnemyThreatContext,
  unit: BattleUnit,
  allowMove: boolean,
): AlliedAiAction | undefined {
  const occupied = new Set(
    context.units.filter((candidate) => candidate.id !== unit.id).map(positionKey),
  );
  const positions = (allowMove
    ? reachableCells(unit, context.units, undefined, context.battlefield)
    : [{ x: unit.x, y: unit.y }])
    .filter((position) => !occupied.has(positionKey(position)));
  const positionKeys = new Set(positions.map(positionKey));
  const offsets = [
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
  ];
  const candidates: Array<{
    target: BattleUnit;
    position: Position;
    path: Position[];
    lethal: boolean;
    positionDefense: number;
  }> = [];

  for (const target of context.units.filter((candidate) =>
    candidate.side === 1 && !candidate.actionDisabled)) {
    for (const offset of offsets) {
      const position = { x: target.x + offset.x, y: target.y + offset.y };
      if (!positionKeys.has(positionKey(position)) || occupied.has(positionKey(position))) continue;
      const path = positionKey(position) === positionKey(unit)
        ? [{ x: unit.x, y: unit.y }]
        : context.movementPath(unit.id, position);
      if (path.length === 0) continue;
      candidates.push({
        target,
        position,
        path,
        lethal: minimumOrdinaryDamage(context, unit, target) >= target.life,
        positionDefense: terrainDefensePercentFor(
          unit.classId,
          context.battlefield.terrainSlotAt(position),
        ),
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.lethal !== right.lethal) return left.lethal ? -1 : 1;
    if (left.target.life !== right.target.life) return left.target.life - right.target.life;
    if (left.path.length !== right.path.length) return left.path.length - right.path.length;
    if (left.positionDefense !== right.positionDefense) {
      return right.positionDefense - left.positionDefense;
    }
    const targetOrder = left.target.y * context.width + left.target.x
      - (right.target.y * context.width + right.target.x);
    if (targetOrder !== 0) return targetOrder;
    return left.position.y * context.width + left.position.x
      - (right.position.y * context.width + right.position.x);
  });
  const selected = candidates[0];
  return selected
    ? {
      unitId: unit.id,
      kind: "attack",
      path: selected.path,
      targetId: selected.target.id,
    }
    : undefined;
}

export function hasEnemyDamageActionThisTurn(
  context: EnemyThreatContext,
  id: string,
): boolean {
  const unit = context.unit(id);
  if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return false;
  if (
    unit.classId === "sister"
    && unit.statuses.techniqueSeal === 0
    && context.planSisterAction(unit, "fire-1")
  ) return true;
  if (classCombatRole(unit.classId) === "ranged") return false;
  return planOrdinaryAttack(context, unit, true) !== undefined;
}
