import { describe, expect, it } from "vitest";
import { stage3TerrainSlotAt } from "../../src/game/content/stage3";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { Stage3Battle } from "../../src/game/simulation/stage3-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-03",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 1, classId: "monk", experience: 520, life: 120 },
    { slot: 3, classId: "warrior", experience: 480, life: 140 },
    { slot: 4, classId: "archer", experience: 360, life: 90 },
    { slot: 21, classId: "soldier", experience: 330, life: 120 },
  ]),
  rngState: 0x12345678,
  rngCalls: 7,
};

describe("stage 3 battle construction and stable-remake automation", () => {
  it("builds the fixed 13-vs-12 roster with inherited classes and named leaders", () => {
    const battle = new Stage3Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(13);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(12);
    expect(battle.unit("1:1")).toMatchObject({ classId: "monk", name: "希蜜", x: 16, y: 36 });
    expect(battle.unit("1:3")).toMatchObject({ classId: "warrior", name: "黛西", x: 28, y: 18 });
    expect(battle.unit("1:4")).toMatchObject({ classId: "archer", name: "拉朵那", x: 18, y: 36 });
    expect(battle.unit("2:17")).toMatchObject({ classId: "monk", name: "莎", x: 18, y: 15 });
    expect(battle.focusId).toBe("1:1");
  });

  it("exposes behavior-zero allies to the player and schedules automatic allies in map order", () => {
    const battle = new Stage3Battle(campaign);
    expect(["1:54", "1:53", "1:52", "1:51", "1:1", "1:4"]
      .every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(["1:21", "1:46", "1:45", "1:47", "1:3", "1:20", "1:50"]
      .some((id) => battle.isPlayerControllableAlly(id))).toBe(false);
    expect(battle.alliedActionOrder(false)).toEqual([
      "1:21", "1:46", "1:45", "1:47", "1:3", "1:20", "1:50",
    ]);
    expect(battle.groupCommander?.id).toBe("1:1");
    expect(battle.forceForUnit("1:1")).toMatchObject({
      id: "himi-rescue-force",
      control: "player",
      doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("1:46")).toMatchObject({
      id: "fourth-corps",
      control: "independent-ai",
      tacticLabel: "固守防區",
      doctrine: { strategy: "terrain-hold" },
    });
    expect(battle.forceForUnit("2:42")).toMatchObject({
      tacticLabel: "壓制第四軍團",
    });
    expect(battle.forceForUnit("2:44")).toMatchObject({
      tacticLabel: "阻擊救援隊",
    });
    expect(battle.planAlliedAiAction("1:54")).toBeDefined();
  });

  it("applies all-rest only to manual rescue units and leaves automatic allies for their phase", () => {
    const battle = new Stage3Battle(campaign);
    const manualIds = ["1:54", "1:53", "1:52", "1:51", "1:1", "1:4"];
    const automaticIds = ["1:21", "1:46", "1:45", "1:47", "1:3", "1:20", "1:50"];
    for (const id of [...manualIds, ...automaticIds]) battle.unit(id)!.life -= 10;

    expect(battle.restAllUnspentAllies().count).toBe(6);
    expect(manualIds.every((id) => battle.unit(id)?.acted)).toBe(true);
    expect(automaticIds.every((id) => !battle.unit(id)?.acted)).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual(automaticIds);
  });

  it("keeps automatic allies independent from the player's temporary group leader", () => {
    const independent = new Stage3Battle(campaign).planAlliedAiAction("1:46");
    const commanded = new Stage3Battle(campaign).planAlliedAiAction("1:46", "1:1");
    expect(commanded).toEqual(independent);
  });

  it("moves a behavior-4 follower toward its behavior-3 leader before ordinary actions", () => {
    const battle = new Stage3Battle(campaign);
    const follower = battle.unit("1:21")!;
    const leader = battle.unit("1:3")!;
    const distanceBefore = Math.abs(follower.x - leader.x) + Math.abs(follower.y - leader.y);
    const action = battle.planAlliedAiAction(follower.id);
    expect(action).toMatchObject({ unitId: follower.id, kind: "move" });
    const destination = action!.path.at(-1)!;
    expect(Math.abs(destination.x - leader.x) + Math.abs(destination.y - leader.y))
      .toBeLessThan(distanceBefore);
  });

  it("moves automatic allies that start outside the defense area into forest first", () => {
    const battle = new Stage3Battle(campaign);
    for (const id of ["1:47", "1:20"]) {
      const unit = battle.unit(id)!;
      expect(stage3TerrainSlotAt(unit)).toBe(2);
      const action = battle.planAlliedAiAction(id);
      expect(action).toMatchObject({ unitId: id, kind: "move" });
      expect(stage3TerrainSlotAt(action!.path.at(-1)!)).toBe(3);
    }
  });

  it("keeps every automatic-allied movement step inside forest or mountain", () => {
    const battle = new Stage3Battle(campaign);
    battle.units = battle.units.filter((unit) => unit.side === 1 || unit.id === "2:44");
    const enemy = battle.unit("2:44")!;
    enemy.x = 31;
    enemy.y = 20;
    const action = battle.planAlliedAiAction("1:45");
    expect(action).toBeDefined();
    expect(action!.kind).not.toBe("attack");
    expect(action!.path.every((position) => [3, 5].includes(stage3TerrainSlotAt(position))))
      .toBe(true);
  });

  it("rests an automatic ally below half life before it can attack or pursue", () => {
    const battle = new Stage3Battle(campaign);
    const unit = battle.unit("1:46")!;
    unit.life = Math.floor((battle.statsFor(unit).maxLife - 1) / 2);
    expect(battle.planAlliedAiAction(unit.id)).toEqual({
      unitId: unit.id,
      kind: "rest",
      path: [{ x: unit.x, y: unit.y }],
    });
  });

  it("has an automatic sister heal a sub-half-life automatic ally before other actions", () => {
    const battle = new Stage3Battle(campaign);
    const healer = battle.unit("1:46")!;
    healer.classId = "sister";
    healer.className = "修女";
    const target = battle.unit("1:45")!;
    target.life = Math.floor((battle.statsFor(target).maxLife - 1) / 2);
    expect(battle.planAlliedAiAction(healer.id)).toMatchObject({
      unitId: healer.id,
      kind: "special",
      actionId: "heal-1",
      targetId: target.id,
    });
  });

  it("keeps the two enemy corps on their assigned targets while those groups survive", () => {
    const assertAssignedTarget = (enemyId: string, expectsAutomatic: boolean) => {
      const battle = new Stage3Battle({ ...campaign, difficulty: 3 });
      battle.units = battle.units.filter((unit) => unit.side === 1 || unit.id === enemyId);
      const enemy = battle.unit(enemyId)!;
      const automatic = battle.unit("1:46")!;
      const rescue = battle.unit("1:54")!;
      enemy.x = 24;
      enemy.y = 13;
      automatic.x = 24;
      automatic.y = 14;
      rescue.x = 23;
      rescue.y = 13;

      const action = battle.planEnemyAiAction(enemyId);
      expect(action?.targetId, `${enemyId} should select an assigned target`).toBeDefined();
      expect(battle.isPlayerControllableAlly(action!.targetId!)).toBe(!expectsAutomatic);
    };

    for (const id of ["2:42", "2:41", "2:40", "2:43", "2:17"]) {
      assertAssignedTarget(id, true);
    }
    for (const id of ["2:44", "2:45", "2:47", "2:46", "2:50", "2:48", "2:49"]) {
      assertAssignedTarget(id, false);
    }
  });

  it("falls back to any surviving opponent after an enemy corps loses its preferred force", () => {
    const battle = new Stage3Battle(campaign);
    battle.units = battle.units.filter((unit) =>
      unit.id === "2:42" || battle.forceForUnit(unit.id)?.id === "himi-rescue-force");
    const enemy = battle.unit("2:42")!;
    const rescue = battle.unit("1:54")!;
    enemy.x = 24;
    enemy.y = 13;
    rescue.x = 24;
    rescue.y = 14;

    expect(battle.planEnemyAiAction(enemy.id)).toMatchObject({
      kind: "attack",
      targetId: rescue.id,
    });
  });

  it("lets the enemy monk select the best healing action without a planning roll", () => {
    const battle = new Stage3Battle(campaign);
    const boss = battle.unit("2:17")!;
    boss.life -= 10;
    const callsBefore = battle.rng.calls;
    expect(battle.planEnemyAiAction(boss.id)).toMatchObject({
      unitId: boss.id,
      kind: "special",
      targetId: boss.id,
    });
    expect(battle.rng.calls).toBe(callsBefore);
  });

  it("limits Sha's recovery settlement to enemies inside the effect diamond", () => {
    const battle = new Stage3Battle(campaign);
    const boss = battle.unit("2:17")!;
    const enemies = battle.units.filter(({ side }) => side === 2);
    for (const enemy of enemies) {
      enemy.life = Math.max(1, battle.statsFor(enemy).maxLife - 100);
    }
    const lifeBefore = new Map(enemies.map(({ id, life }) => [id, life]));
    const prepared = battle.prepareSpecialAction({
      actionId: "recovery-1",
      actorId: boss.id,
      targetId: boss.id,
    });
    const expectedAffected = enemies
      .filter((unit) => Math.abs(unit.x - boss.x) + Math.abs(unit.y - boss.y) < 3)
      .map(({ id }) => id)
      .sort();
    expect(prepared.result.affectedUnits.map(({ unitId }) => unitId).sort())
      .toEqual(expectedAffected);

    const outside = enemies.find(
      (unit) => Math.abs(unit.x - boss.x) + Math.abs(unit.y - boss.y) >= 3,
    );
    expect(outside).toBeDefined();
    battle.commitPreparedAction(prepared);
    expect(battle.unit(outside!.id)?.life).toBe(lifeBefore.get(outside!.id));
  });

  it("wins only when Sha is removed and loses when either Himi or Daisy is removed", () => {
    const battle = new Stage3Battle(campaign);
    battle.units = battle.units.filter(({ id }) => id !== "2:42");
    expect(battle.outcome()).toBe("ongoing");
    battle.units = battle.units.filter(({ id }) => id !== "2:17");
    expect(battle.outcome()).toBe("victory");

    for (const protectedId of ["1:1", "1:3"]) {
      const defeated = new Stage3Battle(campaign);
      defeated.units = defeated.units.filter(({ id }) => id !== protectedId);
      expect(defeated.outcome()).toBe("defeat");
    }
  });
});
