import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { className } from "../../src/game/content/classes";
import { GameController } from "../../src/game/controller";
import { DEBUG_SCENARIOS } from "../../src/game/debug-scenario-catalog";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import { readSaveSlot, saveSlotKey } from "../../src/game/save";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";
import type { Difficulty } from "../../src/game/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();

// `GameController` reads its presentation preferences and URL flags as it is built.
beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const playerTurnFixtures = DEBUG_SCENARIOS.filter(({ id }) => id.endsWith("-player"));
const cases = playerTurnFixtures.flatMap(({ id }) =>
  ([0, 3] as const satisfies readonly Difficulty[]).map((difficulty) => ({ id, difficulty })));

/**
 * A save the load path would reject used to be written anyway — it reported
 * 已儲存至記錄 and then listed as 此處沒有記錄. Stage 20 wrote such records from its
 * first player phase — its guest 守護者 was held to a roster it never writes back to —
 * and stage 30 from 維絲塔's first surviving exchange, because each form was held to
 * exactly the experience it is rebuilt with. Writing now refuses those records (see
 * the block below), so the same schema gap would surface as 記錄 N 未儲存 instead.
 * Every stage's player-turn fixture saves through the player's own record menu, reads
 * the slot back the way the load menu does, and does it again after a round's worth of
 * combat has raised every survivor's experience and worn its life down.
 */
describe("battle records written from every player-turn fixture", () => {
  it("covers every stage that hands the board to the player", () => {
    const covered = new Set<string>(playerTurnFixtures.map(({ stageId }) => stageId));
    // The portal scene and stage 21's discovery are scripted interludes: no player phase,
    // so no battle record can be written there.
    expect(Object.keys(STAGE_RUNTIME_MANIFEST).filter((stageId) => !covered.has(stageId)))
      .toEqual(["stage-42-portal", "stage-21"]);
  });

  it.each(cases)("$id on difficulty $difficulty reads back", async ({ id, difficulty }) => {
    storage.clear();
    const controller = await createDebugScenarioController(id, {
      difficulty,
      rosterSource: { kind: "profile", id: "representative-growth" },
      storage,
    });
    // Stage 3's fourth corps enters ready to promote, and the player has to choose
    // before the system menu opens.
    for (let guard = 0; controller.promotionUnit && guard < 50; guard += 1) {
      if (controller.promotionDialogueActive) controller.advanceDialogue();
      else controller.confirmPromotion();
    }
    const saveToFirstSlot = () => {
      controller.openRecordMenu("save");
      controller.activateRecordMenuSelection();
      // A refused write keeps the slot's previous record, so name the refusal directly.
      expect(controller.recordSaveNotice).toBe("");
      return readSaveSlot(storage, 1);
    };

    expect(saveToFirstSlot().kind).toBe("valid");

    // Attacks and counters both pay experience, whichever side struck first.
    for (const unit of controller.battle.units) {
      unit.experience += 7;
      unit.life = Math.max(1, unit.life - 3);
    }
    const fought = saveToFirstSlot();
    expect(fought.kind).toBe("valid");
    if (fought.kind !== "valid") return;
    const restored = await GameController.fromSave(fought.save, 1);
    expect(restored.battle.units).toEqual(controller.battle.units);
  });
});

/**
 * Both save paths validate the record exactly as the load path will read it before
 * touching the slot. A refused record writes nothing and spends no save count; the
 * panel stays open with a notice, and the console names the stage and round with the
 * refused record attached for a bug report.
 */
