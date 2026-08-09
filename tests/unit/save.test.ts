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
  it("migrates v19 saves into the stage-06 content identity", () => {
    const current = battleSave();
    const legacy = {
      ...current,
      version: 19,
      contentVersion: "stage-05-portal-1",
    };
    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates v18 saves through the current stage-06 identity", () => {
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
