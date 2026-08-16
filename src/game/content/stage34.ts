import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { untouchedEntryExperience } from "./campaign-entry-experience";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE34_CONSTRUCTION_TOKENS,
  STAGE34_CONTENT_IDENTITY,
  STAGE34_DEPLOYMENT,
  STAGE34_DEPLOYMENT_ACTORS,
  STAGE34_ENEMY_UNITS,
  STAGE34_EVENT_PROGRAM,
  STAGE34_MUSIC_RECORDS,
  STAGE34_OBJECTIVE,
  STAGE34_SOURCES,
  STAGE34_STORY_PAGES,
  STAGE34_TERRAIN_TOKENS_BASE64,
  STAGE34_TITLE,
  STAGE34_TOKEN_TO_SLOT_BASE64,
} from "./stage34-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 34 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE34_TERRAIN_TOKENS = decode(STAGE34_TERRAIN_TOKENS_BASE64);
export const STAGE34_TOKEN_TO_TERRAIN_SLOT = decode(STAGE34_TOKEN_TO_SLOT_BASE64);
export const STAGE34_IRON_PLATE_TERRAIN_SLOT =
  STAGE34_TOKEN_TO_TERRAIN_SLOT[STAGE34_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE34_OBSTACLE_TERRAIN_SLOT =
  STAGE34_TOKEN_TO_TERRAIN_SLOT[STAGE34_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE34_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE34 = {
  id: "stage-34",
  nativeStage: 34,
  name: STAGE34_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 26, y: 17 },
    originBounds,
  },
} as const;

export const STAGE34_DEFINITION = {
  ...STAGE34,
  contentIdentity: STAGE34_CONTENT_IDENTITY,
  objective: STAGE34_OBJECTIVE,
  deployment: STAGE34_DEPLOYMENT,
  stories: {
    opening: "stage-34-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-34-player-phase-music",
    enemyPhase: "stage-34-enemy-phase-music",
  },
  events: [
    {
      id: "stage-34-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-34-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-34-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-34-opening-story",
    },
    {
      id: "stage-34-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-34-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-34-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-34-route-to-stage-35",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-34">;

registerRuntimeStageDefinition(STAGE34_DEFINITION);

export function stage34TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE34_TOKEN_TO_TERRAIN_SLOT[STAGE34_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE34_SEMANTIC_ALLIED_UNITS = STAGE34_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: untouchedEntryExperience(actor.slot, actor.slot === 7 ? 0 : 299),
}));

export const STAGE34_SEMANTIC_ENEMY_UNITS = STAGE34_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait: ("portraitRecord" in unit
      ? unit.portraitRecord
      : classFallbackPortraitFor(classId, 2)) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE34_ASSETS = {
  map: "/assets/original/stage34-map.png",
  minimap: "/assets/original/stage34-minimap.png",
  unitSprites: {
    "enemy-great-dragon-knight": "/assets/original/technique-lab/units/enemy-great-dragon-knight.png",
    "enemy-evil-sword-warrior": "/assets/original/technique-lab/units/enemy-evil-sword-warrior.png",
    "enemy-prayer-guide": "/assets/original/technique-lab/units/enemy-prayer-guide.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage34-player-entry.wav",
    playerLoop: "/assets/original/battle-stage34-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage34-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage34-enemy-loop.wav",
  },
} as const;

export const STAGE34_MUSIC_PROGRAMS = {
  "stage-34-player-phase-music": {
    id: "stage34-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE34_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE34_MUSIC_RECORDS.player.loop}`,
    entry: STAGE34_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE34_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-34-enemy-phase-music": {
    id: "stage34-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE34_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE34_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE34_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE34_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage34Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-34-enter-deployment": { type: "enter-deployment" },
    "stage-34-set-victory-999": { type: "victory-state", value: 999 },
    "stage-34-route-to-stage-35": { type: "campaign-route", destination: "stage-35" },
  });
  registerStageStoryPages(STAGE34_STORY_PAGES);
  registerStageMusicPrograms(STAGE34_MUSIC_PROGRAMS);
}

export {
  STAGE34_CONTENT_IDENTITY,
  STAGE34_EVENT_PROGRAM,
  STAGE34_SOURCES,
  STAGE34_STORY_PAGES,
};
