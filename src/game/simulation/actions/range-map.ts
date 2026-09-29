import { SHOOTING_TERRAIN_PROFILE_OVERRIDES } from "../../content/class-balance-overrides";
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

const OFFSETS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const;

const copyPosition = ({ x, y }: Position): Position => ({ x, y });

/** The terrain test a range propagation applies to every cell it enters. */
interface RangeGate {
  readonly movementRules: readonly number[];
  readonly blocks: (movementRule: number) => boolean;
}

const refuses = (
  gate: RangeGate,
  battlefield: ActionBattlefield,
  position: Position,
): boolean => gate.blocks(gate.movementRules[battlefield.terrainSlotAt(position)] ?? 99);

/**
 * Mode `2` at `1000:3FA8` stops only on rules `0/99`, so the `98` that native
 * shooters and casters carry where melee careers carry `99` is terrain their
 * arrows cross but their feet cannot. REMAKE-149 points the water warrior's
 * remake shot at the archer's profile; see SHOOTING_TERRAIN_PROFILE_OVERRIDES.
 */
function shootingGate(classId: BattleUnit["classId"]): RangeGate {
  const terrainProfile = SHOOTING_TERRAIN_PROFILE_OVERRIDES[classId] ?? classId;
  return {
    movementRules: movementRulesFor(terrainProfile),
    blocks: (movementRule) => movementRule === 0 || movementRule === 99,
  };
}

/** Mode `0` at `1000:3BB0` compares the caster's own rule only against `99`. */
function techniqueGate(classId: BattleUnit["classId"]): RangeGate {
  return {
    movementRules: movementRulesFor(classId),
    blocks: (movementRule) => movementRule >= 99,
  };
}

function buildUniformRange(
  actor: Pick<BattleUnit, "x" | "y">,
  battlefield: ActionBattlefield,
  seed: number,
  gate: RangeGate,
): NumericRangeMap {
  const result = new NumericRangeMap(battlefield.width, battlefield.height);
  const pending: Position[] = [{ x: actor.x, y: actor.y }];
  result.set(actor, seed);

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;
    const nextValue = result.valueAt(current) - 1;
    if (nextValue <= 0) continue;
    for (const offset of OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      if (!result.contains(next)) continue;
      if (refuses(gate, battlefield, next) || result.valueAt(next) >= nextValue) continue;
      result.set(next, nextValue);
      pending.push(next);
    }
  }
  return result;
}

function shootingGradient(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): NumericRangeMap {
  return buildUniformRange(actor, battlefield, nativeSeed, shootingGate(actor.classId));
}

/**
 * Propagation steps between every cell and one target, for REMAKE-173's
 * approach rings. `stepsAt` is undefined where no propagation arrives.
 */
export class RangeSteps {
  private readonly steps: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.steps = new Int32Array(width * height).fill(-1);
  }

  contains(position: Position): boolean {
    return position.x >= 0
      && position.y >= 0
      && position.x < this.width
      && position.y < this.height;
  }

  stepsAt(position: Position): number | undefined {
    if (!this.contains(position)) return undefined;
    const steps = this.steps[position.y * this.width + position.x] ?? -1;
    return steps < 0 ? undefined : steps;
  }

  set(position: Position, steps: number): void {
    if (!this.contains(position)) return;
    this.steps[position.y * this.width + position.x] = steps;
  }
}

/**
 * How many steps a range propagation from each cell needs to reach `target`.
 * Both native builders charge one step per cell entered and test only the
 * cell being entered, never the actor's own, so this walks backwards from the
 * target: a cell the gate refuses still receives its count — an actor may
 * stand there — but nothing propagates through it. A target standing on a
 * refused cell is out of every actor's reach.
 */
function rangeStepsToTarget(
  target: Position,
  battlefield: ActionBattlefield,
  gate: RangeGate,
): RangeSteps | undefined {
  const result = new RangeSteps(battlefield.width, battlefield.height);
  if (!result.contains(target) || refuses(gate, battlefield, target)) return undefined;
  result.set(target, 0);
  const pending: Position[] = [copyPosition(target)];
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    const nextSteps = (result.stepsAt(current) ?? 0) + 1;
    for (const offset of OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      if (!result.contains(next) || result.stepsAt(next) !== undefined) continue;
      result.set(next, nextSteps);
      if (!refuses(gate, battlefield, next)) pending.push(next);
    }
  }
  return result;
}

