import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE13_CONSTRUCTION_TOKENS,
  STAGE13_CONTENT_IDENTITY,
  STAGE13_DEPLOYMENT,
  STAGE13_DEPLOYMENT_ACTORS,
  STAGE13_ENEMY_UNITS,
  STAGE13_EVENT_PROGRAM,
  STAGE13_MUSIC_RECORDS,
  STAGE13_OBJECTIVE,
  STAGE13_PLAYER_CLASS_OVERRIDES,
  STAGE13_SOURCES,
  STAGE13_STORY_PAGES,
  STAGE13_TERRAIN_TOKENS_BASE64,
  STAGE13_TITLE,
  STAGE13_TOKEN_TO_SLOT_BASE64,
} from "./stage13-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 13 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE13_TERRAIN_TOKENS = decode(STAGE13_TERRAIN_TOKENS_BASE64);
export const STAGE13_TOKEN_TO_TERRAIN_SLOT = decode(STAGE13_TOKEN_TO_SLOT_BASE64);
export const STAGE13_IRON_PLATE_TERRAIN_SLOT =
  STAGE13_TOKEN_TO_TERRAIN_SLOT[STAGE13_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE13_OBSTACLE_TERRAIN_SLOT =
  STAGE13_TOKEN_TO_TERRAIN_SLOT[STAGE13_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE13_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE13 = {
  id: "stage-13",
  nativeStage: 13,
  name: STAGE13_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 32, y: 34 },
    originBounds,
  },
} as const;

export const STAGE13_DEFINITION = {
  ...STAGE13,
  contentIdentity: STAGE13_CONTENT_IDENTITY,
  objective: STAGE13_OBJECTIVE,
  deployment: STAGE13_DEPLOYMENT,
  stories: {
    prebattle: "stage-13-prebattle-story",
    roundStarts: [],
  },
  music: {
    story: "stage-13-story-music",
    playerPhase: "stage-13-player-phase-music",
    enemyPhase: "stage-13-enemy-phase-music",
  },
  events: [
    {
      id: "stage-13-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-13-prebattle-story",
    },
    {
      id: "stage-13-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-13-prebattle-story" },
      simulationEffect: "stage-13-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-13-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-13-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-13-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-13-route-to-stage-14",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-13">;

registerRuntimeStageDefinition(STAGE13_DEFINITION);

export function stage13TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE13_TOKEN_TO_TERRAIN_SLOT[STAGE13_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

const initialClassBySlot = new Map(
  STAGE13_PLAYER_CLASS_OVERRIDES.map(({ slot, nativeClassRecord }) =>
    [slot as number, semanticClassId(nativeClassRecord)] as const),
);

export const STAGE13_SEMANTIC_ALLIED_UNITS = STAGE13_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: 299,
  ...(initialClassBySlot.has(actor.slot) ? { initialClassId: initialClassBySlot.get(actor.slot) } : {}),
}));

export const STAGE13_SEMANTIC_ENEMY_UNITS = STAGE13_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: "name" in unit ? unit.name : className(classId),
    // Generic FFh actor descriptors inherit both portrait and display name
    // from the current class. Leave the portrait absent so the shared fixed-
    // stage constructor resolves the correct side-2 class variant.
    ...("portraitRecord" in unit
      ? { portrait: unit.portraitRecord as PortraitRecord }
      : {}),
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE13_ASSETS = {
  map: "/assets/original/stage13-map.png",
  minimap: "/assets/original/stage13-minimap.png",
  storyBackgrounds: {
    15: "/assets/original/story-stage13-background-15.png",
  },
  unitSprites: {
    "enemy-divine-sword-warrior": "/assets/original/technique-lab/units/enemy-divine-sword-warrior.png",
    "enemy-pegasus-warrior": "/assets/original/technique-lab/units/enemy-pegasus-warrior.png",
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-magician": "/assets/original/technique-lab/units/enemy-magician.png",
    "enemy-magic-guide": "/assets/original/technique-lab/units/enemy-magic-guide.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
    "enemy-cavalry": "/assets/original/technique-lab/units/enemy-cavalry.png",
    "enemy-archer": "/assets/original/technique-lab/units/enemy-archer.png",
    "enemy-monk": "/assets/original/technique-lab/units/enemy-monk.png",
  },
  audio: {
    story: "/assets/original/story-stage13.wav",
    playerEntry: "/assets/original/battle-stage13-player-entry.wav",
    playerLoop: "/assets/original/battle-stage13-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage13-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage13-enemy-loop.wav",
  },
} as const;

export const STAGE13_MUSIC_PROGRAMS = {
  "stage-13-story-music": {
    id: "stage13-story",
    kind: "loop",
    track: "MAGIC/77",
    source: STAGE13_ASSETS.audio.story,
    seamlessLoop: STAGE13_ASSETS.audio.story,
  },
  "stage-13-player-phase-music": {
    id: "stage13-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE13_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE13_MUSIC_RECORDS.player.loop}`,
    entry: STAGE13_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE13_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-13-enemy-phase-music": {
    id: "stage13-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE13_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE13_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE13_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE13_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage13Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-13-enter-deployment": { type: "enter-deployment" },
    "stage-13-set-victory-999": { type: "victory-state", value: 999 },
    "stage-13-route-to-stage-14": { type: "campaign-route", destination: "stage-14" },
  });
  registerStageStoryPages(STAGE13_STORY_PAGES);
  registerStageMusicPrograms(STAGE13_MUSIC_PROGRAMS);
}

export {
  STAGE13_CONTENT_IDENTITY,
  STAGE13_EVENT_PROGRAM,
  STAGE13_SOURCES,
  STAGE13_STORY_PAGES,
};
