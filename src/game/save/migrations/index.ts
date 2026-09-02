import {
  classFallbackPortraitFor,
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
import {
  HALF_DRAGON_SISTER_CLASS_ID,
  HALF_DRAGON_SISTER_ENTRY_EXPERIENCE,
  HALF_DRAGON_SISTER_SLOTS,
} from "../../content/campaign-entry-experience";
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

/**
 * Saves before v73 did not preserve the native KILL_ALL presentation counters,
 * and v73 itself counted every ordinary attack instead of only the ones that
 * killed. Neither history can be reconstructed into the v74 kill semantics, so
 * both migrations adopt a zeroed baseline while all future kills are tracked
 * deterministically.
 */
function addEmptyRecordCounters(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const recordCounters = Array<number>(MAX_UNIT_SLOT + 1).fill(0);
  const stageEntrySnapshot = isRecord(value.stageEntrySnapshot)
    ? { ...value.stageEntrySnapshot, recordCounters: [...recordCounters] }
    : value.stageEntrySnapshot;
  return {
    ...value,
    recordCounters,
    ...(stageEntrySnapshot === undefined ? {} : { stageEntrySnapshot }),
  };
}

function normalizeStage22PostbattleTransition(value: unknown): unknown {
  if (!isRecord(value)
    || !Array.isArray(value.consumedEventIds)
    || !value.consumedEventIds.every((id) => typeof id === "string")) return value;
  const consumedEventIds = value.consumedEventIds as string[];
  if ((value.kind === "battle" && value.stageId === "stage-23")
    || (value.kind === "completed" && value.stageId === "stage-24")) {
    return {
      ...value,
      consumedEventIds: consumedEventIds.filter((id) => id !== "stage-23-prebattle-story"),
    };
  }
  if (value.kind !== "completed" || value.stageId !== "stage-23") return value;
  const routeIndex = consumedEventIds.indexOf("stage-22-completed-route");
  if (routeIndex < 0 || consumedEventIds.includes("stage-22-postbattle-story")) return value;
  return {
    ...value,
    consumedEventIds: [
      ...consumedEventIds.slice(0, routeIndex),
      "stage-22-postbattle-story",
      ...consumedEventIds.slice(routeIndex),
    ],
  };
}

const KINS_SLOT = 7;
const KINS_CAMPAIGN_STAGES = new Set([
  "stage-23", "stage-24", "stage-26", "stage-27", "stage-28", "stage-29", "stage-30", "stage-31", "stage-32", "stage-33", "stage-34", "stage-35", "stage-36", "stage-37", "stage-49",
]);

function restoreKinsCampaignClass(save: SaveData): SaveData {
  if (!KINS_CAMPAIGN_STAGES.has(save.stageId)) return save;

  const restoreEntry = (entry: SaveRosterEntry): SaveRosterEntry => {
    if (entry.slot !== KINS_SLOT || entry.classId !== "soldier") return entry;
    const previousMaximum = classStatsFor(entry).maxLife;
    const classId = "magic-priest" as const;
    const maximumLife = classStatsFor({ classId, experience: entry.experience }).maxLife;
    const damage = Math.max(0, previousMaximum - Math.min(entry.life, previousMaximum));
    return { ...entry, classId, life: Math.max(0, maximumLife - damage) };
  };

  const roster = save.roster.map(restoreEntry);
  if (save.kind !== "battle") return { ...save, roster };
  return {
    ...save,
    roster,
    stageEntrySnapshot: {
      ...save.stageEntrySnapshot,
      roster: save.stageEntrySnapshot.roster.map(restoreEntry),
    },
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => {
        if (unit.side !== 1 || unit.slot !== KINS_SLOT || unit.classId !== "soldier") return unit;
        const restored = restoreEntry(unit);
        return {
          ...unit,
          classId: restored.classId,
          className: className(restored.classId),
          life: restored.life,
        };
      }),
    },
  };
}

const STAGE27_DEFENDER_SLOT = 22;
const STAGE27_DEFENDER_CLASS = "great-axe-warrior" as const;
const POST_STAGE27_CAMPAIGN_STAGES = new Set(["stage-28", "stage-29", "stage-30", "stage-31", "stage-32", "stage-33", "stage-34", "stage-35", "stage-36", "stage-37", "stage-49"]);

/** Stage 27 necessarily commits its fixed slot-22 class before any later-stage entry. */
function restoreStage27DefenderClass(save: SaveData): SaveData {
  if (!POST_STAGE27_CAMPAIGN_STAGES.has(save.stageId)) return save;

  const restoreEntry = (entry: SaveRosterEntry): SaveRosterEntry => {
    if (entry.slot !== STAGE27_DEFENDER_SLOT || entry.classId !== "soldier") return entry;
    const previousMaximum = classStatsFor(entry).maxLife;
    const maximumLife = classStatsFor({
      classId: STAGE27_DEFENDER_CLASS,
      experience: entry.experience,
    }).maxLife;
    const damage = Math.max(0, previousMaximum - Math.min(entry.life, previousMaximum));
    return {
      ...entry,
      classId: STAGE27_DEFENDER_CLASS,
      life: Math.max(0, maximumLife - damage),
    };
  };

  const roster = save.roster.map(restoreEntry);
  if (save.kind !== "battle") return { ...save, roster };
  return {
    ...save,
    roster,
    stageEntrySnapshot: {
      ...save.stageEntrySnapshot,
      roster: save.stageEntrySnapshot.roster.map(restoreEntry),
    },
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => {
        if (unit.side !== 1
          || unit.slot !== STAGE27_DEFENDER_SLOT
          || unit.classId !== "soldier") return unit;
        const restored = restoreEntry(unit);
        return {
          ...unit,
          classId: restored.classId,
          className: className(restored.classId),
          name: className(restored.classId),
          life: restored.life,
        };
      }),
    },
  };
}

