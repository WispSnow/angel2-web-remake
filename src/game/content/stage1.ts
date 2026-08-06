import type { MusicProgram } from "../music-transport";
import type { PortraitRecord, Position, UnitClassId } from "../types";
import type { DeploymentRosterUnit } from "../deployment-session";
import * as actionContent from "./stage1-actions.generated";
import { registerActionContent } from "./actions";
import { classIdFromNativeRecord, className, classStatsFor } from "./classes";
import { registerStageStoryPages } from "./dialogue";
import { registerStageSimulationEffects } from "./stage-effects";
import { registerStageMusicPrograms } from "./music";
import {
  STAGE1_CONTENT_IDENTITY,
  STAGE1_DEPLOYMENT,
  STAGE1_DEPLOYMENT_ACTORS as STAGE1_GENERATED_DEPLOYMENT_ACTORS,
  STAGE1_DEPLOYMENT_UI,
  STAGE1_ENEMY_UNITS,
  STAGE1_EVENT_PROGRAM,
  STAGE1_MUSIC_RECORDS,
  STAGE1_OBJECTIVE,
  STAGE1_PLAYER_CLASS_OVERRIDES,
  STAGE1_SOURCES,
  STAGE1_STORY_PAGES,
  STAGE1_STORY_PRESENTATION,
  STAGE1_TERRAIN_TOKENS_BASE64,
  STAGE1_TITLE,
  STAGE1_TOKEN_TO_SLOT_BASE64,
} from "./stage1-runtime.generated";
import {
  registerRuntimeStageDefinition,
  type StageDefinition,
  type StageMusicId,
  type StageStoryId,
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
  if (!classId) throw new Error(`Unknown stage 1 native class record: ${nativeClassRecord}`);
  return classId;
};

export const STAGE1_TERRAIN_TOKENS = decode(STAGE1_TERRAIN_TOKENS_BASE64);
export const STAGE1_TOKEN_TO_TERRAIN_SLOT = decode(STAGE1_TOKEN_TO_SLOT_BASE64);
export const STAGE1_IRON_PLATE_TERRAIN_SLOT = STAGE1_TOKEN_TO_TERRAIN_SLOT[64];
export const STAGE1_OBSTACLE_TERRAIN_SLOT = STAGE1_TOKEN_TO_TERRAIN_SLOT[18];
export const STAGE1_TERRAIN_CONTENT_BOUNDS = terrainContentBounds(
  STAGE1_TERRAIN_TOKENS,
  50,
  50,
);
export const STAGE1_CAMERA_ORIGIN_BOUNDS = viewportOriginBoundsForContent(
  STAGE1_TERRAIN_CONTENT_BOUNDS,
  { width: 10, height: 7 },
);

export const STAGE1 = {
  id: "stage-01",
  nativeStage: 1,
  name: STAGE1_TITLE,
  width: 50,
  height: 50,
  // Native centering on Nia at (22,36) yields (18,33). The stable remake
  // clamps that presentation-only origin to the fully drawn map at y=31.
  viewport: {
    width: 10,
    height: 7,
    initialOrigin: { x: 18, y: STAGE1_CAMERA_ORIGIN_BOUNDS.max.y },
    originBounds: STAGE1_CAMERA_ORIGIN_BOUNDS,
  },
} as const;

/** REMAKE-012 semantic AI layout; native aiBehavior remains on the generated units as evidence. */
export const STAGE1_STABLE_AI = {
  pursuitGroup: {
    id: "forward-patrol",
    slots: [45, 46],
  },
  alertGroup: {
    id: "castle-guard",
    slots: [40, 41, 42, 43],
    trigger: "damage-this-turn",
  },
  commander: {
    slot: 16,
    pursuitDelayRounds: 1,
  },
} as const;

