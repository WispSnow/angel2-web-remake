import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import {
  STAGE3_GENERIC_ALLY_SLOT_SWAP,
  withSwappedGenericAllySlots,
} from "./generic-ally-stage-swap";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE3_ALLIED_ACTORS,
  STAGE3_ALLIED_UNITS,
  STAGE3_BOSS,
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
export const STAGE3_IRON_PLATE_TERRAIN_SLOT = STAGE3_TOKEN_TO_TERRAIN_SLOT[28];
export const STAGE3_OBSTACLE_TERRAIN_SLOT = STAGE3_TOKEN_TO_TERRAIN_SLOT[36];
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
    // REMAKE-109：开场剧情结束后先正式进入玩家回合，再把第四军团三名具名成员推过
    // 转职阈值。顺序不能反——授职提示必须落在玩家阶段里，而不是还在剧情阶段。
    {
      id: "stage-03-player-ready",
      trigger: { type: "story-completed", storyId: "stage-03-opening-story" },
      simulationEffect: "stage-03-player-ready",
      presentation: "none",
    },
    {
      id: "stage-03-fourth-corps-joined",
      trigger: { type: "effect-completed", effectId: "stage-03-player-ready" },
      simulationEffect: "stage-03-fourth-corps-joined",
      presentation: "none",
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

// 角色描述符按原版槽查表，槽号随后由 `REMAKE-108` 改写；换进来的 40–43 与被换走的
// 51–54 同为 `FFh` 通用条目，所以查表顺序不影响姓名与肖像。
export const STAGE3_SEMANTIC_ALLIED_UNITS = withSwappedGenericAllySlots(
  STAGE3_ALLIED_UNITS.map((unit) => {
    const actor = STAGE3_ALLIED_ACTORS.find(({ slot }) => slot === unit.slot);
    if (!actor) throw new Error(`Missing stage 3 allied actor ${unit.slot}`);
    const named = actor.portraitRecord !== 255;
    return {
      ...unit,
      initialClassId: unit.nativeClassRecord === null ? undefined : semanticClassId(unit.nativeClassRecord),
      name: named ? actor.normalizedName : "士兵",
      portrait: (named ? actor.portraitRecord : 47) as PortraitRecord,
    };
  }),
  STAGE3_GENERIC_ALLY_SLOT_SWAP,
);

/**
 * `REMAKE-109`：被救援的第四军团具名成员，按棋盘顺序排列。
 *
 * 判据与军团归属同源，所以这里不手抄槽 3／20／21：逐槽行为非 `0` 的属于第四军团，
 * 描述符肖像不是 `FFh` 的才是具名角色。三人的入队经验保持原版 299 名单基线，开场
 * 加的那 1 点经验由 `stage-03-fourth-corps-joined` 事件发放。
 */
export const STAGE3_FOURTH_CORPS_NAMED_ACTORS = STAGE3_SEMANTIC_ALLIED_UNITS
  .filter(({ slot, aiBehavior }) => aiBehavior !== 0
    && STAGE3_ALLIED_ACTORS.find((actor) => actor.slot === slot)?.portraitRecord !== 255)
  .sort((left, right) =>
    (left.position.y * STAGE3.width + left.position.x)
    - (right.position.y * STAGE3.width + right.position.x))
  .map(({ slot }) => ({ side: 1 as const, slot }));

function enemyIdentity(
  slot: number,
  classId: UnitClassId,
): { name: string; portrait: PortraitRecord } {
  // REMAKE-051: the boss identity is generated from the machine enemy-actor table
  // for the slot the victory handler scans; it is never hand-written here.
  if (slot === STAGE3_BOSS.slot) {
    return { name: STAGE3_BOSS.name, portrait: STAGE3_BOSS.portraitRecord as PortraitRecord };
  }
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
    "stage-03-player-ready": {
      type: "enter-player-phase",
      statusText: "我方回合：選擇一名尚未行動的單位。",
    },
    "stage-03-fourth-corps-joined": {
      type: "grant-experience",
      actors: STAGE3_FOURTH_CORPS_NAMED_ACTORS,
      amount: 1,
      statusText: "獲救的第四軍團夥伴加入希蜜的隊伍，達到轉職條件。",
    },
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
