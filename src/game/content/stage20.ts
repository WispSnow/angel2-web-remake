import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE20_CONSTRUCTION_TOKENS,
  STAGE20_CONTENT_IDENTITY,
  STAGE20_DEPLOYMENT,
  STAGE20_DEPLOYMENT_ACTORS,
  STAGE20_DRAGON,
  STAGE20_ENEMY_UNITS,
  STAGE20_EVENT_PROGRAM,
  STAGE20_KINS,
  STAGE20_MUSIC_RECORDS,
  STAGE20_OBJECTIVE,
  STAGE20_SOURCES,
  STAGE20_STORY_PAGES,
  STAGE20_TERRAIN_TOKENS_BASE64,
  STAGE20_TITLE,
  STAGE20_TOKEN_TO_SLOT_BASE64,
} from "./stage20-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 20 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE20_TERRAIN_TOKENS = decode(STAGE20_TERRAIN_TOKENS_BASE64);
export const STAGE20_TOKEN_TO_TERRAIN_SLOT = decode(STAGE20_TOKEN_TO_SLOT_BASE64);
export const STAGE20_IRON_PLATE_TERRAIN_SLOT =
  STAGE20_TOKEN_TO_TERRAIN_SLOT[STAGE20_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE20_OBSTACLE_TERRAIN_SLOT =
  STAGE20_TOKEN_TO_TERRAIN_SLOT[STAGE20_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE20_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE20 = {
  id: "stage-20",
  nativeStage: 20,
  name: STAGE20_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 25, y: 14 },
    originBounds,
  },
} as const;

export const STAGE20_DEFINITION = {
  ...STAGE20,
  contentIdentity: STAGE20_CONTENT_IDENTITY,
  objective: STAGE20_OBJECTIVE,
  deployment: STAGE20_DEPLOYMENT,
  stories: {
    prebattle: "stage-20-prebattle-story",
    opening: "stage-20-opening-story",
    roundStarts: [],
    victory: "stage-20-victory-story",
    scripted: [
      "stage-20-contact-story",
      "stage-20-guardian-story",
      "stage-20-victory-1-story",
      "stage-20-victory-2-story",
      "stage-20-victory-3-story",
    ],
  },
  music: {
    story: "stage-20-story-music",
    playerPhase: "stage-20-player-phase-music",
    enemyPhase: "stage-20-enemy-phase-music",
  },
  events: [
    {
      id: "stage-20-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-20-prebattle-story",
    },
    {
      id: "stage-20-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-20-prebattle-story" },
      simulationEffect: "stage-20-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-20-contact-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-20-contact-story",
    },
    {
      id: "stage-20-guardian-move",
      trigger: { type: "story-completed", storyId: "stage-20-contact-story" },
      simulationEffect: "stage-20-guardian-move",
      presentation: "none",
    },
    {
      id: "stage-20-guardian-story",
      trigger: { type: "effect-completed", effectId: "stage-20-guardian-move" },
      simulationEffect: "none",
      presentation: "stage-20-guardian-story",
    },
    {
      id: "stage-20-tableau-departure",
      trigger: { type: "story-completed", storyId: "stage-20-guardian-story" },
      simulationEffect: "stage-20-tableau-departure",
      presentation: "none",
    },
    {
      id: "stage-20-dragon-arrival",
      trigger: { type: "effect-completed", effectId: "stage-20-tableau-departure" },
      simulationEffect: "stage-20-dragon-arrival",
      presentation: "none",
    },
    {
      id: "stage-20-opening-story",
      trigger: { type: "effect-completed", effectId: "stage-20-dragon-arrival" },
      simulationEffect: "none",
      presentation: "stage-20-opening-story",
    },
    {
      id: "stage-20-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-20-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-20-kins-arrival",
      trigger: { type: "effect-completed", effectId: "stage-20-set-victory-999" },
      simulationEffect: "stage-20-kins-arrival",
      presentation: "none",
    },
    {
      id: "stage-20-kins-move",
      trigger: { type: "effect-completed", effectId: "stage-20-kins-arrival" },
      simulationEffect: "stage-20-kins-move",
      presentation: "none",
    },
    {
      id: "stage-20-victory-1-story",
      trigger: { type: "effect-completed", effectId: "stage-20-kins-move" },
      simulationEffect: "none",
      presentation: "stage-20-victory-1-story",
    },
    {
      id: "stage-20-victory-2-story",
      trigger: { type: "story-completed", storyId: "stage-20-victory-1-story" },
      simulationEffect: "none",
      presentation: "stage-20-victory-2-story",
    },
    {
      id: "stage-20-victory-3-story",
      trigger: { type: "story-completed", storyId: "stage-20-victory-2-story" },
      simulationEffect: "none",
      presentation: "stage-20-victory-3-story",
    },
    {
      id: "stage-20-victory-story",
      trigger: { type: "story-completed", storyId: "stage-20-victory-3-story" },
      simulationEffect: "none",
      presentation: "stage-20-victory-story",
    },
    {
      id: "stage-20-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-20-route-to-stage-21",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-20">;

registerRuntimeStageDefinition(STAGE20_DEFINITION);

export function stage20TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE20_TOKEN_TO_TERRAIN_SLOT[STAGE20_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE20_SEMANTIC_ALLIED_UNITS = STAGE20_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  ...(actor.slot === 32 ? { initialClassId: "prayer-guide" as const } : {}),
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 32 ? 0 : 299,
}));

