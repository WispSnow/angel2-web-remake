import type { UnitStatuses } from "../types";

export interface UnitStatusPresentation {
  key: keyof UnitStatuses;
  label: string;
  nativeFrame: number;
  source: string;
}

export interface ActiveUnitStatusPresentation extends UnitStatusPresentation {
  remainingRounds: number;
}

// Module 29 0000:8A08 scans the eight dynamic status words in this exact
// order and uses the corresponding A/17 frame. The browser paths are generated
// from the evidence render by scripts/generate-stage0-runtime.mjs.
export const UNIT_STATUS_PRESENTATIONS = [
  { key: "attackUp", label: "攻擊上升", nativeFrame: 0, source: "/assets/original/status-icons/00.png" },
  { key: "defenseUp", label: "防禦上升", nativeFrame: 1, source: "/assets/original/status-icons/01.png" },
  { key: "magicGuard", label: "防魔", nativeFrame: 2, source: "/assets/original/status-icons/02.png" },
  { key: "confusion", label: "混亂", nativeFrame: 3, source: "/assets/original/status-icons/03.png" },
  { key: "attackDown", label: "攻擊下降", nativeFrame: 4, source: "/assets/original/status-icons/04.png" },
  { key: "defenseDown", label: "防禦下降", nativeFrame: 5, source: "/assets/original/status-icons/05.png" },
  { key: "poison", label: "施毒", nativeFrame: 6, source: "/assets/original/status-icons/06.png" },
  { key: "techniqueSeal", label: "禁咒", nativeFrame: 7, source: "/assets/original/status-icons/07.png" },
] as const satisfies readonly UnitStatusPresentation[];

export function activeUnitStatusPresentations(
  statuses: UnitStatuses,
): ActiveUnitStatusPresentation[] {
  return UNIT_STATUS_PRESENTATIONS.flatMap((presentation) => {
    const remainingRounds = statuses[presentation.key];
    return remainingRounds > 0 ? [{ ...presentation, remainingRounds }] : [];
  });
}
