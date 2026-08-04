import { describe, expect, it } from "vitest";
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

describe("stage 3 battle construction and native automation", () => {
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

  it("lets the enemy monk select its native healing pool and consumes one planning roll", () => {
    const battle = new Stage3Battle(campaign);
    const boss = battle.unit("2:17")!;
    boss.life -= 10;
    const callsBefore = battle.rng.calls;
    expect(battle.planEnemyAiAction(boss.id)).toMatchObject({
      unitId: boss.id,
      kind: "special",
      targetId: boss.id,
    });
    expect(battle.rng.calls).toBe(callsBefore + 1);
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
