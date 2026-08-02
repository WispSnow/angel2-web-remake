import type { MusicProgram } from "../music-transport";
import { ASSETS } from "./stage0";
import { STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS } from "./stage0-music.generated";
import type { StageMusicId } from "./stages";

export const STAGE_MUSIC_PROGRAMS = {
  "stage-00-story-music": {
    id: "stage0-story",
    kind: "loop",
    track: "MAGIC/73",
    source: ASSETS.audio.story,
    seamlessLoop: ASSETS.audio.storySeamlessLoop,
  },
  "stage-00-player-phase-music": {
    id: "stage0-player-battle",
    kind: "intro-loop",
    entryTrack: "MUSIC/7",
    loopTrack: "MUSIC/6",
    entry: ASSETS.audio.playerBattleEntry,
    seamlessLoop: ASSETS.audio.playerBattleSeamlessLoop,
    crossfadeSeconds: STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS,
  },
  "stage-00-enemy-phase-music": {
    id: "stage0-enemy-battle",
    kind: "intro-loop",
    entryTrack: "MUSIC/5",
    loopTrack: "MUSIC/4",
    entry: ASSETS.audio.enemyBattleEntry,
    seamlessLoop: ASSETS.audio.enemyBattleSeamlessLoop,
    crossfadeSeconds: STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

const STAGE_MUSIC_REGISTRY: Partial<Record<StageMusicId, MusicProgram>> =
  STAGE_MUSIC_PROGRAMS;

export const PRELOAD_STAGE_MUSIC_PROGRAMS: readonly MusicProgram[] =
  Object.values(STAGE_MUSIC_PROGRAMS);

export function musicProgramFor(id?: StageMusicId): MusicProgram | undefined {
  return id ? STAGE_MUSIC_REGISTRY[id] : undefined;
}
