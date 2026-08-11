import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE19_CONSTRUCTION_TOKENS,
  STAGE19_CONTENT_IDENTITY,
  STAGE19_DEPLOYMENT,
  STAGE19_DEPLOYMENT_ACTORS,
  STAGE19_ENEMY_UNITS,
  STAGE19_EVENT_PROGRAM,
  STAGE19_MUSIC_RECORDS,
  STAGE19_OBJECTIVE,
  STAGE19_SOURCES,
  STAGE19_STORY_PAGES,
  STAGE19_TERRAIN_TOKENS_BASE64,
  STAGE19_TITLE,
  STAGE19_TOKEN_TO_SLOT_BASE64,
} from "./stage19-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 19 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE19_TERRAIN_TOKENS = decode(STAGE19_TERRAIN_TOKENS_BASE64);
export const STAGE19_TOKEN_TO_TERRAIN_SLOT = decode(STAGE19_TOKEN_TO_SLOT_BASE64);
export const STAGE19_IRON_PLATE_TERRAIN_SLOT =
  STAGE19_TOKEN_TO_TERRAIN_SLOT[STAGE19_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE19_OBSTACLE_TERRAIN_SLOT =
  STAGE19_TOKEN_TO_TERRAIN_SLOT[STAGE19_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE19_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE19 = {
  id: "stage-19",
  nativeStage: 19,
  name: STAGE19_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 28 },
    originBounds,
  },
} as const;

export const STAGE19_DEFINITION = {
  ...STAGE19,
  contentIdentity: STAGE19_CONTENT_IDENTITY,
  objective: STAGE19_OBJECTIVE,
  deployment: STAGE19_DEPLOYMENT,
  stories: {
    opening: "stage-19-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-19-player-phase-music",
    enemyPhase: "stage-19-enemy-phase-music",
  },
  events: [
    {
      id: "stage-19-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-19-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-19-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-19-opening-story",
    },
    {
      id: "stage-19-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-19-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-19-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-19-route-to-stage-20",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-19">;

registerRuntimeStageDefinition(STAGE19_DEFINITION);

export function stage19TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE19_TOKEN_TO_TERRAIN_SLOT[STAGE19_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE19_SEMANTIC_ALLIED_UNITS = STAGE19_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE19_SEMANTIC_ENEMY_UNITS = STAGE19_ENEMY_UNITS.map((unit) => {
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

export const STAGE19_ASSETS = {
  map: "/assets/original/stage19-map.png",
  minimap: "/assets/original/stage19-minimap.png",
  unitSprites: {
    "enemy-warrior": "/assets/original/technique-lab/units/enemy-warrior.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-priest": "/assets/original/technique-lab/units/enemy-priest.png",
    "enemy-monk": "/assets/original/technique-lab/units/enemy-monk.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage19-player-entry.wav",
    playerLoop: "/assets/original/battle-stage19-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage19-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage19-enemy-loop.wav",
  },
} as const;

export const STAGE19_MUSIC_PROGRAMS = {
  "stage-19-player-phase-music": {
    id: "stage19-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE19_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE19_MUSIC_RECORDS.player.loop}`,
    entry: STAGE19_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE19_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-19-enemy-phase-music": {
    id: "stage19-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE19_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE19_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE19_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE19_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage19Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-19-enter-deployment": { type: "enter-deployment" },
    "stage-19-set-victory-999": { type: "victory-state", value: 999 },
    "stage-19-route-to-stage-20": { type: "campaign-route", destination: "stage-20" },
  });
  registerStageStoryPages(STAGE19_STORY_PAGES);
  registerStageMusicPrograms(STAGE19_MUSIC_PROGRAMS);
}

export {
  STAGE19_CONTENT_IDENTITY,
  STAGE19_EVENT_PROGRAM,
  STAGE19_SOURCES,
  STAGE19_STORY_PAGES,
};
