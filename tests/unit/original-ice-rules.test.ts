import { describe, expect, it } from "vitest";
import { planIceDisplacement } from "../../src/game/simulation/actions/ice-displacement";
import { prepareSpecialAction } from "../../src/game/simulation/actions/resolve";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { expertSpecialUtility } from "../../src/game/simulation/expert-ai";
import { DeterministicRng } from "../../src/game/simulation/rng";
import {
  DEFAULT_BATTLE_RULE_OPTIONS,
  iceShielded,
  type BattleRuleOptions,
} from "../../src/game/simulation/rule-options";
import type { BattleUnit } from "../../src/game/types";

/**
 * `REMAKE-216`「原版冰雪」：宿主選單打開後，冰雪整套回到原版——範圍內全冰、固定下上左右
 * 外推、冰封單位照常受攻治、破邪不解冰。關著時一切仍是 `REMAKE-013/094/096` 的複刻規則，
 * 那一側由 `actions.test.ts` 與 `expert-ai.test.ts` 的既有用例鎖定。
 */

const ORIGINAL: BattleRuleOptions = { originalIce: true };

const openBattlefield = {
  width: 16,
  height: 16,
  terrainSlotAt: () => 2,
};

function wizard(battle: Stage0Battle, overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    ...battle.unit("1:0")!,
    id: "ice-216-wizard",
    x: 5,
    y: 5,
    classId: "wizard",
    experience: 0,
    acted: false,
    actionDisabled: false,
    ...overrides,
  };
}

function enemy(battle: Stage0Battle, id: string, x: number, y: number): BattleUnit {
  const template = battle.units.find((unit) => unit.side === 2)!;
  return { ...template, id, x, y, actionDisabled: false, statuses: { ...template.statuses } };
}

