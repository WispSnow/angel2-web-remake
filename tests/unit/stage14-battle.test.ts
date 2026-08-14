import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE14_DEFINITION } from "../../src/game/content/stage14";
import { Stage14Battle, createStage14DeploymentRoster } from "../../src/game/simulation/stage14-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-14",
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
    ...STAGE14_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE14_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE14_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 14 battle simulation", () => {
  it("builds a ten-unit player team and Fang's seven-unit expert guard", () => {
    const roster = createStage14DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "瑪琳",
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "摩莉娜",
    });

    const battle = new Stage14Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 31, life: 340,
    });
    expect(battle.unit("2:8")).toMatchObject({
      classId: "half-dragon-warrior", name: "芳", portrait: 34, x: 25, y: 12,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-floor-one-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:8")).toMatchObject({
      id: "fang-dragon-tower-floor-one-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE14_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage14Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("keeps Fang on sentry through round five and releases her on round six, including restore", () => {
    const battle = new Stage14Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    expect(enemies).toEqual(["2:41", "2:8", "2:49", "2:47", "2:48", "2:42", "2:46"]);
    expect(battle.enemyBehaviorFor("2:8")).toBe(1);
    expect(battle.enemyAiIntentFor("2:8")).toBe("sentry");

    for (let round = 2; round <= 5; round += 1) battle.startNextRound();
    expect(battle.round).toBe(5);
    expect(battle.enemyBehaviorFor("2:8")).toBe(1);
    expect(battle.enemyAiIntentFor("2:8")).toBe("sentry");

    battle.startNextRound();
    expect(battle.round).toBe(6);
    expect(battle.enemyBehaviorFor("2:8")).toBe(0);
    expect(battle.enemyAiIntentFor("2:8")).toBe("pursuit");
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);

    const restored = new Stage14Battle(campaign, fullDeployment);
    restored.restore(battle.serializableSnapshot());
    expect(restored.round).toBe(6);
    expect(restored.enemyBehaviorFor("2:8")).toBe(0);
    expect(restored.enemyAiIntentFor("2:8")).toBe("pursuit");
  });

  it("wins when Fang leaves while six guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage14Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:8");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(6);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage14Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:41");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage14Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:8");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage14Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
