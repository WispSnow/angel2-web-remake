import {
  classIdFromNativeRecord,
  className,
  classStatsFor,
  isClassId,
} from "./content/classes";
import {
  STAGE0_ALLY_INITIAL_EXPERIENCE,
  completeCampaignRoster,
  createStage0Units,
  initialEnemyExperience,
  statsFor,
} from "./content/stage0";
import { STAGE0_DEFINITION } from "./content/stages";
import { isPortraitRecord } from "./content/portrait-catalog.generated";
import { consumedEventIdsForBattleResume } from "./simulation/stage-events";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  PortraitRecord,
  Position,
  SaveData,
  SaveRosterEntry,
  SavedBattleState,
  SavedEnemyAiState,
  Side,
  StageId,
  UnitClassId,
} from "./types";
import { emptyUnitStatuses, UNIT_STATUS_KEYS } from "./simulation/status";

export const SAVE_VERSION = 14 as const;
export const SAVE_CONTENT_VERSION = "stage-03-recovery-1" as const;
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
// Save validation deliberately keeps this compact schema identity separate from the
// heavy stage-1 content chunk. Changes to the generated deployment or enemy slots
// require an explicit save-version decision instead of silently changing v8 meaning.
const STAGE1_SAVE_DEPLOYMENT = {
  eligibleSlots: [0, 1, 2, 4, 24, 40, 41, 42, 43],
  fixedSlots: [42, 40, 43, 41, 0],
  optionalSlots: [1, 2, 4, 24],
  maximumUnits: 8,
  openCellCount: 3,
} as const;
const STAGE1_SAVE_EVENT_IDS = [
  "stage-01-prebattle-story",
  "stage-01-enter-deployment",
  "stage-01-opening-story",
  "stage-01-boss-defeated",
  "stage-01-messenger-arrival",
  "stage-01-completed-route",
] as const;
const STAGE1_ENEMY_CLASS_BY_ID = new Map<string, UnitClassId>([
  ["2:40", "soldier"],
  ["2:41", "soldier"],
  ["2:43", "sister"],
  ["2:16", "cavalry"],
  ["2:42", "sister"],
  ["2:45", "soldier"],
  ["2:46", "soldier"],
]);
const STAGE2_SAVE_ALLIED_SLOTS = [0, 2, 24, 40, 41, 42, 43, 44, 45] as const;
const STAGE2_SAVE_EVENT_IDS = [
  "stage-02-opening-story",
  "stage-02-boss-defeated",
  "stage-02-victory-story",
  "stage-02-completed-route",
] as const;
const STAGE2_ENEMY_CLASS_BY_ID = new Map<string, UnitClassId>([
  ["2:47", "cavalry"],
  ["2:18", "cavalry"],
  ["2:46", "cavalry"],
  ["2:51", "soldier"],
  ["2:50", "soldier"],
]);
const STAGE3_SAVE_ALLIED_SLOTS = [1, 3, 4, 20, 21, 45, 46, 47, 50, 51, 52, 53, 54] as const;
const STAGE3_SAVE_EVENT_IDS = [
  "stage-03-opening-story",
  "stage-03-boss-defeated",
  "stage-03-victory-story",
  "stage-03-completed-route",
] as const;
const STAGE3_ENEMY_CLASS_BY_ID = new Map<string, UnitClassId>([
  ["2:42", "soldier"],
  ["2:41", "soldier"],
  ["2:40", "soldier"],
  ["2:43", "sister"],
  ["2:17", "monk"],
  ["2:44", "soldier"],
  ["2:45", "soldier"],
  ["2:47", "soldier"],
  ["2:46", "soldier"],
  ["2:50", "cavalry"],
  ["2:48", "soldier"],
  ["2:49", "soldier"],
]);
const STAGE1_CASTLE_GUARD_GROUP_ID = "castle-guard";
const STAGE1_CASTLE_GUARD_INITIAL_POSITIONS = new Map<string, Position>([
  ["2:40", { x: 22, y: 14 }],
  ["2:41", { x: 28, y: 14 }],
  ["2:42", { x: 27, y: 16 }],
  ["2:43", { x: 23, y: 16 }],
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIntegerBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 0 || value === 1 || value === 2 || value === 3;

const isSide = (value: unknown): value is Side => value === 1 || value === 2;

const isPortrait = (value: unknown): value is PortraitRecord =>
  isPortraitRecord(value);

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

function isStageEntrySnapshot(
  value: unknown,
  stageId: StageId,
  difficulty: Difficulty,
): value is CampaignState {
  if (
    !isRecord(value)
    || value.stageId !== stageId
    || value.ruleset !== "stableRemake"
    || value.difficulty !== difficulty
    || !isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    || !isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.roster)
    || value.roster.length !== MAX_UNIT_SLOT + 1
    || !value.roster.every(isRosterEntry)
  ) return false;
  return hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor);
}

