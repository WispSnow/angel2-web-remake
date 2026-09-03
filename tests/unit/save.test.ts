import { describe, expect, it } from "vitest";
import {
  isSaveData,
  moveSaveSlotIndex,
  moveSaveSlotPage,
  parseSaveData,
  readSaveSlot,
  SAVE_CONTENT_VERSION,
  SAVE_SLOT_COUNT,
  SAVE_SLOT_PAGE_COUNT,
  SAVE_SLOTS_PER_PAGE,
  SAVE_VERSION,
  saveRecordStageLabel,
  saveSlotPageIndex,
  saveSlotPageStart,
  saveSlotKey,
} from "../../src/game/save";
import { STAGE_ROUND_LIMIT } from "../../src/game/simulation/objectives";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import { classFallbackPortraitFor, className, classStatsFor } from "../../src/game/content/classes";
import {
  completeCampaignRoster,
  initialEnemyExperience,
  statsFor,
} from "../../src/game/content/stage0";
import { STAGE1_DEFINITION } from "../../src/game/content/stage1";
import { Stage1Battle } from "../../src/game/simulation/stage1-battle";
import { Stage2Battle } from "../../src/game/simulation/stage2-battle";
import { Stage3Battle } from "../../src/game/simulation/stage3-battle";
import { STAGE4_DEFINITION } from "../../src/game/content/stage4";
import { Stage4Battle } from "../../src/game/simulation/stage4-battle";
import { STAGE6_DEFINITION } from "../../src/game/content/stage6";
import { Stage6Battle } from "../../src/game/simulation/stage6-battle";
import { STAGE7_DEFINITION } from "../../src/game/content/stage7";
import { Stage7Battle } from "../../src/game/simulation/stage7-battle";
import { Stage8Battle } from "../../src/game/simulation/stage8-battle";
import { STAGE9_DEFINITION } from "../../src/game/content/stage9";
import { Stage9Battle } from "../../src/game/simulation/stage9-battle";
import { Stage11Battle } from "../../src/game/simulation/stage11-battle";
import { STAGE10_DEFINITION } from "../../src/game/content/stage10";
import { Stage10Battle } from "../../src/game/simulation/stage10-battle";
import { STAGE12_DEFINITION } from "../../src/game/content/stage12";
import { Stage12Battle } from "../../src/game/simulation/stage12-battle";
import { STAGE14_DEFINITION } from "../../src/game/content/stage14";
import { Stage14Battle } from "../../src/game/simulation/stage14-battle";
import { STAGE15_DEFINITION } from "../../src/game/content/stage15";
import { STAGE16_DEFINITION } from "../../src/game/content/stage16";
import { STAGE17_DEFINITION } from "../../src/game/content/stage17";
import { STAGE18_DEFINITION } from "../../src/game/content/stage18";
import { STAGE19_DEFINITION } from "../../src/game/content/stage19";
import { STAGE22_DEFINITION, STAGE22_SEMANTIC_ENEMIES } from "../../src/game/content/stage22";
import { STAGE23_DEFINITION } from "../../src/game/content/stage23";
import { STAGE24_DEFINITION } from "../../src/game/content/stage24";
import { STAGE26_DEFINITION } from "../../src/game/content/stage26";
import { STAGE27_DEFINITION } from "../../src/game/content/stage27";
import { STAGE28_DEFINITION } from "../../src/game/content/stage28";
import { STAGE29_DEFINITION } from "../../src/game/content/stage29";
import {
  STAGE30_EVENT_PROGRAM,
  STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY,
} from "../../src/game/content/stage30";
import { STAGE31_DEFINITION } from "../../src/game/content/stage31";
import { STAGE32_DEFINITION } from "../../src/game/content/stage32";
import { STAGE33_DEFINITION } from "../../src/game/content/stage33";
import { STAGE34_DEFINITION } from "../../src/game/content/stage34";
import { STAGE36_DEFINITION } from "../../src/game/content/stage36";
import { Stage15Battle } from "../../src/game/simulation/stage15-battle";
import { Stage16Battle } from "../../src/game/simulation/stage16-battle";
import { Stage17Battle } from "../../src/game/simulation/stage17-battle";
import { Stage18Battle } from "../../src/game/simulation/stage18-battle";
import { Stage19Battle } from "../../src/game/simulation/stage19-battle";
import { Stage22Battle } from "../../src/game/simulation/stage22-battle";
import { Stage23Battle } from "../../src/game/simulation/stage23-battle";
import { Stage24Battle } from "../../src/game/simulation/stage24-battle";
import { Stage26Battle } from "../../src/game/simulation/stage26-battle";
import { Stage27Battle } from "../../src/game/simulation/stage27-battle";
import { Stage28Battle } from "../../src/game/simulation/stage28-battle";
import { Stage29Battle } from "../../src/game/simulation/stage29-battle";
import { Stage30Battle } from "../../src/game/simulation/stage30-battle";
import { Stage31Battle } from "../../src/game/simulation/stage31-battle";
import { Stage32Battle } from "../../src/game/simulation/stage32-battle";
import { Stage33Battle } from "../../src/game/simulation/stage33-battle";
import { Stage34Battle } from "../../src/game/simulation/stage34-battle";
import { Stage35Battle } from "../../src/game/simulation/stage35-battle";
import { Stage36Battle } from "../../src/game/simulation/stage36-battle";
import { createFixedStageEnemy } from "../../src/game/simulation/fixed-stage-battle";
import type { BattleSaveData, CompletedSaveData, Difficulty } from "../../src/game/types";

const completedSave = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: SAVE_CONTENT_VERSION,
  kind: "completed",
  savedAt: "2026-07-25T12:00:00.000Z",
  saveCount: 1,
  stageId: "stage-01",
  stageLabel: "騎士城堡前",
  ruleset: "stableRemake",
  difficulty: 0,
  rngState: 0x0a11ce02,
  rngCalls: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "soldier", experience: 319, life: 170 },
  ]),
  recordCounters: Array<number>(75).fill(0),
  stageProgress: 0,
  consumedEventIds: [],
});

const battleSave = (): BattleSaveData => {
  const roster = completeCampaignRoster([
    { slot: 0, classId: "soldier", experience: 399, life: 160 },
  ]);
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-07-25T12:00:00.000Z",
    saveCount: 2,
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    ruleset: "stableRemake",
    difficulty: 2,
    rngState: 0x1020_3040,
    rngCalls: 0,
    roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      stageId: "stage-00",
      ruleset: "stableRemake",
      difficulty: 2,
      rngState: 0x1020_3040,
      rngCalls: 0,
      roster: roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
      "stage-00-round-2-story",
    ],
    battle: {
      phase: "player",
      round: 3,
      focusId: "1:0",
      terrainOverrides: [],
      units: [
        {
          id: "1:0",
          side: 1,
          slot: 0,
          classId: "soldier",
          className: "士兵",
          name: "妮雅",
          portrait: 46,
          x: 29,
          y: 26,
          life: 160,
          experience: 399,
          acted: false,
          actionDisabled: false,
          statuses: emptyUnitStatuses(),
        },
        {
          id: "2:15",
          side: 2,
          slot: 15,
          classId: "cavalry",
          className: "騎兵",
          name: "哈釘",
          portrait: 15,
          x: 23,
          y: 32,
          life: 250,
          // 敌方出场经验由难度表决定（`REMAKE-103`），夹具跟着难度 2 走而不抄死数字。
          experience: initialEnemyExperience("cavalry", 2),
          acted: true,
          actionDisabled: false,
          statuses: emptyUnitStatuses(),
        },
      ],
      cursor: { x: 29, y: 26 },
      cameraOrigin: { x: 25, y: 23 },
    },
  };
};

const stage1BattleSave = (): BattleSaveData => {
  const prior = completedSave();
  const deployment = {
    placements: [
      ...STAGE1_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
      {
        slot: 24,
        position: { ...STAGE1_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage1Battle({
    difficulty: prior.difficulty,
    roster: prior.roster,
    rngState: prior.rngState,
    rngCalls: prior.rngCalls,
  }, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    ...prior,
    kind: "battle",
    saveCount: 2,
    stageId: "stage-01",
    stageLabel: "騎士城堡前",
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      stageId: "stage-01",
      ruleset: "stableRemake",
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster.map((entry) => ({ ...entry })),
    },
    consumedEventIds: [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...STAGE1_DEFINITION.viewport.initialOrigin },
    },
  };
};

const stage2BattleSave = (): BattleSaveData => {
  const campaign = {
    stageId: "stage-02" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x1020_3040,
    rngCalls: 3,
    roster: completeCampaignRoster([
      { slot: 0, classId: "cavalry", experience: 450, life: 100 },
      { slot: 2, classId: "archer", experience: 360, life: 90 },
    ]),
  };
  const battle = new Stage2Battle(campaign);
  const snapshot = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-03T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-02",
    stageLabel: "攻打騎士堡",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: snapshot.rngState,
    rngCalls: snapshot.rngCalls,
    roster: snapshot.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...campaign,
      roster: campaign.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: ["stage-02-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage3BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-03" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x2030_4050,
    rngCalls: 9,
    roster: completeCampaignRoster([
      { slot: 1, classId: "monk", experience: 520, life: 120 },
      { slot: 3, classId: "warrior", experience: 480, life: 140 },
      { slot: 4, classId: "archer", experience: 360, life: 90 },
    ]),
  };
  const battle = new Stage3Battle(source);
  const campaign = battle.campaignSnapshot();
  const himi = battle.unit("1:1")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-04T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-03",
    stageLabel: "救援友軍",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...campaign,
      stageId: "stage-03",
      roster: campaign.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-03-opening-story",
      "stage-03-player-ready",
      "stage-03-fourth-corps-joined",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: himi.x, y: himi.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

/** Reconstructs the generic enemy seed written by every pre-v96 stage-3 build. */
const legacySeededStage3BattleSave = (difficulty: Difficulty = 0): BattleSaveData => {
  const save = stage3BattleSave();
  return {
    ...save,
    difficulty,
    stageEntrySnapshot: { ...save.stageEntrySnapshot, difficulty },
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => {
        if (unit.side === 1) return { ...unit };
        const experience = initialEnemyExperience(unit.classId, difficulty);
        const seeded = { ...unit, experience };
        return { ...seeded, life: statsFor(seeded, difficulty).maxLife };
      }),
    },
  };
};

/** Reconstructs the all-difficulty zero baseline written by v96/v97 stage 3. */
const previouslyUnseededStage3BattleSave = (difficulty: Difficulty = 0): BattleSaveData => {
  const save = stage3BattleSave();
  return {
    ...save,
    difficulty,
    stageEntrySnapshot: { ...save.stageEntrySnapshot, difficulty },
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => {
        if (unit.side === 1) return { ...unit };
        const unseeded = { ...unit, experience: 0 };
        return { ...unseeded, life: statsFor(unseeded, difficulty).maxLife };
      }),
    },
  };
};