/** REMAKE-070 preserves Eliola's actor name while retaining her class portrait. */
function restoreStage29EliolaDisplayIdentity(save: SaveData): SaveData {
  if (save.kind !== "battle" || save.stageId !== "stage-29") return save;
  return {
    ...save,
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => unit.side === 1 && unit.slot === 22
        ? {
            ...unit,
            name: "愛莉歐拉",
            displayIdentity: "named-class-portrait" as const,
          }
        : unit),
    },
  };
}

function addStage29EliolaDisplayIdentity(value: unknown): unknown {
  if (!isRecord(value)
    || value.kind !== "battle"
    || value.stageId !== "stage-29"
    || !isRecord(value.battle)
    || !Array.isArray(value.battle.units)) return value;
  return {
    ...value,
    battle: {
      ...value.battle,
      units: value.battle.units.map((unit) => isRecord(unit)
        && unit.side === 1
        && unit.slot === 22
        ? {
            ...unit,
            name: "愛莉歐拉",
            displayIdentity: "named-class-portrait",
          }
        : unit),
    },
  };
}

/** REMAKE-120 applies the same named/class-portrait split to stage 27's fixed defender. */
function addStage27EliolaDisplayIdentity(value: unknown): unknown {
  if (!isRecord(value)
    || value.kind !== "battle"
    || value.stageId !== "stage-27"
    || !isRecord(value.battle)
    || !Array.isArray(value.battle.units)) return value;
  return {
    ...value,
    battle: {
      ...value.battle,
      units: value.battle.units.map((unit) => isRecord(unit)
        && unit.id === "1:22"
        && unit.side === 1
        && unit.slot === 22
        ? {
            ...unit,
            name: "愛莉歐拉",
            displayIdentity: "named-class-portrait",
          }
        : unit),
    },
  };
}

function finalizeDirectMigration(value: unknown): SaveData | undefined {
  if (isRecord(value)
    && (value.stageId === "stage-49"
      || (value.kind === "battle" && value.stageId === "stage-37"))) return undefined;
  const normalized = normalizeStage22PostbattleTransition(
    addEmptyRecordCounters(addEmptyTerrainOverrides(value)),
  );
  if (!isSaveData(normalized)) return undefined;
  const restored = restoreGadirathClassFromEntrySnapshot(normalized);
  const restoredKins = restoreKinsCampaignClass(restored);
  const restoredStage27Defender = restoreStage27DefenderClass(restoredKins);
  const restoredEliola = restoreStage29EliolaDisplayIdentity(restoredStage27Defender);
  return isSaveData(restoredEliola) ? restoredEliola : undefined;
}

function migrateVersion71Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 71
    || value.contentVersion !== "stage-37-ultimate-goddess-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    ...(value.kind === "battle"
      && value.stageId === "stage-37"
      && isRecord(value.battle)
      && Array.isArray(value.battle.units)
      ? {
          battle: {
            ...value.battle,
            units: value.battle.units.map((unit) => isRecord(unit)
              && unit.side === 2
              && (unit.classId === "head" || unit.classId === "hand")
              ? { ...unit, portrait: 8 }
              : unit),
          },
        }
      : {}),
  };
  const withRecordCounters = addEmptyRecordCounters(migrated);
  return isSaveData(withRecordCounters) ? withRecordCounters : undefined;
}

/**
 * REMAKE-110 caps every stage at 99 full rounds. The cap is derived from the
 * round counter alone, so no field is added and none changes meaning — a v86
 * save resumes with the same units, statuses and PRNG cursor, and simply has a
 * finite number of rounds left.
 *
 * The one case that cannot carry over is a v86 battle saved past round 99.
 * `isSaveData` now bounds the round to the cap, so those return `undefined`
 * rather than being rewritten: clamping the counter to 99 would drop the player
 * one round short of a defeat their run never actually earned, and there is no
 * honest smaller number to pick either. Re-entering the stage from its
 * prebattle route rebuilds it at round 1. Reaching round 100 at all took
 * deliberate stalling, so this rejects nothing a normal run can produce.
 */
/**
 * REMAKE-109 moved stage 3's "the rescued fourth corps can promote" moment out
 * of the entry baseline and into two opening events: `stage-03-player-ready`
 * hands the board to the player, and `stage-03-fourth-corps-joined` awards the
 * trio the single experience point that puts them on the soldier threshold.
 * Both run before the player may act, so every stage-3 battle save and every
 * stage-4 completion now carries their ids.
 *
 * Legacy saves predate the ids, so they are backfilled rather than replayed.
 * Marking them consumed is the honest reading of an older run: its board was
 * built before the rule existed, so its trio never received the point, while
 * firing the grant on load would hand out a promotion that run never reached.
 * Re-entering stage 3 from its prebattle route replays both events normally.
 *
 * This runs on the raw legacy value ahead of the version chain, so the direct
 * migrations and the per-version ones pick it up alike. Nothing else changes:
 * the trio still enters on the native 299 named-actor floor.
 */
function normalizeStage3OpeningEvents(value: unknown): unknown {
  if (!isRecord(value)
    || !Array.isArray(value.consumedEventIds)
    || !value.consumedEventIds.every((id) => typeof id === "string")) return value;
  const carriesStage3Opening = (value.kind === "battle" && value.stageId === "stage-03")
    || (value.kind === "completed" && value.stageId === "stage-04");
  if (!carriesStage3Opening) return value;
  const consumedEventIds = value.consumedEventIds as string[];
  const storyIndex = consumedEventIds.indexOf("stage-03-opening-story");
  if (storyIndex < 0) return value;
  const missing = ["stage-03-player-ready", "stage-03-fourth-corps-joined"]
    .filter((id) => !consumedEventIds.includes(id));
  if (missing.length === 0) return value;
  return {
    ...value,
    consumedEventIds: [
      ...consumedEventIds.slice(0, storyIndex + 1),
      ...missing,
      ...consumedEventIds.slice(storyIndex + 1),
    ],
  };
}

