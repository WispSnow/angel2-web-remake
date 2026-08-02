import { movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position } from "../../types";

export interface ActionBattlefield {
  width: number;
  height: number;
  terrainSlotAt: (position: Position) => number;
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

const OFFSETS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const;

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

export function archerShootingRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
): NumericRangeMap {
  const result = buildUniformRange(
    actor,
    battlefield,
    5,
    (movementRule) => movementRule === 0 || movementRule === 99,
  );
  result.set(actor, 0);
  for (const offset of OFFSETS) {
    result.set({ x: actor.x + offset.x, y: actor.y + offset.y }, 0);
  }
  return result;
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
