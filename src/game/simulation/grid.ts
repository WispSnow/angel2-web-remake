import { MOVEMENT_RULES, STAGE0, statsFor, terrainSlotAt } from "../content/stage0";
import type { BattleUnit, Position, UnitClassId } from "../types";

export const positionKey = ({ x, y }: Position): string => `${x},${y}`;
export const manhattan = (left: Position, right: Position): number => Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

export function neighbors(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ].filter(({ x, y }) => x >= 0 && y >= 0 && x < STAGE0.width && y < STAGE0.height);
}

export function movementCost(classId: UnitClassId, position: Position): number {
  return MOVEMENT_RULES[classId][terrainSlotAt(position)] ?? 99;
}

interface SearchResult {
  costs: Map<string, number>;
  previous: Map<string, string>;
}

function search(
  start: Position,
  classId: UnitClassId,
  budget: number,
  blocked: ReadonlySet<string>,
  stopAfterEntering: ReadonlySet<string> = new Set(),
): SearchResult {
  const costs = new Map<string, number>([[positionKey(start), 0]]);
  const previous = new Map<string, string>();
  const pending: Array<{ position: Position; cost: number }> = [{ position: start, cost: 0 }];

  while (pending.length > 0) {
    pending.sort((a, b) => a.cost - b.cost);
    const current = pending.shift();
    if (!current) continue;
    const currentKey = positionKey(current.position);
    if (current.cost !== costs.get(currentKey)) continue;
    if (stopAfterEntering.has(currentKey)) continue;

    for (const next of neighbors(current.position)) {
      const key = positionKey(next);
      const step = movementCost(classId, next);
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

export function reachableCells(unit: BattleUnit, units: readonly BattleUnit[]): Position[] {
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(
    unit,
    unit.classId,
    unitStatsMovement(unit),
    blocked,
    zoneOfControl(unit, units),
  );
  const originKey = positionKey(unit);
  return [...result.costs.keys()]
    .filter((key) => key === originKey || !occupied.has(key))
    .map(parsePositionKey);
}

export function zoneOfControl(unit: BattleUnit, units: readonly BattleUnit[]): ReadonlySet<string> {
  const controlled = new Set<string>();
  for (const opponent of units) {
    if (opponent.side === unit.side) continue;
    for (const position of neighbors(opponent)) controlled.add(positionKey(position));
  }
  return controlled;
}

function unitStatsMovement(unit: BattleUnit): number {
  return statsFor(unit).movement;
}

export function shortestPath(
  start: Position,
  target: Position,
  classId: UnitClassId,
  budget: number,
  units: readonly BattleUnit[] = [],
): Position[] {
  const targetKey = positionKey(target);
  const blocked = new Set(units.filter((unit) => positionKey(unit) !== targetKey).map(positionKey));
  const result = search(start, classId, budget, blocked);
  return reconstructPath(start, target, result);
}

export function movementPath(
  unit: BattleUnit,
  destination: Position,
  units: readonly BattleUnit[],
): Position[] {
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  if (occupied.has(positionKey(destination))) return [];
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(unit, unit.classId, unitStatsMovement(unit), blocked, zoneOfControl(unit, units));
  return reconstructPath(unit, destination, result);
}

export function routePath(
  unit: BattleUnit,
  targets: readonly Position[],
  units: readonly BattleUnit[],
  movementBudget = 5,
): Position[] {
  if (targets.length === 0) return [{ x: unit.x, y: unit.y }];
  const occupied = new Set(units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
  const blocked = new Set(
    units
      .filter((candidate) => candidate.id !== unit.id && candidate.side !== unit.side)
      .map(positionKey),
  );
  const result = search(unit, unit.classId, movementBudget, blocked, zoneOfControl(unit, units));
  const reachableExits = targets
    .filter((target) => result.costs.has(positionKey(target)) && !occupied.has(positionKey(target)))
    .sort((left, right) => (result.costs.get(positionKey(left)) ?? 0) - (result.costs.get(positionKey(right)) ?? 0));
  if (reachableExits[0]) return reconstructPath(unit, reachableExits[0], result);

  let best: Position = { x: unit.x, y: unit.y };
  let bestDistance = distanceToNearest(best, targets);
  let bestCost = 0;
  for (const [key, cost] of result.costs) {
    if (occupied.has(key)) continue;
    const position = parsePositionKey(key);
    const distance = distanceToNearest(position, targets);
    if (distance < bestDistance || (distance === bestDistance && cost > bestCost)) {
      best = position;
      bestDistance = distance;
      bestCost = cost;
    }
  }
  return reconstructPath(unit, best, result);
}

export function routeStep(
  unit: BattleUnit,
  target: Position,
  units: readonly BattleUnit[],
  movementBudget = 5,
): Position {
  return routePath(unit, [target], units, movementBudget).at(-1) ?? { x: unit.x, y: unit.y };
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
