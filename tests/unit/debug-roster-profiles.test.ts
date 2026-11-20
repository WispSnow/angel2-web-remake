import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classStatsFor,
  promotionExperienceThresholdFor,
  promotionReachableClassIds,
  promotionTargetsFor,
} from "../../src/game/content/classes";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  campaignFromDebugSave,
  createDebugCampaignState,
  DEBUG_CAMPAIGN_MEMBERS,
  debugGrowthBudgetForStage,
  debugGrowthPath,
  debugGrowthProgressionForSlot,
  debugRandomGrowthTarget,
  debugRosterForProfile,
  debugRosterProfileSupportsGrowthOverride,
  debugRosterSourceOptions,
  DEFAULT_DEBUG_PER_STAGE_GROWTH,
  DEBUG_PER_STAGE_GROWTH_MAX,
  FIRST_STAGE_SCOPED_ALLY_SLOT,
  parseDebugGrowthSeed,
  parseDebugPerStageGrowth,
  parseDebugRosterSourceId,
  withDebugGrowthSeed,
  type DebugGrowthProgression,
} from "../../src/game/debug-roster-profiles";
import {
  debugRosterStageId,
  debugScenarioUrl,
  debugStageLabel,
} from "../../src/game/debug-scenario-catalog";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveSlotKey } from "../../src/game/save";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";
import type { ClassId } from "../../src/game/content/classes";
import type { BattleSaveData, CompletedSaveData, StageId } from "../../src/game/types";

