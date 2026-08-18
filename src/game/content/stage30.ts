import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE30_CONSTRUCTION_TOKENS,
  STAGE30_CONTENT_IDENTITY,
  STAGE30_EVENT_PROGRAM,
  STAGE30_FIXED_ALLIED_UNITS,
  STAGE30_FORM_RECORDS_BY_DIFFICULTY,
  STAGE30_INITIAL_ENEMY,
  STAGE30_MUSIC_RECORDS,
  STAGE30_OBJECTIVE,
  STAGE30_SOURCES,
  STAGE30_STORY_PAGES,
  STAGE30_TERRAIN_TOKENS_BASE64,
  STAGE30_TITLE,
  STAGE30_TOKEN_TO_SLOT_BASE64,
} from "./stage30-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 30 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE30_TERRAIN_TOKENS = decode(STAGE30_TERRAIN_TOKENS_BASE64);
export const STAGE30_TOKEN_TO_TERRAIN_SLOT = decode(STAGE30_TOKEN_TO_SLOT_BASE64);
export const STAGE30_IRON_PLATE_TERRAIN_SLOT =
  STAGE30_TOKEN_TO_TERRAIN_SLOT[STAGE30_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE30_OBSTACLE_TERRAIN_SLOT =
  STAGE30_TOKEN_TO_TERRAIN_SLOT[STAGE30_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE30_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE30 = {
  id: "stage-30",
  nativeStage: 30,
  name: STAGE30_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 24, y: 22 },
    originBounds,
  },
} as const;

export const STAGE30_DEFINITION = {
  ...STAGE30,
  contentIdentity: STAGE30_CONTENT_IDENTITY,
  objective: STAGE30_OBJECTIVE,
  deployment: { kind: "fixed" },
  stories: {
    prebattle: "stage-30-prebattle-story",
    opening: "stage-30-opening-story",
    roundStarts: [],
    victory: "stage-30-victory-story",
  },
  music: {
    story: "stage-30-story-music",
    playerPhase: "stage-30-player-phase-music",
    enemyPhase: "stage-30-enemy-phase-music",
  },
  events: [
    {
      id: "stage-30-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-30-prebattle-story",
    },
    {
      id: "stage-30-opening-story",
      trigger: { type: "story-completed", storyId: "stage-30-prebattle-story" },
      simulationEffect: "none",
      presentation: "stage-30-opening-story",
    },
    {
      id: "stage-30-opening-form-transition",
      trigger: { type: "story-completed", storyId: "stage-30-opening-story" },
      simulationEffect: "stage-30-opening-form-transition",
      presentation: "none",
    },
    {
      id: "stage-30-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-30-set-victory-999",
      presentation: "stage-30-victory-story",
    },
    {
      id: "stage-30-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-30-route-to-stage-31",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-30">;

registerRuntimeStageDefinition(STAGE30_DEFINITION);

export function stage30TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE30_TOKEN_TO_TERRAIN_SLOT[STAGE30_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE30_SEMANTIC_ALLIED_UNITS = STAGE30_FIXED_ALLIED_UNITS.map((unit) => ({
  slot: unit.slot,
  position: unit.position,
  name: unit.name,
  ...(unit.portraitRecord === 0xff
    ? {}
    : { portrait: unit.portraitRecord as PortraitRecord }),
  aiBehavior: unit.aiBehavior,
  ...(unit.slot === 40 ? { initialClassId: "magic-sword-warrior" as const } : {}),
  ...(unit.slot === 7 ? { initialClassId: "magic-priest" as const } : {}),
  untouchedExperience: unit.slot === 40 ? 0 : 299,
}));

const initialEnemyClassId = semanticClassId(STAGE30_INITIAL_ENEMY.nativeClassRecord);
export const STAGE30_SEMANTIC_INITIAL_ENEMY = {
  slot: STAGE30_INITIAL_ENEMY.slot,
  position: STAGE30_INITIAL_ENEMY.position,
  classId: initialEnemyClassId,
  name: STAGE30_INITIAL_ENEMY.name,
  portrait: STAGE30_INITIAL_ENEMY.portraitRecord as PortraitRecord,
  aiBehavior: STAGE30_INITIAL_ENEMY.aiBehavior,
};

export const STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY = STAGE30_FORM_RECORDS_BY_DIFFICULTY
  .map((records) => records.map(semanticClassId));
export const STAGE30_ALL_FORM_CLASS_IDS = STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY[3];

const enemyUnitSprites = Object.fromEntries([
  ...STAGE30_ALL_FORM_CLASS_IDS,
  "empress" as const,
].map((classId) => [
  `enemy-${classId}`,
  `/assets/original/technique-lab/units/enemy-${classId}.png`,
]));

export const STAGE30_ASSETS = {
  map: "/assets/original/stage30-map.png",
  minimap: "/assets/original/stage30-minimap.png",
  storyBackground: "/assets/original/story-stage29-background-23.png",
  unitSprites: enemyUnitSprites,
  audio: {
    story: musicAsset("MAGIC", 78),
    playerEntry: musicAsset("MUSIC", 29),
    playerLoop: musicAsset("MUSIC", 28),
    enemyEntry: musicAsset("MUSIC", 5),
    enemyLoop: musicAsset("MUSIC", 4),
  },
} as const;

export const STAGE30_MUSIC_PROGRAMS = {
  "stage-30-story-music": {
    id: "stage30-story",
    kind: "loop",
    track: "MAGIC/78",
    source: STAGE30_ASSETS.audio.story,
    seamlessLoop: STAGE30_ASSETS.audio.story,
  },
  "stage-30-player-phase-music": {
    id: "stage30-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE30_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE30_MUSIC_RECORDS.player.loop}`,
    entry: STAGE30_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE30_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-30-enemy-phase-music": {
    id: "stage30-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE30_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE30_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE30_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE30_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage30Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-30-opening-form-transition": {
      type: "unit-form-transition",
      actorId: "2:27",
      targetClassId: "soldier",
      targetName: "維絲塔",
      targetPortrait: 41,
      targetExperience: 0,
      context: STAGE30_EVENT_PROGRAM.contextualLine,
      statusText: "維絲塔的女帝外形崩解，顯現為士兵形態。",
    },
    "stage-30-set-victory-999": { type: "victory-state", value: 999 },
    "stage-30-route-to-stage-31": { type: "campaign-route", destination: "stage-31" },
  });
  registerStageStoryPages(STAGE30_STORY_PAGES);
  registerStageMusicPrograms(STAGE30_MUSIC_PROGRAMS);
}

export {
  STAGE30_CONTENT_IDENTITY,
  STAGE30_EVENT_PROGRAM,
  STAGE30_SOURCES,
  STAGE30_STORY_PAGES,
};
