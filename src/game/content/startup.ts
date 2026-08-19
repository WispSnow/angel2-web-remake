import type { Difficulty } from "../types";
import { enemyScalingFor } from "./enemy-scaling";
import { musicAsset } from "./music-assets";

/**
 * The pretitle logo, intro plates, title art, BK/40 menu frames, glyph font and
 * dissolve patterns are generated into `startup.generated.ts` from module-23
 * evidence. Only the two RIX tracks are still referenced by path.
 */
export const STARTUP_ASSETS = {
  audio: {
    intro: musicAsset("MUSIC", 14),
    title: musicAsset("MUSIC", 1),
  },
} as const;

export const DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: Difficulty;
  label: string;
  stage30Forms: number;
}> = [
  { value: 0, label: "過關斬將", stage30Forms: 8 },
  { value: 1, label: "勢均力敵", stage30Forms: 16 },
  { value: 2, label: "困難重重", stage30Forms: 24 },
  { value: 3, label: "無法無天", stage30Forms: 32 },
];

/** The closing sentence of each hint is product copy, not an evidence claim. */
const DIFFICULTY_NOTES: Readonly<Record<Difficulty, string>> = {
  0: "適合懷舊原版劇情，不會卡關。",
  1: "最推薦的均衡難度，比原版「困難重重」略難。",
  2: "比較有挑戰，但不至於繁瑣，比原版「無法無天」略易。",
  3: "骨灰挑戰，敵方數值和原版一致，比原版「無法無天」略難。",
};

export interface DifficultyHint {
  readonly label: string;
  readonly growth: "legacy" | "linear";
  /** Whether this difficulty still ships the native side-2 numbers. */
  readonly sourceLabel: string;
  readonly detail: string;
}

/**
 * The difficulty menu names alone do not say that `REMAKE-103` only rebuilt the
 * middle two rungs: difficulties 0 and 3 keep the native side-2 numbers, while 1
 * and 2 run the linear growth the player's own units never use. Everything but
 * the closing sentence is derived from `ENEMY_SCALING`, so the hint cannot drift
 * away from the rule it describes.
 */
export function difficultyHintFor(value: Difficulty): DifficultyHint {
  const rule = enemyScalingFor(value);
  const multiplier = rule.statMultiplierPercent === undefined
    ? ""
    : `，全屬性再 ×${rule.statMultiplierPercent / 100}`;
  const growth = rule.growth === "legacy"
    ? `原版成長曲線${multiplier}`
    : "線性成長，我方成長不變";
  return {
    label: DIFFICULTY_OPTIONS[value].label,
    growth: rule.growth,
    sourceLabel: rule.growth === "legacy" ? "原版數值" : "複刻調整",
    detail: `敵方等級 ${rule.level}、${growth}。${DIFFICULTY_NOTES[value]}`,
  };
}
