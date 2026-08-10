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
  saveSlotPageIndex,
  saveSlotPageStart,
  saveSlotKey,
} from "../../src/game/save";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import { className, classStatsFor } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
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
import type { BattleSaveData, CompletedSaveData } from "../../src/game/types";

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
    stageEntrySnapshot: {
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
          experience: 461,
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
      ...campaign,
      stageId: "stage-03",
      roster: campaign.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
    consumedEventIds: ["stage-03-opening-story"],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: himi.x, y: himi.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
};

const stage4BattleSave = (): BattleSaveData => {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: {
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
    stageEntrySnapshot: { ...source, roster: source.roster.map((entry) => ({ ...entry })) },
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
    stageEntrySnapshot: { ...source, roster: source.roster.map((entry) => ({ ...entry })) },
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
    const legacy = {
      ...legacyBattleSave(current, 2),
      roster: legacyBattleSave(current, 2).roster.map((entry) => entry.slot === 0
        ? { ...entry, experience: 100, life: 140 }
        : { ...entry }),
      battle: {
        ...legacyBattleSave(current, 2).battle,
        units: legacyBattleSave(current, 2).battle.units.map((unit) => {
          if (unit.side === 2) return { ...unit, experience: 0, life: 180 };
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
    overfullEnemy.battle.units[1].life = 271;
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
