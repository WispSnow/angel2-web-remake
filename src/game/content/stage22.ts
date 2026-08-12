import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE22_CONSTRUCTION_TOKENS,
  STAGE22_CONTENT_IDENTITY,
  STAGE22_DEPLOYMENT,
  STAGE22_DEPLOYMENT_ACTORS,
  STAGE22_ENEMIES,
  STAGE22_EVENT_PROGRAM,
  STAGE22_MUSIC_RECORDS,
  STAGE22_OBJECTIVE,
  STAGE22_SOURCES,
  STAGE22_STORY_PAGES,
  STAGE22_TEMPORARY_ACTORS,
  STAGE22_TERRAIN_TOKENS_BASE64,
  STAGE22_TITLE,
  STAGE22_TOKEN_TO_SLOT_BASE64,
} from "./stage22-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 22 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE22_TERRAIN_TOKENS = decode(STAGE22_TERRAIN_TOKENS_BASE64);
export const STAGE22_TOKEN_TO_TERRAIN_SLOT = decode(STAGE22_TOKEN_TO_SLOT_BASE64);
export const STAGE22_IRON_PLATE_TERRAIN_SLOT =
  STAGE22_TOKEN_TO_TERRAIN_SLOT[STAGE22_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE22_OBSTACLE_TERRAIN_SLOT =
  STAGE22_TOKEN_TO_TERRAIN_SLOT[STAGE22_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE22_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE22 = {
  id: "stage-22",
  nativeStage: 22,
  name: STAGE22_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 22, y: 31 },
    originBounds,
  },
} as const;

