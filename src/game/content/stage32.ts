import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classFallbackPortraitFor, classIdFromNativeRecord, className } from "./classes";
import { untouchedEntryExperience } from "./campaign-entry-experience";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE32_CONSTRUCTION_TOKENS,
  STAGE32_CONTENT_IDENTITY,
  STAGE32_DEPLOYMENT,
  STAGE32_DEPLOYMENT_ACTORS,
  STAGE32_ENEMY_UNITS,
  STAGE32_EVENT_PROGRAM,
  STAGE32_MUSIC_RECORDS,
  STAGE32_OBJECTIVE,
  STAGE32_SOURCES,
  STAGE32_STORY_PAGES,
  STAGE32_TERRAIN_TOKENS_BASE64,
  STAGE32_TITLE,
  STAGE32_TOKEN_TO_SLOT_BASE64,
} from "./stage32-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 32 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE32_TERRAIN_TOKENS = decode(STAGE32_TERRAIN_TOKENS_BASE64);
export const STAGE32_TOKEN_TO_TERRAIN_SLOT = decode(STAGE32_TOKEN_TO_SLOT_BASE64);
export const STAGE32_IRON_PLATE_TERRAIN_SLOT =
  STAGE32_TOKEN_TO_TERRAIN_SLOT[STAGE32_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE32_OBSTACLE_TERRAIN_SLOT =
  STAGE32_TOKEN_TO_TERRAIN_SLOT[STAGE32_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE32_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE32 = {
  id: "stage-32",
  nativeStage: 32,
  name: STAGE32_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 21, y: 21 },
    originBounds,
  },
} as const;

export const STAGE32_DEFINITION = {
  ...STAGE32,
  contentIdentity: STAGE32_CONTENT_IDENTITY,
  objective: STAGE32_OBJECTIVE,
  deployment: STAGE32_DEPLOYMENT,
  stories: {
    opening: "stage-32-opening-story",
    roundStarts: [],
    victory: "stage-32-victory-story",
  },
  music: {
    playerPhase: "stage-32-player-phase-music",
    enemyPhase: "stage-32-enemy-phase-music",
  },
  events: [
    {
      id: "stage-32-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-32-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-32-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-32-opening-story",
    },
    {
      id: "stage-32-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-32-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-32-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-32-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-32-victory-story",
    },
    {
      id: "stage-32-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-32-route-to-stage-33",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-32">;

registerRuntimeStageDefinition(STAGE32_DEFINITION);

export function stage32TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE32_TOKEN_TO_TERRAIN_SLOT[STAGE32_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE32_SEMANTIC_ALLIED_UNITS = STAGE32_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: untouchedEntryExperience(actor.slot, actor.slot === 7 ? 0 : 299),
}));

export const STAGE32_SEMANTIC_ENEMY_UNITS = STAGE32_ENEMY_UNITS.map((unit) => {
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

export const STAGE32_ASSETS = {
  map: "/assets/original/stage32-map.png",
  minimap: "/assets/original/stage32-minimap.png",
  unitSprites: {
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-flying-dragon-knight": "/assets/original/technique-lab/units/enemy-flying-dragon-knight.png",
    "enemy-beast-knight": "/assets/original/technique-lab/units/enemy-beast-knight.png",
    "enemy-bone-knight": "/assets/original/technique-lab/units/enemy-bone-knight.png",
    "enemy-great-axe-warrior": "/assets/original/technique-lab/units/enemy-great-axe-warrior.png",
    "enemy-evil-sword-warrior": "/assets/original/technique-lab/units/enemy-evil-sword-warrior.png",
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-prayer-guide": "/assets/original/technique-lab/units/enemy-prayer-guide.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-evil-mage": "/assets/original/technique-lab/units/enemy-evil-mage.png",
    "enemy-curse-master": "/assets/original/technique-lab/units/enemy-curse-master.png",
    "enemy-wizard": "/assets/original/technique-lab/units/enemy-wizard.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
    "enemy-magic-guide": "/assets/original/technique-lab/units/enemy-magic-guide.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 39),
    playerLoop: musicAsset("MUSIC", 38),
    enemyEntry: musicAsset("MUSIC", 13),
    enemyLoop: musicAsset("MUSIC", 12),
  },
} as const;

export const STAGE32_MUSIC_PROGRAMS = {
  "stage-32-player-phase-music": {
    id: "stage32-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE32_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE32_MUSIC_RECORDS.player.loop}`,
    entry: STAGE32_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE32_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-32-enemy-phase-music": {
    id: "stage32-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE32_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE32_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE32_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE32_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage32Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-32-enter-deployment": { type: "enter-deployment" },
    "stage-32-set-victory-999": { type: "victory-state", value: 999 },
    "stage-32-route-to-stage-33": { type: "campaign-route", destination: "stage-33" },
  });
  registerStageStoryPages(STAGE32_STORY_PAGES);
  registerStageMusicPrograms(STAGE32_MUSIC_PROGRAMS);
}

export {
  STAGE32_CONTENT_IDENTITY,
  STAGE32_EVENT_PROGRAM,
  STAGE32_SOURCES,
  STAGE32_STORY_PAGES,
};
