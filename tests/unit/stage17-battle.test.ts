import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE17_DEFINITION } from "../../src/game/content/stage17";
import { Stage17Battle, createStage17DeploymentRoster } from "../../src/game/simulation/stage17-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-17",
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
    ...STAGE17_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE17_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE17_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 17 battle simulation", () => {
  it("builds a ten-unit player team and Qian's twelve-unit expert guard", () => {
    const roster = createStage17DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "瑪琳",
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "摩莉娜",
    });

    const battle = new Stage17Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(12);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 24, life: 240,
    });
    expect(battle.unit("2:11")).toMatchObject({
      classId: "half-dragon-warrior", name: "倩", portrait: 37, x: 25, y: 12,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-floor-four-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:11")).toMatchObject({
      id: "qian-dragon-tower-floor-four-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE17_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage17Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("keeps Qian and her magician as sentries through round five and releases them on round six", () => {
    const battle = new Stage17Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const sentries = ["2:11", "2:43"];
    const pursuers = ["2:39", "2:42", "2:41", "2:40", "2:35", "2:44", "2:51", "2:52", "2:54", "2:53"];
    expect(enemies).toEqual([...sentries, ...pursuers]);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual([1, 1]);
    expect(sentries.map((id) => battle.enemyAiIntentFor(id))).toEqual(["sentry", "sentry"]);
    expect(pursuers.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(10).fill("pursuit"));

    for (let round = 2; round <= 5; round += 1) battle.startNextRound();
    expect(battle.round).toBe(5);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual([1, 1]);

    battle.startNextRound();
    expect(battle.round).toBe(6);
    expect(enemies.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(12).fill(0));
    expect(enemies.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(12).fill("pursuit"));
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);

    const restored = new Stage17Battle(campaign, fullDeployment);
    restored.restore(battle.serializableSnapshot());
    expect(restored.round).toBe(6);
    expect(enemies.map((id) => restored.enemyBehaviorFor(id))).toEqual(Array(12).fill(0));
    expect(enemies.map((id) => restored.enemyAiIntentFor(id))).toEqual(Array(12).fill("pursuit"));
  });

  it("wins when Qian leaves while eleven guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage17Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:11");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(11);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage17Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:39");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage17Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:11");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage17Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
