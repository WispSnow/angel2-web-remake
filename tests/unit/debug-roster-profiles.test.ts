import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classStatsFor,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
} from "../../src/game/content/classes";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  campaignFromDebugSave,
  createDebugCampaignState,
  DEBUG_CAMPAIGN_MEMBERS,
  debugGrowthBudgetForStage,
  debugGrowthProgressionForSlot,
  debugRosterForProfile,
  debugRosterProfileSupportsGrowthOverride,
  debugRosterSourceOptions,
  DEFAULT_DEBUG_PER_STAGE_GROWTH,
  FIRST_STAGE_SCOPED_ALLY_SLOT,
  parseDebugPerStageGrowth,
  parseDebugRosterSourceId,
  type DebugGrowthProgression,
} from "../../src/game/debug-roster-profiles";
import {
  debugRosterStageId,
  debugScenarioUrl,
  debugStageLabel,
} from "../../src/game/debug-scenario-catalog";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveSlotKey } from "../../src/game/save";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";
import type { BattleSaveData, CompletedSaveData, StageId } from "../../src/game/types";

const stageIds = Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[];
const workspace = path.resolve(import.meta.dirname, "../..");

const memberFor = (slot: number) => {
  const member = DEBUG_CAMPAIGN_MEMBERS.find((candidate) => candidate.slot === slot);
  if (!member) throw new Error(`missing debug campaign member ${slot}`);
  return member;
};

/** 夾具契約：（當前關卡序數 − 入隊關卡序數，離隊後凍結）× 每關成長值。 */
const expectedBudget = (slot: number, stageId: StageId, perStageGrowth: number) => {
  const member = memberFor(slot);
  const ordinal = member.lastStageId === undefined
    ? STAGE_RUNTIME_MANIFEST[stageId].ordinal
    : Math.min(
      STAGE_RUNTIME_MANIFEST[stageId].ordinal,
      STAGE_RUNTIME_MANIFEST[member.lastStageId].ordinal,
    );
  return Math.max(0, ordinal - STAGE_RUNTIME_MANIFEST[member.joinStageId].ordinal)
    * perStageGrowth;
};

const spentBudget = (progression: DebugGrowthProgression) =>
  progression.promotions
    .slice(0, -1)
    .reduce(
      (total, classId) => total + promotionExperienceThresholdFor(classId),
      progression.experience,
    );

const completedStage3Save = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: SAVE_CONTENT_VERSION,
  kind: "completed",
  savedAt: "2026-08-04T12:00:00.000Z",
  saveCount: 3,
  stageId: "stage-04",
  stageLabel: "通過力場",
  ruleset: "stableRemake",
  difficulty: 1,
  rngState: 0x1234_5678,
  rngCalls: 42,
  roster: completeCampaignRoster([
    { slot: 0, classId: "swift-dragon-knight", experience: 321, life: 287 },
  ]),
  recordCounters: Array<number>(75).fill(0),
  stageProgress: 1000,
  consumedEventIds: [
    "stage-03-opening-story",
    "stage-03-boss-defeated",
    "stage-03-victory-story",
    "stage-03-completed-route",
  ],
});

function storageWith(entries: Readonly<Record<string, string>>): Pick<Storage, "getItem"> {
  return {
    getItem: (key) => entries[key] ?? null,
  };
}

