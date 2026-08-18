import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE35_CONSTRUCTION_TOKENS,
  STAGE35_CONTENT_IDENTITY,
  STAGE35_DEPLOYMENT,
  STAGE35_ENEMY_UNITS,
  STAGE35_EVENT_PROGRAM,
  STAGE35_FIXED_ALLIED_UNITS,
  STAGE35_MUSIC_RECORDS,
  STAGE35_OBJECTIVE,
  STAGE35_SOURCES,
  STAGE35_STORY_PAGES,
  STAGE35_TERRAIN_TOKENS_BASE64,
  STAGE35_TITLE,
  STAGE35_TOKEN_TO_SLOT_BASE64,
} from "./stage35-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 35 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE35_TERRAIN_TOKENS = decode(STAGE35_TERRAIN_TOKENS_BASE64);
export const STAGE35_TOKEN_TO_TERRAIN_SLOT = decode(STAGE35_TOKEN_TO_SLOT_BASE64);
export const STAGE35_IRON_PLATE_TERRAIN_SLOT =
  STAGE35_TOKEN_TO_TERRAIN_SLOT[STAGE35_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE35_OBSTACLE_TERRAIN_SLOT =
  STAGE35_TOKEN_TO_TERRAIN_SLOT[STAGE35_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE35_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE35 = {
  id: "stage-35",
  nativeStage: 35,
  name: STAGE35_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 28, y: 7 },
    originBounds,
  },
} as const;

export const STAGE35_DEFINITION = {
  ...STAGE35,
  contentIdentity: STAGE35_CONTENT_IDENTITY,
  objective: STAGE35_OBJECTIVE,
  deployment: STAGE35_DEPLOYMENT,
  stories: {
    opening: "stage-35-opening-story",
    roundStarts: [],
    victory: "stage-35-victory-story",
  },
  music: {
    playerPhase: "stage-35-player-phase-music",
    enemyPhase: "stage-35-enemy-phase-music",
  },
  events: [
    {
      id: "stage-35-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-35-opening-story",
    },
    {
      id: "stage-35-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-35-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-35-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-35-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-35-victory-story",
    },
    {
      id: "stage-35-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-35-route-to-stage-36",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-35">;

registerRuntimeStageDefinition(STAGE35_DEFINITION);

export function stage35TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE35_TOKEN_TO_TERRAIN_SLOT[STAGE35_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE35_SEMANTIC_ALLIED_UNITS = STAGE35_FIXED_ALLIED_UNITS.map((unit) => ({
  slot: unit.slot,
  position: unit.position,
  name: unit.normalizedName,
  portrait: unit.portraitRecord as PortraitRecord,
  aiBehavior: unit.aiBehavior,
  untouchedExperience: unit.slot === 7 ? 0 : 299,
}));

export const STAGE35_SEMANTIC_ENEMY_UNITS = STAGE35_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait: (classFallbackPortraitFor(classId, 2) ?? 48) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE35_ASSETS = {
  map: "/assets/original/stage35-map.png",
  minimap: "/assets/original/stage35-minimap.png",
  unitSprites: {
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-half-dragon-warrior": "/assets/original/technique-lab/units/enemy-half-dragon-warrior.png",
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 35),
    playerLoop: musicAsset("MUSIC", 34),
    enemyEntry: musicAsset("MUSIC", 13),
    enemyLoop: musicAsset("MUSIC", 12),
  },
} as const;

export const STAGE35_MUSIC_PROGRAMS = {
  "stage-35-player-phase-music": {
    id: "stage35-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE35_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE35_MUSIC_RECORDS.player.loop}`,
    entry: STAGE35_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE35_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-35-enemy-phase-music": {
    id: "stage35-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE35_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE35_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE35_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE35_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage35Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-35-set-victory-999": { type: "victory-state", value: 999 },
    "stage-35-route-to-stage-36": { type: "campaign-route", destination: "stage-36" },
  });
  registerStageStoryPages(STAGE35_STORY_PAGES);
  registerStageMusicPrograms(STAGE35_MUSIC_PROGRAMS);
}

export {
  STAGE35_CONTENT_IDENTITY,
  STAGE35_EVENT_PROGRAM,
  STAGE35_SOURCES,
  STAGE35_STORY_PAGES,
};