function isUnitStatuses(value: unknown): value is BattleUnit["statuses"] {
  return isRecord(value)
    && UNIT_STATUS_KEYS.every((key) => isIntegerBetween(value[key], 0, MAX_STATUS));
}

function isBattleUnit(
  value: unknown,
  stageId: "stage-00" | "stage-01" | "stage-02" | "stage-03",
  requireActionDisabled = true,
): value is BattleUnit {
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
    || (requireActionDisabled
      ? typeof value.actionDisabled !== "boolean"
      : value.actionDisabled !== undefined)
    || !isUnitStatuses(value.statuses)
    || !isPosition(value)
  ) return false;

  if (value.side === 1) return stageId !== "stage-00" || STAGE0_ALLY_CLASSES.has(value.classId);
  const enemyClasses = stageId === "stage-01"
    ? STAGE1_ENEMY_CLASS_BY_ID
    : stageId === "stage-02"
      ? STAGE2_ENEMY_CLASS_BY_ID
      : stageId === "stage-03"
        ? STAGE3_ENEMY_CLASS_BY_ID
      : STAGE0_ENEMY_CLASS_BY_ID;
  return enemyClasses.get(value.id) === value.classId;
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function hasExactlyTheseValues(values: readonly string[], expected: readonly string[]): boolean {
  if (values.length !== expected.length) return false;
  const actual = new Set(values);
  return expected.every((value) => actual.has(value));
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
  stageId: "stage-00" | "stage-01" | "stage-02" | "stage-03",
  requireStage1Ai = true,
  requireActionDisabled = true,
): value is SavedBattleState {
  if (
    !isRecord(value)
    || value.phase !== "player"
    || !isIntegerBetween(value.round, 1, MAX_ROUND)
    || typeof value.focusId !== "string"
    || !Array.isArray(value.units)
    || value.units.length === 0
    || value.units.length > 150
    || !value.units.every((unit) => isBattleUnit(unit, stageId, requireActionDisabled))
    || !isPosition(value.cursor)
    || !isPosition(value.cameraOrigin, CAMERA_MAX_X, CAMERA_MAX_Y)
  ) return false;

  if (stageId === "stage-01") {
    if (requireStage1Ai) {
      if (!isSavedEnemyAiState(value.enemyAi, value.round)) return false;
    } else if (value.enemyAi !== undefined) return false;
  } else if (value.enemyAi !== undefined) return false;

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
  if (stageId === "stage-01") {
    const eligibleSlots = new Set<number>(STAGE1_SAVE_DEPLOYMENT.eligibleSlots);
    const fixedSlots = new Set<number>(STAGE1_SAVE_DEPLOYMENT.fixedSlots);
    const optionalSlots = new Set<number>(STAGE1_SAVE_DEPLOYMENT.optionalSlots);
    const alliedSlots = new Set(allies.map(({ slot }) => slot));
    if (allies.length < fixedSlots.size
      || allies.length > STAGE1_SAVE_DEPLOYMENT.maximumUnits
      || allies.some(({ slot }) => !eligibleSlots.has(slot))
      || [...fixedSlots].some((slot) => !alliedSlots.has(slot))
      || allies.filter(({ slot }) => optionalSlots.has(slot)).length
        > STAGE1_SAVE_DEPLOYMENT.openCellCount
      || allies.some(({ slot, classId }) => slot === 24 && classId !== "magician")) {
      return false;
    }
  } else if (stageId === "stage-02") {
    const alliedSlots = allies.map(({ slot }) => slot).sort((left, right) => left - right);
    if (alliedSlots.length !== STAGE2_SAVE_ALLIED_SLOTS.length
      || !alliedSlots.every((slot, index) => slot === STAGE2_SAVE_ALLIED_SLOTS[index])) {
      return false;
    }
  } else if (stageId === "stage-03") {
    const alliedSlots = allies.map(({ slot }) => slot).sort((left, right) => left - right);
    if (alliedSlots.length !== STAGE3_SAVE_ALLIED_SLOTS.length
      || !alliedSlots.every((slot, index) => slot === STAGE3_SAVE_ALLIED_SLOTS[index])) {
      return false;
    }
  }
  const rosterBySlot = new Map(roster.map((entry) => [entry.slot, entry]));
  return allies.every((unit) => {
    const entry = rosterBySlot.get(unit.slot);
    return entry !== undefined
      && unit.classId === entry.classId
      && unit.experience === entry.experience
      && unit.life === entry.life;
  });
}

