import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GameController } from "../../src/game/controller";
import { DEBUG_SCENARIOS } from "../../src/game/debug-scenario-catalog";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import { readSaveSlot } from "../../src/game/save";
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
 * Save writing never validates, so a record the load path rejects still reports
 * 已儲存至記錄 and then lists as 此處沒有記錄. Stage 20 wrote such records from its
 * first player phase — its guest 守護者 was held to a roster it never writes back to —
 * and stage 30 from 維絲塔's first surviving exchange, because each form was held to
 * exactly the experience it is rebuilt with. Every stage's player-turn fixture saves
 * through the player's own record menu, reads the slot back the way the load menu does,
 * and does it again after a round's worth of combat has raised every survivor's
 * experience and worn its life down.
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
