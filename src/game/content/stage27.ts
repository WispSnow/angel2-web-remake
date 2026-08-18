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
  STAGE27_CONSTRUCTION_TOKENS,
  STAGE27_CONTENT_IDENTITY,
  STAGE27_DEPLOYMENT,
  STAGE27_DEPLOYMENT_ACTORS,
  STAGE27_ENEMY_UNITS,
  STAGE27_EVENT_PROGRAM,
  STAGE27_FIXED_ALLIED_UNITS,
  STAGE27_MUSIC_RECORDS,
  STAGE27_OBJECTIVE,
  STAGE27_SOURCES,
  STAGE27_STORY_PAGES,
  STAGE27_TERRAIN_TOKENS_BASE64,
  STAGE27_TITLE,
  STAGE27_TOKEN_TO_SLOT_BASE64,
} from "./stage27-runtime.generated";
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
  if (!classId) throw new Error(`Unknown stage 27 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE27_TERRAIN_TOKENS = decode(STAGE27_TERRAIN_TOKENS_BASE64);
export const STAGE27_TOKEN_TO_TERRAIN_SLOT = decode(STAGE27_TOKEN_TO_SLOT_BASE64);
export const STAGE27_IRON_PLATE_TERRAIN_SLOT =
  STAGE27_TOKEN_TO_TERRAIN_SLOT[STAGE27_CONSTRUCTION_TOKENS.ironPlate];
export const STAGE27_OBSTACLE_TERRAIN_SLOT =
  STAGE27_TOKEN_TO_TERRAIN_SLOT[STAGE27_CONSTRUCTION_TOKENS.obstacle];
const contentBounds = terrainContentBounds(STAGE27_TERRAIN_TOKENS, 50, 50);
const originBounds = viewportOriginBoundsForContent(contentBounds, { width: 10, height: 7 });

export const STAGE27 = {
  id: "stage-27",
  nativeStage: 27,
  name: STAGE27_TITLE,
  width: 50,
  height: 50,
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 32, y: 32 },
    originBounds,
  },
} as const;

export const STAGE27_DEFINITION = {
  ...STAGE27,
  contentIdentity: STAGE27_CONTENT_IDENTITY,
  objective: STAGE27_OBJECTIVE,
  deployment: STAGE27_DEPLOYMENT,
  stories: {
    opening: "stage-27-opening-story",
    roundStarts: [],
    victory: "stage-27-victory-story",
  },
  music: {
    playerPhase: "stage-27-player-phase-music",
    enemyPhase: "stage-27-enemy-phase-music",
  },
  events: [
    {
      id: "stage-27-enter-deployment",
      trigger: { type: "campaign-entered" },
      simulationEffect: "stage-27-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-27-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-27-opening-story",
    },
    {
      id: "stage-27-objective-reached",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-27-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-27-victory-story",
      trigger: { type: "effect-completed", effectId: "stage-27-set-victory-999" },
      simulationEffect: "none",
      presentation: "stage-27-victory-story",
    },
    {
      id: "stage-27-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-27-route-to-stage-28",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-27">;

registerRuntimeStageDefinition(STAGE27_DEFINITION);

export function stage27TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= 50 || position.y >= 50) return 0;
  return STAGE27_TOKEN_TO_TERRAIN_SLOT[STAGE27_TERRAIN_TOKENS[position.y * 50 + position.x]] ?? 0;
}

const campaignActors = STAGE27_DEPLOYMENT_ACTORS.map((actor) => ({
  slot: actor.slot,
  name: actor.normalizedName,
  portrait: actor.portraitRecord as PortraitRecord,
  aiBehavior: 0,
  untouchedExperience: untouchedEntryExperience(actor.slot, actor.slot === 7 ? 0 : 299),
}));

export const STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS = campaignActors;

// 十名固定棋盘单位的 side-1 角色描述符肖像都是 FFh，因此原版 `0000:51B9` 用职业回退
// 同时替换肖像与单位名：槽 22 描述符虽然写着「愛莉歐拉」，玩家向身份仍是「巨斧戰士」
// 加通用戰士肖像，与其余六名城防军和三名工兵一致。这里不得登记逐单位姓名或肖像。
const fixedAllies = STAGE27_FIXED_ALLIED_UNITS.map((unit) => {
  const classId = unit.nativeClassRecord === null
    ? undefined
    : semanticClassId(unit.nativeClassRecord);
  return {
    slot: unit.slot,
    name: classId ? className(classId) : "士兵",
    aiBehavior: unit.aiBehavior,
    untouchedExperience: 0,
    ...(classId === undefined ? {} : { forcedClassId: classId }),
  };
});

export const STAGE27_SEMANTIC_ALLIED_UNITS = [...campaignActors, ...fixedAllies];

export const STAGE27_SEMANTIC_ENEMY_UNITS = STAGE27_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  const portrait = classFallbackPortraitFor(classId, 2);
  if (portrait === undefined) {
    throw new Error(`Missing stage 27 enemy portrait for native class ${unit.nativeClassRecord}`);
  }
  return {
    slot: unit.slot,
    position: unit.position,
    classId,
    name: className(classId),
    portrait,
    aiBehavior: unit.aiBehavior,
  };
});

export const STAGE27_ASSETS = {
  map: "/assets/original/stage27-map.png",
  minimap: "/assets/original/stage27-minimap.png",
  unitSprites: {
    "ally-great-axe-warrior": "/assets/original/technique-lab/units/ally-great-axe-warrior.png",
    "ally-magic-priest": "/assets/original/technique-lab/units/ally-magic-priest.png",
    "ally-magician": "/assets/original/technique-lab/units/ally-magician.png",
    "ally-curse-master": "/assets/original/technique-lab/units/ally-curse-master.png",
    "ally-prayer-guide": "/assets/original/technique-lab/units/ally-prayer-guide.png",
    "ally-magic-sword-warrior": "/assets/original/technique-lab/units/ally-magic-sword-warrior.png",
    "ally-engineer": "/assets/original/technique-lab/units/ally-engineer.png",
    "enemy-magic-sword-warrior": "/assets/original/technique-lab/units/enemy-magic-sword-warrior.png",
    "enemy-magic-priest": "/assets/original/technique-lab/units/enemy-magic-priest.png",
    "enemy-magic-archer": "/assets/original/technique-lab/units/enemy-magic-archer.png",
    "enemy-magic-armor-warrior": "/assets/original/technique-lab/units/enemy-magic-armor-warrior.png",
    "enemy-curse-master": "/assets/original/technique-lab/units/enemy-curse-master.png",
  },
  audio: {
    playerEntry: musicAsset("MUSIC", 3),
    playerLoop: musicAsset("MUSIC", 2),
    enemyEntry: musicAsset("MUSIC", 5),
    enemyLoop: musicAsset("MUSIC", 4),
  },
} as const;

export const STAGE27_MUSIC_PROGRAMS = {
  "stage-27-player-phase-music": {
    id: "stage27-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE27_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE27_MUSIC_RECORDS.player.loop}`,
    entry: STAGE27_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE27_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-27-enemy-phase-music": {
    id: "stage27-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE27_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE27_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE27_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE27_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function activateStage27Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-27-enter-deployment": { type: "enter-deployment" },
    "stage-27-set-victory-999": { type: "victory-state", value: 999 },
    "stage-27-route-to-stage-28": { type: "campaign-route", destination: "stage-28" },
  });
  registerStageStoryPages(STAGE27_STORY_PAGES);
  registerStageMusicPrograms(STAGE27_MUSIC_PROGRAMS);
}

export {
  STAGE27_CONTENT_IDENTITY,
  STAGE27_EVENT_PROGRAM,
  STAGE27_SOURCES,
  STAGE27_STORY_PAGES,
};
