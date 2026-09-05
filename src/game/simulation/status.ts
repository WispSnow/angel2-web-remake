import type { Side, UnitStatuses } from "../types";

export const UNIT_STATUS_KEYS = [
  "attackUp",
  "defenseUp",
  "magicGuard",
  "confusion",
  "attackDown",
  "defenseDown",
  "poison",
  "techniqueSeal",
] as const satisfies readonly (keyof UnitStatuses)[];

export function emptyUnitStatuses(): UnitStatuses {
  return {
    attackUp: 0,
    defenseUp: 0,
    magicGuard: 0,
    confusion: 0,
    attackDown: 0,
    defenseDown: 0,
    poison: 0,
    techniqueSeal: 0,
  };
}

export function cloneUnitStatuses(statuses: UnitStatuses): UnitStatuses {
  return { ...statuses };
}

/** The points `1000:8C2D` writes into effective attack/defense per status word. */
export const STATUS_STAT_DELTA = 20;

/**
 * `delta` exists because `1000:8BD1` scales side-2 stats *after* the status
 * write, so a difficulty that multiplies the base multiplies this step with it
 * (see `difficultyAwareStats`). Callers that scale the finished value already
 * carry the multiplier and keep the native `20`.
 */
export function effectiveAttack(
  baseAttack: number,
  statuses: UnitStatuses,
  delta = STATUS_STAT_DELTA,
): number {
  const attackUp = statuses.attackUp > 0 ? delta : 0;
  const attackDown = statuses.attackDown > 0 ? delta : 0;
  return Math.max(0, baseAttack + attackUp - attackDown);
}

export function effectiveDefense(
  baseDefense: number,
  statuses: UnitStatuses,
  delta = STATUS_STAT_DELTA,
): number {
  const defenseUp = statuses.defenseUp > 0 ? delta : 0;
  const defenseDown = statuses.defenseDown > 0 ? delta : 0;
  return Math.max(0, baseDefense + defenseUp - defenseDown);
}

export function tickTimedStatus(counter: number): number {
  return counter >= 1 && counter <= 3 ? counter - 1 : counter;
}

/**
 * REMAKE-140: a guard has to outlive the first round boundary that follows an
 * opposing phase, or it never meets any magic at all. The native `1` already
 * does that for side 1, whose cast precedes the enemy phase of the same round;
 * side 2 acts last in the round, so its guard needs one more boundary before
 * the player phase it is meant to cover even begins.
 */
export function magicGuardCounterFor(side: Side, baseCounter: number): number {
  return side === 2 ? baseCounter + 1 : baseCounter;
}
