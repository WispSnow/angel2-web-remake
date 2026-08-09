import {
  classIdFromNativeRecord,
  className,
  classStatsFor,
  isClassId,
} from "../../content/classes";
import {
  STAGE0_ALLY_INITIAL_EXPERIENCE,
  completeCampaignRoster,
  initialEnemyExperience,
  statsFor,
} from "../../content/stage0";
import { STAGE0_DEFINITION } from "../../content/stages";
import { consumedEventIdsForBattleResume } from "../../simulation/stage-events";
import type {
  BattleUnit,
  Difficulty,
  Position,
  SaveData,
  SaveRosterEntry,
  SavedBattleState,
  SavedEnemyAiState,
  StageId,
  UnitClassId,
} from "../../types";
import { emptyUnitStatuses } from "../../simulation/status";
import {
  CAMERA_MAX_X,
  CAMERA_MAX_Y,
  MAX_EXPERIENCE,
  MAX_LIFE,
  MAX_ROUND,
  MAX_UNIT_SLOT,
  SAVE_CONTENT_VERSION,
  SAVE_VERSION,
  STAGE0_ALLY_CLASSES,
  STAGE0_ENEMY_CLASS_BY_ID,
  STAGE1_CASTLE_GUARD_GROUP_ID,
  STAGE1_SAVE_EVENT_IDS,
  hasExactlyTheseValues,
  hasNamedAllyExperienceFloor,
  hasUniqueValues,
  hasValidBase,
  isBattleSave,
  isCompletedSave,
  isDifficulty,
  isIntegerBetween,
  isPortrait,
  isPosition,
  isRecord,
  isRosterEntry,
  isSaveData,
  isSavedBattleState,
  isSide,
} from "../current-schema";

export { SAVE_CONTENT_VERSION, SAVE_VERSION, isSaveData } from "../current-schema";

const STAGE1_CASTLE_GUARD_INITIAL_POSITIONS = new Map<string, Position>([
  ["2:40", { x: 22, y: 14 }],
  ["2:41", { x: 28, y: 14 }],
  ["2:42", { x: 27, y: 16 }],
  ["2:43", { x: 23, y: 16 }],
]);

const correctedStageLabel = (stageId: unknown): string | undefined => {
  if (stageId === "stage-00") return "瓦爾克麗宮";
  if (stageId === "stage-01") return "騎士城堡前";
  if (stageId === "stage-02") return "攻打騎士堡";
  if (stageId === "stage-03") return "救援友軍";
  if (stageId === "stage-04") return "通過力場";
  if (stageId === "stage-05") return "遭遇丁塔琪";
  return undefined;
};

const GADIRATH_SLOT = 24;
const GADIRATH_TEMPLATE_CLASS = "magician" as const;
const GADIRATH_TEMPLATE_STAGES = new Set<StageId>(["stage-01", "stage-02", "stage-04"]);

/**
 * v13-v15 battle saves retain the immutable pre-entry roster. Use it to undo
 * the old Web template override when the current battle/roster were both
 * flattened to magician. Completed saves have no entry snapshot and cannot be
 * reconstructed without guessing which promotion the player chose.
 */
function restoreGadirathClassFromEntrySnapshot(save: SaveData): SaveData {
  if (save.kind !== "battle" || !GADIRATH_TEMPLATE_STAGES.has(save.stageId)) return save;
  const entry = save.stageEntrySnapshot.roster.find(({ slot }) => slot === GADIRATH_SLOT);
  const roster = save.roster.find(({ slot }) => slot === GADIRATH_SLOT);
  const unit = save.battle.units.find(({ side, slot }) => side === 1 && slot === GADIRATH_SLOT);
  if (!entry || !roster || !unit
    || roster.classId !== GADIRATH_TEMPLATE_CLASS
    || unit.classId !== GADIRATH_TEMPLATE_CLASS
    || entry.classId === GADIRATH_TEMPLATE_CLASS
    || (entry.classId === "soldier" && entry.experience === 0)) return save;

  const life = Math.min(
    unit.life,
    classStatsFor({ classId: entry.classId, experience: unit.experience }).maxLife,
  );
  return {
    ...save,
    roster: save.roster.map((candidate) => candidate.slot === GADIRATH_SLOT
      ? { ...candidate, classId: entry.classId, life }
      : candidate),
    battle: {
      ...save.battle,
      units: save.battle.units.map((candidate) => candidate.id === unit.id
        ? {
          ...candidate,
          classId: entry.classId,
          className: className(entry.classId),
          life,
        }
        : candidate),
    },
  };
}

function addEmptyTerrainOverrides(value: unknown): unknown {
  if (!isRecord(value) || value.kind !== "battle" || !isRecord(value.battle)) return value;
  if (value.battle.terrainOverrides !== undefined) return value;
  return {
    ...value,
    battle: { ...value.battle, terrainOverrides: [] },
  };
}

function finalizeDirectMigration(value: unknown): SaveData | undefined {
  const normalized = addEmptyTerrainOverrides(value);
  if (!isSaveData(normalized)) return undefined;
  const restored = restoreGadirathClassFromEntrySnapshot(normalized);
  return isSaveData(restored) ? restored : undefined;
}

