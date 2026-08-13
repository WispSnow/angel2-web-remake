import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE28_CONSTRUCTION_TOKENS,
  STAGE28_CONTENT_IDENTITY,
  STAGE28_DEPLOYMENT,
  STAGE28_DEPLOYMENT_ACTORS,
  STAGE28_ENEMY_UNITS,
  STAGE28_EVENT_PROGRAM,
  STAGE28_MUSIC_RECORDS,
  STAGE28_OBJECTIVE,
  STAGE28_SOURCES,
  STAGE28_STORY_PAGES,
  STAGE28_TERRAIN_TOKENS_BASE64,
  STAGE28_TITLE,
  STAGE28_TOKEN_TO_SLOT_BASE64,
} from "./stage28-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 28 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE28_TERRAIN_TOKENS = decode(STAGE28_TERRAIN_TOKENS_BASE64);
export const STAGE28_TOKEN_TO_TERRAIN_SLOT = decode(STAGE28_TOKEN_TO_SLOT_BASE64);
export const STAGE28_IRON_PLATE_TERRAIN_SLOT =
  STAGE28_TOKEN_TO_TERRAIN_SLOT[STAGE28_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE28_OBSTACLE_TERRAIN_SLOT =
  STAGE28_TOKEN_TO_TERRAIN_SLOT[STAGE28_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE28_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE28 = {
  id: "stage-28",
  nativeStage: 28,
  name: STAGE28_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 23, y: 21 },
    originBounds,
  },
} as const;

export const STAGE28_DEFINITION = {
  ...STAGE28,
  contentIdentity: STAGE28_CONTENT_IDENTITY,
  objective: STAGE28_OBJECTIVE,
  deployment: STAGE28_DEPLOYMENT,
  stories: {
    prebattle: "stage-28-prebattle-story",
    opening: "stage-28-opening-story",
    roundStarts: [],
    victory: "stage-28-victory-story",
  },
  music: {
    story: "stage-28-story-music",
    playerPhase: "stage-28-player-phase-music",
    enemyPhase: "stage-28-enemy-phase-music",
  },
  events: [
    {
      id: "stage-28-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-28-prebattle-story",
    },
    {
      id: "stage-28-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-28-prebattle-story" },
      simulationEffect: "stage-28-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-28-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-28-opening-story",
    },
    {
      id: "stage-28-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-28-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-28-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-28-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-28-victory-story",
    },
    {
      id: "stage-28-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-28-route-to-stage-29",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-28">;

registerRuntimeStageDefinition(STAGE28_DEFINITION);

export function stage28TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE28_TOKEN_TO_TERRAIN_SLOT[STAGE28_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE28_SEMANTIC_ALLIED_UNITS = STAGE28_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 7 ? 0 : 299,
}));

export const STAGE28_SEMANTIC_ENEMY_UNITS = STAGE28_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  const portrait = classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 28 enemy portrait for native class ${unit.nativeClassRecord}`);
  }
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE28_ASSETS = {
  map: "/assets/original/stage28-map.png",
  minimap: "/assets/original/stage28-minimap.png",
  storyBackground: "/assets/original/story-stage28-background-22.png",
  unitSprites: {
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
    "enemy-evil-sword-warrior": "/assets/original/technique-lab/units/enemy-evil-sword-warrior.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
    "enemy-crossbow": "/assets/original/technique-lab/units/enemy-crossbow.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
  },
  audio: {
    story: "/assets/original/story-stage28.wav",
    playerEntry: "/assets/original/battle-stage28-player-entry.wav",
    playerLoop: "/assets/original/battle-stage28-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage28-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage28-enemy-loop.wav",
  },
} as const;

export const STAGE28_MUSIC_PROGRAMS = {
  "stage-28-story-music": {
    id: "stage28-story",
    kind: "loop",
    track: "MAGIC/76",
    source: STAGE28_ASSETS.audio.story,
    seamlessLoop: STAGE28_ASSETS.audio.story,
  },
  "stage-28-player-phase-music": {
    id: "stage28-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE28_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE28_MUSIC_RECORDS.player.loop}`,
    entry: STAGE28_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE28_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-28-enemy-phase-music": {
    id: "stage28-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE28_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE28_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE28_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE28_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage28Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-28-enter-deployment": { type: "enter-deployment" },
    "stage-28-set-victory-999": { type: "victory-state", value: 999 },
    "stage-28-route-to-stage-29": { type: "campaign-route", destination: "stage-29" },
  });
  registerStageStoryPages(STAGE28_STORY_PAGES);
  registerStageMusicPrograms(STAGE28_MUSIC_PROGRAMS);
}

export {
  STAGE28_CONTENT_IDENTITY,
  STAGE28_EVENT_PROGRAM,
  STAGE28_SOURCES,
  STAGE28_STORY_PAGES,
};
