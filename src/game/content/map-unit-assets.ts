import type { UnitClassId } from "../types";

/**
 * Shared player-side map figures currently reachable in the released campaign
 * slices. Keeping them outside stage content prevents inherited promotions
 * from silently falling back to the soldier figure.
 */
export const ALLY_MAP_UNIT_ASSETS = {
  soldier: "/assets/original/unit-ally-soldier.png",
  archer: "/assets/original/unit-ally-archer.png",
  cavalry: "/assets/original/unit-ally-cavalry.png",
  sister: "/assets/original/unit-ally-sister.png",
  warrior: "/assets/original/unit-ally-warrior.png",
  magician: "/assets/original/unit-ally-magician.png",
  "magic-priest": "/assets/original/unit-ally-magic-priest.png",
  "evil-mage": "/assets/original/technique-lab/units/ally-evil-mage.png",
  "magic-master": "/assets/original/technique-lab/units/ally-magic-master.png",
  wizard: "/assets/original/technique-lab/units/ally-wizard.png",
} as const satisfies Readonly<Partial<Record<UnitClassId, string>>>;

export function allyMapUnitAsset(classId: UnitClassId): string | undefined {
  return ALLY_MAP_UNIT_ASSETS[classId as keyof typeof ALLY_MAP_UNIT_ASSETS];
}
