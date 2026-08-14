import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE34_DEFINITION,
  STAGE34_IRON_PLATE_TERRAIN_SLOT,
  STAGE34_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage34";
import {
  createStage34DeploymentRoster,
  Stage34Battle,
} from "../../src/game/simulation/stage34-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-34",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
  ]),
  rngState: 0x34_34_34_34,
  rngCalls: 34,
};

const fullDeployment = {
  placements: [
    ...STAGE34_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE34_DEFINITION.deployment.optionalSlots.slice(0, 10).map((slot, index) => ({
      slot, position: { ...STAGE34_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 34 battle simulation", () => {
  it("builds an eleven-person assault force and nineteen static enemies", () => {
    const roster = createStage34DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot).sort((a, b) => a - b))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));
    const battle = new Stage34Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(11);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(19);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 30, y: 21, life: 390,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-lannal-interior-assault-force", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:7")).toMatchObject({
      id: "renagiv-lannal-interior-force", control: "independent-ai",
    });
    expect(battle.unit("2:6")).toMatchObject({ name: "芙瑪羅妮", portrait: 11 });
    expect(battle.unit("2:7")).toMatchObject({ name: "蕾娜吉芙", portrait: 24 });
    expect(battle.campaignSnapshot().roster[22]).toMatchObject({ classId: "great-axe-warrior" });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({ classId: "empress" });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("refills the deployment roster and deployed units to maximum life on entry", () => {
    // 与 stage 35 同一条原版规则：模块 29 新战 `0000:536B` 重建后当前生命回满，
    // 部署名单和提交后的战场单位都不带入上一关的残血。
    const damaged: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => ({ ...entry, life: 9 })),
    };
    for (const entry of createStage34DeploymentRoster(damaged)) {
      expect(entry.life, `roster ${entry.slot}`).toBeGreaterThan(9);
    }
    const battle = new Stage34Battle(damaged, fullDeployment);
    for (const unit of battle.units.filter(({ side }) => side === 1)) {
      expect(unit.life, unit.id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:0")?.life).toBe(390);
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage34Battle(campaign, {
      placements: STAGE34_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(19);
  });

  it("wins only after all guards leave and gives Nia defeat priority", () => {
    const battle = new Stage34Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps all nineteen behavior-0 enemies to pursuit", () => {
    const battle = new Stage34Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies).toHaveLength(19);
    for (const enemy of enemies) {
      expect(battle.enemyBehaviorFor(enemy.id)).toBe(0);
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    }
    for (const enemy of enemies) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("never creates a twentieth enemy across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage34Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(19);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(18);
    }
  });

  it("uses the shared native construction terrain slot", () => {
    expect(STAGE34_IRON_PLATE_TERRAIN_SLOT).toBe(0);
    expect(STAGE34_OBSTACLE_TERRAIN_SLOT).toBe(0);
  });
});