/**
 * REMAKE-120 restores Eliola's descriptor name in stage 27 while retaining
 * the saved class portrait. The raw identity normalizer runs before every
 * legacy migration, so older stage-27 battle saves receive the same repair.
 */
function migrateVersion92Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 92
    || value.contentVersion !== "stage-33-named-enemies-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-124 changes only future poison application and round ticks. Existing
 * statuses, life, counters, action state, and PRNG cursors keep their exact
 * stored meaning, so every legal v93 save migrates without rewriting battle
 * state; its next poison tick uses the new stableRemake rule.
 */
function migrateVersion93Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 93
    || value.contentVersion !== "stage-27-eliola-display-name-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-125 changes only experience earned by future lethal stomp actions.
 * No pending technique resolution is persisted, so legal v94 saves migrate
 * losslessly and use the repaired reward on their next committed stomp.
 */
function migrateVersion94Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 94
    || value.contentVersion !== "boss-poison-one-third-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/** REMAKE-126 gives v95 the historical identity; REMAKE-129's shared repair
 * below now removes the old seed only from lawless stage-3 battles. */
function migrateVersion95Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 95
    || value.contentVersion !== "stomp-kill-experience-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * v96/v97 stage-3 battles were created while every difficulty used the native
 * zero-experience exception. REMAKE-129 restores the shared seed on the first
 * three settings, preserving earned experience and absolute damage.
 */
function restoreStage3DifficultySeedOutsideLawless(
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (value.kind !== "battle" || value.stageId !== "stage-03") return value;
  const difficulty = value.difficulty;
  if (!isDifficulty(difficulty)) return undefined;
  if (difficulty === 3) return value;
  if (!isRecord(value.battle) || !Array.isArray(value.battle.units)) return undefined;

  let validPreviousEnemies = true;
  const units = value.battle.units.map((unit) => {
    if (!isRecord(unit) || unit.side !== 2) return unit;
    if (!isClassId(unit.classId)
      || !isIntegerBetween(unit.experience, 0, MAX_EXPERIENCE)
      || !isIntegerBetween(unit.life, 0, MAX_LIFE)) {
      validPreviousEnemies = false;
      return unit;
    }
    const previousMaximumLife = statsFor({
      side: 2,
      classId: unit.classId,
      experience: unit.experience,
    }, difficulty).maxLife;
    const seededExperience = initialEnemyExperience(unit.classId, difficulty);
    if (unit.life > previousMaximumLife
      || unit.experience > MAX_EXPERIENCE - seededExperience) {
      validPreviousEnemies = false;
      return unit;
    }
    const experience = unit.experience + seededExperience;
    const maximumLife = statsFor({
      side: 2,
      classId: unit.classId,
      experience,
    }, difficulty).maxLife;
    const damage = previousMaximumLife - unit.life;
    return {
      ...unit,
      experience,
      life: unit.life === 0 ? 0 : Math.max(1, maximumLife - damage),
    };
  });
  if (!validPreviousEnemies) return undefined;
  return {
    ...value,
    battle: { ...value.battle, units },
  };
}

