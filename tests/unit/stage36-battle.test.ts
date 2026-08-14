import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE36_DEFINITION,
  STAGE36_IRON_PLATE_TERRAIN_SLOT,
  STAGE36_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage36";
import {
  createStage36DeploymentRoster,
  Stage36Battle,
} from "../../src/game/simulation/stage36-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-36",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
  ]),
  rngState: 0x36_36_36_36,
  rngCalls: 36,
};

const fullDeployment = {
  placements: [
    ...STAGE36_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE36_DEFINITION.deployment.optionalSlots.slice(0, 27).map((slot, index) => ({
      slot, position: { ...STAGE36_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 36 battle simulation", () => {
  it("builds a twenty-eight-person pursuit force and thirty static enemies", () => {
    const roster = createStage36DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot).sort((a, b) => a - b))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));
    const battle = new Stage36Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(28);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(30);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 24, y: 27,
    });
    expect(battle.unit("2:1")).toMatchObject({
      classId: "wizard", name: "碧娜維姬", portrait: 8, x: 23, y: 13,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-otherworld-assault-force", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:1")).toMatchObject({
      id: "bina-vige-otherworld-force", control: "independent-ai", commanderId: "2:1",
    });
    expect(battle.campaignSnapshot().roster[22]).toMatchObject({ classId: "great-axe-warrior" });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({ classId: "empress" });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage36Battle(campaign, {
      placements: STAGE36_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(30);
  });

  it("wins when Bina Vige leaves even if other enemies remain, with Nia defeat priority", () => {
    const battle = new Stage36Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ id }) => id !== "2:1");
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(29);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps the boss to sentry and every other behavior group to pursuit", () => {
    const battle = new Stage36Battle(campaign, fullDeployment);
    expect(battle.enemyBehaviorFor("2:1")).toBe(1);
    expect(battle.enemyAiIntentFor("2:1")).toBe("sentry");
    for (const enemy of battle.units.filter(({ side, id }) => side === 2 && id !== "2:1")) {
      expect([0, 2]).toContain(battle.enemyBehaviorFor(enemy.id));
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    }
  });

  it("never creates a thirty-first enemy across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage36Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(30);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(29);
    }
  });

  it("refills deployment entries and deployed allies to maximum life", () => {
    const damaged: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => ({ ...entry, life: 7 })),
    };
    for (const entry of createStage36DeploymentRoster(damaged)) {
      expect(entry.life, `roster ${entry.slot}`).toBeGreaterThan(7);
    }
    const battle = new Stage36Battle(damaged, fullDeployment);
    for (const unit of battle.units.filter(({ side }) => side === 1)) {
      expect(unit.life, unit.id).toBe(battle.statsFor(unit).maxLife);
    }
  });

  it("uses the stage 36 native construction terrain slot", () => {
    expect(STAGE36_IRON_PLATE_TERRAIN_SLOT).toBe(13);
    expect(STAGE36_OBSTACLE_TERRAIN_SLOT).toBe(13);
  });
});
