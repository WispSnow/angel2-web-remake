import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE10_CONTENT_IDENTITY,
  STAGE10_DEPLOYMENT,
  STAGE10_DEPLOYMENT_ACTORS,
  STAGE10_ENEMY_UNITS,
  STAGE10_EVENT_PROGRAM,
  STAGE10_MUSIC_RECORDS,
  STAGE10_OBJECTIVE,
  STAGE10_SOURCES,
  STAGE10_STORY_PAGES,
  STAGE10_TERRAIN_TOKENS_BASE64,
  STAGE10_TITLE,
  STAGE10_TOKEN_TO_SLOT_BASE64,
} from "./stage10-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 10 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE10_TERRAIN_TOKENS = decode(STAGE10_TERRAIN_TOKENS_BASE64);
export const STAGE10_TOKEN_TO_TERRAIN_SLOT = decode(STAGE10_TOKEN_TO_SLOT_BASE64);
export const STAGE10_IRON_PLATE_TERRAIN_SLOT = STAGE10_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE10_OBSTACLE_TERRAIN_SLOT = STAGE10_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE10_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE10 = {
  id: "stage-10",
  nativeStage: 10,
  name: STAGE10_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 22, y: 21 },
    originBounds,
  },
} as const;

export const STAGE10_DEFINITION = {
  ...STAGE10,
  contentIdentity: STAGE10_CONTENT_IDENTITY,
  objective: STAGE10_OBJECTIVE,
  deployment: STAGE10_DEPLOYMENT,
  stories: {
    prebattle: "stage-10-prebattle-story",
    roundStarts: [],
  },
  music: {
    story: "stage-10-story-music",
    playerPhase: "stage-10-player-phase-music",
    enemyPhase: "stage-10-enemy-phase-music",
  },
  events: [
    {
      id: "stage-10-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-10-prebattle-story",
    },
    {
      id: "stage-10-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-10-prebattle-story" },
      simulationEffect: "stage-10-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-10-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-10-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-10-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-10-route-to-stage-12",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-10">;

registerRuntimeStageDefinition(STAGE10_DEFINITION);

export function stage10TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE10_TOKEN_TO_TERRAIN_SLOT[STAGE10_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE10_SEMANTIC_ALLIED_UNITS = STAGE10_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE10_SEMANTIC_ENEMY_UNITS = STAGE10_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait: ("portraitRecord" in unit ? unit.portraitRecord : undefined) as PortraitRecord | undefined,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE10_ASSETS = {
  map: "/assets/original/stage10-map.png",
  minimap: "/assets/original/stage10-minimap.png",
  storyBackgrounds: {
    10: "/assets/original/story-stage10-background-10.png",
  },
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
  },
  audio: {
    story: musicAsset("MAGIC", 74),
    playerEntry: musicAsset("MUSIC", 29),
    playerLoop: musicAsset("MUSIC", 28),
    enemyEntry: musicAsset("MUSIC", 37),
    enemyLoop: musicAsset("MUSIC", 36),
  },
} as const;

export const STAGE10_MUSIC_PROGRAMS = {
  "stage-10-story-music": {
    id: "stage10-story",
    kind: "loop",
    track: "MAGIC/74",
    source: STAGE10_ASSETS.audio.story,
    seamlessLoop: STAGE10_ASSETS.audio.story,
  },
  "stage-10-player-phase-music": {
    id: "stage10-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE10_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE10_MUSIC_RECORDS.player.loop}`,
    entry: STAGE10_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE10_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-10-enemy-phase-music": {
    id: "stage10-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE10_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE10_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE10_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE10_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage10Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-10-enter-deployment": { type: "enter-deployment" },
    "stage-10-set-victory-999": { type: "victory-state", value: 999 },
    "stage-10-route-to-stage-12": { type: "campaign-route", destination: "stage-12" },
  });
  registerStageStoryPages(STAGE10_STORY_PAGES);
  registerStageMusicPrograms(STAGE10_MUSIC_PROGRAMS);
}

export {
  STAGE10_CONTENT_IDENTITY,
  STAGE10_EVENT_PROGRAM,
  STAGE10_SOURCES,
  STAGE10_STORY_PAGES,
};
