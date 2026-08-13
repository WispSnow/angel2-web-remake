import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE32_DEFINITION,
  STAGE32_IRON_PLATE_TERRAIN_SLOT,
  STAGE32_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage32";
import {
  createStage32DeploymentRoster,
  Stage32Battle,
} from "../../src/game/simulation/stage32-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-32",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 900, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
    { slot: 25, classId: "half-dragon-warrior", experience: 359, life: 280 },
  ]),
  rngState: 0x32_32_32_32,
  rngCalls: 32,
};

const fullDeployment = {
  placements: [
    ...STAGE32_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE32_DEFINITION.deployment.optionalSlots.slice(0, 15).map((slot, index) => ({
      slot, position: { ...STAGE32_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 32 battle simulation", () => {
  it("builds a sixteen-person pursuit force and eighteen static enemies", () => {
    const roster = createStage32DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot)).not.toContain(23);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 0,
    });

    const battle = new Stage32Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(16);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(18);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 26, y: 28, life: 270,
    });
    expect(battle.unit("2:5")).toMatchObject({
      classId: "demon-dragon-knight", name: "菲伊魯茵", portrait: 25, x: 26, y: 23,
    });
    expect(battle.unit("2:6")).toMatchObject({
      classId: "demon-dragon-knight", name: "芙瑪羅妮", portrait: 11, x: 26, y: 18,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-sterling-strait-main-force", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:6")).toMatchObject({
      id: "feiluyin-fumaroni-alliance", control: "independent-ai",
    });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({
      classId: "empress", life: 380,
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage32Battle(campaign, {
      placements: STAGE32_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(18);
  });

  it("wins only after both knight forces leave and gives Nia defeat priority", () => {
    const battle = new Stage32Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("sends every native behavior-0 enemy into shared expert pursuit", () => {
    const battle = new Stage32Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies).toHaveLength(18);
    expect(enemies.map(({ id }) => battle.enemyBehaviorFor(id)))
      .toEqual(Array.from({ length: 18 }, () => 0));
    for (const enemy of enemies) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("never creates a nineteenth enemy across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage32Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(18);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(17);
    }
  });

  it("keeps the native iron-plate and obstacle construction slots distinct", () => {
    expect(STAGE32_IRON_PLATE_TERRAIN_SLOT).toBe(2);
    expect(STAGE32_OBSTACLE_TERRAIN_SLOT).toBe(7);
  });
});
