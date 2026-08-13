import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE29_CONSTRUCTION_TOKENS,
  STAGE29_CONTENT_IDENTITY,
  STAGE29_DEPLOYMENT,
  STAGE29_DEPLOYMENT_ACTORS,
  STAGE29_ENEMY_UNITS,
  STAGE29_EVENT_PROGRAM,
  STAGE29_MUSIC_RECORDS,
  STAGE29_OBJECTIVE,
  STAGE29_SOURCES,
  STAGE29_STORY_PAGES,
  STAGE29_TERRAIN_TOKENS_BASE64,
  STAGE29_TITLE,
  STAGE29_TOKEN_TO_SLOT_BASE64,
} from "./stage29-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 29 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE29_TERRAIN_TOKENS = decode(STAGE29_TERRAIN_TOKENS_BASE64);
export const STAGE29_TOKEN_TO_TERRAIN_SLOT = decode(STAGE29_TOKEN_TO_SLOT_BASE64);
export const STAGE29_IRON_PLATE_TERRAIN_SLOT =
  STAGE29_TOKEN_TO_TERRAIN_SLOT[STAGE29_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE29_OBSTACLE_TERRAIN_SLOT =
  STAGE29_TOKEN_TO_TERRAIN_SLOT[STAGE29_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE29_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE29 = {
  id: "stage-29",
  nativeStage: 29,
  name: STAGE29_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 36, y: 23 },
    originBounds,
  },
} as const;

export const STAGE29_DEFINITION = {
  ...STAGE29,
  contentIdentity: STAGE29_CONTENT_IDENTITY,
  objective: STAGE29_OBJECTIVE,
  deployment: STAGE29_DEPLOYMENT,
  stories: {
    prebattle: "stage-29-prebattle-story",
    roundStarts: [],
  },
  music: {
    story: "stage-29-story-music",
    playerPhase: "stage-29-player-phase-music",
    enemyPhase: "stage-29-enemy-phase-music",
  },
  events: [
    {
      id: "stage-29-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-29-prebattle-story",
    },
    {
      id: "stage-29-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-29-prebattle-story" },
      simulationEffect: "stage-29-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-29-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-29-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-29-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-29-route-to-stage-30",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-29">;

registerRuntimeStageDefinition(STAGE29_DEFINITION);

export function stage29TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE29_TOKEN_TO_TERRAIN_SLOT[STAGE29_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE29_SEMANTIC_ALLIED_UNITS = STAGE29_DEPLOYMENT_ACTORS.map((actor) => {
  const usesClassFallback = actor.portraitRecord === 0xff;
  const keepsNamedClassPortrait = actor.slot === 22 && usesClassFallback;
  return {
    slot: actor.slot,
    name: keepsNamedClassPortrait
      ? actor.normalizedName
      : usesClassFallback ? "士兵" : actor.normalizedName,
    aiBehavior: 0,
    untouchedExperience: usesClassFallback || actor.slot === 7 ? 0 : 299,
    // REMAKE-070 keeps Eliola's reachable deployment name on the battlefield,
    // while the missing native portrait still follows her inherited profession.
    ...(keepsNamedClassPortrait
      ? { displayIdentity: "named-class-portrait" as const }
      : {}),
    ...(usesClassFallback ? {} : { portrait: actor.portraitRecord as PortraitRecord }),
  };
});

export const STAGE29_SEMANTIC_ENEMY_UNITS = STAGE29_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    // Only 艾西柯羅 has a named side-2 descriptor in this template. Generic
    // enemies intentionally leave the portrait absent for class fallback.
    ...("portraitRecord" in unit
      ? { portrait: unit.portraitRecord as PortraitRecord }
      : {}),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE29_ASSETS = {
  map: "/assets/original/stage29-map.png",
  minimap: "/assets/original/stage29-minimap.png",
  storyBackground: "/assets/original/story-stage29-background-23.png",
  unitSprites: {
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-magic-archer": "/assets/original/technique-lab/units/enemy-magic-archer.png",
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
  },
  audio: {
    story: "/assets/original/story-stage29.wav",
    playerEntry: "/assets/original/battle-stage29-player-entry.wav",
    playerLoop: "/assets/original/battle-stage29-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage29-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage29-enemy-loop.wav",
  },
} as const;

export const STAGE29_MUSIC_PROGRAMS = {
  "stage-29-story-music": {
    id: "stage29-story",
    kind: "loop",
    track: "MAGIC/77",
    source: STAGE29_ASSETS.audio.story,
    seamlessLoop: STAGE29_ASSETS.audio.story,
  },
  "stage-29-player-phase-music": {
    id: "stage29-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE29_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE29_MUSIC_RECORDS.player.loop}`,
    entry: STAGE29_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE29_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-29-enemy-phase-music": {
    id: "stage29-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE29_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE29_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE29_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE29_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage29Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-29-enter-deployment": { type: "enter-deployment" },
    "stage-29-set-victory-999": { type: "victory-state", value: 999 },
    "stage-29-route-to-stage-30": { type: "campaign-route", destination: "stage-30" },
  });
  registerStageStoryPages(STAGE29_STORY_PAGES);
  registerStageMusicPrograms(STAGE29_MUSIC_PROGRAMS);
}

export {
  STAGE29_CONTENT_IDENTITY,
  STAGE29_DEPLOYMENT_ACTORS,
  STAGE29_EVENT_PROGRAM,
  STAGE29_SOURCES,
  STAGE29_STORY_PAGES,
};
