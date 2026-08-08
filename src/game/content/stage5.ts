import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE5_CONTENT_IDENTITY,
  STAGE5_DEPLOYMENT,
  STAGE5_DEPLOYMENT_ACTORS,
  STAGE5_ENEMY_UNITS,
  STAGE5_EVENT_PROGRAM,
  STAGE5_MUSIC_RECORDS,
  STAGE5_OBJECTIVE,
  STAGE5_SOURCES,
  STAGE5_STORY_PAGES,
  STAGE5_TERRAIN_TOKENS_BASE64,
  STAGE5_TITLE,
  STAGE5_TOKEN_TO_SLOT_BASE64,
  STAGE42_EVENT_PROGRAM,
  STAGE42_MUSIC_RECORDS,
  STAGE42_PORTAL_UNITS,
  STAGE42_TERRAIN_TOKENS_BASE64,
  STAGE42_TOKEN_TO_SLOT_BASE64,
} from "./stage5-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 5 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE5_TERRAIN_TOKENS = decode(STAGE5_TERRAIN_TOKENS_BASE64);
export const STAGE5_TOKEN_TO_TERRAIN_SLOT = decode(STAGE5_TOKEN_TO_SLOT_BASE64);
export const STAGE5_IRON_PLATE_TERRAIN_SLOT = STAGE5_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE5_OBSTACLE_TERRAIN_SLOT = STAGE5_TOKEN_TO_TERRAIN_SLOT[27];
const stage5ContentBounds = terrainContentBounds(STAGE5_TERRAIN_TOKENS, 50, 50);
const stage5OriginBounds = viewportOriginBoundsForContent(stage5ContentBounds, { width: 10, height: 7 });

export const STAGE5 = {
  id: "stage-05",
  nativeStage: 5,
  name: STAGE5_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 30 },
    originBounds: stage5OriginBounds,
  },
} as const;

