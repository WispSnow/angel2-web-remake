import {
  classStatsFor,
  initialEnemyExperience,
  statsFor,
} from "./content/stage0";
import type {
  BattleSaveData,
  BattleUnit,
  CompletedSaveData,
  Difficulty,
  PortraitRecord,
  Position,
  SaveData,
  SaveRosterEntry,
  SavedBattleState,
  Side,
  UnitClassId,
} from "./types";

export const SAVE_VERSION = 3 as const;
export const SAVE_SLOT_COUNT = 20;
export const SAVE_SLOTS_PER_PAGE = 5;
export const SAVE_SLOT_PAGE_COUNT = SAVE_SLOT_COUNT / SAVE_SLOTS_PER_PAGE;

const wrap = (value: number, length: number): number =>
  ((value % length) + length) % length;

export function saveSlotPageIndex(slotIndex: number): number {
  return Math.floor(wrap(slotIndex, SAVE_SLOT_COUNT) / SAVE_SLOTS_PER_PAGE);
}

export function saveSlotPageStart(slotIndex: number): number {
  return saveSlotPageIndex(slotIndex) * SAVE_SLOTS_PER_PAGE;
}

export function moveSaveSlotIndex(slotIndex: number, delta: number): number {
  return wrap(slotIndex + delta, SAVE_SLOT_COUNT);
}

export function moveSaveSlotPage(slotIndex: number, delta: number): number {
  const row = wrap(slotIndex, SAVE_SLOT_COUNT) % SAVE_SLOTS_PER_PAGE;
  const page = wrap(saveSlotPageIndex(slotIndex) + delta, SAVE_SLOT_PAGE_COUNT);
  return page * SAVE_SLOTS_PER_PAGE + row;
}

export function saveSlotKey(slot: number): string {
  return `angel2.save.${slot}`;
}

export type SaveSlotReadResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "valid"; save: SaveData };

const MAX_UNIT_SLOT = 74;
const MAX_ROUND = 9_999;
const MAX_EXPERIENCE = 0x7fff_ffff;
const MAX_LIFE = 0x7fff_ffff;
const STAGE_WIDTH = 50;
const STAGE_HEIGHT = 50;
const CAMERA_MAX_X = 40;
const CAMERA_MAX_Y = 43;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIntegerBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 0 || value === 1 || value === 2 || value === 3;

const isSide = (value: unknown): value is Side => value === 1 || value === 2;

const isClassId = (value: unknown): value is UnitClassId => value === 0 || value === 22;

const isPortrait = (value: unknown): value is PortraitRecord =>
  value === 15 || value === 45 || value === 46 || value === 47 || value === 48;

function isPosition(
  value: unknown,
  maximumX = STAGE_WIDTH - 1,
  maximumY = STAGE_HEIGHT - 1,
): value is Position {
  return isRecord(value)
    && isIntegerBetween(value.x, 0, maximumX)
    && isIntegerBetween(value.y, 0, maximumY);
}

function isRosterEntry(value: unknown): value is SaveRosterEntry {
  return isRecord(value)
    && isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    && isClassId(value.classId)
    && isIntegerBetween(value.experience, 0, MAX_EXPERIENCE)
    && isIntegerBetween(value.life, 0, MAX_LIFE);
}