export const STAGE1_DEFINITION = {
  ...STAGE1,
  contentIdentity: STAGE1_CONTENT_IDENTITY,
  objective: STAGE1_OBJECTIVE,
  deployment: STAGE1_DEPLOYMENT,
  stories: {
    prebattle: "stage-01-prebattle-story",
    opening: "stage-01-opening-story",
    roundStarts: [],
    victory: "stage-01-victory-story",
  },
  music: {
    story: "stage-01-story-music",
    playerPhase: "stage-01-player-phase-music",
    enemyPhase: "stage-01-enemy-phase-music",
  },
  events: [
    {
      id: "stage-01-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-01-prebattle-story",
    },
    {
      id: "stage-01-enter-deployment",
      trigger: { type: "story-completed", storyId: "stage-01-prebattle-story" },
      simulationEffect: "stage-01-enter-deployment",
      presentation: "none",
    },
    {
      id: "stage-01-opening-story",
      trigger: { type: "battle-started" },
      simulationEffect: "none",
      presentation: "stage-01-opening-story",
    },
    {
      id: "stage-01-boss-defeated",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "stage-01-set-victory-999",
      presentation: "none",
    },
    {
      id: "stage-01-messenger-arrival",
      trigger: { type: "effect-completed", effectId: "stage-01-set-victory-999" },
      simulationEffect: "stage-01-messenger-arrival",
      presentation: "stage-01-victory-story",
    },
    {
      id: "stage-01-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-01-route-to-stage-02",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-01">;

registerRuntimeStageDefinition(STAGE1_DEFINITION);

export function stage1TerrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE1.width || position.y >= STAGE1.height) return 0;
  const token = STAGE1_TERRAIN_TOKENS[position.y * STAGE1.width + position.x];
  return STAGE1_TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const STAGE1_SEMANTIC_CLASS_OVERRIDES = STAGE1_PLAYER_CLASS_OVERRIDES.map(
  ({ slot, nativeClassRecord }) => ({ slot, classId: semanticClassId(nativeClassRecord) }),
);

const stage1ClassForSlot = (slot: number): UnitClassId =>
  STAGE1_SEMANTIC_CLASS_OVERRIDES.find((override) => override.slot === slot)?.classId
    ?? "soldier";

/** Evidence-backed stage-1 deployment roster seed merged with inherited campaign state at runtime. */
export const STAGE1_DEPLOYMENT_PREVIEW_ROSTER: readonly DeploymentRosterUnit[] =
  STAGE1_GENERATED_DEPLOYMENT_ACTORS.map((actor) => {
    const classId = stage1ClassForSlot(actor.slot);
    const portrait = (actor.portraitRecord === 255 ? 47 : actor.portraitRecord) as PortraitRecord;
    // Module 27 applies the named class-0 experience floor before stage template overrides.
    const experience = actor.portraitRecord === 255 ? 0 : 299;
    const stats = classStatsFor({ classId, experience });
    return {
      slot: actor.slot,
      name: actor.portraitRecord === 255 ? "士兵" : actor.normalizedName,
      portrait,
      classId,
      className: className(classId),
      experience,
      life: stats.maxLife,
    };
  });

function stage1EnemyIdentity(
  slot: number,
  classId: UnitClassId,
): { name: string; portrait: PortraitRecord } {
  if (slot === 16) return { name: "芳", portrait: 34 };
  switch (classId) {
    case "soldier":
      return { name: "騎士團士兵", portrait: 48 };
    case "sister":
      return { name: "騎士團修女", portrait: 49 };
    case "cavalry":
      return { name: "騎士團騎兵", portrait: 53 };
    default:
      throw new Error(`Unsupported stage 1 enemy class identity: ${classId}`);
  }
}

export const STAGE1_SEMANTIC_ENEMY_UNITS = STAGE1_ENEMY_UNITS.map((unit) => {
  const classId = semanticClassId(unit.nativeClassRecord);
  return {
    ...unit,
    classId,
    ...stage1EnemyIdentity(unit.slot, classId),
  };
});

export const STAGE1_ASSETS = {
  map: "/assets/original/stage1-map.png",
  minimap: "/assets/original/stage1-minimap.png",
  storyBackground: "/assets/original/story-stage1-background.png",
  allyMagician: "/assets/original/unit-ally-magician.png",
  allyMagicPriest: "/assets/original/unit-ally-magic-priest.png",
  enemySister: "/assets/original/unit-enemy-sister.png",
  portraits: {
    0: "/assets/original/portrait-0.png",
    42: "/assets/original/portrait-42.png",
    43: "/assets/original/portrait-43.png",
    44: "/assets/original/portrait-44.png",
    45: "/assets/original/portrait-ximi.png",
    46: "/assets/original/portrait-nia.png",
    47: "/assets/original/portrait-ally-soldier.png",
  },
  audio: {
    story: "/assets/original/story-stage1.wav",
    playerEntry: "/assets/original/battle-stage1-player-entry.wav",
    playerLoop: "/assets/original/battle-stage1-player-loop.wav",
    enemyEntry: "/assets/original/battle-stage1-enemy-entry.wav",
    enemyLoop: "/assets/original/battle-stage1-enemy-loop.wav",
  },
} as const;

export const STAGE1_MUSIC_PROGRAMS = {
  "stage-01-story-music": {
    id: "stage1-story",
    kind: "loop",
    track: `MAGIC/${STAGE1_MUSIC_RECORDS.story}`,
    source: STAGE1_ASSETS.audio.story,
    seamlessLoop: STAGE1_ASSETS.audio.story,
  },
  "stage-01-player-phase-music": {
    id: "stage1-player-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.player.entry}`,
    loopTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.player.loop}`,
    entry: STAGE1_ASSETS.audio.playerEntry,
    seamlessLoop: STAGE1_ASSETS.audio.playerLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
  "stage-01-enemy-phase-music": {
    id: "stage1-enemy-battle",
    kind: "intro-loop",
    entryTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.enemy.entry}`,
    loopTrack: `MUSIC/${STAGE1_MUSIC_RECORDS.enemy.loop}`,
    entry: STAGE1_ASSETS.audio.enemyEntry,
    seamlessLoop: STAGE1_ASSETS.audio.enemyLoop,
    crossfadeSeconds: 1024 / 44_100,
  },
} as const satisfies Partial<Record<StageMusicId, MusicProgram>>;

export function stage1StoryPagesForId(storyId: StageStoryId) {
  return storyId in STAGE1_STORY_PAGES
    ? STAGE1_STORY_PAGES[storyId as keyof typeof STAGE1_STORY_PAGES]
    : [];
}

/** Installs only the lightweight semantic registries after the stage-1 chunk loads. */
export function activateStage1Content(): void {
  registerActionContent(actionContent);
  registerStageSimulationEffects({
    "stage-01-enter-deployment": { type: "enter-deployment" },
    "stage-01-set-victory-999": { type: "victory-state", value: 999 },
    "stage-01-messenger-arrival": {
      type: "messenger-arrival",
      actor: {
        side: STAGE1_EVENT_PROGRAM.messenger.side,
        slot: STAGE1_EVENT_PROGRAM.messenger.slot,
      },
      from: STAGE1_EVENT_PROGRAM.messenger.from,
      targetPortrait: STAGE1_EVENT_PROGRAM.messenger.targetPortrait,
      movementBudget: STAGE1_EVENT_PROGRAM.messenger.movementBudget,
    },
    "stage-01-route-to-stage-02": {
      type: "campaign-route",
      destination: "stage-02",
    },
  });
  registerStageStoryPages(STAGE1_STORY_PAGES);
  registerStageMusicPrograms(STAGE1_MUSIC_PROGRAMS);
}

export {
  STAGE1_DEPLOYMENT_UI,
  STAGE1_EVENT_PROGRAM,
  STAGE1_MUSIC_RECORDS,
  STAGE1_SOURCES,
  STAGE1_STORY_PAGES,
  STAGE1_STORY_PRESENTATION,
};