function isSavedEnemyAiState(value: unknown, round: number): value is SavedEnemyAiState {
  if (
    !isRecord(value)
    || !Array.isArray(value.activeGroupIds)
    || !value.activeGroupIds.every((id) => id === STAGE1_CASTLE_GUARD_GROUP_ID)
    || !hasUniqueValues(value.activeGroupIds)
    || !Array.isArray(value.pendingNoticeGroupIds)
    || !value.pendingNoticeGroupIds.every((id) => id === STAGE1_CASTLE_GUARD_GROUP_ID)
    || !hasUniqueValues(value.pendingNoticeGroupIds)
  ) return false;

  const activeGroupIds = value.activeGroupIds as string[];
  const pendingNoticeGroupIds = value.pendingNoticeGroupIds as string[];
  if (pendingNoticeGroupIds.some((id) => !activeGroupIds.includes(id))) return false;

  if (activeGroupIds.length === 0) {
    return pendingNoticeGroupIds.length === 0 && value.fangPursuitRound === null;
  }
  return activeGroupIds.length === 1
    && isIntegerBetween(value.fangPursuitRound, 1, MAX_ROUND + 1)
    && value.fangPursuitRound <= round + 1;
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
    || !isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.roster)
    || value.roster.length !== MAX_UNIT_SLOT + 1
    || !value.roster.every(isRosterEntry)
    || !Array.isArray(value.consumedEventIds)
    || !value.consumedEventIds.every((id) => typeof id === "string")
    || !hasUniqueValues(value.consumedEventIds)
    || (value.stageProgress !== 0 && value.stageProgress !== 999 && value.stageProgress !== 1000)
  ) return false;

  return hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor);
}

function isCompletedSave(value: Record<string, unknown>): boolean {
  if (value.kind !== "completed" || value.battle !== undefined) return false;
  const consumedEventIds = value.consumedEventIds as string[];
  if (value.stageId === "stage-01") {
    return value.stageLabel === "騎士城堡前"
      && value.stageProgress === 0
      && consumedEventIds.length === 0;
  }
  if (value.stageId === "stage-02") {
    return value.stageLabel === "救援友軍"
      && value.stageProgress === 1000
      && hasExactlyTheseValues(consumedEventIds, STAGE1_SAVE_EVENT_IDS);
  }
  if (value.stageId === "stage-03") {
    return value.stageLabel === "通過力場"
      && value.stageProgress === 1000
      && hasExactlyTheseValues(consumedEventIds, STAGE2_SAVE_EVENT_IDS);
  }
  return value.stageId === "stage-04"
    && value.stageLabel === "下一關"
    && value.stageProgress === 1000
    && hasExactlyTheseValues(consumedEventIds, STAGE3_SAVE_EVENT_IDS);
}