/** REMAKE-129 restores normal stage-3 seeding outside lawless difficulty. */
function migrateVersion97Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 97
    || value.contentVersion !== "lightning-tier-experience-1") return undefined;
  const restored = restoreStage3DifficultySeedOutsideLawless(value);
  if (!restored) return undefined;
  const migrated = {
    ...restored,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-130 restores the native stage-4 waves for future round transitions.
 * A v98 player-phase save has no pending presentation or persisted wave
 * counter, so its exact board, round, action state, statuses and PRNG cursor
 * carry forward. Already missed historical waves are not invented on load;
 * the next native scheduled round creates reinforcements normally.
 */
function migrateVersion98Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 98
    || value.contentVersion !== "stage-03-lawless-enemy-level-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-131 changes only how a future group command chooses its cohesion
 * anchor. No transient leader selection or automatic-action plan is persisted,
 * so v99 battle/completed saves carry forward byte-for-byte apart from identity.
 */
function migrateVersion99Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 99
    || value.contentVersion !== "stage-04-native-reinforcements-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-132 changes only how an unsubmitted follow-leader move is planned.
 * The temporary anchor and automatic-action queue are not persisted, so a v100
 * battle/completed save carries forward unchanged apart from its rule identity.
 */
function migrateVersion100Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 100
    || value.contentVersion !== "follow-leader-spent-anchor-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-134 changes only how an unsubmitted follow-leader action is planned.
 * The temporary anchor and automatic-action queue are not persisted, so a v101
 * battle/completed save carries forward unchanged apart from its rule identity.
 */
function migrateVersion101Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 101
    || value.contentVersion !== "follow-leader-path-route-cost-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-136 only changes how stage 9's escort plans her own move: legs now
 * complete inside valley rectangles and the landing follows an ideal route to
 * the current goal. The plan is recomputed from public state on every action,
 * so v103 battle/completed saves retain every stored field.
 */
function migrateVersion103Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 103
    || value.contentVersion !== "follow-leader-post-move-shooting-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-135 restores the native shooting-class continuation after a future
 * follow-leader move. The temporary anchor and automatic-action queue are not
 * persisted, so v102 battle/completed saves retain every stored field.
 */
function migrateVersion102Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 102
    || value.contentVersion !== "follow-leader-player-cohesion-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-128 restores the tier roll made by every future lightning cast, while
 * REMAKE-129 also repairs the stage-3 baseline inherited from v96.
 */
function migrateVersion96Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 96
    || value.contentVersion !== "stage-03-native-enemy-level-1") return undefined;
  const restored = restoreStage3DifficultySeedOutsideLawless(value);
  if (!restored) return undefined;
  const migrated = {
    ...restored,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * Every pre-v96 stage-3 battle used the shared difficulty seed. Only lawless
 * now removes that synthetic baseline; the first three settings keep it. This
 * preserves earned experience and carries absolute damage to the lower cap.
 */
function removeLegacyStage3DifficultySeed(save: SaveData): SaveData | undefined {
  if (save.kind !== "battle" || save.stageId !== "stage-03" || save.difficulty !== 3) return save;

  let validLegacyEnemies = true;
  const units = save.battle.units.map((unit) => {
    if (unit.side !== 2) return unit;
    const seededExperience = initialEnemyExperience(unit.classId, save.difficulty);
    if (unit.experience < seededExperience) {
      validLegacyEnemies = false;
      return unit;
    }
    const previousMaximumLife = statsFor(unit, save.difficulty).maxLife;
    const experience = unit.experience - seededExperience;
    const maximumLife = statsFor({ ...unit, experience }, save.difficulty).maxLife;
    const damage = previousMaximumLife - unit.life;
    return {
      ...unit,
      experience,
      life: unit.life === 0 ? 0 : Math.max(1, maximumLife - damage),
    };
  });
  if (!validLegacyEnemies) return undefined;
  const corrected: SaveData = {
    ...save,
    battle: { ...save.battle, units },
  };
  return isSaveData(corrected) ? corrected : undefined;
}

/**
 * REMAKE-119 restores the two character descriptors that the first stage-33
 * runtime generator dropped. Existing v91 battle saves already contain the
 * right unit slots, classes, positions, and combat state, so only their
 * display identities need repair. The named-leader landing rule is replanned
 * from public state and stores no pending action.
 */
function migrateVersion91Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 91
    || value.contentVersion !== "named-leader-line-hold-1") return undefined;
  const battle = value.kind === "battle"
    && value.stageId === "stage-33"
    && isRecord(value.battle)
    && Array.isArray(value.battle.units)
    ? {
        ...value.battle,
        units: value.battle.units.map((unit) => {
          if (!isRecord(unit) || unit.side !== 2) return unit;
          if (unit.id === "2:23" && unit.slot === 23) {
            return { ...unit, name: "阿莉絲", portrait: 30 };
          }
          if (unit.id === "2:24" && unit.slot === 24) {
            return { ...unit, name: "瑪西爾", portrait: 31 };
          }
          return unit;
        }),
      }
    : value.battle;
  const migrated = {
    ...value,
    ...(battle === undefined ? {} : { battle }),
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-118 gives a named side-2 leader its move-then-attack back and bounds
 * where it may land instead. Both halves are replanned from public battle
 * state every phase and neither is stored, so a v90 save carries over as it
 * stands and the next automatic plan simply uses the new boundary.
 */
function migrateVersion90Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 90
    || value.contentVersion !== "expert-attack-down-melee-targeting-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-111 only changes how stage 3's fourth corps plans its own phase. That
 * plan is recomputed from public battle state every round and never saved, so a
 * v88 save carries over as it stands: the corps simply holds its ground from
 * the next automatic phase on. No field is added and none changes meaning.
 */
/**
 * REMAKE-116 only narrows which enemy the AI may pick for `SA`. Like
 * REMAKE-102 on the buff side it adds no field and changes no stored meaning;
 * an uncommitted automatic action is replanned from public state on load.
 */
function migrateVersion89Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 89
    || value.contentVersion !== "fourth-corps-rally-hold-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

function migrateVersion88Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 88
    || value.contentVersion !== "stage-3-fourth-corps-joined-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * The two stage-3 opening events are the only difference, and
 * `normalizeStage3OpeningEvents` has already backfilled them, so a v87 save
 * carries over as it stands. No field is added and none changes meaning.
 */
function migrateVersion87Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 87
    || value.contentVersion !== "stage-round-limit-99-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

function migrateVersion86Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 86
    || value.contentVersion !== "stage-3-fourth-corps-promotion-ready-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-109 raises the untouched entry experience of stage 3's three named
 * fourth-corps NPCs from 299 to the soldier promotion threshold of 300. That is
 * an *entry* baseline: it is read while the stage builds its board, so a v85
 * save already holding a stage-3 battle keeps the 299 it was created with.
 *
 * Nothing is rewritten here on purpose. Bumping those three mid-battle would
 * hand the player a promotion they never earned in that run, and every other
 * path — a completed stage-2 save routing into stage 3, or a failed retry
 * rebuilding from the entry snapshot — constructs the board fresh and picks up
 * 300 on its own. No field is added and none changes meaning, so completed
 * saves and battles in every stage carry over unchanged.
 */
function migrateVersion85Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 85
    || value.contentVersion !== "stage-2-3-generic-ally-swap-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-108 swaps which campaign slots garrison stages 2 and 3: the grown
 * slots 40–43 move to Himi's stage-3 rescue party and the fresh slots 51–54
 * take their stage-2 places. Every other stage, the campaign roster and the
 * completed-save shape are untouched, so those carry over unchanged.
 *
 * A v84 battle save sitting inside stage 2 or stage 3 still holds the old slot
 * set on its board. There is no honest remap: rewriting `1:40` to `1:54`
 * mid-battle would silently move the player's accumulated growth into a slot
 * that never appears again, and the reverse would invent growth that was never
 * earned. `isSaveData` therefore refuses those two, and the whole migration
 * returns undefined — the same deliberate rejection `migrateVersion82Save`
 * uses. Re-entering the stage from its prebattle route rebuilds it correctly.
 */
function migrateVersion84Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 84
    || value.contentVersion !== "control-zone-occupied-gap-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-105 restores the native `FFh` reservation: an occupied neighbour of an
 * opposing unit is no longer a terminal cell, so both sides may again propagate
 * through a unit standing beside its opponent. No field is added and none
 * changes meaning — a v83 save resumes with the same units, statuses and PRNG
 * cursor. Only the movement range offered from the current board differs, and
 * that range is recomputed on load rather than stored.
 */
function migrateVersion83Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 83
    || value.contentVersion !== "enemy-difficulty-scaling-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-103 changes what a stored enemy experience value means: difficulties 1
 * and 2 now seed side-2 units on growth rows 4 and 6 under the linear curve
 * instead of rows 3 and 4 under the native one. No field is added and no ally
 * value changes, so difficulty 0 and 3 saves — whose enemy baselines are byte
 * identical to the native ones — carry over untouched.
 *
 * A difficulty 1 or 2 v82 save still holds the old, now sub-baseline enemy
 * experience, so `isSaveData` refuses it and the whole migration returns
 * undefined. That is the intended outcome rather than a silent re-seed: the
 * project is pre-release, and rewriting a mid-battle enemy's level would change
 * a live fight underneath the player.
 */
function migrateVersion82Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 82
    || value.contentVersion !== "expert-attack-up-melee-targeting-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-102 only narrows which ally the shared expert planner may pick for AA.
 * No stored field is added or changes meaning and the cast still draws once, so
 * the migration is lossless; a mid-battle v81 save resumes with the same units,
 * statuses and PRNG cursor, and only its unsubmitted AI plans differ.
 */
function migrateVersion81Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 81
    || value.contentVersion !== "tier4-melee-traits-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-097/098/099/100 add no saved fields — a unit still stores only class,
 * experience, life and the eight status counters. What changes is how those are
 * consumed: the demon dragon knight clears buff counters on an active hit, the
 * bone knight's counter and the swift dragon knight's shot immunity stop drawing
 * from the PRNG, and the magic armor warrior mitigates by missing life.
 *
 * Dropping those two draws is why this needs a version at all: a v80 battle
 * saved mid-fight would resume against a different PRNG call sequence. The
 * stored fields carry over untouched and no stored value changes meaning, so the
 * migration is lossless; only unresolved future rolls differ.
 */
function migrateVersion80Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 80
    || value.contentVersion !== "ice-cardinal-radial-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-096 narrows the radial push back to the native four directions. Like
 * REMAKE-095 it only changes which cell a target lands on, so a v79 save carries
 * over untouched.
 */
function migrateVersion79Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 79
    || value.contentVersion !== "ice-radial-displacement-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-095 only changes which cell an ice target is pushed to; nothing about a
 * stored unit changes meaning, so a v78 save carries over untouched and the next
 * cast simply uses the radial direction.
 */
function migrateVersion78Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 78
    || value.contentVersion !== "ice-freeze-on-landing-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-094 only narrows which ice targets receive the freeze bit. The bit
 * itself is an existing saved field and no in-flight state changes meaning, so a
 * v77 save carries over untouched; the next cast simply uses the landing gate.
 */
function migrateVersion77Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 77
    || value.contentVersion !== "half-dragon-curve-water-warrior-shot-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-092/093 add no saved fields: a unit still stores only its class and
 * experience. What changes is what those two derive — the half-dragon curve now
 * continues past the third row, and side-1 water warriors gain a shot. The
 * version moves so a v76 save is re-validated against the new ceilings rather
 * than silently reinterpreted, and so the sister entry baseline gets applied.
 */
function migrateVersion76Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 76
    || value.contentVersion !== "force-follower-engage-first-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-091 only changes how a paired formation follower plans; like v74 it
 * adds no simulation state, so a v75 save carries over untouched.
 */
function migrateVersion75Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 75
    || value.contentVersion !== "expert-named-leader-caution-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

/**
 * REMAKE-090 only changes how side-2 named leaders plan; no simulation state
 * is added, removed or reinterpreted, so a v74 save carries over untouched and
 * the next automatic plan simply uses the new pursuit boundary.
 */
function migrateVersion74Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 74
    || value.contentVersion !== "stage-49-ending-kill-records-1") return undefined;
  const migrated = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  return isSaveData(migrated) ? migrated : undefined;
}

