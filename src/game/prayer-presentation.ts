import type { PrayerOutcomeKind } from "./simulation/actions/types";

export const PRAYER_PROCEDURAL_PRESENTATION = {
  nativeScreen: { width: 640, height: 400 },
  fieldRows: 16,
  fieldYStart: 240,
  fieldYStep: 8,
  fieldColumns: [
    { x: 150, variant: 1 },
    { x: 200, variant: 0 },
  ],
  decorationRuns: [
    { start: 240, colors: [14, 0, 11, 14, 0] },
    { start: 368, colors: [0, 14, 11, 0, 14] },
  ],
  cornerPairs: [
    { x: 150, y: 240, color: 5 },
    { x: 198, y: 240, color: 5 },
    { x: 150, y: 365, color: 5 },
    { x: 198, y: 365, color: 5 },
  ],
  resultTextPosition: { x: 248, y: 158 },
  resultHoldNativeTicks: 60,
} as const;

export function prayerResultText(
  outcome: PrayerOutcomeKind,
  rolledAmount?: number,
): string {
  if (outcome === "healing") return `生 命 加 ${String(rolledAmount ?? 0).padStart(5, "0")} 點.`;
  if (outcome === "experience") return `經 驗 加 ${String(rolledAmount ?? 0).padStart(5, "0")} 點.`;
  if (outcome === "attackUp") return "攻擊增加";
  return "防禦增加";
}