function isBattleSave(
  value: Record<string, unknown>,
  requireStageEntrySnapshot = true,
): boolean {
  const difficulty = isDifficulty(value.difficulty) ? value.difficulty : undefined;
  const stageId = value.stageId === "stage-00" || value.stageId === "stage-01"
    || value.stageId === "stage-02" || value.stageId === "stage-03"
    ? value.stageId
    : undefined;
  if (!stageId || difficulty === undefined || value.stageProgress !== 0) return false;
  const validEventIds = new Set<string>(stageId === "stage-01"
    ? STAGE1_SAVE_EVENT_IDS
    : stageId === "stage-02"
      ? STAGE2_SAVE_EVENT_IDS
      : stageId === "stage-03"
        ? STAGE3_SAVE_EVENT_IDS
      : STAGE0_DEFINITION.events.map(({ id }) => id));
  const consumedEventIds = value.consumedEventIds as string[];
  return value.kind === "battle"
    && value.stageLabel === (stageId === "stage-01"
      ? "騎士城堡前"
      : stageId === "stage-02"
        ? "救援友軍"
        : stageId === "stage-03" ? "通過力場" : "瓦爾克麗宮")
    && consumedEventIds.every((id) => validEventIds.has(id))
    && (stageId !== "stage-01" || hasExactlyTheseValues(consumedEventIds, [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ]))
    && (stageId !== "stage-02" || hasExactlyTheseValues(consumedEventIds, [
      "stage-02-opening-story",
    ]))
    && (stageId !== "stage-03" || hasExactlyTheseValues(consumedEventIds, [
      "stage-03-opening-story",
    ]))
    && (!requireStageEntrySnapshot
      || isStageEntrySnapshot(value.stageEntrySnapshot, stageId, difficulty))
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      difficulty,
      stageId,
    );
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value) || !hasValidBase(value)) return false;
  return isCompletedSave(value) || isBattleSave(value);
}

function migrateVersion13Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 13
    || value.contentVersion !== "stage-entry-snapshot-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    ...(value.kind === "completed" && value.stageId === "stage-03"
      ? { stageLabel: "通過力場" }
      : {}),
  };
  return isSaveData(migrated) ? migrated : undefined;
}

interface Version12SaveBase {
  format: "ANGEL2-web-save";
  version: 12;
  contentVersion: "stage-02-allied-auto-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version12BattleSave extends Version12SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01" | "stage-02";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前" | "救援友軍";
  battle: SavedBattleState;
}

interface Version12CompletedSave extends Version12SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02" | "stage-03";
  stageLabel: "騎士城堡前" | "救援友軍" | "下一關";
}

type Version12SaveData = Version12BattleSave | Version12CompletedSave;

function isVersion12SaveData(value: unknown): value is Version12SaveData {
  if (
    !isRecord(value)
    || value.version !== 12
    || value.contentVersion !== "stage-02-allied-auto-1"
    || !hasValidBase({
      ...value,
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
    })
  ) return false;
  const normalized = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    ...(value.kind === "completed" && value.stageId === "stage-03"
      ? { stageLabel: "通過力場" }
      : {}),
  };
  return isCompletedSave(normalized) || isBattleSave(value, false);
}

function migrateVersion12Save(save: Version12SaveData): SaveData {
  if (save.kind === "completed") {
    return {
      ...save,
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      ...(save.stageId === "stage-03" ? { stageLabel: "通過力場" as const } : {}),
    };
  }
  return {
    ...save,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    // v12 did not retain an earlier immutable baseline. Adopt its current
    // campaign state once; gains made after migration will then roll back.
    stageEntrySnapshot: {
      stageId: save.stageId,
      ruleset: save.ruleset,
      difficulty: save.difficulty,
      roster: save.roster.map((entry) => ({ ...entry })),
      rngState: save.rngState,
      rngCalls: save.rngCalls,
    },
  };
}

interface Version11SaveBase {
  format: "ANGEL2-web-save";
  version: 11;
  contentVersion: "stage-01-ice-outer-ring-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version11BattleSave extends Version11SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: SavedBattleState;
}

interface Version11CompletedSave extends Version11SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

type Version11SaveData = Version11BattleSave | Version11CompletedSave;

function hasValidVersion11Base(value: Record<string, unknown>): boolean {
  return value.format === "ANGEL2-web-save"
    && value.version === 11
    && value.contentVersion === "stage-01-ice-outer-ring-1"
    && value.ruleset === "stableRemake"
    && typeof value.savedAt === "string"
    && !Number.isNaN(Date.parse(value.savedAt))
    && isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    && isDifficulty(value.difficulty)
    && isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    && isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.roster)
    && value.roster.length === MAX_UNIT_SLOT + 1
    && value.roster.every(isRosterEntry)
    && hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor)
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasUniqueValues(value.consumedEventIds)
    && (value.stageProgress === 0 || value.stageProgress === 999 || value.stageProgress === 1000);
}

