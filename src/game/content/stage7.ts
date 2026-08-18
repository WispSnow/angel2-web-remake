import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE7_CONTENT_IDENTITY,
  STAGE7_DEPLOYMENT,
  STAGE7_DEPLOYMENT_ACTORS,
  STAGE7_ENEMY_UNITS,
  STAGE7_EVENT_PROGRAM,
  STAGE7_MUSIC_RECORDS,
  STAGE7_OBJECTIVE,
  STAGE7_SOURCES,
  STAGE7_STORY_PAGES,
  STAGE7_TERRAIN_TOKENS_BASE64,
  STAGE7_TITLE,
  STAGE7_TOKEN_TO_SLOT_BASE64,
} from "./stage7-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 7 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE7_TERRAIN_TOKENS = decode(STAGE7_TERRAIN_TOKENS_BASE64);
export const STAGE7_TOKEN_TO_TERRAIN_SLOT = decode(STAGE7_TOKEN_TO_SLOT_BASE64);
export const STAGE7_IRON_PLATE_TERRAIN_SLOT = STAGE7_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE7_OBSTACLE_TERRAIN_SLOT = STAGE7_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE7_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE7 = {
  id: "stage-07",
  nativeStage: 7,
  name: STAGE7_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 18, y: 25 },
    originBounds,
  },
} as const;

export const STAGE7_DEFINITION = {
  ...STAGE7,
  contentIdentity: STAGE7_CONTENT_IDENTITY,
  objective: STAGE7_OBJECTIVE,
  deployment: STAGE7_DEPLOYMENT,
  stories: {
    prebattle: "stage-07-prebattle-story",
    roundStarts: [],
  },
  music: {
    story: "stage-07-story-music",
    playerPhase: "stage-07-player-phase-music",
    enemyPhase: "stage-07-enemy-phase-music",
  },
  events: [
    {
      id: "stage-07-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-07-prebattle-story",
    },
    {
      id: "stage-07-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-07-prebattle-story" },
      simulationEffect: "stage-07-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-07-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-07-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-07-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-07-route-to-stage-08",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-07">;

registerRuntimeStageDefinition(STAGE7_DEFINITION);

export function stage7TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE7_TOKEN_TO_TERRAIN_SLOT[STAGE7_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE7_SEMANTIC_ALLIED_UNITS = STAGE7_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));

export const STAGE7_SEMANTIC_ENEMY_UNITS = STAGE7_ENEMY_UNITS.map((unit) => {
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

export const STAGE7_ASSETS = {
  map: "/assets/original/stage7-map.png",
  minimap: "/assets/original/stage7-minimap.png",
  storyBackgrounds: {
    6: "/assets/original/story-stage7-background-6.png",
    7: "/assets/original/story-stage7-background-7.png",
  },
  unitSprites: {
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-priest": "/assets/original/technique-lab/units/enemy-priest.png",
    "enemy-soldier": "/assets/original/technique-lab/units/enemy-soldier.png",
  },
  audio: {
    story: musicAsset("MAGIC", 79),
    playerEntry: musicAsset("MUSIC", 29),
    playerLoop: musicAsset("MUSIC", 28),
    enemyEntry: musicAsset("MUSIC", 25),
    enemyLoop: musicAsset("MUSIC", 24),
  },
} as const;

export const STAGE7_MUSIC_PROGRAMS = {
  "stage-07-story-music": {
    id: "stage7-story",
    kind: "loop",
    track: "MAGIC/79",
    source: STAGE7_ASSETS.audio.story,
    seamlessLoop: STAGE7_ASSETS.audio.story,
  },
  "stage-07-player-phase-music": {
    id: "stage7-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE7_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE7_MUSIC_RECORDS.player.loop}`,
    entry: STAGE7_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE7_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-07-enemy-phase-music": {
    id: "stage7-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE7_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE7_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE7_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE7_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage7Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-07-enter-deployment": { type: "enter-deployment" },
    "stage-07-set-victory-999": { type: "victory-state", value: 999 },
    "stage-07-route-to-stage-08": { type: "campaign-route", destination: "stage-08" },
  });
  registerStageStoryPages(STAGE7_STORY_PAGES);
  registerStageMusicPrograms(STAGE7_MUSIC_PROGRAMS);
}

export {
  STAGE7_CONTENT_IDENTITY,
  STAGE7_EVENT_PROGRAM,
  STAGE7_SOURCES,
  STAGE7_STORY_PAGES,
};
