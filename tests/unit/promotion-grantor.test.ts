import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unitDisplayName } from "../../src/game/content/classes";
import {
  PROMOTION_DIALOGUE_TEXT,
  promotionDialogueFor,
} from "../../src/game/content/promotion-dialogue";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { DebugScenarioId } from "../../src/game/debug-scenario-catalog";

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

const openPlayerTurn = (id: DebugScenarioId) => createDebugScenarioController(id, {
  difficulty: 0,
  rosterSource: { kind: "profile", id: "representative-growth" },
  storage,
});

/**
 * `REMAKE-018` hands the grant to the on-field commander while Nia is away. Stages 8
 * and 11 have no side 1 slot 1, and the grantor used to fall back to whichever ally
 * the board listed first: 騎兵A in stage 8, 多莉 or 雷伊拉 in stage 11.
 */
describe("the promotion grantor while Nia is absent (REMAKE-018)", () => {
  it.each([
    { scenario: "stage-03-player", commanderId: "1:1", name: "希蜜", portrait: 45, teammateId: "1:4" },
    { scenario: "stage-08-player", commanderId: "1:8", name: "蘇蘭達", portrait: 10, teammateId: "1:40" },
    { scenario: "stage-11-player", commanderId: "1:8", name: "蘇蘭達", portrait: 10, teammateId: "1:18" },
  ] as const)("$scenario: $name answers the request", async ({
    scenario,
    commanderId,
    name,
    portrait,
    teammateId,
  }) => {
    storage.clear();
    const controller = await openPlayerTurn(scenario);
    expect(controller.battle.units.some(({ portrait: record }) => record === 46)).toBe(false);
    expect(controller.battle.groupCommander?.id).toBe(commanderId);
    expect(controller.promotionGrantor?.id).toBe(commanderId);

    const teammate = controller.battle.unit(teammateId);
    if (!teammate) throw new Error(`${scenario} is missing ${teammateId}`);
    const [request, grant] = promotionDialogueFor(teammate, controller.promotionGrantor);
    expect(request?.lower).toMatchObject({
      text: PROMOTION_DIALOGUE_TEXT.teammateRequest,
      speaker: unitDisplayName(teammate),
    });
    expect(grant?.upper).toEqual(expect.objectContaining({
      text: PROMOTION_DIALOGUE_TEXT.niaGrant,
      portrait,
      speaker: name,
    }));

    // The commander reaching the threshold asks herself, as Nia does when present.
    const commander = controller.battle.unit(commanderId);
    if (!commander) throw new Error(`${scenario} is missing ${commanderId}`);
    const selfQuestion = promotionDialogueFor(commander, controller.promotionGrantor);
    expect(selfQuestion).toHaveLength(1);
    expect(selfQuestion[0]?.upper).toEqual(expect.objectContaining({
      text: PROMOTION_DIALOGUE_TEXT.niaQuestion,
      portrait,
      speaker: name,
    }));
  });

  it("stage 3 opens its entry promotions with Himi granting", async () => {
    storage.clear();
    const controller = await openPlayerTurn("stage-03-player");
    expect(controller.promotionDialogueActive).toBe(true);
    controller.advanceDialogue();
    expect(controller.currentDialogue?.upper).toMatchObject({ portrait: 45, speaker: "希蜜" });
  });
});
