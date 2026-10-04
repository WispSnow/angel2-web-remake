import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { completeCampaignRoster, statsFor } from "../../src/game/content/stage0";
import { GameController } from "../../src/game/controller";
import { Stage21Battle } from "../../src/game/simulation/stage21-battle";
import type { CampaignState } from "../../src/game/types";

const campaign = (): CampaignState => ({
  stageId: "stage-21",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x21_21_21_21,
  rngCalls: 0,
});

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

// `GameController` reads its presentation preferences and URL flags as it is
// built, and the scouts' arrival waits on the program clock's window timers.
beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", {
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("stage 21 battle", () => {
  it("starts from the evidence-backed empty template without mutating the campaign roster", () => {
    const state = campaign();
    const battle = new Stage21Battle(state);
    expect(battle.stage.id).toBe("stage-21");
    expect(battle.units).toEqual([]);
    expect(battle.outcome()).toBe("defeat");
    expect(battle.campaignSnapshot().roster).toEqual(state.roster);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual({
      state: state.rngState,
      calls: 0,
    });
  });

  /**
   * The four scouts are written in by the round-1 event, not by the template, so
   * their life comes from the battle's campaign roster. That roster used to keep
   * the life each slot ended stage 20 with: whoever fell on the tower top walked
   * into the forest showing 0 on the map, and the wounded kept their wounds.
   * `REMAKE-077` (`0000:536B`) refills every side-1 slot when a battle starts.
   */
  it("brings every scout in at full life, whatever they ended stage 20 with", async () => {
    const stage20Casualties = new Map([[1, 0], [8, 0], [24, 37]]);
    const entry = campaign();
    const roster = entry.roster.map((slot) => ({
      ...slot,
      life: stage20Casualties.get(slot.slot) ?? slot.life,
    }));
    const controller = new GameController(0);
    await controller.enterStage("stage-21", { ...entry, roster });
    expect(controller.phase).toBe("prebattleStory");

    controller.skipDialogue();
    await vi.waitFor(() => expect(controller.phase).toBe("openingStory"), { timeout: 5_000 });
    const scouts = controller.battle.units;
    expect(scouts.map(({ id }) => id)).toEqual(["1:0", "1:1", "1:24", "1:8"]);
    for (const scout of scouts) {
      expect(scout.life, scout.name).toBe(statsFor(scout, 0).maxLife);
    }
    // Nothing on this board can write a scout back, so the roster keeps the rebuild.
    for (const slot of [1, 8, 24]) {
      const rebuilt = controller.battle.campaignSnapshot().roster.find((candidate) => candidate.slot === slot);
      expect(rebuilt?.life, `slot ${slot}`).toBe(statsFor({ ...roster[slot], side: 1 }, 0).maxLife);
    }
  });
});
