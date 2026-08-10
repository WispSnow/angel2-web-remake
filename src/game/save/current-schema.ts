import { className, isClassId } from "../content/classes";
import {
  STAGE0_ALLY_INITIAL_EXPERIENCE,
  initialEnemyExperience,
  statsFor,
} from "../content/stage0";
import { isPortraitRecord } from "../content/portrait-catalog.generated";
import { UNIT_STATUS_KEYS } from "../simulation/status";
import {
  isPlayableStageId,
  stageRuntimeSourceForDestination,
  STAGE_RUNTIME_MANIFEST,
  type StageSaveSchema,
} from "../stage-runtime";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  DynamicTerrainKind,
  PortraitRecord,
  Position,
  SaveData,
  SaveRosterEntry,
  SavedBattleState,
  SavedEnemyAiState,
  Side,
  StageId,
  UnitClassId,
} from "../types";

export const SAVE_VERSION = 32 as const;
export const SAVE_CONTENT_VERSION = "stage-11-ranger-reinforcements-1" as const;

export const MAX_UNIT_SLOT = 74;
export const MAX_BATTLE_UNIT_SLOT = 79;
export const MAX_ROUND = 9_999;
export const MAX_EXPERIENCE = 0x7fff_ffff;
export const MAX_LIFE = 0x7fff_ffff;
const MAX_STATUS = 0x7fff;
const STAGE_WIDTH = 50;
const STAGE_HEIGHT = 50;
export const CAMERA_MAX_X = 40;
export const CAMERA_MAX_Y = 43;

export const STAGE0_ALLY_CLASSES = new Set<UnitClassId>(
  STAGE_RUNTIME_MANIFEST["stage-00"].save.alliedUnits.classIds,
);
export const STAGE0_ENEMY_CLASS_BY_ID = new Map(
  STAGE_RUNTIME_MANIFEST["stage-00"].save.enemyClassById,
);
// Older migrations import this immutable v8 identity rather than loading a stage chunk.
export const STAGE1_SAVE_EVENT_IDS = STAGE_RUNTIME_MANIFEST["stage-01"].save.validEventIds;
export const STAGE1_CASTLE_GUARD_GROUP_ID = "castle-guard";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isIntegerBetween = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number =>
  Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;

export const isDifficulty = (value: unknown): value is Difficulty =>
  value === 0 || value === 1 || value === 2 || value === 3;

export const isSide = (value: unknown): value is Side => value === 1 || value === 2;

export const isPortrait = (value: unknown): value is PortraitRecord =>
  isPortraitRecord(value);

export function isPosition(
  value: unknown,
  maximumX = STAGE_WIDTH - 1,
  maximumY = STAGE_HEIGHT - 1,
): value is Position {
  return isRecord(value)
    && isIntegerBetween(value.x, 0, maximumX)
    && isIntegerBetween(value.y, 0, maximumY);
}