function isVersion11SaveData(value: unknown): value is Version11SaveData {
  if (!isRecord(value) || !hasValidVersion11Base(value)) return false;
  const consumedEventIds = value.consumedEventIds as string[];
  if (value.kind === "completed") {
    if (value.battle !== undefined) return false;
    if (value.stageId === "stage-01") {
      return value.stageLabel === "騎士城堡前"
        && value.stageProgress === 0
        && consumedEventIds.length === 0;
    }
    return value.stageId === "stage-02"
      && value.stageLabel === "下一關"
      && value.stageProgress === 1000
      && hasExactlyTheseValues(consumedEventIds, STAGE1_SAVE_EVENT_IDS);
  }
  const difficulty = isDifficulty(value.difficulty) ? value.difficulty : undefined;
  const stageId = value.stageId === "stage-00" || value.stageId === "stage-01"
    ? value.stageId
    : undefined;
  if (value.kind !== "battle" || !stageId || difficulty === undefined || value.stageProgress !== 0) return false;
  const validEventIds = new Set<string>(stageId === "stage-01"
    ? STAGE1_SAVE_EVENT_IDS
    : STAGE0_DEFINITION.events.map(({ id }) => id));
  return value.stageLabel === (stageId === "stage-01" ? "騎士城堡前" : "瓦爾克麗宮")
    && consumedEventIds.every((id) => validEventIds.has(id))
    && (stageId !== "stage-01" || hasExactlyTheseValues(consumedEventIds, [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ]))
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      difficulty,
      stageId,
    );
}

function migrateVersion11Save(save: Version11SaveData): SaveData {
  const version12 = {
    ...save,
    version: 12 as const,
    contentVersion: "stage-02-allied-auto-1" as const,
    ...(save.kind === "completed" && save.stageId === "stage-02"
      ? { stageLabel: "救援友軍" as const }
      : {}),
  };
  return migrateVersion12Save(version12);
}

interface Version10SaveBase {
  format: "ANGEL2-web-save";
  version: 10;
  contentVersion: "stage-01-frozen-dispel-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version10BattleSave extends Version10SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: SavedBattleState;
}

interface Version10CompletedSave extends Version10SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

type Version10SaveData = Version10BattleSave | Version10CompletedSave;

function hasValidVersion10Base(value: Record<string, unknown>): boolean {
  return value.format === "ANGEL2-web-save"
    && value.version === 10
    && value.contentVersion === "stage-01-frozen-dispel-1"
    && value.ruleset === "stableRemake"
    && typeof value.savedAt === "string"
    && !Number.isNaN(Date.parse(value.savedAt))
    && isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    && isDifficulty(value.difficulty)
    && isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    && isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.roster)
    && value.roster.length === MAX_UNIT_SLOT + 1
    && value.roster.every(isRosterEntry)
    && hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor)
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasUniqueValues(value.consumedEventIds)
    && (value.stageProgress === 0 || value.stageProgress === 999 || value.stageProgress === 1000);
}

function isVersion10SaveData(value: unknown): value is Version10SaveData {
  return isRecord(value)
    && hasValidVersion10Base(value)
    && isVersion11SaveData({
      ...value,
      version: 11,
      contentVersion: "stage-01-ice-outer-ring-1",
    });
}

function migrateVersion10Save(save: Version10SaveData): SaveData {
  return migrateVersion11Save({
    ...save,
    version: 11,
    contentVersion: "stage-01-ice-outer-ring-1",
  });
}

interface Version9SaveBase {
  format: "ANGEL2-web-save";
  version: 9;
  contentVersion: "stage-01-ice-lock-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version9BattleSave extends Version9SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: SavedBattleState;
}

interface Version9CompletedSave extends Version9SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

type Version9SaveData = Version9BattleSave | Version9CompletedSave;

function hasValidVersion9Base(value: Record<string, unknown>): boolean {
  return value.format === "ANGEL2-web-save"
    && value.version === 9
    && value.contentVersion === "stage-01-ice-lock-1"
    && value.ruleset === "stableRemake"
    && typeof value.savedAt === "string"
    && !Number.isNaN(Date.parse(value.savedAt))
    && isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    && isDifficulty(value.difficulty)
    && isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    && isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.roster)
    && value.roster.length === MAX_UNIT_SLOT + 1
    && value.roster.every(isRosterEntry)
    && hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor)
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasUniqueValues(value.consumedEventIds)
    && (value.stageProgress === 0 || value.stageProgress === 999 || value.stageProgress === 1000);
}