const stageIds = Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[];
/** 隨機職業成長套用每關成長時必須帶種子；預設職業成長會忽略它。 */
const TEST_SEED = 0x5eed;
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
    "stage-03-player-ready",
    "stage-03-fourth-corps-joined",
    "stage-03-fourth-corps-counterattack",
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
        "default-growth",
        "random-growth",
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
      for (const profileId of ["default-growth", "random-growth"] as const) {
        expect(
          debugRosterProfileSupportsGrowthOverride(profileId, stageId),
          `${stageId}/${profileId}`,
        ).toBe(true);
      }
    }
  });

  it("keeps the hand-written stage-four roster for direct links without per-stage growth", () => {
    const fixed = debugRosterForProfile("default-growth", "stage-04");
    expect(fixed[0]).toMatchObject({ classId: "land-knight", experience: 640 });
    expect(fixed[1]).toMatchObject({ classId: "priest", experience: 780 });
    expect(fixed[24]).toMatchObject({ classId: "evil-mage", experience: 540 });
    // 隨機只作用在每關成長上；不帶 growth 的直鏈兩份檔案共用同一份手寫名冊。
    for (const stageId of stageIds) {
      expect(debugRosterForProfile("random-growth", stageId), stageId)
        .toEqual(debugRosterForProfile("default-growth", stageId));
    }
  });

  it("assigns growth targets that cover every top class about once", async () => {
    const topClasses = promotionReachableClassIds(["soldier"])
      .filter((classId) => promotionTargetsFor(classId).length === 0);
    expect(topClasses).toHaveLength(20);
    for (const classId of topClasses) {
      const source = ALLY_MAP_UNIT_ASSETS[classId as keyof typeof ALLY_MAP_UNIT_ASSETS];
      expect(source, classId).toMatch(/^\/assets\/original\//u);
      expect((await readFile(path.join(workspace, "public", source))).length, classId)
        .toBeGreaterThan(0);
    }
    // 用戶指定（2026-11-19）。
    expect(memberFor(0).growthTargetClassId).toBe("flying-dragon-knight");
    expect(memberFor(1).growthTargetClassId).toBe("wizard");
    for (const member of DEBUG_CAMPAIGN_MEMBERS) {
      const path = debugGrowthPath(member.campaignEntryClassId, member.growthTargetClassId);
      expect(path[0], member.name).toBe(member.campaignEntryClassId);
      expect(promotionTargetsFor(member.growthTargetClassId), member.name).toEqual([]);
    }
    expect(() => debugGrowthPath("soldier", "cavalry")).toThrow("不是頂層職業");
    expect(() => debugGrowthPath("cavalry", "wizard")).toThrow("無法轉職");

    // 留到最後的成員：每個頂層職業至少一人、至多兩人，而且只有一個職業有兩人（巨斧戰士：
    // 塔絲加與第 27 關歸隊的愛莉歐拉）。葛蒂拉斯第 20 關離隊，不算在內。
    const finalCounts = new Map<string, number>();
    for (const member of DEBUG_CAMPAIGN_MEMBERS) {
      if (member.lastStageId !== undefined) continue;
      finalCounts.set(member.growthTargetClassId, (finalCounts.get(member.growthTargetClassId) ?? 0) + 1);
    }
    for (const classId of topClasses) expect(finalCounts.get(classId) ?? 0, classId).toBeGreaterThanOrEqual(1);
    const doubled = topClasses.filter((classId) => (finalCounts.get(classId) ?? 0) > 1);
    expect(doubled).toEqual(["great-axe-warrior"]);

    // 預設每關成長下，最後一關每個成員都已走到自己的目標；葛蒂拉斯離隊前也已走到。
    const stage38 = debugRosterForProfile(
      "default-growth",
      "stage-38",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const member of DEBUG_CAMPAIGN_MEMBERS.filter(({ lastStageId }) => lastStageId === undefined)) {
      expect(stage38[member.slot]?.classId, member.name).toBe(member.growthTargetClassId);
    }
    for (const classId of topClasses) {
      expect(stage38.some((entry) => entry.classId === classId), classId).toBe(true);
    }
    expect(debugRosterForProfile("default-growth", "stage-20", DEFAULT_DEBUG_PER_STAGE_GROWTH)[24]?.classId)
      .toBe(memberFor(24).growthTargetClassId);
  });

  it("draws each random-growth target from the URL seed, independently per member", () => {
    const random = { kind: "profile", id: "random-growth" } as const;
    expect(withDebugGrowthSeed(random, 100, undefined, () => 42)).toEqual({ ...random, seed: 42 });
    expect(withDebugGrowthSeed(random, 100, 7, () => 42)).toEqual({ ...random, seed: 7 });
    // 未套用每關成長時名冊是手寫夾具，不需要也不寫入種子；其他檔案同樣不帶種子。
    expect(withDebugGrowthSeed(random, undefined, undefined, () => 42)).toBe(random);
    const fixed = { kind: "profile", id: "default-growth" } as const;
    expect(withDebugGrowthSeed(fixed, 100, undefined, () => 42)).toBe(fixed);
    expect(() => debugRosterForProfile("random-growth", "stage-38", 100)).toThrow("需要隨機種子");
    expect(createDebugCampaignState("stage-38", 0, { ...random, seed: 42 }, storageWith({}), 100).roster)
      .toEqual(debugRosterForProfile("random-growth", "stage-38", 100, 42));

    const seeds = Array.from({ length: 40 }, (_, index) => index * 7919 + 1);
    const soldierTops = new Set<ClassId>();
    const assignments = new Set<string>();
    for (const seed of seeds) {
      // 預算拉到上限，最後一關每名成員都已走到抽中的目標。
      const roster = debugRosterForProfile("random-growth", "stage-38", DEBUG_PER_STAGE_GROWTH_MAX, seed);
      expect(debugRosterForProfile("random-growth", "stage-38", DEBUG_PER_STAGE_GROWTH_MAX, seed)).toEqual(roster);
      const targets = DEBUG_CAMPAIGN_MEMBERS.map((member) => {
        const target = debugRandomGrowthTarget(member, seed);
        // 走不到或不是頂層時 debugGrowthPath 會直接報錯。
        expect(debugGrowthPath(member.campaignEntryClassId, target).at(-1)).toBe(target);
        if (member.lastStageId === undefined) {
          expect(roster[member.slot]?.classId, `${seed}/${member.name}`).toBe(target);
        }
        if (member.campaignEntryClassId === "soldier") soldierTops.add(target);
        return target;
      });
      assignments.add(targets.join());
    }
    expect(soldierTops.size).toBe(20);
    expect(assignments.size).toBe(seeds.length);
    // 劇情固定的頂層職業沒得抽；蘇蘭達只在騎士線裡抽。
    expect(debugRandomGrowthTarget(memberFor(9), 1)).toBe("curse-master");
    expect(debugRandomGrowthTarget(memberFor(23), 1)).toBe("empress");
    for (const seed of seeds) {
      expect(debugGrowthPath("cavalry", debugRandomGrowthTarget(memberFor(8), seed))[0]).toBe("cavalry");
    }

    // 預算公式與預設檔案相同，只換了目標：花掉的總額仍是入隊後的關數 × 每關成長。
    const stage5 = debugRosterForProfile("random-growth", "stage-05", 120, TEST_SEED);
    for (const slot of [0, 1, 2, 3, 4, 20, 21, 24]) {
      const member = memberFor(slot);
      const path = debugGrowthPath(member.campaignEntryClassId, debugRandomGrowthTarget(member, TEST_SEED));
      const entry = stage5[slot];
      if (!entry) throw new Error(`missing debug roster slot ${slot}`);
      const reached = path.indexOf(entry.classId);
      expect(reached, `slot ${slot}`).toBeGreaterThanOrEqual(0);
      const firstPaid = path[0] === "soldier" ? 1 : 0;
      const spent = path.slice(firstPaid, reached)
        .reduce((total, classId) => total + promotionExperienceThresholdFor(classId), entry.experience);
      expect(spent, `slot ${slot}`).toBe(expectedBudget(slot, "stage-05", 120));
      expect(entry.life).toBe(classStatsFor(entry).maxLife);
    }
  });

  it("spends one fixed per-stage budget along each member's target promotion path", () => {
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
        "stage-01",
        slot,
        perStageGrowth,
      ));
    expect(new Set(stage1Progressions.map(({ classId }) => classId)).size).toBeGreaterThan(1);
    for (const [index, progression] of stage1Progressions.entries()) {
      const slot = [0, 1, 2, 4][index] as number;
      // 妮雅與希蜜第 0 關就在隊，蒙欣曼與拉朵那第 1 關才入隊，入隊當關預算為 0——
      // 角色第一次出場時還沒打出任何成長，所以停在戰役入隊職業，不預先轉職。
      const joinedHere = slot === 2 || slot === 4;
      expect(progression.classId, `slot ${slot}`).toBe(joinedHere ? "soldier" : progression.classId);
      if (!joinedHere) expect(soldierTargets).toContain(progression.classId);
      expect(progression.experience).toBe(expectedBudget(slot, "stage-01", perStageGrowth));
      expect(progression.promotions).toEqual([progression.classId]);
    }

    const roster = debugRosterForProfile(
      "default-growth",
      "stage-05",
      perStageGrowth,
    );
    for (const slot of [0, 1, 2, 3, 4, 20, 21]) {
      const progression = debugGrowthProgressionForSlot(
        "stage-05",
        slot,
        perStageGrowth,
      );
      const member = memberFor(slot);
      // 入隊當關預算為 0：角色第一次出場時停在戰役入隊職業，不預先轉職。
      expect(
        debugGrowthProgressionForSlot(
          member.joinStageId,
          slot,
          perStageGrowth,
        ).promotions,
        `slot ${slot} at its join stage`,
      ).toEqual([member.campaignEntryClassId]);
      // 入隊之後，首次轉職在每一關都是同一個確定結果。
      expect(progression.promotions[0]).toBe(
        debugGrowthProgressionForSlot(
          "stage-38",
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
      "default-growth",
      "stage-06",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24]) {
      // 槽 5／6／12／13／14 第 6 關才入隊，當關預算為 0，所以還是未轉職士兵。
      const joinsHere = memberFor(slot).joinStageId === "stage-06";
      if (joinsHere) expect(stage6Roster[slot]).toMatchObject({ classId: "soldier", experience: 0 });
      else expect(stage6Roster[slot]?.classId, `slot ${slot}`).not.toBe("soldier");
    }
    const stage7Roster = debugRosterForProfile(
      "default-growth",
      "stage-07",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24]) {
      expect(stage7Roster[slot]?.classId).not.toBe("soldier");
    }
    const stage8Roster = debugRosterForProfile(
      "default-growth",
      "stage-08",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    // 阿曼妮與雷伊拉第 8 關入隊，當關預算為 0，所以停在未轉職士兵。
    for (const slot of [17, 18]) {
      expect(stage8Roster[slot]).toMatchObject({ classId: "soldier", experience: 0 });
    }
    const stage9Roster = debugRosterForProfile(
      "default-growth",
      "stage-09",
      DEFAULT_DEBUG_PER_STAGE_GROWTH,
    );
    for (const slot of [17, 18]) expect(stage9Roster[slot]?.classId).not.toBe("soldier");
    expect(debugRosterProfileSupportsGrowthOverride(
      "default-growth",
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
      ["default-growth", undefined],
      ["random-growth", undefined],
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
      ["default-growth", undefined],
      ["random-growth", undefined],
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

    for (const profileId of ["default-growth", "random-growth"] as const) {
      for (const stageId of ["stage-22", "stage-23", "stage-28", "stage-31", "stage-38"] as const) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth, TEST_SEED);
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
        stageId,
        8,
        perStageGrowth,
      );
      expect(spentBudget(progression)).toBe(expectedBudget(8, stageId, perStageGrowth));
      expect(progression.promotions[0]).toBe("cavalry");
      expect(debugRosterForProfile("default-growth", stageId, perStageGrowth)[8])
        .toMatchObject({ classId: progression.classId, experience: progression.experience });
    }
  });

  it("grows every joined campaign member and leaves later recruits on the stage template", () => {
    const perStageGrowth = DEFAULT_DEBUG_PER_STAGE_GROWTH;
    // 隨機職業成長的目標另有種子測試；這裡逐關對照預設目標的路線。
    for (const profileId of ["default-growth"] as const) {
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
    const stage38 = debugRosterForProfile("default-growth", "stage-38", perStageGrowth);
    const stage38Baseline = debugRosterForProfile("default-growth", "stage-38");
    for (const slot of lateJoiners) {
      const entry = stage38[slot];
      if (!entry) throw new Error(`missing debug roster slot ${slot}`);
      expect(spentBudget(
        debugGrowthProgressionForSlot("stage-38", slot, perStageGrowth),
      ), `stage-38/${slot}`).toBe(expectedBudget(slot, "stage-38", perStageGrowth));
      expect(entry.experience, `stage-38/${slot}`).toBeGreaterThan(0);
      expect(entry.classId, `stage-38/${slot}`).not.toBe("soldier");
      expect(entry, `stage-38/${slot}`).not.toEqual(stage38Baseline[slot]);
    }
  });

  it("freezes Gedilas at her stage-twenty departure instead of growing the traitor", () => {
    const perStageGrowth = DEFAULT_DEBUG_PER_STAGE_GROWTH;
    const departure = debugRosterForProfile("default-growth", "stage-20", perStageGrowth);
    for (const stageId of ["stage-21", "stage-22", "stage-38"] as const) {
      expect(debugRosterForProfile("default-growth", stageId, perStageGrowth)[24], stageId)
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
    for (const profileId of ["default-growth", "random-growth"] as const) {
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
      ["default-growth", undefined],
      ["random-growth", undefined],
    ] as const;

    for (const stageId of ["stage-23", "stage-24", "stage-26", "stage-27", "stage-28", "stage-29"] as const) {
      for (const [profileId, perStageGrowth] of profiles) {
        const roster = debugRosterForProfile(profileId, stageId, perStageGrowth);
        expect(roster[7], `${stageId}/${profileId}/${perStageGrowth ?? "configured"}`).toEqual({
          slot: 7,
          classId: "magic-priest",
          experience: 299,
          life: classStatsFor({ classId: "magic-priest", experience: 299 }).maxLife,
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
      ["default-growth", undefined],
      ["random-growth", undefined],
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
      ["default-growth", undefined],
      ["random-growth", undefined],
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
    expect(debugScenarioUrl("stage-04-player", 2, "random-growth", 120, 42))
      .toBe(
        "/?debugScenario=stage-04-player&difficulty=2&roster=random-growth&growth=120&seed=42",
      );
    expect(debugScenarioUrl("stage-49-record-total-101", 0, "default-growth", 100))
      .toBe(
        "/?debugScenario=stage-49-record-total-101&difficulty=0&roster=default-growth&growth=100",
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
    // 舊檔案名不再接受，免得舊連結默默換成另一種成長。
    expect(parseDebugRosterSourceId("representative-growth")).toBeUndefined();
    expect(parseDebugRosterSourceId("promotion-coverage")).toBeUndefined();
    expect(parseDebugGrowthSeed("0")).toBe(0);
    expect(parseDebugGrowthSeed("4294967295")).toBe(0xffff_ffff);
    expect(parseDebugGrowthSeed(null)).toBeUndefined();
    expect(parseDebugGrowthSeed("4294967296")).toBeUndefined();
    expect(parseDebugGrowthSeed("012")).toBeUndefined();
    expect(parseDebugGrowthSeed("-1")).toBeUndefined();
    expect(parseDebugGrowthSeed("1.5")).toBeUndefined();
  });
});
