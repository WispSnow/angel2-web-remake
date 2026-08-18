import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE17_CONSTRUCTION_TOKENS,
  STAGE17_CONTENT_IDENTITY,
  STAGE17_DEPLOYMENT,
  STAGE17_DEPLOYMENT_ACTORS,
  STAGE17_ENEMY_UNITS,
  STAGE17_EVENT_PROGRAM,
  STAGE17_MUSIC_RECORDS,
  STAGE17_OBJECTIVE,
  STAGE17_SOURCES,
  STAGE17_STORY_PAGES,
  STAGE17_TERRAIN_TOKENS_BASE64,
  STAGE17_TITLE,
  STAGE17_TOKEN_TO_SLOT_BASE64,
} from "./stage17-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 17 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE17_TERRAIN_TOKENS = decode(STAGE17_TERRAIN_TOKENS_BASE64);
export const STAGE17_TOKEN_TO_TERRAIN_SLOT = decode(STAGE17_TOKEN_TO_SLOT_BASE64);
export const STAGE17_IRON_PLATE_TERRAIN_SLOT =
  STAGE17_TOKEN_TO_TERRAIN_SLOT[STAGE17_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE17_OBSTACLE_TERRAIN_SLOT =
  STAGE17_TOKEN_TO_TERRAIN_SLOT[STAGE17_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE17_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE17 = {
  id: "stage-17",
  nativeStage: 17,
  name: STAGE17_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 21 },
    originBounds,
  },
} as const;

export const STAGE17_DEFINITION = {
  ...STAGE17,
  contentIdentity: STAGE17_CONTENT_IDENTITY,
  objective: STAGE17_OBJECTIVE,
  deployment: STAGE17_DEPLOYMENT,
  stories: {
    opening: "stage-17-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-17-player-phase-music",
    enemyPhase: "stage-17-enemy-phase-music",
  },
  events: [
    {
      id: "stage-17-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-17-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-17-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-17-opening-story",
    },
    {
      id: "stage-17-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-17-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-17-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-17-route-to-stage-18",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-17">;

registerRuntimeStageDefinition(STAGE17_DEFINITION);

export function stage17TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE17_TOKEN_TO_TERRAIN_SLOT[STAGE17_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE17_SEMANTIC_ALLIED_UNITS = STAGE17_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE17_SEMANTIC_ENEMY_UNITS = STAGE17_ENEMY_UNITS.map((unit) => {
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

export const STAGE17_ASSETS = {
  map: "/assets/original/stage17-map.png",
  minimap: "/assets/original/stage17-minimap.png",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-monk": "/assets/original/technique-lab/units/enemy-monk.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-priest": "/assets/original/technique-lab/units/enemy-priest.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 7),
    playerLoop: musicAsset("MUSIC", 6),
    enemyEntry: musicAsset("MUSIC", 21),
    enemyLoop: musicAsset("MUSIC", 20),
  },
} as const;

export const STAGE17_MUSIC_PROGRAMS = {
  "stage-17-player-phase-music": {
    id: "stage17-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE17_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE17_MUSIC_RECORDS.player.loop}`,
    entry: STAGE17_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE17_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-17-enemy-phase-music": {
    id: "stage17-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE17_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE17_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE17_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE17_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage17Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-17-enter-deployment": { type: "enter-deployment" },
    "stage-17-set-victory-999": { type: "victory-state", value: 999 },
    "stage-17-route-to-stage-18": { type: "campaign-route", destination: "stage-18" },
  });
  registerStageStoryPages(STAGE17_STORY_PAGES);
  registerStageMusicPrograms(STAGE17_MUSIC_PROGRAMS);
}

export {
  STAGE17_CONTENT_IDENTITY,
  STAGE17_EVENT_PROGRAM,
  STAGE17_SOURCES,
  STAGE17_STORY_PAGES,
};
