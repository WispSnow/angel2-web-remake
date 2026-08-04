import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE3_ALLIED_ACTORS,
  STAGE3_ALLIED_UNITS,
  STAGE3_CONTENT_IDENTITY,
  STAGE3_DEPLOYMENT,
  STAGE3_ENEMY_UNITS,
  STAGE3_EVENT_PROGRAM,
  STAGE3_MUSIC_RECORDS,
  STAGE3_OBJECTIVE,
  STAGE3_SOURCES,
  STAGE3_STORY_PAGES,
  STAGE3_TERRAIN_TOKENS_BASE64,
  STAGE3_TITLE,
  STAGE3_TOKEN_TO_SLOT_BASE64,
} from "./stage3-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 3 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE3_TERRAIN_TOKENS = decode(STAGE3_TERRAIN_TOKENS_BASE64);
export const STAGE3_TOKEN_TO_TERRAIN_SLOT = decode(STAGE3_TOKEN_TO_SLOT_BASE64);
export const STAGE3_TERRAIN_CONTENT_BOUNDS = terrainContentBounds(
  STAGE3_TERRAIN_TOKENS,
  50,
  50,
);
export const STAGE3_CAMERA_ORIGIN_BOUNDS = viewportOriginBoundsForContent(
  STAGE3_TERRAIN_CONTENT_BOUNDS,
  { width: 10, height: 7 },
);

const initialOrigin = {
  x: Math.max(STAGE3_CAMERA_ORIGIN_BOUNDS.min.x, Math.min(12, STAGE3_CAMERA_ORIGIN_BOUNDS.max.x)),
  y: Math.max(STAGE3_CAMERA_ORIGIN_BOUNDS.min.y, Math.min(33, STAGE3_CAMERA_ORIGIN_BOUNDS.max.y)),
};

export const STAGE3 = {
  id: "stage-03",
  nativeStage: 3,
  name: STAGE3_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin,
    originBounds: STAGE3_CAMERA_ORIGIN_BOUNDS,
  },
} as const;

export const STAGE3_DEFINITION = {
  ...STAGE3,
  contentIdentity: STAGE3_CONTENT_IDENTITY,
  objective: STAGE3_OBJECTIVE,
  deployment: STAGE3_DEPLOYMENT,
  stories: {
    opening: "stage-03-opening-story",
    roundStarts: [],
    victory: "stage-03-victory-story",
  },
  music: {
    playerPhase: "stage-03-player-phase-music",
    enemyPhase: "stage-03-enemy-phase-music",
  },
  events: [
    {
      id: "stage-03-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-03-opening-story",
    },
    {
      id: "stage-03-boss-defeated",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-03-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-03-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-03-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-03-victory-story",
    },
    {
      id: "stage-03-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-03-route-to-stage-04",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-03">;

registerRuntimeStageDefinition(STAGE3_DEFINITION);

export function stage3TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE3.width || position.y >= STAGE3.height) return 0;
  const token = STAGE3_TERRAIN_TOKENS[position.y * STAGE3.width + position.x];
  return STAGE3_TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const STAGE3_SEMANTIC_ALLIED_UNITS = STAGE3_ALLIED_UNITS.map((unit) => {
  const actor = STAGE3_ALLIED_ACTORS.find(({ slot }) => slot === unit.slot);
  if (!actor) throw new Error(`Missing stage 3 allied actor ${unit.slot}`);
  return {
    ...unit,
    initialClassId: unit.nativeClassRecord === null ? undefined : semanticClassId(unit.nativeClassRecord),
    name: actor.portraitRecord === 255 ? "士兵" : actor.normalizedName,
    portrait: (actor.portraitRecord === 255 ? 47 : actor.portraitRecord) as PortraitRecord,
  };
});

function enemyIdentity(
  slot: number,
  classId: UnitClassId,
): { name: string; portrait: PortraitRecord } {
  if (slot === 17) return { name: "莎", portrait: 36 };
  if (classId === "sister") return { name: "騎士團修女", portrait: 49 };
  if (classId === "cavalry") return { name: "騎士團騎兵", portrait: 53 };
  return { name: "騎士團士兵", portrait: 48 };
}

export const STAGE3_SEMANTIC_ENEMY_UNITS = STAGE3_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    ...unit,
    classId,
    ...enemyIdentity(unit.slot, classId),
  };
});

export const STAGE3_ASSETS = {
  map: "/assets/original/stage3-map.png",
  minimap: "/assets/original/stage3-minimap.png",
  allyMagician: "/assets/original/unit-ally-magician.png",
  allyMagicPriest: "/assets/original/unit-ally-magic-priest.png",
  enemySister: "/assets/original/unit-enemy-sister.png",
  enemyMonk: "/assets/original/unit-enemy-monk.png",
  audio: {
    playerEntry: "/assets/original/battle-stage3-player-entry.wav",
    playerLoop: "/assets/original/battle-stage3-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage3-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage3-enemy-loop.wav",
  },
} as const;

export const STAGE3_MUSIC_PROGRAMS = {
  "stage-03-player-phase-music": {
    id: "stage3-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE3_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE3_MUSIC_RECORDS.player.loop}`,
    entry: STAGE3_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE3_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-03-enemy-phase-music": {
    id: "stage3-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE3_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE3_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE3_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE3_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage3Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-03-set-victory-999": { type: "victory-state", value: 999 },
    "stage-03-route-to-stage-04": { type: "campaign-route", destination: "stage-04" },
  });
  registerStageStoryPages(STAGE3_STORY_PAGES);
  registerStageMusicPrograms(STAGE3_MUSIC_PROGRAMS);
}

export {
  STAGE3_EVENT_PROGRAM,
  STAGE3_MUSIC_RECORDS,
  STAGE3_SOURCES,
  STAGE3_STORY_PAGES,
};
