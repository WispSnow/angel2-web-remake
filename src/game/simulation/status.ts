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
