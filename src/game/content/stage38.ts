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
  STAGE38_CONSTRUCTION_TOKENS,
  STAGE38_CONTENT_IDENTITY,
  STAGE38_DEPLOYMENT,
  STAGE38_DEPLOYMENT_ACTORS,
  STAGE38_ENEMY_UNITS,
  STAGE38_EVENT_PROGRAM,
  STAGE38_MUSIC_RECORDS,
  STAGE38_OBJECTIVE,
  STAGE38_SOURCES,
  STAGE38_STORY_PAGES,
  STAGE38_TERRAIN_TOKENS_BASE64,
  STAGE38_TITLE,
  STAGE38_TOKEN_TO_SLOT_BASE64,
} from "./stage38-runtime.generated";
import { registerRuntimeStageDefinition, type StageDefinition, type StageMusicId } from "./stages";
import { terrainContentBounds, viewportOriginBoundsForContent } from "./terrain";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const semanticClassId = (nativeClassRecord: number): UnitClassId => {
  const classId = classIdFromNativeRecord(nativeClassRecord);
  if (!classId) throw new Error(`Unknown stage 38 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE38_TERRAIN_TOKENS = decode(STAGE38_TERRAIN_TOKENS_BASE64);
export const STAGE38_TOKEN_TO_TERRAIN_SLOT = decode(STAGE38_TOKEN_TO_SLOT_BASE64);
export const STAGE38_IRON_PLATE_TERRAIN_SLOT =
  STAGE38_TOKEN_TO_TERRAIN_SLOT[STAGE38_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE38_OBSTACLE_TERRAIN_SLOT =
  STAGE38_TOKEN_TO_TERRAIN_SLOT[STAGE38_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE38_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE38 = {
  id: "stage-38",
  nativeStage: 38,
  name: STAGE38_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 24, y: 24 },
    originBounds,
  },
} as const;

export const STAGE38_DEFINITION = {
  ...STAGE38,
  contentIdentity: STAGE38_CONTENT_IDENTITY,
  objective: STAGE38_OBJECTIVE,
  deployment: STAGE38_DEPLOYMENT,
  stories: {
    opening: "stage-38-opening-story",
    roundStarts: [],
    victory: "stage-38-victory-story",
  },
  music: {
    playerPhase: "stage-38-player-phase-music",
    enemyPhase: "stage-38-enemy-phase-music",
  },
  events: [
    {
      id: "stage-38-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-38-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-38-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "stage-38-focus-nia",
      presentation: "stage-38-opening-story",
    },
    {
      id: "stage-38-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-38-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-38-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-38-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-38-victory-story",
    },
    {
      id: "stage-38-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-38-route-to-credits",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-38">;

registerRuntimeStageDefinition(STAGE38_DEFINITION);

export function stage38TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE38_TOKEN_TO_TERRAIN_SLOT[STAGE38_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE38_SEMANTIC_ALLIED_UNITS = STAGE38_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: untouchedEntryExperience(actor.slot, actor.slot === 7 ? 0 : 299),
}));

export const STAGE38_SEMANTIC_ENEMY_UNITS = STAGE38_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    portrait: ("portraitRecord" in unit
      ? unit.portraitRecord
      : classFallbackPortraitFor(classId, 2) ?? 48) as PortraitRecord,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE38_ASSETS = {
  map: "/assets/original/stage38-map.png",
  minimap: "/assets/original/stage38-minimap.png",
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
    "enemy-magic-archer": "/assets/original/technique-lab/units/enemy-magic-archer.png",
    "enemy-demon-dragon-knight": "/assets/original/technique-lab/units/enemy-demon-dragon-knight.png",
    "enemy-flying-dragon-knight": "/assets/original/technique-lab/units/enemy-flying-dragon-knight.png",
    "enemy-bone-knight": "/assets/original/technique-lab/units/enemy-bone-knight.png",
    "enemy-swift-dragon-knight": "/assets/original/technique-lab/units/enemy-swift-dragon-knight.png",
    "enemy-great-dragon-knight": "/assets/original/technique-lab/units/enemy-great-dragon-knight.png",
    "enemy-wizard": "/assets/original/technique-lab/units/enemy-wizard.png",
    "enemy-magic-master": "/assets/original/technique-lab/units/enemy-magic-master.png",
    "enemy-evil-sword-warrior": "/assets/original/technique-lab/units/enemy-evil-sword-warrior.png",
    "enemy-beast-knight": "/assets/original/technique-lab/units/enemy-beast-knight.png",
    "enemy-cavalry": "/assets/original/technique-lab/units/enemy-cavalry.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
    "enemy-crossbow": "/assets/original/technique-lab/units/enemy-crossbow.png",
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-warrior": "/assets/original/technique-lab/units/enemy-warrior.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-engineer": "/assets/original/technique-lab/units/enemy-engineer.png",
  },
  audio: {
    playerEntry: "/assets/original/battle-stage38-player-entry.wav",
    playerLoop: "/assets/original/battle-stage38-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage38-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage38-enemy-loop.wav",
  },
} as const;

export const STAGE38_MUSIC_PROGRAMS = {
  "stage-38-player-phase-music": {
    id: "stage38-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE38_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE38_MUSIC_RECORDS.player.loop}`,
    entry: STAGE38_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE38_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-38-enemy-phase-music": {
    id: "stage38-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE38_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE38_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE38_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE38_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage38Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-38-enter-deployment": { type: "enter-deployment" },
    "stage-38-focus-nia": { type: "focus-actor", actor: STAGE38_EVENT_PROGRAM.openingFocus.actor },
    "stage-38-set-victory-999": { type: "victory-state", value: 999 },
    "stage-38-route-to-credits": { type: "campaign-route", destination: "stage-39" },
  });
  registerStageStoryPages(STAGE38_STORY_PAGES);
  registerStageMusicPrograms(STAGE38_MUSIC_PROGRAMS);
}

export { STAGE38_CONTENT_IDENTITY, STAGE38_EVENT_PROGRAM, STAGE38_SOURCES, STAGE38_STORY_PAGES };
