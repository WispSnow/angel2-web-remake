import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE24_DEFINITION } from "../../src/game/content/stage24";
import {
  createStage24DeploymentRoster,
  Stage24Battle,
} from "../../src/game/simulation/stage24-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-24",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 760, life: 240 },
    { slot: 7, classId: "magic-priest", experience: 660, life: 180 },
    { slot: 10, classId: "water-warrior", experience: 319, life: 250 },
    { slot: 11, classId: "water-warrior", experience: 319, life: 250 },
  ]),
  rngState: 0x24_24_24_24,
  rngCalls: 16,
};

const fullDeployment = {
  placements: [
    ...STAGE24_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE24_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
      slot, position: { ...STAGE24_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 24 battle simulation", () => {
  it("builds the 15-unit deployment and all 22 static guards", () => {
    const roster = createStage24DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 660,
    });
    const battle = new Stage24Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(15);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(22);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 27, y: 39, life: 380,
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage24Battle(campaign, {
      placements: STAGE24_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(22);
  });

  it("wins when Nia enters linear cells 0–1030 while every guard remains", () => {
    const battle = new Stage24Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 24 test is missing Nia");
    nia.x = 30;
    nia.y = 20;
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(22);
    expect(battle.outcome()).toBe("victory");

    nia.x = 31;
    nia.y = 20;
    expect(battle.outcome()).toBe("ongoing");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps native behavior 1 to sentry and behavior 2 to pursuit", () => {
    const battle = new Stage24Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    const sentries = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 1);
    const pursuers = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) !== 1);
    expect(sentries).toHaveLength(12);
    expect(pursuers).toHaveLength(10);
    for (const enemy of sentries) expect(battle.enemyAiIntentFor(enemy.id)).toBe("sentry");
    for (const enemy of pursuers) expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    for (const enemy of enemies) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
