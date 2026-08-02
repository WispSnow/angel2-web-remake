import type { MusicProgram } from "../music-transport";
import type { Position, UnitClassId } from "../types";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE1_CONTENT_IDENTITY,
  STAGE1_DEPLOYMENT,
  STAGE1_DEPLOYMENT_UI,
  STAGE1_ENEMY_UNITS,
  STAGE1_EVENT_PROGRAM,
  STAGE1_MUSIC_RECORDS,
  STAGE1_OBJECTIVE,
  STAGE1_PLAYER_CLASS_OVERRIDES,
  STAGE1_SOURCES,
  STAGE1_STORY_PAGES,
  STAGE1_STORY_PRESENTATION,
  STAGE1_TERRAIN_TOKENS_BASE64,
  STAGE1_TITLE,
  STAGE1_TOKEN_TO_SLOT_BASE64,
} from "./stage1-runtime.generated";
import type { StageDefinition, StageMusicId, StageStoryId } from "./stages";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const semanticClassId = (nativeClassRecord: number): UnitClassId => {
  const classId = classIdFromNativeRecord(nativeClassRecord);
  if (!classId) throw new Error(`Unknown stage 1 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE1 = {
  id: "stage-01",
  nativeStage: 1,
  name: STAGE1_TITLE,
  width: 50,
  height: 50,
  // The round-1 native presentation focuses portrait 46 (Nia) at (22,36).
  // The shared 10x7 centering rule therefore yields this battle origin.
  viewport: { width: 10, height: 7, initialOrigin: { x: 18, y: 33 } },
} as const;

export const STAGE1_DEFINITION = {
  ...STAGE1,
  contentIdentity: STAGE1_CONTENT_IDENTITY,
  objective: STAGE1_OBJECTIVE,
  deployment: STAGE1_DEPLOYMENT,
  stories: {
    prebattle: "stage-01-prebattle-story",
    opening: "stage-01-opening-story",
    roundStarts: [],
    victory: "stage-01-victory-story",
  },
  music: {
    story: "stage-01-story-music",
    playerPhase: "stage-01-player-phase-music",
    enemyPhase: "stage-01-enemy-phase-music",
  },
  events: [
    {
      id: "stage-01-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-01-prebattle-story",
    },
    {
      id: "stage-01-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-01-prebattle-story" },
      simulationEffect: "stage-01-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-01-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-01-opening-story",
    },
    {
      id: "stage-01-boss-defeated",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-01-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-01-messenger-arrival",
      trigger: { type: "effect-completed", effectId: "stage-01-set-victory-999" },
      simulationEffect: "stage-01-messenger-arrival",
      presentation: "stage-01-victory-story",
    },
    {
      id: "stage-01-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-01-route-to-stage-02",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-01">;

export const STAGE1_TERRAIN_TOKENS = decode(STAGE1_TERRAIN_TOKENS_BASE64);
export const STAGE1_TOKEN_TO_TERRAIN_SLOT = decode(STAGE1_TOKEN_TO_SLOT_BASE64);

export function stage1TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE1.width || position.y >= STAGE1.height) return 0;
  const token = STAGE1_TERRAIN_TOKENS[position.y * STAGE1.width + position.x];
  return STAGE1_TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const STAGE1_SEMANTIC_CLASS_OVERRIDES = STAGE1_PLAYER_CLASS_OVERRIDES.map(
  ({ slot, nativeClassRecord }) => ({ slot, classId: semanticClassId(nativeClassRecord) }),
);

export const STAGE1_SEMANTIC_ENEMY_UNITS = STAGE1_ENEMY_UNITS.map((unit) => ({
  ...unit,
  classId: semanticClassId(unit.nativeClassRecord),
}));

export const STAGE1_ASSETS = {
  map: "/assets/original/stage1-map.png",
  minimap: "/assets/original/stage1-minimap.png",
  storyBackground: "/assets/original/story-stage1-background.png",
  allyMagician: "/assets/original/unit-ally-magician.png",
  enemySister: "/assets/original/unit-enemy-sister.png",
  portraits: {
    0: "/assets/original/portrait-0.png",
    42: "/assets/original/portrait-42.png",
    43: "/assets/original/portrait-43.png",
    44: "/assets/original/portrait-44.png",
  },
  audio: {
    story: "/assets/original/story-stage1.wav",
    playerEntry: "/assets/original/battle-stage1-player-entry.wav",
    playerLoop: "/assets/original/battle-stage1-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage1-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage1-enemy-loop.wav",
  },
} as const;

export const STAGE1_MUSIC_PROGRAMS = {
  "stage-01-story-music": {
    id: "stage1-story",
    kind: "loop",
    track: `MAGIC/${STAGE1_MUSIC_RECORDS.story}`,
    source: STAGE1_ASSETS.audio.story,
    seamlessLoop: STAGE1_ASSETS.audio.story,
  },
  "stage-01-player-phase-music": {
    id: "stage1-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.player.loop}`,
    entry: STAGE1_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE1_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-01-enemy-phase-music": {
    id: "stage1-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE1_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE1_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function stage1StoryPagesForId(storyId: StageStoryId) {
  return storyId in STAGE1_STORY_PAGES
    ? STAGE1_STORY_PAGES[storyId as keyof typeof STAGE1_STORY_PAGES]
    : [];
}

/** Installs only the lightweight semantic registries after the stage-1 chunk loads. */
export function activateStage1Content(): void {
  registerStageStoryPages(STAGE1_STORY_PAGES);
  registerStageMusicPrograms(STAGE1_MUSIC_PROGRAMS);
}

export {
  STAGE1_DEPLOYMENT_UI,
  STAGE1_EVENT_PROGRAM,
  STAGE1_MUSIC_RECORDS,
  STAGE1_SOURCES,
  STAGE1_STORY_PAGES,
  STAGE1_STORY_PRESENTATION,
};
