import { beforeAll, describe, expect, it } from "vitest";
import {
  BATTLE_ACTION_DEFINITIONS,
  STAGE0_REST_PRESENTATION,
} from "../../src/game/content/actions";
import { className } from "../../src/game/content/classes";
import { activateStage1Content } from "../../src/game/content/stage1";
import { Stage0Battle } from "../../src/game/simulation/battle";
import {
  archerShootingRange,
  techniqueSelectionRange,
} from "../../src/game/simulation/actions/range-map";
import { prepareSpecialAction } from "../../src/game/simulation/actions/resolve";
import type { BattleActionId } from "../../src/game/simulation/actions/types";
import { DeterministicRng } from "../../src/game/simulation/rng";
import type { BattleUnit, Position } from "../../src/game/types";

const openBattlefield = {
  width: 11,
  height: 11,
  terrainSlotAt: (_position: Position) => 1,
};

beforeAll(() => activateStage1Content());

function promoteForAction(unit: BattleUnit, actionId: BattleActionId): void {
  unit.classId = actionId === "archer-shot"
    ? "archer"
    : actionId === "lightning-1" || actionId === "ice-1"
      ? "magician"
      : actionId === "recovery-1"
        ? "monk"
      : actionId === "dispel"
        ? "magic-priest"
      : "sister";
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
  it("generates the individual-rest MAGIC/0 finish without a healing sound", () => {
    expect(STAGE0_REST_PRESENTATION).toEqual({
      mode: "heal-common-finish",
      resource: "MAGIC/0",
      frameCount: 5,
      waitPerFrameNativeTicks: 15,
      cleanupFrame: null,
      cleanupWaitNativeTicks: 15,
      audioRequests: [],
    });
  });

  it("marks only native post-graphics point-drain actions with that presentation contract", () => {
    expect(BATTLE_ACTION_DEFINITIONS["archer-shot"].damagePresentation).toEqual({
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    });
    expect(BATTLE_ACTION_DEFINITIONS["fire-1"].damagePresentation).toEqual({
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    });
    expect("damagePresentation" in BATTLE_ACTION_DEFINITIONS["lightning-1"]).toBe(false);
  });

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

  it("excludes frozen units from shooting, damage, and healing targets", () => {
    for (const actionId of ["archer-shot", "fire-1", "lightning-1", "heal-1"] as const) {
      const battle = new Stage0Battle(0);
      const { actor, target } = arrangeTarget(
        battle,
        actionId,
        actionId === "heal-1" ? 1 : 2,
      );
      target.actionDisabled = true;
      target.statuses.magicGuard = 2;
      const lifeBefore = target.life;
      const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

      expect(battle.actionTargets(actor.id, actionId)).not.toContain(target);
      expect(() => battle.prepareSpecialAction({
        actionId,
        actorId: actor.id,
        targetId: target.id,
      })).toThrow("illegal special action");
      expect(target.life).toBe(lifeBefore);
      expect(target.statuses.magicGuard).toBe(2);
      expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
      expect(actor.acted).toBe(false);
    }
  });

  it("lets dispel clear frozen and original negative statuses while preserving positive statuses", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "dispel", 1);
    actor.experience = 1160;
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 2,
      defenseUp: 1,
      magicGuard: 1,
      confusion: 3,
      attackDown: 3,
      defenseDown: 3,
      poison: 3,
      techniqueSeal: 3,
    };
    battle.units = [actor, target];

    expect(battle.actionTargets(actor.id, "dispel")).toContain(target);
    const prepared = battle.prepareSpecialAction({
      actionId: "dispel",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result.affectedUnits[0]).toMatchObject({
      unitId: target.id,
      actionDisabledBefore: true,
      actionDisabledAfter: false,
      statusesAfter: {
        attackUp: 2,
        defenseUp: 1,
        magicGuard: 1,
        confusion: 0,
        attackDown: 0,
        defenseDown: 0,
        poison: 0,
        techniqueSeal: 0,
      },
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(17);

    battle.commitPreparedAction(prepared);
    expect(target.actionDisabled).toBe(false);
    expect(target.statuses.poison).toBe(0);
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

  it("resolves lightning against every enemy in the effect diamond and consumes magic guard", () => {
    const battle = new Stage0Battle(0);
    const actor = { ...battle.unit("1:0")!, x: 5, y: 5, classId: "magician" as const };
    const centerTarget = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "lightning-center",
      x: 5,
      y: 2,
      life: 200,
    };
    const guardedTarget = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "lightning-guarded",
      x: 6,
      y: 2,
      life: 200,
      statuses: {
        ...battle.units.find((unit) => unit.side === 2)!.statuses,
        magicGuard: 1,
      },
    };
    const frozenTarget = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "lightning-frozen",
      x: 4,
      y: 2,
      life: 200,
      actionDisabled: true,
      statuses: {
        ...battle.units.find((unit) => unit.side === 2)!.statuses,
        magicGuard: 1,
      },
    };
    const outsideTarget = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "lightning-outside",
      x: 9,
      y: 2,
      life: 200,
    };
    const rng = new DeterministicRng(0x1234);
    const prepared = prepareSpecialAction(
      { actionId: "lightning-1", actorId: actor.id, targetId: centerTarget.id },
      actor,
      centerTarget,
      rng,
      {
        units: [actor, centerTarget, guardedTarget, frozenTarget, outsideTarget],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      centerTarget,
    );

    expect(prepared.result.affectedUnits).toHaveLength(3);
    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: centerTarget.id, damage: 50, lifeAfter: 150 }),
      expect.objectContaining({
        unitId: guardedTarget.id,
        damage: 0,
        blocked: true,
        blockReason: "magicGuard",
        statusesAfter: expect.objectContaining({ magicGuard: 0 }),
      }),
      expect.objectContaining({
        unitId: frozenTarget.id,
        damage: 0,
        blocked: true,
        blockReason: "frozen",
        lifeAfter: 200,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outsideTarget.id)).toBe(false);
    expect(prepared.rngAfter).toBe(prepared.rngBefore);
  });

  it("heals every unfrozen ally in the recovery diamond and derives experience from actual healing", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "recovery-actor",
      x: 5,
      y: 5,
      classId: "monk" as const,
    };
    const baseline = battle.units.find((unit) => unit.side === 1 && unit.id !== "1:0")!;
    const center = { ...baseline, id: "recovery-center", x: 5, y: 3, life: 1 };
    const middle = { ...baseline, id: "recovery-middle", x: 5, y: 4, life: 1 };
    const frozen = {
      ...baseline,
      id: "recovery-frozen",
      x: 4,
      y: 3,
      life: 1,
      actionDisabled: true,
    };
    const outside = { ...baseline, id: "recovery-outside", x: 8, y: 3, life: 1 };
    const rng = new DeterministicRng(0x2468);
    const prepared = prepareSpecialAction(
      { actionId: "recovery-1", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [actor, center, middle, frozen, outside],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, healing: 60 }),
      expect.objectContaining({ unitId: middle.id, healing: 45 }),
      expect.objectContaining({ unitId: frozen.id, healing: 0, blocked: true, blockReason: "frozen" }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outside.id)).toBe(false);
    expect(prepared.result.healing).toBeGreaterThanOrEqual(105);
    const quotient = Math.floor(prepared.result.healing / 50);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(8 + Math.min(quotient, 8));
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(9 + Math.min(quotient, 8));
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);
  });

  it("awards no recovery experience and consumes no PRNG when actual healing stays below fifty", () => {
    const battle = new Stage0Battle(0);
    const actor = { ...battle.unit("1:0")!, x: 5, y: 5, classId: "monk" as const };
    const maximumLife = battle.statsFor(actor).maxLife;
    const center = { ...actor, id: "recovery-small", x: 5, y: 4, life: maximumLife - 10 };
    const rng = new DeterministicRng(0x1357, 4);
    const prepared = prepareSpecialAction(
      { actionId: "recovery-1", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [{ ...actor, life: maximumLife }, center],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );
    expect(prepared.result).toMatchObject({ healing: 10, experienceGained: 0 });
    expect(prepared.rngAfter).toBe(prepared.rngBefore);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
  });

  it("pushes ice targets down first, resolves occupancy in row-major order, and rolls experience only when something moved", () => {
    const battle = new Stage0Battle(0);
    const actor = { ...battle.unit("1:0")!, id: "ice-actor", x: 5, y: 4, classId: "magician" as const };
    const first = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "ice-first",
      x: 4,
      y: 4,
    };
    const second = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "ice-second",
      x: 5,
      y: 5,
    };
    const rng = new DeterministicRng(0x5678);
    const prepared = prepareSpecialAction(
      { actionId: "ice-1", actorId: actor.id },
      actor,
      undefined,
      rng,
      {
        units: [actor, first, second],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );

    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: first.id,
        positionAfter: { x: 4, y: 5 },
        moved: true,
        actionDisabledBefore: false,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({
        unitId: second.id,
        positionAfter: { x: 5, y: 6 },
        moved: true,
        actionDisabledBefore: false,
        actionDisabledAfter: true,
      }),
    ]);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(8);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(9);
    expect(prepared.rngAfter).not.toBe(prepared.rngBefore);

    const outerRng = new DeterministicRng(0x5678);
    const outerTarget = { ...first, id: "ice-outer", x: 5, y: 6 };
    const outer = prepareSpecialAction(
      { actionId: "ice-1", actorId: actor.id },
      actor,
      undefined,
      outerRng,
      {
        units: [actor, outerTarget],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(outer.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: outerTarget.id,
        positionAfter: { x: 5, y: 6 },
        moved: false,
        blocked: false,
        actionDisabledAfter: true,
      }),
    ]);
    expect(outer.result.experienceGained).toBe(0);
    expect(outer.rngAfter).toBe(outer.rngBefore);

    const blockedRng = new DeterministicRng(0x5678);
    const guarded = {
      ...first,
      statuses: { ...first.statuses, magicGuard: 1 },
    };
    const blocked = prepareSpecialAction(
      { actionId: "ice-1", actorId: actor.id },
      actor,
      undefined,
      blockedRng,
      {
        units: [actor, guarded],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(blocked.result.affectedUnits[0]).toMatchObject({
      blocked: true,
      moved: false,
      actionDisabledAfter: false,
      statusesAfter: { magicGuard: 0 },
    });
    expect(blocked.result.experienceGained).toBe(0);
    expect(blocked.rngAfter).toBe(blocked.rngBefore);

    const pinned = { ...first, id: "ice-pinned", x: 5, y: 5 };
    const occupiedRetreats = [
      { ...actor, id: "ice-ally-blocker-down", x: 5, y: 6 },
      { ...actor, id: "ice-ally-blocker-left", x: 4, y: 5 },
      { ...actor, id: "ice-ally-blocker-right", x: 6, y: 5 },
    ];
    const noMove = prepareSpecialAction(
      { actionId: "ice-1", actorId: actor.id },
      { ...actor, x: 5, y: 4 },
      undefined,
      new DeterministicRng(0x5678),
      {
        units: [{ ...actor, x: 5, y: 4 }, pinned, ...occupiedRetreats],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      { x: 5, y: 4 },
    );
    expect(noMove.result.affectedUnits).toContainEqual(expect.objectContaining({
      unitId: pinned.id,
      moved: false,
      blocked: false,
      actionDisabledAfter: true,
    }));
  });

  it("does not stack, refresh, move, or consume guard when ice hits an already frozen target", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "ice-actor",
      x: 5,
      y: 5,
      classId: "magician" as const,
    };
    const target = {
      ...battle.units.find((unit) => unit.side === 2)!,
      id: "already-frozen",
      x: 5,
      y: 6,
      actionDisabled: true,
      statuses: {
        ...battle.units.find((unit) => unit.side === 2)!.statuses,
        magicGuard: 1,
      },
    };
    const prepared = prepareSpecialAction(
      { actionId: "ice-1", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x5678),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );

    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: target.id,
        positionAfter: { x: 5, y: 6 },
        actionDisabledBefore: true,
        actionDisabledAfter: true,
        blocked: true,
        blockReason: "frozen",
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
    ]);
    expect(prepared.result.experienceGained).toBe(0);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
  });

  it("locks ice to the actor cell and rejects any caller-supplied target center", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    promoteForAction(actor, "ice-1");
    actor.x = 5;
    actor.y = 5;
    actor.acted = false;
    const enemy = battle.units.find((unit) => unit.side === 2)!;
    enemy.x = 5;
    enemy.y = 6;
    battle.units = [actor, enemy];

    expect(battle.actionTargetCells(actor.id, "ice-1")).toEqual([{ x: 5, y: 5 }]);
    expect(() => battle.prepareSpecialAction({
      actionId: "ice-1",
      actorId: actor.id,
      target: { x: 5, y: 6 },
    })).toThrow("illegal special action");

    const prepared = battle.prepareSpecialAction({ actionId: "ice-1", actorId: actor.id });
    expect(prepared.result.target).toEqual({ x: 5, y: 5 });
    expect(prepared.result.affectedUnits).toContainEqual(expect.objectContaining({
      unitId: enemy.id,
      actionDisabledAfter: true,
    }));
    battle.commitPreparedAction(prepared);
    expect(enemy.actionDisabled).toBe(true);
    expect(battle.enemyActionOrder()).not.toContain(enemy.id);
  });
});
