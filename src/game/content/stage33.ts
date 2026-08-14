import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE33_CONSTRUCTION_TOKENS,
  STAGE33_CONTENT_IDENTITY,
  STAGE33_DEPLOYMENT,
  STAGE33_DEPLOYMENT_ACTORS,
  STAGE33_ENEMY_UNITS,
  STAGE33_EVENT_PROGRAM,
  STAGE33_MUSIC_RECORDS,
  STAGE33_OBJECTIVE,
  STAGE33_SOURCES,
  STAGE33_STORY_PAGES,
  STAGE33_TERRAIN_TOKENS_BASE64,
  STAGE33_TITLE,
  STAGE33_TOKEN_TO_SLOT_BASE64,
} from "./stage33-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 33 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE33_TERRAIN_TOKENS = decode(STAGE33_TERRAIN_TOKENS_BASE64);
export const STAGE33_TOKEN_TO_TERRAIN_SLOT = decode(STAGE33_TOKEN_TO_SLOT_BASE64);
export const STAGE33_IRON_PLATE_TERRAIN_SLOT =
  STAGE33_TOKEN_TO_TERRAIN_SLOT[STAGE33_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE33_OBSTACLE_TERRAIN_SLOT =
  STAGE33_TOKEN_TO_TERRAIN_SLOT[STAGE33_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE33_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE33 = {
  id: "stage-33",
  nativeStage: 33,
  name: STAGE33_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 23, y: 39 },
    originBounds,
  },
} as const;

export const STAGE33_DEFINITION = {
  ...STAGE33,
  contentIdentity: STAGE33_CONTENT_IDENTITY,
  objective: STAGE33_OBJECTIVE,
  deployment: STAGE33_DEPLOYMENT,
  stories: {
    opening: "stage-33-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-33-player-phase-music",
    enemyPhase: "stage-33-enemy-phase-music",
  },
  events: [
    {
      id: "stage-33-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-33-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-33-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-33-opening-story",
    },
    {
      id: "stage-33-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-33-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-33-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-33-route-to-stage-34",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-33">;

registerRuntimeStageDefinition(STAGE33_DEFINITION);

export function stage33TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE33_TOKEN_TO_TERRAIN_SLOT[STAGE33_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE33_SEMANTIC_ALLIED_UNITS = STAGE33_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 7 ? 0 : 299,
}));

export const STAGE33_SEMANTIC_ENEMY_UNITS = STAGE33_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait: ("portraitRecord" in unit
      ? unit.portraitRecord
      : classFallbackPortraitFor(classId, 2)) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE33_ASSETS = {
  map: "/assets/original/stage33-map.png",
  minimap: "/assets/original/stage33-minimap.png",
  unitSprites: {
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-beast-knight": "/assets/original/technique-lab/units/enemy-beast-knight.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
    "enemy-prayer-guide": "/assets/original/technique-lab/units/enemy-prayer-guide.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-wizard": "/assets/original/technique-lab/units/enemy-wizard.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage33-player-entry.wav",
    playerLoop: "/assets/original/battle-stage33-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage33-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage33-enemy-loop.wav",
  },
} as const;

export const STAGE33_MUSIC_PROGRAMS = {
  "stage-33-player-phase-music": {
    id: "stage33-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE33_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE33_MUSIC_RECORDS.player.loop}`,
    entry: STAGE33_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE33_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-33-enemy-phase-music": {
    id: "stage33-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE33_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE33_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE33_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE33_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage33Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-33-enter-deployment": { type: "enter-deployment" },
    "stage-33-set-victory-999": { type: "victory-state", value: 999 },
    "stage-33-route-to-stage-34": { type: "campaign-route", destination: "stage-34" },
  });
  registerStageStoryPages(STAGE33_STORY_PAGES);
  registerStageMusicPrograms(STAGE33_MUSIC_PROGRAMS);
}

export {
  STAGE33_CONTENT_IDENTITY,
  STAGE33_EVENT_PROGRAM,
  STAGE33_SOURCES,
  STAGE33_STORY_PAGES,
};
