/** Stable runtime paths for the deduplicated music master set. */
export type MusicContainer = "MUSIC" | "MAGIC" | "UN";

export function musicAsset(container: MusicContainer, record: number): string {
  if (!Number.isInteger(record) || record < 0 || record > 9999) {
    throw new Error(`invalid music record: ${container}/${record}`);
  }
  return `/assets/original/music/${container}/${String(record).padStart(4, "0")}.ogg`;
}

export const STAGE0_SEAMLESS_MUSIC_ASSETS = {
  story: "/assets/original/music/generated/stage0-story-seamless.ogg",
  player: "/assets/original/music/generated/stage0-player-seamless.ogg",
  enemy: "/assets/original/music/generated/stage0-enemy-seamless.ogg",
} as const;
