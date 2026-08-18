import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE15_CONSTRUCTION_TOKENS,
  STAGE15_CONTENT_IDENTITY,
  STAGE15_DEPLOYMENT,
  STAGE15_DEPLOYMENT_ACTORS,
  STAGE15_ENEMY_UNITS,
  STAGE15_EVENT_PROGRAM,
  STAGE15_MUSIC_RECORDS,
  STAGE15_OBJECTIVE,
  STAGE15_SOURCES,
  STAGE15_STORY_PAGES,
  STAGE15_TERRAIN_TOKENS_BASE64,
  STAGE15_TITLE,
  STAGE15_TOKEN_TO_SLOT_BASE64,
} from "./stage15-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 15 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE15_TERRAIN_TOKENS = decode(STAGE15_TERRAIN_TOKENS_BASE64);
export const STAGE15_TOKEN_TO_TERRAIN_SLOT = decode(STAGE15_TOKEN_TO_SLOT_BASE64);
export const STAGE15_IRON_PLATE_TERRAIN_SLOT =
  STAGE15_TOKEN_TO_TERRAIN_SLOT[STAGE15_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE15_OBSTACLE_TERRAIN_SLOT =
  STAGE15_TOKEN_TO_TERRAIN_SLOT[STAGE15_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE15_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE15 = {
  id: "stage-15",
  nativeStage: 15,
  name: STAGE15_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 28 },
    originBounds,
  },
} as const;

export const STAGE15_DEFINITION = {
  ...STAGE15,
  contentIdentity: STAGE15_CONTENT_IDENTITY,
  objective: STAGE15_OBJECTIVE,
  deployment: STAGE15_DEPLOYMENT,
  stories: {
    opening: "stage-15-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-15-player-phase-music",
    enemyPhase: "stage-15-enemy-phase-music",
  },
  events: [
    {
      id: "stage-15-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-15-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-15-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-15-opening-story",
    },
    {
      id: "stage-15-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-15-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-15-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-15-route-to-stage-16",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-15">;

registerRuntimeStageDefinition(STAGE15_DEFINITION);

export function stage15TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE15_TOKEN_TO_TERRAIN_SLOT[STAGE15_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE15_SEMANTIC_ALLIED_UNITS = STAGE15_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE15_SEMANTIC_ENEMY_UNITS = STAGE15_ENEMY_UNITS.map((unit) => {
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

export const STAGE15_ASSETS = {
  map: "/assets/original/stage14-map.png",
  minimap: "/assets/original/stage14-minimap.png",
  unitSprites: {
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 19),
    playerLoop: musicAsset("MUSIC", 18),
    enemyEntry: musicAsset("MUSIC", 21),
    enemyLoop: musicAsset("MUSIC", 20),
  },
} as const;

export const STAGE15_MUSIC_PROGRAMS = {
  "stage-15-player-phase-music": {
    id: "stage15-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE15_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE15_MUSIC_RECORDS.player.loop}`,
    entry: STAGE15_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE15_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-15-enemy-phase-music": {
    id: "stage15-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE15_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE15_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE15_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE15_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage15Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-15-enter-deployment": { type: "enter-deployment" },
    "stage-15-set-victory-999": { type: "victory-state", value: 999 },
    "stage-15-route-to-stage-16": { type: "campaign-route", destination: "stage-16" },
  });
  registerStageStoryPages(STAGE15_STORY_PAGES);
  registerStageMusicPrograms(STAGE15_MUSIC_PROGRAMS);
}

export {
  STAGE15_CONTENT_IDENTITY,
  STAGE15_EVENT_PROGRAM,
  STAGE15_SOURCES,
  STAGE15_STORY_PAGES,
};
