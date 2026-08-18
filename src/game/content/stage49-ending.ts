import type { LoopMusicProgram, MusicProgram } from "../music-transport";

import { STAGE49_EPILOGUE_ENTRY_MUSIC } from "./stage49-ending.generated";
import { musicAsset } from "./music-assets";

export {
  STAGE49_CLASS_FAMILIES,
  STAGE49_ENDING_IDENTITY,
  STAGE49_ENDING_ROUTE,
  STAGE49_ENDING_SOURCES,
  STAGE49_EPILOGUE_ENTRY_MUSIC,
  STAGE49_EPILOGUE_FONT,
  STAGE49_EPILOGUE_LAYOUT,
  STAGE49_EPILOGUE_SEGMENTS,
  STAGE49_ROSTER_ACTORS,
  STAGE49_ROSTER_WAIT_NATIVE_TICKS,
  STAGE49_STORY_PAGES,
} from "./stage49-ending.generated";

export const STAGE49_ENDING_ASSETS = {
  storyBackground: "/assets/original/stage37-map.png",
  rosterBackground: "/assets/original/ending/roster-background.png",
  decoration: (record: number) =>
    `/assets/original/ending/decorations/${String(record).padStart(2, "0")}.png`,
  classIllustration: (nativeClassRecord: number) =>
    `/assets/original/ending/class-illustrations/${String(nativeClassRecord).padStart(2, "0")}.png`,
  epilogue: (record: number) =>
    `/assets/original/ending/epilogue/${String(record).padStart(2, "0")}.png`,
  audio: {
    story: musicAsset("MAGIC", 77),
    roster: musicAsset("UN", 6),
    prosperous: musicAsset("MUSIC", 40),
    decline: musicAsset("UN", 49),
  },
} as const;

const loopProgram = (id: string, track: string, source: string): LoopMusicProgram => ({
  id,
  kind: "loop",
  track,
  source,
  seamlessLoop: source,
});

export const STAGE49_ENDING_MUSIC = {
  story: loopProgram("stage49-ending-story", "MAGIC/77", STAGE49_ENDING_ASSETS.audio.story),
  roster: loopProgram("stage49-ending-roster", "UN/6", STAGE49_ENDING_ASSETS.audio.roster),
  prosperous: loopProgram(
    "stage49-ending-prosperous",
    "MUSIC/40",
    STAGE49_ENDING_ASSETS.audio.prosperous,
  ),
  decline: loopProgram(
    "stage49-ending-decline",
    "UN/49",
    STAGE49_ENDING_ASSETS.audio.decline,
  ),
} as const satisfies Record<string, MusicProgram>;

/**
 * Indexed by the native record-total selector. Module 35 starts this track at
 * entry, so it covers all four epilogue segments; resolving it from the
 * generated evidence keeps the track numbers from being hand-copied here.
 */
export const STAGE49_EPILOGUE_MUSIC_BY_SELECTOR: readonly LoopMusicProgram[] =
  STAGE49_EPILOGUE_ENTRY_MUSIC.map(({ music }) => {
    const program = Object.values(STAGE49_ENDING_MUSIC)
      .find((candidate) => candidate.track === music);
    if (!program) throw new Error(`stage 49 epilogue music ${music} has no program`);
    return program;
  });
