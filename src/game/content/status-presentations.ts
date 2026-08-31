import type { UnitStatuses } from "../types";

export interface UnitStatusPresentation {
  key: keyof UnitStatuses;
  label: string;
  /**
   * One-line effect summary for the modern hover tooltip. The original HUD only
   * drew the icon and its low-order counter, so this text is a browser reading
   * aid: it restates what the implemented rule already does and must never
   * become the source of a rule.
   */
  description: string;
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
  {
    key: "attackUp",
    label: "攻擊上升",
    description: "攻擊力提高 20。",
    nativeFrame: 0,
    source: "/assets/original/status-icons/00.png",
  },
  {
    key: "defenseUp",
    label: "防禦上升",
    description: "防禦力提高 20。",
    nativeFrame: 1,
    source: "/assets/original/status-icons/01.png",
  },
  {
    key: "magicGuard",
    label: "防魔",
    description: "抵擋一次魔法效果，抵擋後即消失。",
    nativeFrame: 2,
    source: "/assets/original/status-icons/02.png",
  },
  {
    key: "confusion",
    label: "混亂",
    description: "點選後只會自行移動或停留，不攻擊、不射擊、不施術，並直接耗盡本回合行動。",
    nativeFrame: 3,
    source: "/assets/original/status-icons/03.png",
  },
  {
    key: "attackDown",
    label: "攻擊下降",
    description: "攻擊力降低 20。",
    nativeFrame: 4,
    source: "/assets/original/status-icons/04.png",
  },
  {
    key: "defenseDown",
    label: "防禦下降",
    description: "防禦力降低 20。",
    nativeFrame: 5,
    source: "/assets/original/status-icons/05.png",
  },
  {
    key: "poison",
    label: "施毒",
    description: "回合開始時普通單位生命減半；龍／頭／手降至三分之一，最低保留 1。",
    nativeFrame: 6,
    source: "/assets/original/status-icons/06.png",
  },
  {
    key: "techniqueSeal",
    label: "禁咒",
    description: "無法使用技術，普通攻擊與射擊不受限。",
    nativeFrame: 7,
    source: "/assets/original/status-icons/07.png",
  },
] as const satisfies readonly UnitStatusPresentation[];

export function activeUnitStatusPresentations(
  statuses: UnitStatuses,
): ActiveUnitStatusPresentation[] {
  return UNIT_STATUS_PRESENTATIONS.flatMap((presentation) => {
    const remainingRounds = statuses[presentation.key];
    return remainingRounds > 0 ? [{ ...presentation, remainingRounds }] : [];
  });
}
