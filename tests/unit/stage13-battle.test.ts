import { describe, expect, it } from "vitest";
import { classStatsFor } from "../../src/game/content/classes";
import { manhattan, movementCost } from "../../src/game/simulation/grid";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE13_DEFINITION } from "../../src/game/content/stage13";
import { Stage13Battle, createStage13DeploymentRoster } from "../../src/game/simulation/stage13-battle";
import type { CampaignState, Position } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-13",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 1, classId: "soldier", experience: 299, life: 120 },
    { slot: 24, classId: "wizard", experience: 660, life: 150 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const fullDeployment = {
  placements: [
    ...STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE13_DEFINITION.deployment.optionalSlots.slice(0, 11).map((slot, index) => ({
      slot, position: { ...STAGE13_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 13 battle simulation", () => {
  it("gives the newly recruited water warriors the native uniform movement mode", () => {
    // MOVE-005：短码 `0N` 的「移動」走传播模式 `0`，每格统一扣 1、不读阵营图也不建立
    // `FFh` 控制区，所以移动力 8 的摩莉娜的可达范围正好是曼哈顿 7 的菱形，只去掉本职业
    // 规则 99 的地形与已占格。她的士兵同伴仍按地形加权，范围形状完全不同。
    const battle = new Stage13Battle(campaign, fullDeployment);
    const molina = battle.unit("1:11")!;
    expect(molina).toMatchObject({ classId: "water-warrior", name: "摩莉娜", x: 34, y: 37 });
    expect(battle.statsFor(molina).movement).toBe(8);

    const battlefield = {
      width: STAGE13_DEFINITION.width,
      height: STAGE13_DEFINITION.height,
      terrainSlotAt: (position: Position) => battle.terrainSlotAt(position),
    };
    const occupied = new Set(battle.units
      .filter(({ id }) => id !== molina.id)
      .map(({ x, y }) => `${x},${y}`));
    const expected: string[] = [];
    for (let y = 0; y < STAGE13_DEFINITION.height; y += 1) {
      for (let x = 0; x < STAGE13_DEFINITION.width; x += 1) {
        const key = `${x},${y}`;
        if (manhattan({ x, y }, molina) > 7 || occupied.has(key)) continue;
        if (movementCost("water-warrior", { x, y }, battlefield) >= 99) continue;
        expected.push(key);
      }
    }

    const reachable = battle.reachableCells(molina.id).map(({ x, y }) => `${x},${y}`);
    expect([...reachable].sort()).toEqual([...expected].sort());
    // 同一个菱形里有代价 3 的地形；加权模式下她走不到那么远。
    expect(movementCost("water-warrior", { x: 30, y: 37 }, battlefield)).toBe(3);
    expect(reachable).toContain("30,37");
  });


  it("builds a twelve-unit player strike team and Marsiel's nine-unit expert guard", () => {
    const roster = createStage13DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior",
      experience: 299,
      life: classStatsFor({ classId: "water-warrior", experience: 299 }).maxLife,
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299,
    });

    const battle = new Stage13Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(12);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(9);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 36, y: 37, life: 340,
    });
    expect(battle.unit("1:10")).toMatchObject({ classId: "water-warrior", name: "瑪琳", portrait: 26 });
    expect(battle.unit("1:11")).toMatchObject({ classId: "water-warrior", name: "摩莉娜", portrait: 27 });
    expect(battle.unit("2:24")).toMatchObject({
      classId: "divine-sword-warrior", name: "瑪西爾", portrait: 31, x: 19, y: 17,
    });
    expect(battle.units.filter(({ side }) => side === 2).map(({ id, portrait }) => ({ id, portrait })))
      .toEqual([
        { id: "2:24", portrait: 31 },
        { id: "2:43", portrait: 53 },
        { id: "2:46", portrait: 53 },
        { id: "2:47", portrait: 49 },
        { id: "2:41", portrait: 49 },
        { id: "2:42", portrait: 58 },
        { id: "2:45", portrait: 53 },
        { id: "2:48", portrait: 60 },
        { id: "2:49", portrait: 49 },
      ]);
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-strike-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:24")).toMatchObject({
      id: "marsiel-dragon-tower-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage13Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.campaignSnapshot().roster[10]).toMatchObject({
      classId: "water-warrior", experience: 299,
    });
    expect(battle.campaignSnapshot().roster[11]).toMatchObject({
      classId: "water-warrior", experience: 299,
    });
  });

  it("uses water warrior only as an untouched newcomer baseline", () => {
    const inheritedCampaign: CampaignState = {
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 10, classId: "land-knight", experience: 640, life: 210 },
      ]),
    };
    expect(createStage13DeploymentRoster(inheritedCampaign).find(({ slot }) => slot === 10))
      .toMatchObject({ classId: "land-knight", experience: 640, life: 340 });
    expect(createStage13DeploymentRoster(inheritedCampaign).find(({ slot }) => slot === 11))
      .toMatchObject({ classId: "water-warrior", experience: 299 });
    const deployment = {
      placements: STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const inheritedBattle = new Stage13Battle(inheritedCampaign, deployment);
    expect(inheritedBattle.campaignSnapshot().roster[10])
      .toMatchObject({ classId: "land-knight", experience: 640, life: 340 });
    expect(inheritedBattle.campaignSnapshot().roster[11])
      .toMatchObject({ classId: "water-warrior", experience: 299 });
  });

  it("has exactly the nine opening enemies and no later reinforcement", () => {
    const battle = new Stage13Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    expect(enemies).toEqual(["2:24", "2:43", "2:46", "2:47", "2:41", "2:42", "2:45", "2:48", "2:49"]);
    battle.startNextRound();
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);
  });

  it("wins when Marsiel leaves even if eight guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage13Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:24");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(8);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage13Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:43");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage13Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:24");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage13Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
