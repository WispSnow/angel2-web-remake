import { describe, expect, it } from "vitest";
import { className } from "../../src/game/content/classes";
import { Stage0Battle } from "../../src/game/simulation/battle";
import {
  archerShootingRange,
  techniqueSelectionRange,
} from "../../src/game/simulation/actions/range-map";
import type { BattleActionId } from "../../src/game/simulation/actions/types";
import type { BattleUnit, Position } from "../../src/game/types";

const openBattlefield = {
  width: 11,
  height: 11,
  terrainSlotAt: (_position: Position) => 1,
};

function promoteForAction(unit: BattleUnit, actionId: BattleActionId): void {
  unit.classId = actionId === "archer-shot" ? "archer" : "sister";
  unit.className = className(unit.classId);
}

function arrangeTarget(
  battle: Stage0Battle,
  actionId: BattleActionId,
  targetSide: BattleUnit["side"],
): { actor: BattleUnit; target: BattleUnit } {
  const actor = battle.unit("1:0")!;
  const target = battle.units.find((unit) => unit.side === targetSide && unit.id !== actor.id)!;
  promoteForAction(actor, actionId);
  battle.units = [actor, target];
  const destination = battle.actionRange(actor.id, actionId).cells()
    .find((position) => position.x !== actor.x || position.y !== actor.y);
  if (!destination) throw new Error(`missing test destination for ${actionId}`);
  target.x = destination.x;
  target.y = destination.y;
  return { actor, target };
}

describe("Stage-0 class actions", () => {
  it("builds native numeric shooting and technique ranges without occupying the origin", () => {
    const actor = { x: 5, y: 5, classId: "archer" as const };
    const shooting = archerShootingRange(actor, openBattlefield);
    expect(shooting.valueAt(actor)).toBe(0);
    expect(shooting.valueAt({ x: 5, y: 4 })).toBe(0);
    expect(shooting.valueAt({ x: 5, y: 3 })).toBeGreaterThan(0);
    expect(shooting.valueAt({ x: 5, y: 1 })).toBeGreaterThan(0);
    expect(shooting.valueAt({ x: 5, y: 0 })).toBe(0);

    const technique = techniqueSelectionRange(actor, openBattlefield, 5);
    expect(technique.valueAt(actor)).toBe(6);
    expect(technique.valueAt({ x: 5, y: 0 })).toBe(1);
  });

  it("prepares shooting deterministically without mutating battle state, then commits atomically", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "archer-shot", 2);
    const rngBefore = battle.rng.state;
    const experienceBefore = actor.experience;
    const lifeBefore = target.life;

    const prepared = battle.prepareSpecialAction({
      actionId: "archer-shot",
      actorId: actor.id,
      targetId: target.id,
    });

    expect(prepared.result.damage).toBeGreaterThanOrEqual(30);
    expect(prepared.result.damage).toBeLessThanOrEqual(49);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(8);
    expect(battle.rng.state).toBe(rngBefore);
    expect(actor.experience).toBe(experienceBefore);
    expect(actor.acted).toBe(false);
    expect(target.life).toBe(lifeBefore);

    expect(battle.commitPreparedAction(prepared)).toEqual(prepared.result);
    expect(battle.rng.state).toBe(prepared.rngAfter);
    expect(actor.experience).toBe(prepared.actorExperienceAfter);
    expect(actor.acted).toBe(true);
    expect(target.life).toBe(prepared.targetLifeAfter);
  });

  it("consumes magic guard instead of damaging a fire target", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-1", 2);
    target.statuses.magicGuard = 3;
    const lifeBefore = target.life;
    const prepared = battle.prepareSpecialAction({
      actionId: "fire-1",
      actorId: actor.id,
      targetId: target.id,
    });

    expect(prepared.result).toMatchObject({ blocked: true, damage: 0 });
    expect(target.statuses.magicGuard).toBe(3);
    battle.commitPreparedAction(prepared);
    expect(target.life).toBe(lifeBefore);
    expect(target.statuses.magicGuard).toBe(0);
  });

  it("heals an ally by 24% of maximum life and rejects stale prepared patches", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "heal-1", 1);
    const maximumLife = battle.statsFor(target).maxLife;
    target.life = Math.max(1, maximumLife - 80);
    const prepared = battle.prepareSpecialAction({
      actionId: "heal-1",
      actorId: actor.id,
      targetId: target.id,
    });

    expect(prepared.result.healing).toBe(Math.min(80, Math.floor(maximumLife * 24 / 100)));
    target.statuses.poison = 1;
    expect(() => battle.commitPreparedAction(prepared)).toThrow("stale prepared special action");
    expect(actor.acted).toBe(false);
  });

  it("rejects the wrong class, target side, and archer dead zone", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    const ally = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    expect(() => battle.prepareSpecialAction({
      actionId: "archer-shot",
      actorId: actor.id,
      targetId: ally.id,
    })).toThrow("illegal special action");

    promoteForAction(actor, "archer-shot");
    battle.units = [actor, ally];
    ally.x = actor.x + 1;
    ally.y = actor.y;
    expect(battle.actionTargets(actor.id, "archer-shot")).toEqual([]);
  });

  it("keeps technique-sealed sisters out of player and AI technique entry points", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-1", 2);
    actor.statuses.techniqueSeal = 1;
    expect(battle.actionRange(actor.id, "fire-1").cells()).toEqual([]);
    expect(battle.actionTargets(actor.id, "fire-1")).toEqual([]);
    expect(() => battle.prepareSpecialAction({
      actionId: "fire-1",
      actorId: actor.id,
      targetId: target.id,
    })).toThrow("illegal special action");
    expect(battle.planAlliedAiAction(actor.id)?.kind).not.toBe("special");
  });

  it("lets allied archer AI shoot from its current best position", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "archer-shot", 2);
    const action = battle.planAlliedAiAction(actor.id);
    expect(action).toMatchObject({
      kind: "special",
      actionId: "archer-shot",
      targetId: target.id,
      path: [{ x: actor.x, y: actor.y }],
    });
  });

  it("makes allied sister AI heal real missing life before selecting fire", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    const ally = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    const enemy = battle.units.find((unit) => unit.side === 2)!;
    promoteForAction(actor, "heal-1");
    battle.units = [actor, ally, enemy];
    actor.life = battle.statsFor(actor).maxLife;
    ally.life = Math.max(1, battle.statsFor(ally).maxLife - 80);
    const destinations = battle.actionRange(actor.id, "heal-1").cells();
    const allyCell = destinations.find((cell) =>
      cell.x !== actor.x || cell.y !== actor.y)!;
    const enemyCell = destinations.find((cell) =>
      cell.x !== allyCell.x || cell.y !== allyCell.y)!;
    ally.x = allyCell.x;
    ally.y = allyCell.y;
    enemy.x = enemyCell.x;
    enemy.y = enemyCell.y;

    expect(battle.planAlliedAiAction(actor.id)).toMatchObject({
      kind: "special",
      actionId: "heal-1",
      targetId: ally.id,
    });

    ally.life = battle.statsFor(ally).maxLife;
    expect(battle.planAlliedAiAction(actor.id)).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: enemy.id,
    });
  });
});