function isBattleUnit(value: unknown): value is BattleUnit {
  if (
    !isRecord(value)
    || !isSide(value.side)
    || !isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    || !isClassId(value.classId)
    || typeof value.id !== "string"
    || value.id !== `${value.side}:${value.slot}`
    || typeof value.name !== "string"
    || value.name.length === 0
    || !isPortrait(value.portrait)
    || !isIntegerBetween(value.life, 0, MAX_LIFE)
    || !isIntegerBetween(value.experience, 0, MAX_EXPERIENCE)
    || typeof value.acted !== "boolean"
    || !isPosition(value)
  ) return false;

  return value.classId === 22 ? value.className === "騎兵" : value.className === "士兵";
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isSavedBattleState(
  value: unknown,
  roster: readonly SaveRosterEntry[],
  difficulty?: Difficulty,
): value is SavedBattleState {
  if (
    !isRecord(value)
    || value.phase !== "player"
    || !isIntegerBetween(value.round, 1, MAX_ROUND)
    || typeof value.focusId !== "string"
    || !Array.isArray(value.units)
    || value.units.length === 0
    || value.units.length > 150
    || !value.units.every(isBattleUnit)
    || !isPosition(value.cursor)
    || !isPosition(value.cameraOrigin, CAMERA_MAX_X, CAMERA_MAX_Y)
  ) return false;

  const units = value.units;
  if (
    !hasUniqueValues(units.map((unit) => unit.id))
    || !hasUniqueValues(units.map((unit) => `${unit.x},${unit.y}`))
    || !units.some((unit) => unit.id === value.focusId)
  ) return false;
  if (
    difficulty !== undefined
    && units.some((unit) => unit.life > statsFor(unit, difficulty).maxLife
      || (unit.side === 2
        && unit.experience !== initialEnemyExperience(unit.classId, difficulty)))
  ) return false;

  const allies = units.filter((unit) => unit.side === 1);
  if (allies.length !== roster.length) return false;
  const allyBySlot = new Map(allies.map((unit) => [unit.slot, unit]));
  return roster.every((entry) => {
    const unit = allyBySlot.get(entry.slot);
    return unit !== undefined
      && unit.classId === entry.classId
      && unit.experience === entry.experience
      && unit.life === entry.life;
  });
}

function hasValidBase(value: Record<string, unknown>, version: 2 | typeof SAVE_VERSION): boolean {
  if (
    value.format !== "ANGEL2-web-save"
    || value.version !== version
    || value.ruleset !== "stableRemake"
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
    || !isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    || !isDifficulty(value.difficulty)
    || !isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    || !Array.isArray(value.roster)
    || value.roster.length > MAX_UNIT_SLOT + 1
    || !value.roster.every(isRosterEntry)
  ) return false;

  return hasUniqueValues(value.roster.map((entry) => entry.slot));
}

function isCompletedSave(value: Record<string, unknown>): boolean {
  return value.kind === "completed"
    && value.stage === 1
    && value.stageLabel === "下一關"
    && value.battle === undefined;
}

function isBattleSave(value: Record<string, unknown>, enforceDifficultyStats: boolean): boolean {
  const difficulty = isDifficulty(value.difficulty) ? value.difficulty : undefined;
  return value.kind === "battle"
    && value.stage === 0
    && value.stageLabel === "瓦爾克麗宮"
    && difficulty !== undefined
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      enforceDifficultyStats ? difficulty : undefined,
    );
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value) || !hasValidBase(value, SAVE_VERSION)) return false;
  return isCompletedSave(value) || isBattleSave(value, true);
}

type LegacyBattleSaveData = Omit<BattleSaveData, "version"> & { version: 2 };
type LegacyCompletedSaveData = Omit<CompletedSaveData, "version"> & { version: 2 };
type LegacySaveData = LegacyBattleSaveData | LegacyCompletedSaveData;

function isLegacySaveData(value: unknown): value is LegacySaveData {
  if (!isRecord(value) || !hasValidBase(value, 2)) return false;
  return isCompletedSave(value) || isBattleSave(value, false);
}

function migrateLegacySave(save: LegacySaveData): SaveData {
  if (save.kind === "completed") {
    return {
      ...save,
      version: SAVE_VERSION,
    };
  }

  const units = save.battle.units.map((unit) => {
    if (unit.side === 1) return { ...unit };
    const oldMaximumLife = classStatsFor(unit).maxLife;
    const experience = initialEnemyExperience(unit.classId, save.difficulty);
    const migrated = { ...unit, experience };
    const maximumLife = statsFor(migrated, save.difficulty).maxLife;
    const missingLife = Math.max(0, oldMaximumLife - unit.life);
    return {
      ...migrated,
      life: Math.max(0, maximumLife - missingLife),
    };
  });

  return {
    ...save,
    version: SAVE_VERSION,
    battle: {
      ...save.battle,
      units,
    },
  };
}

export function parseSaveData(raw: string): SaveData | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (isSaveData(value)) return value;
    if (!isLegacySaveData(value)) return undefined;
    const migrated = migrateLegacySave(value);
    return isSaveData(migrated) ? migrated : undefined;
  } catch {
    return undefined;
  }
}

export function readSaveSlot(
  storage: Pick<Storage, "getItem">,
  slot: number,
): SaveSlotReadResult {
  const raw = storage.getItem(saveSlotKey(slot));
  if (raw === null) return { kind: "empty" };
  const save = parseSaveData(raw);
  return save ? { kind: "valid", save } : { kind: "invalid" };
}
