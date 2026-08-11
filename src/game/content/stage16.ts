import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE16_CONSTRUCTION_TOKENS,
  STAGE16_CONTENT_IDENTITY,
  STAGE16_DEPLOYMENT,
  STAGE16_DEPLOYMENT_ACTORS,
  STAGE16_ENEMY_UNITS,
  STAGE16_EVENT_PROGRAM,
  STAGE16_MUSIC_RECORDS,
  STAGE16_OBJECTIVE,
  STAGE16_SOURCES,
  STAGE16_STORY_PAGES,
  STAGE16_TERRAIN_TOKENS_BASE64,
  STAGE16_TITLE,
  STAGE16_TOKEN_TO_SLOT_BASE64,
} from "./stage16-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 16 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE16_TERRAIN_TOKENS = decode(STAGE16_TERRAIN_TOKENS_BASE64);
export const STAGE16_TOKEN_TO_TERRAIN_SLOT = decode(STAGE16_TOKEN_TO_SLOT_BASE64);
export const STAGE16_IRON_PLATE_TERRAIN_SLOT =
  STAGE16_TOKEN_TO_TERRAIN_SLOT[STAGE16_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE16_OBSTACLE_TERRAIN_SLOT =
  STAGE16_TOKEN_TO_TERRAIN_SLOT[STAGE16_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE16_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE16 = {
  id: "stage-16",
  nativeStage: 16,
  name: STAGE16_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 28 },
    originBounds,
  },
} as const;

export const STAGE16_DEFINITION = {
  ...STAGE16,
  contentIdentity: STAGE16_CONTENT_IDENTITY,
  objective: STAGE16_OBJECTIVE,
  deployment: STAGE16_DEPLOYMENT,
  stories: {
    opening: "stage-16-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-16-player-phase-music",
    enemyPhase: "stage-16-enemy-phase-music",
  },
  events: [
    {
      id: "stage-16-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-16-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-16-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-16-opening-story",
    },
    {
      id: "stage-16-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-16-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-16-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-16-route-to-stage-17",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-16">;

registerRuntimeStageDefinition(STAGE16_DEFINITION);

export function stage16TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE16_TOKEN_TO_TERRAIN_SLOT[STAGE16_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE16_SEMANTIC_ALLIED_UNITS = STAGE16_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE16_SEMANTIC_ENEMY_UNITS = STAGE16_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    ...("portraitRecord" in unit
      ? { portrait: unit.portraitRecord as PortraitRecord }
      : {}),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE16_ASSETS = {
  map: "/assets/original/stage16-map.png",
  minimap: "/assets/original/stage16-minimap.png",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage16-player-entry.wav",
    playerLoop: "/assets/original/battle-stage16-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage16-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage16-enemy-loop.wav",
  },
} as const;

export const STAGE16_MUSIC_PROGRAMS = {
  "stage-16-player-phase-music": {
    id: "stage16-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE16_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE16_MUSIC_RECORDS.player.loop}`,
    entry: STAGE16_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE16_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-16-enemy-phase-music": {
    id: "stage16-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE16_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE16_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE16_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE16_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage16Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-16-enter-deployment": { type: "enter-deployment" },
    "stage-16-set-victory-999": { type: "victory-state", value: 999 },
    "stage-16-route-to-stage-17": { type: "campaign-route", destination: "stage-17" },
  });
  registerStageStoryPages(STAGE16_STORY_PAGES);
  registerStageMusicPrograms(STAGE16_MUSIC_PROGRAMS);
}

export {
  STAGE16_CONTENT_IDENTITY,
  STAGE16_EVENT_PROGRAM,
  STAGE16_SOURCES,
  STAGE16_STORY_PAGES,
};
