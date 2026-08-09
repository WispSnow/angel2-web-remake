import { describe, expect, it } from "vitest";
import { ArenaBattle } from "../../src/game/simulation/arena-battle";
import { DeterministicRng } from "../../src/game/simulation/rng";

const placements = () => [
  { id: "ally-a", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
  { id: "ally-b", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 23, y: 30 },
  { id: "enemy-caster", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
  { id: "enemy-front", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 30 },
];

describe("REMAKE-033 stable-remake expert enemy AI", () => {
  it("uses one deterministic policy at every campaign difficulty without planning RNG", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const rng = new DeterministicRng(0x3300 + difficulty);
      const battle = new ArenaBattle(placements(), difficulty, rng);
      battle.unit("enemy-front")!.life = 1;
      const before = { state: rng.state, calls: rng.calls };

      const action = battle.planEnemyAiAction("enemy-caster");
      expect(action).toMatchObject({
        kind: "special",
        actionId: "heal-1",
        targetId: "enemy-front",
      });
      expect(battle.expertAiDecisionTrace("enemy-caster")?.policy)
        .toBe("stable-remake-expert");
      expect({ state: rng.state, calls: rng.calls }).toEqual(before);
    }
  });

  it("takes a guaranteed kill before emergency healing", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3301));
    battle.unit("ally-a")!.life = 1;
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-caster")).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: "ally-a",
    });
    expect(battle.expertAiDecisionTrace("enemy-caster")?.chosen?.reasons)
      .toContain("確定擊殺×1");
  });

  it("uses emergency healing before nonlethal damage", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3302));
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-caster")).toMatchObject({
      kind: "special",
      actionId: "heal-1",
      targetId: "enemy-front",
    });
    expect(battle.expertAiDecisionTrace("enemy-caster")?.chosen?.reasons)
      .toContain("緊急救援×1");
  });

  it("values clustered area damage over weaker single-target fire", () => {
    const battle = new ArenaBattle([
      { id: "ally-a", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-b", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-priest", side: 2 as const, slot: 0, classId: "magic-priest" as const, level: 2 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x3303));

    expect(battle.planEnemyAiAction("enemy-priest")).toMatchObject({
      kind: "special",
      actionId: "lightning-1",
    });
  });

  it("does not reapply a control status when an untreated target is legal", () => {
    const battle = new ArenaBattle([
      { id: "ally-treated", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-open", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-curse", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 1 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x3304));
    battle.unit("ally-treated")!.statuses.confusion = 3;

    expect(battle.planEnemyAiAction("enemy-curse")).toMatchObject({
      kind: "special",
      actionId: "confusion",
      targetId: "ally-open",
    });
  });

  it("re-evaluates squad actor priority from the current state", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3305));
    battle.unit("enemy-front")!.life = 1;
    const pending = ["enemy-caster", "enemy-front"];

    expect(battle.nextEnemyActionId(pending)).toBe("enemy-caster");

    battle.unit("ally-b")!.life = 1;
    expect(battle.nextEnemyActionId(pending)).toBe("enemy-front");
  });
});