function migrateVersion73Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 73
    || value.contentVersion !== "stage-49-ending-records-1") return undefined;
  const migrated = addEmptyRecordCounters({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
  return isSaveData(migrated) ? migrated : undefined;
}

function migrateVersion72Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 72
    || value.contentVersion !== "stage-37-ice-last-portrait-1") return undefined;
  const migrated = addEmptyRecordCounters({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
  return isSaveData(migrated) ? migrated : undefined;
}

function migrateVersion70Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 70
    || value.contentVersion !== "expert-control-targeting-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion69Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 69
    || value.contentVersion !== "expert-target-priority-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion68Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 68
    || value.contentVersion !== "expert-focus-fire-ai-3") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion67Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 67
    || value.contentVersion !== "expert-focus-fire-ai-2") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion66Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 66
    || value.contentVersion !== "expert-focus-fire-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion65Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 65
    || value.contentVersion !== "stage-36-bina-vige-otherworld-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion64Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 64
    || value.contentVersion !== "stage-35-time-space-anomaly-1"
    // v64 could route a completed stage-35 save to stage 36, but never shipped
    // a stage-36 battle runtime, a stage-37 boundary, or their save contracts.
    || value.stageId === "stage-37"
    || (value.kind === "battle" && value.stageId === "stage-36")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion63Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 63
    || value.contentVersion !== "stage-34-lannal-castle-interior-1"
    // v63 could route a completed stage-34 save to stage 35, but never shipped
    // a stage-35 battle runtime, a stage-36 boundary, or their save contracts.
    || value.stageId === "stage-36"
    || (value.kind === "battle" && value.stageId === "stage-35")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion62Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 62
    || value.contentVersion !== "stage-33-lannal-castle-outskirts-1"
    // v62 could route a completed stage-33 save to stage 34, but never shipped
    // a stage-34 battle runtime, a stage-35 boundary, or their save contracts.
    || value.stageId === "stage-35"
    || (value.kind === "battle" && value.stageId === "stage-34")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion61Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 61
    || value.contentVersion !== "stage-32-sterling-strait-alliance-1"
    // v61 could route a completed stage-32 save to stage 33, but never shipped
    // a stage-33 battle runtime, a stage-34 boundary, or their save contracts.
    || value.stageId === "stage-34"
    || (value.kind === "battle" && value.stageId === "stage-33")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion60Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 60
    || value.contentVersion !== "stage-31-sterling-strait-ambush-1"
    // v60 could route a completed stage-31 save to stage 32, but never shipped
    // a stage-32 battle runtime, a stage-33 boundary, or their save contracts.
    || value.stageId === "stage-33"
    || (value.kind === "battle" && value.stageId === "stage-32")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion59Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 59
    || value.contentVersion !== "stage-30-vesta-fixed-portrait-1"
    // v59 could route a completed stage-30 save to stage 31, but never shipped
    // a stage-31 battle runtime, a stage-32 boundary, or their save contracts.
    || value.stageId === "stage-32"
    || (value.kind === "battle" && value.stageId === "stage-31")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

