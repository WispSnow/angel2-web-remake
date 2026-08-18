import type { EnemyPhaseTailPresentationDefinition } from "../enemy-phase-tail-presentation";
import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { untouchedEntryExperience } from "./campaign-entry-experience";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE26_COLUMN_PUSH,
  STAGE26_CONSTRUCTION_TOKENS,
  STAGE26_CONTENT_IDENTITY,
  STAGE26_DEPLOYMENT,
  STAGE26_DEPLOYMENT_ACTORS,
  STAGE26_ENEMY_UNITS,
  STAGE26_EVENT_PROGRAM,
  STAGE26_MUSIC_RECORDS,
  STAGE26_OBJECTIVE,
  STAGE26_SOURCES,
  STAGE26_STORY_PAGES,
  STAGE26_TERRAIN_TOKENS_BASE64,
  STAGE26_TITLE,
  STAGE26_TOKEN_TO_SLOT_BASE64,
} from "./stage26-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 26 native class record: ${nativeClassRecord}`);
  return classId;
};

const numberedFramePaths = (directory: string, count: number): string[] =>
  Array.from(
    { length: count },
    (_, index) => `${directory}/${String(index).padStart(2, "0")}.png`,
  );

export const STAGE26_TERRAIN_TOKENS = decode(STAGE26_TERRAIN_TOKENS_BASE64);
export const STAGE26_TOKEN_TO_TERRAIN_SLOT = decode(STAGE26_TOKEN_TO_SLOT_BASE64);
export const STAGE26_IRON_PLATE_TERRAIN_SLOT =
  STAGE26_TOKEN_TO_TERRAIN_SLOT[STAGE26_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE26_OBSTACLE_TERRAIN_SLOT =
  STAGE26_TOKEN_TO_TERRAIN_SLOT[STAGE26_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE26_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE26 = {
  id: "stage-26",
  nativeStage: 26,
  name: STAGE26_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 18, y: 27 },
    originBounds,
  },
} as const;

export const STAGE26_DEFINITION = {
  ...STAGE26,
  contentIdentity: STAGE26_CONTENT_IDENTITY,
  objective: STAGE26_OBJECTIVE,
  deployment: STAGE26_DEPLOYMENT,
  stories: {
    opening: "stage-26-opening-story",
    roundStarts: [],
    victory: "stage-26-victory-story",
  },
  music: {
    playerPhase: "stage-26-player-phase-music",
    enemyPhase: "stage-26-enemy-phase-music",
  },
  events: [
    {
      id: "stage-26-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-26-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-26-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-26-opening-story",
    },
    {
      id: "stage-26-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-26-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-26-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-26-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-26-victory-story",
    },
    {
      id: "stage-26-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-26-route-to-stage-27",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-26">;

registerRuntimeStageDefinition(STAGE26_DEFINITION);

export function stage26TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE26_TOKEN_TO_TERRAIN_SLOT[STAGE26_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE26_SEMANTIC_ALLIED_UNITS = STAGE26_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  // Kins entered the campaign at stage 22 as a record-3 magic priest without
  // the 299-experience baseline used by native class-0 named actors.
  untouchedExperience: untouchedEntryExperience(actor.slot, actor.slot === 7 ? 0 : 299),
}));

export const STAGE26_SEMANTIC_ENEMY_UNITS = STAGE26_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  const portrait = "portraitRecord" in unit
    ? unit.portraitRecord as PortraitRecord
    : classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 26 enemy portrait for native class ${unit.nativeClassRecord}`);
  }
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE26_COLUMN_PUSH_PRESENTATION = {
  id: STAGE26_COLUMN_PUSH.presentationId,
  phase1: {
    frames: numberedFramePaths("/assets/original/stage26-column-push/phase1", 30),
    descriptors: STAGE26_COLUMN_PUSH.phase1Descriptors,
    waitPerDescriptorNativeTicks: STAGE26_COLUMN_PUSH.waitPerPhaseDescriptorNativeTicks,
  },
  phase2: {
    frames: numberedFramePaths("/assets/original/stage26-column-push/phase2", 11),
    descriptors: STAGE26_COLUMN_PUSH.phase2Descriptors,
    waitPerDescriptorNativeTicks: STAGE26_COLUMN_PUSH.waitPerPhaseDescriptorNativeTicks,
  },
  sweep: {
    descriptorSequence: STAGE26_COLUMN_PUSH.sweepDescriptorSequence,
    waitPerDescriptorNativeTicks: STAGE26_COLUMN_PUSH.waitPerSweepDescriptorNativeTicks,
  },
} as const satisfies EnemyPhaseTailPresentationDefinition;

export const STAGE26_ASSETS = {
  map: "/assets/original/stage26-map.png",
  minimap: "/assets/original/stage26-minimap.png",
  unitSprites: {
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
  },
  enemyPhaseTailPresentations: [STAGE26_COLUMN_PUSH_PRESENTATION],
  audio: {
    playerEntry: musicAsset("MUSIC", 29),
    playerLoop: musicAsset("MUSIC", 28),
    enemyEntry: musicAsset("MUSIC", 27),
    enemyLoop: musicAsset("MUSIC", 26),
  },
} as const;

export const STAGE26_MUSIC_PROGRAMS = {
  "stage-26-player-phase-music": {
    id: "stage26-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE26_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE26_MUSIC_RECORDS.player.loop}`,
    entry: STAGE26_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE26_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-26-enemy-phase-music": {
    id: "stage26-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE26_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE26_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE26_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE26_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage26Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-26-enter-deployment": { type: "enter-deployment" },
    "stage-26-set-victory-999": { type: "victory-state", value: 999 },
    "stage-26-route-to-stage-27": { type: "campaign-route", destination: "stage-27" },
  });
  registerStageStoryPages(STAGE26_STORY_PAGES);
  registerStageMusicPrograms(STAGE26_MUSIC_PROGRAMS);
}

export {
  STAGE26_CONTENT_IDENTITY,
  STAGE26_EVENT_PROGRAM,
  STAGE26_SOURCES,
  STAGE26_STORY_PAGES,
};
