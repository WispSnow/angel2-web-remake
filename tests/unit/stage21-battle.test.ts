import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
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
});
