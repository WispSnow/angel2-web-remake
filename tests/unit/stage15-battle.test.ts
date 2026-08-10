import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE15_DEFINITION } from "../../src/game/content/stage15";
import { Stage15Battle, createStage15DeploymentRoster } from "../../src/game/simulation/stage15-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-15",
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
    ...STAGE15_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE15_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE15_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 15 battle simulation", () => {
  it("builds a ten-unit player team and Lan's ten-unit expert guard", () => {
    const roster = createStage15DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "瑪琳",
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "摩莉娜",
    });

    const battle = new Stage15Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 31, life: 240,
    });
    expect(battle.unit("2:9")).toMatchObject({
      classId: "half-dragon-warrior", name: "蘭", portrait: 35, x: 25, y: 23,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-floor-two-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:9")).toMatchObject({
      id: "lan-dragon-tower-floor-two-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE15_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage15Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("keeps six central sentries through round five and releases them on round six, including restore", () => {
    const battle = new Stage15Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const sentries = ["2:47", "2:9", "2:48", "2:44", "2:45", "2:49"];
    expect(enemies).toEqual([
      "2:52", "2:51", "2:40", "2:47", "2:9",
      "2:41", "2:48", "2:44", "2:45", "2:49",
    ]);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(6).fill(1));
    expect(sentries.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(6).fill("sentry"));
    expect(["2:52", "2:51", "2:40", "2:41"].map((id) => battle.enemyAiIntentFor(id)))
      .toEqual(Array(4).fill("pursuit"));

    for (let round = 2; round <= 5; round += 1) battle.startNextRound();
    expect(battle.round).toBe(5);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(6).fill(1));

    battle.startNextRound();
    expect(battle.round).toBe(6);
    expect(enemies.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(10).fill(0));
    expect(enemies.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(10).fill("pursuit"));
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);

    const restored = new Stage15Battle(campaign, fullDeployment);
    restored.restore(battle.serializableSnapshot());
    expect(restored.round).toBe(6);
    expect(enemies.map((id) => restored.enemyBehaviorFor(id))).toEqual(Array(10).fill(0));
    expect(enemies.map((id) => restored.enemyAiIntentFor(id))).toEqual(Array(10).fill("pursuit"));
  });

  it("wins when Lan leaves while nine guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage15Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:9");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(9);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage15Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:52");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage15Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:9");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage15Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