describe("debug roster profiles", () => {
  it("compiles every deterministic profile into a complete serializable roster", () => {
    for (const stageId of stageIds) {
      for (const profileId of [
        "template-baseline",
        "representative-growth",
        "promotion-coverage",
      ] as const) {
        const roster = debugRosterForProfile(profileId, stageId);
        expect(roster).toHaveLength(75);
        expect(new Set(roster.map(({ slot }) => slot)).size).toBe(75);
        for (const entry of roster) {
          expect(entry.life).toBeLessThanOrEqual(
            classStatsFor({ classId: entry.classId, experience: entry.experience }).maxLife,
          );
        }
      }
    }
  });

  it("registers both growth profiles for every implemented stage after stage zero", () => {
    for (const stageId of stageIds.filter((candidate) => candidate !== "stage-00")) {
      for (const profileId of ["representative-growth", "promotion-coverage"] as const) {
        expect(
          debugRosterProfileSupportsGrowthOverride(profileId, stageId),
          `${stageId}/${profileId}`,
        ).toBe(true);
      }
    }
  });

  it("provides realistic stage-four growth and distinct map figures for its deep branches", async () => {
    const representative = debugRosterForProfile("representative-growth", "stage-04");
    expect(representative[0]).toMatchObject({ classId: "land-knight", experience: 640 });
    expect(representative[1]).toMatchObject({ classId: "priest", experience: 780 });
    expect(representative[24]).toMatchObject({ classId: "evil-mage", experience: 540 });

    const coverage = debugRosterForProfile("promotion-coverage", "stage-04");
    expect(coverage.filter(({ slot }) => [0, 1, 2, 3, 4, 20, 21, 24].includes(slot)))
      .toMatchObject([
        { classId: "swift-dragon-knight" },
        { classId: "magic-priest" },
        { classId: "crossbow" },
        { classId: "magic-armor-warrior" },
        { classId: "prayer-guide" },
        { classId: "flying-dragon-knight" },
        { classId: "evil-sword-warrior" },
        { classId: "wizard" },
      ]);
    for (const entry of coverage.filter(({ slot }) =>
      [0, 1, 2, 3, 4, 20, 21, 24].includes(slot))) {
      const source = ALLY_MAP_UNIT_ASSETS[entry.classId as keyof typeof ALLY_MAP_UNIT_ASSETS];
      expect(source).toMatch(/^\/assets\/original\//u);
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });

  it("spends one fixed per-stage budget through deterministic random promotion paths", () => {
    const perStageGrowth = 120;
    const stage5Budget = 600;
    expect(debugGrowthBudgetForStage("stage-00", perStageGrowth)).toBe(0);
    expect(debugGrowthBudgetForStage("stage-01", perStageGrowth)).toBe(120);
    expect(debugGrowthBudgetForStage("stage-02", perStageGrowth)).toBe(240);
    expect(debugGrowthBudgetForStage("stage-05", perStageGrowth)).toBe(stage5Budget);
    expect(debugGrowthBudgetForStage("stage-42-portal", perStageGrowth)).toBe(stage5Budget);
    expect(debugGrowthBudgetForStage("stage-06", perStageGrowth)).toBe(720);
    expect(debugGrowthBudgetForStage("stage-07", perStageGrowth)).toBe(840);
    expect(debugGrowthBudgetForStage("stage-08", perStageGrowth)).toBe(960);
    expect(debugGrowthBudgetForStage("stage-09", perStageGrowth)).toBe(1080);
    expect(debugGrowthBudgetForStage("stage-05", DEFAULT_DEBUG_PER_STAGE_GROWTH)).toBe(500);
    expect(debugGrowthBudgetForStage("stage-06", DEFAULT_DEBUG_PER_STAGE_GROWTH)).toBe(600);
    expect(debugGrowthBudgetForStage("stage-07", DEFAULT_DEBUG_PER_STAGE_GROWTH)).toBe(700);
    expect(debugGrowthBudgetForStage("stage-08", DEFAULT_DEBUG_PER_STAGE_GROWTH)).toBe(800);
    expect(debugGrowthBudgetForStage("stage-09", DEFAULT_DEBUG_PER_STAGE_GROWTH)).toBe(900);

    const soldierTargets = promotionTargetsFor("soldier").map(({ id }) => id);
    const stage1Progressions = [0, 1, 2, 4].map((slot) =>
      debugGrowthProgressionForSlot(
        "representative-growth",
        "stage-01",
        slot,
        perStageGrowth,
      ));
    expect(new Set(stage1Progressions.map(({ classId }) => classId)).size).toBeGreaterThan(1);
    for (const [index, progression] of stage1Progressions.entries()) {
      const slot = [0, 1, 2, 4][index] as number;
      expect(soldierTargets).toContain(progression.classId);
      // 妮雅與希蜜第 0 關就在隊，蒙欣曼與拉朵那第 1 關才入隊，入隊當關預算為 0。
      expect(progression.experience).toBe(expectedBudget(slot, "stage-01", perStageGrowth));
      expect(progression.promotions).toEqual([progression.classId]);
    }

    const roster = debugRosterForProfile(
      "representative-growth",
      "stage-05",
      perStageGrowth,
    );
    for (const slot of [0, 1, 2, 3, 4, 20, 21]) {
      const progression = debugGrowthProgressionForSlot(
        "representative-growth",
        "stage-05",
        slot,
        perStageGrowth,
      );
      const joinStageId = memberFor(slot).joinStageId;
      expect(progression.promotions[0]).toBe(
        debugGrowthProgressionForSlot(
          "representative-growth",
          joinStageId,
          slot,
          perStageGrowth,
        ).promotions[0],
      );
      const budget = expectedBudget(slot, "stage-05", perStageGrowth);
      expect(spentBudget(progression)).toBe(budget);
      expect(progression.experience).toBeLessThanOrEqual(budget);
      expect(budget).toBeLessThanOrEqual(stage5Budget);
      expect(roster[slot]).toMatchObject({
        classId: progression.classId,
        experience: progression.experience,
      });
      const entry = roster[slot];
      if (!entry) throw new Error(`missing debug roster slot ${slot}`);
      expect(entry.life).toBe(classStatsFor(entry).maxLife);
    }
    // 葛蒂拉斯第 2 關才被固定為魔術士，所以只累積三關預算且尚未達到 800 的轉職門檻。
    expect(roster[24]).toMatchObject({
      classId: "magician",
      experience: expectedBudget(24, "stage-05", perStageGrowth),
    });
    expect(roster[5]).toMatchObject({ classId: "soldier", experience: 0 });

    const stage6Roster = debugRosterForProfile(
      "representative-growth",
      "stage-06",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24]) {
      expect(stage6Roster[slot]?.classId).not.toBe("soldier");
    }
    const stage7Roster = debugRosterForProfile(
      "representative-growth",
      "stage-07",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24]) {
      expect(stage7Roster[slot]?.classId).not.toBe("soldier");
    }
    const stage8Roster = debugRosterForProfile(
      "representative-growth",
      "stage-08",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [17, 18]) expect(stage8Roster[slot]?.classId).not.toBe("soldier");
    const stage9Roster = debugRosterForProfile(
      "representative-growth",
      "stage-09",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [17, 18]) expect(stage9Roster[slot]?.classId).not.toBe("soldier");
    expect(debugRosterProfileSupportsGrowthOverride(
      "representative-growth",
      "stage-05",
    )).toBe(true);
    expect(debugRosterProfileSupportsGrowthOverride(
      "template-baseline",
      "stage-04",
    )).toBe(false);
    expect(() => debugRosterForProfile("template-baseline", "stage-04", perStageGrowth))
      .toThrow("沒有可覆蓋的友軍");
  });

  it("carries Sulanda's mandatory stage-eight cavalry baseline into later direct-entry profiles", () => {
    const profiles = [
      ["template-baseline", undefined],
      ["representative-growth", undefined],
      ["promotion-coverage", undefined],
    ] as const;

    for (const stageId of ["stage-11", "stage-10", "stage-12", "stage-13", "stage-14", "stage-15", "stage-16", "stage-17", "stage-18", "stage-19", "stage-20", "stage-21"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(roster[8], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`).toEqual({
          slot: 8,
          classId: "cavalry",
          experience: 299,
          life: classStatsFor({ classId: "cavalry", experience: 299 }).maxLife,
        });
      }
    }
  });

  it("carries mandatory Dori and water-warrior classes into later direct-entry profiles", () => {
    const profiles = [
      ["template-baseline", undefined],
      ["representative-growth", undefined],
      ["promotion-coverage", undefined],
    ] as const;

    for (const stageId of ["stage-11", "stage-10", "stage-12", "stage-13", "stage-14", "stage-15", "stage-16", "stage-17", "stage-18", "stage-19", "stage-20", "stage-21"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(roster[9], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`).toEqual({
          slot: 9,
          classId: "curse-master",
          experience: 299,
          life: classStatsFor({ classId: "curse-master", experience: 299 }).maxLife,
        });
      }
    }

    for (const stageId of ["stage-14", "stage-15", "stage-16", "stage-17", "stage-18", "stage-19", "stage-20", "stage-21"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        for (const [slot, classId] of [[10, "water-warrior"], [11, "water-warrior"]] as const) {
          expect(roster[slot], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}/${slot}`)
            .toEqual({
              slot,
              classId,
              experience: 299,
              life: classStatsFor({ classId, experience: 299 }).maxLife,
            });
        }
      }
    }
  });

  it("grows mandatory story recruits from their own join stage instead of freezing them", () => {
    const perStageGrowth = DEFAULT_DEBUG_PER_STAGE_GROWTH;
    // 強制劇情職業沒有轉職候選，所以整份預算都留在經驗上，可直接對照公式。
    const terminalRecruits = [
      { slot: 9, classId: "curse-master" },
      { slot: 10, classId: "water-warrior" },
      { slot: 11, classId: "water-warrior" },
      { slot: 7, classId: "magic-priest" },
      { slot: 22, classId: "great-axe-warrior" },
      { slot: 23, classId: "empress" },
      ...[25, 26, 27, 28, 29, 30, 31].map((slot) => ({
        slot,
        classId: "half-dragon-warrior" as const,
      })),
    ] as const;

    for (const profileId of ["representative-growth", "promotion-coverage"] as const) {
      for (const stageId of ["stage-22", "stage-23", "stage-28", "stage-31", "stage-38"] as const) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        for (const { slot, classId } of terminalRecruits) {
          const member = memberFor(slot);
          const joined = STAGE_RUNTIME_MANIFEST[stageId].ordinal
            >= STAGE_RUNTIME_MANIFEST[member.joinStageId].ordinal;
          if (!joined) continue;
          expect(roster[slot], `${profileId}/${stageId}/${slot}`).toEqual({
            slot,
            classId,
            experience: expectedBudget(slot, stageId, perStageGrowth),
            life: classStatsFor({
              classId,
              experience: expectedBudget(slot, stageId, perStageGrowth),
            }).maxLife,
          });
        }
      }
    }

    // 蘇蘭達的騎兵入隊職業仍能繼續轉職，預算同樣自第 8 關起算。
    for (const stageId of ["stage-10", "stage-22", "stage-38"] as const) {
      const progression = debugGrowthProgressionForSlot(
        "representative-growth",
        stageId,
        8,
        perStageGrowth,
      );
      expect(spentBudget(progression)).toBe(expectedBudget(8, stageId, perStageGrowth));
      expect(progression.promotions[0]).toBe("cavalry");
      expect(debugRosterForProfile("representative-growth", stageId, perStageGrowth)[8])
        .toMatchObject({ classId: progression.classId, experience: progression.experience });
    }
  });

  it("grows every joined campaign member and leaves later recruits on the stage template", () => {
    const perStageGrowth = DEFAULT_DEBUG_PER_STAGE_GROWTH;
    for (const profileId of ["representative-growth", "promotion-coverage"] as const) {
      for (const stageId of stageIds.filter((candidate) => candidate !== "stage-00")) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        const untouched = debugRosterForProfile(profileId, stageId);
        for (const member of DEBUG_CAMPAIGN_MEMBERS) {
          const entry = roster[member.slot];
          if (!entry) throw new Error(`missing debug roster slot ${member.slot}`);
          const label = `${profileId}/${stageId}/${member.slot}${member.name}`;
          if (
            STAGE_RUNTIME_MANIFEST[stageId].ordinal
              < STAGE_RUNTIME_MANIFEST[member.joinStageId].ordinal
          ) {
            expect(entry, label).toEqual(untouched[member.slot]);
            continue;
          }
          const progression = debugGrowthProgressionForSlot(
            profileId,
            stageId,
            member.slot,
            perStageGrowth,
          );
          expect(entry, label).toEqual({
            slot: member.slot,
            classId: progression.classId,
            experience: progression.experience,
            life: classStatsFor(progression).maxLife,
          });
          expect(spentBudget(progression), label)
            .toBe(expectedBudget(member.slot, stageId, perStageGrowth));
        }
      }
    }

    // 回歸：後期加入的角色以前完全沒有成長，只保留固定的 0／299 基線經驗。
    const lateJoiners = [7, 8, 9, 10, 11, 15, 16, 19, 22, 23, 25, 26, 27, 28, 29, 30, 31];
    const stage38 = debugRosterForProfile("representative-growth", "stage-38", perStageGrowth);
    const stage38Baseline = debugRosterForProfile("representative-growth", "stage-38");
    for (const slot of lateJoiners) {
      const entry = stage38[slot];
      if (!entry) throw new Error(`missing debug roster slot ${slot}`);
      expect(spentBudget(
        debugGrowthProgressionForSlot("representative-growth", "stage-38", slot, perStageGrowth),
      ), `stage-38/${slot}`).toBe(expectedBudget(slot, "stage-38", perStageGrowth));
      expect(entry.experience, `stage-38/${slot}`).toBeGreaterThan(0);
      expect(entry.classId, `stage-38/${slot}`).not.toBe("soldier");
      expect(entry, `stage-38/${slot}`).not.toEqual(stage38Baseline[slot]);
    }
  });

  it("freezes Gedilas at her stage-twenty departure instead of growing the traitor", () => {
    const perStageGrowth = DEFAULT_DEBUG_PER_STAGE_GROWTH;
    const departure = debugRosterForProfile("representative-growth", "stage-20", perStageGrowth);
    for (const stageId of ["stage-21", "stage-22", "stage-38"] as const) {
      expect(debugRosterForProfile("representative-growth", stageId, perStageGrowth)[24], stageId)
        .toEqual(departure[24]);
    }
    expect(expectedBudget(24, "stage-38", perStageGrowth))
      .toBe(expectedBudget(24, "stage-20", perStageGrowth));
  });

  it("registers a campaign member for every named deployable slot", async () => {
    const registered = new Map(DEBUG_CAMPAIGN_MEMBERS.map((member) => [member.slot, member]));
    expect(registered.size).toBe(DEBUG_CAMPAIGN_MEMBERS.length);

    for (const stageId of stageIds) {
      const { definition } = await STAGE_RUNTIME_MANIFEST[stageId].load();
      if (definition.deployment.kind !== "interactive") continue;
      for (const slot of definition.deployment.eligibleSlots) {
        const member = registered.get(slot);
        if (!member) {
          expect(slot, `${stageId} 未登記的名單槽 ${slot}`)
            .toBeGreaterThanOrEqual(FIRST_STAGE_SCOPED_ALLY_SLOT);
          continue;
        }
        const firstBoardStageId = member.firstBoardStageId ?? member.joinStageId;
        expect(
          STAGE_RUNTIME_MANIFEST[stageId].ordinal,
          `${stageId} 讓 ${member.name} 早於登場關 ${firstBoardStageId} 出場`,
        ).toBeGreaterThanOrEqual(STAGE_RUNTIME_MANIFEST[firstBoardStageId].ordinal);
      }
    }
  });

  it("inherits the stage-twenty debug professions into the stage-twenty-one interlude", () => {
    for (const profileId of ["representative-growth", "promotion-coverage"] as const) {
      const stage20 = debugRosterForProfile(profileId, "stage-20");
      const stage21 = debugRosterForProfile(profileId, "stage-21");
      expect(stage21).toEqual(stage20);
      for (const slot of [0, 1, 24, 8]) {
        expect(stage21[slot]?.classId, `${profileId}/${slot}`).not.toBe("soldier");
      }
      expect(debugRosterProfileSupportsGrowthOverride(profileId, "stage-21")).toBe(true);
    }
  });

  it("ships the original ally map figure for the water-warrior baseline", async () => {
    const source = ALLY_MAP_UNIT_ASSETS["water-warrior"];
    expect(source).toBe("/assets/original/technique-lab/units/ally-water-warrior.png");
    expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
  });

  it("carries Kins and the seven half-dragon sisters into late direct-entry profiles", async () => {
    const profiles = [
      ["template-baseline", undefined],
      ["representative-growth", undefined],
      ["promotion-coverage", undefined],
    ] as const;

    for (const stageId of ["stage-23", "stage-24", "stage-26", "stage-27", "stage-28", "stage-29"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(roster[7], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`).toEqual({
          slot: 7,
          classId: "magic-priest",
          experience: 0,
          life: classStatsFor({ classId: "magic-priest", experience: 0 }).maxLife,
        });
        for (const slot of [25, 26, 27, 28, 29, 30, 31]) {
          expect(roster[slot]?.classId).toBe("half-dragon-warrior");
        }
      }
    }

    const source = ALLY_MAP_UNIT_ASSETS["half-dragon-warrior"];
    expect(source).toBe("/assets/original/technique-lab/units/ally-half-dragon-warrior.png");
    expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
  });

  it("carries stage 27's mandatory great-axe defender into stage 28 and 29 profiles", () => {
    const profiles = [
      ["template-baseline", undefined],
      ["representative-growth", undefined],
      ["promotion-coverage", undefined],
    ] as const;

    for (const stageId of ["stage-28", "stage-29"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(roster[22], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`)
          .toEqual({
            slot: 22,
            classId: "great-axe-warrior",
            experience: 0,
            life: classStatsFor({ classId: "great-axe-warrior", experience: 0 }).maxLife,
          });
      }
    }
  });

  it("carries Vesta's mandatory stage 30 recruitment into every stage 31–33 profile", () => {
    const profiles = [
      ["template-baseline", undefined],
      ["representative-growth", undefined],
      ["promotion-coverage", undefined],
    ] as const;

    for (const stageId of ["stage-31", "stage-32", "stage-33"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(
          roster[23],
          `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`,
        ).toEqual({
          slot: 23,
          classId: "empress",
          experience: 0,
          life: classStatsFor({ classId: "empress", experience: 0 }).maxLife,
        });
      }
    }
  });

  it("keeps battle-entry and current save rosters separate while overriding only difficulty and stage", () => {
    const entryRoster = completeCampaignRoster([
      { slot: 0, classId: "cavalry", experience: 410, life: 210 },
    ]);
    const currentRoster = completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 250, life: 260 },
    ]);
    const base = completedStage3Save();
    const save: BattleSaveData = {
      ...base,
      kind: "battle",
      stageId: "stage-04",
      stageLabel: "通過力場",
      stageProgress: 0,
      roster: currentRoster,
      consumedEventIds: [
        "stage-04-prebattle-story",
        "stage-04-enter-deployment",
        "stage-04-opening-story",
      ],
      stageEntrySnapshot: {
        stageId: "stage-04",
        ruleset: "stableRemake",
        difficulty: 1,
        roster: entryRoster,
        rngState: 0x1111_2222,
        rngCalls: 12,
      },
      battle: {
        phase: "player",
        round: 2,
        focusId: "1:0",
        units: [],
        terrainOverrides: [],
        cursor: { x: 0, y: 0 },
        cameraOrigin: { x: 0, y: 0 },
      },
    };

    const entry = campaignFromDebugSave(save, "stage-03", 3, "entry");
    expect(entry).toMatchObject({
      stageId: "stage-03",
      difficulty: 3,
      rngState: 0x1111_2222,
      rngCalls: 12,
    });
    expect(entry.roster[0]).toMatchObject({ slot: 0, classId: "cavalry", experience: 410 });
    const current = campaignFromDebugSave(save, "stage-03", 3, "current");
    expect(current).toMatchObject({
      stageId: "stage-03",
      difficulty: 3,
      rngState: base.rngState,
      rngCalls: base.rngCalls,
    });
    expect(current.roster[0]).toMatchObject({
      slot: 0,
      classId: "land-knight",
      experience: 250,
    });
    expect(() => campaignFromDebugSave(base, "stage-04", 0, "entry"))
      .toThrow("完成記錄沒有戰中入關快照");
  });

  it("discovers valid save slots read-only and resolves them into a fresh debug campaign", () => {
    const save = completedStage3Save();
    const serialized = JSON.stringify(save);
    const storage = storageWith({ [saveSlotKey(3)]: serialized });
    const source = parseDebugRosterSourceId("save-3-current");
    expect(source).toMatchObject({ kind: "save-slot", slot: 3, mode: "current" });
    if (!source) throw new Error("missing parsed debug roster source");

    expect(debugRosterSourceOptions(storage)).toContainEqual(expect.objectContaining({
      id: "save-3-current",
      label: "記錄 3 · 通過力場 · 完成名單",
    }));
    const campaign = createDebugCampaignState("stage-04", 3, source, storage);
    expect(campaign).toMatchObject({
      stageId: "stage-04",
      difficulty: 3,
      rngState: save.rngState,
      rngCalls: save.rngCalls,
    });
    expect(campaign.roster[0]).toMatchObject({
      slot: 0,
      classId: "swift-dragon-knight",
      experience: 321,
      life: 287,
    });
    expect(storage.getItem(saveSlotKey(3))).toBe(serialized);
  });

  it("serializes roster sources in reproducible debug URLs and rejects invalid sources", () => {
    expect(debugScenarioUrl("stage-04-player", 2, "promotion-coverage", 120))
      .toBe(
        "/?debugScenario=stage-04-player&difficulty=2&roster=promotion-coverage&growth=120",
      );
    expect(debugScenarioUrl("stage-49-record-total-101", 0, "representative-growth", 100))
      .toBe(
        "/?debugScenario=stage-49-record-total-101&difficulty=0&roster=representative-growth&growth=100",
      );
    expect(debugRosterStageId("stage-49")).toBe("stage-37");
    expect(debugStageLabel("stage-49")).toBe("主線結局 · 四段尾聲");
    expect(parseDebugPerStageGrowth("0")).toBe(0);
    expect(parseDebugPerStageGrowth("9999")).toBe(9999);
    expect(parseDebugPerStageGrowth(undefined)).toBeUndefined();
    expect(parseDebugPerStageGrowth("-1")).toBeUndefined();
    expect(parseDebugPerStageGrowth("10000")).toBeUndefined();
    expect(parseDebugPerStageGrowth("12.5")).toBeUndefined();
    expect(parseDebugRosterSourceId(undefined)).toEqual({
      kind: "profile",
      id: "template-baseline",
    });
    expect(parseDebugRosterSourceId("save-0-current")).toBeUndefined();
    expect(parseDebugRosterSourceId("arbitrary-class")).toBeUndefined();
  });
});
