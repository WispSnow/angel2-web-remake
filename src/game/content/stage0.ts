import { STAGE0_SPEECH_RECORD_BY_CHARACTER, STAGE0_TERRAIN_TOKENS_BASE64, STAGE0_TOKEN_TO_SLOT_BASE64 } from "./stage0-runtime.generated";
import type { BattleUnit, Difficulty, Position, UnitClassId, UnitStats } from "../types";

const decode = (encoded: string): Uint8Array => {
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const STAGE0 = {
  id: 0,
  name: "瓦爾克麗宮",
  width: 50,
  height: 50,
  viewport: { width: 10, height: 7, initialOrigin: { x: 25, y: 23 } },
  opening: { from: { x: 10, y: 23 }, to: { x: 29, y: 26 }, budget: 50 },
  enemyRouteTarget: { x: 25, y: 47 },
  enemyRouteMovement: 5,
  enemyExitCells: [{ x: 24, y: 47 }, { x: 25, y: 47 }, { x: 26, y: 47 }],
  objective: "清除瓦爾克麗宮內的敵人；擊倒或撤離均計入。",
  defeat: "妮雅戰敗。",
} as const;

// Module 29 schedules AI by the native 39-entry class-code priority table.
// Only the two classes present in stage 0 are part of this vertical slice:
// 1A/騎兵 is priority 16 and 0A/士兵 is priority 36.
export const STAGE0_AI_CLASS_PRIORITY: Record<UnitClassId, number> = {
  0: 36,
  22: 16,
};

export function isStage0Exit(position: Position): boolean {
  return STAGE0.enemyExitCells.some(({ x, y }) => position.x === x && position.y === y);
}

export const TERRAIN_TOKENS = decode(STAGE0_TERRAIN_TOKENS_BASE64);
export const TOKEN_TO_TERRAIN_SLOT = decode(STAGE0_TOKEN_TO_SLOT_BASE64);
export const SPEECH_RECORD_BY_CHARACTER = STAGE0_SPEECH_RECORD_BY_CHARACTER;

export const CLASS_ROWS: Record<UnitClassId, UnitStats[]> = {
  0: [
    { attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 },
    { attack: 42, defense: 24, maxLife: 170, movement: 4, level: 2 },
    { attack: 45, defense: 27, maxLife: 180, movement: 4, level: 3 },
  ],
  22: [
    { attack: 55, defense: 30, maxLife: 200, movement: 8, level: 1 },
    { attack: 60, defense: 33, maxLife: 230, movement: 8, level: 2 },
    { attack: 65, defense: 36, maxLife: 260, movement: 8, level: 3 },
  ],
};

export const CLASS_THRESHOLDS: Record<UnitClassId, number[]> = {
  0: [0, 100, 200],
  22: [0, 180, 360],
};

const POST_THIRD_ROW_GROWTH: Record<UnitClassId, {
  threshold: number;
  attack: number;
  defense: number;
  maxLife: number;
}> = {
  0: { threshold: 100, attack: 1, defense: 0, maxLife: 10 },
  22: { threshold: 100, attack: 1, defense: 0, maxLife: 10 },
};

export const MOVEMENT_RULES: Record<UnitClassId, number[]> = {
  0: [99, 2, 1, 3, 4, 5, 2, 99, 3, 4, 1, 4, 99, 1, 2, 3, 1, 99, 1, 2, 2, 1, 1],
  22: [99, 1, 1, 3, 3, 5, 2, 99, 3, 4, 1, 99, 99, 1, 2, 3, 1, 99, 2, 2, 1, 1, 1],
};

export const TERRAIN_DEFENSE_PERCENT = [99, 10, 5, 20, 30, 40, 10, 15, 10, 10, 5, 40, 15, 15, 10, 20, 5, 15, 10, 15, 10, 10, 1];

const UNIT_DEFINITIONS: Array<Pick<BattleUnit, "side" | "slot" | "classId" | "className" | "name" | "portrait" | "x" | "y">> = [
  { side: 1, slot: 0, classId: 0, className: "士兵", name: "妮雅", portrait: 46, x: 10, y: 23 },
  { side: 1, slot: 43, classId: 0, className: "士兵", name: "士兵", portrait: 47, x: 27, y: 25 },
  { side: 1, slot: 42, classId: 0, className: "士兵", name: "士兵", portrait: 47, x: 21, y: 27 },
  { side: 1, slot: 1, classId: 0, className: "士兵", name: "希蜜", portrait: 45, x: 28, y: 29 },
  { side: 1, slot: 40, classId: 0, className: "士兵", name: "士兵", portrait: 47, x: 27, y: 32 },
  { side: 1, slot: 41, classId: 0, className: "士兵", name: "士兵", portrait: 47, x: 22, y: 37 },
  { side: 2, slot: 48, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 25, y: 25 },
  { side: 2, slot: 46, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 23, y: 26 },
  { side: 2, slot: 47, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 25, y: 26 },
  { side: 2, slot: 45, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 27, y: 26 },
  { side: 2, slot: 44, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 25, y: 29 },
  { side: 2, slot: 15, classId: 22, className: "騎兵", name: "哈釘", portrait: 15, x: 23, y: 32 },
  { side: 2, slot: 43, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 28, y: 33 },
  { side: 2, slot: 40, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 25, y: 35 },
  { side: 2, slot: 41, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 22, y: 39 },
  { side: 2, slot: 42, classId: 0, className: "士兵", name: "騎士團士兵", portrait: 48, x: 27, y: 39 },
];

export function classStatsFor(unit: Pick<BattleUnit, "classId" | "experience">): UnitStats {
  const thresholds = CLASS_THRESHOLDS[unit.classId];
  const index = thresholds.reduce((selected, threshold, row) => unit.experience >= threshold ? row : selected, 0);
  const row = CLASS_ROWS[unit.classId][index];
  if (index < CLASS_ROWS[unit.classId].length - 1) return row;

  const growth = POST_THIRD_ROW_GROWTH[unit.classId];
  const thirdThreshold = thresholds[2];
  const postThirdRows = Math.floor(
    Math.max(0, unit.experience - thirdThreshold) / growth.threshold,
  );
  return {
    attack: row.attack + postThirdRows * growth.attack,
    defense: row.defense + postThirdRows * growth.defense,
    maxLife: row.maxLife + postThirdRows * growth.maxLife,
    movement: row.movement,
    level: row.level + postThirdRows,
  };
}

export function statsFor(
  unit: Pick<BattleUnit, "classId" | "experience" | "side">,
  difficulty: Difficulty,
): UnitStats {
  const base = classStatsFor(unit);
  if (unit.side !== 2 || difficulty !== 3) return base;
  return {
    ...base,
    attack: base.attack + Math.floor(base.attack / 2),
    defense: base.defense + Math.floor(base.defense / 2),
    maxLife: base.maxLife + Math.floor(base.maxLife / 2),
  };
}

export function nextExperienceThresholdFor(unit: Pick<BattleUnit, "classId" | "experience">): number {
  const thresholds = CLASS_THRESHOLDS[unit.classId];
  const fixedThreshold = thresholds.find((threshold) => threshold > unit.experience);
  if (fixedThreshold !== undefined) return fixedThreshold;
  const thirdThreshold = thresholds[2];
  const growthThreshold = POST_THIRD_ROW_GROWTH[unit.classId].threshold;
  return thirdThreshold
    + (Math.floor((unit.experience - thirdThreshold) / growthThreshold) + 1) * growthThreshold;
}

export function initialEnemyExperience(classId: UnitClassId, difficulty: Difficulty): number {
  let experience = 0;
  for (let step = 0; step <= difficulty; step += 1) {
    experience = nextExperienceThresholdFor({ classId, experience }) + 1;
  }
  return experience;
}

export function createStage0Units(difficulty: Difficulty = 0): BattleUnit[] {
  return UNIT_DEFINITIONS.map((definition) => {
    const experience = definition.side === 2
      ? initialEnemyExperience(definition.classId, difficulty)
      : 0;
    const unit: BattleUnit = {
      ...definition,
      id: `${definition.side}:${definition.slot}`,
      life: 0,
      experience,
      acted: false,
    };
    unit.life = statsFor(unit, difficulty).maxLife;
    return unit;
  });
}

export function terrainSlotAt(position: Position): number {
  if (position.x < 0 || position.y < 0 || position.x >= STAGE0.width || position.y >= STAGE0.height) return 0;
  const token = TERRAIN_TOKENS[position.y * STAGE0.width + position.x];
  return TOKEN_TO_TERRAIN_SLOT[token] ?? 0;
}

export const ASSETS = {
  map: "/assets/original/stage0-map.png",
  minimap: "/assets/original/stage0-minimap.png",
  tacticalPanel: {
    foundation: "/assets/original/tactical-panel.png",
    states: {
      battleAnimation: {
        off: "/assets/original/tactical-panel-battle-animation-off.png",
        on: "/assets/original/tactical-panel-battle-animation-on.png",
      },
      grid: {
        off: "/assets/original/tactical-panel-grid-off.png",
        on: "/assets/original/tactical-panel-grid-on.png",
      },
      edgeScroll: {
        off: "/assets/original/tactical-panel-edge-scroll-off.png",
        on: "/assets/original/tactical-panel-edge-scroll-on.png",
      },
      portraits: {
        off: "/assets/original/tactical-panel-portraits-off.png",
        on: "/assets/original/tactical-panel-portraits-on.png",
      },
    },
  },
  battleChrome: {
    top: "/assets/original/battle-chrome-top.png",
    cornerLeft: "/assets/original/battle-chrome-corner-left.png",
    cornerRight: "/assets/original/battle-chrome-corner-right.png",
    glass: "/assets/original/battle-chrome-glass.png",
    sideLeft: "/assets/original/battle-chrome-side-left.png",
    sideRight: "/assets/original/battle-chrome-side-right.png",
    statueForegroundLeft: "/assets/original/battle-statue-left-foreground.png",
    statueForegroundRight: "/assets/original/battle-statue-right-foreground.png",
    bottomLeft: "/assets/original/battle-chrome-bottom-left.png",
    bottomRight: "/assets/original/battle-chrome-bottom-right.png",
  },
  storyBackground: "/assets/original/story-palace.png",
  allySoldier: "/assets/original/unit-ally-soldier.png",
  enemySoldier: "/assets/original/unit-enemy-soldier.png",
  enemyCavalry: "/assets/original/unit-enemy-cavalry.png",
  portraits: {
    15: "/assets/original/portrait-hading.png",
    45: "/assets/original/portrait-ximi.png",
    46: "/assets/original/portrait-nia.png",
    47: "/assets/original/portrait-ally-soldier.png",
    48: "/assets/original/portrait-enemy-soldier.png",
  },
  portraitAnimations: {
    15: {
      eyeOrigin: { x: 40, y: 16 },
      eyeSize: { width: 32, height: 24 },
      eyes: ["open", "half", "closed"].map((frame) => `/assets/original/portrait-animation/portrait-15-eye-${frame}.png`),
      mouthOrigin: { x: 40, y: 32 },
      mouthSize: { width: 16, height: 16 },
      mouths: ["closed", "half", "open"].map((frame) => `/assets/original/portrait-animation/portrait-15-mouth-${frame}.png`),
    },
    45: {
      eyeOrigin: { x: 32, y: 24 },
      eyeSize: { width: 40, height: 16 },
      eyes: ["open", "half", "closed"].map((frame) => `/assets/original/portrait-animation/portrait-45-eye-${frame}.png`),
      mouthOrigin: { x: 40, y: 40 },
      mouthSize: { width: 24, height: 16 },
      mouths: ["closed", "half", "open"].map((frame) => `/assets/original/portrait-animation/portrait-45-mouth-${frame}.png`),
    },
    46: {
      eyeOrigin: { x: 40, y: 24 },
      eyeSize: { width: 40, height: 16 },
      eyes: ["open", "half", "closed"].map((frame) => `/assets/original/portrait-animation/portrait-46-eye-${frame}.png`),
      mouthOrigin: { x: 56, y: 40 },
      mouthSize: { width: 24, height: 16 },
      mouths: ["closed", "half", "open"].map((frame) => `/assets/original/portrait-animation/portrait-46-mouth-${frame}.png`),
    },
    47: {
      eyeOrigin: { x: 64, y: 24 },
      eyeSize: { width: 24, height: 16 },
      eyes: ["open", "half", "closed"].map((frame) => `/assets/original/portrait-animation/portrait-47-eye-${frame}.png`),
      mouthOrigin: { x: 72, y: 48 },
      mouthSize: { width: 16, height: 8 },
      mouths: ["closed", "half", "open"].map((frame) => `/assets/original/portrait-animation/portrait-47-mouth-${frame}.png`),
    },
    48: {
      eyeOrigin: { x: 24, y: 24 },
      eyeSize: { width: 24, height: 16 },
      eyes: ["open", "half", "closed"].map((frame) => `/assets/original/portrait-animation/portrait-48-eye-${frame}.png`),
      mouthOrigin: { x: 32, y: 48 },
      mouthSize: { width: 16, height: 8 },
      mouths: ["closed", "half", "open"].map((frame) => `/assets/original/portrait-animation/portrait-48-mouth-${frame}.png`),
    },
  },
  mapCombat: {
    hit: Array.from({ length: 8 }, (_, frame) => `/assets/original/map-combat/hit/${String(frame).padStart(2, "0")}.png`),
    death: Array.from({ length: 38 }, (_, frame) => `/assets/original/map-combat/death/${String(frame).padStart(2, "0")}.png`),
  },
  fullBattle: {
    stageBackground: "/assets/original/full-combat/stage0-background.png",
    left: {
      soldierDirect: [0, 1, 2, 3].map((frame) => `/assets/original/full-combat/left-soldier-direct/${String(frame).padStart(2, "0")}.png`),
      soldierPlus50: [0, 1, 2, 3, 4, 5].map((frame) => `/assets/original/full-combat/left-soldier-plus50/${String(frame).padStart(2, "0")}.png`),
      cavalryDirect: [0, 1, 2, 3].map((frame) => `/assets/original/full-combat/left-cavalry-direct/${String(frame).padStart(2, "0")}.png`),
      cavalryPlus50: Array.from({ length: 9 }, (_, frame) => `/assets/original/full-combat/left-cavalry-plus50/${String(frame).padStart(2, "0")}.png`),
    },
    right: {
      soldierDirect: [0, 1, 2, 3].map((frame) => `/assets/original/full-combat/right-soldier-direct/${String(frame).padStart(2, "0")}.png`),
      soldierPlus50: [0, 1, 2, 3, 4, 5].map((frame) => `/assets/original/full-combat/right-soldier-plus50/${String(frame).padStart(2, "0")}.png`),
      cavalryDirect: [0, 1, 2, 3].map((frame) => `/assets/original/full-combat/right-cavalry-direct/${String(frame).padStart(2, "0")}.png`),
      cavalryPlus50: Array.from({ length: 9 }, (_, frame) => `/assets/original/full-combat/right-cavalry-plus50/${String(frame).padStart(2, "0")}.png`),
    },
  },
  audio: {
    story: "/assets/original/story-stage0.wav",
    playerBattleEntry: "/assets/original/battle-stage0-player-entry.wav",
    playerBattleLoop: "/assets/original/battle-stage0-player-loop.wav",
    enemyBattleEntry: "/assets/original/battle-stage0-enemy-entry.wav",
    enemyBattleLoop: "/assets/original/battle-stage0-enemy-loop.wav",
    confirm: "/assets/original/ui-confirm.wav",
    effects: {
      0: "/assets/original/audio/e/00.wav",
      2: "/assets/original/audio/e/02.wav",
      11: "/assets/original/audio/e/11.wav",
      14: "/assets/original/audio/e/14.wav",
      38: "/assets/original/audio/e/38.wav",
      51: "/assets/original/audio/e/51.wav",
    },
    speech: Array.from({ length: 15 }, (_, index) => `/assets/original/speech-${String(index + 57).padStart(2, "0")}.wav`),
  },
} as const;
