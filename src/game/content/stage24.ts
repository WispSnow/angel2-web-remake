import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE24_CONSTRUCTION_TOKENS,
  STAGE24_CONTENT_IDENTITY,
  STAGE24_DEPLOYMENT,
  STAGE24_DEPLOYMENT_ACTORS,
  STAGE24_ENEMY_UNITS,
  STAGE24_EVENT_PROGRAM,
  STAGE24_MUSIC_RECORDS,
  STAGE24_OBJECTIVE,
  STAGE24_SOURCES,
  STAGE24_STORY_PAGES,
  STAGE24_TERRAIN_TOKENS_BASE64,
  STAGE24_TITLE,
  STAGE24_TOKEN_TO_SLOT_BASE64,
} from "./stage24-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 24 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE24_TERRAIN_TOKENS = decode(STAGE24_TERRAIN_TOKENS_BASE64);
export const STAGE24_TOKEN_TO_TERRAIN_SLOT = decode(STAGE24_TOKEN_TO_SLOT_BASE64);
export const STAGE24_IRON_PLATE_TERRAIN_SLOT =
  STAGE24_TOKEN_TO_TERRAIN_SLOT[STAGE24_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE24_OBSTACLE_TERRAIN_SLOT =
  STAGE24_TOKEN_TO_TERRAIN_SLOT[STAGE24_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE24_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE24 = {
  id: "stage-24",
  nativeStage: 24,
  name: STAGE24_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 23, y: 34 },
    originBounds,
  },
} as const;

export const STAGE24_DEFINITION = {
  ...STAGE24,
  contentIdentity: STAGE24_CONTENT_IDENTITY,
  objective: STAGE24_OBJECTIVE,
  deployment: STAGE24_DEPLOYMENT,
  stories: {
    opening: "stage-24-opening-story",
    roundStarts: [],
    victory: "stage-24-victory-story",
  },
  music: {
    playerPhase: "stage-24-player-phase-music",
    enemyPhase: "stage-24-enemy-phase-music",
  },
  events: [
    {
      id: "stage-24-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-24-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-24-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-24-opening-story",
    },
    {
      id: "stage-24-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-24-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-24-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-24-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-24-victory-story",
    },
    {
      id: "stage-24-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-24-route-to-stage-26",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-24">;

registerRuntimeStageDefinition(STAGE24_DEFINITION);

export function stage24TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE24_TOKEN_TO_TERRAIN_SLOT[STAGE24_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE24_SEMANTIC_ALLIED_UNITS = STAGE24_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE24_SEMANTIC_ENEMY_UNITS = STAGE24_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  const portrait = classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 24 enemy portrait for native class ${unit.nativeClassRecord}`);
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

export const STAGE24_ASSETS = {
  map: "/assets/original/stage24-map.png",
  minimap: "/assets/original/stage24-minimap.png",
  unitSprites: {
    "enemy-bone-knight": "/assets/original/technique-lab/units/enemy-bone-knight.png",
    "enemy-crossbow": "/assets/original/technique-lab/units/enemy-crossbow.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-jungle-warrior": "/assets/original/technique-lab/units/enemy-jungle-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage24-player-entry.wav",
    playerLoop: "/assets/original/battle-stage24-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage24-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage24-enemy-loop.wav",
  },
} as const;

export const STAGE24_MUSIC_PROGRAMS = {
  "stage-24-player-phase-music": {
    id: "stage24-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE24_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE24_MUSIC_RECORDS.player.loop}`,
    entry: STAGE24_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE24_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-24-enemy-phase-music": {
    id: "stage24-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE24_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE24_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE24_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE24_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage24Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-24-enter-deployment": { type: "enter-deployment" },
    "stage-24-set-victory-999": { type: "victory-state", value: 999 },
    "stage-24-route-to-stage-26": { type: "campaign-route", destination: "stage-26" },
  });
  registerStageStoryPages(STAGE24_STORY_PAGES);
  registerStageMusicPrograms(STAGE24_MUSIC_PROGRAMS);
}

export {
  STAGE24_CONTENT_IDENTITY,
  STAGE24_EVENT_PROGRAM,
  STAGE24_SOURCES,
  STAGE24_STORY_PAGES,
};
