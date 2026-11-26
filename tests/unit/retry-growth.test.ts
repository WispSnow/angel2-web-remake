import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import { setProgramPaused } from "../../src/game/program-clock";
import { ruleOptions, setRuleOption } from "../../src/game/rule-options";
import { stageEntryWithAttemptGrowth } from "../../src/game/simulation/retry-growth";
import type { CampaignState } from "../../src/game/types";

/**
 * `REMAKE-215`「敗退保留經驗」：預設仍照 `REMAKE-016` 從入關快照整份重建；打開後只把這次
 * 嘗試的職業與經驗併回快照，其餘（生命、戰績、PRNG）仍回到入關時。
 */

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();

// `GameController` reads its preferences and URL flags as it is built, and stage 0's
// opening move after a rebuild waits on the program clock's window timers.
beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", {
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(() => {
  setRuleOption("keepFailedAttemptGrowth", false);
  setRuleOption("originalIce", false);
});

afterAll(() => {
  // A retreat rebuilds stage 0 and starts its opening move, which nobody awaits. Pausing the
  // program clock disarms its timers while the stubbed window still exists, so the rest of the
  // move cannot reach for a missing window after the stubs are removed.
  setProgramPaused(true);
  vi.unstubAllGlobals();
});

describe("stageEntryWithAttemptGrowth", () => {
  const entry: CampaignState = {
    stageId: "stage-04",
    ruleset: "stableRemake",
    difficulty: 1,
    roster: [
      { slot: 0, classId: "soldier", experience: 120, life: 70 },
      { slot: 1, classId: "archer", experience: 40, life: 52 },
      { slot: 2, classId: "sister", experience: 10, life: 48 },
    ],
    recordCounters: [3, 0, 1],
    rngState: 0x1234,
    rngCalls: 77,
  };

  it("takes class and experience from the attempt and everything else from the entry", () => {
    const attempt: CampaignState = {
      ...entry,
      roster: [
        { slot: 0, classId: "land-knight", experience: 310, life: 4 },
        { slot: 1, classId: "archer", experience: 66, life: 0 },
        // Never in the entry roster: a mid-stage join is not pre-written.
        { slot: 9, classId: "soldier", experience: 299, life: 60 },
      ],
      recordCounters: [9, 9, 9],
      rngState: 0x9999,
      rngCalls: 512,
    };
    const merged = stageEntryWithAttemptGrowth(entry, attempt);
    expect(merged).toEqual({
      ...entry,
      roster: [
        { slot: 0, classId: "land-knight", experience: 310, life: 70 },
        { slot: 1, classId: "archer", experience: 66, life: 52 },
        { slot: 2, classId: "sister", experience: 10, life: 48 },
      ],
    });
    // The entry snapshot itself is never mutated.
    expect(entry.roster[0]).toEqual({ slot: 0, classId: "soldier", experience: 120, life: 70 });
    expect(merged.roster[2]).not.toBe(entry.roster[2]);
    expect(merged.recordCounters).not.toBe(entry.recordCounters);
  });
});

describe("retreat and defeat on stage 0 with 敗退保留經驗", () => {
  const createController = () => createDebugScenarioController("stage-00-player", {
    difficulty: 0,
    rosterSource: { kind: "profile", id: "default-growth" },
    storage,
  });

  const retreat = (controller: Awaited<ReturnType<typeof createController>>) => {
    controller.requestRetreat();
    controller.selectRetreatChoice(0);
    controller.activateRetreatSelection();
  };

  it("rebuilds from the entry snapshot by default", async () => {
    storage.clear();
    expect(ruleOptions().keepFailedAttemptGrowth).toBe(false);
    const controller = await createController();
    const unit = controller.battle.unit("1:0")!;
    const entryExperience = unit.experience;
    unit.experience += 40;
    retreat(controller);
    expect(controller.battle.unit("1:0")?.experience).toBe(entryExperience);
  });

  it("keeps the attempt's experience after a retreat and after a defeat retry", async () => {
    storage.clear();
    setRuleOption("keepFailedAttemptGrowth", true);
    const controller = await createController();
    const rngBefore = { state: controller.battle.rng.state, calls: controller.battle.rng.calls };
    const unit = controller.battle.unit("1:0")!;
    const entryExperience = unit.experience;
    unit.experience += 40;
    unit.life = 1;
    retreat(controller);
    const rebuilt = controller.battle.unit("1:0")!;
    expect(rebuilt.experience).toBe(entryExperience + 40);
    // A new battle still refills life (REMAKE-077), and the PRNG still rolls back.
    expect(rebuilt.life).toBe(controller.battle.statsFor(rebuilt).maxLife);
    expect({ state: controller.battle.rng.state, calls: controller.battle.rng.calls }).toEqual(rngBefore);

    // The kept growth is the new entry snapshot: switching the option off and
    // failing again returns to it, not to the original entry.
    rebuilt.experience += 25;
    setRuleOption("keepFailedAttemptGrowth", false);
    controller.retry();
    expect(controller.battle.unit("1:0")?.experience).toBe(entryExperience + 40);

    setRuleOption("keepFailedAttemptGrowth", true);
    controller.battle.unit("1:0")!.experience += 25;
    controller.retry();
    expect(controller.battle.unit("1:0")?.experience).toBe(entryExperience + 65);
  });

  it("hands the original-ice option to every rebuilt battle", async () => {
    storage.clear();
    setRuleOption("originalIce", true);
    const controller = await createController();
    expect(controller.battle.rules.originalIce).toBe(true);
    retreat(controller);
    expect(controller.battle.rules.originalIce).toBe(true);
    setRuleOption("originalIce", false);
    controller.syncRuleOptions();
    expect(controller.battle.rules.originalIce).toBe(false);
  });
});
