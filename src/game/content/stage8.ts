import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE8_ALLIED_ACTORS,
  STAGE8_ALLIED_UNITS,
  STAGE8_CONTENT_IDENTITY,
  STAGE8_DEPLOYMENT,
  STAGE8_ENEMY_UNITS,
  STAGE8_EVENT_PROGRAM,
  STAGE8_MUSIC_RECORDS,
  STAGE8_OBJECTIVE,
  STAGE8_SOURCES,
  STAGE8_STORY_PAGES,
  STAGE8_TERRAIN_TOKENS_BASE64,
  STAGE8_TITLE,
  STAGE8_TOKEN_TO_SLOT_BASE64,
} from "./stage8-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 8 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE8_TERRAIN_TOKENS = decode(STAGE8_TERRAIN_TOKENS_BASE64);
export const STAGE8_TOKEN_TO_TERRAIN_SLOT = decode(STAGE8_TOKEN_TO_SLOT_BASE64);
export const STAGE8_IRON_PLATE_TERRAIN_SLOT = STAGE8_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE8_OBSTACLE_TERRAIN_SLOT = STAGE8_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE8_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE8 = {
  id: "stage-08",
  nativeStage: 8,
  name: STAGE8_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 18, y: 27 },
    originBounds,
  },
} as const;

export const STAGE8_DEFINITION = {
  ...STAGE8,
  contentIdentity: STAGE8_CONTENT_IDENTITY,
  objective: STAGE8_OBJECTIVE,
  deployment: STAGE8_DEPLOYMENT,
  stories: {
    prebattle: "stage-08-prebattle-story",
    opening: "stage-08-opening-story",
    roundStarts: [],
    victory: "stage-08-victory-story",
  },
  music: {
    story: "stage-08-story-music",
    playerPhase: "stage-08-player-phase-music",
    enemyPhase: "stage-08-enemy-phase-music",
  },
  events: [
    {
      id: "stage-08-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-08-prebattle-story",
    },
    {
      id: "stage-08-opening-story",
      trigger: { type: "story-completed", storyId: "stage-08-prebattle-story" },
      simulationEffect: "none",
      presentation: "stage-08-opening-story",
    },
    {
      id: "stage-08-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-08-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-08-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-08-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-08-victory-story",
    },
    {
      id: "stage-08-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-08-route-to-stage-09",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-08">;

registerRuntimeStageDefinition(STAGE8_DEFINITION);

export function stage8TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE8_TOKEN_TO_TERRAIN_SLOT[STAGE8_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE8_SEMANTIC_ALLIED_UNITS = STAGE8_ALLIED_UNITS.map((unit) => {
  const actor = STAGE8_ALLIED_ACTORS.find(({ slot }) => slot === unit.slot);
  if (!actor) throw new Error(`Missing stage 8 allied actor ${unit.slot}`);
  const genericIdentity = actor.portraitRecord === 255;
  return {
    slot: unit.slot,
    position: unit.position,
    forcedClassId: unit.nativeClassRecord === null
      ? undefined
      : semanticClassId(unit.nativeClassRecord),
    name: genericIdentity ? "遊騎兵" : actor.normalizedName,
    portrait: (genericIdentity ? undefined : actor.portraitRecord) as PortraitRecord | undefined,
    aiBehavior: unit.aiBehavior,
    untouchedExperience: 299,
  };
});

export const STAGE8_SEMANTIC_ENEMY_UNITS = STAGE8_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE8_ASSETS = {
  map: "/assets/original/stage8-map.png",
  minimap: "/assets/original/stage8-minimap.png",
  storyBackgrounds: {
    6: "/assets/original/story-stage8-background-6.png",
    7: "/assets/original/story-stage8-background-7.png",
    8: "/assets/original/story-stage8-background-8.png",
  },
  unitSprites: {
    "ally-cavalry": "/assets/original/technique-lab/units/ally-cavalry.png",
    "ally-soldier": "/assets/original/technique-lab/units/ally-soldier.png",
    "enemy-cavalry": "/assets/original/technique-lab/units/enemy-cavalry.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-soldier": "/assets/original/technique-lab/units/enemy-soldier.png",
  },
  audio: {
    story: "/assets/original/story-stage8.wav",
    playerEntry: "/assets/original/battle-stage8-player-entry.wav",
    playerLoop: "/assets/original/battle-stage8-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage8-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage8-enemy-loop.wav",
  },
} as const;

export const STAGE8_MUSIC_PROGRAMS = {
  "stage-08-story-music": {
    id: "stage8-story",
    kind: "loop",
    track: "MAGIC/72",
    source: STAGE8_ASSETS.audio.story,
    seamlessLoop: STAGE8_ASSETS.audio.story,
  },
  "stage-08-player-phase-music": {
    id: "stage8-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE8_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE8_MUSIC_RECORDS.player.loop}`,
    entry: STAGE8_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE8_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-08-enemy-phase-music": {
    id: "stage8-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE8_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE8_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE8_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE8_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage8Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-08-set-victory-999": { type: "victory-state", value: 999 },
    "stage-08-route-to-stage-09": { type: "campaign-route", destination: "stage-09" },
  });
  registerStageStoryPages(STAGE8_STORY_PAGES);
  registerStageMusicPrograms(STAGE8_MUSIC_PROGRAMS);
}

export {
  STAGE8_CONTENT_IDENTITY,
  STAGE8_EVENT_PROGRAM,
  STAGE8_SOURCES,
  STAGE8_STORY_PAGES,
};
