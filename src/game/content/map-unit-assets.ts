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
  crossbow: "/assets/original/technique-lab/units/ally-crossbow.png",
  "magic-archer": "/assets/original/technique-lab/units/ally-magic-archer.png",
  "land-knight": "/assets/original/technique-lab/units/ally-land-knight.png",
  "demon-dragon-knight": "/assets/original/technique-lab/units/ally-demon-dragon-knight.png",
  "beast-knight": "/assets/original/technique-lab/units/ally-beast-knight.png",
  "bone-knight": "/assets/original/technique-lab/units/ally-bone-knight.png",
  "pegasus-warrior": "/assets/original/technique-lab/units/ally-pegasus-warrior.png",
  monk: "/assets/original/technique-lab/units/ally-monk.png",
  priest: "/assets/original/technique-lab/units/ally-priest.png",
  "steel-armor-warrior": "/assets/original/technique-lab/units/ally-steel-armor-warrior.png",
  "magic-priest": "/assets/original/unit-ally-magic-priest.png",
  "prayer-guide": "/assets/original/technique-lab/units/ally-prayer-guide.png",
  "curse-master": "/assets/original/technique-lab/units/ally-curse-master.png",
  "water-warrior": "/assets/original/technique-lab/units/ally-water-warrior.png",
  "magic-guide": "/assets/original/technique-lab/units/ally-magic-guide.png",
  "magic-armor-warrior": "/assets/original/technique-lab/units/ally-magic-armor-warrior.png",
  "magic-sword-warrior": "/assets/original/technique-lab/units/ally-magic-sword-warrior.png",
  "great-axe-warrior": "/assets/original/technique-lab/units/ally-great-axe-warrior.png",
  "divine-sword-warrior": "/assets/original/technique-lab/units/ally-divine-sword-warrior.png",
  "jungle-warrior": "/assets/original/technique-lab/units/ally-jungle-warrior.png",
  "swift-dragon-knight": "/assets/original/technique-lab/units/ally-swift-dragon-knight.png",
  "flying-dragon-knight": "/assets/original/technique-lab/units/ally-flying-dragon-knight.png",
  "evil-sword-warrior": "/assets/original/technique-lab/units/ally-evil-sword-warrior.png",
  "evil-mage": "/assets/original/technique-lab/units/ally-evil-mage.png",
  "magic-master": "/assets/original/technique-lab/units/ally-magic-master.png",
  wizard: "/assets/original/technique-lab/units/ally-wizard.png",
  "great-dragon-knight": "/assets/original/technique-lab/units/ally-great-dragon-knight.png",
  engineer: "/assets/original/technique-lab/units/ally-engineer.png",
  empress: "/assets/original/technique-lab/units/ally-empress.png",
} as const satisfies Readonly<Partial<Record<UnitClassId, string>>>;

export function allyMapUnitAsset(classId: UnitClassId): string | undefined {
  return ALLY_MAP_UNIT_ASSETS[classId as keyof typeof ALLY_MAP_UNIT_ASSETS];
}
