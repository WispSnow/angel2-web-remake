import {
  classIdFromNativeRecord,
  className,
  classStatsFor,
  isClassId,
} from "./content/classes";
import {
  STAGE0_ALLY_INITIAL_EXPERIENCE,
  createStage0Units,
  initialEnemyExperience,
  statsFor,
} from "./content/stage0";
import type {
  BattleUnit,
  Difficulty,
  PortraitRecord,
  Position,
  SaveData,
  SaveRosterEntry,
  SavedBattleState,
  Side,
  UnitClassId,
} from "./types";
import { emptyUnitStatuses, UNIT_STATUS_KEYS } from "./simulation/status";

export const SAVE_VERSION = 6 as const;
export const SAVE_CONTENT_VERSION = "native-actions-1" as const;
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
const MAX_STATUS = 0x7fff;
const STAGE_WIDTH = 50;
const STAGE_HEIGHT = 50;
const CAMERA_MAX_X = 40;
const CAMERA_MAX_Y = 43;
const STAGE0_ALLY_CLASSES = new Set<UnitClassId>([
  "soldier",
  "cavalry",
  "warrior",
  "archer",
  "sister",
]);
const STAGE0_ENEMY_CLASS_BY_ID = new Map(
  createStage0Units().filter((unit) => unit.side === 2).map((unit) => [unit.id, unit.classId]),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIntegerBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 0 || value === 1 || value === 2 || value === 3;

const isSide = (value: unknown): value is Side => value === 1 || value === 2;

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

function isUnitStatuses(value: unknown): value is BattleUnit["statuses"] {
  return isRecord(value)
    && UNIT_STATUS_KEYS.every((key) => isIntegerBetween(value[key], 0, MAX_STATUS));
}

function isBattleUnit(value: unknown): value is BattleUnit {
  if (
    !isRecord(value)
    || !isSide(value.side)
    || !isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    || !isClassId(value.classId)
    || typeof value.id !== "string"
    || value.id !== `${value.side}:${value.slot}`
    || typeof value.className !== "string"
    || value.className !== className(value.classId)
    || typeof value.name !== "string"
    || value.name.length === 0
    || !isPortrait(value.portrait)
    || !isIntegerBetween(value.life, 0, MAX_LIFE)
    || !isIntegerBetween(value.experience, 0, MAX_EXPERIENCE)
    || typeof value.acted !== "boolean"
    || !isUnitStatuses(value.statuses)
    || !isPosition(value)
  ) return false;

  if (value.side === 1) return STAGE0_ALLY_CLASSES.has(value.classId);
  return STAGE0_ENEMY_CLASS_BY_ID.get(value.id) === value.classId;
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function hasNamedAllyExperienceFloor(
  entry: Pick<SaveRosterEntry, "slot" | "classId" | "experience">,
): boolean {
  return entry.classId !== "soldier"
    || entry.experience >= (STAGE0_ALLY_INITIAL_EXPERIENCE[entry.slot] ?? 0);
}

function isSavedBattleState(
  value: unknown,
  roster: readonly SaveRosterEntry[],
  difficulty: Difficulty,
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
    || units.some((unit) =>
      (unit.side === 1 && !hasNamedAllyExperienceFloor(unit))
      || (unit.side === 2
        && (unit.life > statsFor(unit, difficulty).maxLife
          || unit.experience !== initialEnemyExperience(unit.classId, difficulty))))
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

function hasValidBase(value: Record<string, unknown>): boolean {
  if (
    value.format !== "ANGEL2-web-save"
    || value.version !== SAVE_VERSION
    || value.contentVersion !== SAVE_CONTENT_VERSION
    || value.ruleset !== "stableRemake"
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
    || !isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    || !isDifficulty(value.difficulty)
    || !isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    || !Array.isArray(value.roster)
    || value.roster.length === 0
    || value.roster.length > MAX_UNIT_SLOT + 1
    || !value.roster.every(isRosterEntry)
  ) return false;

  return hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor);
}

function isCompletedSave(value: Record<string, unknown>): boolean {
  return value.kind === "completed"
    && value.stageId === "stage-01"
    && value.stageLabel === "下一關"
    && value.battle === undefined;
}

function isBattleSave(value: Record<string, unknown>): boolean {
  const difficulty = isDifficulty(value.difficulty) ? value.difficulty : undefined;
  return value.kind === "battle"
    && value.stageId === "stage-00"
    && value.stageLabel === "瓦爾克麗宮"
    && difficulty !== undefined
    && isSavedBattleState(value.battle, value.roster as SaveRosterEntry[], difficulty);
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value) || !hasValidBase(value)) return false;
  return isCompletedSave(value) || isBattleSave(value);
}

interface Version5BattleUnit extends Omit<BattleUnit, "statuses"> {}

interface Version5SavedBattleState extends Omit<SavedBattleState, "units"> {
  units: Version5BattleUnit[];
}

interface Version5SaveBase {
  format: "ANGEL2-web-save";
  version: 5;
  contentVersion: "native-classes-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  roster: SaveRosterEntry[];
}

