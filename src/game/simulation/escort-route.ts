import type { BattleUnit, Position } from "../types";
import { routePath, type GridBattlefield } from "./grid";

export interface EscortRouteWaypoint {
  actorCellAtLeast: number;
  goal: Position;
}

/** Evidence-backed route used by a protected independent ally. */
export interface EscortRouteDefinition {
  actorId: string;
  width: number;
  movement: number;
  waypoints: readonly EscortRouteWaypoint[];
  victoryMaximumCell: number;
}

export function assertEscortRouteDefinition(
  definition: EscortRouteDefinition,
  units: readonly BattleUnit[],
  battlefield: Pick<GridBattlefield, "width" | "height">,
): void {
  const actor = units.find(({ id }) => id === definition.actorId);
  if (!actor || actor.side !== 1) throw new Error(`Missing allied escort actor ${definition.actorId}`);
  if (definition.width !== battlefield.width
    || definition.width <= 0
    || definition.movement <= 0
    || definition.waypoints.length === 0) {
    throw new Error(`Invalid escort route ${definition.actorId}`);
  }
  for (const waypoint of definition.waypoints) {
    if (waypoint.goal.x < 0 || waypoint.goal.y < 0
      || waypoint.goal.x >= battlefield.width || waypoint.goal.y >= battlefield.height) {
      throw new Error(`Escort route ${definition.actorId} has an invalid waypoint`);
    }
  }
}

export function planEscortRoutePath(
  definition: EscortRouteDefinition,
  actor: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield,
): Position[] {
  const origin = { x: actor.x, y: actor.y };
  const actorCell = actor.y * definition.width + actor.x;
  if (actorCell <= definition.victoryMaximumCell) return [origin];
  const waypoint = definition.waypoints.find(({ actorCellAtLeast }) => actorCell >= actorCellAtLeast);
  if (!waypoint) return [origin];
  return routePath(actor, [waypoint.goal], units, definition.movement, battlefield);
}
