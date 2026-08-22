import type { Side, UnitClassId } from "../types";

type SideOffsets = Readonly<Partial<Record<Side, number>>>;

/**
 * Horizontal optical corrections for the original map figures.
 *
 * The PNG canvas remains untouched and keeps its native dimensions. These
 * offsets align the visible figure inside that canvas, so the logical tile,
 * labels, selection range, and simulation coordinates never move. Side 2 is
 * explicit because the curse-master alpha silhouette is horizontally flipped
 * when its native enemy-colored figure is generated.
 */
export const MAP_UNIT_VISUAL_OFFSETS = {
  soldier: { 1: -2, 2: -2 },
  "magic-archer": { 1: -1, 2: -1 },
  crossbow: { 1: -3, 2: -3 },
  "curse-master": { 1: 3, 2: -3 },
} as const satisfies Readonly<Partial<Record<UnitClassId, SideOffsets>>>;

export function mapUnitVisualOffset(classId: UnitClassId, side: Side): number {
  const offsets: SideOffsets | undefined =
    MAP_UNIT_VISUAL_OFFSETS[classId as keyof typeof MAP_UNIT_VISUAL_OFFSETS];
  return offsets?.[side] ?? 0;
}
