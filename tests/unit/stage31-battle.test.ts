import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE31_DEFINITION,
  STAGE31_IRON_PLATE_TERRAIN_SLOT,
  STAGE31_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage31";
import {
  createStage31DeploymentRoster,
  Stage31Battle,
} from "../../src/game/simulation/stage31-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-31",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 840, life: 250 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 10, classId: "water-warrior", experience: 359, life: 260 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
    { slot: 25, classId: "half-dragon-warrior", experience: 319, life: 260 },
  ]),
  rngState: 0x31_31_31_31,
  rngCalls: 31,
};

const fullDeployment = {
  placements: [
    ...STAGE31_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE31_DEFINITION.deployment.optionalSlots.slice(0, 12).map((slot, index) => ({
      slot, position: { ...STAGE31_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 31 battle simulation", () => {
  it("builds a 17-person crossing force and 15 static ambushers", () => {
    const roster = createStage31DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 0,
    });
    expect(roster.find(({ slot }) => slot === 25)).toMatchObject({
      classId: "half-dragon-warrior", experience: 319,
    });

    const battle = new Stage31Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(17);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 26, y: 33, life: 250,
    });
    expect(battle.unit("2:5")).toMatchObject({
      classId: "demon-dragon-knight", name: "菲伊魯茵", portrait: 25, x: 16, y: 14,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-sterling-strait-crossing-team", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:5")).toMatchObject({
      id: "feiluyin-ambush-force", control: "independent-ai",
    });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({
      classId: "empress", life: 380,
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native five-fixed-unit minimum deployment", () => {
    const battle = new Stage31Battle(campaign, {
      placements: STAGE31_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:4", "1:3", "1:2", "1:1", "1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
  });

  it("wins only after all attackers leave and gives Nia defeat priority", () => {
    const battle = new Stage31Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("sends every native behavior-0 attacker into pursuit", () => {
    const battle = new Stage31Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies).toHaveLength(15);
    expect(enemies.map(({ id }) => battle.enemyBehaviorFor(id)))
      .toEqual(Array.from({ length: 15 }, () => 0));
    for (const enemy of enemies) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("never generates or replaces ambushers across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage31Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(15);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(14);
    }
  });

  it("uses the same logical construction slot for both native token-77 actions", () => {
    expect(STAGE31_IRON_PLATE_TERRAIN_SLOT).toBe(STAGE31_OBSTACLE_TERRAIN_SLOT);
  });
});