/** M57-FB-01 replaces v58's mistaken profession portrait with Vesta's D/41 actor portrait. */
function migrateVersion58Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 58
    || value.contentVersion !== "stage-30-empress-purification-1") return undefined;
  let migrated: Record<string, unknown> = {
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  };
  if (value.kind === "battle" && value.stageId === "stage-30") {
    if (!isRecord(value.battle) || !Array.isArray(value.battle.units)) return undefined;
    const vestaUnits = value.battle.units.filter((unit) => isRecord(unit)
      && unit.side === 2
      && unit.slot === 27);
    if (vestaUnits.length === 0 || vestaUnits.some((unit) => !isRecord(unit)
      || !isClassId(unit.classId)
      || unit.name !== "維絲塔"
      || unit.displayIdentity !== "named-class-portrait"
      || unit.portrait !== classFallbackPortraitFor(unit.classId, 2))) return undefined;
    migrated = {
      ...migrated,
      battle: {
        ...value.battle,
        units: value.battle.units.map((unit) => {
          if (!isRecord(unit) || unit.side !== 2 || unit.slot !== 27) return unit;
          const { displayIdentity: _legacyIdentity, ...rest } = unit;
          return { ...rest, portrait: 41 };
        }),
      },
    };
  }
  return finalizeDirectMigration(migrated);
}

function migrateVersion57Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 57
    || value.contentVersion !== "stage-29-eliola-display-name-1"
    // v57 could route a completed stage-29 save here, but never shipped a
    // stage-30 battle runtime or a stable mid-form save contract.
    || (value.kind === "battle" && value.stageId === "stage-30")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion56Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 56
    || value.contentVersion !== "stage-29-knight-castle-front-1") return undefined;
  return finalizeDirectMigration(addStage29EliolaDisplayIdentity({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  }));
}

function migrateVersion55Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 55
    || value.contentVersion !== "stage-28-valkyrie-defense-1"
    // v55 could route a completed stage-28 save to this id, but never shipped a stage-29 battle.
    || (value.kind === "battle" && value.stageId === "stage-29")) return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion54Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 54
    || value.contentVersion !== "stage-27-first-round-sentry-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion53Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 53
    || value.contentVersion !== "class-role-ranged-tactics-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion52Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 52
    || value.contentVersion !== "expert-approach-caster-positioning-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion51Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 51
    || value.contentVersion !== "stage-27-valkyrie-return-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion50Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 50
    || value.contentVersion !== "stage-26-column-push-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion49Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 49
    || value.contentVersion !== "stage-23-campaign-class-baseline-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion48Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 48
    || value.contentVersion !== "stage-24-castle-approach-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion47Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 47
    || value.contentVersion !== "expert-path-distance-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion46Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 46
    || value.contentVersion !== "stage-23-death-valley-breakthrough-2") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion45Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 45
    || value.contentVersion !== "stage-23-death-valley-breakthrough-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion44Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 44
    || value.contentVersion !== "stage-22-village-ambush-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion43Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 43
    || value.contentVersion !== "stage-21-scout-interlude-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion42Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 42
    || value.contentVersion !== "stage-20-dragon-wd-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion41Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 41
    || value.contentVersion !== "stage-19-dragon-tower-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion40Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 40
    || value.contentVersion !== "stage-18-dragon-tower-li-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion39Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 39
    || value.contentVersion !== "stage-17-dragon-tower-qian-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion38Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 38
    || value.contentVersion !== "stage-16-dragon-tower-sha-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion37Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 37
    || value.contentVersion !== "stage-15-dragon-tower-lan-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion36Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 36
    || value.contentVersion !== "stage-14-dragon-tower-fang-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion35Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 35
    || value.contentVersion !== "stage-13-dragon-tower-marsiel-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion34Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 34
    || value.contentVersion !== "stage-12-swamp-water-warriors-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion33Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 33
    || value.contentVersion !== "stage-10-airship-pursuit-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion32Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 32
    || value.contentVersion !== "stage-11-ranger-reinforcements-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion31Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 31
    || value.contentVersion !== "stage-11-ranger-evacuation-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion30Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 30
    || value.contentVersion !== "stage-09-death-valley-1") return undefined;
  const stageLabel = value.kind === "completed"
    && value.stageId === "stage-11"
    && value.stageLabel === "飛船上遭遇敵人"
    ? "拯救蘇蘭達"
    : value.stageLabel;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
  });
}

function migrateVersion29Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 29
    || value.contentVersion !== "stage8-all-player-control-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion28Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 28
    || value.contentVersion !== "shared-automatic-expert-ai-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion27Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 27
    || value.contentVersion !== "ice-counterplay-wizard-focus-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
}