/**
 * Steps a `techniqueSelectionRange` cast from each cell needs to select
 * `target`: selectable with seed `n` exactly when the count is at most `n - 1`.
 */
export function techniqueStepsToTarget(
  casterClassId: BattleUnit["classId"],
  target: Position,
  battlefield: ActionBattlefield,
): RangeSteps | undefined {
  return rangeStepsToTarget(target, battlefield, techniqueGate(casterClassId));
}

/**
 * Steps a `shootingRange` from each cell needs to reach `target`. The shot
 * also refuses the actor's own cell and its four neighbours, which is a
 * straight-line rule the caller applies itself.
 */
export function shootingStepsToTarget(
  shooterClassId: BattleUnit["classId"],
  target: Position,
  battlefield: ActionBattlefield,
): RangeSteps | undefined {
  return rangeStepsToTarget(target, battlefield, shootingGate(shooterClassId));
}

export function shootingRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): NumericRangeMap {
  const result = shootingGradient(actor, battlefield, nativeSeed);
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
  const gradient = shootingGradient(actor, battlefield, nativeSeed);
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
 * Enumerates every native-valid predecessor walk in stable native direction
 * order. REMAKE-035 uses these paths for explicit player and AI selection;
 * unlike the original PIT walk, enumeration never reads gameplay PRNG.
 */
export function shootingLinePaths(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  target: Position,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): Position[][] {
  const gradient = shootingGradient(actor, battlefield, nativeSeed);
  if (gradient.valueAt(target) === 0) return [];

  const paths: Position[][] = [];
  const reversed = [copyPosition(target)];
  const visit = (current: Position): void => {
    if (current.x === actor.x && current.y === actor.y) {
      paths.push([...reversed].reverse().map(copyPosition));
      return;
    }
    const nextValue = gradient.valueAt(current) + 1;
    for (const offset of OFFSETS) {
      const predecessor = { x: current.x + offset.x, y: current.y + offset.y };
      if (gradient.valueAt(predecessor) !== nextValue) continue;
      reversed.push(predecessor);
      visit(predecessor);
      reversed.pop();
    }
  };
  visit(copyPosition(target));
  return paths;
}

/**
 * Returns the probability that the native uniformly selected predecessor walk
 * visits each line cell. This evaluates every legal line without reading the
 * gameplay PRNG. It remains as executable evidence for the original random
 * walk and for a future legacyStrict ruleset; REMAKE-035 does not use it.
 */
export function shootingLineVisitProbabilities(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  target: Position,
  battlefield: ActionBattlefield,
  nativeSeed: number,
): ReadonlyMap<string, number> {
  const gradient = shootingGradient(actor, battlefield, nativeSeed);
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

/**
 * The native action tables store a propagation seed, not a cell count. Mode
 * `0` at `1000:3BB0` writes `current - 1` into each neighbour and refuses to
 * store zero, so a seed of `n` reaches `n - 1` cells. Both the player entry
 * `1000:40C2` and the AI entry `1000:1E51` write the table word straight into
 * DS:`1F18` without adjusting it, which is why shooting already passes its
 * own seed through unchanged. Content still carries the raw table word under
 * `range.selectionRadius`; reach is one less than that number.
 */
export function techniqueSelectionRange(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: ActionBattlefield,
  selectionSeed: number,
): NumericRangeMap {
  return buildUniformRange(actor, battlefield, selectionSeed, techniqueGate(actor.classId));
}

/**
 * Reconstructs the native WD target-to-source predecessor walk. Equal-gradient
 * predecessors stay injectable because the release orders them from the PIT;
 * stableRemake supplies its serialized gameplay PRNG at commit time.
 */
export function techniqueSelectionPath(
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  target: Position,
  battlefield: ActionBattlefield,
  selectionSeed: number,
  choosePredecessor: (candidateCount: number) => number = () => 0,
): Position[] {
  const gradient = buildUniformRange(actor, battlefield, selectionSeed, techniqueGate(actor.classId));
  if (gradient.valueAt(target) === 0) return [];

  const path = [copyPosition(target)];
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
    path.push(copyPosition(current));
  }
  return path;
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
  const result = buildUniformRange(center, battlefield, 4, {
    movementRules: movementRulesFor(actor.classId),
    blocks: (movementRule) => movementRule === 99,
  });
  for (let y = viewport.origin.y; y < viewport.origin.y + viewport.height; y += 1) {
    for (let x = viewport.origin.x; x < viewport.origin.x + viewport.width; x += 1) {
      result.set({ x, y }, 1);
    }
  }
  return result;
}
