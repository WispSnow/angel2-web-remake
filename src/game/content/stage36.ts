import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE36_CONSTRUCTION_TOKENS,
  STAGE36_CONTENT_IDENTITY,
  STAGE36_DEPLOYMENT,
  STAGE36_DEPLOYMENT_ACTORS,
  STAGE36_ENEMY_UNITS,
  STAGE36_EVENT_PROGRAM,
  STAGE36_MUSIC_RECORDS,
  STAGE36_OBJECTIVE,
  STAGE36_SOURCES,
  STAGE36_STORY_PAGES,
  STAGE36_TERRAIN_TOKENS_BASE64,
  STAGE36_TITLE,
  STAGE36_TOKEN_TO_SLOT_BASE64,
} from "./stage36-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 36 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE36_TERRAIN_TOKENS = decode(STAGE36_TERRAIN_TOKENS_BASE64);
export const STAGE36_TOKEN_TO_TERRAIN_SLOT = decode(STAGE36_TOKEN_TO_SLOT_BASE64);
export const STAGE36_IRON_PLATE_TERRAIN_SLOT =
  STAGE36_TOKEN_TO_TERRAIN_SLOT[STAGE36_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE36_OBSTACLE_TERRAIN_SLOT =
  STAGE36_TOKEN_TO_TERRAIN_SLOT[STAGE36_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE36_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE36 = {
  id: "stage-36",
  nativeStage: 36,
  name: STAGE36_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 20, y: 23 },
    originBounds,
  },
} as const;

export const STAGE36_DEFINITION = {
  ...STAGE36,
  contentIdentity: STAGE36_CONTENT_IDENTITY,
  objective: STAGE36_OBJECTIVE,
  deployment: STAGE36_DEPLOYMENT,
  stories: {
    opening: "stage-36-opening-story",
    roundStarts: [],
  },
  music: {
    playerPhase: "stage-36-player-phase-music",
    enemyPhase: "stage-36-enemy-phase-music",
  },
  events: [
    {
      id: "stage-36-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-36-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-36-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-36-opening-story",
    },
    {
      id: "stage-36-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-36-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-36-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-36-route-to-stage-37",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-36">;

registerRuntimeStageDefinition(STAGE36_DEFINITION);

export function stage36TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE36_TOKEN_TO_TERRAIN_SLOT[STAGE36_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE36_SEMANTIC_ALLIED_UNITS = STAGE36_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: actor.slot === 7 ? 0 : 299,
}));

export const STAGE36_SEMANTIC_ENEMY_UNITS = STAGE36_ENEMY_UNITS.map((unit) => {
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

export const STAGE36_ASSETS = {
  map: "/assets/original/stage36-map.png",
  minimap: "/assets/original/stage36-minimap.png",
  unitSprites: {
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-prayer-guide": "/assets/original/technique-lab/units/enemy-prayer-guide.png",
    "enemy-curse-master": "/assets/original/technique-lab/units/enemy-curse-master.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-magic-guide": "/assets/original/technique-lab/units/enemy-magic-guide.png",
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-flying-dragon-knight": "/assets/original/technique-lab/units/enemy-flying-dragon-knight.png",
    "enemy-bone-knight": "/assets/original/technique-lab/units/enemy-bone-knight.png",
    "enemy-wizard": "/assets/original/technique-lab/units/enemy-wizard.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
    "enemy-evil-sword-warrior": "/assets/original/technique-lab/units/enemy-evil-sword-warrior.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage36-player-entry.wav",
    playerLoop: "/assets/original/battle-stage36-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage36-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage36-enemy-loop.wav",
  },
} as const;

export const STAGE36_MUSIC_PROGRAMS = {
  "stage-36-player-phase-music": {
    id: "stage36-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE36_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE36_MUSIC_RECORDS.player.loop}`,
    entry: STAGE36_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE36_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-36-enemy-phase-music": {
    id: "stage36-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE36_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE36_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE36_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE36_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage36Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-36-enter-deployment": { type: "enter-deployment" },
    "stage-36-set-victory-999": { type: "victory-state", value: 999 },
    "stage-36-route-to-stage-37": { type: "campaign-route", destination: "stage-37" },
  });
  registerStageStoryPages(STAGE36_STORY_PAGES);
  registerStageMusicPrograms(STAGE36_MUSIC_PROGRAMS);
}

export {
  STAGE36_CONTENT_IDENTITY,
  STAGE36_EVENT_PROGRAM,
  STAGE36_SOURCES,
  STAGE36_STORY_PAGES,
};