describe("REMAKE-216 original ice resolution", () => {
  it("pushes in the fixed native order and freezes every unblocked target, shoved out or not", () => {
    const battle = new Stage0Battle(0);
    const caster = wizard(battle);
    // Due west: the native scan tries "down" first, which already has a lower value.
    const west = enemy(battle, "ice-216-west", 3, 5);
    // (5, 8) sits on the value-1 outer ring of the radius-4 2C.
    const outer = enemy(battle, "ice-216-outer", 5, 8);
    const units = [caster, west, outer];

    const remake = planIceDisplacement("ice-2", caster, caster, units, openBattlefield);
    const original = planIceDisplacement("ice-2", caster, caster, units, openBattlefield, undefined, ORIGINAL);

    expect(remake.targets.map(({ unit, positionAfter, freezes }) => ({ id: unit.id, positionAfter, freezes })))
      .toEqual([
        { id: west.id, positionAfter: { x: 2, y: 5 }, freezes: true },
        { id: outer.id, positionAfter: { x: 5, y: 9 }, freezes: false },
      ]);
    expect(original.targets.map(({ unit, positionAfter, freezes }) => ({ id: unit.id, positionAfter, freezes })))
      .toEqual([
        { id: west.id, positionAfter: { x: 3, y: 6 }, freezes: true },
        { id: outer.id, positionAfter: { x: 5, y: 9 }, freezes: true },
      ]);

    const prepared = prepareSpecialAction(
      { actionId: "ice-2", actorId: caster.id },
      caster,
      undefined,
      new DeterministicRng(0x2160, 4),
      { units, battlefield: openBattlefield, statsFor: (unit) => battle.statsFor(unit), rules: ORIGINAL },
      caster,
    );
    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({ unitId: west.id, positionAfter: { x: 3, y: 6 }, actionDisabledAfter: true }),
      expect.objectContaining({ unitId: outer.id, positionAfter: { x: 5, y: 9 }, actionDisabledAfter: true }),
    ]);
    // REMAKE-177's experience fix is a user-approved bug fix kept in both modes.
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(11);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);
  });

  it("still skips already frozen, guarded and immune targets", () => {
    const battle = new Stage0Battle(0);
    const caster = wizard(battle);
    const frozen = { ...enemy(battle, "ice-216-frozen", 5, 6), actionDisabled: true };
    const guarded = enemy(battle, "ice-216-guarded", 5, 4);
    guarded.statuses.magicGuard = 1;
    const plan = planIceDisplacement("ice-2", caster, caster, [caster, frozen, guarded], openBattlefield,
      undefined, ORIGINAL);
    expect(plan.targets.map(({ unit, moved, freezes, blockReason }) => ({ id: unit.id, moved, freezes, blockReason })))
      .toEqual([
        { id: guarded.id, moved: false, freezes: false, blockReason: "magicGuard" },
        { id: frozen.id, moved: false, freezes: false, blockReason: "frozen" },
      ]);
  });

  it("lets attacks, shots, damage techniques and healing reach frozen units", () => {
    for (const actionId of ["archer-shot", "fire-1", "heal-1"] as const) {
      const battle = new Stage0Battle(0);
      battle.setRules(ORIGINAL);
      const actor = battle.unit("1:0")!;
      // Stage-0 sisters carry both 1F and 1H; archers shoot.
      actor.classId = actionId === "archer-shot" ? "archer" : "sister";
      actor.experience = 0;
      const targetSide = actionId === "heal-1" ? 1 : 2;
      const target = battle.units.find((unit) => unit.side === targetSide && unit.id !== actor.id)!;
      const range = battle.actionRange(actor.id, actionId);
      const cell = range.cells().find((position) => !battle.unitAt(position)
        && (actionId !== "archer-shot" || Math.abs(position.x - actor.x) + Math.abs(position.y - actor.y) > 1));
      if (!cell) throw new Error(`${actionId} has an empty cell in range`);
      target.x = cell.x;
      target.y = cell.y;
      target.actionDisabled = true;
      if (actionId === "heal-1") target.life = Math.max(1, target.life - 20);
      const lifeBefore = target.life;

      expect(battle.actionTargets(actor.id, actionId), actionId).toContain(target);
      const prepared = battle.prepareSpecialAction({ actionId, actorId: actor.id, targetId: target.id });
      expect(prepared.result.affectedUnits[0], actionId).toMatchObject({ unitId: target.id, blocked: false });
      battle.commitPreparedAction(prepared);
      if (actionId === "heal-1") expect(target.life).toBeGreaterThan(lifeBefore);
      else expect(target.life).toBeLessThan(lifeBefore);
      // Damage and healing never thaw the target.
      expect(target.actionDisabled).toBe(true);

      // Back on the remake rules the same frozen target is untouchable again.
      battle.setRules(DEFAULT_BATTLE_RULE_OPTIONS);
      actor.acted = false;
      expect(battle.actionTargets(actor.id, actionId), actionId).not.toContain(target);
    }
  });

  it("allows ordinary attacks on a frozen defender, which still cannot counter", () => {
    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find((unit) => unit.side === 2)!;
    defender.x = attacker.x + 1;
    defender.y = attacker.y;
    defender.actionDisabled = true;
    battle.units = [attacker, defender];

    expect(() => battle.attack(attacker.id, defender.id)).toThrow("illegal ordinary attack");
    battle.setRules(ORIGINAL);
    const lifeBefore = defender.life;
    const result = battle.attack(attacker.id, defender.id);
    expect(defender.life).toBeLessThan(lifeBefore);
    expect(result.counterOccurred).toBe(false);
  });

  it("hits frozen units with area damage and recovery, consuming their guard", () => {
    const battle = new Stage0Battle(0);
    const caster = { ...wizard(battle), classId: "magician" as const };
    const frozenEnemy = { ...enemy(battle, "ice-216-lightning", 5, 7), actionDisabled: true };
    frozenEnemy.statuses.magicGuard = 1;
    const second = { ...enemy(battle, "ice-216-lightning-2", 6, 7), actionDisabled: true };
    const lightning = prepareSpecialAction(
      { actionId: "lightning-1", actorId: caster.id, targetId: second.id },
      caster,
      second,
      new DeterministicRng(0x2161, 0),
      {
        units: [caster, frozenEnemy, second],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
        rules: ORIGINAL,
      },
      second,
    );
    const byId = new Map(lightning.result.affectedUnits.map((affected) => [affected.unitId, affected]));
    expect(byId.get(frozenEnemy.id)).toMatchObject({ blocked: true, blockReason: "magicGuard", damage: 0 });
    expect(byId.get(frozenEnemy.id)?.statusesAfter.magicGuard).toBe(0);
    expect(byId.get(second.id)?.damage).toBeGreaterThan(0);

    const nun = { ...wizard(battle), id: "ice-216-nun", classId: "sister" as const };
    const frozenAlly = { ...battle.unit("1:0")!, id: "ice-216-ally", x: 5, y: 6, actionDisabled: true };
    frozenAlly.life = Math.max(1, battle.statsFor(frozenAlly).maxLife - 30);
    const recovery = prepareSpecialAction(
      { actionId: "recovery-1", actorId: nun.id, targetId: frozenAlly.id },
      nun,
      frozenAlly,
      new DeterministicRng(0x2162, 0),
      {
        units: [nun, frozenAlly],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
        rules: ORIGINAL,
      },
      frozenAlly,
    );
    expect(recovery.result.affectedUnits.find(({ unitId }) => unitId === frozenAlly.id))
      .toMatchObject({ blocked: false });
    expect(recovery.result.healing).toBeGreaterThan(0);
  });

  it("keeps dispel's five cleanses but no longer thaws, and the AI stops valuing a freeze", () => {
    const battle = new Stage0Battle(0);
    battle.setRules(ORIGINAL);
    const actor = battle.unit("1:0")!;
    actor.classId = "magic-priest";
    actor.experience = 1160;
    const target = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    target.x = actor.x + 1;
    target.y = actor.y;
    target.actionDisabled = true;
    target.statuses.poison = 3;
    battle.units = [actor, target];

    const prepared = battle.prepareSpecialAction({ actionId: "dispel", actorId: actor.id, targetId: target.id });
    expect(prepared.result.affectedUnits[0]).toMatchObject({
      actionDisabledBefore: true,
      actionDisabledAfter: true,
      statusesAfter: expect.objectContaining({ poison: 0 }),
    });

    const context = (rules: BattleRuleOptions) => ({
      width: battle.stage.width,
      height: battle.stage.height,
      units: battle.units,
      terrainSlotAt: () => 2,
      statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => battle.statsFor(unit),
      effectiveStatsFor: (unit: BattleUnit) => battle.statsFor(unit),
      rules,
    });
    target.statuses.poison = 0;
    const path = [{ x: actor.x, y: actor.y }];
    expect(expertSpecialUtility(context(DEFAULT_BATTLE_RULE_OPTIONS), actor, "dispel", target, path))
      .toMatchObject({ criticalSaves: 1, waste: 0 });
    expect(expertSpecialUtility(context(ORIGINAL), actor, "dispel", target, path))
      .toMatchObject({ criticalSaves: 0, waste: 1 });
  });

  it("scores an outer-ring-only ice cast as control rather than waste", () => {
    const battle = new Stage0Battle(0);
    const caster = wizard(battle, { side: 2, id: "ice-216-ai-wizard" });
    const player = { ...battle.unit("1:0")!, id: "ice-216-ai-target", x: 5, y: 8, actionDisabled: false };
    const units = [caster, player];
    const context = (rules: BattleRuleOptions) => ({
      width: 16,
      height: 16,
      units,
      terrainSlotAt: () => 2,
      statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => battle.statsFor(unit),
      effectiveStatsFor: (unit: BattleUnit) => battle.statsFor(unit),
      rules,
    });
    const path = [{ x: caster.x, y: caster.y }];
    expect(expertSpecialUtility(context(DEFAULT_BATTLE_RULE_OPTIONS), caster, "ice-2", player, path))
      .toMatchObject({ control: 0, waste: 1 });
    const original = expertSpecialUtility(context(ORIGINAL), caster, "ice-2", player, path);
    expect(original.control).toBeGreaterThan(0);
    expect(original.waste).toBe(0);
  });
});

describe("REMAKE-216 rule options on the battle", () => {
  it("defaults to the remake rules and only reads the option for shield checks", () => {
    const battle = new Stage0Battle(0);
    expect(battle.rules).toEqual({ originalIce: false });
    const frozen = { actionDisabled: true };
    expect(iceShielded(frozen, battle.rules)).toBe(true);
    expect(iceShielded(frozen, ORIGINAL)).toBe(false);
    expect(iceShielded({ actionDisabled: false }, battle.rules)).toBe(false);
    expect(iceShielded(frozen, undefined)).toBe(true);
  });

  it("never lets a frozen unit act, whichever ice rules apply", () => {
    const battle = new Stage0Battle(0);
    battle.setRules(ORIGINAL);
    const unit = battle.unit("1:0")!;
    const foe = battle.units.find((candidate) => candidate.side === 2)!;
    foe.x = unit.x + 1;
    foe.y = unit.y;
    unit.actionDisabled = true;
    expect(battle.movementPath(unit.id, { x: unit.x, y: unit.y + 1 })).toEqual([]);
    expect(() => battle.attack(unit.id, foe.id)).toThrow("illegal ordinary attack");
  });
});
