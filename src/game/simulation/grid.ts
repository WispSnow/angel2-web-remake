import { classStatsFor, movementRulesFor } from "../content/classes";
import { STAGE0, terrainSlotAt } from "../content/stage0";
import type { BattleUnit, Position, UnitClassId } from "../types";

export interface GridBattlefield {
  width: number;
  height: number;
  terrainSlotAt: (position: Position) => number;
}

export interface MovementCostTargetOptions {
  positionFilter?: (position: Position) => boolean;
  /**
   * Permits a same-side occupant to seed a virtual target cost. The occupied
   * cell remains an illegal movement destination; this is only used to build
   * a deterministic queue behind a temporarily full melee frontage.
   */
  allowFriendlyOccupiedTargets?: boolean;
}

const STAGE0_BATTLEFIELD: GridBattlefield = {
  width: STAGE0.width,
  height: STAGE0.height,
  terrainSlotAt,
};

export const positionKey = ({ x, y }: Position): string => `${x},${y}`;
export const manhattan = (left: Position, right: Position): number => Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

export function neighbors(
  position: Position,
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ].filter(({ x, y }) => x >= 0 && y >= 0 && x < battlefield.width && y < battlefield.height);
}

export function movementCost(
  classId: UnitClassId,
  position: Position,
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): number {
  return movementRulesFor(classId)[battlefield.terrainSlotAt(position)] ?? 99;
}

interface SearchResult {
  costs: Map<string, number>;
  previous: Map<string, string>;
}

/**
 * One native movement propagation shared by range display and every path
 * reconstruction for the same actor/state. Reconstructing another destination
 * is read-only and does not repeat the grid search.
 */
export interface MovementMap {
  readonly cells: readonly Position[];
  pathTo: (destination: Position) => Position[];
  /**
   * Whether the propagation reached this cell at all, including cells only a
   * same-side unit stands on. `cells` lists legal landings; the native range
   * map also assigns a value to friendly transit cells, and the paired
   * leader/follower test asks exactly that question.
   */
  reaches: (position: Position) => boolean;
}

type Direction = Readonly<Position>;

