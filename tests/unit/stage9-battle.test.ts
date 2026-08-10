import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE9_DEFINITION } from "../../src/game/content/stage9";
import { Stage9Battle, createStage9DeploymentRoster } from "../../src/game/simulation/stage9-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-09",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 620, life: 220 },
    { slot: 1, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const deployment = {
  placements: [
    ...STAGE9_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE9_DEFINITION.deployment.optionalSlots.slice(0, 7).map((slot, index) => ({
      slot, position: { ...STAGE9_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 9 battle simulation", () => {
  it("builds the nine-unit escort and fourteen-unit blockade", () => {
    expect(createStage9DeploymentRoster(campaign)).toHaveLength(14);
    expect(createStage9DeploymentRoster(campaign).find(({ slot }) => slot === 9))
      .toMatchObject({ name: "多莉", classId: "curse-master", experience: 299 });
    const battle = new Stage9Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(14);
    expect(battle.unit("1:9")).toMatchObject({ classId: "curse-master", x: 16, y: 38 });
    expect(battle.forceForUnit("1:9")).toMatchObject({
      id: "dori-flightship-guide", control: "independent-ai", tacticLabel: "飛船引路",
    });
    expect(battle.isPlayerControllableAlly("1:9")).toBe(false);
    expect(battle.isPlayerControllableAlly("1:0")).toBe(true);
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 9))
      .toMatchObject({ classId: "curse-master", experience: 299 });
  });

  it("moves Dori along the native three-waypoint route with movement seven", () => {
    const battle = new Stage9Battle(campaign, deployment);
    const action = battle.planAlliedAiAction("1:9");
    expect(action).toMatchObject({ unitId: "1:9", kind: "move" });
    expect(action?.path[0]).toEqual({ x: 16, y: 38 });
    expect(action?.path.at(-1)?.y).toBeLessThan(38);
    expect(action?.path.length).toBeLessThanOrEqual(7);
  });

  it("wins by Dori reaching cell 933 or by elimination, with defeat precedence", () => {
    const routeVictory = new Stage9Battle(campaign, deployment);
    Object.assign(routeVictory.unit("1:9")!, { x: 34, y: 17 });
    expect(routeVictory.outcome()).toBe("victory");

    const stillTraveling = new Stage9Battle(campaign, deployment);
    Object.assign(stillTraveling.unit("1:9")!, { x: 34, y: 18 });
    expect(stillTraveling.outcome()).toBe("ongoing");

    const eliminationVictory = new Stage9Battle(campaign, deployment);
    eliminationVictory.units = eliminationVictory.units.filter(({ side }) => side !== 2);
    expect(eliminationVictory.outcome()).toBe("victory");

    const simultaneous = new Stage9Battle(campaign, deployment);
    simultaneous.units = simultaneous.units.filter(({ side, slot }) => side !== 2 && slot !== 9);
    expect(simultaneous.outcome()).toBe("defeat");
  });
});
