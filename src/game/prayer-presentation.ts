import { TECHNIQUE_LAB_PRAYER } from "./content/technique-lab.generated";
import { nativeNumericField } from "./native-text";
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

const RESULT_STRINGS = TECHNIQUE_LAB_PRAYER.presentation.resultStrings;

/**
 * `1000:59AA` shows one of four recorded strings. Two of them are two-line
 * templates carrying the same five-character numeric field the rest of the
 * native HUD uses, so the roll goes through `0000:EF56`'s formatting rather
 * than through a zero pad: 7 reads as four spaces and a `7`, not as `00007`.
 * The `|` stays put — it is the cursor's own line feed, not a character.
 */
export function prayerResultText(
  outcome: PrayerOutcomeKind,
  rolledAmount?: number,
): string {
  if (outcome === "attackUp") return RESULT_STRINGS.attackUp;
  if (outcome === "defenseUp") return RESULT_STRINGS.defenseUp;
  const template = outcome === "healing" ? RESULT_STRINGS.heal : RESULT_STRINGS.experience;
  return template.replace("00000", nativeNumericField(rolledAmount ?? 0));
}
