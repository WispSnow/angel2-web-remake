import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE4_CONTENT_IDENTITY,
  STAGE4_DEPLOYMENT,
  STAGE4_DEPLOYMENT_ACTORS,
  STAGE4_ENEMY_UNITS,
  STAGE4_EVENT_PROGRAM,
  STAGE4_FORCE_FIELD_PRESENTATION,
  STAGE4_INITIAL_DANGER_CELLS,
  STAGE4_INITIAL_SAFE_CELLS,
  STAGE4_MUSIC_RECORDS,
  STAGE4_OBJECTIVE,
  STAGE4_PLAYER_CLASS_OVERRIDES,
  STAGE4_ROUTE_PULSE,
  STAGE4_SOURCES,
  STAGE4_STORY_PAGES,
  STAGE4_STORY_PRESENTATION,
  STAGE4_TERRAIN_TOKENS_BASE64,
  STAGE4_TITLE,
  STAGE4_TOKEN_TO_SLOT_BASE64,
} from "./stage4-runtime.generated";
import {
  registerRuntimeStageDefinition,
  type StageDefinition,
  type StageMusicId,
} from "./stages";
import { terrainContentBounds, viewportOriginBoundsForContent } from "./terrain";
import type { RoutePulseDefinition } from "../simulation/route-pulse";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const semanticClassId = (nativeClassRecord: number): UnitClassId => {
  const classId = classIdFromNativeRecord(nativeClassRecord);
  if (!classId) throw new Error(`Unknown stage 4 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE4_TERRAIN_TOKENS = decode(STAGE4_TERRAIN_TOKENS_BASE64);
export const STAGE4_TOKEN_TO_TERRAIN_SLOT = decode(STAGE4_TOKEN_TO_SLOT_BASE64);
export const STAGE4_TERRAIN_CONTENT_BOUNDS = terrainContentBounds(
  STAGE4_TERRAIN_TOKENS,
  50,
  50,
);
export const STAGE4_CAMERA_ORIGIN_BOUNDS = viewportOriginBoundsForContent(
  STAGE4_TERRAIN_CONTENT_BOUNDS,
  { width: 10, height: 7 },
);

export const STAGE4 = {
  id: "stage-04",
  nativeStage: 4,
  name: STAGE4_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 37 },
    originBounds: STAGE4_CAMERA_ORIGIN_BOUNDS,
  },
} as const;

export const STAGE4_DEFINITION = {
  ...STAGE4,
  contentIdentity: STAGE4_CONTENT_IDENTITY,
  objective: STAGE4_OBJECTIVE,
  deployment: STAGE4_DEPLOYMENT,
  stories: {
    prebattle: "stage-04-prebattle-story",
    opening: "stage-04-opening-story",
    roundStarts: [],
    victory: "stage-04-victory-story",
  },
  music: {
    story: "stage-04-story-music",
    playerPhase: "stage-04-player-phase-music",
    enemyPhase: "stage-04-enemy-phase-music",
  },
  events: [
    {
      id: "stage-04-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-04-prebattle-story",
    },
    {
      id: "stage-04-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-04-prebattle-story" },
      simulationEffect: "stage-04-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-04-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-04-opening-story",
    },
    {
      id: "stage-04-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-04-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-04-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-04-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-04-victory-story",
    },
    {
      id: "stage-04-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-04-route-to-stage-05",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-04">;

registerRuntimeStageDefinition(STAGE4_DEFINITION);

export function stage4TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE4.width || position.y >= STAGE4.height) return 0;
  const token = STAGE4_TERRAIN_TOKENS[position.y * STAGE4.width + position.x];
  return STAGE4_TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const STAGE4_SEMANTIC_CLASS_OVERRIDES = STAGE4_PLAYER_CLASS_OVERRIDES.map(
  ({ slot, nativeClassRecord }) => ({ slot, classId: semanticClassId(nativeClassRecord) }),
);

export const STAGE4_SEMANTIC_ALLIED_UNITS = STAGE4_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  initialClassId: STAGE4_SEMANTIC_CLASS_OVERRIDES.find(({ slot }) => slot === actor.slot)?.classId,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: actor.slot === 24 ? 12 : 0,
  untouchedExperience: 299,
}));

export const STAGE4_SEMANTIC_ENEMY_UNITS = STAGE4_ENEMY_UNITS.map((unit) => ({
  ...unit,
  classId: semanticClassId(unit.nativeClassRecord),
  name: "騎士團士兵",
  portrait: 48 as PortraitRecord,
}));

export const STAGE4_ROUTE_PULSE_DEFINITION = STAGE4_ROUTE_PULSE satisfies RoutePulseDefinition;

export const STAGE4_ASSETS = {
  map: "/assets/original/stage4-map.png",
  minimap: "/assets/original/stage4-minimap.png",
  storyBackground: "/assets/original/story-stage4-background.png",
  unitSprites: {
    "ally-magician": "/assets/original/unit-ally-magician.png",
  },
  forceFieldPulse: STAGE4_FORCE_FIELD_PRESENTATION,
  audio: {
    story: "/assets/original/story-stage4.wav",
    playerEntry: "/assets/original/battle-stage4-player-entry.wav",
    playerLoop: "/assets/original/battle-stage4-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage4-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage4-enemy-loop.wav",
  },
} as const;

export const STAGE4_MUSIC_PROGRAMS = {
  "stage-04-story-music": {
    id: "stage4-story",
    kind: "loop",
    track: `MAGIC/${STAGE4_MUSIC_RECORDS.story}`,
    source: STAGE4_ASSETS.audio.story,
    seamlessLoop: STAGE4_ASSETS.audio.story,
  },
  "stage-04-player-phase-music": {
    id: "stage4-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE4_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE4_MUSIC_RECORDS.player.loop}`,
    entry: STAGE4_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE4_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-04-enemy-phase-music": {
    id: "stage4-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE4_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE4_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE4_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE4_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage4Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-04-enter-deployment": { type: "enter-deployment" },
    "stage-04-set-victory-999": { type: "victory-state", value: 999 },
    "stage-04-route-to-stage-05": { type: "campaign-route", destination: "stage-05" },
  });
  registerStageStoryPages(STAGE4_STORY_PAGES);
  registerStageMusicPrograms(STAGE4_MUSIC_PROGRAMS);
}

export {
  STAGE4_EVENT_PROGRAM,
  STAGE4_FORCE_FIELD_PRESENTATION,
  STAGE4_INITIAL_DANGER_CELLS,
  STAGE4_INITIAL_SAFE_CELLS,
  STAGE4_MUSIC_RECORDS,
  STAGE4_SOURCES,
  STAGE4_STORY_PAGES,
  STAGE4_STORY_PRESENTATION,
};
