import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE10_DEFINITION } from "../../src/game/content/stage10";
import { Stage10Battle, createStage10DeploymentRoster } from "../../src/game/simulation/stage10-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-10",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 8, classId: "cavalry", experience: 299, life: 200 },
    { slot: 24, classId: "wizard", experience: 660, life: 150 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const fullDeployment = {
  placements: [
    ...STAGE10_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE10_DEFINITION.deployment.optionalSlots.slice(0, 12).map((slot, index) => ({
      slot, position: { ...STAGE10_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 10 battle simulation", () => {
  it("builds the 13-unit defense and five-unit expert pursuit force", () => {
    expect(createStage10DeploymentRoster(campaign)).toHaveLength(20);
    const battle = new Stage10Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(13);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 27, y: 29, life: 340,
    });
    expect(battle.unit("1:8")).toMatchObject({ classId: "cavalry", experience: 299 });
    expect(battle.unit("2:20")).toMatchObject({
      classId: "half-dragon-warrior", name: "克諾絲", portrait: 4, x: 26, y: 13,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-airship-defense", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:20")).toMatchObject({
      id: "kenosi-airship-pursuers", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE10_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage10Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("wins only after all pursuers leave and loses if Nia leaves", () => {
    const ongoing = new Stage10Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:20");
    expect(ongoing.outcome()).toBe("ongoing");

    const victory = new Stage10Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ side }) => side !== 2);
    expect(victory.outcome()).toBe("victory");

    const simultaneous = new Stage10Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ side, slot }) => side !== 2 && slot !== 0);
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every pursuer a legal shared-expert action", () => {
    const battle = new Stage10Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