function migrateVersion26Save(value: unknown): SaveData | undefined {
  if (!isRecord(value)
    || value.version !== 26
    || value.contentVersion !== "directed-magic-arrow-1") return undefined;
  return finalizeDirectMigration({
    ...value,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
  });
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
      recordCounters: Array<number>(MAX_UNIT_SLOT + 1).fill(0),
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
      recordCounters: Array<number>(MAX_UNIT_SLOT + 1).fill(0),
    };
  }
  return {
    ...save,
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageLabel,
    recordCounters: Array<number>(MAX_UNIT_SLOT + 1).fill(0),
    // v12 did not retain an earlier immutable baseline. Adopt its current
    // campaign state once; gains made after migration will then roll back.
    stageEntrySnapshot: {
      stageId: save.stageId,
      ruleset: save.ruleset,
      difficulty: save.difficulty,
      roster: save.roster.map((entry) => ({ ...entry })),
      rngState: save.rngState,
      rngCalls: save.rngCalls,
      recordCounters: Array<number>(MAX_UNIT_SLOT + 1).fill(0),
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

/**
 * REMAKE-092 replaces the sisters' entry baseline, so a save written before it
 * can still hold a sister parked on the old class-0 soldier number. Raising her
 * to the entry threshold on migration keeps an in-flight campaign consistent
 * with a fresh one; a sister who already earned more than the threshold keeps
 * every point of it, and the pass never lowers anyone.
 */
function raiseHalfDragonSisterEntryExperience(save: SaveData): SaveData {
  const belowEntry = (entry: Pick<SaveRosterEntry, "slot" | "classId" | "experience">): boolean =>
    HALF_DRAGON_SISTER_SLOTS.includes(entry.slot)
    && entry.classId === HALF_DRAGON_SISTER_CLASS_ID
    && entry.experience < HALF_DRAGON_SISTER_ENTRY_EXPERIENCE;
  const raiseEntry = (entry: SaveRosterEntry): SaveRosterEntry => {
    if (!belowEntry(entry)) return entry;
    // Carry the accumulated damage across rather than the raw life value, so a
    // wounded sister stays wounded by the same amount at her new ceiling.
    const damage = Math.max(0, classStatsFor(entry).maxLife - Math.min(entry.life, classStatsFor(entry).maxLife));
    const experience = HALF_DRAGON_SISTER_ENTRY_EXPERIENCE;
    const maximumLife = classStatsFor({ classId: entry.classId, experience }).maxLife;
    return { ...entry, experience, life: Math.max(1, maximumLife - damage) };
  };
  const roster = save.roster.map(raiseEntry);
  if (save.kind !== "battle") return { ...save, roster };
  return {
    ...save,
    roster,
    stageEntrySnapshot: {
      ...save.stageEntrySnapshot,
      roster: save.stageEntrySnapshot.roster.map(raiseEntry),
    },
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => {
        if (unit.side !== 1 || !belowEntry(unit)) return unit;
        const raised = raiseEntry(unit);
        return { ...unit, experience: raised.experience, life: raised.life };
      }),
    },
  };
}

export function parseSaveData(raw: string): SaveData | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    // A save already at the current version is returned untouched: its sisters
    // entered at the threshold, and experience never decreases.
    if (isSaveData(value)) return value;
    const migratedVersion103 = migrateVersion103Save(value);
    if (migratedVersion103) return migratedVersion103;
    const migratedVersion102 = migrateVersion102Save(value);
    if (migratedVersion102) return migratedVersion102;
    const migratedVersion101 = migrateVersion101Save(value);
    if (migratedVersion101) return migratedVersion101;
    const migratedVersion100 = migrateVersion100Save(value);
    if (migratedVersion100) return migratedVersion100;
    const migratedVersion99 = migrateVersion99Save(value);
    if (migratedVersion99) return migratedVersion99;
    const migratedVersion98 = migrateVersion98Save(value);
    if (migratedVersion98) return migratedVersion98;
    const migratedVersion97 = migrateVersion97Save(value);
    if (migratedVersion97) return migratedVersion97;
    // v96/v97 used the all-difficulty level-one baseline; both bypass the
    // pre-v96 lawless seed-removal repair after their own inverse migration.
    const migratedVersion96 = migrateVersion96Save(value);
    if (migratedVersion96) return migratedVersion96;
    const migrated = migrateLegacySaveData(value);
    const corrected = migrated ? removeLegacyStage3DifficultySeed(migrated) : undefined;
    return corrected ? raiseHalfDragonSisterEntryExperience(corrected) : undefined;
  } catch {
    return undefined;
  }
}

