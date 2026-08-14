import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE23_DEFINITION } from "../../src/game/content/stage23";
import {
  createStage23DeploymentRoster,
  Stage23Battle,
} from "../../src/game/simulation/stage23-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-23",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 7, classId: "magic-priest", experience: 620, life: 180 },
    { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
    { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
  ]),
  rngState: 0x23_23_23_23,
  rngCalls: 15,
};

const fullDeployment = {
  placements: [
    ...STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE23_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
      slot, position: { ...STAGE23_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 23 battle simulation", () => {
  it("commits Kins's magic-priest entry class for an untouched roster slot", () => {
    const untouchedCampaign: CampaignState = {
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 0, classId: "land-knight", experience: 720, life: 240 },
      ]),
    };
    const roster = createStage23DeploymentRoster(untouchedCampaign);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯",
      classId: "magic-priest",
      experience: 0,
      life: 305,
    });
    const battle = new Stage23Battle(untouchedCampaign, {
      placements: STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.campaignSnapshot().roster[7]).toMatchObject({
      slot: 7,
      classId: "magic-priest",
      experience: 0,
      life: 305,
    });
  });

  it("builds the 15-unit deployment and all 21 static guards", () => {
    const roster = createStage23DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 620,
    });
    const battle = new Stage23Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(15);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 25, y: 38, life: 340,
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage23Battle(campaign, {
      placements: STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
  });

  it("wins when Nia enters linear cells 0–524 while every guard remains", () => {
    const battle = new Stage23Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 23 test is missing Nia");
    nia.x = 24;
    nia.y = 10;
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
    expect(battle.outcome()).toBe("victory");

    nia.x = 25;
    nia.y = 10;
    expect(battle.outcome()).toBe("ongoing");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps native behavior 1 to sentry and behaviors 0/2 to pursuit", () => {
    const battle = new Stage23Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    const sentries = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 1);
    const pursuers = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) !== 1);
    expect(sentries).toHaveLength(9);
    expect(pursuers).toHaveLength(12);
    for (const enemy of sentries) expect(battle.enemyAiIntentFor(enemy.id)).toBe("sentry");
    for (const enemy of pursuers) expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
