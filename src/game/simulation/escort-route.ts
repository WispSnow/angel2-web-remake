import type { CellBounds } from "../content/terrain";
import type { BattleUnit, Position } from "../types";
import {
  movementCost,
  movementCostsToNearestTarget,
  movementMap,
  positionKey,
  type GridBattlefield,
} from "./grid";

export interface EscortRouteWaypoint {
  /** Native behavior-12 goal cell of this leg. */
  goal: Position;
  /**
   * Inclusive cell rectangle. Standing anywhere inside it completes the leg and
   * hands the actor to the next waypoint. Legs are tested in order, and each
   * rectangle is a half-plane the intended route never leaves again, so the
   * test is stateless: nothing has to be remembered or saved.
   */
  completeWithin: CellBounds;
  /**
   * Evidence metadata only. The native code switched legs once the actor's
   * linear cell dropped below this value; `REMAKE-136` explains why the remake
   * switches by rectangle instead. The planner never reads it.
   */
  nativeCellAtLeast: number;
}

/** Evidence-backed route used by a protected independent ally. */
export interface EscortRouteDefinition {
  actorId: string;
  width: number;
  movement: number;
  waypoints: readonly EscortRouteWaypoint[];
  victoryMaximumCell: number;
}

const insideBounds = (position: Position, bounds: CellBounds): boolean =>
  position.x >= bounds.min.x
  && position.x <= bounds.max.x
  && position.y >= bounds.min.y
  && position.y <= bounds.max.y;

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
  const insideBattlefield = ({ x, y }: Position): boolean =>
    x >= 0 && y >= 0 && x < battlefield.width && y < battlefield.height;
  for (const { goal, completeWithin } of definition.waypoints) {
    if (!insideBattlefield(goal)) {
      throw new Error(`Escort route ${definition.actorId} has an invalid waypoint`);
    }
    if (!insideBattlefield(completeWithin.min)
      || !insideBattlefield(completeWithin.max)
      || completeWithin.min.x > completeWithin.max.x
      || completeWithin.min.y > completeWithin.max.y) {
      throw new Error(`Escort route ${definition.actorId} has an invalid leg rectangle`);
    }
    if (!insideBounds(goal, completeWithin)) {
      throw new Error(`Escort route ${definition.actorId} goal lies outside its leg rectangle`);
    }
  }
}

interface EscortLanding {
  path: Position[];
  remaining: number;
  arrival: boolean;
  cost: number;
}

/**
 * Native behavior 12 (`1000:1AF8`) first draws an ideal route to the current
 * goal that ignores every unit, then lands on the farthest route cell this
 * turn's real movement map can reach. The remake keeps that two-layer shape:
 * the ideal layer is the terrain-cost distance to the goal over an empty board,
 * and the actor moves to the legal landing that leaves the least of it. Cells
 * are never scored by Manhattan distance, so a mountain cell that happens to be
 * one row nearer the arrival line cannot pull her off the valley, and a unit on
 * the route only stops her (or lets her slip past within reach) instead of
 * rerouting her.
 *
 * Departures from the original are deliberate and recorded in `REMAKE-136`:
 * distances follow terrain cost instead of the terrain-blind mode-0 map, ties
 * break deterministically instead of by PIT residue, and legs complete inside
 * rectangles instead of below linear cell thresholds.
 */
export function planEscortRoutePath(
  definition: EscortRouteDefinition,
  actor: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield,
): Position[] {
  const origin = { x: actor.x, y: actor.y };
  const actorCell = actor.y * definition.width + actor.x;
  if (actorCell <= definition.victoryMaximumCell) return [origin];
  const leg = definition.waypoints.find(({ completeWithin }) => !insideBounds(actor, completeWithin));
  if (!leg) return [origin];

  const remaining = movementCostsToNearestTarget(actor, [leg.goal], [], battlefield);
  const remainingFromOrigin = remaining.get(positionKey(origin));
  if (remainingFromOrigin === undefined) return [origin];

  const reach = movementMap(actor, units, battlefield, definition.movement);
  let best: EscortLanding | undefined;
  for (const cell of reach.cells) {
    if (cell.x === origin.x && cell.y === origin.y) continue;
    const left = remaining.get(positionKey(cell));
    if (left === undefined) continue;
    // An arrival cell ends the stage, so it is progress even when the empty-board
    // distance says otherwise (an enemy parked on the goal makes the cell beside
    // it exactly as far). Anything else must shorten the route, or she waits.
    const arrival = cell.y * definition.width + cell.x <= definition.victoryMaximumCell;
    if (!arrival && left >= remainingFromOrigin) continue;
    const path = reach.pathTo(cell);
    if (path.length <= 1) continue;
    const candidate: EscortLanding = {
      path,
      remaining: left,
      arrival,
      cost: path.slice(1).reduce((sum, step) => sum + movementCost(actor.classId, step, battlefield), 0),
    };
    if (!best || landsBetter(candidate, best)) best = candidate;
  }
  return best?.path ?? [origin];
}

/** Least remaining route cost; then an arrival cell; then the cheaper walk. */
function landsBetter(candidate: EscortLanding, best: EscortLanding): boolean {
  if (candidate.remaining !== best.remaining) return candidate.remaining < best.remaining;
  if (candidate.arrival !== best.arrival) return candidate.arrival;
  return candidate.cost < best.cost;
}
