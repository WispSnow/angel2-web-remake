import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE19_DEFINITION } from "../../src/game/content/stage19";
import { Stage19Battle, createStage19DeploymentRoster } from "../../src/game/simulation/stage19-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-19",
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
    ...STAGE19_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE19_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE19_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 19 battle simulation", () => {
  it("builds a ten-unit player team and Ai's twenty-one-unit expert guard", () => {
    const roster = createStage19DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "瑪琳",
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299, name: "摩莉娜",
    });

    const battle = new Stage19Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 33, life: 340,
    });
    expect(battle.unit("2:13")).toMatchObject({
      classId: "half-dragon-warrior", name: "愛", portrait: 39, x: 25, y: 12,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-floor-six-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:13")).toMatchObject({
      id: "ai-dragon-tower-floor-six-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE19_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage19Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("keeps thirteen guards as sentries through round five and releases them on round six", () => {
    const battle = new Stage19Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const sentries = enemies.filter((id) => battle.enemyBehaviorFor(id) === 1);
    const pursuers = enemies.filter((id) => battle.enemyBehaviorFor(id) !== 1);
    expect(sentries).toEqual([
      "2:31", "2:13", "2:30", "2:46", "2:38", "2:36", "2:40",
      "2:45", "2:35", "2:41", "2:44", "2:43", "2:42",
    ]);
    expect(pursuers).toEqual(["2:52", "2:47", "2:51", "2:48", "2:55", "2:50", "2:49", "2:54"]);
    expect(sentries.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(13).fill("sentry"));
    expect(pursuers.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(8).fill("pursuit"));

    for (let round = 2; round <= 5; round += 1) battle.startNextRound();
    expect(battle.round).toBe(5);
    expect(sentries.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(13).fill(1));

    battle.startNextRound();
    expect(battle.round).toBe(6);
    expect(enemies.map((id) => battle.enemyBehaviorFor(id))).toEqual(Array(21).fill(0));
    expect(enemies.map((id) => battle.enemyAiIntentFor(id))).toEqual(Array(21).fill("pursuit"));
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);

    const restored = new Stage19Battle(campaign, fullDeployment);
    restored.restore(battle.serializableSnapshot());
    expect(restored.round).toBe(6);
    expect(enemies.map((id) => restored.enemyBehaviorFor(id))).toEqual(Array(21).fill(0));
  });

  it("wins when Ai leaves while twenty guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage19Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:13");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(20);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage19Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:31");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage19Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:13");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage19Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
