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
  movementMap,
  positionKey,
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
  compareExpertActions?: (
    unit: BattleUnit,
    left: AlliedAiAction,
    right: AlliedAiAction,
  ) => number;
}

/**
 * One step closer to a squadmate without leaving the doctrine: the same ranking
 * serves the native leader/follower branch and the `REMAKE-111` rally, so the
 * two rules can never pull the same unit in opposite directions.
 */
function planCloseOnAlly(
  context: ForceAiPlanningContext,
  unit: BattleUnit,
  destinationAlly: BattleUnit,
  isAllowedPosition: (position: Position) => boolean,
): AlliedAiAction | undefined {
  if (destinationAlly.id === unit.id) return undefined;
  const distanceBefore = manhattan(unit, destinationAlly);
  const candidates = context.reachableCells(unit.id)
    .filter(isAllowedPosition)
    .map((position) => ({
      position,
      path: positionKey(position) === positionKey(unit)
        ? [{ x: unit.x, y: unit.y }]
        : context.movementPath(unit.id, position),
      distance: manhattan(position, destinationAlly),
    }))
    .filter(({ path, distance }) => path.length > 1
      && distance < distanceBefore
      && path.every(isAllowedPosition))
    .sort((left, right) => left.distance - right.distance
      || right.path.length - left.path.length
      || left.position.y * context.width + left.position.x
        - (right.position.y * context.width + right.position.x));
  const selected = candidates[0];
  return selected ? { unitId: unit.id, kind: "move", path: selected.path } : undefined;
}

export function planTerrainHoldForceAiAction(
  context: ForceAiPlanningContext,
  unit: BattleUnit,
  doctrine: TerrainHoldForceAiDoctrine,
): AlliedAiAction {
  const allowedTerrainSlots = new Set(doctrine.allowedTerrainSlots);
  const isAllowedPosition = (position: Position): boolean =>
    allowedTerrainSlots.has(context.battlefield.terrainSlotAt(position));
  const holdPosition = (): AlliedAiAction =>
    ({ unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] });

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
      : holdPosition();
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

  // A fallen rally unit is already a lost stage, but the planner still has to
  // answer for the units that outlive it, so the rally simply drops out.
  const rally = doctrine.rally;
  const rallyUnit = rally
    ? context.units.find(({ id }) => id === rally.unitId)
    : undefined;
  const rallyMove = (): AlliedAiAction | undefined => rallyUnit
    && planCloseOnAlly(context, unit, rallyUnit, isAllowedPosition);
  /**
   * REMAKE-111. A melee member that never opens an attack has nothing else to
   * spend the round on, so any wound is worth resting off — the doctrine's
   * half-life boundary only still governs the careers that do act.
   */
  const holdsFire = rally?.meleeHoldsFire === true
    && classCombatRole(unit.classId) === "melee";
  const restThresholdPercent = holdsFire ? 100 : doctrine.restThresholdPercent;
  if (unit.life * 100 < context.statsFor(unit).maxLife * restThresholdPercent) {
    return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
  }

  // Whole again, and still not attacking: close on the member this force may
  // not lose. Native formation order is a special case of the same intent, so
  // holding fire skips it rather than ranking the two against each other.
  if (holdsFire) return rallyMove() ?? holdPosition();

  const behavior = unit.side === 1
    ? context.alliedBehaviorFor(unit.id)
    : context.enemyBehaviorFor(unit.id);
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
  /**
   * REMAKE-091. The native follower branch exists to bring a straggler back to
   * its leader — `nearLeader` is phrased as "do not spend the action here".
   * Spending it while the follower already has a shot, technique or adjacent
   * target inverts that intent: on stage 3 the fourth corps stands on forest,
   * where a movement-6 archer reaches exactly one cell, so its leader read as
   * far almost every round and it shuffled instead of ever firing.
   */
  const hasImmediateAction = classAction !== undefined
    || context.units.some((candidate) => candidate.side !== unit.side
      && !candidate.actionDisabled
      && (targetFilter?.(candidate) ?? true)
      && manhattan(unit, candidate) === 1);
  if (!hasImmediateAction
    && doctrine.preserveNativeFormation
    && behavior >= 4
    && behavior % 2 === 0) {
    const automaticLeader = forceMembers.find((candidate) => {
      const candidateBehavior = candidate.side === 1
        ? context.alliedBehaviorFor(candidate.id)
        : context.enemyBehaviorFor(candidate.id);
      return candidateBehavior === behavior - 1;
    });
    if (automaticLeader && automaticLeader.id !== unit.id) {
      // The native test is whether the leader is "already present in the
      // follower's normal movement map" — mode `A`, where same-side units are
      // transit, not walls. `shortestPath` blocks every ally instead, so in a
      // packed formation one squadmate standing between the pair made a leader
      // two cells away read as unreachable and the follower shuffled forward
      // with a legal shot in hand.
      const normalMovementMap = movementMap(
        unit,
        context.units,
        context.battlefield,
        context.statsFor(unit).movement,
      );
      if (!normalMovementMap.reaches(automaticLeader)) {
        const follow = planCloseOnAlly(context, unit, automaticLeader, isAllowedPosition);
        if (follow) return follow;
      }
    }
  }

  // REMAKE-066: ranged careers keep the defensive doctrine and never turn a
  // failed shot/technique into an ordinary melee hit. REMAKE-111 spends the
  // round that leaves on the rally instead of standing still, but only after
  // every action that actually pays off has been ruled out.
  if (classCombatRole(unit.classId) === "ranged") {
    return classAction ?? rallyMove() ?? holdPosition();
  }

  const opponentSide: BattleUnit["side"] = unit.side === 1 ? 2 : 1;
  const ordinaryAction = context.planOrdinaryAction(unit, opponentSide, behavior, {
    destinationFilter: positionAndPathOptions.positionFilter,
    pathFilter: positionAndPathOptions.pathFilter,
    restThresholdPercent: doctrine.restThresholdPercent,
    targetFilter,
  });
  if (!classAction) return ordinaryAction;
  if (unit.side === 2 && context.compareExpertActions) {
    return context.compareExpertActions(unit, classAction, ordinaryAction) <= 0
      ? classAction
      : ordinaryAction;
  }
  return classAction;
}
