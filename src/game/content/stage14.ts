import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE14_CONSTRUCTION_TOKENS,
  STAGE14_CONTENT_IDENTITY,
  STAGE14_DEPLOYMENT,
  STAGE14_DEPLOYMENT_ACTORS,
  STAGE14_ENEMY_UNITS,
  STAGE14_EVENT_PROGRAM,
  STAGE14_MUSIC_RECORDS,
  STAGE14_OBJECTIVE,
  STAGE14_SOURCES,
  STAGE14_STORY_PAGES,
  STAGE14_TERRAIN_TOKENS_BASE64,
  STAGE14_TITLE,
  STAGE14_TOKEN_TO_SLOT_BASE64,
} from "./stage14-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 14 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE14_TERRAIN_TOKENS = decode(STAGE14_TERRAIN_TOKENS_BASE64);
export const STAGE14_TOKEN_TO_TERRAIN_SLOT = decode(STAGE14_TOKEN_TO_SLOT_BASE64);
export const STAGE14_IRON_PLATE_TERRAIN_SLOT =
  STAGE14_TOKEN_TO_TERRAIN_SLOT[STAGE14_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE14_OBSTACLE_TERRAIN_SLOT =
  STAGE14_TOKEN_TO_TERRAIN_SLOT[STAGE14_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE14_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE14 = {
  id: "stage-14",
  nativeStage: 14,
  name: STAGE14_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 28 },
    originBounds,
  },
} as const;

export const STAGE14_DEFINITION = {
  ...STAGE14,
  contentIdentity: STAGE14_CONTENT_IDENTITY,
  objective: STAGE14_OBJECTIVE,
  deployment: STAGE14_DEPLOYMENT,
  stories: {
    opening: "stage-14-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-14-player-phase-music",
    enemyPhase: "stage-14-enemy-phase-music",
  },
  events: [
    {
      id: "stage-14-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-14-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-14-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-14-opening-story",
    },
    {
      id: "stage-14-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-14-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-14-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-14-route-to-stage-15",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-14">;

registerRuntimeStageDefinition(STAGE14_DEFINITION);

export function stage14TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE14_TOKEN_TO_TERRAIN_SLOT[STAGE14_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE14_SEMANTIC_ALLIED_UNITS = STAGE14_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE14_SEMANTIC_ENEMY_UNITS = STAGE14_ENEMY_UNITS.map((unit) => {
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

export const STAGE14_ASSETS = {
  map: "/assets/original/stage14-map.png",
  minimap: "/assets/original/stage14-minimap.png",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-magic-guide": "/assets/original/technique-lab/units/enemy-magic-guide.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage14-player-entry.wav",
    playerLoop: "/assets/original/battle-stage14-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage14-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage14-enemy-loop.wav",
  },
} as const;

export const STAGE14_MUSIC_PROGRAMS = {
  "stage-14-player-phase-music": {
    id: "stage14-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE14_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE14_MUSIC_RECORDS.player.loop}`,
    entry: STAGE14_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE14_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-14-enemy-phase-music": {
    id: "stage14-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE14_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE14_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE14_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE14_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage14Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-14-enter-deployment": { type: "enter-deployment" },
    "stage-14-set-victory-999": { type: "victory-state", value: 999 },
    "stage-14-route-to-stage-15": { type: "campaign-route", destination: "stage-15" },
  });
  registerStageStoryPages(STAGE14_STORY_PAGES);
  registerStageMusicPrograms(STAGE14_MUSIC_PROGRAMS);
}

export {
  STAGE14_CONTENT_IDENTITY,
  STAGE14_EVENT_PROGRAM,
  STAGE14_SOURCES,
  STAGE14_STORY_PAGES,
};
