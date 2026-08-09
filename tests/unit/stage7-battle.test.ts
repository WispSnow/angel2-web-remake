import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE7_DEFINITION } from "../../src/game/content/stage7";
import { Stage7Battle, createStage7DeploymentRoster } from "../../src/game/simulation/stage7-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-07",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 620, life: 220 },
    { slot: 1, classId: "priest", experience: 580, life: 180 },
    { slot: 24, classId: "evil-mage", experience: 1_150, life: 300 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
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

describe("stage 7 battle simulation", () => {
  it("inherits seven selected allies and builds the eleven-unit camp raid", () => {
    expect(createStage7DeploymentRoster(campaign)).toHaveLength(13);
    const battle = new Stage7Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(7);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(11);
    expect(battle.unit("1:0")).toMatchObject({ classId: "land-knight", x: 22, y: 28 });
    expect(battle.unit("1:1")).toMatchObject({ classId: "priest", x: 26, y: 28 });
    expect(battle.unit("2:18")).toMatchObject({
      classId: "land-knight", name: "萊莉", portrait: 19, x: 35, y: 16,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-ranger-camp-defense", control: "player",
    });
    expect(battle.forceForUnit("2:18")).toMatchObject({
      id: "death-valley-camp-raiders", control: "independent-ai",
    });
  });

  it("wins only when Laili leaves and loses when Nia leaves", () => {
    const ongoing = new Stage7Battle(campaign, deployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:44");
    expect(ongoing.outcome()).toBe("ongoing");

    const victorious = new Stage7Battle(campaign, deployment);
    victorious.units = victorious.units.filter(({ id }) => id !== "2:18");
    expect(victorious.outcome()).toBe("victory");

    const defeated = new Stage7Battle(campaign, deployment);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:0");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("uses ordinary terrain and round transitions without stage-4 force-field damage", () => {
    const battle = new Stage7Battle(campaign, deployment);
    const lifeBefore = battle.units.map(({ id, life }) => [id, life] as const);
    expect(battle.routePulseSafeAreaForUnit("1:0")).toEqual([]);
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.map(({ id, life }) => [id, life] as const)).toEqual(lifeBefore);
  });
});
