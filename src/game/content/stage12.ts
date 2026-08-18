import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE12_CONTENT_IDENTITY,
  STAGE12_DEPLOYMENT,
  STAGE12_DEPLOYMENT_ACTORS,
  STAGE12_ENEMY_UNITS,
  STAGE12_EVENT_PROGRAM,
  STAGE12_MUSIC_RECORDS,
  STAGE12_OBJECTIVE,
  STAGE12_SOURCES,
  STAGE12_STORY_PAGES,
  STAGE12_TERRAIN_TOKENS_BASE64,
  STAGE12_TITLE,
  STAGE12_TOKEN_TO_SLOT_BASE64,
} from "./stage12-runtime.generated";
import {
  registerRuntimeStageDefinition,
  type StageDefinition,
  type StageMusicId,
} from "./stages";
import { terrainContentBounds, viewportOriginBoundsForContent } from "./terrain";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const semanticClassId = (nativeClassRecord: number): UnitClassId => {
  const classId = classIdFromNativeRecord(nativeClassRecord);
  if (!classId) throw new Error(`Unknown stage 12 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE12_TERRAIN_TOKENS = decode(STAGE12_TERRAIN_TOKENS_BASE64);
export const STAGE12_TOKEN_TO_TERRAIN_SLOT = decode(STAGE12_TOKEN_TO_SLOT_BASE64);
export const STAGE12_IRON_PLATE_TERRAIN_SLOT = STAGE12_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE12_OBSTACLE_TERRAIN_SLOT = STAGE12_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE12_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE12 = {
  id: "stage-12",
  nativeStage: 12,
  name: STAGE12_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 19, y: 17 },
    originBounds,
  },
} as const;

export const STAGE12_DEFINITION = {
  ...STAGE12,
  contentIdentity: STAGE12_CONTENT_IDENTITY,
  objective: STAGE12_OBJECTIVE,
  deployment: STAGE12_DEPLOYMENT,
  stories: {
    prebattle: "stage-12-prebattle-story",
    opening: "stage-12-opening-story",
    roundStarts: [],
    victory: "stage-12-victory-story",
  },
  music: {
    story: "stage-12-story-music",
    playerPhase: "stage-12-player-phase-music",
    enemyPhase: "stage-12-enemy-phase-music",
  },
  events: [
    {
      id: "stage-12-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-12-prebattle-story",
    },
    {
      id: "stage-12-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-12-prebattle-story" },
      simulationEffect: "stage-12-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-12-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-12-opening-story",
    },
    {
      id: "stage-12-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-12-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-12-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-12-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-12-victory-story",
    },
    {
      id: "stage-12-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-12-route-to-stage-13",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-12">;

registerRuntimeStageDefinition(STAGE12_DEFINITION);

export function stage12TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE12_TOKEN_TO_TERRAIN_SLOT[STAGE12_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE12_SEMANTIC_ALLIED_UNITS = STAGE12_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE12_SEMANTIC_ENEMY_UNITS = STAGE12_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE12_ASSETS = {
  map: "/assets/original/stage12-map.png",
  minimap: "/assets/original/stage12-minimap.png",
  storyBackgrounds: {
    10: "/assets/original/story-stage12-background-10.png",
    11: "/assets/original/story-stage12-background-11.png",
    12: "/assets/original/story-stage12-background-12.png",
    13: "/assets/original/story-stage12-background-13.png",
    14: "/assets/original/story-stage12-background-14.png",
  },
  unitSprites: {
    "enemy-water-warrior": "/assets/original/technique-lab/units/enemy-water-warrior.png",
  },
  audio: {
    story: musicAsset("MAGIC", 76),
    playerEntry: musicAsset("MUSIC", 9),
    playerLoop: musicAsset("MUSIC", 8),
    enemyEntry: musicAsset("MUSIC", 25),
    enemyLoop: musicAsset("MUSIC", 24),
  },
} as const;

export const STAGE12_MUSIC_PROGRAMS = {
  "stage-12-story-music": {
    id: "stage12-story",
    kind: "loop",
    track: "MAGIC/76",
    source: STAGE12_ASSETS.audio.story,
    seamlessLoop: STAGE12_ASSETS.audio.story,
  },
  "stage-12-player-phase-music": {
    id: "stage12-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE12_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE12_MUSIC_RECORDS.player.loop}`,
    entry: STAGE12_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE12_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-12-enemy-phase-music": {
    id: "stage12-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE12_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE12_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE12_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE12_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage12Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-12-enter-deployment": { type: "enter-deployment" },
    "stage-12-set-victory-999": { type: "victory-state", value: 999 },
    "stage-12-route-to-stage-13": { type: "campaign-route", destination: "stage-13" },
  });
  registerStageStoryPages(STAGE12_STORY_PAGES);
  registerStageMusicPrograms(STAGE12_MUSIC_PROGRAMS);
}

export {
  STAGE12_CONTENT_IDENTITY,
  STAGE12_EVENT_PROGRAM,
  STAGE12_SOURCES,
  STAGE12_STORY_PAGES,
};