interface Version5BattleSave extends Version5SaveBase {
  kind: "battle";
  stageId: "stage-00";
  stageLabel: "瓦爾克麗宮";
  battle: Version5SavedBattleState;
}

interface Version5CompletedSave extends Version5SaveBase {
  kind: "completed";
  stageId: "stage-01";
  stageLabel: "下一關";
}

type Version5SaveData = Version5BattleSave | Version5CompletedSave;

function isVersion5BattleUnit(value: unknown): value is Version5BattleUnit {
  if (
    !isRecord(value)
    || !isSide(value.side)
    || !isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    || !isClassId(value.classId)
    || typeof value.id !== "string"
    || value.id !== `${value.side}:${value.slot}`
    || typeof value.className !== "string"
    || value.className !== className(value.classId)
    || typeof value.name !== "string"
    || value.name.length === 0
    || !isPortrait(value.portrait)
    || !isIntegerBetween(value.life, 0, MAX_LIFE)
    || !isIntegerBetween(value.experience, 0, MAX_EXPERIENCE)
    || typeof value.acted !== "boolean"
    || value.statuses !== undefined
    || !isPosition(value)
  ) return false;

  if (value.side === 1) return STAGE0_ALLY_CLASSES.has(value.classId);
  return STAGE0_ENEMY_CLASS_BY_ID.get(value.id) === value.classId;
}

function isVersion5SavedBattleState(
  value: unknown,
  roster: readonly SaveRosterEntry[],
  difficulty: Difficulty,
): value is Version5SavedBattleState {
  if (
    !isRecord(value)
    || value.phase !== "player"
    || !isIntegerBetween(value.round, 1, MAX_ROUND)
    || typeof value.focusId !== "string"
    || !Array.isArray(value.units)
    || value.units.length === 0
    || value.units.length > 150
    || !value.units.every(isVersion5BattleUnit)
    || !isPosition(value.cursor)
    || !isPosition(value.cameraOrigin, CAMERA_MAX_X, CAMERA_MAX_Y)
  ) return false;

  const units = value.units;
  if (
    !hasUniqueValues(units.map((unit) => unit.id))
    || !hasUniqueValues(units.map((unit) => `${unit.x},${unit.y}`))
    || !units.some((unit) => unit.id === value.focusId)
    || units.some((unit) =>
      (unit.side === 1 && !hasNamedAllyExperienceFloor(unit))
      || (unit.side === 2
        && (unit.life > statsFor(unit, difficulty).maxLife
          || unit.experience !== initialEnemyExperience(unit.classId, difficulty))))
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

function isVersion5SaveData(value: unknown): value is Version5SaveData {
  if (
    !isRecord(value)
    || value.format !== "ANGEL2-web-save"
    || value.version !== 5
    || value.contentVersion !== "native-classes-1"
    || value.ruleset !== "stableRemake"
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
    || !isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    || !isDifficulty(value.difficulty)
    || !isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    || !Array.isArray(value.roster)
    || value.roster.length === 0
    || value.roster.length > MAX_UNIT_SLOT + 1
    || !value.roster.every(isRosterEntry)
    || !hasUniqueValues(value.roster.map((entry) => entry.slot))
    || !value.roster.every(hasNamedAllyExperienceFloor)
  ) return false;

  if (value.kind === "completed") {
    return value.stageId === "stage-01"
      && value.stageLabel === "下一關"
      && value.battle === undefined;
  }
  return value.kind === "battle"
    && value.stageId === "stage-00"
    && value.stageLabel === "瓦爾克麗宮"
    && isVersion5SavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      value.difficulty,
    );
}

function migrateVersion5Save(save: Version5SaveData): SaveData {
  if (save.kind === "completed") {
    return {
      ...save,
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
    };
  }
  return {
    ...save,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({
        ...unit,
        statuses: emptyUnitStatuses(),
      })),
    },
  };
}

type LegacySaveVersion = 2 | 3 | 4;
type LegacyClassId = 0 | 22;

interface LegacyRosterEntry {
  slot: number;
  classId: LegacyClassId;
  experience: number;
  life: number;
}

interface LegacyBattleUnit extends Omit<BattleUnit, "classId" | "statuses"> {
  classId: LegacyClassId;
}

interface LegacySavedBattleState extends Omit<SavedBattleState, "units"> {
  units: LegacyBattleUnit[];
}

interface LegacySaveBase {
  format: "ANGEL2-web-save";
  version: LegacySaveVersion;
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  roster: LegacyRosterEntry[];
}

interface LegacyBattleSave extends LegacySaveBase {
  kind: "battle";
  stage: 0;
  stageLabel: "瓦爾克麗宮";
  battle: LegacySavedBattleState;
}

interface LegacyCompletedSave extends LegacySaveBase {
  kind: "completed";
  stage: 1;
  stageLabel: "下一關";
}

type LegacySaveData = LegacyBattleSave | LegacyCompletedSave;

const isLegacyClassId = (value: unknown): value is LegacyClassId =>
  value === 0 || value === 22;

