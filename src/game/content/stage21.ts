import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE21_CONSTRUCTION_TOKENS,
  STAGE21_CONTENT_IDENTITY,
  STAGE21_DEPLOYMENT,
  STAGE21_EVENT_PROGRAM,
  STAGE21_MUSIC_RECORDS,
  STAGE21_OBJECTIVE,
  STAGE21_SCOUTS,
  STAGE21_SOURCES,
  STAGE21_STORY_PAGES,
  STAGE21_TERRAIN_TOKENS_BASE64,
  STAGE21_TITLE,
  STAGE21_TOKEN_TO_SLOT_BASE64,
} from "./stage21-runtime.generated";
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

export const STAGE21_TERRAIN_TOKENS = decode(STAGE21_TERRAIN_TOKENS_BASE64);
export const STAGE21_TOKEN_TO_TERRAIN_SLOT = decode(STAGE21_TOKEN_TO_SLOT_BASE64);
export const STAGE21_IRON_PLATE_TERRAIN_SLOT =
  STAGE21_TOKEN_TO_TERRAIN_SLOT[STAGE21_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE21_OBSTACLE_TERRAIN_SLOT =
  STAGE21_TOKEN_TO_TERRAIN_SLOT[STAGE21_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE21_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE21 = {
  id: "stage-21",
  nativeStage: 21,
  name: STAGE21_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    // Each scripted move temporarily follows its source actor; returning here
    // keeps the village tableau visible between moves and behind SAY/0044.
    // y is the bottom-most origin `originBounds` allows for the 7-row viewport
    // (content ends at row 43), so it must not be written as a larger number
    // that clampCameraOrigin would silently pull back.
    initialOrigin: { x: 24, y: 37 },
    originBounds,
  },
} as const;

export const STAGE21_DEFINITION = {
  ...STAGE21,
  contentIdentity: STAGE21_CONTENT_IDENTITY,
  objective: STAGE21_OBJECTIVE,
  deployment: STAGE21_DEPLOYMENT,
  stories: {
    prebattle: "stage-21-prebattle-story",
    opening: "stage-21-scouting-story",
    roundStarts: [],
    scripted: ["stage-21-discovery-story"],
  },
  music: {
    story: "stage-21-story-music",
    playerPhase: "stage-21-player-phase-music",
    enemyPhase: "stage-21-enemy-phase-music",
  },
  events: [
    {
      id: "stage-21-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-21-prebattle-story",
    },
    {
      id: "stage-21-scouts-arrive",
      trigger: { type: "story-completed", storyId: "stage-21-prebattle-story" },
      simulationEffect: "stage-21-scouts-arrive",
      presentation: "none",
    },
    {
      id: "stage-21-scouting-story",
      trigger: { type: "effect-completed", effectId: "stage-21-scouts-arrive" },
      simulationEffect: "none",
      presentation: "stage-21-scouting-story",
    },
    {
      id: "stage-21-nia-move",
      trigger: { type: "story-completed", storyId: "stage-21-scouting-story" },
      simulationEffect: "stage-21-nia-move",
      presentation: "none",
    },
    {
      id: "stage-21-himi-move",
      trigger: { type: "effect-completed", effectId: "stage-21-nia-move" },
      simulationEffect: "stage-21-himi-move",
      presentation: "none",
    },
    {
      id: "stage-21-gadirath-move",
      trigger: { type: "effect-completed", effectId: "stage-21-himi-move" },
      simulationEffect: "stage-21-gadirath-move",
      presentation: "none",
    },
    {
      id: "stage-21-sulanda-move",
      trigger: { type: "effect-completed", effectId: "stage-21-gadirath-move" },
      simulationEffect: "stage-21-sulanda-move",
      presentation: "none",
    },
    {
      id: "stage-21-discovery-story",
      trigger: { type: "effect-completed", effectId: "stage-21-sulanda-move" },
      simulationEffect: "none",
      presentation: "stage-21-discovery-story",
    },
    {
      id: "stage-21-completed-route",
      trigger: { type: "story-completed", storyId: "stage-21-discovery-story" },
      simulationEffect: "stage-21-route-to-stage-22",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-21">;

registerRuntimeStageDefinition(STAGE21_DEFINITION);

export function stage21TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE21_TOKEN_TO_TERRAIN_SLOT[STAGE21_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE21_SEMANTIC_SCOUTS = STAGE21_SCOUTS.map((scout) => ({
  slot: scout.slot,
  source: scout.source,
  destination: scout.destination,
  name: scout.name,
  portrait: scout.portraitRecord as PortraitRecord,
}));

export const STAGE21_ASSETS = {
  map: "/assets/original/stage21-map.png",
  minimap: "/assets/original/stage21-minimap.png",
  storyBackgrounds: {
    16: "/assets/original/story-stage21-background-16.png",
  },
  unitSprites: {},
  audio: {
    story: "/assets/original/story-stage21.wav",
    playerEntry: "/assets/original/battle-stage21-player-entry.wav",
    playerLoop: "/assets/original/battle-stage21-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage21-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage21-enemy-loop.wav",
  },
} as const;

export const STAGE21_MUSIC_PROGRAMS = {
  "stage-21-story-music": {
    id: "stage21-story",
    kind: "loop",
    track: `MAGIC/${STAGE21_MUSIC_RECORDS.story}`,
    source: STAGE21_ASSETS.audio.story,
    seamlessLoop: STAGE21_ASSETS.audio.story,
  },
  "stage-21-player-phase-music": {
    id: "stage21-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE21_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE21_MUSIC_RECORDS.player.loop}`,
    entry: STAGE21_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE21_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-21-enemy-phase-music": {
    id: "stage21-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE21_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE21_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE21_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE21_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

const scoutBySlot = (slot: number) => {
  const scout = STAGE21_SEMANTIC_SCOUTS.find((candidate) => candidate.slot === slot);
  if (!scout) throw new Error(`Missing stage 21 scout ${slot}`);
  return scout;
};

export function activateStage21Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-21-scouts-arrive": {
      type: "story-reinforcements",
      actors: STAGE21_SEMANTIC_SCOUTS.map((scout) => ({
        id: `1:${scout.slot}`,
        source: { side: 1 as const, slot: scout.slot },
        position: scout.source,
        name: scout.name,
        portrait: scout.portrait,
      })),
      statusText: "妮雅一行抵達焦土森林",
      revealTiming: "native-before-write",
      // The interlude never hands the board to a side phase, so the native
      // action bit stays clear and no scout wears the 已行動 badge.
      actionSpent: false,
      focusPortrait: STAGE21_EVENT_PROGRAM.focusPortraitRecord as PortraitRecord,
    },
    "stage-21-nia-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 0 },
      destination: scoutBySlot(0).destination,
      movementBudget: STAGE21_EVENT_PROGRAM.movementBudget,
      statusText: "妮雅前往村莊偵察……",
    },
    "stage-21-himi-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 1 },
      destination: scoutBySlot(1).destination,
      movementBudget: STAGE21_EVENT_PROGRAM.movementBudget,
      statusText: "希蜜跟隨妮雅前往村莊……",
    },
    "stage-21-gadirath-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 24 },
      destination: scoutBySlot(24).destination,
      movementBudget: STAGE21_EVENT_PROGRAM.movementBudget,
      statusText: "葛蒂拉斯進入村莊……",
    },
    "stage-21-sulanda-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 8 },
      destination: scoutBySlot(8).destination,
      movementBudget: STAGE21_EVENT_PROGRAM.movementBudget,
      statusText: "蘇蘭達進入村莊……",
    },
    "stage-21-route-to-stage-22": { type: "campaign-route", destination: "stage-22" },
  });
  registerStageStoryPages(STAGE21_STORY_PAGES);
  registerStageMusicPrograms(STAGE21_MUSIC_PROGRAMS);
}

export {
  STAGE21_CONTENT_IDENTITY,
  STAGE21_EVENT_PROGRAM,
  STAGE21_SOURCES,
  STAGE21_STORY_PAGES,
};