describe("a record the load path would reject", () => {
  const notice = (slot: number) => `記錄 ${slot} 未儲存：資料校驗失敗，原有記錄保持不變。`;

  /**
   * Stage 0's first player phase, with one genuine record already written to slot 1
   * through the record menu. The session is opened as a debug scenario because
   * `forceVictoryForTest` answers nothing else.
   */
  const openWithRecordInFirstSlot = async () => {
    storage.clear();
    vi.stubGlobal("location", { search: "?debugScenario=stage-00-player" });
    const controller = await createDebugScenarioController("stage-00-player", {
      difficulty: 0,
      rosterSource: { kind: "profile", id: "representative-growth" },
      storage,
    }).finally(() => vi.stubGlobal("location", { search: "" }));
    controller.openRecordMenu("save");
    controller.activateRecordMenuSelection();
    const record = readSaveSlot(storage, 1);
    if (record.kind !== "valid") throw new Error("stage 0's opening board must be writable");
    return { controller, raw: storage.getItem(saveSlotKey(1)), saveCount: record.save.saveCount };
  };

  it("from the battle record menu keeps the slot, the save count and the open menu", async () => {
    const { controller, raw, saveCount } = await openWithRecordInFirstSlot();
    // Stage 0 never fields a 龍, so its save schema refuses an enemy that became one.
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!enemy) throw new Error("stage 0 opens with enemies on the board");
    const { classId, className: nativeName } = enemy;
    enemy.classId = "dragon";
    enemy.className = className("dragon");

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      controller.openRecordMenu("save");
      controller.activateRecordMenuSelection();
      // An empty slot is left empty just the same.
      controller.selectRecordMenuSlot(1);
      controller.activateRecordMenuSelection();
      expect(errors.mock.calls).toEqual([1, 2].map((slot) => [
        `記錄 ${slot} 未儲存：stage-00 第 1 回合的戰中記錄未通過讀取校驗。`,
        expect.objectContaining({ kind: "battle", stageId: "stage-00", saveCount: saveCount + 1 }),
      ]));
    } finally {
      errors.mockRestore();
    }
    expect(storage.getItem(saveSlotKey(1))).toBe(raw);
    expect(storage.getItem(saveSlotKey(2))).toBeNull();
    expect(controller.recordMenuMode).toBe("save");
    expect(controller.recordSaveNotice).toBe(notice(2));
    expect(controller.statusMessage).toBe(notice(2));

    enemy.classId = classId;
    enemy.className = nativeName;
    controller.selectRecordMenuSlot(0);
    controller.activateRecordMenuSelection();
    // The next genuine record takes the count neither refusal spent.
    expect(readSaveSlot(storage, 1)).toMatchObject({
      kind: "valid",
      save: { kind: "battle", saveCount: saveCount + 1 },
    });
    expect(controller.recordMenuMode).toBeUndefined();
    expect(controller.recordSaveNotice).toBe("");
    expect(controller.statusMessage).toBe("已儲存至記錄 1。");
  });

  it("from the post-victory save panel keeps the slot, the save count and the open panel", async () => {
    const { controller, raw, saveCount } = await openWithRecordInFirstSlot();
    controller.forceVictoryForTest();
    controller.skipDialogue();
    controller.continueAfterVictory();
    controller.showSaveSlots();
    expect(controller.phase).toBe("saveSlots");

    // A completed record carries the roster, and no roster entry holds negative experience.
    const nia = controller.battle.unit("1:0");
    if (!nia) throw new Error("stage 0 is won with Nia on the board");
    const { experience } = nia;
    nia.experience = -1;

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      controller.selectSaveSlot(1);
      expect(errors.mock.calls).toEqual([[
        "記錄 1 未儲存：stage-00 第 1 回合的戰後記錄未通過讀取校驗。",
        expect.objectContaining({ kind: "completed", stageId: "stage-01", saveCount: saveCount + 1 }),
      ]]);
    } finally {
      errors.mockRestore();
    }
    expect(storage.getItem(saveSlotKey(1))).toBe(raw);
    expect(controller.phase).toBe("saveSlots");
    expect(controller.recordSaveNotice).toBe(notice(1));
    expect(controller.statusMessage).toBe(notice(1));

    nia.experience = experience;
    controller.selectSaveSlot(1);
    expect(readSaveSlot(storage, 1)).toMatchObject({
      kind: "valid",
      save: { kind: "completed", stageId: "stage-01", saveCount: saveCount + 1 },
    });
    expect(controller.recordSaveNotice).toBe("");
    // The victory flow the refusal held back resumes and routes on into stage 1.
    await vi.waitFor(() => expect(controller.battle.stage.id).toBe("stage-01"), { timeout: 10_000 });
  });
});
