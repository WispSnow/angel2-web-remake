import { describe, expect, it } from "vitest";
import { ArenaBattle } from "../../src/game/simulation/arena-battle";
import { shootingLineVisitProbabilities } from "../../src/game/simulation/actions/range-map";
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

  it("moves a shooter toward the safest effective range edge instead of closing for no reason", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3306));

    const action = battle.planEnemyAiAction("enemy-archer");
    expect(action).toMatchObject({
      kind: "special",
      actionId: "archer-shot",
      targetId: "ally-target",
    });
    const destination = action!.path.at(-1)!;
    expect(Math.abs(destination.x - 22) + Math.abs(destination.y - 30)).toBe(4);
    expect(battle.expertAiDecisionTrace("enemy-archer")?.chosen?.reasons).toContain("射距 4");
  });

  it("values full ranged threat exposure before stretching to maximum range", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-crossbow", side: 1 as const, slot: 1, classId: "crossbow" as const, level: 1 as const, x: 38, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3311));

    const action = battle.planEnemyAiAction("enemy-archer");
    expect(action).toMatchObject({ kind: "special", actionId: "archer-shot" });
    const destination = action!.path.at(-1)!;
    expect(Math.abs(destination.x - 22) + Math.abs(destination.y - 30)).toBe(4);
    expect(Math.abs(destination.x - 38) + Math.abs(destination.y - 30)).toBeGreaterThan(13);
    expect(battle.expertAiDecisionTrace("enemy-archer")?.chosen?.reasons).toContain("射距 4");
  });

  it("counts deterministic magic-arrow line value without reading the planning RNG", () => {
    const rng = new DeterministicRng(0x3307);
    const battle = new ArenaBattle([
      { id: "ally-far", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-line", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-magic-archer", side: 2 as const, slot: 0, classId: "magic-archer" as const, level: 1 as const, x: 27, y: 30 },
    ], 0, rng);
    const before = { state: rng.state, calls: rng.calls };

    expect(battle.planEnemyAiAction("enemy-magic-archer")).toMatchObject({
      kind: "special",
      actionId: "magic-archer-shot",
      targetId: "ally-far",
    });
    expect(battle.expertAiDecisionTrace("enemy-magic-archer")?.chosen?.reasons)
      .toContain("有效傷害 88");
    expect({ state: rng.state, calls: rng.calls }).toEqual(before);
  });

  it("weights every legal magic-arrow predecessor branch uniformly", () => {
    const probabilities = shootingLineVisitProbabilities(
      { x: 0, y: 0, classId: "magic-archer" },
      { x: 2, y: 2 },
      { width: 5, height: 5, terrainSlotAt: () => 1 },
      6,
    );

    expect(probabilities.get("2,2")).toBe(1);
    expect(probabilities.get("2,1")).toBeCloseTo(.5);
    expect(probabilities.get("1,1")).toBeCloseTo(.5);
    expect(probabilities.get("0,1")).toBeCloseTo(.5);
    expect(probabilities.has("0,0")).toBe(false);
  });

  it("defers an actual ice choice until every non-ice actor has gone", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 29 },
    ], 0, new DeterministicRng(0x3308));

    expect(battle.planEnemyAiAction("enemy-wizard")?.actionId).toBe("ice-2");
    expect(battle.nextEnemyActionId(["enemy-wizard", "enemy-warrior"]))
      .toBe("enemy-warrior");
  });

  it("keeps a wizard in normal priority when it chooses a kill instead of ice", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 30, y: 30 },
    ], 0, new DeterministicRng(0x3309));
    battle.unit("ally")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-wizard")).toMatchObject({ kind: "attack" });
    expect(battle.nextEnemyActionId(["enemy-wizard", "enemy-warrior"]))
      .toBe("enemy-wizard");
  });

  it("forbids ice when every surviving enemy has an ice technique", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-wizard-a", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-wizard-b", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3310));

    expect(battle.planEnemyAiAction("enemy-wizard-a")?.actionId).not.toBe("ice-2");
    expect(battle.planEnemyAiAction("enemy-wizard-b")?.actionId).not.toBe("ice-2");
  });

  it("recognizes an entirely frozen manual player phase", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3312));
    for (const ally of battle.units.filter(({ side }) => side === 1)) ally.actionDisabled = true;

    expect(battle.playerManualPhaseComplete()).toBe(true);
    expect(battle.allPlayerControllableAlliesFrozen()).toBe(true);
    battle.unit("ally-a")!.actionDisabled = false;
    expect(battle.allPlayerControllableAlliesFrozen()).toBe(false);
  });
});
