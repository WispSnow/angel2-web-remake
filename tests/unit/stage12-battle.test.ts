import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE12_DEFINITION } from "../../src/game/content/stage12";
import { Stage12Battle, createStage12DeploymentRoster } from "../../src/game/simulation/stage12-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-12",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 1, classId: "soldier", experience: 299, life: 120 },
    { slot: 24, classId: "wizard", experience: 660, life: 150 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const fullDeployment = {
  placements: [
    ...STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE12_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
      slot, position: { ...STAGE12_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 12 battle simulation", () => {
  it("builds the nine-unit party and five-root expert water-warrior force", () => {
    expect(createStage12DeploymentRoster(campaign)).toHaveLength(20);
    const battle = new Stage12Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 23, y: 20, life: 340,
    });
    expect(battle.unit("2:40")).toMatchObject({
      classId: "water-warrior", x: 39, y: 17,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-swamp-party", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "swamp-water-warriors", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage12Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("has no stage reinforcement but keeps water-warrior defensive splitting", () => {
    const battle = new Stage12Battle(campaign, fullDeployment);
    const attacker = battle.unit("1:1")!;
    const defender = battle.unit("2:40")!;
    attacker.x = 38;
    attacker.y = 17;
    const enemyRoots = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const result = battle.attack(attacker.id, defender.id);
    expect(result).toMatchObject({ splitUnitId: "2:40:split-1", splitCount: 2 });
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(6);
    expect(battle.forceForUnit("2:40:split-1")?.id).toBe("swamp-water-warriors");
    battle.startNextRound();
    expect(battle.units.filter(({ side, id }) => side === 2 && !id.includes(":split-"))
      .map(({ id }) => id)).toEqual(enemyRoots);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(6);
  });

  it("wins only after every split group leaves and loses if Nia leaves", () => {
    const ongoing = new Stage12Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:40");
    expect(ongoing.outcome()).toBe("ongoing");

    const victory = new Stage12Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ side }) => side !== 2);
    expect(victory.outcome()).toBe("victory");

    const simultaneous = new Stage12Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ side, slot }) => side !== 2 && slot !== 0);
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every water-warrior root a legal shared-expert action", () => {
    const battle = new Stage12Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
