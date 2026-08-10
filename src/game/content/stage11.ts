import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE11_ALLIED_ACTORS,
  STAGE11_ALLIED_UNITS,
  STAGE11_CONTENT_IDENTITY,
  STAGE11_DEPLOYMENT,
  STAGE11_ENEMY_UNITS,
  STAGE11_EVENT_PROGRAM,
  STAGE11_MUSIC_RECORDS,
  STAGE11_OBJECTIVE,
  STAGE11_REINFORCEMENT_PROGRAM,
  STAGE11_SOURCES,
  STAGE11_STORY_PAGES,
  STAGE11_TERRAIN_TOKENS_BASE64,
  STAGE11_TITLE,
  STAGE11_TOKEN_TO_SLOT_BASE64,
} from "./stage11-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 11 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE11_TERRAIN_TOKENS = decode(STAGE11_TERRAIN_TOKENS_BASE64);
export const STAGE11_TOKEN_TO_TERRAIN_SLOT = decode(STAGE11_TOKEN_TO_SLOT_BASE64);
export const STAGE11_IRON_PLATE_TERRAIN_SLOT = STAGE11_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE11_OBSTACLE_TERRAIN_SLOT = STAGE11_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE11_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE11 = {
  id: "stage-11",
  nativeStage: 11,
  name: STAGE11_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 32 },
    originBounds,
  },
} as const;

export const STAGE11_DEFINITION = {
  ...STAGE11,
  contentIdentity: STAGE11_CONTENT_IDENTITY,
  objective: STAGE11_OBJECTIVE,
  deployment: STAGE11_DEPLOYMENT,
  stories: {
    opening: "stage-11-opening-story",
    roundStarts: [],
    victory: "stage-11-victory-story",
  },
  music: {
    playerPhase: "stage-11-player-phase-music",
    enemyPhase: "stage-11-enemy-phase-music",
  },
  events: [
    {
      id: "stage-11-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-11-opening-story",
    },
    {
      id: "stage-11-dori-departure",
      trigger: { type: "story-completed", storyId: "stage-11-opening-story" },
      simulationEffect: "stage-11-dori-departure",
      presentation: "none",
    },
    {
      id: "stage-11-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-11-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-11-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-11-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-11-victory-story",
    },
    {
      id: "stage-11-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-11-route-to-stage-10",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-11">;

registerRuntimeStageDefinition(STAGE11_DEFINITION);

export function stage11TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE11_TOKEN_TO_TERRAIN_SLOT[STAGE11_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE11_SEMANTIC_ALLIED_UNITS = STAGE11_ALLIED_UNITS.map((unit) => {
  const actor = STAGE11_ALLIED_ACTORS.find(({ slot }) => slot === unit.slot);
  if (!actor) throw new Error(`Missing stage 11 allied actor ${unit.slot}`);
  const genericIdentity = actor.portraitRecord === 255;
  return {
    slot: unit.slot,
    position: unit.position,
    initialClassId: unit.nativeClassRecord === null
      ? undefined
      : semanticClassId(unit.nativeClassRecord),
    name: genericIdentity ? "騎兵" : actor.normalizedName,
    portrait: (genericIdentity ? undefined : actor.portraitRecord) as PortraitRecord | undefined,
    aiBehavior: unit.aiBehavior,
    untouchedExperience: 299,
  };
});

export const STAGE11_SEMANTIC_ENEMY_UNITS = STAGE11_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE11_SEMANTIC_REINFORCEMENTS = {
  ...STAGE11_REINFORCEMENT_PROGRAM,
  candidates: STAGE11_REINFORCEMENT_PROGRAM.candidates.map((candidate) => ({
    ...candidate,
    classId: semanticClassId(candidate.nativeClassRecord),
    name: className(semanticClassId(candidate.nativeClassRecord)),
  })),
};

export const STAGE11_ASSETS = {
  map: "/assets/original/stage11-map.png",
  minimap: "/assets/original/stage11-minimap.png",
  unitSprites: {
    "ally-cavalry": "/assets/original/technique-lab/units/ally-cavalry.png",
    "ally-soldier": "/assets/original/technique-lab/units/ally-soldier.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage11-player-entry.wav",
    playerLoop: "/assets/original/battle-stage11-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage11-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage11-enemy-loop.wav",
  },
} as const;

export const STAGE11_MUSIC_PROGRAMS = {
  "stage-11-player-phase-music": {
    id: "stage11-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE11_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE11_MUSIC_RECORDS.player.loop}`,
    entry: STAGE11_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE11_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-11-enemy-phase-music": {
    id: "stage11-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE11_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE11_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE11_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE11_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage11Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-11-dori-departure": {
      type: "story-departures",
      actors: [{ side: 1, slot: 9 }],
      statusText: "多莉留在飛船上維持高度",
    },
    "stage-11-set-victory-999": { type: "victory-state", value: 999 },
    "stage-11-route-to-stage-10": { type: "campaign-route", destination: "stage-10" },
  });
  registerStageStoryPages(STAGE11_STORY_PAGES);
  registerStageMusicPrograms(STAGE11_MUSIC_PROGRAMS);
}

export {
  STAGE11_CONTENT_IDENTITY,
  STAGE11_EVENT_PROGRAM,
  STAGE11_REINFORCEMENT_PROGRAM,
  STAGE11_SOURCES,
  STAGE11_STORY_PAGES,
};
