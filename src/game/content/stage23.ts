import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE23_CONSTRUCTION_TOKENS,
  STAGE23_CONTENT_IDENTITY,
  STAGE23_DEPLOYMENT,
  STAGE23_DEPLOYMENT_ACTORS,
  STAGE23_ENEMY_UNITS,
  STAGE23_EVENT_PROGRAM,
  STAGE23_MUSIC_RECORDS,
  STAGE23_OBJECTIVE,
  STAGE23_SOURCES,
  STAGE23_STORY_PAGES,
  STAGE23_TERRAIN_TOKENS_BASE64,
  STAGE23_TITLE,
  STAGE23_TOKEN_TO_SLOT_BASE64,
} from "./stage23-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 23 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE23_TERRAIN_TOKENS = decode(STAGE23_TERRAIN_TOKENS_BASE64);
export const STAGE23_TOKEN_TO_TERRAIN_SLOT = decode(STAGE23_TOKEN_TO_SLOT_BASE64);
export const STAGE23_IRON_PLATE_TERRAIN_SLOT =
  STAGE23_TOKEN_TO_TERRAIN_SLOT[STAGE23_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE23_OBSTACLE_TERRAIN_SLOT =
  STAGE23_TOKEN_TO_TERRAIN_SLOT[STAGE23_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE23_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE23 = {
  id: "stage-23",
  nativeStage: 23,
  name: STAGE23_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 33 },
    originBounds,
  },
} as const;

export const STAGE23_DEFINITION = {
  ...STAGE23,
  contentIdentity: STAGE23_CONTENT_IDENTITY,
  objective: STAGE23_OBJECTIVE,
  deployment: STAGE23_DEPLOYMENT,
  stories: {
    prebattle: "stage-23-prebattle-story",
    opening: "stage-23-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-23-player-phase-music",
    enemyPhase: "stage-23-enemy-phase-music",
  },
  events: [
    {
      id: "stage-23-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-23-prebattle-story",
    },
    {
      id: "stage-23-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-23-prebattle-story" },
      simulationEffect: "stage-23-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-23-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-23-opening-story",
    },
    {
      id: "stage-23-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-23-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-23-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-23-route-to-stage-24",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-23">;

registerRuntimeStageDefinition(STAGE23_DEFINITION);

export function stage23TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE23_TOKEN_TO_TERRAIN_SLOT[STAGE23_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE23_SEMANTIC_ALLIED_UNITS = STAGE23_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE23_SEMANTIC_ENEMY_UNITS = STAGE23_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  const portrait = classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 23 enemy portrait for native class ${unit.nativeClassRecord}`);
  }
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE23_ASSETS = {
  map: "/assets/original/stage23-map.png",
  minimap: "/assets/original/stage23-minimap.png",
  storyBackground: "/assets/original/story-stage23-background.svg",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-magic-archer": "/assets/original/technique-lab/units/enemy-magic-archer.png",
    "enemy-flying-dragon-knight": "/assets/original/technique-lab/units/enemy-flying-dragon-knight.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
    "enemy-crossbow": "/assets/original/technique-lab/units/enemy-crossbow.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage23-player-entry.wav",
    playerLoop: "/assets/original/battle-stage23-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage23-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage23-enemy-loop.wav",
  },
} as const;

export const STAGE23_MUSIC_PROGRAMS = {
  "stage-23-player-phase-music": {
    id: "stage23-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE23_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE23_MUSIC_RECORDS.player.loop}`,
    entry: STAGE23_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE23_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-23-enemy-phase-music": {
    id: "stage23-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE23_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE23_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE23_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE23_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage23Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-23-enter-deployment": { type: "enter-deployment" },
    "stage-23-set-victory-999": { type: "victory-state", value: 999 },
    "stage-23-route-to-stage-24": { type: "campaign-route", destination: "stage-24" },
  });
  registerStageStoryPages(STAGE23_STORY_PAGES);
  registerStageMusicPrograms(STAGE23_MUSIC_PROGRAMS);
}

export {
  STAGE23_CONTENT_IDENTITY,
  STAGE23_EVENT_PROGRAM,
  STAGE23_SOURCES,
  STAGE23_STORY_PAGES,
};