function migrateLegacySaveData(raw: unknown): SaveData | undefined {
  const value = addStage27EliolaDisplayIdentity(normalizeStage3OpeningEvents(raw));
  const migratedVersion95 = migrateVersion95Save(value);
  if (migratedVersion95) return migratedVersion95;
  const migratedVersion94 = migrateVersion94Save(value);
  if (migratedVersion94) return migratedVersion94;
  const migratedVersion93 = migrateVersion93Save(value);
  if (migratedVersion93) return migratedVersion93;
  const migratedVersion92 = migrateVersion92Save(value);
  if (migratedVersion92) return migratedVersion92;
  const migratedVersion91 = migrateVersion91Save(value);
  if (migratedVersion91) return migratedVersion91;
  const migratedVersion90 = migrateVersion90Save(value);
  if (migratedVersion90) return migratedVersion90;
  const migratedVersion89 = migrateVersion89Save(value);
  if (migratedVersion89) return migratedVersion89;
  const migratedVersion88 = migrateVersion88Save(value);
  if (migratedVersion88) return migratedVersion88;
  const migratedVersion87 = migrateVersion87Save(value);
  if (migratedVersion87) return migratedVersion87;
  const migratedVersion86 = migrateVersion86Save(value);
  if (migratedVersion86) return migratedVersion86;
  const migratedVersion85 = migrateVersion85Save(value);
  if (migratedVersion85) return migratedVersion85;
  const migratedVersion84 = migrateVersion84Save(value);
  if (migratedVersion84) return migratedVersion84;
  const migratedVersion83 = migrateVersion83Save(value);
  if (migratedVersion83) return migratedVersion83;
  const migratedVersion82 = migrateVersion82Save(value);
  if (migratedVersion82) return migratedVersion82;
  const migratedVersion81 = migrateVersion81Save(value);
  if (migratedVersion81) return migratedVersion81;
  const migratedVersion80 = migrateVersion80Save(value);
  if (migratedVersion80) return migratedVersion80;
  const migratedVersion79 = migrateVersion79Save(value);
  if (migratedVersion79) return migratedVersion79;
  const migratedVersion78 = migrateVersion78Save(value);
  if (migratedVersion78) return migratedVersion78;
  const migratedVersion77 = migrateVersion77Save(value);
  if (migratedVersion77) return migratedVersion77;
  const migratedVersion76 = migrateVersion76Save(value);
  if (migratedVersion76) return migratedVersion76;
  const migratedVersion75 = migrateVersion75Save(value);
  if (migratedVersion75) return migratedVersion75;
  const migratedVersion74 = migrateVersion74Save(value);
  if (migratedVersion74) return migratedVersion74;
  const migratedVersion73 = migrateVersion73Save(value);
  if (migratedVersion73) return migratedVersion73;
  const migratedVersion72 = migrateVersion72Save(value);
  if (migratedVersion72) return migratedVersion72;
  const migratedVersion71 = migrateVersion71Save(value);
  if (migratedVersion71) return migratedVersion71;
  const migratedVersion70 = migrateVersion70Save(value);
  if (migratedVersion70) return migratedVersion70;
  const migratedVersion69 = migrateVersion69Save(value);
  if (migratedVersion69) return migratedVersion69;
  const migratedVersion68 = migrateVersion68Save(value);
  if (migratedVersion68) return migratedVersion68;
  const migratedVersion67 = migrateVersion67Save(value);
  if (migratedVersion67) return migratedVersion67;
  const migratedVersion66 = migrateVersion66Save(value);
  if (migratedVersion66) return migratedVersion66;
  const migratedVersion65 = migrateVersion65Save(value);
  if (migratedVersion65) return migratedVersion65;
  const migratedVersion64 = migrateVersion64Save(value);
  if (migratedVersion64) return migratedVersion64;
  const migratedVersion63 = migrateVersion63Save(value);
  if (migratedVersion63) return migratedVersion63;
  const migratedVersion62 = migrateVersion62Save(value);
  if (migratedVersion62) return migratedVersion62;
  const migratedVersion61 = migrateVersion61Save(value);
  if (migratedVersion61) return migratedVersion61;
  const migratedVersion60 = migrateVersion60Save(value);
  if (migratedVersion60) return migratedVersion60;
  const migratedVersion59 = migrateVersion59Save(value);
  if (migratedVersion59) return migratedVersion59;
  const migratedVersion58 = migrateVersion58Save(value);
  if (migratedVersion58) return migratedVersion58;
  const migratedVersion57 = migrateVersion57Save(value);
  if (migratedVersion57) return migratedVersion57;
  const migratedVersion56 = migrateVersion56Save(value);
  if (migratedVersion56) return migratedVersion56;
  const migratedVersion55 = migrateVersion55Save(value);
  if (migratedVersion55) return migratedVersion55;
  const migratedVersion54 = migrateVersion54Save(value);
  if (migratedVersion54) return migratedVersion54;
  const migratedVersion53 = migrateVersion53Save(value);
  if (migratedVersion53) return migratedVersion53;
  const migratedVersion52 = migrateVersion52Save(value);
  if (migratedVersion52) return migratedVersion52;
  const migratedVersion51 = migrateVersion51Save(value);
  if (migratedVersion51) return migratedVersion51;
  const migratedVersion50 = migrateVersion50Save(value);
  if (migratedVersion50) return migratedVersion50;
  const migratedVersion49 = migrateVersion49Save(value);
  if (migratedVersion49) return migratedVersion49;
  const migratedVersion48 = migrateVersion48Save(value);
  if (migratedVersion48) return migratedVersion48;
  const migratedVersion47 = migrateVersion47Save(value);
  if (migratedVersion47) return migratedVersion47;
  const migratedVersion46 = migrateVersion46Save(value);
  if (migratedVersion46) return migratedVersion46;
  const migratedVersion45 = migrateVersion45Save(value);
  if (migratedVersion45) return migratedVersion45;
  const migratedVersion44 = migrateVersion44Save(value);
  if (migratedVersion44) return migratedVersion44;
  const migratedVersion43 = migrateVersion43Save(value);
  if (migratedVersion43) return migratedVersion43;
  const migratedVersion42 = migrateVersion42Save(value);
  if (migratedVersion42) return migratedVersion42;
  const migratedVersion41 = migrateVersion41Save(value);
  if (migratedVersion41) return migratedVersion41;
  const migratedVersion40 = migrateVersion40Save(value);
  if (migratedVersion40) return migratedVersion40;
  const migratedVersion39 = migrateVersion39Save(value);
  if (migratedVersion39) return migratedVersion39;
  const migratedVersion38 = migrateVersion38Save(value);
  if (migratedVersion38) return migratedVersion38;
  const migratedVersion37 = migrateVersion37Save(value);
  if (migratedVersion37) return migratedVersion37;
  const migratedVersion36 = migrateVersion36Save(value);
  if (migratedVersion36) return migratedVersion36;
  const migratedVersion35 = migrateVersion35Save(value);
  if (migratedVersion35) return migratedVersion35;
  const migratedVersion34 = migrateVersion34Save(value);
  if (migratedVersion34) return migratedVersion34;
  const migratedVersion33 = migrateVersion33Save(value);
  if (migratedVersion33) return migratedVersion33;
  const migratedVersion32 = migrateVersion32Save(value);
  if (migratedVersion32) return migratedVersion32;
  const migratedVersion31 = migrateVersion31Save(value);
  if (migratedVersion31) return migratedVersion31;
  const migratedVersion30 = migrateVersion30Save(value);
  if (migratedVersion30) return migratedVersion30;
  const migratedVersion29 = migrateVersion29Save(value);
  if (migratedVersion29) return migratedVersion29;
  const migratedVersion28 = migrateVersion28Save(value);
  if (migratedVersion28) return migratedVersion28;
  const migratedVersion27 = migrateVersion27Save(value);
  if (migratedVersion27) return migratedVersion27;
  const migratedVersion26 = migrateVersion26Save(value);
  if (migratedVersion26) return migratedVersion26;
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
}