// Behavior 12's native path builder rotates between three PIT-selected
// direction tables. Stable-remake uses residue 0 so equal-cost routes remain
// deterministic and preserve one of the original tables (-50,-1,+50,+1).
const STABLE_NATIVE_ROUTE_DIRECTIONS: readonly Direction[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

const NATIVE_CONSTRUCTION_DIRECTIONS: readonly Direction[] = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

function directedNeighbors(
  position: Position,
  battlefield: GridBattlefield,
  directions?: readonly Direction[],
): Position[] {
  if (!directions) return neighbors(position, battlefield);
  return directions
    .map(({ x, y }) => ({ x: position.x + x, y: position.y + y }))
    .filter(({ x, y }) => x >= 0 && y >= 0 && x < battlefield.width && y < battlefield.height);
}

function search(
  start: Position,
  classId: UnitClassId,
  budget: number,
  blocked: ReadonlySet<string>,
  stopAfterEntering: ReadonlySet<string> = new Set(),
  directions?: readonly Direction[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): SearchResult {
  const costs = new Map<string, number>([[positionKey(start), 0]]);
  const previous = new Map<string, string>();
  const pending: Array<{ position: Position; cost: number }> = [{ position: start, cost: 0 }];
  const startKey = positionKey(start);

  while (pending.length > 0) {
    pending.sort((a, b) => a.cost - b.cost);
    const current = pending.shift();
    if (!current) continue;
    const currentKey = positionKey(current.position);
    if (current.cost !== costs.get(currentKey)) continue;
    // Any controlled cell entered during this move is terminal and cannot be
    // used to reach cells beyond it. The origin never terminates the search: a
    // unit that begins its move inside an opposing control zone may still leave
    // it. `zoneOfControl` already excludes every occupied cell, so this only
    // guards callers that build `stopAfterEntering` some other way.
    if (currentKey !== startKey && stopAfterEntering.has(currentKey)) continue;

    for (const next of directedNeighbors(current.position, battlefield, directions)) {
      const key = positionKey(next);
      const step = movementCost(classId, next, battlefield);
      if (step >= 98 || (blocked.has(key) && key !== positionKey(start))) continue;
      const cost = current.cost + step;
      // The native range map stores the movement value at the origin and only
      // propagates a strictly positive remainder. A path is therefore legal
      // only when its accumulated entry cost is strictly below the stat.
      if (cost >= budget || cost >= (costs.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(key, cost);
      previous.set(key, positionKey(current.position));
      pending.push({ position: next, cost });
    }
  }
  return { costs, previous };
}

export function reachableCells(
  unit: BattleUnit,
  units: readonly BattleUnit[],
  movementBudget = unitStatsMovement(unit),
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  return movementMap(unit, units, battlefield, movementBudget).cells.map((position) => ({
    ...position,
  }));
}

export function movementMap(
  unit: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
  movementBudget = unitStatsMovement(unit),
): MovementMap {
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(
    unit,
    unit.classId,
    movementBudget,
    blocked,
    zoneOfControl(unit, units, battlefield),
    undefined,
    battlefield,
  );
  const originKey = positionKey(unit);
  const cells = [...result.costs.keys()]
    .filter((key) => key === originKey || !occupied.has(key))
    .map(parsePositionKey);
  return {
    cells,
    pathTo: (destination) => occupied.has(positionKey(destination))
      ? []
      : reconstructPath(unit, destination, result),
    reaches: (position) => result.costs.has(positionKey(position)),
  };
}

/**
 * The `FFh` reservation of `1000:3E3B`, shared by every propagation mode that
 * reads the side map (`M/A/Y/FM/FA/FY/CM/CY`).
 *
 * The reservation loop reads the side-map byte first and only reserves a
 * neighbour whose byte is 0. An occupied neighbour therefore stays an ordinary
 * cell, and because `M/A/Y` propagate through own-side cells, a unit standing
 * beside its opponent opens a traversable gap in the control zone: the original
 * walks straight through the ally, charges that cell's terrain cost and keeps
 * going. The gap is transit only — the cell is still an illegal landing, kept so
 * by `blocked` for opposing occupants and by the `occupied` filter for own-side
 * ones.
 *
 * The native loop also skips neighbours whose movement rule is 98/99. That half
 * needs no filter here: propagation already refuses to enter those cells, so
 * reserving them would be unobservable.
 */
export function zoneOfControl(
  unit: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): ReadonlySet<string> {
  const occupied = new Set(units.map(positionKey));
  const controlled = new Set<string>();
  for (const opponent of units) {
    if (opponent.side === unit.side) continue;
    for (const position of neighbors(opponent, battlefield)) {
      const key = positionKey(position);
      if (occupied.has(key)) continue;
      controlled.add(key);
    }
  }
  return controlled;
}

function unitStatsMovement(unit: BattleUnit): number {
  return classStatsFor(unit).movement;
}

export function shortestPath(
  start: Position,
  target: Position,
  classId: UnitClassId,
  budget: number,
  units: readonly BattleUnit[] = [],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  const targetKey = positionKey(target);
  const blocked = new Set(units.filter((unit) => positionKey(unit) !== targetKey).map(positionKey));
  const result = search(start, classId, budget, blocked, new Set(), undefined, battlefield);
  return reconstructPath(start, target, result);
}

export function movementPath(
  unit: BattleUnit,
  destination: Position,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
  movementBudget = unitStatsMovement(unit),
): Position[] {
  return movementMap(unit, units, battlefield, movementBudget).pathTo(destination);
}

/** Module 29 mode M: friendly cells are transit-only, enemies block, and no ZOC is applied. */
export function constructionReachableCells(
  unit: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(
    unit,
    unit.classId,
    5,
    blocked,
    new Set(),
    NATIVE_CONSTRUCTION_DIRECTIONS,
    battlefield,
  );
  const originKey = positionKey(unit);
  return [...result.costs.keys()]
    .filter((key) => key !== originKey && !occupied.has(key))
    .map(parsePositionKey);
}

export function constructionPath(
  unit: BattleUnit,
  destination: Position,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  if (occupied.has(positionKey(destination))) return [];
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(
    unit,
    unit.classId,
    5,
    blocked,
    new Set(),
    NATIVE_CONSTRUCTION_DIRECTIONS,
    battlefield,
  );
  return reconstructPath(unit, destination, result);
}

export function routePath(
  unit: BattleUnit,
  targets: readonly Position[],
  units: readonly BattleUnit[],
  movementBudget = 5,
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position[] {
  if (targets.length === 0) return [{ x: unit.x, y: unit.y }];
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const routeResult = search(
    unit,
    unit.classId,
    movementBudget,
    blocked,
    zoneOfControl(unit, units, battlefield),
    STABLE_NATIVE_ROUTE_DIRECTIONS,
    battlefield,
  );
  const reachableExits = targets
    .filter((target) => routeResult.costs.has(positionKey(target)) && !occupied.has(positionKey(target)))
    .sort((left, right) => (routeResult.costs.get(positionKey(left)) ?? 0) - (routeResult.costs.get(positionKey(right)) ?? 0));
  if (reachableExits[0]) return reconstructPath(unit, reachableExits[0], routeResult);

  let best: Position = { x: unit.x, y: unit.y };
  let bestDistance = distanceToNearest(best, targets);
  let bestCost = 0;
  for (const [key, cost] of routeResult.costs) {
    if (occupied.has(key)) continue;
    const position = parsePositionKey(key);
    const distance = distanceToNearest(position, targets);
    if (distance < bestDistance || (distance === bestDistance && cost > bestCost)) {
      best = position;
      bestDistance = distance;
      bestCost = cost;
    }
  }
  return reconstructPath(unit, best, routeResult);
}

/**
 * Maps every traversable cell to the cheapest forward entry cost needed to
 * reach any legal target. Reverse propagation adds the cost of entering the
 * current cell, which preserves the asymmetric native terrain-cost rule.
 */
export function movementCostsToNearestTarget(
  unit: BattleUnit,
  targets: readonly Position[],
  units: readonly BattleUnit[],
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
  options: MovementCostTargetOptions = {},
): ReadonlyMap<string, number> {
  const occupants = new Map(units
    .filter((candidate) => candidate.id !== unit.id)
    .map((candidate) => [positionKey(candidate), candidate]));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const targetKeys = new Set(targets
    .filter((target) => target.x >= 0
      && target.y >= 0
      && target.x < battlefield.width
      && target.y < battlefield.height
      && (!occupants.has(positionKey(target))
        || (options.allowFriendlyOccupiedTargets
          && occupants.get(positionKey(target))?.side === unit.side))
      && movementCost(unit.classId, target, battlefield) < 98
      && (options.positionFilter?.(target) ?? true))
    .map(positionKey));
  const costs = new Map<string, number>([...targetKeys].map((key) => [key, 0]));
  const pending = [...targetKeys].map((key) => ({ position: parsePositionKey(key), cost: 0 }));
  const controlZone = zoneOfControl(unit, units, battlefield);
  const startKey = positionKey(unit);

  while (pending.length > 0) {
    pending.sort((left, right) => left.cost - right.cost
      || left.position.y * battlefield.width + left.position.x
        - (right.position.y * battlefield.width + right.position.x));
    const current = pending.shift();
    if (!current) continue;
    const currentKey = positionKey(current.position);
    if (current.cost !== costs.get(currentKey)) continue;
    const reverseStepCost = movementCost(unit.classId, current.position, battlefield);

    for (const predecessor of neighbors(current.position, battlefield)) {
      const key = positionKey(predecessor);
      if (blocked.has(key)
        || movementCost(unit.classId, predecessor, battlefield) >= 98
        || !(options.positionFilter?.(predecessor) ?? true)
        || (controlZone.has(key) && !targetKeys.has(key) && key !== startKey)) continue;
      const cost = current.cost + reverseStepCost;
      if (cost >= (costs.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(key, cost);
      pending.push({ position: predecessor, cost });
    }
  }
  return costs;
}

export function routeStep(
  unit: BattleUnit,
  target: Position,
  units: readonly BattleUnit[],
  movementBudget = 5,
  battlefield: GridBattlefield = STAGE0_BATTLEFIELD,
): Position {
  return routePath(unit, [target], units, movementBudget, battlefield).at(-1) ?? { x: unit.x, y: unit.y };
}

function reconstructPath(start: Position, target: Position, result: SearchResult): Position[] {
  const targetKey = positionKey(target);
  if (!result.costs.has(targetKey)) return [];
  const path: Position[] = [{ x: target.x, y: target.y }];
  let cursor = targetKey;
  while (cursor !== positionKey(start)) {
    const prior = result.previous.get(cursor);
    if (!prior) return [];
    path.push(parsePositionKey(prior));
    cursor = prior;
  }
  return path.reverse();
}

function distanceToNearest(position: Position, targets: readonly Position[]): number {
  return Math.min(...targets.map((target) => manhattan(position, target)));
}

function parsePositionKey(key: string): Position {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}