function isVersion9SaveData(value: unknown): value is Version9SaveData {
  return isRecord(value)
    && hasValidVersion9Base(value)
    && isVersion11SaveData({
      ...value,
      version: 11,
      contentVersion: "stage-01-ice-outer-ring-1",
    });
}

function migrateVersion9Save(save: Version9SaveData): SaveData {
  return migrateVersion11Save({
    ...save,
    version: 11,
    contentVersion: "stage-01-ice-outer-ring-1",
  });
}

interface PreVersion9BattleUnit extends Omit<BattleUnit, "actionDisabled"> {}

interface PreVersion9SavedBattleState extends Omit<SavedBattleState, "units"> {
  units: PreVersion9BattleUnit[];
}

interface Version8SaveBase {
  format: "ANGEL2-web-save";
  version: 8;
  contentVersion: "stage-01-ai-3";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version8BattleSave extends Version8SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: PreVersion9SavedBattleState;
}

interface Version8CompletedSave extends Version8SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

type Version8SaveData = Version8BattleSave | Version8CompletedSave;

function hasValidVersion8Base(value: Record<string, unknown>): boolean {
  return value.format === "ANGEL2-web-save"
    && value.version === 8
    && value.contentVersion === "stage-01-ai-3"
    && value.ruleset === "stableRemake"
    && typeof value.savedAt === "string"
    && !Number.isNaN(Date.parse(value.savedAt))
    && isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    && isDifficulty(value.difficulty)
    && isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    && isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.roster)
    && value.roster.length === MAX_UNIT_SLOT + 1
    && value.roster.every(isRosterEntry)
    && hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor)
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasUniqueValues(value.consumedEventIds)
    && (value.stageProgress === 0 || value.stageProgress === 999 || value.stageProgress === 1000);
}

function isVersion8SaveData(value: unknown): value is Version8SaveData {
  if (!isRecord(value) || !hasValidVersion8Base(value)) return false;
  const consumedEventIds = value.consumedEventIds as string[];
  if (value.kind === "completed") {
    if (value.battle !== undefined) return false;
    if (value.stageId === "stage-01") {
      return value.stageLabel === "騎士城堡前"
        && value.stageProgress === 0
        && consumedEventIds.length === 0;
    }
    return value.stageId === "stage-02"
      && value.stageLabel === "下一關"
      && value.stageProgress === 1000
      && hasExactlyTheseValues(consumedEventIds, STAGE1_SAVE_EVENT_IDS);
  }

  const stageId = value.stageId === "stage-00" || value.stageId === "stage-01"
    ? value.stageId
    : undefined;
  if (value.kind !== "battle" || !stageId || value.stageProgress !== 0) return false;
  const validEventIds = new Set<string>(stageId === "stage-01"
    ? STAGE1_SAVE_EVENT_IDS
    : STAGE0_DEFINITION.events.map(({ id }) => id));
  return value.stageLabel === (stageId === "stage-01" ? "騎士城堡前" : "瓦爾克麗宮")
    && consumedEventIds.every((id) => validEventIds.has(id))
    && (stageId !== "stage-01" || hasExactlyTheseValues(consumedEventIds, [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ]))
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      value.difficulty as Difficulty,
      stageId,
      true,
      false,
    );
}

function migrateVersion8Save(save: Version8SaveData): SaveData {
  if (save.kind === "completed") {
    return migrateVersion12Save({
      ...save,
      version: 12,
      contentVersion: "stage-02-allied-auto-1",
    });
  }
  return migrateVersion12Save({
    ...save,
    version: 12,
    contentVersion: "stage-02-allied-auto-1",
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({ ...unit, actionDisabled: false })),
    },
  });
}

interface Version7SavedBattleState extends Omit<PreVersion9SavedBattleState, "enemyAi"> {
  enemyAi?: never;
}

interface Version7SaveBase {
  format: "ANGEL2-web-save";
  version: 7;
  contentVersion: "stage-01-actions-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

interface Version7BattleSave extends Version7SaveBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: Version7SavedBattleState;
}

interface Version7CompletedSave extends Version7SaveBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

