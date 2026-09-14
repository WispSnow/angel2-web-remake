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

  it("lets the water warrior's shot cross the valley cliffs the way an archer's does", () => {
    // REMAKE-149：死亡之谷的崖壁是原版规则槽 12。弓／弩／魔弓与法系都在这一槽填 `98`
    // （走不进、射得过），水戰士的近战移动表却是 `99`，所以此前谷底射不到崖顶的弩兵，
    // 也射不到停在崖壁格上的飛龍騎士。
    const battle = new Stage23Battle(campaign, {
      placements: STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    const shooter = battle.unit("1:0");
    const crossbow = battle.units.find(({ x, y }) => x === 32 && y === 25);
    const flyer = battle.units.find(({ x, y }) => x === 24 && y === 10);
    if (!shooter || !crossbow || !flyer) throw new Error("stage 23 cliff fixture moved");
    expect(crossbow).toMatchObject({ side: 2, classId: "crossbow" });
    expect(flyer).toMatchObject({ side: 2, classId: "flying-dragon-knight" });
    shooter.classId = "water-warrior";
    battle.units = [shooter, crossbow, flyer];

    // 谷底 (30,24) 与崖顶弩兵 (32,25) 之间隔着整列崖壁 x=31。
    shooter.x = 30;
    shooter.y = 24;
    expect(battle.terrainSlotAt({ x: 31, y: 24 })).toBe(12);
    expect(battle.terrainSlotAt({ x: 31, y: 25 })).toBe(12);
    expect(battle.actionTargetCells(shooter.id, "water-warrior-shot"))
      .toContainEqual({ x: 32, y: 25 });

    // 飛龍騎士本身停在崖壁格 (24,10) 上，与 (24,12) 之间只隔一格平地。
    shooter.x = 24;
    shooter.y = 12;
    expect(battle.terrainSlotAt({ x: 24, y: 10 })).toBe(12);
    expect(battle.actionTargetCells(shooter.id, "water-warrior-shot"))
      .toContainEqual({ x: 24, y: 10 });
    const prepared = battle.prepareSpecialAction({
      actionId: "water-warrior-shot",
      actorId: shooter.id,
      targetId: flyer.id,
      target: { x: flyer.x, y: flyer.y },
    });
    expect(prepared.result.damage).toBeGreaterThanOrEqual(30);
    expect(prepared.result.damage).toBeLessThanOrEqual(49);
  });
});
