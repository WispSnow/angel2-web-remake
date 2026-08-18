import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE6_CONTENT_IDENTITY,
  STAGE6_DEPLOYMENT,
  STAGE6_DEPLOYMENT_ACTORS,
  STAGE6_ENEMY_UNITS,
  STAGE6_EVENT_PROGRAM,
  STAGE6_MUSIC_RECORDS,
  STAGE6_OBJECTIVE,
  STAGE6_REINFORCEMENT_ACTORS,
  STAGE6_SOURCES,
  STAGE6_STORY_PAGES,
  STAGE6_TERRAIN_TOKENS_BASE64,
  STAGE6_TITLE,
  STAGE6_TOKEN_TO_SLOT_BASE64,
  STAGE6_VICTORY_PRESENTATION,
} from "./stage6-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 6 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE6_TERRAIN_TOKENS = decode(STAGE6_TERRAIN_TOKENS_BASE64);
export const STAGE6_TOKEN_TO_TERRAIN_SLOT = decode(STAGE6_TOKEN_TO_SLOT_BASE64);
export const STAGE6_IRON_PLATE_TERRAIN_SLOT = STAGE6_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE6_OBSTACLE_TERRAIN_SLOT = STAGE6_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE6_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE6 = {
  id: "stage-06",
  nativeStage: 6,
  name: STAGE6_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 17, y: 21 },
    originBounds,
  },
} as const;

export const STAGE6_DEFINITION = {
  ...STAGE6,
  contentIdentity: STAGE6_CONTENT_IDENTITY,
  objective: STAGE6_OBJECTIVE,
  deployment: STAGE6_DEPLOYMENT,
  stories: {
    prebattle: "stage-06-prebattle-story",
    opening: "stage-06-opening-story",
    roundStarts: [],
    scripted: ["stage-06-retreat-story"],
    victory: "stage-06-alliance-story",
  },
  music: {
    story: "stage-06-story-music",
    playerPhase: "stage-06-player-phase-music",
    enemyPhase: "stage-06-enemy-phase-music",
  },
  events: [
    {
      id: "stage-06-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-06-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-06-prebattle-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-06-prebattle-story",
    },
    {
      id: "stage-06-opening-story",
      trigger: { type: "story-completed", storyId: "stage-06-prebattle-story" },
      simulationEffect: "none",
      presentation: "stage-06-opening-story",
    },
    {
      id: "stage-06-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-06-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-06-retreat-story",
      trigger: { type: "effect-completed", effectId: "stage-06-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-06-retreat-story",
    },
    {
      id: "stage-06-reinforcements",
      trigger: { type: "story-completed", storyId: "stage-06-retreat-story" },
      simulationEffect: "stage-06-reinforcement-tableau",
      presentation: "none",
    },
    {
      id: "stage-06-ranger-leader-move",
      trigger: { type: "effect-completed", effectId: "stage-06-reinforcement-tableau" },
      simulationEffect: "stage-06-ranger-leader-move",
      presentation: "none",
    },
    {
      id: "stage-06-alliance-story",
      trigger: { type: "effect-completed", effectId: "stage-06-ranger-leader-move" },
      simulationEffect: "none",
      presentation: "stage-06-alliance-story",
    },
    {
      id: "stage-06-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-06-route-to-stage-07",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-06">;

registerRuntimeStageDefinition(STAGE6_DEFINITION);

export function stage6TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE6_TOKEN_TO_TERRAIN_SLOT[STAGE6_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE6_SEMANTIC_ALLIED_UNITS = STAGE6_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
}));
export const STAGE6_SEMANTIC_ENEMY_UNITS = STAGE6_ENEMY_UNITS.map((unit) => {
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

export const STAGE6_ASSETS = {
  map: "/assets/original/stage6-map.png",
  minimap: "/assets/original/stage6-minimap.png",
  storyBackgrounds: {
    5: "/assets/original/story-stage6-background-5.png",
    31: "/assets/original/story-stage6-background-31.png",
  },
  unitSprites: {
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-cavalry": "/assets/original/technique-lab/units/enemy-cavalry.png",
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-soldier": "/assets/original/technique-lab/units/enemy-soldier.png",
    "ally-cavalry": "/assets/original/technique-lab/units/ally-cavalry.png",
  },
  audio: {
    story: musicAsset("MAGIC", 78),
    playerEntry: musicAsset("MUSIC", 3),
    playerLoop: musicAsset("MUSIC", 2),
    enemyEntry: musicAsset("MUSIC", 31),
    enemyLoop: musicAsset("MUSIC", 30),
  },
} as const;

export const STAGE6_MUSIC_PROGRAMS = {
  "stage-06-story-music": {
    id: "stage6-story",
    kind: "loop",
    track: "MAGIC/78",
    source: STAGE6_ASSETS.audio.story,
    seamlessLoop: STAGE6_ASSETS.audio.story,
  },
  "stage-06-player-phase-music": {
    id: "stage6-player-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE6_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE6_MUSIC_RECORDS.player.loop}`,
    entry: STAGE6_ASSETS.audio.playerEntry, seamlessLoop: STAGE6_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-06-enemy-phase-music": {
    id: "stage6-enemy-battle", kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE6_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE6_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE6_ASSETS.audio.enemyEntry, seamlessLoop: STAGE6_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage6Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-06-enter-deployment": { type: "enter-deployment" },
    "stage-06-set-victory-999": { type: "victory-state", value: 999 },
    "stage-06-reinforcement-tableau": {
      type: "story-reinforcements",
      actors: STAGE6_REINFORCEMENT_ACTORS.map((actor) => ({
        id: actor.storyId,
        source: { side: actor.side, slot: actor.slot },
        position: actor.position,
        name: actor.name,
        portrait: actor.portraitRecord as PortraitRecord,
        ...("nativeClassRecord" in actor
          ? { forcedClassId: semanticClassId(actor.nativeClassRecord) }
          : {}),
      })),
      statusText: "游騎兵援軍抵達戰場……",
    },
    "stage-06-ranger-leader-move": {
      type: "scripted-unit-arrival",
      actorId: "story:ranger-leader",
      target: { side: 1, portrait: 46 },
      movementBudget: 50,
      statusText: "游騎兵領隊前來交涉……",
    },
    "stage-06-route-to-stage-07": { type: "campaign-route", destination: "stage-07" },
  });
  registerStageStoryPages(STAGE6_STORY_PAGES);
  registerStageMusicPrograms(STAGE6_MUSIC_PROGRAMS);
}

export {
  STAGE6_CONTENT_IDENTITY,
  STAGE6_EVENT_PROGRAM,
  STAGE6_REINFORCEMENT_ACTORS,
  STAGE6_SOURCES,
  STAGE6_STORY_PAGES,
  STAGE6_VICTORY_PRESENTATION,
};
