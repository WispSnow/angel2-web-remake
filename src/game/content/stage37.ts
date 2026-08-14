import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE37_CONSTRUCTION_TOKENS,
  STAGE37_CONTENT_IDENTITY,
  STAGE37_DEPLOYMENT,
  STAGE37_DEPLOYMENT_ACTORS,
  STAGE37_ENEMY_UNITS,
  STAGE37_EVENT_PROGRAM,
  STAGE37_MUSIC_RECORDS,
  STAGE37_OBJECTIVE,
  STAGE37_SOURCES,
  STAGE37_STORY_PAGES,
  STAGE37_TERRAIN_TOKENS_BASE64,
  STAGE37_TITLE,
  STAGE37_TOKEN_TO_SLOT_BASE64,
} from "./stage37-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 37 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE37_TERRAIN_TOKENS = decode(STAGE37_TERRAIN_TOKENS_BASE64);
export const STAGE37_TOKEN_TO_TERRAIN_SLOT = decode(STAGE37_TOKEN_TO_SLOT_BASE64);
export const STAGE37_IRON_PLATE_TERRAIN_SLOT =
  STAGE37_TOKEN_TO_TERRAIN_SLOT[STAGE37_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE37_OBSTACLE_TERRAIN_SLOT =
  STAGE37_TOKEN_TO_TERRAIN_SLOT[STAGE37_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE37_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE37 = {
  id: "stage-37",
  nativeStage: 37,
  name: STAGE37_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 19, y: 11 },
    originBounds,
  },
} as const;

export const STAGE37_DEFINITION = {
  ...STAGE37,
  contentIdentity: STAGE37_CONTENT_IDENTITY,
  objective: STAGE37_OBJECTIVE,
  deployment: STAGE37_DEPLOYMENT,
  stories: {
    opening: "stage-37-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-37-player-phase-music",
    enemyPhase: "stage-37-enemy-phase-music",
  },
  events: [
    {
      id: "stage-37-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-37-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-37-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-37-opening-story",
    },
    {
      id: "stage-37-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-37-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-37-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-37-route-to-stage-49",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-37">;

registerRuntimeStageDefinition(STAGE37_DEFINITION);

export function stage37TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE37_TOKEN_TO_TERRAIN_SLOT[STAGE37_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE37_SEMANTIC_ALLIED_UNITS = STAGE37_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 7 ? 0 : 299,
}));

export const STAGE37_SEMANTIC_ENEMY_UNITS = STAGE37_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait: classFallbackPortraitFor(classId, 2) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE37_ASSETS = {
  map: "/assets/original/stage37-map.png",
  minimap: "/assets/original/stage37-minimap.png",
  unitSprites: {
    "enemy-head": "/assets/original/technique-lab/units/enemy-head.png",
    "enemy-hand": "/assets/original/technique-lab/units/enemy-hand.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage37-player-entry.wav",
    playerLoop: "/assets/original/battle-stage37-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage37-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage37-enemy-loop.wav",
  },
} as const;

export const STAGE37_MUSIC_PROGRAMS = {
  "stage-37-player-phase-music": {
    id: "stage37-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE37_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE37_MUSIC_RECORDS.player.loop}`,
    entry: STAGE37_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE37_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-37-enemy-phase-music": {
    id: "stage37-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE37_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE37_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE37_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE37_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage37Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-37-enter-deployment": { type: "enter-deployment" },
    "stage-37-set-victory-999": { type: "victory-state", value: 999 },
    "stage-37-route-to-stage-49": { type: "campaign-route", destination: "stage-49" },
  });
  registerStageStoryPages(STAGE37_STORY_PAGES);
  registerStageMusicPrograms(STAGE37_MUSIC_PROGRAMS);
}

export {
  STAGE37_CONTENT_IDENTITY,
  STAGE37_EVENT_PROGRAM,
  STAGE37_SOURCES,
  STAGE37_STORY_PAGES,
};