export function isRosterEntry(value: unknown): value is SaveRosterEntry {
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
  stageId: StageId,
  requireActionDisabled = true,
): value is BattleUnit {
  if (
    !isRecord(value)
    || !isSide(value.side)
    || !isIntegerBetween(value.slot, 0, MAX_BATTLE_UNIT_SLOT)
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

  const schema: StageSaveSchema = STAGE_RUNTIME_MANIFEST[stageId].save;
  if (value.side === 1) {
    return schema.alliedUnits.kind !== "allowed-classes"
      || schema.alliedUnits.classIds.includes(value.classId);
  }
  return new Map(schema.enemyClassById).get(value.id) === value.classId;
}

export function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

export function hasExactlyTheseValues(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  if (values.length !== expected.length) return false;
  const actual = new Set(values);
  return expected.every((value) => actual.has(value));
}

export function hasNamedAllyExperienceFloor(
  entry: Pick<SaveRosterEntry, "slot" | "classId" | "experience">,
): boolean {
  return entry.classId !== "soldier"
    || entry.experience >= (STAGE0_ALLY_INITIAL_EXPERIENCE[entry.slot] ?? 0);
}

export function isSavedBattleState(
  value: unknown,
  roster: readonly SaveRosterEntry[],
  difficulty: Difficulty,
  stageId: StageId,
  requireStage1Ai = true,
  requireActionDisabled = true,
  requireTerrainOverrides = true,
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
    || (requireTerrainOverrides
      ? !Array.isArray(value.terrainOverrides)
        || value.terrainOverrides.length > STAGE_WIDTH * STAGE_HEIGHT
        || !value.terrainOverrides.every((override) => isRecord(override)
          && (override.kind === "iron-plate" || override.kind === "obstacle")
          && isPosition(override))
      : value.terrainOverrides !== undefined
        && (!Array.isArray(value.terrainOverrides) || value.terrainOverrides.length !== 0))
    || !isPosition(value.cursor)
    || !isPosition(value.cameraOrigin, CAMERA_MAX_X, CAMERA_MAX_Y)
  ) return false;

  const saveSchema: StageSaveSchema = STAGE_RUNTIME_MANIFEST[stageId].save;
  if (saveSchema.enemyAi === "stage-01-castle-guard") {
    if (requireStage1Ai) {
      if (!isSavedEnemyAiState(value.enemyAi, value.round)) return false;
    } else if (value.enemyAi !== undefined) return false;
  } else if (value.enemyAi !== undefined) return false;

  const units = value.units;
  const terrainOverrides = (value.terrainOverrides ?? []) as Array<{
    x: number;
    y: number;
    kind: DynamicTerrainKind;
  }>;
  if (
    !hasUniqueValues(units.map((unit) => unit.id))
    || !hasUniqueValues(units.map((unit) => `${unit.x},${unit.y}`))
    || !hasUniqueValues(terrainOverrides.map(({ x, y }) => `${x},${y}`))
    || terrainOverrides.some((override, index) => index > 0
      && terrainOverrides[index - 1].y * STAGE_WIDTH + terrainOverrides[index - 1].x
        >= override.y * STAGE_WIDTH + override.x)
    || !units.some((unit) => unit.id === value.focusId)
    || units.some((unit) =>
      (unit.side === 1 && !hasNamedAllyExperienceFloor(unit))
      || (unit.side === 2
        && (unit.life > statsFor(unit, difficulty).maxLife
          || unit.experience !== initialEnemyExperience(unit.classId, difficulty))))
  ) return false;

  const allies = units.filter((unit) => unit.side === 1);
  const alliedRule = saveSchema.alliedUnits;
  if (alliedRule.kind === "deployment") {
    const eligibleSlots = new Set<number>(alliedRule.eligibleSlots);
    const fixedSlots = new Set<number>(alliedRule.fixedSlots);
    const optionalSlots = new Set<number>(alliedRule.optionalSlots);
    const alliedSlots = new Set(allies.map(({ slot }) => slot));
    if (allies.length < fixedSlots.size
      || allies.length > alliedRule.maximumUnits
      || allies.some(({ slot }) => !eligibleSlots.has(slot))
      || [...fixedSlots].some((slot) => !alliedSlots.has(slot))
      || allies.filter(({ slot }) => optionalSlots.has(slot)).length
        > alliedRule.openCellCount) {
      return false;
    }
  } else if (alliedRule.kind === "exact-slots") {
    const alliedSlots = allies.map(({ slot }) => slot).sort((left, right) => left - right);
    if (alliedSlots.length !== alliedRule.slots.length
      || !alliedSlots.every((slot, index) => slot === alliedRule.slots[index])) {
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

export function hasValidBase(value: Record<string, unknown>): boolean {
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

export function isCompletedSave(value: Record<string, unknown>): boolean {
  if (value.kind !== "completed" || value.battle !== undefined) return false;
  const consumedEventIds = value.consumedEventIds as string[];
  const source = stageRuntimeSourceForDestination(value.stageId);
  if (!source) return false;
  const expectedEvents = source.completion.consumedEvents === "all"
    ? source.save.validEventIds
    : [];
  return value.stageLabel === source.completion.destinationLabel
    && value.stageProgress === source.completion.destinationProgress
    && hasExactlyTheseValues(consumedEventIds, expectedEvents);
}

export function isBattleSave(
  value: Record<string, unknown>,
  requireStageEntrySnapshot = true,
  requireTerrainOverrides = true,
): boolean {
  const difficulty = isDifficulty(value.difficulty) ? value.difficulty : undefined;
  const stageId = isPlayableStageId(value.stageId) ? value.stageId : undefined;
  if (!stageId || difficulty === undefined || value.stageProgress !== 0) return false;
  const manifest = STAGE_RUNTIME_MANIFEST[stageId];
  const saveSchema: StageSaveSchema = manifest.save;
  const validEventIds = new Set<string>(saveSchema.validEventIds);
  const consumedEventIds = value.consumedEventIds as string[];
  return value.kind === "battle"
    && value.stageLabel === manifest.label
    && consumedEventIds.every((id) => validEventIds.has(id))
    && (saveSchema.requiredResumeEventIds === undefined
      || hasExactlyTheseValues(consumedEventIds, saveSchema.requiredResumeEventIds))
    && (!requireStageEntrySnapshot
      || isStageEntrySnapshot(value.stageEntrySnapshot, stageId, difficulty))
    && isSavedBattleState(
      value.battle,
      value.roster as SaveRosterEntry[],
      difficulty,
      stageId,
      true,
      true,
      requireTerrainOverrides,
    );
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value) || !hasValidBase(value)) return false;
  return isCompletedSave(value) || isBattleSave(value);
}