type Version7SaveData = Version7BattleSave | Version7CompletedSave;

function hasValidVersion7Base(value: Record<string, unknown>): boolean {
  return value.format === "ANGEL2-web-save"
    && value.version === 7
    && value.contentVersion === "stage-01-actions-1"
    && value.ruleset === "stableRemake"
    && typeof value.savedAt === "string"
    && !Number.isNaN(Date.parse(value.savedAt))
    && isIntegerBetween(value.saveCount, 1, Number.MAX_SAFE_INTEGER)
    && isDifficulty(value.difficulty)
    && isIntegerBetween(value.rngState, 1, 0xffff_ffff)
    && isIntegerBetween(value.rngCalls, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.roster)
    && value.roster.length === MAX_UNIT_SLOT + 1
    && value.roster.every(isRosterEntry)
    && hasUniqueValues(value.roster.map((entry) => entry.slot))
    && value.roster.every(hasNamedAllyExperienceFloor)
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasUniqueValues(value.consumedEventIds)
    && (value.stageProgress === 0 || value.stageProgress === 999 || value.stageProgress === 1000);
}

function isVersion7SaveData(value: unknown): value is Version7SaveData {
  if (!isRecord(value) || !hasValidVersion7Base(value)) return false;
  const consumedEventIds = value.consumedEventIds as string[];
  if (value.kind === "completed") {
    if (value.battle !== undefined) return false;
    if (value.stageId === "stage-01") {
      return value.stageLabel === "騎士城堡前"
        && value.stageProgress === 0
        && consumedEventIds.length === 0;
    }
    return value.stageId === "stage-02"
      && value.stageLabel === "下一關"
      && value.stageProgress === 1000
      && hasExactlyTheseValues(consumedEventIds, STAGE1_SAVE_EVENT_IDS);
  }

  const stageId = value.stageId === "stage-00" || value.stageId === "stage-01"
    ? value.stageId
    : undefined;
  if (value.kind !== "battle" || !stageId || value.stageProgress !== 0) return false;
  const validEventIds = new Set<string>(stageId === "stage-01"
    ? STAGE1_SAVE_EVENT_IDS
    : STAGE0_DEFINITION.events.map(({ id }) => id));
  return value.stageLabel === (stageId === "stage-01" ? "騎士城堡前" : "瓦爾克麗宮")
    && consumedEventIds.every((id) => validEventIds.has(id))
    && (stageId !== "stage-01" || hasExactlyTheseValues(consumedEventIds, [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ]))
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      value.difficulty as Difficulty,
      stageId,
      false,
      false,
    );
}

function inferredStage1EnemyAiState(save: Version7BattleSave): SavedEnemyAiState {
  const observations = [...STAGE1_CASTLE_GUARD_INITIAL_POSITIONS].map(([id, initial]) => {
    const unit = save.battle.units.find((candidate) => candidate.id === id);
    return {
      movedOrMissing: !unit || unit.x !== initial.x || unit.y !== initial.y,
      damaged: Boolean(unit && unit.life < statsFor(unit, save.difficulty).maxLife),
    };
  });
  const movedOrMissing = observations.some((observation) => observation.movedOrMissing);
  const active = movedOrMissing || observations.some((observation) => observation.damaged);
  return active
    ? {
      activeGroupIds: [STAGE1_CASTLE_GUARD_GROUP_ID],
      pendingNoticeGroupIds: [],
      // A moved/missing guard must have acted before this player phase. Damage without
      // movement may have happened moments before the save, so preserve the one-round delay.
      fangPursuitRound: movedOrMissing ? save.battle.round : save.battle.round + 1,
    }
    : {
      activeGroupIds: [],
      pendingNoticeGroupIds: [],
      fangPursuitRound: null,
    };
}

function migrateVersion7Save(save: Version7SaveData): SaveData {
  if (save.kind === "completed") {
    return migrateVersion12Save({
      ...save,
      version: 12,
      contentVersion: "stage-02-allied-auto-1",
    });
  }
  return migrateVersion12Save({
    ...save,
    version: 12,
    contentVersion: "stage-02-allied-auto-1",
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({ ...unit, actionDisabled: false })),
      ...(save.stageId === "stage-01"
        ? { enemyAi: inferredStage1EnemyAiState(save) }
        : {}),
    },
  });
}

