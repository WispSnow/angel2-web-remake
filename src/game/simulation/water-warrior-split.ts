import type { BattleUnit } from "../types";

/**
 * Split bodies are minted as `<rootId>:split-1..3`; the suffix is the only
 * thing that separates them from their root. Life, experience and the eight
 * status words belong to the shared unit slot, exactly as in native module 29,
 * where every split cell points at one dynamic unit record.
 */
const WATER_WARRIOR_SPLIT_ID = /:split-[1-3]$/u;

export type SharedBodyUnit = Pick<BattleUnit, "id" | "classId" | "side" | "slot">;

export function waterWarriorRootId(unit: Pick<BattleUnit, "id" | "classId">): string | undefined {
  return unit.classId === "water-warrior"
    ? unit.id.replace(WATER_WARRIOR_SPLIT_ID, "")
    : undefined;
}

/**
 * All bodies of one water warrior keep the root's side and unit slot, so the
 * group is the set of units agreeing on side, slot and root id. Any other class
 * occupies exactly one board cell and is its own group.
 */
export function waterWarriorGroupIn<T extends SharedBodyUnit>(
  units: readonly T[],
  unit: T,
): T[] {
  const rootId = waterWarriorRootId(unit);
  if (!rootId) return [unit];
  return units.filter((candidate) =>
    candidate.side === unit.side
    && candidate.slot === unit.slot
    && waterWarriorRootId(candidate) === rootId);
}
