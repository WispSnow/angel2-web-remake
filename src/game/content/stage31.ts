import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE31_CONSTRUCTION_TOKENS,
  STAGE31_CONTENT_IDENTITY,
  STAGE31_DEPLOYMENT,
  STAGE31_DEPLOYMENT_ACTORS,
  STAGE31_ENEMY_UNITS,
  STAGE31_EVENT_PROGRAM,
  STAGE31_MUSIC_RECORDS,
  STAGE31_OBJECTIVE,
  STAGE31_SOURCES,
  STAGE31_STORY_PAGES,
  STAGE31_TERRAIN_TOKENS_BASE64,
  STAGE31_TITLE,
  STAGE31_TOKEN_TO_SLOT_BASE64,
} from "./stage31-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 31 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE31_TERRAIN_TOKENS = decode(STAGE31_TERRAIN_TOKENS_BASE64);
export const STAGE31_TOKEN_TO_TERRAIN_SLOT = decode(STAGE31_TOKEN_TO_SLOT_BASE64);
export const STAGE31_IRON_PLATE_TERRAIN_SLOT =
  STAGE31_TOKEN_TO_TERRAIN_SLOT[STAGE31_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE31_OBSTACLE_TERRAIN_SLOT =
  STAGE31_TOKEN_TO_TERRAIN_SLOT[STAGE31_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE31_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE31 = {
  id: "stage-31",
  nativeStage: 31,
  name: STAGE31_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 20, y: 21 },
    originBounds,
  },
} as const;

export const STAGE31_DEFINITION = {
  ...STAGE31,
  contentIdentity: STAGE31_CONTENT_IDENTITY,
  objective: STAGE31_OBJECTIVE,
  deployment: STAGE31_DEPLOYMENT,
  stories: {
    prebattle: "stage-31-prebattle-story",
    opening: "stage-31-opening-story",
    roundStarts: [],
    victory: "stage-31-victory-story",
  },
  music: {
    story: "stage-31-story-music",
    playerPhase: "stage-31-player-phase-music",
    enemyPhase: "stage-31-enemy-phase-music",
  },
  events: [
    {
      id: "stage-31-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-31-prebattle-story",
    },
    {
      id: "stage-31-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-31-prebattle-story" },
      simulationEffect: "stage-31-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-31-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-31-opening-story",
    },
    {
      id: "stage-31-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-31-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-31-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-31-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-31-victory-story",
    },
    {
      id: "stage-31-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-31-route-to-stage-32",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-31">;

registerRuntimeStageDefinition(STAGE31_DEFINITION);

export function stage31TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE31_TOKEN_TO_TERRAIN_SLOT[STAGE31_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE31_SEMANTIC_ALLIED_UNITS = STAGE31_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 7 ? 0 : 299,
}));

export const STAGE31_SEMANTIC_ENEMY_UNITS = STAGE31_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait: ("portraitRecord" in unit
      ? unit.portraitRecord
      : classFallbackPortraitFor(classId, 2)) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE31_ASSETS = {
  map: "/assets/original/stage31-map.png",
  minimap: "/assets/original/stage31-minimap.png",
  storyBackground: "/assets/original/story-stage31-background-23.png",
  unitSprites: {
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-beast-knight": "/assets/original/technique-lab/units/enemy-beast-knight.png",
    "enemy-bone-knight": "/assets/original/technique-lab/units/enemy-bone-knight.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
  },
  audio: {
    story: "/assets/original/story-stage31.wav",
    playerEntry: "/assets/original/battle-stage31-player-entry.wav",
    playerLoop: "/assets/original/battle-stage31-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage31-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage31-enemy-loop.wav",
  },
} as const;

export const STAGE31_MUSIC_PROGRAMS = {
  "stage-31-story-music": {
    id: "stage31-story",
    kind: "loop",
    track: "MAGIC/79",
    source: STAGE31_ASSETS.audio.story,
    seamlessLoop: STAGE31_ASSETS.audio.story,
  },
  "stage-31-player-phase-music": {
    id: "stage31-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE31_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE31_MUSIC_RECORDS.player.loop}`,
    entry: STAGE31_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE31_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-31-enemy-phase-music": {
    id: "stage31-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE31_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE31_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE31_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE31_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage31Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-31-enter-deployment": { type: "enter-deployment" },
    "stage-31-set-victory-999": { type: "victory-state", value: 999 },
    "stage-31-route-to-stage-32": { type: "campaign-route", destination: "stage-32" },
  });
  registerStageStoryPages(STAGE31_STORY_PAGES);
  registerStageMusicPrograms(STAGE31_MUSIC_PROGRAMS);
}

export {
  STAGE31_CONTENT_IDENTITY,
  STAGE31_EVENT_PROGRAM,
  STAGE31_SOURCES,
  STAGE31_STORY_PAGES,
};
