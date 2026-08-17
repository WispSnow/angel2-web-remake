import type { Difficulty } from "../types";

/**
 * The pretitle logo, intro plates, title art, BK/40 menu frames, glyph font and
 * dissolve patterns are generated into `startup.generated.ts` from module-23
 * evidence. Only the two RIX tracks are still referenced by path.
 */
export const STARTUP_ASSETS = {
  audio: {
    intro: "/assets/original/startup/audio/intro.wav",
    title: "/assets/original/startup/audio/title.wav",
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