function migrateVersion25Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 25
    || value.contentVersion !== "expert-ranged-control-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion24Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 24
    || value.contentVersion !== "expert-enemy-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion23Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 23
    || value.contentVersion !== "stage-08-victory-story-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion22Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 22
    || value.contentVersion !== "stage-08-ranger-defense-1") return undefined;
  const stage8CompletedEventIds = [
    "stage-08-prebattle-story",
    "stage-08-opening-story",
    "stage-08-objective-reached",
    "stage-08-completed-route",
  ];
  const isStage8Completed = value.kind === "completed"
    && value.stageId === "stage-09"
    && Array.isArray(value.consumedEventIds)
    && value.consumedEventIds.every((id) => typeof id === "string")
    && hasExactlyTheseValues(value.consumedEventIds, stage8CompletedEventIds);
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    ...(isStage8Completed ? {
      consumedEventIds: [
        "stage-08-prebattle-story",
        "stage-08-opening-story",
        "stage-08-objective-reached",
        "stage-08-victory-story",
        "stage-08-completed-route",
      ],
    } : {}),
  });
}

function migrateVersion21Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 21
    || value.contentVersion !== "stage-07-camp-raid-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion20Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 20
    || value.contentVersion !== "stage-06-rangers-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion19Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 19
    || value.contentVersion !== "stage-05-portal-1") return undefined;
  const stageLabel = value.kind === "completed"
    && value.stageId === "stage-06"
    && value.stageLabel === "第 6 關"
    ? "過異世界之門"
    : value.stageLabel;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
  });
}

function migrateVersion18Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 18
    || value.contentVersion !== "dynamic-terrain-2") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion17Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 17
    || value.contentVersion !== "dynamic-terrain-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion16Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 16
    || value.contentVersion !== "stage-title-and-roster-inheritance-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion15Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 15
    || value.contentVersion !== "stage-04-force-field-1") return undefined;
  const stageLabel = correctedStageLabel(value.stageId);
  if (!stageLabel) return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
  };
  return finalizeDirectMigration(migrated);
}

function migrateVersion14Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 14
    || value.contentVersion !== "stage-03-recovery-1") return undefined;
  const stageLabel = correctedStageLabel(value.stageId);
  if (!stageLabel) return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
  };
  return finalizeDirectMigration(migrated);
}

function migrateVersion13Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 13
    || value.contentVersion !== "stage-entry-snapshot-1") return undefined;
  const stageLabel = correctedStageLabel(value.stageId);
  if (!stageLabel) return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
  };
  return finalizeDirectMigration(migrated);
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
    stageLabel: correctedStageLabel(value.stageId),
  };
  return isCompletedSave(normalized) || isBattleSave(normalized, false, false);
}

function migrateVersion12Save(save: Version12SaveData): SaveData {
  const stageLabel = correctedStageLabel(save.stageId);
  if (!stageLabel) throw new Error(`Cannot migrate unknown stage ${save.stageId}`);
  if (save.kind === "completed") {
    return {
      ...save,
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      stageLabel,
    };
  }
  return {
    ...save,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
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
      true,
      true,
      false,
    );
}

function migrateVersion11Save(save: Version11SaveData): SaveData {
  if (save.kind === "completed" && save.stageId === "stage-02") {
    return migrateVersion12Save({
      ...save,
      version: 12,
      contentVersion: "stage-02-allied-auto-1",
      stageLabel: "下一關",
    });
  }
  return migrateVersion12Save({
    ...save,
    version: 12,
    contentVersion: "stage-02-allied-auto-1",
  });
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
    const migratedVersion25 = migrateVersion25Save(value);
    if (migratedVersion25) return migratedVersion25;
    const migratedVersion24 = migrateVersion24Save(value);
    if (migratedVersion24) return migratedVersion24;
    const migratedVersion23 = migrateVersion23Save(value);
    if (migratedVersion23) return migratedVersion23;
    const migratedVersion22 = migrateVersion22Save(value);
    if (migratedVersion22) return migratedVersion22;
    const migratedVersion21 = migrateVersion21Save(value);
    if (migratedVersion21) return migratedVersion21;
    const migratedVersion20 = migrateVersion20Save(value);
    if (migratedVersion20) return migratedVersion20;
    const migratedVersion19 = migrateVersion19Save(value);
    if (migratedVersion19) return migratedVersion19;
    const migratedVersion18 = migrateVersion18Save(value);
    if (migratedVersion18) return migratedVersion18;
    const migratedVersion17 = migrateVersion17Save(value);
    if (migratedVersion17) return migratedVersion17;
    const migratedVersion16 = migrateVersion16Save(value);
    if (migratedVersion16) return migratedVersion16;
    const migratedVersion15 = migrateVersion15Save(value);
    if (migratedVersion15) return migratedVersion15;
    const migratedVersion14 = migrateVersion14Save(value);
    if (migratedVersion14) return migratedVersion14;
    const migratedVersion13 = migrateVersion13Save(value);
    if (migratedVersion13) return migratedVersion13;
    if (isVersion12SaveData(value)) {
      const migrated = migrateVersion12Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion11SaveData(value)) {
      const migrated = migrateVersion11Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion10SaveData(value)) {
      const migrated = migrateVersion10Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion9SaveData(value)) {
      const migrated = migrateVersion9Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion8SaveData(value)) {
      const migrated = migrateVersion8Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion7SaveData(value)) {
      const migrated = migrateVersion7Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion6SaveData(value)) {
      const migrated = migrateVersion6Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (isVersion5SaveData(value)) {
      const migrated = migrateVersion5Save(value);
      return finalizeDirectMigration(migrated);
    }
    if (!isLegacySaveData(value)) return undefined;
    const migrated = migrateLegacySave(value);
    return finalizeDirectMigration(migrated);
  } catch {
    return undefined;
  }
}
