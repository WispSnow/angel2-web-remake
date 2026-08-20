import type { LoopMusicProgram } from "../music-transport";
import { musicAsset } from "./music-assets";

/**
 * Native module 27 owns the whole 出擊準備 screen. Before it draws the roster it
 * loads one MUSIC record into its own buffer and submits it to the RIX driver
 * as a standalone looping track — `0000:06A1` picks the record, `0000:0591`
 * plays it with driver command 1 / mode 1 (loop forever). Unlike the battle
 * tracks this is not an entry+loop pair, and unlike the story tracks it is not
 * per-stage: the only input is the native scene number.
 */
const DEPLOYMENT_MUSIC_LATE_SCENE_THRESHOLD = 5;

export const DEPLOYMENT_MUSIC_PROGRAMS = {
  earlyScenes: {
    id: "module27-deployment-early",
    kind: "loop",
    track: "MUSIC/16",
    source: musicAsset("MUSIC", 16),
    seamlessLoop: musicAsset("MUSIC", 16),
  },
  lateScenes: {
    id: "module27-deployment-late",
    kind: "loop",
    track: "MUSIC/17",
    source: musicAsset("MUSIC", 17),
    seamlessLoop: musicAsset("MUSIC", 17),
  },
} as const satisfies Record<string, LoopMusicProgram>;

/**
 * `0000:06A1` compares the current scene against 5 and loads `MUSIC/16` when it
 * is not greater, `MUSIC/17` otherwise. Scene 42 takes the late branch like
 * every other scene past the boundary.
 */
export function deploymentMusicProgramFor(nativeStage: number): LoopMusicProgram {
  return nativeStage > DEPLOYMENT_MUSIC_LATE_SCENE_THRESHOLD
    ? DEPLOYMENT_MUSIC_PROGRAMS.lateScenes
    : DEPLOYMENT_MUSIC_PROGRAMS.earlyScenes;
}
