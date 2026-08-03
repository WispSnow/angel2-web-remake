import { BATTLE_ACTION_DEFINITIONS } from "../content/actions";
import { terrainDefensePercentFor } from "../content/classes";
import type { BattleUnit, Position, UnitStats } from "../types";
import type { AlliedAiAction, EnemyAiIntent } from "./battle";
import {
  neighbors,
  positionKey,
  reachableCells,
  routePath,
  type GridBattlefield,
} from "./grid";

type ModernIntent = Extract<EnemyAiIntent, "sentry" | "pursuit">;
type SisterActionId = "fire-1" | "heal-1";

export interface ModernEnemyAiContext {
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
  context: ModernEnemyAiContext,
  attacker: BattleUnit,
  defender: BattleUnit,
): number {
  const attackerStats = context.statsFor(attacker);
  const defenderStats = context.statsFor(defender);
  const terrainDefense = Math.floor(
    defenderStats.defense
    * terrainDefensePercentFor(
      defender.classId,
      context.battlefield.terrainSlotAt(defender),
    )
    / 100,
  );
  return Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense) + 8;
}

function planOrdinaryAttack(
  context: ModernEnemyAiContext,
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

  for (const target of context.units.filter((candidate) => candidate.side === 1)) {
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

function isGuaranteedOrdinaryKill(
  context: ModernEnemyAiContext,
  unit: BattleUnit,
  action: AlliedAiAction,
): boolean {
  const target = action.targetId ? context.unit(action.targetId) : undefined;
  return Boolean(target && minimumOrdinaryDamage(context, unit, target) >= target.life);
}

function isGuaranteedSpecialKill(
  context: ModernEnemyAiContext,
  action: AlliedAiAction,
): boolean {
  if (action.actionId !== "fire-1" || !action.targetId) return false;
  const target = context.unit(action.targetId);
  if (!target || target.statuses.magicGuard > 0) return false;
  const definition = BATTLE_ACTION_DEFINITIONS["fire-1"];
  const damage = Math.min(
    target.life,
    definition.damage.cap,
    Math.floor(context.statsFor(target).maxLife * definition.damage.maxLifePercent / 100),
  );
  return damage >= target.life;
}

function isCriticalHeal(
  context: ModernEnemyAiContext,
  action: AlliedAiAction,
): boolean {
  if (action.actionId !== "heal-1" || !action.targetId) return false;
  const target = context.unit(action.targetId);
  return Boolean(target && target.life * 100 < context.statsFor(target).maxLife * 40);
}

export function planModernEnemyAction(
  context: ModernEnemyAiContext,
  id: string,
  intent: ModernIntent,
): AlliedAiAction | undefined {
  const unit = context.unit(id);
  if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
  const allowMove = intent === "pursuit";
  const fire = unit.classId === "sister" && unit.statuses.techniqueSeal === 0
    ? context.planSisterAction(unit, "fire-1")
    : undefined;
  const heal = unit.classId === "sister" && unit.statuses.techniqueSeal === 0
    ? context.planSisterAction(unit, "heal-1")
    : undefined;
  const ordinary = planOrdinaryAttack(context, unit, allowMove);

  if (fire && isGuaranteedSpecialKill(context, fire)) return fire;
  if (ordinary && isGuaranteedOrdinaryKill(context, unit, ordinary)) return ordinary;
  if (heal && isCriticalHeal(context, heal)) return heal;

  const stats = context.statsFor(unit);
  if (unit.life * 100 < stats.maxLife * 40) {
    return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
  }

  if (fire) return fire;
  if (ordinary) return ordinary;
  if (heal) return heal;
  if (intent === "sentry") {
    return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  const pursuitTargets = context.units
    .filter((candidate) => candidate.side === 1)
    .flatMap((enemy) => neighbors(enemy, context.battlefield));
  const pursuitPath = routePath(
    unit,
    pursuitTargets,
    context.units,
    stats.movement,
    context.battlefield,
  );
  if (pursuitPath.length > 1) return { unitId: unit.id, kind: "move", path: pursuitPath };
  return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
}

export function hasModernDamageActionThisTurn(
  context: ModernEnemyAiContext,
  id: string,
): boolean {
  const unit = context.unit(id);
  if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return false;
  if (
    unit.classId === "sister"
    && unit.statuses.techniqueSeal === 0
    && context.planSisterAction(unit, "fire-1")
  ) return true;
  return planOrdinaryAttack(context, unit, true) !== undefined;
}
