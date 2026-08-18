import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import type { EscortRouteDefinition } from "../simulation/escort-route";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { musicAsset, registerStageMusicPrograms } from "./music";
import {
  STAGE9_CONTENT_IDENTITY,
  STAGE9_DEPLOYMENT,
  STAGE9_DEPLOYMENT_ACTORS,
  STAGE9_ENEMY_UNITS,
  STAGE9_ESCORT_ROUTE,
  STAGE9_EVENT_PROGRAM,
  STAGE9_FIXED_CLASS_OVERRIDES,
  STAGE9_MUSIC_RECORDS,
  STAGE9_OBJECTIVE,
  STAGE9_SOURCES,
  STAGE9_STORY_PAGES,
  STAGE9_TERRAIN_TOKENS_BASE64,
  STAGE9_TITLE,
  STAGE9_TOKEN_TO_SLOT_BASE64,
} from "./stage9-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 9 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE9_TERRAIN_TOKENS = decode(STAGE9_TERRAIN_TOKENS_BASE64);
export const STAGE9_TOKEN_TO_TERRAIN_SLOT = decode(STAGE9_TOKEN_TO_SLOT_BASE64);
export const STAGE9_IRON_PLATE_TERRAIN_SLOT = STAGE9_TOKEN_TO_TERRAIN_SLOT[27];
export const STAGE9_OBSTACLE_TERRAIN_SLOT = STAGE9_TOKEN_TO_TERRAIN_SLOT[27];
const contentBounds = terrainContentBounds(STAGE9_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE9 = {
  id: "stage-09",
  nativeStage: 9,
  name: STAGE9_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 13, y: 36 },
    originBounds,
  },
} as const;

export const STAGE9_DEFINITION = {
  ...STAGE9,
  contentIdentity: STAGE9_CONTENT_IDENTITY,
  objective: STAGE9_OBJECTIVE,
  deployment: STAGE9_DEPLOYMENT,
  stories: {
    opening: "stage-09-opening-story",
    roundStarts: [],
    victory: "stage-09-victory-story",
  },
  music: {
    playerPhase: "stage-09-player-phase-music",
    enemyPhase: "stage-09-enemy-phase-music",
  },
  events: [
    {
      id: "stage-09-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-09-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-09-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-09-opening-story",
    },
    {
      id: "stage-09-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-09-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-09-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-09-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-09-victory-story",
    },
    {
      id: "stage-09-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-09-route-to-stage-11",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-09">;

registerRuntimeStageDefinition(STAGE9_DEFINITION);

export function stage9TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE9_TOKEN_TO_TERRAIN_SLOT[STAGE9_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

export const STAGE9_SEMANTIC_ALLIED_UNITS = STAGE9_DEPLOYMENT_ACTORS.map((actor) => {
  const classOverride = STAGE9_FIXED_CLASS_OVERRIDES.find(({ slot }) => slot === actor.slot);
  return {
    slot: actor.slot,
    initialClassId: classOverride ? semanticClassId(classOverride.nativeClassRecord) : undefined,
    name: actor.normalizedName,
    portrait: actor.portraitRecord as PortraitRecord,
    aiBehavior: actor.slot === 9 ? 12 : 0,
    untouchedExperience: 299,
  };
});

export const STAGE9_SEMANTIC_ENEMY_UNITS = STAGE9_ENEMY_UNITS.map((unit) => {
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

export const STAGE9_ESCORT_ROUTE_DEFINITION = STAGE9_ESCORT_ROUTE satisfies EscortRouteDefinition;

export const STAGE9_ASSETS = {
  map: "/assets/original/stage9-map.png",
  minimap: "/assets/original/stage9-minimap.png",
  unitSprites: {
    "ally-curse-master": "/assets/original/technique-lab/units/ally-curse-master.png",
    "enemy-cavalry": "/assets/original/technique-lab/units/enemy-cavalry.png",
    "enemy-land-knight": "/assets/original/technique-lab/units/enemy-land-knight.png",
    "enemy-monk": "/assets/original/technique-lab/units/enemy-monk.png",
    "enemy-sister": "/assets/original/technique-lab/units/enemy-sister.png",
    "enemy-soldier": "/assets/original/technique-lab/units/enemy-soldier.png",
    "enemy-steel-armor-warrior": "/assets/original/technique-lab/units/enemy-steel-armor-warrior.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 39),
    playerLoop: musicAsset("MUSIC", 38),
    enemyEntry: musicAsset("MUSIC", 5),
    enemyLoop: musicAsset("MUSIC", 4),
  },
} as const;

export const STAGE9_MUSIC_PROGRAMS = {
  "stage-09-player-phase-music": {
    id: "stage9-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE9_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE9_MUSIC_RECORDS.player.loop}`,
    entry: STAGE9_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE9_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-09-enemy-phase-music": {
    id: "stage9-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE9_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE9_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE9_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE9_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage9Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-09-enter-deployment": { type: "enter-deployment" },
    "stage-09-set-victory-999": { type: "victory-state", value: 999 },
    "stage-09-route-to-stage-11": { type: "campaign-route", destination: "stage-11" },
  });
  registerStageStoryPages(STAGE9_STORY_PAGES);
  registerStageMusicPrograms(STAGE9_MUSIC_PROGRAMS);
}

export {
  STAGE9_CONTENT_IDENTITY,
  STAGE9_EVENT_PROGRAM,
  STAGE9_SOURCES,
  STAGE9_STORY_PAGES,
};
