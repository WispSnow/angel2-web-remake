import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE28_DEFINITION,
  STAGE28_IRON_PLATE_TERRAIN_SLOT,
  STAGE28_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage28";
import {
  createStage28DeploymentRoster,
  Stage28Battle,
} from "../../src/game/simulation/stage28-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-28",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 840, life: 250 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 10, classId: "water-warrior", experience: 359, life: 260 },
    { slot: 25, classId: "half-dragon-warrior", experience: 319, life: 260 },
  ]),
  rngState: 0x28_28_28_28,
  rngCalls: 24,
};

const fullDeployment = {
  placements: [
    ...STAGE28_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE28_DEFINITION.deployment.optionalSlots.map((slot, index) => ({
      slot, position: { ...STAGE28_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 28 battle simulation", () => {
  it("builds all 29 allies and 17 static attackers from the deployment", () => {
    const roster = createStage28DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 0,
    });
    expect(roster.find(({ slot }) => slot === 25)).toMatchObject({
      classId: "half-dragon-warrior", experience: 319,
    });

    const battle = new Stage28Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(29);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(17);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 28, y: 24, life: 250,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-valkyrie-defense-team", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:41")).toMatchObject({
      id: "valkyrie-siege-force", control: "independent-ai",
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage28Battle(campaign, {
      placements: STAGE28_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(17);
  });

  it("wins only after all attackers leave and gives Nia defeat priority", () => {
    const battle = new Stage28Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("sends every native behavior-0 attacker into pursuit", () => {
    const battle = new Stage28Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies).toHaveLength(17);
    expect(enemies.map(({ id }) => battle.enemyBehaviorFor(id)))
      .toEqual(Array.from({ length: 17 }, () => 0));
    for (const enemy of enemies) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("uses the same logical construction slot for both native token-16 actions", () => {
    expect(STAGE28_IRON_PLATE_TERRAIN_SLOT).toBe(STAGE28_OBSTACLE_TERRAIN_SLOT);
  });
});
