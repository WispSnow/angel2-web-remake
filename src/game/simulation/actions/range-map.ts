import { movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position } from "../../types";

export interface ActionBattlefield {
  width: number;
  height: number;
  terrainSlotAt: (position: Position) => number;
}

export interface ActionViewport {
  readonly origin: Position;
  readonly width: number;
  readonly height: number;
}

export class NumericRangeMap {
  readonly values: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.values = new Uint8Array(width * height);
  }

  contains(position: Position): boolean {
    return position.x >= 0
      && position.y >= 0
      && position.x < this.width
      && position.y < this.height;
  }

  valueAt(position: Position): number {
    if (!this.contains(position)) return 0;
    return this.values[position.y * this.width + position.x] ?? 0;
  }

  set(position: Position, value: number): void {
    if (!this.contains(position)) return;
    this.values[position.y * this.width + position.x] = Math.max(0, Math.min(255, value));
  }

  cells(): Position[] {
    const result: Position[] = [];
    for (let index = 0; index < this.values.length; index += 1) {
      if (this.values[index] === 0) continue;
      result.push({ x: index % this.width, y: Math.floor(index / this.width) });
    }
    return result;
  }
}

export function fullMapRange(width: number, height: number): NumericRangeMap {
  const result = new NumericRangeMap(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) result.set({ x, y }, 1);
  }
  return result;
}

const OFFSETS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const;

const copyPosition = ({ x, y }: Position): Position => ({ x, y });

function buildUniformRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  seed: number,
  blocks: (movementRule: number) => boolean,
): NumericRangeMap {
  const result = new NumericRangeMap(battlefield.width, battlefield.height);
  const pending: Position[] = [{ x: actor.x, y: actor.y }];
  result.set(actor, seed);
  const movementRules = movementRulesFor(actor.classId);

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;
    const nextValue = result.valueAt(current) - 1;
    if (nextValue <= 0) continue;
    for (const offset of OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      if (!result.contains(next)) continue;
      const movementRule = movementRules[battlefield.terrainSlotAt(next)] ?? 99;
      if (blocks(movementRule) || result.valueAt(next) >= nextValue) continue;
      result.set(next, nextValue);
      pending.push(next);
    }
  }
  return result;
}

export function shootingRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): NumericRangeMap {
  const result = buildUniformRange(
    actor,
    battlefield,
    nativeSeed,
    (movementRule) => movementRule === 0 || movementRule === 99,
  );
  result.set(actor, 0);
  for (const offset of OFFSETS) {
    result.set({ x: actor.x + offset.x, y: actor.y + offset.y }, 0);
  }
  return result;
}

export function archerShootingRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
): NumericRangeMap {
  return shootingRange(actor, battlefield, 5);
}

export function shootingLinePath(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  target: Position,
  battlefield: ActionBattlefield,
  nativeSeed: number,
  choosePredecessor: (candidateCount: number) => number = () => 0,
): Position[] {
  const gradient = buildUniformRange(
    actor,
    battlefield,
    nativeSeed,
    (movementRule) => movementRule === 0 || movementRule === 99,
  );
  if (gradient.valueAt(target) === 0) return [];

  const reversed = [copyPosition(target)];
  let current = copyPosition(target);
  while (current.x !== actor.x || current.y !== actor.y) {
    const nextValue = gradient.valueAt(current) + 1;
    const candidates = OFFSETS
      .map((offset) => ({ x: current.x + offset.x, y: current.y + offset.y }))
      .filter((position) => gradient.valueAt(position) === nextValue);
    if (candidates.length === 0) return [];
    const selected = candidates[Math.max(0, Math.min(
      candidates.length - 1,
      choosePredecessor(candidates.length),
    ))];
    if (!selected) return [];
    current = selected;
    reversed.push(copyPosition(current));
  }
  return reversed.reverse();
}

/**
 * Returns the probability that the native uniformly selected predecessor walk
 * visits each line cell. This evaluates every legal line without reading the
 * gameplay PRNG and is used only by deterministic AI estimates.
 */
export function shootingLineVisitProbabilities(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  target: Position,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): ReadonlyMap<string, number> {
  const gradient = buildUniformRange(
    actor,
    battlefield,
    nativeSeed,
    (movementRule) => movementRule === 0 || movementRule === 99,
  );
  if (gradient.valueAt(target) === 0) return new Map();

  const probabilities = new Map<string, number>();
  let frontier = new Map<string, { position: Position; probability: number }>([[
    `${target.x},${target.y}`,
    { position: copyPosition(target), probability: 1 },
  ]]);
  probabilities.set(`${target.x},${target.y}`, 1);

  while (frontier.size > 0) {
    const nextFrontier = new Map<string, { position: Position; probability: number }>();
    for (const { position, probability } of frontier.values()) {
      if (position.x === actor.x && position.y === actor.y) continue;
      const nextValue = gradient.valueAt(position) + 1;
      const predecessors = OFFSETS
        .map((offset) => ({ x: position.x + offset.x, y: position.y + offset.y }))
        .filter((candidate) => gradient.valueAt(candidate) === nextValue);
      if (predecessors.length === 0) return new Map();
      const branchProbability = probability / predecessors.length;
      for (const predecessor of predecessors) {
        const key = `${predecessor.x},${predecessor.y}`;
        probabilities.set(key, (probabilities.get(key) ?? 0) + branchProbability);
        const pending = nextFrontier.get(key);
        nextFrontier.set(key, {
          position: predecessor,
          probability: (pending?.probability ?? 0) + branchProbability,
        });
      }
    }
    if (nextFrontier.size === 0) break;
    frontier = nextFrontier;
  }

  probabilities.delete(`${actor.x},${actor.y}`);
  return probabilities;
}

export function techniqueSelectionRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  selectionRadius: number,
): NumericRangeMap {
  return buildUniformRange(
    actor,
    battlefield,
    selectionRadius + 1,
    (movementRule) => movementRule >= 99,
  );
}

export function techniqueEffectRange(
  center: Position,
  width: number,
  height: number,
  effectRadius: number,
): NumericRangeMap {
  const result = new NumericRangeMap(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.abs(center.x - x) + Math.abs(center.y - y);
      const value = effectRadius - distance;
      if (value > 0) result.set({ x, y }, value);
    }
  }
  return result;
}

export function stompEffectRange(
  actor: Pick<BattleUnit, "classId">,
  center: Position,
  battlefield: ActionBattlefield,
  viewport: ActionViewport,
): NumericRangeMap {
  const result = buildUniformRange(
    { ...center, classId: actor.classId },
    battlefield,
    4,
    (movementRule) => movementRule === 99,
  );
  for (let y = viewport.origin.y; y < viewport.origin.y + viewport.height; y += 1) {
    for (let x = viewport.origin.x; x < viewport.origin.x + viewport.width; x += 1) {
      result.set({ x, y }, 1);
    }
  }
  return result;
}
