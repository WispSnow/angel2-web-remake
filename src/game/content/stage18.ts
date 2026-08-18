import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE18_CONSTRUCTION_TOKENS,
  STAGE18_CONTENT_IDENTITY,
  STAGE18_DEPLOYMENT,
  STAGE18_DEPLOYMENT_ACTORS,
  STAGE18_ENEMY_UNITS,
  STAGE18_EVENT_PROGRAM,
  STAGE18_MUSIC_RECORDS,
  STAGE18_OBJECTIVE,
  STAGE18_SOURCES,
  STAGE18_STORY_PAGES,
  STAGE18_TERRAIN_TOKENS_BASE64,
  STAGE18_TITLE,
  STAGE18_TOKEN_TO_SLOT_BASE64,
} from "./stage18-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 18 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE18_TERRAIN_TOKENS = decode(STAGE18_TERRAIN_TOKENS_BASE64);
export const STAGE18_TOKEN_TO_TERRAIN_SLOT = decode(STAGE18_TOKEN_TO_SLOT_BASE64);
export const STAGE18_IRON_PLATE_TERRAIN_SLOT =
  STAGE18_TOKEN_TO_TERRAIN_SLOT[STAGE18_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE18_OBSTACLE_TERRAIN_SLOT =
  STAGE18_TOKEN_TO_TERRAIN_SLOT[STAGE18_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE18_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE18 = {
  id: "stage-18",
  nativeStage: 18,
  name: STAGE18_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 20, y: 27 },
    originBounds,
  },
} as const;

export const STAGE18_DEFINITION = {
  ...STAGE18,
  contentIdentity: STAGE18_CONTENT_IDENTITY,
  objective: STAGE18_OBJECTIVE,
  deployment: STAGE18_DEPLOYMENT,
  stories: {
    opening: "stage-18-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-18-player-phase-music",
    enemyPhase: "stage-18-enemy-phase-music",
  },
  events: [
    {
      id: "stage-18-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-18-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-18-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-18-opening-story",
    },
    {
      id: "stage-18-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-18-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-18-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-18-route-to-stage-19",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-18">;

registerRuntimeStageDefinition(STAGE18_DEFINITION);

export function stage18TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE18_TOKEN_TO_TERRAIN_SLOT[STAGE18_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE18_SEMANTIC_ALLIED_UNITS = STAGE18_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE18_SEMANTIC_ENEMY_UNITS = STAGE18_ENEMY_UNITS.map((unit) => {
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

export const STAGE18_ASSETS = {
  map: "/assets/original/stage18-map.png",
  minimap: "/assets/original/stage18-minimap.png",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-monk": "/assets/original/technique-lab/units/enemy-monk.png",
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-magic-archer": "/assets/original/technique-lab/units/enemy-magic-archer.png",
    "enemy-crossbow": "/assets/original/technique-lab/units/enemy-crossbow.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 35),
    playerLoop: musicAsset("MUSIC", 34),
    enemyEntry: musicAsset("MUSIC", 23),
    enemyLoop: musicAsset("MUSIC", 22),
  },
} as const;

export const STAGE18_MUSIC_PROGRAMS = {
  "stage-18-player-phase-music": {
    id: "stage18-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE18_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE18_MUSIC_RECORDS.player.loop}`,
    entry: STAGE18_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE18_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-18-enemy-phase-music": {
    id: "stage18-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE18_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE18_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE18_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE18_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage18Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-18-enter-deployment": { type: "enter-deployment" },
    "stage-18-set-victory-999": { type: "victory-state", value: 999 },
    "stage-18-route-to-stage-19": { type: "campaign-route", destination: "stage-19" },
  });
  registerStageStoryPages(STAGE18_STORY_PAGES);
  registerStageMusicPrograms(STAGE18_MUSIC_PROGRAMS);
}

export {
  STAGE18_CONTENT_IDENTITY,
  STAGE18_EVENT_PROGRAM,
  STAGE18_SOURCES,
  STAGE18_STORY_PAGES,
};