function isLegacyRosterEntry(value: unknown): value is LegacyRosterEntry {
  return isRecord(value)
    && isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    && isLegacyClassId(value.classId)
    && isIntegerBetween(value.experience, 0, MAX_EXPERIENCE)
    && isIntegerBetween(value.life, 0, MAX_LIFE);
}

function isLegacyBattleUnit(value: unknown): value is LegacyBattleUnit {
  if (
    !isRecord(value)
    || !isSide(value.side)
    || !isIntegerBetween(value.slot, 0, MAX_UNIT_SLOT)
    || !isLegacyClassId(value.classId)
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

function isLegacyBattleState(value: unknown): value is LegacySavedBattleState {
  return isRecord(value)
    && value.phase === "player"
    && isIntegerBetween(value.round, 1, MAX_ROUND)
    && typeof value.focusId === "string"
    && Array.isArray(value.units)
    && value.units.length > 0
    && value.units.length <= 150
    && value.units.every(isLegacyBattleUnit)
    && hasUniqueValues(value.units.map((unit) => unit.id))
    && hasUniqueValues(value.units.map((unit) => `${unit.x},${unit.y}`))
    && value.units.some((unit) => unit.id === value.focusId)
    && isPosition(value.cursor)
    && isPosition(value.cameraOrigin, CAMERA_MAX_X, CAMERA_MAX_Y);
}

function isLegacySaveData(value: unknown): value is LegacySaveData {
  if (
    !isRecord(value)
    || value.format !== "ANGEL2-web-save"
    || (value.version !== 2 && value.version !== 3 && value.version !== 4)
    || value.ruleset !== "stableRemake"
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
    || !isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    || !isDifficulty(value.difficulty)
    || !isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    || !Array.isArray(value.roster)
    || value.roster.length === 0
    || value.roster.length > MAX_UNIT_SLOT + 1
    || !value.roster.every(isLegacyRosterEntry)
    || !hasUniqueValues(value.roster.map((entry) => entry.slot))
  ) return false;

  if (value.kind === "completed") {
    return value.stage === 1
      && value.stageLabel === "下一關"
      && value.battle === undefined;
  }
  return value.kind === "battle"
    && value.stage === 0
    && value.stageLabel === "瓦爾克麗宮"
    && isLegacyBattleState(value.battle);
}

function semanticClassId(classId: LegacyClassId): UnitClassId {
  const semantic = classIdFromNativeRecord(classId);
  if (!semantic) throw new Error(`missing semantic class for native record ${classId}`);
  return semantic;
}

function migrateLegacyAllyValues(
  state: Pick<LegacyRosterEntry, "slot" | "classId" | "experience" | "life">,
): Pick<LegacyRosterEntry, "experience" | "life"> {
  const experienceFloor = STAGE0_ALLY_INITIAL_EXPERIENCE[state.slot] ?? 0;
  if (experienceFloor === 0) {
    return { experience: state.experience, life: state.life };
  }
  const classId = semanticClassId(state.classId);
  const oldMaximumLife = classStatsFor({ classId, experience: state.experience }).maxLife;
  const experience = state.experience + experienceFloor;
  const maximumLife = classStatsFor({ classId, experience }).maxLife;
  const missingLife = Math.max(0, oldMaximumLife - state.life);
  return {
    experience,
    life: Math.max(0, maximumLife - missingLife),
  };
}

function migrateLegacySave(save: LegacySaveData): SaveData {
  const migrateRosterEntry = (entry: LegacyRosterEntry): SaveRosterEntry => {
    const values = save.version < 4 ? migrateLegacyAllyValues(entry) : entry;
    return {
      slot: entry.slot,
      classId: semanticClassId(entry.classId),
      experience: values.experience,
      life: values.life,
    };
  };
  const roster = save.roster.map(migrateRosterEntry);
  const base = {
    format: "ANGEL2-web-save" as const,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    ruleset: "stableRemake" as const,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster,
  };

  if (save.kind === "completed") {
    return {
      ...base,
      kind: "completed",
      stageId: "stage-01",
      stageLabel: "下一關",
    };
  }

  const units = save.battle.units.map((legacyUnit): BattleUnit => {
    const classId = semanticClassId(legacyUnit.classId);
    let experience = legacyUnit.experience;
    let life = legacyUnit.life;
    if (save.version < 4 && legacyUnit.side === 1) {
      ({ experience, life } = migrateLegacyAllyValues(legacyUnit));
    } else if (save.version === 2 && legacyUnit.side === 2) {
      const oldMaximumLife = classStatsFor({ classId, experience }).maxLife;
      experience = initialEnemyExperience(classId, save.difficulty);
      const maximumLife = statsFor(
        { classId, experience, side: legacyUnit.side },
        save.difficulty,
      ).maxLife;
      const missingLife = Math.max(0, oldMaximumLife - life);
      life = Math.max(0, maximumLife - missingLife);
    }
    return {
      ...legacyUnit,
      classId,
      className: className(classId),
      experience,
      life,
      statuses: emptyUnitStatuses(),
    };
  });

  return {
    ...base,
    kind: "battle",
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
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
    if (isVersion5SaveData(value)) {
      const migrated = migrateVersion5Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
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
