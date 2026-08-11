import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE2_ALLIED_ACTORS,
  STAGE2_ALLIED_UNITS,
  STAGE2_BOSS,
  STAGE2_CONTENT_IDENTITY,
  STAGE2_DEPLOYMENT,
  STAGE2_ENEMY_UNITS,
  STAGE2_EVENT_PROGRAM,
  STAGE2_MUSIC_RECORDS,
  STAGE2_OBJECTIVE,
  STAGE2_SOURCES,
  STAGE2_STORY_PAGES,
  STAGE2_TERRAIN_TOKENS_BASE64,
  STAGE2_TITLE,
  STAGE2_TOKEN_TO_SLOT_BASE64,
} from "./stage2-runtime.generated";
import {
  registerRuntimeStageDefinition,
  type StageDefinition,
  type StageMusicId,
} from "./stages";
import {
  terrainContentBounds,
  viewportOriginBoundsForContent,
} from "./terrain";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const semanticClassId = (nativeClassRecord: number): UnitClassId => {
  const classId = classIdFromNativeRecord(nativeClassRecord);
  if (!classId) throw new Error(`Unknown stage 2 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE2_TERRAIN_TOKENS = decode(STAGE2_TERRAIN_TOKENS_BASE64);
export const STAGE2_TOKEN_TO_TERRAIN_SLOT = decode(STAGE2_TOKEN_TO_SLOT_BASE64);
export const STAGE2_IRON_PLATE_TERRAIN_SLOT = STAGE2_TOKEN_TO_TERRAIN_SLOT[4];
export const STAGE2_OBSTACLE_TERRAIN_SLOT = STAGE2_TOKEN_TO_TERRAIN_SLOT[4];
export const STAGE2_TERRAIN_CONTENT_BOUNDS = terrainContentBounds(
  STAGE2_TERRAIN_TOKENS,
  50,
  50,
);
export const STAGE2_CAMERA_ORIGIN_BOUNDS = viewportOriginBoundsForContent(
  STAGE2_TERRAIN_CONTENT_BOUNDS,
  { width: 10, height: 7 },
);

const initialOrigin = {
  x: Math.max(STAGE2_CAMERA_ORIGIN_BOUNDS.min.x, Math.min(17, STAGE2_CAMERA_ORIGIN_BOUNDS.max.x)),
  y: Math.max(STAGE2_CAMERA_ORIGIN_BOUNDS.min.y, Math.min(32, STAGE2_CAMERA_ORIGIN_BOUNDS.max.y)),
};

export const STAGE2 = {
  id: "stage-02",
  nativeStage: 2,
  name: STAGE2_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin,
    originBounds: STAGE2_CAMERA_ORIGIN_BOUNDS,
  },
} as const;

export const STAGE2_DEFINITION = {
  ...STAGE2,
  contentIdentity: STAGE2_CONTENT_IDENTITY,
  objective: STAGE2_OBJECTIVE,
  deployment: STAGE2_DEPLOYMENT,
  stories: {
    opening: "stage-02-opening-story",
    roundStarts: [],
    victory: "stage-02-victory-story",
  },
  music: {
    playerPhase: "stage-02-player-phase-music",
    enemyPhase: "stage-02-enemy-phase-music",
  },
  events: [
    {
      id: "stage-02-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-02-opening-story",
    },
    {
      id: "stage-02-boss-defeated",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-02-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-02-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-02-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-02-victory-story",
    },
    {
      id: "stage-02-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-02-route-to-stage-03",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-02">;

registerRuntimeStageDefinition(STAGE2_DEFINITION);

export function stage2TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE2.width || position.y >= STAGE2.height) return 0;
  const token = STAGE2_TERRAIN_TOKENS[position.y * STAGE2.width + position.x];
  return STAGE2_TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const STAGE2_SEMANTIC_ALLIED_UNITS = STAGE2_ALLIED_UNITS.map((unit) => {
  const actor = STAGE2_ALLIED_ACTORS.find(({ slot }) => slot === unit.slot);
  if (!actor) throw new Error(`Missing stage 2 allied actor ${unit.slot}`);
  return {
    ...unit,
    initialClassId: unit.nativeClassRecord === null ? undefined : semanticClassId(unit.nativeClassRecord),
    name: actor.portraitRecord === 255 ? "士兵" : actor.normalizedName,
    portrait: (actor.portraitRecord === 255 ? 47 : actor.portraitRecord) as PortraitRecord,
  };
});

export const STAGE2_SEMANTIC_ENEMY_UNITS = STAGE2_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  // REMAKE-051: the leader identity is generated from the machine enemy-actor
  // table for the slot the victory handler scans; it is never hand-written here.
  const leader = unit.slot === STAGE2_BOSS.slot;
  return {
    ...unit,
    classId,
    name: leader ? STAGE2_BOSS.name : classId === "cavalry" ? "騎士團騎兵" : "騎士團士兵",
    portrait: (leader
      ? STAGE2_BOSS.portraitRecord
      : classId === "cavalry" ? 53 : 48) as PortraitRecord,
  };
});

export const STAGE2_ASSETS = {
  map: "/assets/original/stage2-map.png",
  minimap: "/assets/original/stage2-minimap.png",
  allyMagician: "/assets/original/unit-ally-magician.png",
  allyMagicPriest: "/assets/original/unit-ally-magic-priest.png",
  enemySister: "/assets/original/unit-enemy-sister.png",
  audio: {
    playerEntry: "/assets/original/battle-stage2-player-entry.wav",
    playerLoop: "/assets/original/battle-stage2-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage2-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage2-enemy-loop.wav",
  },
} as const;

export const STAGE2_MUSIC_PROGRAMS = {
  "stage-02-player-phase-music": {
    id: "stage2-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE2_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE2_MUSIC_RECORDS.player.loop}`,
    entry: STAGE2_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE2_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-02-enemy-phase-music": {
    id: "stage2-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE2_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE2_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE2_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE2_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage2Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-02-set-victory-999": { type: "victory-state", value: 999 },
    "stage-02-route-to-stage-03": { type: "campaign-route", destination: "stage-03" },
  });
  registerStageStoryPages(STAGE2_STORY_PAGES);
  registerStageMusicPrograms(STAGE2_MUSIC_PROGRAMS);
}

export {
  STAGE2_EVENT_PROGRAM,
  STAGE2_MUSIC_RECORDS,
  STAGE2_SOURCES,
  STAGE2_STORY_PAGES,
};
