import { describe, expect, it } from "vitest";
import { usesClassIdentity } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE33_DEFINITION,
  STAGE33_IRON_PLATE_TERRAIN_SLOT,
  STAGE33_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage33";
import {
  createStage33DeploymentRoster,
  Stage33Battle,
} from "../../src/game/simulation/stage33-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-33",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
  ]),
  rngState: 0x33_33_33_33,
  rngCalls: 33,
};

const fullDeployment = {
  placements: [
    ...STAGE33_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE33_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE33_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 33 battle simulation", () => {
  it("builds a ten-person assault force and twenty-nine static guards", () => {
    const roster = createStage33DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot).sort((a, b) => a - b))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));
    const battle = new Stage33Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(29);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 27, y: 44, life: 390,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-lannal-outskirts-assault-force", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:55")).toMatchObject({
      id: "lannal-outskirts-garrison", control: "independent-ai",
    });
    const alice = battle.unit("2:23");
    const marciel = battle.unit("2:24");
    expect(alice).toMatchObject({
      classId: "swift-dragon-knight", name: "阿莉絲", portrait: 30, x: 25, y: 12,
    });
    expect(marciel).toMatchObject({
      classId: "swift-dragon-knight", name: "瑪西爾", portrait: 31, x: 27, y: 12,
    });
    if (!alice || !marciel) throw new Error("missing stage 33 named guards");
    expect(usesClassIdentity(alice)).toBe(false);
    expect(usesClassIdentity(marciel)).toBe(false);
    expect(battle.campaignSnapshot().roster[22]).toMatchObject({ classId: "great-axe-warrior" });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({ classId: "empress" });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage33Battle(campaign, {
      placements: STAGE33_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(29);
  });

  it("wins only after all guards leave and gives Nia defeat priority", () => {
    const battle = new Stage33Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps fifteen behavior-1 guards to sentry and the rest to pursuit", () => {
    const battle = new Stage33Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    const sentries = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 1);
    const pursuers = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) !== 1);
    expect(sentries).toHaveLength(15);
    expect(pursuers).toHaveLength(14);
    for (const enemy of sentries) expect(battle.enemyAiIntentFor(enemy.id)).toBe("sentry");
    for (const enemy of pursuers) expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    for (const enemy of enemies) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("never creates a thirtieth enemy across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage33Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(29);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(28);
    }
  });

  it("uses the shared native construction terrain slot", () => {
    expect(STAGE33_IRON_PLATE_TERRAIN_SLOT).toBe(2);
    expect(STAGE33_OBSTACLE_TERRAIN_SLOT).toBe(2);
  });
});
