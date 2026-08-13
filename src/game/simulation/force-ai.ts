import type { BattleActionId } from "./actions/types";
import type {
  AlliedAiAction,
  ClassActionPlanningOptions,
  OrdinaryAiPlanningOptions,
} from "./ai-contracts";
import type { TerrainHoldForceAiDoctrine } from "./forces";
import type { ForceRegistry } from "./forces";
import { classCombatRole } from "../content/classes";
import {
  manhattan,
  positionKey,
  shortestPath,
  type GridBattlefield,
} from "./grid";
import type { BattleUnit, Position, UnitStats } from "../types";

export interface ForceAiPlanningContext {
  width: number;
  battlefield: GridBattlefield;
  units: readonly BattleUnit[];
  forces: ForceRegistry;
  statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => UnitStats;
  reachableCells: (unitId: string) => Position[];
  movementPath: (unitId: string, destination: Position) => Position[];
  alliedBehaviorFor: (unitId: string) => number;
  enemyBehaviorFor: (unitId: string) => number;
  planClassAction: (
    unit: BattleUnit,
    requestedActionIds?: readonly BattleActionId[],
    options?: ClassActionPlanningOptions,
  ) => AlliedAiAction | undefined;
  planOrdinaryAction: (
    unit: BattleUnit,
    opponentSide: BattleUnit["side"],
    behavior: number,
    options?: OrdinaryAiPlanningOptions,
  ) => AlliedAiAction;
  expertScore?: (unit: BattleUnit, action: AlliedAiAction) => number;
}

export function planTerrainHoldForceAiAction(
  context: ForceAiPlanningContext,
  unit: BattleUnit,
  doctrine: TerrainHoldForceAiDoctrine,
): AlliedAiAction {
  const allowedTerrainSlots = new Set(doctrine.allowedTerrainSlots);
  const isAllowedPosition = (position: Position): boolean =>
    allowedTerrainSlots.has(context.battlefield.terrainSlotAt(position));

  if (!isAllowedPosition(unit)) {
    const entryTerrainSlots = new Set(doctrine.entryTerrainSlots);
    const candidates = context.reachableCells(unit.id)
      .filter((position) => entryTerrainSlots.has(context.battlefield.terrainSlotAt(position)))
      .map((position) => ({ position, path: context.movementPath(unit.id, position) }))
      .filter(({ path }) => path.length > 1)
      .sort((left, right) => left.path.length - right.path.length
        || left.position.y * context.width + left.position.x
          - (right.position.y * context.width + right.position.x));
    const selected = candidates[0];
    return selected
      ? { unitId: unit.id, kind: "move", path: selected.path }
      : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  const forceMembers = context.forces.membersForUnit(unit.id, context.units);
  const forceMemberIds = new Set(forceMembers.map(({ id }) => id));
  const healingActions = doctrine.priorityHealingActionsByClass?.[unit.classId];
  if (healingActions && unit.statuses.techniqueSeal === 0) {
    const criticalHeal = context.planClassAction(unit, healingActions, {
      expertRanking: unit.side === 2,
      modernRanking: unit.side === 1,
      targetFilter: (target) => forceMemberIds.has(target.id)
        && target.life * 100
          < context.statsFor(target).maxLife * doctrine.criticalHealThresholdPercent,
    });
    if (criticalHeal) return criticalHeal;
    const recoveryHeal = context.planClassAction(unit, healingActions, {
      expertRanking: unit.side === 2,
      modernRanking: unit.side === 1,
      targetFilter: (target) => forceMemberIds.has(target.id),
    });
    if (recoveryHeal) return recoveryHeal;
  }

  if (unit.life * 100 < context.statsFor(unit).maxLife * doctrine.restThresholdPercent) {
    return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
  }

  const behavior = unit.side === 1
    ? context.alliedBehaviorFor(unit.id)
    : context.enemyBehaviorFor(unit.id);
  if (doctrine.preserveNativeFormation && behavior >= 4 && behavior % 2 === 0) {
    const automaticLeader = forceMembers.find((candidate) => {
      const candidateBehavior = candidate.side === 1
        ? context.alliedBehaviorFor(candidate.id)
        : context.enemyBehaviorFor(candidate.id);
      return candidateBehavior === behavior - 1;
    });
    if (automaticLeader && automaticLeader.id !== unit.id) {
      const directPath = shortestPath(
        unit,
        automaticLeader,
        unit.classId,
        context.statsFor(unit).movement,
        context.units.filter((candidate) => candidate.id !== unit.id),
        context.battlefield,
      );
      if (directPath.length === 0) {
        const distanceBefore = manhattan(unit, automaticLeader);
        const candidates = context.reachableCells(unit.id)
          .filter(isAllowedPosition)
          .map((position) => ({
            position,
            path: positionKey(position) === positionKey(unit)
              ? [{ x: unit.x, y: unit.y }]
              : context.movementPath(unit.id, position),
            distance: manhattan(position, automaticLeader),
          }))
          .filter(({ path, distance }) => path.length > 1
            && distance < distanceBefore
            && path.every(isAllowedPosition))
          .sort((left, right) => left.distance - right.distance
            || right.path.length - left.path.length
            || left.position.y * context.width + left.position.x
              - (right.position.y * context.width + right.position.x));
        const selected = candidates[0];
        if (selected) return { unitId: unit.id, kind: "move", path: selected.path };
      }
    }
  }

  const targetFilter = context.forces.targetFilterFor(unit.id, context.units);
  const positionAndPathOptions = {
    positionFilter: isAllowedPosition,
    pathFilter: (path: readonly Position[]) => path.every(isAllowedPosition),
  };
  const classAction = context.planClassAction(unit, undefined, {
    ...positionAndPathOptions,
    targetFilter: (target) => target.side === unit.side
      ? forceMemberIds.has(target.id)
      : (targetFilter?.(target) ?? true),
  });

  // REMAKE-066: ranged careers keep the defensive doctrine and never turn a
  // failed shot/technique into an ordinary melee hit.
  if (classCombatRole(unit.classId) === "ranged") {
    return classAction
      ?? { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  const opponentSide: BattleUnit["side"] = unit.side === 1 ? 2 : 1;
  const ordinaryAction = context.planOrdinaryAction(unit, opponentSide, behavior, {
    destinationFilter: positionAndPathOptions.positionFilter,
    pathFilter: positionAndPathOptions.pathFilter,
    restThresholdPercent: doctrine.restThresholdPercent,
    targetFilter,
  });
  if (!classAction) return ordinaryAction;
  if (unit.side === 2 && context.expertScore) {
    return context.expertScore(unit, classAction) >= context.expertScore(unit, ordinaryAction)
      ? classAction
      : ordinaryAction;
  }
  return classAction;
}