export const STAGE5_DEFINITION = {
  ...STAGE5,
  contentIdentity: STAGE5_CONTENT_IDENTITY,
  objective: STAGE5_OBJECTIVE,
  deployment: STAGE5_DEPLOYMENT,
  stories: {
    opening: "stage-05-opening-story",
    roundStarts: [],
    victory: "stage-05-victory-story",
  },
  music: {
    playerPhase: "stage-05-player-phase-music",
    enemyPhase: "stage-05-enemy-phase-music",
  },
  events: [
    {
      id: "stage-05-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-05-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-05-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-05-opening-story",
    },
    {
      id: "stage-05-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-05-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-05-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-05-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-05-victory-story",
    },
    {
      id: "stage-05-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-05-route-to-stage-42",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-05">;

export const STAGE42_TERRAIN_TOKENS = decode(STAGE42_TERRAIN_TOKENS_BASE64);
export const STAGE42_TOKEN_TO_TERRAIN_SLOT = decode(STAGE42_TOKEN_TO_SLOT_BASE64);
export const STAGE42_IRON_PLATE_TERRAIN_SLOT = STAGE42_TOKEN_TO_TERRAIN_SLOT[1];
export const STAGE42_OBSTACLE_TERRAIN_SLOT = STAGE42_TOKEN_TO_TERRAIN_SLOT[1];
const stage42ContentBounds = terrainContentBounds(STAGE42_TERRAIN_TOKENS, 50, 50);
const stage42OriginBounds = viewportOriginBoundsForContent(stage42ContentBounds, { width: 10, height: 7 });

export const STAGE42_PORTAL = {
  id: "stage-42-portal",
  nativeStage: 42,
  name: "異世界之門",
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 20, y: 19 },
    originBounds: stage42OriginBounds,
  },
} as const;

export const STAGE42_PORTAL_DEFINITION = {
  ...STAGE42_PORTAL,
  contentIdentity: `${STAGE5_CONTENT_IDENTITY}/scene-42`,
  objective: {
    victory: { type: "eliminate-side", side: 2 },
    defeat: { type: "unit-removed", side: 1, slot: 0 },
    victoryText: "通過異世界之門",
    defeatText: "「妮雅」離場",
    victoryStatusText: "傳送門過場完成。",
  },
  deployment: { kind: "fixed" },
  stories: {
    roundStarts: [],
    scripted: [
      "stage-42-portal-arrival-story",
      "stage-42-portal-confrontation-story",
      "stage-42-portal-intervention-story",
      "stage-42-portal-departure-story",
    ],
  },
  music: {
    playerPhase: "stage-42-player-phase-music",
    enemyPhase: "stage-42-enemy-phase-music",
  },
  events: [
    {
      id: "stage-42-nia-move",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-42-nia-move",
      presentation: "none",
    },
    {
      id: "stage-42-arrival-story",
      trigger: { type: "effect-completed", effectId: "stage-42-nia-move" },
      simulationEffect: "none",
      presentation: "stage-42-portal-arrival-story",
    },
    {
      id: "stage-42-confrontation-story",
      trigger: { type: "story-completed", storyId: "stage-42-portal-arrival-story" },
      simulationEffect: "none",
      presentation: "stage-42-portal-confrontation-story",
    },
    {
      id: "stage-42-gadirath-move",
      trigger: { type: "story-completed", storyId: "stage-42-portal-confrontation-story" },
      simulationEffect: "stage-42-gadirath-move",
      presentation: "none",
    },
    {
      id: "stage-42-intervention-story",
      trigger: { type: "effect-completed", effectId: "stage-42-gadirath-move" },
      simulationEffect: "none",
      presentation: "stage-42-portal-intervention-story",
    },
    {
      id: "stage-42-lightning",
      trigger: { type: "story-completed", storyId: "stage-42-portal-intervention-story" },
      simulationEffect: "stage-42-lightning-4",
      presentation: "none",
    },
    {
      id: "stage-42-departures",
      trigger: { type: "effect-completed", effectId: "stage-42-lightning-4" },
      simulationEffect: "stage-42-story-departures",
      presentation: "none",
    },
    {
      id: "stage-42-departure-story",
      trigger: { type: "effect-completed", effectId: "stage-42-story-departures" },
      simulationEffect: "none",
      presentation: "stage-42-portal-departure-story",
    },
    {
      id: "stage-42-completed-route",
      trigger: { type: "story-completed", storyId: "stage-42-portal-departure-story" },
      simulationEffect: "stage-42-route-to-stage-06",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-42-portal">;

registerRuntimeStageDefinition(STAGE5_DEFINITION);
registerRuntimeStageDefinition(STAGE42_PORTAL_DEFINITION);

export function stage5TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE5_TOKEN_TO_TERRAIN_SLOT[STAGE5_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}
export function stage42TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE42_TOKEN_TO_TERRAIN_SLOT[STAGE42_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE5_SEMANTIC_ALLIED_UNITS = STAGE5_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));
export const STAGE5_SEMANTIC_ENEMY_UNITS = STAGE5_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait: ("portraitRecord" in unit ? unit.portraitRecord : undefined) as PortraitRecord | undefined,
    aiBehavior: unit.aiBehavior,
  };
});
export const STAGE42_SEMANTIC_ALLIED_UNITS = STAGE42_PORTAL_UNITS.map((unit) => ({
  slot: unit.slot,
  position: unit.position,
  forcedClassId: unit.nativeClassRecord === null
    ? undefined
    : semanticClassId(unit.nativeClassRecord),
  name: unit.name,
  portrait: unit.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE5_ASSETS = {
  map: "/assets/original/stage5-map.png",
  minimap: "/assets/original/stage5-minimap.png",
  unitSprites: {
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-warrior": "/assets/original/technique-lab/units/enemy-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage5-player-entry.wav",
    playerLoop: "/assets/original/battle-stage5-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage5-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage5-enemy-loop.wav",
  },
} as const;
export const STAGE42_ASSETS = {
  map: "/assets/original/stage42-portal-map.png",
  minimap: "/assets/original/stage42-portal-minimap.png",
  unitSprites: {},
  audio: {
    playerEntry: "/assets/original/battle-stage42-player-entry.wav",
    playerLoop: "/assets/original/battle-stage42-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage42-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage42-enemy-loop.wav",
  },
} as const;

export const STAGE5_MUSIC_PROGRAMS = {
  "stage-05-player-phase-music": {
    id: "stage5-player-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE5_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE5_MUSIC_RECORDS.player.loop}`,
    entry: STAGE5_ASSETS.audio.playerEntry, seamlessLoop: STAGE5_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-05-enemy-phase-music": {
    id: "stage5-enemy-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE5_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE5_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE5_ASSETS.audio.enemyEntry, seamlessLoop: STAGE5_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-42-player-phase-music": {
    id: "stage42-player-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE42_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE42_MUSIC_RECORDS.player.loop}`,
    entry: STAGE42_ASSETS.audio.playerEntry, seamlessLoop: STAGE42_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-42-enemy-phase-music": {
    id: "stage42-enemy-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE42_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE42_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE42_ASSETS.audio.enemyEntry, seamlessLoop: STAGE42_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage5Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-05-enter-deployment": { type: "enter-deployment" },
    "stage-05-set-victory-999": { type: "victory-state", value: 999 },
    "stage-05-route-to-stage-42": { type: "campaign-route", destination: "stage-42-portal" },
    "stage-42-nia-move": {
      type: "scripted-unit-move", actor: { side: 1, slot: 0 },
      destination: { x: 24, y: 24 }, movementBudget: 50,
      statusText: "妮雅追向異世界之門……",
    },
    "stage-42-gadirath-move": {
      type: "scripted-unit-move", actor: { side: 1, slot: 24 },
      destination: { x: 25, y: 24 }, movementBudget: 50,
      statusText: "葛蒂拉斯衝向琴斯……",
    },
    "stage-42-lightning-4": {
      type: "scripted-special-action",
      actionId: "lightning-4",
      actor: {
        id: "story:portal-lightning", side: 2, slot: 24,
        classId: "magic-master", name: "葛蒂拉斯", portrait: 0,
      },
      target: { x: 24, y: 22 }, targetSide: 1,
      preserveUnitIds: ["1:7", "1:23"],
      statusText: "葛蒂拉斯施展究級落雷……",
    },
    "stage-42-story-departures": {
      type: "story-departures",
      actors: [{ side: 1, slot: 7 }, { side: 1, slot: 23 }],
      statusText: "琴斯與女帝進入異世界之門",
    },
    "stage-42-route-to-stage-06": { type: "campaign-route", destination: "stage-06" },
  });
  registerStageStoryPages(STAGE5_STORY_PAGES);
  registerStageMusicPrograms(STAGE5_MUSIC_PROGRAMS);
}

export {
  STAGE5_CONTENT_IDENTITY,
  STAGE5_EVENT_PROGRAM,
  STAGE5_SOURCES,
  STAGE5_STORY_PAGES,
  STAGE42_EVENT_PROGRAM,
};