export const STAGE22_DEFINITION = {
  ...STAGE22,
  contentIdentity: STAGE22_CONTENT_IDENTITY,
  objective: STAGE22_OBJECTIVE,
  deployment: STAGE22_DEPLOYMENT,
  stories: {
    roundStarts: [],
    scripted: [
      "stage-22-search-story",
      "stage-22-reunion-story",
      "stage-22-betrayal-story",
      "stage-22-dragon-story",
    ],
  },
  music: {
    playerPhase: "stage-22-player-phase-music",
    enemyPhase: "stage-22-enemy-phase-music",
  },
  events: [
    {
      id: "stage-22-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-22-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-22-empress-arrival",
      trigger: { type: "battle-started" },
      simulationEffect: "stage-22-empress-arrival",
      presentation: "none",
    },
    {
      id: "stage-22-empress-move",
      trigger: { type: "effect-completed", effectId: "stage-22-empress-arrival" },
      simulationEffect: "stage-22-empress-move",
      presentation: "none",
    },
    {
      id: "stage-22-kins-arrival",
      trigger: { type: "effect-completed", effectId: "stage-22-empress-move" },
      simulationEffect: "stage-22-kins-arrival",
      presentation: "none",
    },
    {
      id: "stage-22-kins-move",
      trigger: { type: "effect-completed", effectId: "stage-22-kins-arrival" },
      simulationEffect: "stage-22-kins-move",
      presentation: "none",
    },
    {
      id: "stage-22-search-story",
      trigger: { type: "effect-completed", effectId: "stage-22-kins-move" },
      simulationEffect: "none",
      presentation: "stage-22-search-story",
    },
    {
      id: "stage-22-focus-nia",
      trigger: { type: "story-completed", storyId: "stage-22-search-story" },
      simulationEffect: "stage-22-focus-nia",
      presentation: "none",
    },
    {
      id: "stage-22-reunion-story",
      trigger: { type: "effect-completed", effectId: "stage-22-focus-nia" },
      simulationEffect: "none",
      presentation: "stage-22-reunion-story",
    },
    {
      id: "stage-22-gadirath-arrival",
      trigger: { type: "story-completed", storyId: "stage-22-reunion-story" },
      simulationEffect: "stage-22-gadirath-arrival",
      presentation: "none",
    },
    {
      id: "stage-22-betrayal-story",
      trigger: { type: "effect-completed", effectId: "stage-22-gadirath-arrival" },
      simulationEffect: "none",
      presentation: "stage-22-betrayal-story",
    },
    {
      id: "stage-22-dragon-arrival",
      trigger: { type: "story-completed", storyId: "stage-22-betrayal-story" },
      simulationEffect: "stage-22-dragon-arrival",
      presentation: "none",
    },
    {
      id: "stage-22-dragon-story",
      trigger: { type: "effect-completed", effectId: "stage-22-dragon-arrival" },
      simulationEffect: "none",
      presentation: "stage-22-dragon-story",
    },
    {
      id: "stage-22-story-departures",
      trigger: { type: "story-completed", storyId: "stage-22-dragon-story" },
      simulationEffect: "stage-22-story-departures",
      presentation: "none",
    },
    {
      id: "stage-22-ambush-arrivals",
      trigger: { type: "effect-completed", effectId: "stage-22-story-departures" },
      simulationEffect: "stage-22-ambush-arrivals",
      presentation: "none",
    },
    {
      id: "stage-22-player-ready",
      trigger: { type: "effect-completed", effectId: "stage-22-ambush-arrivals" },
      simulationEffect: "stage-22-player-ready",
      presentation: "none",
    },
    {
      id: "stage-22-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-22-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-22-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-22-route-to-stage-23",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-22">;

registerRuntimeStageDefinition(STAGE22_DEFINITION);

export function stage22TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE22_TOKEN_TO_TERRAIN_SLOT[STAGE22_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE22_SEMANTIC_ALLIED_UNITS = STAGE22_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  ...("nativeClassOverride" in actor
    ? { initialClassId: semanticClassId(actor.nativeClassOverride) }
    : {}),
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE22_SEMANTIC_ENEMIES = STAGE22_ENEMIES.map((enemy) => {
  const classId = semanticClassId(enemy.nativeClassRecord);
  const portrait = "portraitRecord" in enemy
    ? enemy.portraitRecord as PortraitRecord
    : classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 22 enemy portrait for native class ${enemy.nativeClassRecord}`);
  }
  return {
    slot: enemy.slot,
    position: enemy.position,
    classId,
    name: "name" in enemy ? enemy.name : className(classId),
    portrait,
    aiBehavior: enemy.aiBehavior,
  };
});

export const STAGE22_ASSETS = {
  map: "/assets/original/stage22-map.png",
  minimap: "/assets/original/stage22-minimap.png",
  unitSprites: {
    "ally-empress": "/assets/original/technique-lab/units/ally-empress.png",
    "ally-magic-priest": "/assets/original/technique-lab/units/ally-magic-priest.png",
    "ally-half-dragon-warrior": "/assets/original/technique-lab/units/ally-half-dragon-warrior.png",
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-dragon": "/assets/original/technique-lab/units/enemy-dragon.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage22-player-entry.wav",
    playerLoop: "/assets/original/battle-stage22-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage22-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage22-enemy-loop.wav",
  },
} as const;

export const STAGE22_MUSIC_PROGRAMS = {
  "stage-22-player-phase-music": {
    id: "stage22-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE22_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE22_MUSIC_RECORDS.player.loop}`,
    entry: STAGE22_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE22_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-22-enemy-phase-music": {
    id: "stage22-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE22_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE22_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE22_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE22_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

const temporaryActor = (slot: 7 | 23) => {
  const actor = STAGE22_TEMPORARY_ACTORS.find((candidate) => candidate.slot === slot);
  if (!actor) throw new Error(`Missing stage 22 temporary actor ${slot}`);
  return actor;
};

const enemyActor = (slot: 2 | 28) => {
  const actor = STAGE22_SEMANTIC_ENEMIES.find((candidate) => candidate.slot === slot);
  if (!actor) throw new Error(`Missing stage 22 enemy actor ${slot}`);
  return actor;
};

export function activateStage22Content(): void {
  registerActionContent(actionContent);
  const empress = temporaryActor(23);
  const kins = temporaryActor(7);
  const gadirath = enemyActor(2);
  const dragon = enemyActor(28);
  registerStageSimulationEffects({
    "stage-22-enter-deployment": { type: "enter-deployment" },
    "stage-22-empress-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: "1:23",
        source: { side: 1, slot: 23 },
        position: empress.position,
        name: empress.name,
        portrait: empress.portraitRecord as PortraitRecord,
        forcedClassId: semanticClassId(empress.nativeClassRecord),
        forcedExperience: 0,
      }],
      statusText: "維絲塔從村屋中現身",
      revealTiming: "native-before-write-deferred-refresh",
      actionSpent: false,
      focusPortrait: STAGE22_EVENT_PROGRAM.focusPortraitRecord as PortraitRecord,
      focusPortraitTiming: "before-write",
    },
    "stage-22-empress-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 23 },
      destination: empress.destination,
      movementBudget: empress.movementBudget,
      statusText: "維絲塔走向妮雅一行……",
    },
    "stage-22-kins-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: "1:7",
        source: { side: 1, slot: 7 },
        position: kins.position,
        ...("focusPosition" in kins ? { focusPosition: kins.focusPosition } : {}),
        name: kins.name,
        portrait: kins.portraitRecord as PortraitRecord,
        forcedClassId: semanticClassId(kins.nativeClassRecord),
        forcedExperience: 0,
      }],
      statusText: "琴斯緊接著從村屋中現身",
      revealTiming: "native-before-write-deferred-refresh",
      actionSpent: false,
    },
    "stage-22-kins-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 7 },
      destination: kins.destination,
      movementBudget: kins.movementBudget,
      statusText: "琴斯走向維絲塔……",
    },
    "stage-22-focus-nia": { type: "focus-actor", actor: { side: 1, slot: 0 } },
    "stage-22-gadirath-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: "2:2",
        source: { side: 2, slot: 2 },
        position: gadirath.position,
        name: gadirath.name,
        portrait: gadirath.portrait,
        forcedClassId: gadirath.classId,
      }],
      statusText: "葛蒂拉斯現出真身",
      revealTiming: "after-write",
      actionSpent: false,
    },
    "stage-22-dragon-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: "2:28",
        source: { side: 2, slot: 28 },
        position: dragon.position,
        name: dragon.name,
        portrait: dragon.portrait,
        forcedClassId: dragon.classId,
      }],
      statusText: "妖龍從村莊北方現身",
      revealTiming: "after-write",
      actionSpent: false,
    },
    "stage-22-story-departures": {
      type: "story-departures",
      actors: [{ side: 1, slot: 23 }, { side: 1, slot: 7 }],
      statusText: "維絲塔與琴斯離開戰場",
    },
    "stage-22-ambush-arrivals": {
      type: "story-reinforcements",
      actors: STAGE22_SEMANTIC_ENEMIES.filter(({ slot }) => slot >= 40).map((enemy) => ({
        id: `2:${enemy.slot}`,
        source: { side: 2 as const, slot: enemy.slot },
        position: enemy.position,
        name: enemy.name,
        portrait: enemy.portrait,
        forcedClassId: enemy.classId,
      })),
      statusText: "魔祭師伏兵包圍了村莊",
      revealTiming: "deferred-refresh",
      actionSpent: false,
    },
    "stage-22-player-ready": {
      type: "enter-player-phase",
      statusText: "我方回合：打敗妖龍，保護妮雅。",
    },
    "stage-22-set-victory-999": { type: "victory-state", value: 999 },
    "stage-22-route-to-stage-23": { type: "campaign-route", destination: "stage-23" },
  });
  registerStageStoryPages(STAGE22_STORY_PAGES);
  registerStageMusicPrograms(STAGE22_MUSIC_PROGRAMS);
}

export {
  STAGE22_CONTENT_IDENTITY,
  STAGE22_EVENT_PROGRAM,
  STAGE22_SOURCES,
  STAGE22_STORY_PAGES,
};
