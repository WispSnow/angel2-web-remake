import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE18_DEFINITION } from "../../src/game/content/stage18";
import { Stage18Battle, createStage18DeploymentRoster } from "../../src/game/simulation/stage18-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-18",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 1, classId: "soldier", experience: 299, life: 120 },
    { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
    { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
    { slot: 24, classId: "wizard", experience: 660, life: 150 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const fullDeployment = {
  placements: [
    ...STAGE18_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE18_DEFINITION.deployment.optionalSlots.slice(0, 7).map((slot, index) => ({
      slot, position: { ...STAGE18_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 18 battle simulation", () => {
  it("builds an eight-unit player team and Li's sixteen-unit expert guard", () => {
    const roster = createStage18DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "瑪琳",
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "摩莉娜",
    });

    const battle = new Stage18Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(16);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 33, life: 340,
    });
    expect(battle.unit("2:12")).toMatchObject({
      classId: "half-dragon-warrior", name: "麗", portrait: 38, x: 25, y: 24,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-floor-five-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:12")).toMatchObject({
      id: "li-dragon-tower-floor-five-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE18_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage18Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("keeps ten guards as sentries through round five and releases them on round six", () => {
    const battle = new Stage18Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const sentries = ["2:39", "2:12", "2:30", "2:31", "2:32", "2:35", "2:36", "2:37", "2:34", "2:33"];
    const pursuers = ["2:46", "2:47", "2:48", "2:51", "2:52", "2:53"];
    expect(enemies).toEqual([...sentries, ...pursuers]);
    expect(sentries.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(10).fill("sentry"));
    expect(pursuers.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(6).fill("pursuit"));

    for (let round = 2; round <= 5; round += 1) battle.startNextRound();
    expect(battle.round).toBe(5);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(10).fill(1));

    battle.startNextRound();
    expect(battle.round).toBe(6);
    expect(enemies.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(16).fill(0));
    expect(enemies.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(16).fill("pursuit"));
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);

    const restored = new Stage18Battle(campaign, fullDeployment);
    restored.restore(battle.serializableSnapshot());
    expect(restored.round).toBe(6);
    expect(enemies.map((id) => restored.enemyBehaviorFor(id))).toEqual(Array(16).fill(0));
  });

  it("wins when Li leaves while fifteen guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage18Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:12");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(15);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage18Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:39");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage18Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:12");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage18Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