export const STAGE20_SEMANTIC_ENEMY_UNITS = STAGE20_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE20_SEMANTIC_DRAGON = {
  ...STAGE20_DRAGON,
  classId: semanticClassId(STAGE20_DRAGON.nativeClassRecord),
  portrait: STAGE20_DRAGON.portraitRecord as PortraitRecord,
};

export const STAGE20_ASSETS = {
  map: "/assets/original/stage20-map.png",
  minimap: "/assets/original/stage20-minimap.png",
  // SAY/39 has no PP background command. The Web prebattle surface projects
  // the already-loaded tower-top framebuffer instead of inventing a BK record.
  storyBackground: "/assets/original/story-stage20-background.svg",
  unitSprites: {
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-dragon": "/assets/original/technique-lab/units/enemy-dragon.png",
  },
  audio: {
    story: "/assets/original/story-stage20.wav",
    playerEntry: "/assets/original/battle-stage20-player-entry.wav",
    playerLoop: "/assets/original/battle-stage20-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage20-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage20-enemy-loop.wav",
  },
} as const;

export const STAGE20_MUSIC_PROGRAMS = {
  "stage-20-story-music": {
    id: "stage20-story",
    kind: "loop",
    track: `MAGIC/${STAGE20_MUSIC_RECORDS.story}`,
    source: STAGE20_ASSETS.audio.story,
    seamlessLoop: STAGE20_ASSETS.audio.story,
  },
  "stage-20-player-phase-music": {
    id: "stage20-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE20_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE20_MUSIC_RECORDS.player.loop}`,
    entry: STAGE20_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE20_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-20-enemy-phase-music": {
    id: "stage20-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE20_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE20_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE20_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE20_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage20Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-20-enter-deployment": { type: "enter-deployment" },
    "stage-20-guardian-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 32 },
      destination: STAGE20_EVENT_PROGRAM.guardianMove.to,
      movementBudget: STAGE20_EVENT_PROGRAM.guardianMove.movementBudget,
      statusText: "守護者走到眾人面前……",
    },
    "stage-20-tableau-departure": {
      type: "story-departures",
      actors: STAGE20_EVENT_PROGRAM.reinforcementAudit.removedSide2Slots.map((slot) => ({ side: 2 as const, slot })),
      statusText: "塔頂的半龍戰士一同退去",
    },
    "stage-20-dragon-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: `2:${STAGE20_DRAGON.slot}`,
        source: { side: 2, slot: STAGE20_DRAGON.slot },
        position: STAGE20_DRAGON.position,
        name: STAGE20_DRAGON.name,
        portrait: STAGE20_DRAGON.portraitRecord as PortraitRecord,
        forcedClassId: "dragon",
        forceSourceId: "2:55",
      }],
      statusText: "妖龍現身塔頂",
      revealTiming: "after-write",
    },
    "stage-20-set-victory-999": { type: "victory-state", value: 999 },
    "stage-20-kins-arrival": {
      type: "story-reinforcements",
      actors: [{
        id: `1:${STAGE20_KINS.slot}`,
        source: { side: 1, slot: STAGE20_KINS.slot },
        position: STAGE20_KINS.position,
        name: STAGE20_KINS.name,
        portrait: STAGE20_KINS.portraitRecord as PortraitRecord,
        forcedClassId: "soldier",
        forcedExperience: 0,
        forceSourceId: "1:0",
      }],
      statusText: "琴斯突然現身",
      revealTiming: "after-write",
    },
    "stage-20-kins-move": {
      type: "scripted-unit-move",
      actor: { side: 1, slot: 7 },
      destination: STAGE20_EVENT_PROGRAM.victory.to,
      movementBudget: STAGE20_EVENT_PROGRAM.victory.movementBudget,
      statusText: "琴斯追向妖龍……",
    },
    "stage-20-route-to-stage-21": { type: "campaign-route", destination: "stage-21" },
  });
  registerStageStoryPages(STAGE20_STORY_PAGES);
  registerStageMusicPrograms(STAGE20_MUSIC_PROGRAMS);
}

export {
  STAGE20_CONTENT_IDENTITY,
  STAGE20_EVENT_PROGRAM,
  STAGE20_SOURCES,
  STAGE20_STORY_PAGES,
};