const stage4BattleSave = (completedRounds = 0): BattleSaveData => {
  const source = {
    stageId: "stage-04" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x3040_5060,
    rngCalls: 12,
    roster: completeCampaignRoster([
      { slot: 0, classId: "cavalry", experience: 520, life: 120 },
      { slot: 1, classId: "monk", experience: 480, life: 111 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE4_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
      ...STAGE4_DEFINITION.deployment.optionalSlots.map((slot, index) => ({
        slot,
        position: { ...STAGE4_DEFINITION.deployment.openCells[index] },
        fixed: false,
      })),
    ],
  };
  const battle = new Stage4Battle(source, deployment);
  for (let round = 0; round < completedRounds; round += 1) {
    battle.beginEnemyPhase();
    battle.startNextRound();
  }
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-04T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-04",
    stageLabel: "通過力場",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-04-prebattle-story",
      "stage-04-enter-deployment",
      "stage-04-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage6BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-06" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x4050_6070,
    rngCalls: 15,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 520, life: 220 },
      { slot: 1, classId: "priest", experience: 480, life: 180 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE6_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE6_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
        slot, position: { ...STAGE6_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
  const battle = new Stage6Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-08T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-06",
    stageLabel: "過異世界之門",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-06-enter-deployment",
      "stage-06-prebattle-story",
      "stage-06-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage7BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-07" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x5060_7080,
    rngCalls: 18,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 620, life: 220 },
      { slot: 1, classId: "priest", experience: 580, life: 180 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE7_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE7_DEFINITION.deployment.optionalSlots.slice(0, 5).map((slot, index) => ({
        slot, position: { ...STAGE7_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
  const battle = new Stage7Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-09T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-07",
    stageLabel: "來到異世界",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-07-prebattle-story",
      "stage-07-enter-deployment",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage8BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-08" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x6070_8090,
    rngCalls: 21,
    roster: completeCampaignRoster([
      { slot: 17, classId: "land-knight", experience: 620, life: 220 },
      { slot: 18, classId: "priest", experience: 580, life: 180 },
    ]),
  };
  const battle = new Stage8Battle(source);
  const campaign = battle.campaignSnapshot();
  const sulanda = battle.unit("1:8")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-09T14:00:00.000Z",
    saveCount: 1,
    stageId: "stage-08",
    stageLabel: "營地遭到偷襲",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: [
      "stage-08-prebattle-story",
      "stage-08-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: sulanda.x, y: sulanda.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage9BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-09" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x7080_90a0,
    rngCalls: 34,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 620, life: 220 },
    ]),
  };
  const deployment = {
    placements: STAGE9_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
  };
  const battle = new Stage9Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-09T16:00:00.000Z",
    saveCount: 1,
    stageId: "stage-09",
    stageLabel: "找尋傳說中的飛船",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: ["stage-09-enter-deployment", "stage-09-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage11BattleSave = (reinforcementCount = 1): BattleSaveData => {
  const source = {
    stageId: "stage-11" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x8090_a0b0,
    rngCalls: 41,
    roster: completeCampaignRoster([
      { slot: 8, classId: "land-knight", experience: 620, life: 220 },
      { slot: 9, classId: "curse-master", experience: 500, life: 170 },
    ]),
  };
  const battle = new Stage11Battle(source);
  battle.removeStoryUnits([{ side: 1, slot: 9 }]);
  for (let index = 0; index < reinforcementCount; index += 1) {
    battle.beginEnemyPhase();
    battle.startNextRound();
  }
  const campaign = battle.campaignSnapshot();
  const sulanda = battle.unit("1:8")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-09T20:00:00.000Z",
    saveCount: 1,
    stageId: "stage-11",
    stageLabel: "拯救蘇蘭達",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: {
      recordCounters: Array<number>(75).fill(0),
      ...source,
      roster: source.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: ["stage-11-opening-story", "stage-11-dori-departure"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: sulanda.x, y: sulanda.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage10BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-10" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x90a0_b0c0,
    rngCalls: 47,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 620, life: 220 },
      { slot: 8, classId: "cavalry", experience: 299, life: 200 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE10_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: STAGE10_DEFINITION.deployment.optionalSlots[0],
        position: { ...STAGE10_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage10Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-10T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-10",
    stageLabel: "飛船上遭遇敵人",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-10-prebattle-story", "stage-10-enter-deployment"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage12BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-12" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x12a0_b0c0,
    rngCalls: 53,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 620, life: 220 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE12_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage12Battle(source, deployment);
  const attacker = battle.unit("1:1")!;
  attacker.x = 38;
  attacker.y = 17;
  expect(battle.attack("1:1", "2:40")).toMatchObject({
    splitUnitId: "2:40:split-1",
    splitCount: 2,
  });
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-10T16:00:00.000Z",
    saveCount: 1,
    stageId: "stage-12",
    stageLabel: "落入沼澤",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-12-prebattle-story",
      "stage-12-enter-deployment",
      "stage-12-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage14BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-14" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x14a0_b0c0,
    rngCalls: 61,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE14_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE14_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage14Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-10T18:00:00.000Z",
    saveCount: 1,
    stageId: "stage-14",
    stageLabel: "龍塔第一層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-14-enter-deployment", "stage-14-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage15BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-15" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x15a0_b0c0,
    rngCalls: 67,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE15_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE15_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage15Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-10T20:00:00.000Z",
    saveCount: 1,
    stageId: "stage-15",
    stageLabel: "龍塔第二層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-15-enter-deployment", "stage-15-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage16BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-16" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x16a0_b0c0,
    rngCalls: 71,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE16_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE16_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage16Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-10T20:00:00.000Z",
    saveCount: 1,
    stageId: "stage-16",
    stageLabel: "龍塔第三層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-16-enter-deployment", "stage-16-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage17BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-17" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x17a0_b0c0,
    rngCalls: 71,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE17_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE17_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage17Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-11T20:00:00.000Z",
    saveCount: 1,
    stageId: "stage-17",
    stageLabel: "龍塔第四層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-17-enter-deployment", "stage-17-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage18BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-18" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x18a0_b0c0,
    rngCalls: 73,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE18_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE18_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage18Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-11T21:00:00.000Z",
    saveCount: 1,
    stageId: "stage-18",
    stageLabel: "龍塔第五層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-18-enter-deployment", "stage-18-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage19BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-19" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x19a0_b0c0,
    rngCalls: 75,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE19_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE19_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage19Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-11T22:00:00.000Z",
    saveCount: 1,
    stageId: "stage-19",
    stageLabel: "龍塔第六層",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-19-enter-deployment", "stage-19-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage22BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-22" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x22a0_b0c0,
    rngCalls: 79,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 1, classId: "soldier", experience: 299, life: 120 },
      { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
      { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE22_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 1,
        position: { ...STAGE22_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage22Battle(source, deployment);
  battle.appendStoryUnits(STAGE22_SEMANTIC_ENEMIES.map((enemy) => createFixedStageEnemy(
    enemy,
    source.difficulty,
  )));
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-11T23:00:00.000Z",
    saveCount: 1,
    stageId: "stage-22",
    stageLabel: "焦土森林村莊中",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-22-enter-deployment",
      "stage-22-empress-arrival",
      "stage-22-empress-move",
      "stage-22-kins-arrival",
      "stage-22-kins-move",
      "stage-22-search-story",
      "stage-22-focus-nia",
      "stage-22-reunion-story",
      "stage-22-gadirath-arrival",
      "stage-22-betrayal-story",
      "stage-22-dragon-arrival",
      "stage-22-dragon-story",
      "stage-22-story-departures",
      "stage-22-ambush-arrivals",
      "stage-22-player-ready",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage23BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-23" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x23a0_b0c0,
    rngCalls: 83,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      { slot: 7, classId: "magic-priest", experience: 620, life: 180 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 7,
        position: { ...STAGE23_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage23Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-12T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-23",
    stageLabel: "死亡之谷中",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-23-enter-deployment",
      "stage-23-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage24BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-24" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x24a0_b0c0,
    rngCalls: 84,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 760, life: 240 },
      { slot: 7, classId: "magic-priest", experience: 660, life: 180 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE24_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      {
        slot: 7,
        position: { ...STAGE24_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage24Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-12T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-24",
    stageLabel: "死亡之谷城堡前",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-24-enter-deployment",
      "stage-24-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage26BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-26" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x26a0_b0c0,
    rngCalls: 92,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 760, life: 240 },
      { slot: 7, classId: "magic-priest", experience: 660, life: 180 },
      { slot: 8, classId: "cavalry", experience: 740, life: 220 },
    ]),
  };
  const deployment = {
    placements: STAGE26_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
  };
  const battle = new Stage26Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-12T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-26",
    stageLabel: "遭遇碧娜維姬",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-26-enter-deployment",
      "stage-26-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage27BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-27" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x27a0_b0c0,
    rngCalls: 96,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 800, life: 240 },
      { slot: 7, classId: "magic-priest", experience: 700, life: 180 },
    ]),
  };
  const deployment = {
    placements: STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
  };
  const battle = new Stage27Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-12T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-27",
    stageLabel: "趕回瓦爾克麗城",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-27-enter-deployment",
      "stage-27-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage28BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-28" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x28a0_b0c0,
    rngCalls: 100,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 840, life: 250 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
      {
        slot: 22,
        classId: "great-axe-warrior",
        experience: 0,
        life: classStatsFor({ classId: "great-axe-warrior", experience: 0 }).maxLife,
      },
      { slot: 25, classId: "half-dragon-warrior", experience: 319, life: 260 },
    ]),
  };
  const deployment = {
    placements: STAGE28_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
  };
  const battle = new Stage28Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-28",
    stageLabel: "保衛瓦爾克麗城",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-28-prebattle-story",
      "stage-28-enter-deployment",
      "stage-28-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage29BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-29" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x29a0_b0c0,
    rngCalls: 104,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 880, life: 260 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
      {
        slot: 22,
        classId: "great-axe-warrior",
        experience: 0,
        life: classStatsFor({ classId: "great-axe-warrior", experience: 0 }).maxLife,
      },
      { slot: 25, classId: "half-dragon-warrior", experience: 319, life: 260 },
    ]),
  };
  const deployment = {
    placements: STAGE29_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
  };
  const battle = new Stage29Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-29",
    stageLabel: "騎士城堡前",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-29-prebattle-story",
      "stage-29-enter-deployment",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage30BattleSave = (difficulty: Difficulty = 0): BattleSaveData => {
  const source = {
    stageId: "stage-30" as const,
    ruleset: "stableRemake" as const,
    difficulty,
    rngState: 0x30a0_b0c0,
    rngCalls: 108,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 920, life: 280 },
      { slot: 7, classId: "magic-priest", experience: 700, life: 190 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const battle = new Stage30Battle(source);
  battle.queueUnitFormTransition("2:27", {
    classId: "soldier",
    name: "維絲塔",
    portrait: 41,
    experience: 0,
  }, STAGE30_EVENT_PROGRAM.contextualLine);
  battle.commitNextUnitTransformation();
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-30",
    stageLabel: "治癒維斯塔女帝",
    ruleset: "stableRemake",
    difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-30-prebattle-story",
      "stage-30-opening-story",
      "stage-30-opening-form-transition",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage31BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-31" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x31a0_b0c0,
    rngCalls: 109,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 920, life: 280 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE31_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE31_DEFINITION.deployment.optionalSlots.slice(0, 12).map((slot, index) => ({
        slot, position: { ...STAGE31_DEFINITION.deployment.openCells[index]! }, fixed: false,
      })),
    ],
  };
  const battle = new Stage31Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-31",
    stageLabel: "前往斯德林海峽",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-31-prebattle-story",
      "stage-31-enter-deployment",
      "stage-31-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage32BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-32" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x32a0_b0c0,
    rngCalls: 110,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 960, life: 290 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE32_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE32_DEFINITION.deployment.optionalSlots.slice(0, 15).map((slot, index) => ({
        slot, position: { ...STAGE32_DEFINITION.deployment.openCells[index]! }, fixed: false,
      })),
    ],
  };
  const battle = new Stage32Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-32",
    stageLabel: "斯德林海峽",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-32-enter-deployment",
      "stage-32-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage33BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-33" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x33a0_b0c0,
    rngCalls: 111,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 1_000, life: 300 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE33_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE33_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE33_DEFINITION.deployment.openCells[index]! }, fixed: false,
      })),
    ],
  };
  const battle = new Stage33Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-33",
    stageLabel: "拉那洛城外",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-33-enter-deployment",
      "stage-33-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage34BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-34" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x34a0_b0c0,
    rngCalls: 112,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 1_040, life: 310 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE34_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE34_DEFINITION.deployment.optionalSlots.slice(0, 10).map((slot, index) => ({
        slot, position: { ...STAGE34_DEFINITION.deployment.openCells[index]! }, fixed: false,
      })),
    ],
  };
  const battle = new Stage34Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-34",
    stageLabel: "拉那洛城內",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-34-enter-deployment",
      "stage-34-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage35BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-35" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x35a0_b0c0,
    rngCalls: 113,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 1_080, life: 320 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 18, classId: "archer", experience: 720, life: 145 },
      { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const battle = new Stage35Battle(source);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-13T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-35",
    stageLabel: "時空異變",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: ["stage-35-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage36BattleSave = (): BattleSaveData => {
  const source = {
    stageId: "stage-36" as const,
    ruleset: "stableRemake" as const,
    difficulty: 0 as const,
    rngState: 0x36a0_b0c0,
    rngCalls: 114,
    roster: completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 1_120, life: 330 },
      { slot: 7, classId: "magic-priest", experience: 0, life: 190 },
      { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
      { slot: 23, classId: "empress", experience: 0, life: 380 },
      { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
    ]),
  };
  const deployment = {
    placements: [
      ...STAGE36_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE36_DEFINITION.deployment.optionalSlots.slice(0, 27).map((slot, index) => ({
        slot, position: { ...STAGE36_DEFINITION.deployment.openCells[index]! }, fixed: false,
      })),
    ],
  };
  const battle = new Stage36Battle(source, deployment);
  const campaign = battle.campaignSnapshot();
  const nia = battle.unit("1:0")!;
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2026-08-14T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-36",
    stageLabel: "異世界的碧娜維姬",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: Array<number>(75).fill(0),
    stageEntrySnapshot: { ...source, recordCounters: Array<number>(75).fill(0), roster: source.roster.map((entry) => ({ ...entry })) },
    stageProgress: 0,
    consumedEventIds: [
      "stage-36-enter-deployment",
      "stage-36-opening-story",
    ],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

function legacyCompletedSave(
  save: CompletedSaveData,
  version: 2 | 3 | 4,
) {
  return {
    format: save.format,
    version,
    kind: save.kind,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    stage: 1,
    stageLabel: "下一關",
    ruleset: save.ruleset,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster: save.roster.map((entry) => ({
      ...entry,
      classId: entry.classId === "cavalry" ? 22 : 0,
    })),
  } as const;
}

function legacyBattleSave(
  save: BattleSaveData,
  version: 2 | 3 | 4,
) {
  return {
    format: save.format,
    version,
    kind: save.kind,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    stage: 0,
    stageLabel: save.stageLabel,
    ruleset: save.ruleset,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster: save.roster
      .filter((entry) => save.battle.units.some(
        (unit) => unit.side === 1 && unit.slot === entry.slot,
      ))
      .map((entry) => ({
        ...entry,
        classId: entry.classId === "cavalry" ? 22 : 0,
      })),
    battle: {
      ...save.battle,
      units: save.battle.units.map(({ actionDisabled: _actionDisabled, ...unit }) => ({
        ...unit,
        classId: unit.classId === "cavalry" ? 22 : 0,
      })),
    },
  } as const;
}

describe("Web save validation", () => {
  it("migrates v83 saves losslessly", () => {
    // REMAKE-105 只把「被占据的敌方邻格不再是终止格」这条原版行为补回传播器。
    // 没有字段新增或改义，可达范围本来就在读档后重算，所以 v83 存档无损迁移。
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 83,
        contentVersion: "enemy-difficulty-scaling-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v82 saves whose enemy baseline did not move", () => {
    // REMAKE-103 只改难度 1／2 的敌方出场行，难度 0／3 的基线逐字保持原版，
    // 因此这两档的 v82 存档无损迁移。
    for (const difficulty of [0, 3] as const) {
      const current = { ...battleSave(), difficulty };
      current.stageEntrySnapshot = { ...current.stageEntrySnapshot, difficulty };
      const enemy = {
        ...current.battle.units[1],
        experience: initialEnemyExperience("cavalry", difficulty),
      };
      // 难度 0 的騎兵上限低于夹具默认残血值，按该难度重新落在上限内。
      current.battle.units[1] = {
        ...enemy,
        life: Math.min(enemy.life, statsFor(enemy, difficulty).maxLife),
      };
      const legacy = {
        ...current,
        version: 82,
        contentVersion: "expert-attack-up-melee-targeting-1",
      };
      expect(parseSaveData(JSON.stringify(legacy)), `d${difficulty}`).toEqual(current);
    }
  });

  it("safely rejects v82 saves still on the pre-REMAKE-103 enemy baseline", () => {
    // 难度 2 的敌方出场行从 4 抬到 6，旧存档里的经验因此低于新基线。迁移不会就地
    // 重播——那会在玩家眼皮底下改变一场进行中的战斗——而是整体拒绝。
    const stale = {
      ...battleSave(),
      version: 82,
      contentVersion: "expert-attack-up-melee-targeting-1",
    };
    stale.battle.units[1] = { ...stale.battle.units[1], experience: 461 };
    expect(parseSaveData(JSON.stringify(stale))).toBeUndefined();
  });

  it("migrates v81 saves losslessly", () => {
    // REMAKE-102 only narrows which ally the AI may pick for AA. No stored field
    // is added or changes meaning and the cast still draws once, so a mid-battle
    // save resumes on the same PRNG cursor with only its AI plans recomputed.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 81,
        contentVersion: "tier4-melee-traits-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v80 saves losslessly", () => {
    // REMAKE-097/098/099/100 add no stored fields and change no stored meaning.
    // The version moves because REMAKE-098/099 stop drawing from the PRNG, so a
    // mid-battle v80 save would otherwise resume on a shifted call sequence.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 80,
        contentVersion: "ice-cardinal-radial-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v79 saves losslessly", () => {
    // REMAKE-096 narrows the radial push back to four directions; no stored field
    // changes meaning, so both save kinds carry over untouched.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 79,
        contentVersion: "ice-radial-displacement-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v78 saves losslessly", () => {
    // REMAKE-095 only changes which cell an ice push lands on; no stored field
    // changes meaning, so both save kinds carry over untouched.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 78,
        contentVersion: "ice-freeze-on-landing-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v77 saves losslessly", () => {
    // REMAKE-094 only narrows which ice targets receive the freeze bit. That bit
    // is an existing stored field and no in-flight state changes meaning, so both
    // a mid-battle and a completed v77 save carry over untouched.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 77,
        contentVersion: "half-dragon-curve-water-warrior-shot-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("rejects a legacy save whose content identity does not match its version", () => {
    const legacy = {
      ...battleSave(),
      version: 79,
      contentVersion: "ice-cardinal-radial-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toBeUndefined();
  });

  it("migrates v76 saves losslessly when no sister sits below the entry baseline", () => {
    // REMAKE-092/093 add no stored fields: a unit still carries only its class
    // and experience, so a save without an under-baseline sister is unchanged.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 76,
        contentVersion: "force-follower-engage-first-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("raises a v76 sister parked on the retired class-0 entry baseline", () => {
    const current = completedSave();
    const legacy = {
      ...current,
      version: 76,
      contentVersion: "force-follower-engage-first-1",
      roster: current.roster.map((entry) => entry.slot === 25
        ? { ...entry, classId: "half-dragon-warrior", experience: 299, life: 300 }
        : entry),
    };
    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated?.roster.find(({ slot }) => slot === 25)).toMatchObject({
      classId: "half-dragon-warrior",
      experience: 760,
      // Undamaged at the old level-1 ceiling of 300, so she arrives full at 340.
      life: 340,
    });
  });

  it("carries a wounded v76 sister's damage across to the raised ceiling", () => {
    const current = completedSave();
    const legacy = {
      ...current,
      version: 76,
      contentVersion: "force-follower-engage-first-1",
      roster: current.roster.map((entry) => entry.slot === 26
        ? { ...entry, classId: "half-dragon-warrior", experience: 299, life: 260 }
        : entry),
    };
    const migrated = parseSaveData(JSON.stringify(legacy));
    // 40 points down from the old 300 ceiling stays 40 points down from 340.
    expect(migrated?.roster.find(({ slot }) => slot === 26)).toMatchObject({
      experience: 760,
      life: 300,
    });
  });

  it("never lowers a v76 sister who already earned past the entry baseline", () => {
    const current = completedSave();
    const legacy = {
      ...current,
      version: 76,
      contentVersion: "force-follower-engage-first-1",
      roster: current.roster.map((entry) => entry.slot === 27
        ? { ...entry, classId: "half-dragon-warrior", experience: 1900, life: 400 }
        : entry),
    };
    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated?.roster.find(({ slot }) => slot === 27)).toMatchObject({
      experience: 1900,
      life: 400,
    });
  });

  it("migrates v75 saves losslessly through the formation-follower AI identity", () => {
    // REMAKE-091 only changes how a paired follower plans, so nothing in the
    // stored battle, roster or PRNG is reinterpreted.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 75,
        contentVersion: "expert-named-leader-caution-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v74 saves losslessly through the named-leader AI identity", () => {
    // REMAKE-090 only changes how side-2 named leaders plan, so every unit,
    // round, roster and PRNG field carries over untouched.
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 74,
        contentVersion: "stage-49-ending-kill-records-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v73 attack-counted records to a zeroed kill-count baseline", () => {
    // v73 advanced 戰績 on every ordinary attack; v74 only counts kills, and a
    // v73 total cannot be split back into kills, so the counters restart at 0.
    const current = completedSave();
    const legacyCounters = Array<number>(75).fill(0);
    legacyCounters[0] = 37;
    legacyCounters[7] = 12;
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 73,
      contentVersion: "stage-49-ending-records-1",
      recordCounters: legacyCounters,
    }));
    expect(migrated).toEqual(current);
    expect((migrated as CompletedSaveData).recordCounters).toEqual(Array<number>(75).fill(0));
  });

  it("migrates v72 saves to a zeroed native record-counter baseline", () => {
    const current = completedSave();
    const { recordCounters: _currentCounters, ...legacy } = current;
    const migrated = parseSaveData(JSON.stringify({
      ...legacy,
      version: 72,
      contentVersion: "stage-37-ice-last-portrait-1",
    }));
    expect(migrated).toEqual(current);
  });

  it("migrates v46 saves through the traversable-path expert AI identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 46,
        contentVersion: "stage-23-death-valley-breakthrough-2",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v32 saves to the stage 10 airship identity", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 32,
      contentVersion: "stage-11-ranger-reinforcements-1",
    }))).toEqual(current);
  });

  it("migrates v31 saves to the stage 11 reinforcement identity", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 31,
      contentVersion: "stage-11-ranger-evacuation-1",
    }))).toEqual(current);
  });

  it("migrates v30 saves and corrects the stage 11 route title", () => {
    const currentBattle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...currentBattle,
      version: 30,
      contentVersion: "stage-09-death-valley-1",
    }))).toEqual(currentBattle);

    const currentCompleted: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-11",
      stageLabel: "拯救蘇蘭達",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-09-enter-deployment",
        "stage-09-opening-story",
        "stage-09-objective-reached",
        "stage-09-victory-story",
        "stage-09-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...currentCompleted,
      version: 30,
      contentVersion: "stage-09-death-valley-1",
      stageLabel: "飛船上遭遇敵人",
    }))).toEqual(currentCompleted);
  });

  it("migrates v29 battle and completed saves into the stage 9 identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 29,
        contentVersion: "stage8-all-player-control-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v28 battle and completed saves into the stage 8 all-player identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 28,
        contentVersion: "shared-automatic-expert-ai-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v27 battle and completed saves through the shared expert AI identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 27,
        contentVersion: "ice-counterplay-wizard-focus-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v26 battle and completed saves into the ice counterplay identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 26,
        contentVersion: "directed-magic-arrow-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v25 battle and completed saves into the directed magic-arrow identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 25,
        contentVersion: "expert-ranged-control-ai-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v24 battle and completed saves into the ranged/control AI identity", () => {
    for (const current of [battleSave(), completedSave()]) {
      const legacy = {
        ...current,
        version: 24,
        contentVersion: "expert-enemy-ai-1",
      };
      expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
    }
  });

  it("migrates v23 battle and completed saves without changing their state", () => {
    const currentBattle = battleSave();
    const legacyBattle = {
      ...currentBattle,
      version: 23,
      contentVersion: "stage-08-victory-story-1",
    };
    expect(parseSaveData(JSON.stringify(legacyBattle))).toEqual(currentBattle);

    const currentCompleted = completedSave();
    const legacyCompleted = {
      ...currentCompleted,
      version: 23,
      contentVersion: "stage-08-victory-story-1",
    };
    expect(parseSaveData(JSON.stringify(legacyCompleted))).toEqual(currentCompleted);
  });

  it("migrates v22 stage-8 battles and completions into the SAY/157 event identity", () => {
    const currentBattle = stage8BattleSave();
    const legacyBattle = {
      ...currentBattle,
      version: 22,
      contentVersion: "stage-08-ranger-defense-1",
    };
    expect(parseSaveData(JSON.stringify(legacyBattle))).toEqual(currentBattle);

    const currentCompleted: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-09",
      stageLabel: "找尋傳說中的飛船",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-08-prebattle-story",
        "stage-08-opening-story",
        "stage-08-objective-reached",
        "stage-08-victory-story",
        "stage-08-completed-route",
      ],
    };
    const legacyCompleted = {
      ...currentCompleted,
      version: 22,
      contentVersion: "stage-08-ranger-defense-1",
      consumedEventIds: currentCompleted.consumedEventIds
        .filter((id) => id !== "stage-08-victory-story"),
    };
    expect(parseSaveData(JSON.stringify(legacyCompleted))).toEqual(currentCompleted);
  });

  it("migrates v21 saves into the stage-08 content identity", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 21,
      contentVersion: "stage-07-camp-raid-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v20 saves into the stage-07 content identity", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 20,
      contentVersion: "stage-06-rangers-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v19 saves through the current stage-07 content identity", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 19,
      contentVersion: "stage-05-portal-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v18 saves through the current stage-07 identity", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 18,
      contentVersion: "dynamic-terrain-2",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v17 dynamic-terrain saves without changing existing iron plate", () => {
    const current = battleSave();
    current.battle.terrainOverrides = [{ x: 20, y: 20, kind: "iron-plate" }];
    const legacy = {
      ...current,
      version: 17,
      contentVersion: "dynamic-terrain-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v16 battle saves to an empty dynamic-terrain overlay", () => {
    const current = battleSave();
    const { terrainOverrides: _terrainOverrides, ...battle } = current.battle;
    const legacy = {
      ...current,
      version: 16,
      contentVersion: "stage-title-and-roster-inheritance-1",
      battle,
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("validates canonical dynamic-terrain overrides", () => {
    const valid = battleSave();
    valid.battle.terrainOverrides = [
      { x: 20, y: 20, kind: "iron-plate" },
      { x: 21, y: 20, kind: "obstacle" },
    ];
    expect(isSaveData(valid)).toBe(true);

    const duplicate = structuredClone(valid);
    duplicate.battle.terrainOverrides[1] = { ...duplicate.battle.terrainOverrides[0] };
    expect(isSaveData(duplicate)).toBe(false);

    const reversed = structuredClone(valid);
    reversed.battle.terrainOverrides.reverse();
    expect(isSaveData(reversed)).toBe(false);

    const unknown = structuredClone(valid);
    unknown.battle.terrainOverrides[0].kind = "unknown" as never;
    expect(isSaveData(unknown)).toBe(false);

    const offMap = structuredClone(valid);
    offMap.battle.terrainOverrides[0].x = 50;
    expect(isSaveData(offMap)).toBe(false);
  });
  it("exposes twenty manual slots as four pages without changing legacy keys", () => {
    expect(SAVE_SLOT_COUNT).toBe(20);
    expect(SAVE_SLOTS_PER_PAGE).toBe(5);
    expect(SAVE_SLOT_PAGE_COUNT).toBe(4);
    expect(saveSlotKey(1)).toBe("angel2.save.1");
    expect(saveSlotKey(5)).toBe("angel2.save.5");
    expect(saveSlotKey(20)).toBe("angel2.save.20");
    expect(saveSlotPageIndex(0)).toBe(0);
    expect(saveSlotPageIndex(19)).toBe(3);
    expect(saveSlotPageStart(17)).toBe(15);
    expect(moveSaveSlotIndex(4, 1)).toBe(5);
    expect(moveSaveSlotIndex(19, 1)).toBe(0);
    expect(moveSaveSlotPage(2, -1)).toBe(17);
    expect(moveSaveSlotPage(17, 1)).toBe(2);
  });

  it("accepts complete current-version battle and completed saves", () => {
    expect(isSaveData(completedSave())).toBe(true);
    expect(parseSaveData(JSON.stringify(battleSave()))).toEqual(battleSave());
    expect(parseSaveData(JSON.stringify(stage1BattleSave()))).toEqual(stage1BattleSave());
  });

  it("round-trips a stage-2 battle with a distinct immutable entry snapshot", () => {
    const save = stage2BattleSave();

    expect(save.stageEntrySnapshot.roster).not.toEqual(save.roster);
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);
  });

  it("round-trips stage-3 fixed battles and rejects missing protected allies", () => {
    const save = stage3BattleSave();
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingHimi = stage3BattleSave();
    missingHimi.battle.units = missingHimi.battle.units.filter(({ id }) => id !== "1:1");
    expect(isSaveData(missingHimi)).toBe(false);
  });

  it("round-trips stage-4 deployments and rejects a missing or roster-mismatched guide", () => {
    const save = stage4BattleSave();
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingGuide = stage4BattleSave();
    missingGuide.battle.units = missingGuide.battle.units.filter(({ id }) => id !== "1:24");
    expect(isSaveData(missingGuide)).toBe(false);

    const wrongGuide = stage4BattleSave();
    const guide = wrongGuide.battle.units.find(({ id }) => id === "1:24")!;
    guide.classId = "soldier";
    guide.className = "士兵";
    expect(isSaveData(wrongGuide)).toBe(false);
  });

  it("round-trips stage-6 deployments with the exact opening event identity", () => {
    const save = stage6BattleSave();
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingOpening = stage6BattleSave();
    missingOpening.consumedEventIds.pop();
    expect(isSaveData(missingOpening)).toBe(false);

    const wrongEnemy = stage6BattleSave();
    const xielei = wrongEnemy.battle.units.find(({ id }) => id === "2:19")!;
    xielei.classId = "cavalry";
    xielei.className = className("cavalry");
    expect(isSaveData(wrongEnemy)).toBe(false);
  });

  it("round-trips stage-7 deployments and rejects a missing fixed ally or wrong Laili class", () => {
    const save = stage7BattleSave();
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingHimi = stage7BattleSave();
    missingHimi.battle.units = missingHimi.battle.units.filter(({ id }) => id !== "1:1");
    expect(isSaveData(missingHimi)).toBe(false);

    const wrongLaili = stage7BattleSave();
    const laili = wrongLaili.battle.units.find(({ id }) => id === "2:18")!;
    laili.classId = "cavalry";
    laili.className = className("cavalry");
    expect(isSaveData(wrongLaili)).toBe(false);
  });

  it("round-trips stage-8 fixed forces and rejects a missing ranger or wrong enemy class", () => {
    const save = stage8BattleSave();
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingRanger = stage8BattleSave();
    missingRanger.battle.units = missingRanger.battle.units.filter(({ id }) => id !== "1:40");
    expect(isSaveData(missingRanger)).toBe(false);

    const wrongEnemy = stage8BattleSave();
    const magician = wrongEnemy.battle.units.find(({ id }) => id === "2:30")!;
    magician.classId = "cavalry";
    magician.className = className("cavalry");
    expect(isSaveData(wrongEnemy)).toBe(false);

    const missingOpening = stage8BattleSave();
    missingOpening.consumedEventIds.pop();
    expect(isSaveData(missingOpening)).toBe(false);
  });

  it("accepts the stage-05 boundary only with the complete stage-4 route identity", () => {
    const current: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-05",
      stageLabel: "遭遇丁塔琪",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-04-prebattle-story",
        "stage-04-enter-deployment",
        "stage-04-opening-story",
        "stage-04-objective-reached",
        "stage-04-victory-story",
        "stage-04-completed-route",
      ],
    };
    expect(isSaveData(current)).toBe(true);
    expect(isSaveData({ ...current, consumedEventIds: current.consumedEventIds.slice(0, -1) }))
      .toBe(false);
  });

  it("accepts stage-05 and native scene-42 completion routes only with exact event identities", () => {
    const stage5Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-42-portal",
      stageLabel: "異世界之門",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-05-enter-deployment",
        "stage-05-opening-story",
        "stage-05-objective-reached",
        "stage-05-victory-story",
        "stage-05-completed-route",
      ],
    };
    expect(isSaveData(stage5Completed)).toBe(true);

    const portalCompleted: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-06",
      stageLabel: "過異世界之門",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-42-nia-move",
        "stage-42-arrival-story",
        "stage-42-confrontation-story",
        "stage-42-gadirath-move",
        "stage-42-intervention-story",
        "stage-42-lightning",
        "stage-42-departures",
        "stage-42-departure-story",
        "stage-42-completed-route",
      ],
    };
    expect(isSaveData(portalCompleted)).toBe(true);
    expect(isSaveData({
      ...portalCompleted,
      consumedEventIds: portalCompleted.consumedEventIds.slice(0, -1),
    })).toBe(false);

    const stage6Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-07",
      stageLabel: "來到異世界",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-06-enter-deployment",
        "stage-06-prebattle-story",
        "stage-06-opening-story",
        "stage-06-objective-reached",
        "stage-06-retreat-story",
        "stage-06-reinforcements",
        "stage-06-ranger-leader-move",
        "stage-06-alliance-story",
        "stage-06-completed-route",
      ],
    };
    expect(isSaveData(stage6Completed)).toBe(true);
    expect(isSaveData({ ...stage6Completed, stageLabel: "下一關" })).toBe(false);

    const stage7Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-08",
      stageLabel: "營地遭到偷襲",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-07-prebattle-story",
        "stage-07-enter-deployment",
        "stage-07-objective-reached",
        "stage-07-completed-route",
      ],
    };
    expect(isSaveData(stage7Completed)).toBe(true);
    expect(isSaveData({
      ...stage7Completed,
      consumedEventIds: stage7Completed.consumedEventIds.slice(0, -1),
    })).toBe(false);

    const stage8Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-09",
      stageLabel: "找尋傳說中的飛船",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-08-prebattle-story",
        "stage-08-opening-story",
        "stage-08-objective-reached",
        "stage-08-victory-story",
        "stage-08-completed-route",
      ],
    };
    expect(isSaveData(stage8Completed)).toBe(true);
    expect(isSaveData({
      ...stage8Completed,
      consumedEventIds: stage8Completed.consumedEventIds.slice(0, -1),
    })).toBe(false);

    const stage9Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-11",
      stageLabel: "拯救蘇蘭達",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-09-enter-deployment",
        "stage-09-opening-story",
        "stage-09-objective-reached",
        "stage-09-victory-story",
        "stage-09-completed-route",
      ],
    };
    expect(isSaveData(stage9Completed)).toBe(true);
    expect(isSaveData({ ...stage9Completed, stageLabel: "第 10 關" })).toBe(false);

    const stage11Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-10",
      stageLabel: "飛船上遭遇敵人",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-11-opening-story",
        "stage-11-dori-departure",
        "stage-11-objective-reached",
        "stage-11-victory-story",
        "stage-11-completed-route",
      ],
    };
    expect(isSaveData(stage11Completed)).toBe(true);
    expect(isSaveData({
      ...stage11Completed,
      consumedEventIds: stage11Completed.consumedEventIds.slice(0, -1),
    })).toBe(false);

    const stage10Completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-12",
      stageLabel: "落入沼澤",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-10-prebattle-story",
        "stage-10-enter-deployment",
        "stage-10-objective-reached",
        "stage-10-completed-route",
      ],
    };
    expect(isSaveData(stage10Completed)).toBe(true);
    expect(isSaveData({ ...stage10Completed, stageLabel: "下一關" })).toBe(false);
  });

  it("validates stage 9 battle saves with Dori's template class in the live roster", () => {
    const save = stage9BattleSave();
    expect(save.roster.find(({ slot }) => slot === 9)).toMatchObject({
      classId: "curse-master", experience: 299,
    });
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({
      ...save,
      roster: save.roster.map((entry) => entry.slot === 9
        ? { ...entry, classId: "soldier" as const }
        : entry),
    })).toBe(false);
  });

  it("validates stage 11 battle saves only after Dori's story departure", () => {
    const save = stage11BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.some(({ id }) => id === "1:9")).toBe(false);
    expect(save.battle.units.find(({ id }) => id === "2:40")).toMatchObject({
      classId: "cavalry",
      x: 32,
      y: 48,
    });
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-11-opening-story"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:8"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:40"
          ? { ...unit, classId: "soldier" as const, className: "士兵" }
          : unit),
      },
    })).toBe(false);

    const saturated = stage11BattleSave(40);
    expect(saturated.battle.units.find(({ id }) => id === "2:79"))
      .toMatchObject({ classId: "soldier" });
    expect(isSaveData(saturated)).toBe(true);
  });

  it("validates stage 10 deployment saves and all five fixed enemy classes", () => {
    const save = stage10BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-10-prebattle-story"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:20"
          ? { ...unit, classId: "pegasus-warrior" as const, className: "飛馬戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 12 water-warrior split groups and rejects forged shared state", () => {
    const save = stage12BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ id }) => id.startsWith("2:40"))).toHaveLength(2);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "2:40"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:40:split-1"
          ? { ...unit, life: unit.life - 1 }
          : unit),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: [
          ...save.battle.units,
          ...[2, 3].map((index) => ({
            ...save.battle.units.find(({ id }) => id === "2:40:split-1")!,
            id: `2:40:split-${index}`,
            x: 36 + index,
            y: 16,
          })),
          {
            ...save.battle.units.find(({ id }) => id === "2:40:split-1")!,
            id: "2:40:split-4",
            x: 40,
            y: 16,
          },
        ],
      },
    })).toBe(false);
  });

  it("validates stage 14 deployment, opening event, and all seven enemy classes", () => {
    const save = stage14BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-14-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:8"
          ? { ...unit, classId: "divine-sword-warrior" as const, className: "神劍戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 15 deployment, opening event, and all ten enemy classes", () => {
    const save = stage15BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-15-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:9"
          ? { ...unit, classId: "great-axe-warrior" as const, className: "巨斧戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 16 deployment, opening event, and all thirteen enemy classes", () => {
    const save = stage16BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(13);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-16-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:10"
          ? { ...unit, classId: "great-axe-warrior" as const, className: "巨斧戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 17 deployment, opening event, and all twelve enemy classes", () => {
    const save = stage17BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(12);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-17-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:11"
          ? { ...unit, classId: "great-axe-warrior" as const, className: "巨斧戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 18 deployment, opening event, and all sixteen enemy classes", () => {
    const save = stage18BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(16);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-18-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:12"
          ? { ...unit, classId: "great-axe-warrior" as const, className: "巨斧戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 19 deployment, opening event, and all twenty-one enemy classes", () => {
    const save = stage19BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
    expect(isSaveData({
      ...save,
      consumedEventIds: ["stage-19-enter-deployment"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:13"
          ? { ...unit, classId: "great-axe-warrior" as const, className: "巨斧戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("validates stage 22 only after the complete six-enemy ambush", () => {
    const save = stage22BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:1"]);
    expect(save.battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
      .toEqual(["2:2", "2:28", "2:40", "2:41", "2:42", "2:43"]);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:28"
          ? { ...unit, classId: "magic-priest" as const, className: "魔祭師" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-23 boundary only with the complete stage-22 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-23",
      stageLabel: "死亡之谷中",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage22BattleSave().consumedEventIds,
        "stage-22-objective-reached",
        "stage-22-postbattle-story",
        "stage-22-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 23 only with its opening identity and exact static guard roster", () => {
    const save = stage23BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:7"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:48"
          ? { ...unit, classId: "crossbow" as const, className: "連弩兵" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-24 boundary only with the complete stage-23 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-24",
      stageLabel: "死亡之谷城堡前",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage23BattleSave().consumedEventIds,
        "stage-23-objective-reached",
        "stage-23-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 24 only with its opening identity and exact static guard roster", () => {
    const save = stage24BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0", "1:7"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(22);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:31"
          ? { ...unit, classId: "crossbow" as const, className: "連弩兵" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-26 boundary only with the complete stage-24 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-26",
      stageLabel: "遭遇碧娜維姬",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage24BattleSave().consumedEventIds,
        "stage-24-objective-reached",
        "stage-24-victory-story",
        "stage-24-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 26 only with its opening identity and exact static enemy roster", () => {
    const save = stage26BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:1", "1:0", "1:8", "1:7"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(8);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:1"
          ? { ...unit, classId: "magic-priest" as const, className: "魔祭師" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-27 boundary only with the complete stage-26 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-27",
      stageLabel: "趕回瓦爾克麗城",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage26BattleSave().consumedEventIds,
        "stage-26-objective-reached",
        "stage-26-victory-story",
        "stage-26-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 27 only with its opening identity and exact fixed forces", () => {
    const save = stage27BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual([
        "1:22", "1:41", "1:44", "1:43", "1:45", "1:42", "1:40",
        "1:57", "1:56", "1:58", "1:0",
      ]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(save.battle.units.find(({ id }) => id === "1:22")).toMatchObject({
      classId: "great-axe-warrior",
      name: "愛莉歐拉",
      portrait: 57,
      displayIdentity: "named-class-portrait",
    });
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "1:22"
          ? { ...unit, name: "巨斧戰士", displayIdentity: undefined }
          : unit),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:40"
          ? { ...unit, classId: "magic-priest" as const, className: "魔祭師" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-28 boundary only with the complete stage-27 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-28",
      stageLabel: "保衛瓦爾克麗城",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage27BattleSave().consumedEventIds,
        "stage-27-objective-reached",
        "stage-27-victory-story",
        "stage-27-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 28 only with its full opening identity and exact static attackers", () => {
    const save = stage28BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(17);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:41"
          ? { ...unit, classId: "magic-sword-warrior" as const, className: "魔劍戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-29 boundary only with the complete stage-28 identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-29",
      stageLabel: "騎士城堡前",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage28BattleSave().consumedEventIds,
        "stage-28-objective-reached",
        "stage-28-victory-story",
        "stage-28-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 29 with only its prebattle/deployment identity and exact static defenders", () => {
    const save = stage29BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:0"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
    expect(save.battle.units.find(({ id }) => id === "1:22")).toBeUndefined();
    expect(save.consumedEventIds).toEqual([
      "stage-29-prebattle-story",
      "stage-29-enter-deployment",
    ]);
    expect(isSaveData({
      ...save,
      consumedEventIds: [...save.consumedEventIds, "stage-29-opening-story"],
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:4"
          ? { ...unit, classId: "swift-dragon-knight" as const, className: "迅龍騎士" }
          : unit),
      },
    })).toBe(false);
  });

  it("migrates v56 stage-29 battle identity to Eliola's named class portrait", () => {
    const current = stage29BattleSave();
    const slot22 = {
      slot: 22,
      position: STAGE29_DEFINITION.deployment.openCells[0]!,
      fixed: false,
    };
    const source = {
      stageId: "stage-29" as const,
      ruleset: "stableRemake" as const,
      difficulty: current.difficulty,
      rngState: current.rngState,
      rngCalls: current.rngCalls,
      roster: current.roster,
    };
    const battle = new Stage29Battle(source, {
      placements: [
        ...STAGE29_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
          slot, position: { ...position }, fixed: true,
        })),
        slot22,
      ],
    });
    const legacyUnits = battle.serializableSnapshot().units.map((unit) => {
      if (unit.id !== "1:22") return unit;
      const { displayIdentity: _displayIdentity, ...legacy } = unit;
      return { ...legacy, name: "巨斧戰士" };
    });
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 56,
      contentVersion: "stage-29-knight-castle-front-1",
      battle: { ...current.battle, units: legacyUnits },
    }));

    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-29",
    });
    if (migrated?.kind !== "battle") throw new Error("expected migrated stage 29 battle");
    expect(migrated.battle.units.find(({ id }) => id === "1:22")).toMatchObject({
      name: "愛莉歐拉",
      portrait: 57,
      displayIdentity: "named-class-portrait",
    });

    const currentWithoutIdentity = {
      ...migrated,
      battle: {
        ...migrated.battle,
        units: migrated.battle.units.map((unit) => unit.id === "1:22"
          ? { ...unit, displayIdentity: undefined }
          : unit),
      },
    };
    expect(isSaveData(currentWithoutIdentity)).toBe(false);
    expect(parseSaveData(JSON.stringify(currentWithoutIdentity))).toBeUndefined();
  });

  it("accepts the stage-30 boundary only with stage 29's story-free completion identity", () => {
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-30",
      stageLabel: "治癒維斯塔女帝",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage29BattleSave().consumedEventIds,
        "stage-29-objective-reached",
        "stage-29-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: [
        ...completed.consumedEventIds.slice(0, -1),
        "stage-29-victory-story",
        "stage-29-completed-route",
      ],
    })).toBe(false);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 30 only after its opening mutation and with a legal Vesta form", () => {
    const save = stage30BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:40", "1:7", "1:0"]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toEqual([
      expect.objectContaining({
        id: "2:27",
        classId: "soldier",
        name: "維絲塔",
        portrait: 41,
        experience: 0,
      }),
    ]);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    for (const patch of [
      { experience: 1 },
      { name: "士兵" },
      { displayIdentity: "named-class-portrait" as const },
      { portrait: classFallbackPortraitFor("soldier", 2) },
      {
        classId: "wizard" as const,
        className: className("wizard"),
        portrait: 41,
      },
    ]) {
      expect(isSaveData({
        ...save,
        battle: {
          ...save.battle,
          units: save.battle.units.map((unit) => unit.id === "2:27"
            ? { ...unit, ...patch }
            : unit),
        },
      })).toBe(false);
    }
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "2:27"),
      },
    })).toBe(false);
  });

  it("accepts every difficulty's last resumable stage 30 form", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const save = stage30BattleSave(difficulty);
      const classId = STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY[difficulty].at(-1)!;
      expect(isSaveData({
        ...save,
        battle: {
          ...save.battle,
          units: save.battle.units.map((unit) => unit.id === "2:27"
            ? {
                ...unit,
                classId,
                className: className(classId),
                portrait: 41,
                life: 1,
              }
            : unit),
        },
      }), `difficulty ${difficulty}, ${classId}`).toBe(true);
    }
  });

  it("accepts the stage-31 boundary only with stage 30's complete event identity", () => {
    const stage31Roster = stage31BattleSave().roster;
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-31",
      stageLabel: "前往斯德林海峽",
      roster: stage31Roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage30BattleSave().consumedEventIds,
        "stage-30-objective-reached",
        "stage-30-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("validates stage 31's deployment, fixed allies, ambushers, and resume identity", () => {
    const save = stage31BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1)).toHaveLength(17);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
    expect(save.battle.units.find(({ id }) => id === "2:5")).toMatchObject({
      classId: "demon-dragon-knight",
      name: "菲伊魯茵",
      portrait: 25,
    });
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:4"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:5"
          ? { ...unit, classId: "half-dragon-warrior" as const, className: "半龍戰士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-32 boundary only with stage 31's complete event identity", () => {
    const current = stage31BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-32",
      stageLabel: "斯德林海峽",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-31-objective-reached",
        "stage-31-victory-story",
        "stage-31-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-31-victory-story",
      ),
    })).toBe(false);
  });

  it("validates stage 32's deployment, named knights, static army, and resume identity", () => {
    const save = stage32BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1)).toHaveLength(16);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(18);
    expect(save.battle.units.find(({ id }) => id === "2:5")).toMatchObject({
      classId: "demon-dragon-knight",
      name: "菲伊魯茵",
      portrait: 25,
    });
    expect(save.battle.units.find(({ id }) => id === "2:6")).toMatchObject({
      classId: "demon-dragon-knight",
      name: "芙瑪羅妮",
      portrait: 11,
    });
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:0"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:6"
          ? { ...unit, classId: "flying-dragon-knight" as const, className: "飛龍騎士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-33 boundary only with stage 32's complete event identity", () => {
    const current = stage32BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-33",
      stageLabel: "拉那洛城外",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-32-objective-reached",
        "stage-32-victory-story",
        "stage-32-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-32-victory-story",
      ),
    })).toBe(false);
  });

  it("validates stage 33's ten-unit deployment, 29 static guards, and resume identity", () => {
    const save = stage33BattleSave();
    const swiftDragonPortrait = classFallbackPortraitFor("swift-dragon-knight", 2);
    if (swiftDragonPortrait === undefined) throw new Error("missing swift-dragon enemy portrait");
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(29);
    expect(save.battle.units.find(({ id }) => id === "2:55")).toMatchObject({
      classId: "demon-dragon-knight",
    });
    expect(save.battle.units.find(({ id }) => id === "2:23")).toMatchObject({
      classId: "swift-dragon-knight", name: "阿莉絲", portrait: 30,
    });
    expect(save.battle.units.find(({ id }) => id === "2:24")).toMatchObject({
      classId: "swift-dragon-knight", name: "瑪西爾", portrait: 31,
    });
    expect(save.battle.units.filter(
      ({ side, classId }) => side === 2 && classId === "magic-armor-warrior",
    )).toHaveLength(5);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:0"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:23"
          ? { ...unit, name: "迅龍騎士", portrait: swiftDragonPortrait }
          : unit),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:55"
          ? { ...unit, classId: "flying-dragon-knight" as const, className: "飛龍騎士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-34 boundary only with stage 33's complete event identity", () => {
    const current = stage33BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-34",
      stageLabel: "拉那洛城內",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-33-objective-reached",
        "stage-33-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-33-objective-reached",
      ),
    })).toBe(false);
  });

  it("validates stage 34's eleven-unit deployment, 19 static enemies, and resume identity", () => {
    const save = stage34BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1)).toHaveLength(11);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(19);
    expect(save.battle.units.find(({ id }) => id === "2:6")).toMatchObject({
      classId: "great-dragon-knight", name: "芙瑪羅妮", portrait: 11,
    });
    expect(save.battle.units.find(({ id }) => id === "2:7")).toMatchObject({
      classId: "evil-sword-warrior", name: "蕾娜吉芙", portrait: 24,
    });
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:0"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:7"
          ? { ...unit, classId: "flying-dragon-knight" as const, className: "飛龍騎士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-35 boundary only with stage 34's complete event identity", () => {
    const current = stage34BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-35",
      stageLabel: "時空異變",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-34-objective-reached",
        "stage-34-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-34-objective-reached",
      ),
    })).toBe(false);
  });

  it("validates stage 35's fixed nine allies, ten behavior-12 enemies, and resume identity", () => {
    const save = stage35BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1).map(({ slot }) => slot).sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 7, 8, 18]);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(save.battle.units.find(({ id }) => id === "2:39")).toMatchObject({
      classId: "land-knight",
    });
    expect(save.battle.units.find(({ id }) => id === "2:38")).toMatchObject({
      classId: "demon-dragon-knight",
    });
    expect(isSaveData({ ...save, consumedEventIds: [] })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:18"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:38"
          ? { ...unit, classId: "flying-dragon-knight" as const, className: "飛龍騎士" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-36 boundary only with stage 35's complete event identity", () => {
    const current = stage35BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-36",
      stageLabel: "異世界的碧娜維姬",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-35-objective-reached",
        "stage-35-victory-story",
        "stage-35-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-35-victory-story",
      ),
    })).toBe(false);
  });

  it("validates stage 36's deployment, 30 static enemies, and resume identity", () => {
    const save = stage36BattleSave();
    expect(isSaveData(save)).toBe(true);
    expect(save.battle.units.filter(({ side }) => side === 1)).toHaveLength(28);
    expect(save.battle.units.filter(({ side }) => side === 2)).toHaveLength(30);
    expect(save.battle.units.find(({ id }) => id === "2:1")).toMatchObject({
      classId: "wizard", name: "碧娜維姬", portrait: 8,
    });
    expect(save.battle.units.filter(
      ({ side, classId }) => side === 2 && classId === "wizard",
    )).toHaveLength(6);
    expect(isSaveData({
      ...save,
      consumedEventIds: save.consumedEventIds.slice(0, -1),
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.filter(({ id }) => id !== "1:0"),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:1"
          ? { ...unit, classId: "magic-master" as const, className: "魔法大師" }
          : unit),
      },
    })).toBe(false);
  });

  it("accepts the stage-37 boundary only with stage 36's complete event identity", () => {
    const current = stage36BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-37",
      stageLabel: "究極女神",
      roster: current.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...current.consumedEventIds,
        "stage-36-objective-reached",
        "stage-36-completed-route",
      ],
    };
    expect(isSaveData(completed)).toBe(true);
    expect(isSaveData({
      ...completed,
      consumedEventIds: completed.consumedEventIds.filter(
        (id) => id !== "stage-36-objective-reached",
      ),
    })).toBe(false);
  });

  it("migrates legal v69 through v65 saves without changing simulation state", () => {
    const battle = stage36BattleSave();
    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-37",
      stageLabel: "究極女神",
      roster: battle.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...battle.consumedEventIds,
        "stage-36-objective-reached",
        "stage-36-completed-route",
      ],
    };
    const legacyIdentities = [
      { version: 69, contentVersion: "expert-target-priority-ai-1" },
      { version: 68, contentVersion: "expert-focus-fire-ai-3" },
      { version: 67, contentVersion: "expert-focus-fire-ai-2" },
      { version: 66, contentVersion: "expert-focus-fire-ai-1" },
      { version: 65, contentVersion: "stage-36-bina-vige-otherworld-1" },
    ] as const;
    for (const identity of legacyIdentities) {
      expect(parseSaveData(JSON.stringify({ ...battle, ...identity }))).toEqual(battle);
      expect(parseSaveData(JSON.stringify({ ...completed, ...identity }))).toEqual(completed);
    }
    expect(parseSaveData(JSON.stringify({
      ...battle,
      version: 69,
      contentVersion: "wrong-v69-identity",
    }))).toBeUndefined();
  });

  it("migrates v64 stage 36 boundaries but rejects forged stage 36 battles and stage 37", () => {
    const currentStage36 = stage36BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-36",
      stageLabel: "異世界的碧娜維姬",
      roster: currentStage36.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage35BattleSave().consumedEventIds,
        "stage-35-objective-reached",
        "stage-35-victory-story",
        "stage-35-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 64,
      contentVersion: "stage-35-time-space-anomaly-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-36",
    });
    expect(parseSaveData(JSON.stringify({
      ...currentStage36,
      version: 64,
      contentVersion: "stage-35-time-space-anomaly-1",
    }))).toBeUndefined();

    const forgedStage37: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-37",
      stageLabel: "究極女神",
      roster: currentStage36.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage36.consumedEventIds,
        "stage-36-objective-reached",
        "stage-36-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage37,
      version: 64,
      contentVersion: "stage-35-time-space-anomaly-1",
    }))).toBeUndefined();
  });

  it("migrates v63 stage 35 boundaries but rejects forged stage 35 battles and stage 36", () => {
    const currentStage35 = stage35BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-35",
      stageLabel: "時空異變",
      roster: currentStage35.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage34BattleSave().consumedEventIds,
        "stage-34-objective-reached",
        "stage-34-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 63,
      contentVersion: "stage-34-lannal-castle-interior-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-35",
    });
    expect(parseSaveData(JSON.stringify({
      ...currentStage35,
      version: 63,
      contentVersion: "stage-34-lannal-castle-interior-1",
    }))).toBeUndefined();

    const forgedStage36: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-36",
      stageLabel: "異世界的碧娜維姬",
      roster: currentStage35.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage35.consumedEventIds,
        "stage-35-objective-reached",
        "stage-35-victory-story",
        "stage-35-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage36,
      version: 63,
      contentVersion: "stage-34-lannal-castle-interior-1",
    }))).toBeUndefined();
  });

  it("migrates v62 stage 34 boundaries but rejects forged stage 34 battles and stage 35", () => {
    const currentStage34 = stage34BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-34",
      stageLabel: "拉那洛城內",
      roster: currentStage34.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage33BattleSave().consumedEventIds,
        "stage-33-objective-reached",
        "stage-33-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 62,
      contentVersion: "stage-33-lannal-castle-outskirts-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-34",
    });
    expect(parseSaveData(JSON.stringify({
      ...currentStage34,
      version: 62,
      contentVersion: "stage-33-lannal-castle-outskirts-1",
    }))).toBeUndefined();

    const forgedStage35: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-35",
      stageLabel: "時空異變",
      roster: currentStage34.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage34.consumedEventIds,
        "stage-34-objective-reached",
        "stage-34-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage35,
      version: 62,
      contentVersion: "stage-33-lannal-castle-outskirts-1",
    }))).toBeUndefined();
  });

  it("migrates v61 stage 33 boundaries but rejects forged stage 33 battles and stage 34", () => {
    const currentStage33 = stage33BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-33",
      stageLabel: "拉那洛城外",
      roster: currentStage33.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage32BattleSave().consumedEventIds,
        "stage-32-objective-reached",
        "stage-32-victory-story",
        "stage-32-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 61,
      contentVersion: "stage-32-sterling-strait-alliance-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-33",
    });
    expect(parseSaveData(JSON.stringify({
      ...currentStage33,
      version: 61,
      contentVersion: "stage-32-sterling-strait-alliance-1",
    }))).toBeUndefined();

    const forgedStage34: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-34",
      stageLabel: "拉那洛城內",
      roster: currentStage33.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage33.consumedEventIds,
        "stage-33-objective-reached",
        "stage-33-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage34,
      version: 61,
      contentVersion: "stage-32-sterling-strait-alliance-1",
    }))).toBeUndefined();
  });

  it("migrates v60 stage 32 boundaries but rejects forged stage 32 battles", () => {
    const currentStage32 = stage32BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-32",
      stageLabel: "斯德林海峽",
      roster: currentStage32.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage31BattleSave().consumedEventIds,
        "stage-31-objective-reached",
        "stage-31-victory-story",
        "stage-31-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 60,
      contentVersion: "stage-31-sterling-strait-ambush-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-32",
    });
    expect(migrated?.roster[23]).toMatchObject({ classId: "empress", experience: 0 });
    expect(parseSaveData(JSON.stringify({
      ...currentStage32,
      version: 60,
      contentVersion: "stage-31-sterling-strait-ambush-1",
    }))).toBeUndefined();

    const forgedStage33: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-33",
      stageLabel: "拉那洛城外",
      roster: currentStage32.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage32.consumedEventIds,
        "stage-32-objective-reached",
        "stage-32-victory-story",
        "stage-32-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage33,
      version: 60,
      contentVersion: "stage-31-sterling-strait-ambush-1",
    }))).toBeUndefined();
  });

  it("migrates v59 stage 31 boundaries but rejects forged stage 31 battles", () => {
    const currentStage31 = stage31BattleSave();
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-31",
      stageLabel: "前往斯德林海峽",
      roster: currentStage31.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...stage30BattleSave().consumedEventIds,
        "stage-30-objective-reached",
        "stage-30-completed-route",
      ],
    };
    const migrated = parseSaveData(JSON.stringify({
      ...boundary,
      version: 59,
      contentVersion: "stage-30-vesta-fixed-portrait-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-31",
    });
    expect(migrated?.roster[23]).toMatchObject({
      classId: "empress",
      experience: 0,
    });
    expect(parseSaveData(JSON.stringify({
      ...currentStage31,
      version: 59,
      contentVersion: "stage-30-vesta-fixed-portrait-1",
    }))).toBeUndefined();

    const forgedStage32: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-32",
      stageLabel: "斯德林海峽",
      roster: currentStage31.roster,
      stageProgress: 1000,
      consumedEventIds: [
        ...currentStage31.consumedEventIds,
        "stage-31-objective-reached",
        "stage-31-victory-story",
        "stage-31-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...forgedStage32,
      version: 59,
      contentVersion: "stage-30-vesta-fixed-portrait-1",
    }))).toBeUndefined();
  });

  it("migrates v57 completed stage 30 boundaries but rejects forged stage 30 battles", () => {
    const boundary: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-30",
      stageLabel: "治癒維斯塔女帝",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage29BattleSave().consumedEventIds,
        "stage-29-objective-reached",
        "stage-29-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...boundary,
      version: 57,
      contentVersion: "stage-29-eliola-display-name-1",
    }))).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-30",
    });
    expect(parseSaveData(JSON.stringify({
      ...stage30BattleSave(),
      version: 57,
      contentVersion: "stage-29-eliola-display-name-1",
    }))).toBeUndefined();
  });

  it("migrates v58 stage 30 battles from the mistaken profession portrait to Vesta D/41", () => {
    const current = stage30BattleSave();
    const legacy = {
      ...current,
      version: 58,
      contentVersion: "stage-30-empress-purification-1",
      battle: {
        ...current.battle,
        units: current.battle.units.map((unit) => unit.side === 2 && unit.slot === 27
          ? {
              ...unit,
              portrait: classFallbackPortraitFor(unit.classId, 2),
              displayIdentity: "named-class-portrait",
            }
          : unit),
      },
    };
    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-30",
    });
    if (migrated?.kind !== "battle") throw new Error("expected migrated stage 30 battle");
    expect(migrated.battle.units.find(({ id }) => id === "2:27")).toMatchObject({
      name: "維絲塔",
      portrait: 41,
    });
    expect(migrated.battle.units.find(({ id }) => id === "2:27")?.displayIdentity).toBeUndefined();

    expect(parseSaveData(JSON.stringify({
      ...legacy,
      battle: {
        ...legacy.battle,
        units: legacy.battle.units.map((unit) => unit.id === "2:27"
          ? { ...unit, portrait: 41 }
          : unit),
      },
    }))).toBeUndefined();
  });

  it("migrates v55 stage-28 saves and repairs the mandatory post-stage-27 defender class", () => {
    const current = stage28BattleSave();
    const soldierMaximumLife = classStatsFor({ classId: "soldier", experience: 0 }).maxLife;
    const legacyRoster = current.roster.map((entry) => entry.slot === 22
      ? { ...entry, classId: "soldier" as const, life: soldierMaximumLife - 17 }
      : entry);
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 55,
      contentVersion: "stage-28-valkyrie-defense-1",
      roster: legacyRoster,
      stageEntrySnapshot: {
        ...current.stageEntrySnapshot,
        roster: current.stageEntrySnapshot.roster.map((entry) => entry.slot === 22
          ? { ...entry, classId: "soldier", life: soldierMaximumLife }
          : entry),
      },
    }));

    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-28",
    });
    if (migrated?.kind !== "battle") throw new Error("expected migrated stage 28 battle");
    expect(migrated.roster[22]).toMatchObject({
      classId: "great-axe-warrior",
      life: classStatsFor({ classId: "great-axe-warrior", experience: 0 }).maxLife - 17,
    });
    expect(migrated.stageEntrySnapshot.roster[22]).toMatchObject({
      classId: "great-axe-warrior",
      life: classStatsFor({ classId: "great-axe-warrior", experience: 0 }).maxLife,
    });
  });

  it("rejects a forged v55 stage-29 battle that the old content identity never shipped", () => {
    const current = stage29BattleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 55,
      contentVersion: "stage-28-valkyrie-defense-1",
    }))).toBeUndefined();
  });

  it("migrates v54 saves to the stage 28 Valkyrie-defense identity", () => {
    const current = stage27BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 54,
      contentVersion: "stage-27-first-round-sentry-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-27",
    });
  });

  it("migrates v53 saves to the stage 27 defender-delay identity", () => {
    const current = stage27BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 53,
      contentVersion: "class-role-ranged-tactics-ai-1",
      battle: { ...current.battle, round: 2 },
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-27",
      battle: { round: 2 },
    });
  });

  it("migrates v52 saves through the class-role ranged-tactics identity", () => {
    const current = stage27BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 52,
      contentVersion: "expert-approach-caster-positioning-ai-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-27",
    });
  });

  it("migrates v51 saves through the expert caster-positioning identity", () => {
    const current = stage27BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 51,
      contentVersion: "stage-27-valkyrie-return-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-27",
    });
  });

  it("migrates v50 saves through the stage 27 content identity", () => {
    const current = stage26BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 50,
      contentVersion: "stage-26-column-push-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-26",
    });
  });

  it("migrates v49 saves to the stage 26 content identity", () => {
    const current = stage24BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 49,
      contentVersion: "stage-23-campaign-class-baseline-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-24",
    });
  });

  it("migrates v47 saves to the stage 24 content identity", () => {
    const current = stage24BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 47,
      contentVersion: "expert-path-distance-ai-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-24",
    });
  });

  it("migrates v48 stage 23+ saves by restoring Kins's magic-priest class", () => {
    const current = stage24BattleSave();
    const soldierLife = classStatsFor({ classId: "soldier", experience: 0 }).maxLife;
    const legacyRoster = current.roster.map((entry) => entry.slot === 7
      ? { ...entry, classId: "soldier" as const, experience: 0, life: soldierLife - 23 }
      : entry);
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 48,
      contentVersion: "stage-24-castle-approach-1",
      roster: legacyRoster,
      stageEntrySnapshot: {
        ...current.stageEntrySnapshot,
        roster: current.stageEntrySnapshot.roster.map((entry) => entry.slot === 7
          ? { ...entry, classId: "soldier", experience: 0, life: soldierLife }
          : entry),
      },
      battle: {
        ...current.battle,
        units: current.battle.units.map((unit) => unit.side === 1 && unit.slot === 7
          ? {
            ...unit,
            classId: "soldier",
            className: "士兵",
            experience: 0,
            life: soldierLife - 23,
          }
          : unit),
      },
    }));

    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-24",
    });
    if (migrated?.kind !== "battle") throw new Error("expected migrated stage 24 battle");
    expect(migrated.stageEntrySnapshot.roster[7]).toMatchObject({
      classId: "magic-priest", experience: 0, life: 305,
    });
    expect(migrated.roster[7]).toMatchObject({
      classId: "magic-priest", experience: 0, life: 282,
    });
    expect(migrated.battle.units.find(({ side, slot }) => side === 1 && slot === 7))
      .toMatchObject({ classId: "magic-priest", experience: 0, life: 282 });
  });

  it("migrates v44 saves to the stage 23 content identity", () => {
    const current = stage22BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 44,
      contentVersion: "stage-22-village-ambush-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-22",
    });
  });

  it("migrates v45 stage 22→23 saves across the postbattle-story boundary", () => {
    const currentBattle = stage23BattleSave();
    const migratedBattle = parseSaveData(JSON.stringify({
      ...currentBattle,
      version: 45,
      contentVersion: "stage-23-death-valley-breakthrough-1",
      consumedEventIds: ["stage-23-prebattle-story", ...currentBattle.consumedEventIds],
    }));
    expect(migratedBattle).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-23",
      consumedEventIds: ["stage-23-enter-deployment", "stage-23-opening-story"],
    });

    const currentCompleted: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-23",
      stageLabel: "死亡之谷中",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage22BattleSave().consumedEventIds,
        "stage-22-objective-reached",
        "stage-22-postbattle-story",
        "stage-22-completed-route",
      ],
    };
    const migratedCompleted = parseSaveData(JSON.stringify({
      ...currentCompleted,
      version: 45,
      contentVersion: "stage-23-death-valley-breakthrough-1",
      consumedEventIds: currentCompleted.consumedEventIds
        .filter((id) => id !== "stage-22-postbattle-story"),
    }));
    expect(migratedCompleted).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-23",
      consumedEventIds: currentCompleted.consumedEventIds,
    });

    const currentStage24: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-24",
      stageLabel: "死亡之谷城堡前",
      stageProgress: 1000,
      consumedEventIds: [
        ...stage23BattleSave().consumedEventIds,
        "stage-23-objective-reached",
        "stage-23-completed-route",
      ],
    };
    const migratedStage24 = parseSaveData(JSON.stringify({
      ...currentStage24,
      version: 45,
      contentVersion: "stage-23-death-valley-breakthrough-1",
      consumedEventIds: ["stage-23-prebattle-story", ...currentStage24.consumedEventIds],
    }));
    expect(migratedStage24).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      stageId: "stage-24",
      consumedEventIds: currentStage24.consumedEventIds,
    });
  });

  it("migrates v43 saves to the stage 23 content identity", () => {
    const current = stage19BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 43,
      contentVersion: "stage-21-scout-interlude-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-19",
    });
  });

  it("migrates v42 saves to the stage 22 content identity", () => {
    const current = stage19BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 42,
      contentVersion: "stage-20-dragon-wd-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-19",
    });
  });

  it("migrates v41 saves to the stage 22 content identity", () => {
    const current = stage19BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 41,
      contentVersion: "stage-19-dragon-tower-ai-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-19",
    });
  });

  it("migrates v40 saves to the stage 19 content identity", () => {
    const current = stage18BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 40,
      contentVersion: "stage-18-dragon-tower-li-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-18",
    });
  });

  it("migrates v39 saves to the stage 18 content identity", () => {
    const current = stage17BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 39,
      contentVersion: "stage-17-dragon-tower-qian-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-17",
    });
  });

  it("migrates v38 saves to the stage 17 content identity", () => {
    const current = stage16BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 38,
      contentVersion: "stage-16-dragon-tower-sha-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-16",
    });
  });

  it("migrates v37 saves to the stage 16 content identity", () => {
    const current = stage15BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 37,
      contentVersion: "stage-15-dragon-tower-lan-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-15",
    });
  });

  it("migrates v36 saves to the stage 15 content identity", () => {
    const current = stage14BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 36,
      contentVersion: "stage-14-dragon-tower-fang-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-14",
    });
  });

  it("migrates v35 saves to the stage 14 content identity", () => {
    const current = stage12BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 35,
      contentVersion: "stage-13-dragon-tower-marsiel-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-12",
    });
  });

  it("migrates v34 stage 12 saves to the stage 13 content identity", () => {
    const current = stage12BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 34,
      contentVersion: "stage-12-swamp-water-warriors-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-12",
    });
  });

  it("migrates v33 stage 10 saves through to the stage 13 content identity", () => {
    const current = stage10BattleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 33,
      contentVersion: "stage-10-airship-pursuit-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-10",
    });
  });

  it("migrates the v19 stage-06 boundary label into its playable title", () => {
    const current: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-06",
      stageLabel: "過異世界之門",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-42-nia-move",
        "stage-42-arrival-story",
        "stage-42-confrontation-story",
        "stage-42-gadirath-move",
        "stage-42-intervention-story",
        "stage-42-lightning",
        "stage-42-departures",
        "stage-42-departure-story",
        "stage-42-completed-route",
      ],
    };
    const legacy = {
      ...current,
      version: 19,
      contentVersion: "stage-05-portal-1",
      stageLabel: "第 6 關",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates the version-14 stage-4 boundary into the playable stage label", () => {
    const current: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-04",
      stageLabel: "通過力場",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-03-opening-story",
        "stage-03-player-ready",
        "stage-03-fourth-corps-joined",
        "stage-03-boss-defeated",
        "stage-03-victory-story",
        "stage-03-completed-route",
      ],
    };
    const legacy = {
      ...current,
      version: 14,
      contentVersion: "stage-03-recovery-1",
      stageLabel: "下一關",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates a version-15 stage-4 battle and corrects its shifted title", () => {
    const current = stage4BattleSave();
    const legacy = {
      ...current,
      version: 15,
      contentVersion: "stage-04-force-field-1",
      stageLabel: "遭遇丁塔琪",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates a version-15 stage-2 battle to the non-sequential original title", () => {
    const current = stage2BattleSave();
    const legacy = {
      ...current,
      version: 15,
      contentVersion: "stage-04-force-field-1",
      stageLabel: "救援友軍",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("recovers Gadirath's promoted class from a version-15 battle entry snapshot", () => {
    const current = stage4BattleSave();
    const currentUnit = current.battle.units.find(({ id }) => id === "1:24")!;
    const promotedClass = "evil-mage" as const;
    const promotedExperience = 1_050;
    const currentLife = 150;
    currentUnit.classId = promotedClass;
    currentUnit.className = className(promotedClass);
    currentUnit.experience = promotedExperience;
    currentUnit.life = currentLife;
    current.roster[24] = {
      ...current.roster[24],
      classId: promotedClass,
      experience: promotedExperience,
      life: currentLife,
    };
    current.stageEntrySnapshot.roster[24] = {
      ...current.stageEntrySnapshot.roster[24],
      classId: promotedClass,
      experience: promotedExperience,
      life: currentLife,
    };

    const legacy = {
      ...structuredClone(current),
      version: 15,
      contentVersion: "stage-04-force-field-1",
      stageLabel: "遭遇丁塔琪",
    };
    const legacyUnit = legacy.battle.units.find(({ id }) => id === "1:24")!;
    legacyUnit.classId = "magician";
    legacyUnit.className = className("magician");
    legacy.roster[24] = { ...legacy.roster[24], classId: "magician" };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates the version-13 stage-3 boundary into the playable stage label", () => {
    const current: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-03",
      stageLabel: "救援友軍",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-02-opening-story",
        "stage-02-boss-defeated",
        "stage-02-victory-story",
        "stage-02-completed-route",
      ],
    };
    const legacy = {
      ...current,
      version: 13,
      contentVersion: "stage-entry-snapshot-1",
      stageLabel: "下一關",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-12 battles by adopting their current campaign as the entry baseline", () => {
    const current = battleSave();
    const { stageEntrySnapshot: _stageEntrySnapshot, ...legacy } = current;
    const version12 = {
      ...legacy,
      version: 12,
      contentVersion: "stage-02-allied-auto-1",
    };

    expect(parseSaveData(JSON.stringify(version12))).toEqual(current);
  });

  it("strictly validates the stage-entry snapshot identity and campaign state", () => {
    const missingSnapshot = battleSave();
    delete (missingSnapshot as Partial<BattleSaveData>).stageEntrySnapshot;
    expect(isSaveData(missingSnapshot)).toBe(false);

    const wrongStage = battleSave();
    wrongStage.stageEntrySnapshot.stageId = "stage-01";
    expect(isSaveData(wrongStage)).toBe(false);

    const wrongDifficulty = battleSave();
    wrongDifficulty.stageEntrySnapshot.difficulty = 1;
    expect(isSaveData(wrongDifficulty)).toBe(false);

    const invalidRng = battleSave();
    invalidRng.stageEntrySnapshot.rngState = 0;
    expect(isSaveData(invalidRng)).toBe(false);
  });

  it("round-trips an active ice action-disable byte", () => {
    const current = stage1BattleSave();
    current.battle.units.find(({ id }) => id === "2:16")!.actionDisabled = true;
    expect(parseSaveData(JSON.stringify(current))).toEqual(current);
  });

  it("migrates version-10 frozen units into the outer-ring rules identity", () => {
    const current = stage1BattleSave();
    current.battle.units.find(({ id }) => id === "2:16")!.actionDisabled = true;
    const legacy = {
      ...current,
      version: 10,
      contentVersion: "stage-01-frozen-dispel-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-9 frozen units without clearing their active state", () => {
    const current = stage1BattleSave();
    current.battle.units.find(({ id }) => id === "2:16")!.actionDisabled = true;
    const legacy = {
      ...current,
      version: 9,
      contentVersion: "stage-01-ice-lock-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-8 units by adding the ice action-disable state", () => {
    const current = stage1BattleSave();
    const legacy = {
      ...current,
      version: 8,
      contentVersion: "stage-01-ai-3",
      battle: {
        ...current.battle,
        units: current.battle.units.map(({ actionDisabled: _actionDisabled, ...unit }) => unit),
      },
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-7 stage-1 AI state from observable battle activity", () => {
    const dormantCurrent = stage1BattleSave();
    const { enemyAi: _dormantAi, ...dormantBattleWithIce } = dormantCurrent.battle;
    const dormantBattle = {
      ...dormantBattleWithIce,
      units: dormantBattleWithIce.units.map(({ actionDisabled: _actionDisabled, ...unit }) => unit),
    };
    const dormantLegacy = {
      ...dormantCurrent,
      version: 7,
      contentVersion: "stage-01-actions-1",
      battle: dormantBattle,
    };
    expect(parseSaveData(JSON.stringify(dormantLegacy))).toEqual(dormantCurrent);

    const activeCurrent = stage1BattleSave();
    const guard = activeCurrent.battle.units.find(({ id }) => id === "2:40")!;
    guard.x += 1;
    const { enemyAi: _activeAi, ...activeBattleWithIce } = activeCurrent.battle;
    const activeBattle = {
      ...activeBattleWithIce,
      units: activeBattleWithIce.units.map(({ actionDisabled: _actionDisabled, ...unit }) => unit),
    };
    const activeLegacy = {
      ...activeCurrent,
      version: 7,
      contentVersion: "stage-01-actions-1",
      battle: activeBattle,
    };
    const migrated = parseSaveData(JSON.stringify(activeLegacy));
    expect(migrated?.kind).toBe("battle");
    if (migrated?.kind !== "battle") throw new Error("expected migrated battle save");
    expect(migrated.battle.enemyAi).toEqual({
      activeGroupIds: ["castle-guard"],
      pendingNoticeGroupIds: [],
      fangPursuitRound: activeLegacy.battle.round,
    });

    const damagedCurrent = stage1BattleSave();
    damagedCurrent.battle.units.find(({ id }) => id === "2:40")!.life -= 1;
    const { enemyAi: _damagedAi, ...damagedBattleWithIce } = damagedCurrent.battle;
    const damagedBattle = {
      ...damagedBattleWithIce,
      units: damagedBattleWithIce.units.map(({ actionDisabled: _actionDisabled, ...unit }) => unit),
    };
    const damagedLegacy = {
      ...damagedCurrent,
      version: 7,
      contentVersion: "stage-01-actions-1",
      battle: damagedBattle,
    };
    const damagedMigrated = parseSaveData(JSON.stringify(damagedLegacy));
    expect(damagedMigrated?.kind).toBe("battle");
    if (damagedMigrated?.kind !== "battle") throw new Error("expected migrated battle save");
    expect(damagedMigrated.battle.enemyAi?.fangPursuitRound).toBe(
      damagedLegacy.battle.round + 1,
    );
  });

  it("strictly correlates stage-1 deployment, events and completed route state", () => {
    const missingFixedUnit = stage1BattleSave();
    missingFixedUnit.battle.units = missingFixedUnit.battle.units.filter(({ id }) => id !== "1:42");
    expect(isSaveData(missingFixedUnit)).toBe(false);

    const promotedGadirath = stage1BattleSave();
    const magician = promotedGadirath.battle.units.find(({ id }) => id === "1:24")!;
    magician.classId = "wizard";
    magician.className = className("wizard");
    magician.experience = 1_050;
    magician.life = classStatsFor(magician).maxLife;
    promotedGadirath.roster[24] = {
      ...promotedGadirath.roster[24],
      classId: magician.classId,
      experience: magician.experience,
      life: magician.life,
    };
    expect(isSaveData(promotedGadirath)).toBe(true);

    const skippedOpening = stage1BattleSave();
    skippedOpening.consumedEventIds.pop();
    expect(isSaveData(skippedOpening)).toBe(false);

    const completedStage1 = stage1BattleSave();
    const completedRoute: CompletedSaveData = {
      format: completedStage1.format,
      version: completedStage1.version,
      contentVersion: completedStage1.contentVersion,
      kind: "completed",
      savedAt: completedStage1.savedAt,
      saveCount: completedStage1.saveCount,
      stageId: "stage-02",
      stageLabel: "攻打騎士堡",
      ruleset: completedStage1.ruleset,
      difficulty: completedStage1.difficulty,
      rngState: completedStage1.rngState,
      rngCalls: completedStage1.rngCalls,
      roster: completedStage1.roster,
      recordCounters: [...completedStage1.recordCounters],
      stageProgress: 1000,
      consumedEventIds: STAGE1_DEFINITION.events.map(({ id }) => id),
    };
    expect(isSaveData(completedRoute)).toBe(true);
    expect(isSaveData({
      ...completedRoute,
      consumedEventIds: completedRoute.consumedEventIds.slice(0, -1),
    })).toBe(false);
  });

  it("round-trips stage-2 fixed battles and rejects missing automatic allies", () => {
    const save = stage2BattleSave();
    save.battle.units.find(({ id }) => id === "1:44")!.acted = true;
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);

    const missingAutomatic = stage2BattleSave();
    missingAutomatic.battle.units = missingAutomatic.battle.units
      .filter(({ id }) => id !== "1:44");
    expect(isSaveData(missingAutomatic)).toBe(false);

    const wrongOpening = stage2BattleSave();
    wrongOpening.consumedEventIds = [];
    expect(isSaveData(wrongOpening)).toBe(false);
  });

  it("bounds a saved round by the stage cap and refuses version-86 battles past it", () => {
    // REMAKE-110: 战中档只能在玩家阶段写出，越过上限就没有下一个玩家阶段，
    // 所以合法回合号正好是 1..99。
    const atCap = battleSave();
    atCap.battle.round = STAGE_ROUND_LIMIT;
    expect(isSaveData(atCap)).toBe(true);

    const pastCap = battleSave();
    pastCap.battle.round = STAGE_ROUND_LIMIT + 1;
    expect(isSaveData(pastCap)).toBe(false);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 86,
      contentVersion: "stage-3-fourth-corps-promotion-ready-1",
    }))).toEqual(completed);

    const legacyAtCap = { ...battleSave(), battle: { ...battleSave().battle, round: STAGE_ROUND_LIMIT } };
    expect(parseSaveData(JSON.stringify({
      ...legacyAtCap,
      version: 86,
      contentVersion: "stage-3-fourth-corps-promotion-ready-1",
    }))).toEqual(legacyAtCap);

    // 停在上限之后的 v86 战中档明确拒绝：把回合号钳回 99 会让玩家在一个它从未打出的
    // 判负前一回合复活，没有诚实的改写方式。
    const legacyPastCap = { ...battleSave(), battle: { ...battleSave().battle, round: STAGE_ROUND_LIMIT + 5 } };
    expect(parseSaveData(JSON.stringify({
      ...legacyPastCap,
      version: 86,
      contentVersion: "stage-3-fourth-corps-promotion-ready-1",
    }))).toBeUndefined();
  });

  it("carries version-88 saves forward when the fourth corps changes its doctrine", () => {
    // REMAKE-111 only changes how stage 3's automatic corps plans its phase.
    // Nothing about that plan is saved. The later REMAKE-126 migration still
    // removes stage 3's obsolete difficulty seed; all other state is retained.
    const stage3 = stage3BattleSave();
    const legacyStage3 = legacySeededStage3BattleSave();
    expect(parseSaveData(JSON.stringify({
      ...legacyStage3,
      version: 88,
      contentVersion: "stage-3-fourth-corps-joined-1",
    }))).toEqual(stage3);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 88,
      contentVersion: "stage-3-fourth-corps-joined-1",
    }))).toEqual(completed);
  });

  it("carries version-90 saves forward when the named-leader boundary moves", () => {
    // REMAKE-118 swaps one AI boundary for another — the leader gets its
    // move-then-attack back and a landing bound instead. Neither half is
    // stored, so every v90 save migrates untouched.
    const battle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...battle,
      version: 90,
      contentVersion: "expert-attack-down-melee-targeting-1",
    }))).toEqual(battle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 90,
      contentVersion: "expert-attack-down-melee-targeting-1",
    }))).toEqual(completed);
  });

  it("repairs stage 33's omitted named enemies while migrating version-91 saves", () => {
    const legacy = stage33BattleSave();
    const genericPortrait = classFallbackPortraitFor("swift-dragon-knight", 2);
    if (genericPortrait === undefined) throw new Error("missing swift-dragon enemy portrait");
    legacy.battle.units = legacy.battle.units.map((unit) => unit.id === "2:23" || unit.id === "2:24"
      ? { ...unit, name: "迅龍騎士", portrait: genericPortrait }
      : unit);
    const migrated = parseSaveData(JSON.stringify({
      ...legacy,
      version: 91,
      contentVersion: "named-leader-line-hold-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-33",
    });
    if (!migrated || migrated.kind !== "battle") throw new Error("stage 33 v91 migration failed");
    expect(migrated.battle.units.find(({ id }) => id === "2:23")).toMatchObject({
      name: "阿莉絲", portrait: 30,
    });
    expect(migrated.battle.units.find(({ id }) => id === "2:24")).toMatchObject({
      name: "瑪西爾", portrait: 31,
    });

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 91,
      contentVersion: "named-leader-line-hold-1",
    }))).toEqual(completed);
  });

  it("restores Eliola's stage-27 name while migrating version-92 saves", () => {
    const legacy = stage27BattleSave();
    legacy.battle.units = legacy.battle.units.map((unit) => {
      if (unit.id !== "1:22") return unit;
      const { displayIdentity: _displayIdentity, ...generic } = unit;
      return { ...generic, name: "巨斧戰士" };
    });
    const migrated = parseSaveData(JSON.stringify({
      ...legacy,
      version: 92,
      contentVersion: "stage-33-named-enemies-1",
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-27",
    });
    if (!migrated || migrated.kind !== "battle") throw new Error("stage 27 v92 migration failed");
    expect(migrated.battle.units.find(({ id }) => id === "1:22")).toMatchObject({
      name: "愛莉歐拉",
      portrait: 57,
      displayIdentity: "named-class-portrait",
    });

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 92,
      contentVersion: "stage-33-named-enemies-1",
    }))).toEqual(completed);
  });

  it("carries version-93 saves through the boss poison rules identity", () => {
    const battle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...battle,
      version: 93,
      contentVersion: "stage-27-eliola-display-name-1",
    }))).toEqual(battle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 93,
      contentVersion: "stage-27-eliola-display-name-1",
    }))).toEqual(completed);
  });

  it("carries version-94 saves through the stomp kill-experience identity", () => {
    const battle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...battle,
      version: 94,
      contentVersion: "boss-poison-one-third-1",
    }))).toEqual(battle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 94,
      contentVersion: "boss-poison-one-third-1",
    }))).toEqual(completed);
  });

  it("migrates version-96 saves through lightning and selective stage-3 seeding", () => {
    const stage3 = previouslyUnseededStage3BattleSave();
    expect(parseSaveData(JSON.stringify({
      ...stage3,
      version: 96,
      contentVersion: "stage-03-native-enemy-level-1",
    }))).toEqual(stage3BattleSave());

    const otherBattle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...otherBattle,
      version: 96,
      contentVersion: "stage-03-native-enemy-level-1",
    }))).toEqual(otherBattle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 96,
      contentVersion: "stage-03-native-enemy-level-1",
    }))).toEqual(completed);
  });

  it("restores the stage-3 seed in non-lawless version-97 battles", () => {
    const difficulty = 2 as const;
    const previous = previouslyUnseededStage3BattleSave(difficulty);
    const previousUnits = previous.battle.units.map((unit) => {
      if (unit.side === 1 || unit.id !== "2:42") return { ...unit };
      const earned = { ...unit, experience: 23 };
      return { ...earned, life: statsFor(earned, difficulty).maxLife - 17 };
    });
    const migrated = parseSaveData(JSON.stringify({
      ...previous,
      version: 97,
      contentVersion: "lightning-tier-experience-1",
      battle: { ...previous.battle, units: previousUnits },
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-03",
      difficulty,
    });
    if (!migrated || migrated.kind !== "battle") throw new Error("stage 3 v97 migration failed");
    for (const enemy of migrated.battle.units.filter(({ side }) => side === 2)) {
      const earnedExperience = enemy.id === "2:42" ? 23 : 0;
      const damage = enemy.id === "2:42" ? 17 : 0;
      expect(enemy.experience, enemy.id)
        .toBe(initialEnemyExperience(enemy.classId, difficulty) + earnedExperience);
      expect(enemy.life, enemy.id).toBe(statsFor(enemy, difficulty).maxLife - damage);
    }

    const otherBattle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...otherBattle,
      version: 97,
      contentVersion: "lightning-tier-experience-1",
    }))).toEqual(otherBattle);

    const lawless = previouslyUnseededStage3BattleSave(3);
    expect(parseSaveData(JSON.stringify({
      ...lawless,
      version: 97,
      contentVersion: "lightning-tier-experience-1",
    }))).toEqual(lawless);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 97,
      contentVersion: "lightning-tier-experience-1",
    }))).toEqual(completed);
  });

  it("migrates version-98 saves into the native stage-4 reinforcement identity", () => {
    const current = stage4BattleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 98,
      contentVersion: "stage-03-lawless-enemy-level-1",
    }))).toEqual(current);

    const withReinforcements = stage4BattleSave(4);
    expect(withReinforcements.battle.round).toBe(5);
    expect(withReinforcements.battle.units.filter(({ side }) => side === 2)
      .map(({ id }) => id)).toEqual(["2:40", "2:41", "2:30", "2:31"]);
    expect(isSaveData(withReinforcements)).toBe(true);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 98,
      contentVersion: "stage-03-lawless-enemy-level-1",
    }))).toEqual(completed);
  });

  it("migrates version-99 saves without changing battle state for spent-leader eligibility", () => {
    const current = battleSave();
    const migrated = parseSaveData(JSON.stringify({
      ...current,
      version: 99,
      contentVersion: "stage-04-native-reinforcements-1",
    }));
    expect(migrated).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 99,
      contentVersion: "stage-04-native-reinforcements-1",
    }))).toEqual(completed);
  });

  it("migrates version-100 saves without changing battle state for route-cost cohesion", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 100,
      contentVersion: "follow-leader-spent-anchor-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 100,
      contentVersion: "follow-leader-spent-anchor-1",
    }))).toEqual(completed);
  });

  it("migrates version-101 saves without changing battle state for strict player cohesion", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 101,
      contentVersion: "follow-leader-path-route-cost-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 101,
      contentVersion: "follow-leader-path-route-cost-1",
    }))).toEqual(completed);
  });

  it("migrates version-102 saves without changing battle state for follow-leader shooting", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 102,
      contentVersion: "follow-leader-player-cohesion-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 102,
      contentVersion: "follow-leader-player-cohesion-1",
    }))).toEqual(completed);
  });

  it("migrates version-103 saves without changing battle state for the stage 9 escort route", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 103,
      contentVersion: "follow-leader-post-move-shooting-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 103,
      contentVersion: "follow-leader-post-move-shooting-1",
    }))).toEqual(completed);
  });

  it("migrates version-104 saves without changing battle state for shared-body kill rewards", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 104,
      contentVersion: "stage-09-escort-valley-route-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 104,
      contentVersion: "stage-09-escort-valley-route-1",
    }))).toEqual(completed);
  });

  it("migrates version-108 saves without changing battle state for the water warrior movement mode", () => {
    // REMAKE-141 只改水戰士的移动传播模式；存档字段含义不变，续战时移动图由棋盘重算，
    // 因此 v108 战中档与完成档无损迁移。
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 108,
      contentVersion: "enemy-magic-guard-lifecycle-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 108,
      contentVersion: "enemy-magic-guard-lifecycle-1",
    }))).toEqual(completed);
  });

  it("migrates version-107 saves without changing battle state for the enemy magic guard lifecycle", () => {
    // REMAKE-140 只把 side 2 施放的防魔计数改为 2。战中档只在玩家阶段写出，旧规则下
    // side 2 的防魔那一刻恒为 0，没有需要改写的字段，因此 v107 战中档与完成档无损迁移。
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 107,
      contentVersion: "named-leader-line-holders-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 107,
      contentVersion: "named-leader-line-holders-1",
    }))).toEqual(completed);
  });

  it("migrates version-106 saves without changing battle state for the named leader line", () => {
    // REMAKE-139 只改具名主将护卫半径的「阵线」成员判据，规划从公开状态重算，
    // 棋盘、状态与 PRNG 都不动，因此 v106 战中档与完成档无损迁移。
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 106,
      contentVersion: "shooting-cast-experience-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 106,
      contentVersion: "shooting-cast-experience-1",
    }))).toEqual(completed);
  });

  it("migrates version-105 saves without changing battle state for shooting cast experience", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 105,
      contentVersion: "shared-body-kill-reward-1",
    }))).toEqual(current);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 105,
      contentVersion: "shared-body-kill-reward-1",
    }))).toEqual(completed);
  });

  it("removes the old stage-3 difficulty seed while migrating legacy saves", () => {
    const current = stage3BattleSave();
    const difficulty = 3 as const;
    const legacyUnits = current.battle.units.map((unit) => {
      if (unit.side === 1) return { ...unit };
      const earnedExperience = unit.id === "2:42" ? 23 : 0;
      const experience = initialEnemyExperience(unit.classId, difficulty) + earnedExperience;
      const seeded = { ...unit, experience };
      const damage = unit.id === "2:42" ? 17 : 0;
      return {
        ...seeded,
        life: statsFor(seeded, difficulty).maxLife - damage,
      };
    });
    const legacy = {
      ...current,
      version: 95,
      contentVersion: "stomp-kill-experience-1",
      difficulty,
      stageEntrySnapshot: { ...current.stageEntrySnapshot, difficulty },
      battle: { ...current.battle, units: legacyUnits },
    };

    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      stageId: "stage-03",
      difficulty,
    });
    if (!migrated || migrated.kind !== "battle") throw new Error("stage 3 v95 migration failed");
    for (const enemy of migrated.battle.units.filter(({ side }) => side === 2)) {
      const earnedExperience = enemy.id === "2:42" ? 23 : 0;
      const damage = enemy.id === "2:42" ? 17 : 0;
      expect(enemy.experience, enemy.id).toBe(earnedExperience);
      expect(enemy.life, enemy.id).toBe(statsFor(enemy, difficulty).maxLife - damage);
    }

    const migratedVersion94 = parseSaveData(JSON.stringify({
      ...legacy,
      version: 94,
      contentVersion: "boss-poison-one-third-1",
    }));
    expect(migratedVersion94?.kind === "battle"
      ? migratedVersion94.battle.units.find(({ id }) => id === "2:42")?.experience
      : undefined).toBe(23);

    const otherBattle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...otherBattle,
      version: 95,
      contentVersion: "stomp-kill-experience-1",
    }))).toEqual(otherBattle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 95,
      contentVersion: "stomp-kill-experience-1",
    }))).toEqual(completed);

    const nonLawless = legacySeededStage3BattleSave(1);
    const migratedNonLawless = parseSaveData(JSON.stringify({
      ...nonLawless,
      version: 95,
      contentVersion: "stomp-kill-experience-1",
    }));
    expect(migratedNonLawless?.kind === "battle"
      ? migratedNonLawless.battle.units.filter(({ side }) => side === 2)
        .every((enemy) => enemy.experience === initialEnemyExperience(enemy.classId, 1))
      : false).toBe(true);
  });

  it("carries version-89 saves forward when SA narrows its target set", () => {
    // REMAKE-116 only narrows which enemy the AI may pick for SA. Like
    // REMAKE-102 on the buff side it stores nothing, so every v89 save —
    // mid-battle and completed alike — migrates untouched.
    const battle = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...battle,
      version: 89,
      contentVersion: "fourth-corps-rally-hold-1",
    }))).toEqual(battle);

    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 89,
      contentVersion: "fourth-corps-rally-hold-1",
    }))).toEqual(completed);
  });

  it("backfills the stage-3 opening events a legacy save predates", () => {
    // REMAKE-109 turned the fourth corps' promotion moment into two opening
    // events. Older saves predate the ids, so they are marked consumed rather
    // than replayed: that run built its board before the rule existed and its
    // trio never received the point, and firing the grant on load would hand out
    // a promotion the run never reached.
    const battle = stage3BattleSave();
    const seededBattle = legacySeededStage3BattleSave();
    const legacyBattle = {
      ...seededBattle,
      version: 87,
      contentVersion: "stage-round-limit-99-1",
      consumedEventIds: ["stage-03-opening-story"],
    };
    expect(parseSaveData(JSON.stringify(legacyBattle))).toEqual(battle);

    const completed: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-04",
      stageLabel: "通過力場",
      stageProgress: 1000,
      consumedEventIds: [
        "stage-03-opening-story",
        "stage-03-player-ready",
        "stage-03-fourth-corps-joined",
        "stage-03-boss-defeated",
        "stage-03-victory-story",
        "stage-03-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 87,
      contentVersion: "stage-round-limit-99-1",
      consumedEventIds: [
        "stage-03-opening-story",
        "stage-03-boss-defeated",
        "stage-03-victory-story",
        "stage-03-completed-route",
      ],
    }))).toEqual(completed);

    // 事件补录不碰名冊与 PRNG；REMAKE-129 另行修正分档经验／生命上限。
    const legacyRoster = stage3BattleSave().roster;
    expect(parseSaveData(JSON.stringify(legacyBattle))?.roster).toEqual(legacyRoster);

    // 其他关卡的存档不受影响。
    const stage0 = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...stage0,
      version: 87,
      contentVersion: "stage-round-limit-99-1",
    }))).toEqual(stage0);
  });

  it("carries version-84 saves forward but refuses stage-2/3 battles whose slots moved", () => {
    // REMAKE-108 changed which campaign slots garrison stages 2 and 3, so a v84
    // board inside either stage no longer matches its schema. Everything else —
    // completed saves and battles in other stages — migrates untouched.
    const completed: CompletedSaveData = { ...completedSave() };
    expect(parseSaveData(JSON.stringify({
      ...completed,
      version: 84,
      contentVersion: "control-zone-occupied-gap-1",
    }))).toEqual(completed);

    const stage0 = battleSave();
    expect(parseSaveData(JSON.stringify({
      ...stage0,
      version: 84,
      contentVersion: "control-zone-occupied-gap-1",
    }))).toEqual(stage0);

    // 旧的第 2 关棋盘还带着 1:40..1:43，新的 schema 只接受 1:51..1:54。
    const legacyStage2 = stage2BattleSave();
    legacyStage2.battle.units = legacyStage2.battle.units.map((unit) => {
      const moved = new Map([[51, 43], [52, 41], [53, 40], [54, 42]]).get(unit.slot);
      return moved === undefined ? unit : { ...unit, id: `1:${moved}`, slot: moved };
    });
    expect(parseSaveData(JSON.stringify({
      ...legacyStage2,
      version: 84,
      contentVersion: "control-zone-occupied-gap-1",
    }))).toBeUndefined();
  });

  it("migrates version-11 stage-1 completion into the playable stage-2 label", () => {
    const current: CompletedSaveData = {
      ...completedSave(),
      stageId: "stage-02",
      stageLabel: "攻打騎士堡",
      stageProgress: 1000,
      consumedEventIds: STAGE1_DEFINITION.events.map(({ id }) => id),
    };
    const legacy = {
      ...current,
      version: 11,
      contentVersion: "stage-01-ice-outer-ring-1",
      stageLabel: "下一關",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-5 semantic saves by adding empty status state", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 5,
      contentVersion: "native-classes-1",
      roster: current.roster.filter(({ slot }) => slot === 0),
      battle: {
        ...current.battle,
        units: current.battle.units.map(({
          statuses: _statuses,
          actionDisabled: _actionDisabled,
          ...unit
        }) => unit),
      },
    };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("round-trips promoted semantic classes with reset experience and retained life", () => {
    const promoted = battleSave();
    promoted.roster[0] = { ...promoted.roster[0], classId: "sister", experience: 0 };
    promoted.battle.units[0] = {
      ...promoted.battle.units[0],
      classId: "sister",
      className: "修女",
      experience: 0,
    };

    expect(parseSaveData(JSON.stringify(promoted))).toEqual(promoted);
  });

  it("migrates version-2 stage-0 ally and enemy stats while preserving missing life", () => {
    const current = battleSave();
    // v2 敌方迁移按「保留已损失生命」重算：新上限 − 旧缺口。旧生命由当前难度反推，
    // 这样难度表调整后本用例仍在验证迁移语义，而不是某个具体数字。
    const currentEnemy = current.battle.units[1];
    const legacyEnemyMaximumLife = classStatsFor({
      classId: currentEnemy.classId,
      experience: 0,
    }).maxLife;
    const legacyEnemyLife = legacyEnemyMaximumLife
      - (statsFor(currentEnemy, current.difficulty).maxLife - currentEnemy.life);
    const legacy = {
      ...legacyBattleSave(current, 2),
      roster: legacyBattleSave(current, 2).roster.map((entry) => entry.slot === 0
        ? { ...entry, experience: 100, life: 140 }
        : { ...entry }),
      battle: {
        ...legacyBattleSave(current, 2).battle,
        units: legacyBattleSave(current, 2).battle.units.map((unit) => {
          if (unit.side === 2) return { ...unit, experience: 0, life: legacyEnemyLife };
          if (unit.slot === 0) return { ...unit, experience: 100, life: 140 };
          return { ...unit };
        }),
      },
    };

    expect(isSaveData(legacy)).toBe(false);
    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated).toEqual(current);
    expect(parseSaveData(JSON.stringify(migrated))).toEqual(current);
  });

  it("migrates version-3 named allies without reseeding already-correct enemies", () => {
    const current = battleSave();
    const version3 = legacyBattleSave(current, 3);
    const legacy = {
      ...version3,
      roster: [{ ...version3.roster[0], experience: 100, life: 140 }],
      battle: {
        ...version3.battle,
        units: version3.battle.units.map((unit) => unit.side === 1
          ? { ...unit, experience: 100, life: 140 }
          : { ...unit }),
      },
    };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-3 completed rosters to the named-ally experience floor", () => {
    const current = completedSave();
    const version3 = legacyCompletedSave(current, 3);
    const legacy = {
      ...version3,
      roster: [{ ...version3.roster[0], experience: 20, life: 140 }],
    };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("maps version-4 native class records to stable semantic IDs", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify(legacyBattleSave(current, 4)))).toEqual(current);
  });

  it("rejects malformed JSON and shallow lookalikes", () => {
    expect(parseSaveData("{")).toBeUndefined();
    expect(isSaveData({
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      kind: "battle",
      difficulty: 0,
      battle: { phase: "player" },
    })).toBe(false);
  });

  it("rejects invalid PRNG, map and identity boundaries", () => {
    const zeroRng = battleSave();
    zeroRng.rngState = 0;
    expect(isSaveData(zeroRng)).toBe(false);

    const offMap = battleSave();
    offMap.battle.units[0].x = 50;
    expect(isSaveData(offMap)).toBe(false);

    const mismatchedId = battleSave();
    mismatchedId.battle.units[0].id = "1:7";
    expect(isSaveData(mismatchedId)).toBe(false);

    const unseededEnemy = battleSave();
    unseededEnemy.battle.units[1].experience = 0;
    expect(isSaveData(unseededEnemy)).toBe(false);

    const underseededNia = battleSave();
    underseededNia.roster[0].experience = 100;
    underseededNia.battle.units[0].experience = 100;
    expect(isSaveData(underseededNia)).toBe(false);

    const overfullEnemy = battleSave();
    const enemy = overfullEnemy.battle.units[1];
    overfullEnemy.battle.units[1].life = statsFor(enemy, overfullEnemy.difficulty).maxLife + 1;
    expect(isSaveData(overfullEnemy)).toBe(false);

    const invalidStatus = battleSave();
    invalidStatus.battle.units[0].statuses.magicGuard = -1;
    expect(isSaveData(invalidStatus)).toBe(false);

    const invalidPortrait = battleSave();
    invalidPortrait.battle.units[0].portrait = 68 as never;
    expect(isSaveData(invalidPortrait)).toBe(false);

    const invalidAi = stage1BattleSave();
    invalidAi.battle.enemyAi = {
      activeGroupIds: [],
      pendingNoticeGroupIds: ["castle-guard"],
      fangPursuitRound: null,
    };
    expect(isSaveData(invalidAi)).toBe(false);
  });

  it("rejects duplicate occupancy and roster snapshots that disagree with battle state", () => {
    const duplicateCell = battleSave();
    duplicateCell.battle.units[1].x = duplicateCell.battle.units[0].x;
    duplicateCell.battle.units[1].y = duplicateCell.battle.units[0].y;
    expect(isSaveData(duplicateCell)).toBe(false);

    const staleRoster = battleSave();
    staleRoster.roster[0].life = 139;
    expect(isSaveData(staleRoster)).toBe(false);
  });

  it("keeps completed and battle stage metadata correlated", () => {
    expect(isSaveData({ ...completedSave(), stageId: "stage-00" })).toBe(false);
    expect(isSaveData({ ...completedSave(), battle: battleSave().battle })).toBe(false);
    expect(isSaveData({ ...battleSave(), stageLabel: "下一關" })).toBe(false);
  });

  // 原版存档头的关卡编号 `1Ah`（DS:`2E77`，模块 29 的当前关卡）与回合号 `1Ch`
  // （DS:`2F83`，胜利保存时序列化成 1000）永远描述同一关，所以记录列表里的「完」必须
  // 配刚打完的那一关。完成档本身仍以「下一关入口」为身份，反查只发生在显示层。
  it("labels completed records with the cleared stage, not the next one", () => {
    expect(saveRecordStageLabel(battleSave())).toBe("瓦爾克麗宮");

    const cleared = completedSave();
    expect(cleared.stageId).toBe("stage-01");
    expect(cleared.stageLabel).toBe("騎士城堡前");
    expect(saveRecordStageLabel(cleared)).toBe("瓦爾克麗宮");

    // 主线最后两关的目的地不是可玩关卡，同样要反查回打完的那一关。
    expect(saveRecordStageLabel({
      ...cleared,
      stageId: "stage-49",
      stageLabel: "主線結局",
    })).toBe("究極女神");
    expect(saveRecordStageLabel({
      ...cleared,
      stageId: "stage-39",
      stageLabel: "製作人員表",
    })).toBe("異世界");
  });

  it("distinguishes empty, invalid and readable persistent slots", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
    };

    expect(readSaveSlot(storage, 1)).toEqual({ kind: "empty" });

    values.set(saveSlotKey(1), "{");
    expect(readSaveSlot(storage, 1)).toEqual({ kind: "invalid" });

    const save = battleSave();
    values.set(saveSlotKey(1), JSON.stringify(save));
    expect(readSaveSlot(storage, 1)).toEqual({ kind: "valid", save });
  });
});