interface Version6SaveBase {
  format: "ANGEL2-web-save";
  version: 6;
  contentVersion: "native-actions-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  roster: SaveRosterEntry[];
}

interface Version6BattleSave extends Version6SaveBase {
  kind: "battle";
  stageId: "stage-00";
  stageLabel: "瓦爾克麗宮";
  battle: PreVersion9SavedBattleState;
}

interface Version6CompletedSave extends Version6SaveBase {
  kind: "completed";
  stageId: "stage-01";
  stageLabel: "下一關";
}

type Version6SaveData = Version6BattleSave | Version6CompletedSave;

function isVersion6SaveData(value: unknown): value is Version6SaveData {
  if (
    !isRecord(value)
    || value.format !== "ANGEL2-web-save"
    || value.version !== 6
    || value.contentVersion !== "native-actions-1"
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
  if (value.kind !== "battle" || value.stageId !== "stage-00" || value.stageLabel !== "瓦爾克麗宮") {
    return false;
  }
  if (!isSavedBattleState(
    value.battle,
    value.roster,
    value.difficulty,
    "stage-00",
    true,
    false,
  )) return false;
  return value.battle.units.filter(({ side }) => side === 1).length === value.roster.length;
}

function migrateVersion6Save(save: Version6SaveData): SaveData {
  const roster = completeCampaignRoster(save.roster);
  const base = {
    ...save,
    version: 12 as const,
    contentVersion: "stage-02-allied-auto-1" as const,
    rngCalls: 0,
    roster,
    stageProgress: 0 as const,
  };
  if (save.kind === "completed") {
    return migrateVersion12Save({
      ...base,
      kind: "completed",
      stageId: "stage-01",
      stageLabel: "騎士城堡前",
      consumedEventIds: [],
    });
  }
  return migrateVersion12Save({
    ...base,
    kind: "battle",
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    consumedEventIds: consumedEventIdsForBattleResume(STAGE0_DEFINITION, save.battle.round),
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({ ...unit, actionDisabled: false })),
    },
  });
}

interface Version5BattleUnit extends Omit<BattleUnit, "statuses" | "actionDisabled"> {}

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
    || value.actionDisabled !== undefined
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
    return migrateVersion6Save({
      ...save,
      version: 6,
      contentVersion: "native-actions-1",
    });
  }
  return migrateVersion6Save({
    ...save,
    version: 6,
    contentVersion: "native-actions-1",
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({
        ...unit,
        actionDisabled: false,
        statuses: emptyUnitStatuses(),
      })),
    },
  });
}

type LegacySaveVersion = 2 | 3 | 4;
type LegacyClassId = 0 | 22;

interface LegacyRosterEntry {
  slot: number;
  classId: LegacyClassId;
  experience: number;
  life: number;
}

interface LegacyBattleUnit extends Omit<BattleUnit, "classId" | "statuses" | "actionDisabled"> {
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
    || value.actionDisabled !== undefined
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
    version: 6 as const,
    contentVersion: "native-actions-1" as const,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    ruleset: "stableRemake" as const,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster,
  };

  if (save.kind === "completed") {
    return migrateVersion6Save({
      ...base,
      kind: "completed",
      stageId: "stage-01",
      stageLabel: "下一關",
    });
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
      actionDisabled: false,
      statuses: emptyUnitStatuses(),
    };
  });

  return migrateVersion6Save({
    ...base,
    kind: "battle",
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    battle: {
      ...save.battle,
      units,
    },
  });
}

export function parseSaveData(raw: string): SaveData | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (isSaveData(value)) return value;
    const migratedVersion13 = migrateVersion13Save(value);
    if (migratedVersion13) return migratedVersion13;
    if (isVersion12SaveData(value)) {
      const migrated = migrateVersion12Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion11SaveData(value)) {
      const migrated = migrateVersion11Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion10SaveData(value)) {
      const migrated = migrateVersion10Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion9SaveData(value)) {
      const migrated = migrateVersion9Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion8SaveData(value)) {
      const migrated = migrateVersion8Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion7SaveData(value)) {
      const migrated = migrateVersion7Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
    if (isVersion6SaveData(value)) {
      const migrated = migrateVersion6Save(value);
      return isSaveData(migrated) ? migrated : undefined;
    }
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
