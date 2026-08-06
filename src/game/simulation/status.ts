import type { UnitStatuses } from "../types";

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

export function effectiveAttack(baseAttack: number, statuses: UnitStatuses): number {
  const attackUp = statuses.attackUp > 0 ? 20 : 0;
  const attackDown = statuses.attackDown > 0 ? 20 : 0;
  return Math.max(0, baseAttack + attackUp - attackDown);
}

export function effectiveDefense(baseDefense: number, statuses: UnitStatuses): number {
  const defenseUp = statuses.defenseUp > 0 ? 20 : 0;
  const defenseDown = statuses.defenseDown > 0 ? 20 : 0;
  return Math.max(0, baseDefense + defenseUp - defenseDown);
}

export function tickTimedStatus(counter: number): number {
  return counter >= 1 && counter <= 3 ? counter - 1 : counter;
}
