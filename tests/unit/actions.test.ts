import { beforeAll, describe, expect, it } from "vitest";
import {
  BATTLE_ACTION_DEFINITIONS,
  STAGE0_REST_PRESENTATION,
} from "../../src/game/content/actions";
import { classDefinition, className, killRewardFor, terrainDefensePercentFor } from "../../src/game/content/classes";
import {
  activateStage1Content,
  STAGE1_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage1";
import { STAGE0_OBSTACLE_TERRAIN_SLOT } from "../../src/game/content/stage0";
import { STAGE2_OBSTACLE_TERRAIN_SLOT } from "../../src/game/content/stage2";
import { STAGE3_OBSTACLE_TERRAIN_SLOT } from "../../src/game/content/stage3";
import { STAGE4_OBSTACLE_TERRAIN_SLOT } from "../../src/game/content/stage4";
import { Stage0Battle } from "../../src/game/simulation/battle";
import {
  archerShootingRange,
  shootingLinePaths,
  techniqueSelectionRange,
} from "../../src/game/simulation/actions/range-map";
import { prepareSpecialAction } from "../../src/game/simulation/actions/resolve";
import {
  prepareIronPlateConstruction,
  prepareObstacleConstruction,
} from "../../src/game/simulation/actions/construction";
import type {
  BattleActionId,
  PrayerOutcomeKind,
} from "../../src/game/simulation/actions/types";
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
    : actionId === "fire-2" || actionId === "fire-3" || actionId === "fire-4"
      ? "evil-mage"
    : actionId === "heal-2" || actionId === "heal-3" || actionId === "attack-up"
      || actionId === "magic-guard"
      ? "magic-guide"
    : actionId === "defense-up" || actionId === "prayer"
      ? "prayer-guide"
    : actionId === "poison" || actionId === "confusion" || actionId === "attack-down"
      || actionId === "spell-seal"
      ? "curse-master"
    : actionId === "defense-down"
      ? "magic-priest"
    : actionId === "lightning-1" || actionId === "ice-1"
      ? "magician"
      : actionId === "lightning-2" || actionId === "lightning-3" || actionId === "lightning-4"
        ? "magic-master"
      : actionId === "ice-2" || actionId === "ice-3" || actionId === "ice-4"
        ? "wizard"
      : actionId === "recovery-1"
        ? "monk"
      : actionId === "recovery-2" || actionId === "recovery-3"
        ? "prayer-guide"
      : actionId === "stomp-1" || actionId === "stomp-2" || actionId === "stomp-3"
        ? "great-dragon-knight"
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
  if (actionId === "stomp-1") actor.experience = 0;
  if (actionId === "stomp-2") {
    actor.experience = classDefinition("great-dragon-knight").dataRows[1].experienceThreshold;
  }
  if (actionId === "stomp-3") {
    actor.experience = classDefinition("great-dragon-knight").dataRows[2].experienceThreshold;
  }
  if (actionId === "fire-3") {
    actor.experience = classDefinition("evil-mage").dataRows[1].experienceThreshold;
  }
  if (actionId === "fire-4") {
    actor.experience = classDefinition("evil-mage").dataRows[2].experienceThreshold;
  }
  if (actionId === "lightning-3") {
    actor.experience = classDefinition("magic-master").dataRows[1].experienceThreshold;
  }
  if (actionId === "lightning-4") {
    actor.experience = classDefinition("magic-master").dataRows[2].experienceThreshold;
  }
  if (actionId === "ice-4") {
    actor.experience = classDefinition("wizard").dataRows[2].experienceThreshold;
  }
  if (actionId === "dispel") {
    actor.experience = classDefinition("magic-priest").dataRows[2].experienceThreshold;
  }
  if (actionId === "heal-2") {
    actor.experience = classDefinition("magic-guide").dataRows[1].experienceThreshold;
  }
  if (actionId === "heal-3") {
    actor.experience = classDefinition("magic-guide").dataRows[2].experienceThreshold;
  }
  if (actionId === "magic-guard") {
    actor.experience = classDefinition("magic-guide").dataRows[2].experienceThreshold;
  }
  if (actionId === "poison") {
    actor.experience = classDefinition("curse-master").dataRows[1].experienceThreshold;
  }
  if (actionId === "spell-seal") {
    actor.experience = classDefinition("curse-master").dataRows[2].experienceThreshold;
  }
  if (actionId === "recovery-2") {
    actor.experience = classDefinition("prayer-guide").dataRows[1].experienceThreshold;
  }
  if (actionId === "recovery-3") {
    actor.experience = classDefinition("prayer-guide").dataRows[2].experienceThreshold;
  }
  if (actionId === "prayer") {
    actor.experience = classDefinition("prayer-guide").dataRows[2].experienceThreshold;
  }
  battle.units = [actor, target];
  const destination = battle.actionRange(actor.id, actionId).cells()
    .find((position) => position.x !== actor.x || position.y !== actor.y);
  if (!destination) throw new Error(`missing test destination for ${actionId}`);
  target.x = destination.x;
  target.y = destination.y;
  return { actor, target };
}

interface ExpectedPrayerOutcome {
  readonly candidateIndex: number;
  readonly outcome: PrayerOutcomeKind;
  readonly rolledAmount?: number;
}

function expectedPrayerSequence(seed: number, candidateCount: number): {
  readonly outcomes: readonly ExpectedPrayerOutcome[];
  readonly stateAfter: number;
  readonly callsAfter: number;
} {
  const rng = new DeterministicRng(seed);
  const outcomes: ExpectedPrayerOutcome[] = [];
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    if ((rng.nextUint() & 1) === 0) continue;
    const outcomeRoll = rng.between(0, 3);
    const outcome: PrayerOutcomeKind = outcomeRoll === 0
      ? "healing"
      : outcomeRoll === 1 ? "experience" : outcomeRoll === 2 ? "attackUp" : "defenseUp";
    const rolledAmount = outcome === "healing" || outcome === "experience"
      ? rng.between(5, 14)
      : undefined;
    outcomes.push({ candidateIndex, outcome, rolledAmount });
  }
  return { outcomes, stateAfter: rng.state, callsAfter: rng.calls };
}

function findPrayerSeed(
  candidateCount: number,
  predicate: (outcomes: readonly ExpectedPrayerOutcome[]) => boolean,
): number {
  for (let seed = 1; seed < 100_000; seed += 1) {
    if (predicate(expectedPrayerSequence(seed, candidateCount).outcomes)) return seed;
  }
  throw new Error("missing deterministic prayer seed");
}

describe("Stage-0 class actions", () => {
  it.each([
    ["crossbow-shot", "crossbow"],
    ["magic-archer-shot", "magic-archer"],
  ] as const)("uses one stable-remake %s damage definition for both sides", (actionId, classId) => {
    const damageFor = (side: BattleUnit["side"], seed: number): number => {
      const battle = new Stage0Battle(0, new DeterministicRng(seed));
      const actor = battle.units.find((unit) => unit.side === side)!;
      const target = battle.units.find((unit) => unit.side !== side)!;
      battle.units = [actor, target];
      actor.classId = classId;
      actor.className = className(classId);
      actor.x = 20;
      actor.y = 20;
      actor.acted = false;
      target.x = 23;
      target.y = 20;
      target.life = 500;
      return battle.prepareSpecialAction({
        actionId,
        actorId: actor.id,
        targetId: target.id,
        target: { x: target.x, y: target.y },
      }).result.damage;
    };

    for (let seed = 1; seed <= 32; seed += 1) {
      expect(damageFor(2, seed), `seed ${seed}`).toBe(damageFor(1, seed));
    }
  });

  it("binds the five released stage obstacle source tokens to their evidenced logical slots", () => {
    expect([
      STAGE0_OBSTACLE_TERRAIN_SLOT,
      STAGE1_OBSTACLE_TERRAIN_SLOT,
      STAGE2_OBSTACLE_TERRAIN_SLOT,
      STAGE3_OBSTACLE_TERRAIN_SLOT,
      STAGE4_OBSTACLE_TERRAIN_SLOT,
    ]).toEqual([13, 3, 10, 5, 13]);
  });

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
    expect(BATTLE_ACTION_DEFINITIONS["fire-2"].damagePresentation).toEqual({
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    });
    expect(BATTLE_ACTION_DEFINITIONS["fire-3"].damagePresentation).toEqual({
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    });
    expect(BATTLE_ACTION_DEFINITIONS["fire-4"].damagePresentation).toEqual({
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    });
    expect("damagePresentation" in BATTLE_ACTION_DEFINITIONS["lightning-1"]).toBe(false);
    expect("damagePresentation" in BATTLE_ACTION_DEFINITIONS["lightning-2"]).toBe(false);
    expect("damagePresentation" in BATTLE_ACTION_DEFINITIONS["lightning-3"]).toBe(false);
    expect("damagePresentation" in BATTLE_ACTION_DEFINITIONS["lightning-4"]).toBe(false);
  });

  it("uses geometric construction edges and skips logical terrain slot zero", () => {
    const battle = new Stage0Battle(0);
    const source = battle.unit("1:0")!;
    const actor = {
      ...source,
      id: "engineer",
      classId: "engineer" as const,
      className: className("engineer"),
      x: 1,
      y: 0,
      acted: false,
      actionDisabled: false,
      statuses: { ...source.statuses },
    };
    const prepared = prepareIronPlateConstruction(actor, { x: 0, y: 0 }, {
      battlefield: {
        width: 5,
        height: 5,
        terrainSlotAt: ({ x, y }) => x === 0 && y === 1 ? 0 : 1,
      },
      units: [actor],
      terrainKindAt: () => undefined,
      dynamicTerrainSlot: (kind) => kind === "iron-plate" ? 3 : undefined,
    });
    expect(prepared.path).toEqual([{ x: 1, y: 0 }, { x: 0, y: 0 }]);
    expect(prepared.terrainMutations).toEqual([
      expect.objectContaining({ x: 1, y: 0, kind: "iron-plate", slotAfter: 3 }),
    ]);
  });

  it("uses the independent obstacle kind while preserving the shared reachable player route", () => {
    const battle = new Stage0Battle(0);
    const source = battle.unit("1:0")!;
    const actor = {
      ...source,
      id: "engineer",
      classId: "engineer" as const,
      className: className("engineer"),
      x: 1,
      y: 1,
      acted: false,
      actionDisabled: false,
      statuses: { ...source.statuses },
    };
    const prepared = prepareObstacleConstruction(actor, { x: 2, y: 1 }, {
      battlefield: { width: 5, height: 5, terrainSlotAt: () => 1 },
      units: [actor],
      terrainKindAt: ({ x, y }) => x === 1 && y === 1 ? "iron-plate" : undefined,
      dynamicTerrainSlot: (kind) => kind === "obstacle" ? 3 : undefined,
    });
    expect(prepared).toMatchObject({
      actionId: "obstacle",
      path: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
    });
    expect(prepared.terrainMutations).toEqual([
      expect.objectContaining({ x: 2, y: 2, kind: "obstacle", slotAfter: 3, changed: true }),
      expect.objectContaining({ x: 2, y: 0, kind: "obstacle", slotAfter: 3, changed: true }),
      expect.objectContaining({ x: 3, y: 1, kind: "obstacle", slotAfter: 3, changed: true }),
      expect.objectContaining({
        x: 1,
        y: 1,
        kind: "obstacle",
        kindBefore: "iron-plate",
        slotAfter: 3,
        changed: true,
      }),
    ]);
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

  it("enumerates every shortest magic-arrow line in stable native direction order", () => {
    const paths = shootingLinePaths(
      { x: 0, y: 0, classId: "magic-archer" },
      { x: 2, y: 2 },
      { width: 5, height: 5, terrainSlotAt: () => 1 },
      BATTLE_ACTION_DEFINITIONS["magic-archer-shot"].range.nativeSeed,
    );

    expect(paths).toHaveLength(6);
    expect(new Set(paths.map((path) => path.map(({ x, y }) => `${x},${y}`).join(";"))).size)
      .toBe(6);
    for (const path of paths) {
      expect(path).toHaveLength(5);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path.at(-1)).toEqual({ x: 2, y: 2 });
    }
  });

  it("commits the player-selected magic-arrow line without consuming path randomness", () => {
    const battle = new Stage0Battle(0, new DeterministicRng(0x3501));
    const actor = battle.unit("1:0")!;
    const enemies = battle.units.filter((unit) => unit.side === 2).slice(0, 3);
    const [target, rightBranch, downBranch] = enemies;
    if (!target || !rightBranch || !downBranch) throw new Error("missing magic-arrow fixtures");
    actor.classId = "magic-archer";
    actor.className = className(actor.classId);
    actor.x = 20;
    actor.y = 20;
    actor.acted = false;
    target.x = 22;
    target.y = 22;
    rightBranch.x = 21;
    rightBranch.y = 20;
    downBranch.x = 20;
    downBranch.y = 21;
    battle.units = [actor, target, rightBranch, downBranch];

    const routes = battle.magicArcherLineOptions(actor.id, target.id);
    expect(routes.length).toBeGreaterThan(1);
    const selected = routes.find((route) => route.affectedUnitIds.includes(rightBranch.id)
      && !route.affectedUnitIds.includes(downBranch.id));
    if (!selected) throw new Error("missing right-branch route");

    const prepared = battle.prepareSpecialAction({
      actionId: "magic-archer-shot",
      actorId: actor.id,
      targetId: target.id,
      linePath: selected.path,
    });
    expect(prepared.result.effectCells.map(({ position }) => position)).toEqual(selected.path);
    expect(prepared.result.affectedUnits.map(({ unitId }) => unitId)).toEqual([
      rightBranch.id,
      target.id,
    ]);
    expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(2);
    expect(() => battle.prepareSpecialAction({
      actionId: "magic-archer-shot",
      actorId: actor.id,
      targetId: target.id,
      linePath: [{ x: actor.x, y: actor.y }, { x: target.x, y: target.y }],
    })).toThrow("illegal magic archer line path");
    expect(battle.rng.calls).toBe(0);
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

  it("blocks stable-remake fire damage with magic guard and consumes the guard", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-1", 2);
    target.statuses.magicGuard = 3;
    const lifeBefore = target.life;
    const prepared = battle.prepareSpecialAction({
      actionId: "fire-1",
      actorId: actor.id,
      targetId: target.id,
    });

    expect(prepared.result).toMatchObject({
      blocked: true,
      blockReason: "magicGuard",
      damage: 0,
    });
    expect([8, 9]).toContain(prepared.result.experienceGained);
    expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    expect(target.statuses.magicGuard).toBe(3);
    battle.commitPreparedAction(prepared);
    expect(target.life).toBe(lifeBefore);
    expect(target.statuses.magicGuard).toBe(0);
  });

  it("prepares 2F with the native 26-percent cap and one experience roll", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-2", 2);
    target.life = 200;
    const rng = new DeterministicRng(0x2f);
    const prepared = prepareSpecialAction(
      { actionId: "fire-2", actorId: actor.id, targetId: target.id },
      actor,
      target,
      rng,
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 599, movement: 0, level: 1 }),
      },
      target,
    );

    expect(prepared.result).toMatchObject({
      actionId: "fire-2",
      damage: 155,
      blocked: false,
    });
    expect([10, 11]).toContain(prepared.result.experienceGained);
    expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    expect(target.life).toBe(200);
  });

  it("caps 2F at 156 when 26 percent reaches the native ceiling", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-2", 2);
    target.life = 200;
    const prepared = prepareSpecialAction(
      { actionId: "fire-2", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x156),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 601, movement: 0, level: 1 }),
      },
      target,
    );
    expect(prepared.result.damage).toBe(156);
  });

  it("prepares 3F at 32 percent with cap 192, one 0..2 experience roll, and guard blocking", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-3", 2);
    target.life = 250;
    const rng = new DeterministicRng(0x3f);
    const unguarded = prepareSpecialAction(
      { actionId: "fire-3", actorId: actor.id, targetId: target.id },
      actor,
      target,
      rng,
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 599, movement: 0, level: 1 }),
      },
      target,
    );
    expect(unguarded.result).toMatchObject({
      actionId: "fire-3",
      damage: 191,
      blocked: false,
    });
    expect([12, 13, 14]).toContain(unguarded.result.experienceGained);
    expect(unguarded.rngCallsAfter - unguarded.rngCallsBefore).toBe(1);

    target.statuses.magicGuard = 1;
    const guarded = prepareSpecialAction(
      { actionId: "fire-3", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x3f),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 601, movement: 0, level: 1 }),
      },
      target,
    );
    expect(guarded.result).toMatchObject({
      actionId: "fire-3",
      damage: 0,
      blocked: true,
      blockReason: "magicGuard",
    });
    expect([12, 13, 14]).toContain(guarded.result.experienceGained);
    expect(guarded.rngCallsAfter - guarded.rngCallsBefore).toBe(1);
    expect(guarded.targetStatusesAfter.magicGuard).toBe(0);

    target.statuses.magicGuard = 0;
    const capped = prepareSpecialAction(
      { actionId: "fire-3", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x192),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 601, movement: 0, level: 1 }),
      },
      target,
    );
    expect(capped.result.damage).toBe(192);
  });

  it("prepares 4F at 44 percent with cap 270, one 0..2 experience roll, and guard blocking", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "fire-4", 2);
    target.life = 400;
    const context = (maxLife: number) => ({
      units: [actor, target],
      battlefield: openBattlefield,
      statsFor: () => ({ attack: 0, defense: 0, maxLife, movement: 0, level: 1 }),
    });
    const belowCap = prepareSpecialAction(
      { actionId: "fire-4", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x4f),
      context(613),
      target,
    );
    expect(belowCap.result).toMatchObject({
      actionId: "fire-4",
      damage: 269,
      blocked: false,
    });
    expect([15, 16, 17]).toContain(belowCap.result.experienceGained);
    expect(belowCap.rngCallsAfter - belowCap.rngCallsBefore).toBe(1);

    const capped = prepareSpecialAction(
      { actionId: "fire-4", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x270),
      context(615),
      target,
    );
    expect(capped.result.damage).toBe(270);

    target.statuses.magicGuard = 1;
    const guarded = prepareSpecialAction(
      { actionId: "fire-4", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x4f),
      context(615),
      target,
    );
    expect(guarded.result).toMatchObject({
      actionId: "fire-4",
      damage: 0,
      blocked: true,
      blockReason: "magicGuard",
    });
    expect([15, 16, 17]).toContain(guarded.result.experienceGained);
    expect(guarded.rngCallsAfter - guarded.rngCallsBefore).toBe(1);
    expect(guarded.targetStatusesAfter.magicGuard).toBe(0);
  });

  it("excludes frozen units from shooting, damage, and healing targets", () => {
    for (const actionId of ["archer-shot", "fire-1", "fire-2", "fire-3", "fire-4", "lightning-1", "lightning-2", "heal-1", "heal-2", "heal-3"] as const) {
      const battle = new Stage0Battle(0);
      const { actor, target } = arrangeTarget(
        battle,
        actionId,
        actionId === "heal-1" || actionId === "heal-2" || actionId === "heal-3" ? 1 : 2,
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

  it("applies AA to self, full-life, refreshed, or frozen allies without disturbing other state", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "attack-up", 1);
    target.life = battle.statsFor(target).maxLife;
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 2,
      defenseUp: 1,
      magicGuard: 1,
      confusion: 3,
      attackDown: 3,
      defenseDown: 2,
      poison: 1,
      techniqueSeal: 2,
    };
    const before = {
      life: target.life,
      experience: actor.experience,
      rngState: battle.rng.state,
      rngCalls: battle.rng.calls,
    };

    expect(battle.actionTargets(actor.id, "attack-up")).toEqual(expect.arrayContaining([actor, target]));
    const prepared = battle.prepareSpecialAction({
      actionId: "attack-up",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "attack-up",
      damage: 0,
      healing: 0,
      blocked: false,
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(13);
    expect(prepared.rngCallsAfter).toBe(before.rngCalls + 1);
    expect(prepared.result.affectedUnits[0]).toMatchObject({
      unitId: target.id,
      lifeAfter: before.life,
      actionDisabledAfter: true,
      statusesAfter: {
        attackUp: 3,
        defenseUp: 1,
        magicGuard: 1,
        confusion: 3,
        attackDown: 3,
        defenseDown: 2,
        poison: 1,
        techniqueSeal: 2,
      },
    });
    expect(target.statuses.attackUp).toBe(2);
    expect(actor.experience).toBe(before.experience);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual({
      state: before.rngState,
      calls: before.rngCalls,
    });

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: before.life, actionDisabled: true });
    expect(target.statuses).toEqual(prepared.targetStatusesAfter);
    expect(actor.experience).toBe(before.experience + prepared.result.experienceGained);
  });

  it("uses attack-up for ordinary attack and counter values and ticks it once per complete round", () => {
    const makeBattle = (attackerUp: boolean, defenderUp: boolean) => {
      const battle = new Stage0Battle(0);
      const attacker = battle.unit("1:0")!;
      const defender = battle.units.find(({ side }) => side === 2)!;
      battle.units = [attacker, defender];
      attacker.x = 20;
      attacker.y = 20;
      defender.x = 21;
      defender.y = 20;
      attacker.acted = false;
      attacker.statuses.attackUp = attackerUp ? 3 : 0;
      defender.statuses.attackUp = defenderUp ? 3 : 0;
      return { battle, attacker, defender };
    };
    const plain = makeBattle(false, false);
    const raised = makeBattle(true, true);
    expect(raised.battle.effectiveStatsFor(raised.attacker).attack)
      .toBe(raised.battle.statsFor(raised.attacker).attack + 20);
    expect(raised.battle.attack(raised.attacker.id, raised.defender.id).damage)
      .toBe(plain.battle.attack(plain.attacker.id, plain.defender.id).damage + 20);

    const counterPlain = makeBattle(false, false);
    const counterRaised = makeBattle(false, true);
    expect(counterRaised.battle.effectiveStatsFor(counterRaised.defender).attack)
      .toBe(counterRaised.battle.statsFor(counterRaised.defender).attack + 20);
    const plainCounter = counterPlain.battle.attack(counterPlain.attacker.id, counterPlain.defender.id);
    const raisedCounter = counterRaised.battle.attack(counterRaised.attacker.id, counterRaised.defender.id);
    expect(raisedCounter.counterDamage).toBeGreaterThan(plainCounter.counterDamage);

    const countdown = makeBattle(true, false);
    countdown.attacker.statuses.attackDown = 3;
    expect(countdown.battle.effectiveStatsFor(countdown.attacker).attack)
      .toBe(countdown.battle.statsFor(countdown.attacker).attack);
    countdown.battle.startNextRound();
    expect(countdown.attacker.statuses.attackUp).toBe(2);
    countdown.battle.startNextRound();
    expect(countdown.attacker.statuses.attackUp).toBe(1);
    countdown.battle.startNextRound();
    expect(countdown.attacker.statuses.attackUp).toBe(0);
  });

  it("applies AD to self, full-life, refreshed, or frozen allies without disturbing other state", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "defense-up", 1);
    target.life = battle.statsFor(target).maxLife;
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 2,
      defenseUp: 1,
      magicGuard: 1,
      confusion: 3,
      attackDown: 3,
      defenseDown: 2,
      poison: 1,
      techniqueSeal: 2,
    };
    const before = {
      life: target.life,
      experience: actor.experience,
      rngState: battle.rng.state,
      rngCalls: battle.rng.calls,
    };

    expect(battle.actionTargets(actor.id, "defense-up"))
      .toEqual(expect.arrayContaining([actor, target]));
    const prepared = battle.prepareSpecialAction({
      actionId: "defense-up",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "defense-up",
      damage: 0,
      healing: 0,
      blocked: false,
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(13);
    expect(prepared.rngCallsAfter).toBe(before.rngCalls + 1);
    expect(prepared.result.affectedUnits[0]).toMatchObject({
      unitId: target.id,
      lifeAfter: before.life,
      actionDisabledAfter: true,
      statusesAfter: {
        attackUp: 2,
        defenseUp: 3,
        magicGuard: 1,
        confusion: 3,
        attackDown: 3,
        defenseDown: 2,
        poison: 1,
        techniqueSeal: 2,
      },
    });
    expect(target.statuses.defenseUp).toBe(1);
    expect(actor.experience).toBe(before.experience);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual({
      state: before.rngState,
      calls: before.rngCalls,
    });

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: before.life, actionDisabled: true });
    expect(target.statuses).toEqual(prepared.targetStatusesAfter);
    expect(actor.experience).toBe(before.experience + prepared.result.experienceGained);
  });

  it("uses defense-up in base and terrain defense, coexists with defense-down, and ticks by round", () => {
    const makeBattle = (defenseUp: boolean, defenseDown: boolean) => {
      const battle = new Stage0Battle(0);
      const attacker = battle.unit("1:0")!;
      const defender = battle.units.find(({ side }) => side === 2)!;
      battle.units = [attacker, defender];
      attacker.classId = "great-dragon-knight";
      attacker.className = className(attacker.classId);
      attacker.experience = classDefinition(attacker.classId).dataRows[2].experienceThreshold;
      attacker.x = 20;
      attacker.y = 20;
      defender.x = 21;
      defender.y = 20;
      attacker.acted = false;
      defender.statuses.defenseUp = defenseUp ? 3 : 0;
      defender.statuses.defenseDown = defenseDown ? 3 : 0;
      return { battle, attacker, defender };
    };
    const plain = makeBattle(false, false);
    const raised = makeBattle(true, false);
    const baseDefense = raised.battle.statsFor(raised.defender).defense;
    expect(raised.battle.effectiveStatsFor(raised.defender).defense).toBe(baseDefense + 20);
    const terrainPercent = terrainDefensePercentFor(
      raised.defender.classId,
      raised.battle.terrainSlotAt(raised.defender),
    );
    const expectedReduction = 20
      + Math.floor((baseDefense + 20) * terrainPercent / 100)
      - Math.floor(baseDefense * terrainPercent / 100);
    const plainDamage = plain.battle.attack(plain.attacker.id, plain.defender.id).damage;
    const raisedDamage = raised.battle.attack(raised.attacker.id, raised.defender.id).damage;
    expect(plainDamage - raisedDamage).toBe(expectedReduction);

    const cancelled = makeBattle(true, true);
    expect(cancelled.battle.effectiveStatsFor(cancelled.defender).defense).toBe(baseDefense);
    cancelled.battle.startNextRound();
    expect(cancelled.defender.statuses.defenseUp).toBe(2);
    cancelled.battle.startNextRound();
    expect(cancelled.defender.statuses.defenseUp).toBe(1);
    cancelled.battle.startNextRound();
    expect(cancelled.defender.statuses.defenseUp).toBe(0);
  });

  it("applies FM atomically to full-life, refreshed, self, or frozen allies and expires next round", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "magic-guard", 1);
    target.life = battle.statsFor(target).maxLife;
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 2,
      defenseUp: 1,
      magicGuard: 3,
      confusion: 3,
      attackDown: 3,
      defenseDown: 2,
      poison: 1,
      techniqueSeal: 2,
    };
    const before = {
      life: target.life,
      experience: actor.experience,
      rngState: battle.rng.state,
      rngCalls: battle.rng.calls,
    };

    expect(battle.actionTargets(actor.id, "magic-guard"))
      .toEqual(expect.arrayContaining([actor, target]));
    const prepared = battle.prepareSpecialAction({
      actionId: "magic-guard",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "magic-guard",
      damage: 0,
      healing: 0,
      blocked: false,
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        lifeAfter: before.life,
        actionDisabledAfter: true,
        statusesAfter: {
          attackUp: 2,
          defenseUp: 1,
          magicGuard: 1,
          confusion: 3,
          attackDown: 3,
          defenseDown: 2,
          poison: 1,
          techniqueSeal: 2,
        },
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(13);
    expect(prepared.rngCallsAfter).toBe(before.rngCalls + 1);
    expect(target.statuses.magicGuard).toBe(3);
    expect(actor.experience).toBe(before.experience);
    expect({ state: battle.rng.state, calls: battle.rng.calls })
      .toEqual({ state: before.rngState, calls: before.rngCalls });

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: before.life, actionDisabled: true });
    expect(target.statuses).toEqual(prepared.targetStatusesAfter);
    expect(actor.experience).toBe(before.experience + prepared.result.experienceGained);
    battle.startNextRound();
    expect(target.statuses.magicGuard).toBe(0);
  });

  it("applies IP after one experience roll, preserves frozen targets, and lets native bosses resist only the mutation", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "poison", 2);
    target.actionDisabled = true;
    target.statuses.poison = 1;
    const beforeCalls = battle.rng.calls;
    const prepared = battle.prepareSpecialAction({
      actionId: "poison",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "poison",
      damage: 0,
      healing: 0,
      blocked: false,
      experienceGained: expect.any(Number),
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        actionDisabledAfter: true,
        statusesAfter: expect.objectContaining({ poison: 3 }),
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(17);
    expect(prepared.rngCallsAfter).toBe(beforeCalls + 1);
    expect(target.statuses.poison).toBe(1);
    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ actionDisabled: true });
    expect(target.statuses.poison).toBe(3);

    const immuneBattle = new Stage0Battle(0);
    const immunePair = arrangeTarget(immuneBattle, "poison", 2);
    immunePair.target.classId = "dragon";
    immunePair.target.className = className("dragon");
    immunePair.target.statuses.poison = 2;
    const immunePrepared = immuneBattle.prepareSpecialAction({
      actionId: "poison",
      actorId: immunePair.actor.id,
      targetId: immunePair.target.id,
    });
    expect(immunePrepared.result).toMatchObject({
      blocked: true,
      blockReason: "classImmune",
      affectedUnits: [expect.objectContaining({
        statusesAfter: expect.objectContaining({ poison: 2 }),
      })],
    });
    expect(immunePrepared.rngCallsAfter).toBe(immuneBattle.rng.calls + 1);
    expect(immunePrepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(immunePrepared.result.experienceGained).toBeLessThanOrEqual(17);
  });

  it("ticks poison before thawing, skips frozen persistent damage, and never reduces life below one", () => {
    const battle = new Stage0Battle(0);
    const target = battle.units.find(({ side }) => side === 2)!;
    battle.units = [battle.unit("1:0")!, target];
    target.life = 101;
    target.statuses.poison = 3;

    battle.startNextRound();
    expect(target).toMatchObject({ life: 50 });
    expect(target.statuses.poison).toBe(2);

    target.actionDisabled = true;
    battle.startNextRound();
    expect(target).toMatchObject({ life: 50, actionDisabled: false });
    expect(target.statuses.poison).toBe(1);

    battle.startNextRound();
    expect(target.life).toBe(25);
    expect(target.statuses.poison).toBe(0);

    target.life = 1;
    target.statuses.poison = 3;
    battle.startNextRound();
    expect(target.life).toBe(1);
    expect(target.statuses.poison).toBe(2);
  });

  it("applies LA after one experience roll, accepts frozen targets, and preserves native boss immunity", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "confusion", 2);
    target.actionDisabled = true;
    target.statuses.confusion = 1;
    const beforeCalls = battle.rng.calls;
    const prepared = battle.prepareSpecialAction({
      actionId: "confusion",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "confusion",
      damage: 0,
      healing: 0,
      blocked: false,
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        actionDisabledAfter: true,
        statusesAfter: expect.objectContaining({ confusion: 3 }),
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(17);
    expect(prepared.rngCallsAfter).toBe(beforeCalls + 1);
    expect(target.statuses.confusion).toBe(1);
    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ actionDisabled: true });
    expect(target.statuses.confusion).toBe(3);

    const immuneBattle = new Stage0Battle(0);
    const immunePair = arrangeTarget(immuneBattle, "confusion", 2);
    immunePair.target.classId = "dragon";
    immunePair.target.className = className("dragon");
    immunePair.target.statuses.confusion = 2;
    const immunePrepared = immuneBattle.prepareSpecialAction({
      actionId: "confusion",
      actorId: immunePair.actor.id,
      targetId: immunePair.target.id,
    });
    expect(immunePrepared.result).toMatchObject({
      blocked: true,
      blockReason: "classImmune",
      affectedUnits: [expect.objectContaining({
        statusesAfter: expect.objectContaining({ confusion: 2 }),
      })],
    });
    expect(immunePrepared.rngCallsAfter).toBe(immuneBattle.rng.calls + 1);
    expect(immunePrepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(immunePrepared.result.experienceGained).toBeLessThanOrEqual(17);
  });

  it("ticks confusion across full-round boundaries while frozen units remain outside action queues", () => {
    const battle = new Stage0Battle(0);
    const target = battle.units.find(({ side }) => side === 2)!;
    battle.units = [battle.unit("1:0")!, target];
    target.statuses.confusion = 3;
    target.actionDisabled = true;

    expect(battle.enemyActionOrder()).not.toContain(target.id);
    battle.startNextRound();
    expect(target).toMatchObject({ actionDisabled: false });
    expect(target.statuses.confusion).toBe(2);
    battle.startNextRound();
    expect(target.statuses.confusion).toBe(1);
    battle.startNextRound();
    expect(target.statuses.confusion).toBe(0);
  });

  it("applies SA to frozen enemies after one roll without consuming guard or clearing positive statuses", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "attack-down", 2);
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 3,
      defenseUp: 2,
      magicGuard: 1,
      confusion: 1,
      attackDown: 1,
      defenseDown: 2,
      poison: 1,
      techniqueSeal: 2,
    };
    const lifeBefore = target.life;
    const experienceBefore = actor.experience;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.actionTargets(actor.id, "attack-down")).toContain(target);
    const prepared = battle.prepareSpecialAction({
      actionId: "attack-down",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "attack-down",
      damage: 0,
      healing: 0,
      blocked: false,
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        lifeAfter: lifeBefore,
        actionDisabledAfter: true,
        statusesAfter: {
          attackUp: 3,
          defenseUp: 2,
          magicGuard: 1,
          confusion: 1,
          attackDown: 3,
          defenseDown: 2,
          poison: 1,
          techniqueSeal: 2,
        },
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(13);
    expect(prepared.rngCallsAfter).toBe(rngBefore.calls + 1);
    expect(target.statuses.attackDown).toBe(1);
    expect(actor.experience).toBe(experienceBefore);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: lifeBefore, actionDisabled: true });
    expect(target.statuses.magicGuard).toBe(1);
    expect(target.statuses.attackUp).toBe(3);
    expect(target.statuses.attackDown).toBe(3);
    expect(battle.effectiveStatsFor(target).attack).toBe(battle.statsFor(target).attack);
    target.statuses.attackUp = 0;
    expect(battle.effectiveStatsFor(target).attack)
      .toBe(Math.max(0, battle.statsFor(target).attack - 20));

    battle.startNextRound();
    expect(target).toMatchObject({ actionDisabled: false });
    expect(target.statuses.attackDown).toBe(2);
    battle.startNextRound();
    expect(target.statuses.attackDown).toBe(1);
    battle.startNextRound();
    expect(target.statuses.attackDown).toBe(0);
  });

  it("applies SD to frozen enemies after one roll without consuming guard or clearing positive statuses", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "defense-down", 2);
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 3,
      defenseUp: 2,
      magicGuard: 1,
      confusion: 1,
      attackDown: 1,
      defenseDown: 1,
      poison: 1,
      techniqueSeal: 2,
    };
    const lifeBefore = target.life;
    const experienceBefore = actor.experience;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.actionTargets(actor.id, "defense-down")).toContain(target);
    const prepared = battle.prepareSpecialAction({
      actionId: "defense-down",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "defense-down",
      damage: 0,
      healing: 0,
      blocked: false,
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        lifeAfter: lifeBefore,
        actionDisabledAfter: true,
        statusesAfter: {
          attackUp: 3,
          defenseUp: 2,
          magicGuard: 1,
          confusion: 1,
          attackDown: 1,
          defenseDown: 3,
          poison: 1,
          techniqueSeal: 2,
        },
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(13);
    expect(prepared.rngCallsAfter).toBe(rngBefore.calls + 1);
    expect(target.statuses.defenseDown).toBe(1);
    expect(actor.experience).toBe(experienceBefore);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: lifeBefore, actionDisabled: true });
    expect(target.statuses.magicGuard).toBe(1);
    expect(target.statuses.defenseUp).toBe(2);
    expect(target.statuses.defenseDown).toBe(3);
    expect(battle.effectiveStatsFor(target).defense).toBe(battle.statsFor(target).defense);
    target.statuses.defenseUp = 0;
    expect(battle.effectiveStatsFor(target).defense)
      .toBe(Math.max(0, battle.statsFor(target).defense - 20));

    battle.startNextRound();
    expect(target).toMatchObject({ actionDisabled: false });
    expect(target.statuses.defenseDown).toBe(2);
    battle.startNextRound();
    expect(target.statuses.defenseDown).toBe(1);
    battle.startNextRound();
    expect(target.statuses.defenseDown).toBe(0);
  });

  it("applies SN to frozen enemies, preserves guard, and keeps the dragon-only immunity after one roll", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "spell-seal", 2);
    target.actionDisabled = true;
    target.statuses = {
      attackUp: 3,
      defenseUp: 2,
      magicGuard: 1,
      confusion: 1,
      attackDown: 1,
      defenseDown: 2,
      poison: 1,
      techniqueSeal: 1,
    };
    const lifeBefore = target.life;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.actionTargets(actor.id, "spell-seal")).toContain(target);
    const prepared = battle.prepareSpecialAction({
      actionId: "spell-seal",
      actorId: actor.id,
      targetId: target.id,
    });
    expect(prepared.result).toMatchObject({
      actionId: "spell-seal",
      damage: 0,
      healing: 0,
      blocked: false,
      affectedUnits: [expect.objectContaining({
        unitId: target.id,
        lifeAfter: lifeBefore,
        actionDisabledAfter: true,
        statusesAfter: {
          attackUp: 3,
          defenseUp: 2,
          magicGuard: 1,
          confusion: 1,
          attackDown: 1,
          defenseDown: 2,
          poison: 1,
          techniqueSeal: 3,
        },
      })],
    });
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(17);
    expect(prepared.rngCallsAfter).toBe(rngBefore.calls + 1);

    battle.commitPreparedAction(prepared);
    expect(target).toMatchObject({ life: lifeBefore, actionDisabled: true });
    expect(target.statuses.magicGuard).toBe(1);
    expect(target.statuses.techniqueSeal).toBe(3);
    battle.startNextRound();
    expect(target).toMatchObject({ actionDisabled: false });
    expect(target.statuses.techniqueSeal).toBe(2);
    battle.startNextRound();
    expect(target.statuses.techniqueSeal).toBe(1);
    battle.startNextRound();
    expect(target.statuses.techniqueSeal).toBe(0);

    const immuneBattle = new Stage0Battle(0);
    const immunePair = arrangeTarget(immuneBattle, "spell-seal", 2);
    immunePair.target.classId = "dragon";
    immunePair.target.className = className("dragon");
    immunePair.target.statuses.techniqueSeal = 2;
    const immunePrepared = immuneBattle.prepareSpecialAction({
      actionId: "spell-seal",
      actorId: immunePair.actor.id,
      targetId: immunePair.target.id,
    });
    expect(immunePrepared.result).toMatchObject({
      blocked: true,
      blockReason: "classImmune",
      affectedUnits: [expect.objectContaining({
        statusesAfter: expect.objectContaining({ techniqueSeal: 2 }),
      })],
    });
    expect(immunePrepared.rngCallsAfter).toBe(immuneBattle.rng.calls + 1);
    expect(immunePrepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(immunePrepared.result.experienceGained).toBeLessThanOrEqual(17);
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

  it("prepares 2H from actual 36-percent healing and consumes exactly one experience roll", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "heal-2", 1);
    target.life = 300;
    const prepared = prepareSpecialAction(
      { actionId: "heal-2", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x2a),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 600, movement: 0, level: 2 }),
      },
      target,
    );

    expect(prepared.result.healing).toBe(216);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(15);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(18);
    expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    expect(target.life).toBe(300);
  });

  it("keeps the 2H q=0 branch and full-life cast legal with one random call", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "heal-2", 1);
    for (const life of [550, 600]) {
      target.life = life;
      const prepared = prepareSpecialAction(
        { actionId: "heal-2", actorId: actor.id, targetId: target.id },
        actor,
        target,
        new DeterministicRng(life),
        {
          units: [actor, target],
          battlefield: openBattlefield,
          statsFor: () => ({ attack: 0, defense: 0, maxLife: 600, movement: 0, level: 2 }),
        },
        target,
      );
      expect(prepared.result.healing).toBe(600 - life);
      expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(0);
      expect(prepared.result.experienceGained).toBeLessThanOrEqual(3);
      expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    }
  });

  it("prepares 3H from actual 48-percent healing and consumes one experience roll", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "heal-3", 1);
    target.life = 200;
    const prepared = prepareSpecialAction(
      { actionId: "heal-3", actorId: actor.id, targetId: target.id },
      actor,
      target,
      new DeterministicRng(0x3a),
      {
        units: [actor, target],
        battlefield: openBattlefield,
        statsFor: () => ({ attack: 0, defense: 0, maxLife: 600, movement: 0, level: 3 }),
      },
      target,
    );

    expect(prepared.result.healing).toBe(288);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(19);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(21);
    expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    expect(target.life).toBe(200);
  });

  it("keeps 3H full-life and q=0 casts legal with exactly one random call", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "heal-3", 1);
    for (const life of [550, 600]) {
      target.life = life;
      const prepared = prepareSpecialAction(
        { actionId: "heal-3", actorId: actor.id, targetId: target.id },
        actor,
        target,
        new DeterministicRng(life + 3),
        {
          units: [actor, target],
          battlefield: openBattlefield,
          statsFor: () => ({ attack: 0, defense: 0, maxLife: 600, movement: 0, level: 3 }),
        },
        target,
      );
      expect(prepared.result.healing).toBe(600 - life);
      expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(0);
      expect(prepared.result.experienceGained).toBeLessThanOrEqual(2);
      expect(prepared.rngCallsAfter - prepared.rngCallsBefore).toBe(1);
    }
  });

  it("lets 3H AI target full-life allies and resolves ties to the later grid cell", () => {
    const battle = new Stage0Battle(0);
    const source = battle.unit("1:0")!;
    const actor = {
      ...source,
      id: "magic-guide",
      classId: "magic-guide" as const,
      className: className("magic-guide"),
      experience: classDefinition("magic-guide").dataRows[2].experienceThreshold,
      statuses: { ...source.statuses },
    };
    const earlier = { ...source, id: "earlier", statuses: { ...source.statuses } };
    const later = { ...source, id: "later", statuses: { ...source.statuses } };
    battle.units = [actor, earlier, later];
    const candidateCells = battle.actionRange(actor.id, "heal-3").cells()
      .filter(({ x, y }) => x !== actor.x || y !== actor.y)
      .sort((left, right) => left.y * battle.stage.width + left.x
        - (right.y * battle.stage.width + right.x));
    Object.assign(earlier, candidateCells[0]);
    Object.assign(later, candidateCells.at(-1));
    for (const unit of battle.units) unit.life = battle.statsFor(unit).maxLife;

    expect(battle.planSpecialAiAction(actor.id, "heal-3")).toMatchObject({
      kind: "special",
      actionId: "heal-3",
      targetId: later.id,
      path: [{ x: actor.x, y: actor.y }],
    });
  });

  it("gates magic-guide 3H to its third native tier and radius seven", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    const target = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    actor.classId = "magic-guide";
    actor.className = className(actor.classId);
    battle.units = [actor, target];
    const rows = classDefinition("magic-guide").dataRows;

    for (const row of rows.slice(0, 2)) {
      actor.experience = row.experienceThreshold;
      expect(battle.actionRange(actor.id, "heal-3").cells()).toEqual([]);
    }
    actor.experience = rows[2].experienceThreshold;
    const cells = battle.actionRange(actor.id, "heal-3").cells();
    expect(cells.some(({ x, y }) => Math.abs(x - actor.x) + Math.abs(y - actor.y) === 7))
      .toBe(true);
    Object.assign(target, cells.find(({ x, y }) => x !== actor.x || y !== actor.y));
    expect(battle.actionTargets(actor.id, "heal-3")).toContain(target);
  });

  it("lets native 2H AI target full-life allies and resolves exact ties to the later grid cell", () => {
    const battle = new Stage0Battle(0);
    const source = battle.unit("1:0")!;
    const actor = {
      ...source,
      id: "prayer-guide",
      classId: "prayer-guide" as const,
      className: className("prayer-guide"),
      experience: classDefinition("prayer-guide").dataRows[2].experienceThreshold,
      statuses: { ...source.statuses },
    };
    const earlier = {
      ...source,
      id: "earlier",
      statuses: { ...source.statuses },
    };
    const later = {
      ...source,
      id: "later",
      statuses: { ...source.statuses },
    };
    battle.units = [actor, earlier, later];
    const candidateCells = battle.actionRange(actor.id, "heal-2").cells()
      .filter(({ x, y }) => x !== actor.x || y !== actor.y)
      .sort((left, right) => left.y * battle.stage.width + left.x
        - (right.y * battle.stage.width + right.x));
    Object.assign(earlier, candidateCells[0]);
    Object.assign(later, candidateCells.at(-1));
    for (const unit of battle.units) unit.life = battle.statsFor(unit).maxLife;

    expect(battle.planSpecialAiAction(actor.id, "heal-2")).toMatchObject({
      kind: "special",
      actionId: "heal-2",
      targetId: later.id,
      path: [{ x: actor.x, y: actor.y }],
    });
  });

  it("gates magic-guide 2H to its second native tier", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    const target = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    actor.classId = "magic-guide";
    actor.className = className(actor.classId);
    battle.units = [actor, target];
    const rows = classDefinition("magic-guide").dataRows;

    actor.experience = rows[0].experienceThreshold;
    expect(battle.actionRange(actor.id, "heal-2").cells()).toEqual([]);
    actor.experience = rows[1].experienceThreshold;
    const destination = battle.actionRange(actor.id, "heal-2").cells()
      .find(({ x, y }) => x !== actor.x || y !== actor.y);
    expect(destination).toBeDefined();
    Object.assign(target, destination);
    expect(battle.actionTargets(actor.id, "heal-2")).toContain(target);
    actor.experience = rows[2].experienceThreshold;
    expect(battle.actionRange(actor.id, "heal-2").cells()).toEqual([]);
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

  it("resolves 2L with four distinct range values, kill-only experience, and the frozen exception", () => {
    const battle = new Stage0Battle(0);
    const template = battle.units.find((unit) => unit.side === 2)!;
    const actor = {
      ...battle.unit("1:0")!,
      id: "lightning-2-actor",
      x: 0,
      y: 5,
      classId: "magic-master" as const,
      experience: 0,
    };
    const center = { ...template, id: "lightning-2-center", x: 5, y: 5, life: 60 };
    const inner = { ...template, id: "lightning-2-inner", x: 6, y: 5, life: 100 };
    const guarded = {
      ...template,
      id: "lightning-2-guarded",
      x: 7,
      y: 5,
      life: 100,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const frozen = {
      ...template,
      id: "lightning-2-frozen",
      x: 8,
      y: 5,
      life: 100,
      actionDisabled: true,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const outer = { ...template, id: "lightning-2-outer", x: 5, y: 8, life: 100 };
    const outside = { ...template, id: "lightning-2-outside", x: 9, y: 5, life: 100 };
    const rng = new DeterministicRng(0x2a2a, 9);
    const prepared = prepareSpecialAction(
      { actionId: "lightning-2", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [actor, center, inner, guarded, frozen, outer, outside],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.effectCells).toHaveLength(25);
    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, damage: 60, lifeAfter: 0, died: true }),
      expect.objectContaining({ unitId: inner.id, damage: 45, lifeAfter: 55 }),
      expect.objectContaining({
        unitId: guarded.id,
        damage: 0,
        blockReason: "magicGuard",
        statusesAfter: expect.objectContaining({ magicGuard: 0 }),
      }),
      expect.objectContaining({
        unitId: frozen.id,
        damage: 0,
        blockReason: "frozen",
        lifeAfter: 100,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
      expect.objectContaining({ unitId: outer.id, damage: 15, lifeAfter: 85 }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outside.id)).toBe(false);
    expect(prepared.result.experienceGained).toBe(killRewardFor(center.classId, center.side));
    expect(prepared.rngAfter).toBe(prepared.rngBefore);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
  });

  it("resolves 3L with its independent 45/60/75/90 rings and preserves frozen magic guard", () => {
    const battle = new Stage0Battle(0);
    const template = battle.units.find((unit) => unit.side === 2)!;
    const actor = {
      ...battle.unit("1:0")!,
      id: "lightning-3-actor",
      x: 0,
      y: 5,
      classId: "magic-master" as const,
      experience: classDefinition("magic-master").dataRows[1].experienceThreshold,
    };
    const center = { ...template, id: "lightning-3-center", x: 6, y: 5, life: 90 };
    const inner = { ...template, id: "lightning-3-inner", x: 7, y: 5, life: 100 };
    const guarded = {
      ...template,
      id: "lightning-3-guarded",
      x: 8,
      y: 5,
      life: 100,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const frozen = {
      ...template,
      id: "lightning-3-frozen",
      x: 9,
      y: 5,
      life: 100,
      actionDisabled: true,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const outer = { ...template, id: "lightning-3-outer", x: 6, y: 8, life: 100 };
    const outside = { ...template, id: "lightning-3-outside", x: 10, y: 5, life: 100 };
    const rng = new DeterministicRng(0x3a3a, 11);
    const prepared = prepareSpecialAction(
      { actionId: "lightning-3", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [actor, center, inner, guarded, frozen, outer, outside],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.effectCells).toHaveLength(25);
    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, damage: 90, lifeAfter: 0, died: true }),
      expect.objectContaining({ unitId: inner.id, damage: 75, lifeAfter: 25 }),
      expect.objectContaining({
        unitId: guarded.id,
        damage: 0,
        blockReason: "magicGuard",
        statusesAfter: expect.objectContaining({ magicGuard: 0 }),
      }),
      expect.objectContaining({
        unitId: frozen.id,
        damage: 0,
        blockReason: "frozen",
        lifeAfter: 100,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
      expect.objectContaining({ unitId: outer.id, damage: 45, lifeAfter: 55 }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outside.id)).toBe(false);
    expect(prepared.result.experienceGained).toBe(killRewardFor(center.classId, center.side));
    expect(prepared.rngAfter).toBe(prepared.rngBefore);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
  });

  it("resolves 4L across five 30/50/70/90/110 rings with kill-only experience", () => {
    const battle = new Stage0Battle(0);
    const template = battle.units.find((unit) => unit.side === 2)!;
    const actor = {
      ...battle.unit("1:0")!,
      id: "lightning-4-actor",
      x: 0,
      y: 5,
      classId: "magic-master" as const,
      experience: classDefinition("magic-master").dataRows[2].experienceThreshold,
    };
    const center = { ...template, id: "lightning-4-center", x: 5, y: 5, life: 110 };
    const inner = { ...template, id: "lightning-4-inner", x: 6, y: 5, life: 120 };
    const guarded = {
      ...template,
      id: "lightning-4-guarded",
      x: 7,
      y: 5,
      life: 120,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const frozen = {
      ...template,
      id: "lightning-4-frozen",
      x: 8,
      y: 5,
      life: 120,
      actionDisabled: true,
      statuses: { ...template.statuses, magicGuard: 1 },
    };
    const outer = { ...template, id: "lightning-4-outer", x: 5, y: 9, life: 120 };
    const outside = { ...template, id: "lightning-4-outside", x: 10, y: 5, life: 120 };
    const rng = new DeterministicRng(0x4a4a, 13);
    const prepared = prepareSpecialAction(
      { actionId: "lightning-4", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [actor, center, inner, guarded, frozen, outer, outside],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.effectCells).toHaveLength(41);
    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, damage: 110, lifeAfter: 0, died: true }),
      expect.objectContaining({ unitId: inner.id, damage: 90, lifeAfter: 30 }),
      expect.objectContaining({
        unitId: guarded.id,
        damage: 0,
        blockReason: "magicGuard",
        statusesAfter: expect.objectContaining({ magicGuard: 0 }),
      }),
      expect.objectContaining({
        unitId: frozen.id,
        damage: 0,
        blockReason: "frozen",
        lifeAfter: 120,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
      expect.objectContaining({ unitId: outer.id, damage: 30, lifeAfter: 90 }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outside.id)).toBe(false);
    expect(prepared.result.experienceGained).toBe(killRewardFor(center.classId, center.side));
    expect(prepared.rngAfter).toBe(prepared.rngBefore);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
  });

  it("unions the stomp target diamond with the frozen 10x7 viewport and rolls each receiver in row-major order", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "stomp-actor",
      x: 5,
      y: 5,
      classId: "great-dragon-knight" as const,
      experience: 0,
    };
    const enemy = battle.units.find((unit) => unit.side === 2)!;
    const viewportEnemy = { ...enemy, id: "stomp-view-0", x: 0, y: 0, life: 100 };
    const frozenEnemy = {
      ...enemy,
      id: "stomp-frozen",
      x: 1,
      y: 0,
      life: 100,
      actionDisabled: true,
      statuses: { ...enemy.statuses, magicGuard: 2 },
    };
    const guardedEnemy = {
      ...enemy,
      id: "stomp-guarded",
      x: 2,
      y: 0,
      life: 100,
      statuses: { ...enemy.statuses, magicGuard: 2 },
    };
    const target = { ...enemy, id: "stomp-target", x: 7, y: 7, life: 100 };
    const friendlyInView = { ...actor, id: "stomp-friendly", x: 0, y: 1, life: 100 };
    const outside = { ...enemy, id: "stomp-outside", x: 10, y: 0, life: 100 };
    const rng = new DeterministicRng(0x1d1d, 7);
    const prepared = prepareSpecialAction(
      {
        actionId: "stomp-1",
        actorId: actor.id,
        targetId: target.id,
        viewportOrigin: { x: 0, y: 0 },
      },
      actor,
      target,
      rng,
      {
        units: [actor, viewportEnemy, frozenEnemy, guardedEnemy, target, friendlyInView, outside],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
        viewport: { origin: { x: 0, y: 0 }, width: 3, height: 2 },
      },
      target,
    );

    expect(prepared.result.effectCells).toHaveLength(31);
    expect(prepared.result.effectCells).toContainEqual({ position: { x: 0, y: 0 }, value: 1 });
    expect(prepared.result.effectCells).toContainEqual({ position: { x: 7, y: 7 }, value: 4 });
    expect(prepared.result.affectedUnits.map(({ unitId }) => unitId)).toEqual([
      viewportEnemy.id,
      frozenEnemy.id,
      guardedEnemy.id,
      target.id,
    ]);
    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({ unitId: viewportEnemy.id, damage: expect.any(Number) }),
      expect.objectContaining({
        unitId: frozenEnemy.id,
        damage: 0,
        blocked: true,
        blockReason: "frozen",
        statusesAfter: expect.objectContaining({ magicGuard: 2 }),
      }),
      expect.objectContaining({
        unitId: guardedEnemy.id,
        damage: expect.any(Number),
        blocked: false,
        statusesAfter: expect.objectContaining({ magicGuard: 2 }),
      }),
      expect.objectContaining({ unitId: target.id, damage: expect.any(Number) }),
    ]);
    for (const affected of prepared.result.affectedUnits.filter(({ blocked }) => !blocked)) {
      expect(affected.damage).toBeGreaterThanOrEqual(10);
      expect(affected.damage).toBeLessThanOrEqual(19);
    }
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === friendlyInView.id)).toBe(false);
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === outside.id)).toBe(false);
    expect(prepared.result.experienceGained).toBe(5);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 3);
  });

  it("captures and clamps the rules-significant viewport when preparing stomp", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "stomp-1", 2);
    actor.experience = 0;
    target.actionDisabled = false;
    const prepared = battle.prepareSpecialAction({
      actionId: "stomp-1",
      actorId: actor.id,
      targetId: target.id,
      viewportOrigin: { x: -500, y: 500 },
    });
    expect(prepared.intent.viewportOrigin).toEqual({
      x: battle.stage.viewport.originBounds.min.x,
      y: battle.stage.viewport.originBounds.max.y,
    });
    expect(prepared.result.effectCells.filter(({ value }) => value === 1).length)
      .toBeGreaterThanOrEqual(battle.stage.viewport.width * battle.stage.viewport.height);
    expect(actor.acted).toBe(false);
    expect(target.life).toBe(prepared.targetLifeBefore);
  });

  it("uses 15..29 independent damage and fixed five experience for male stomp", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "stomp-2", 2);
    target.life = 100;
    target.statuses.magicGuard = 2;
    const before = { state: battle.rng.state, calls: battle.rng.calls };
    const prepared = battle.prepareSpecialAction({
      actionId: "stomp-2",
      actorId: actor.id,
      targetId: target.id,
      viewportOrigin: { x: 0, y: 0 },
    });
    const affected = prepared.result.affectedUnits.find(({ unitId }) => unitId === target.id);
    expect(affected?.damage).toBeGreaterThanOrEqual(15);
    expect(affected?.damage).toBeLessThanOrEqual(29);
    expect(affected).toMatchObject({
      blocked: false,
      statusesAfter: expect.objectContaining({ magicGuard: 2 }),
    });
    expect(prepared.result.experienceGained).toBe(5);
    expect(prepared.rngCallsAfter).toBe(before.calls + 1);
    battle.commitPreparedAction(prepared);
    expect(target.life).toBe(100 - affected!.damage);
    expect(actor.experience).toBe(prepared.actorExperienceBefore + 5);
  });

  it("uses 20..39 independent damage, preserves magic guard, and fixes female-stomp experience at five", () => {
    const battle = new Stage0Battle(0);
    const { actor, target } = arrangeTarget(battle, "stomp-3", 2);
    target.life = 100;
    target.statuses.magicGuard = 2;
    const frozenReceiver = {
      ...target,
      id: "stomp-3-frozen-receiver",
      x: 0,
      y: 0,
      life: 100,
      actionDisabled: true,
      statuses: { ...target.statuses },
    };
    battle.units.push(frozenReceiver);
    const before = { state: battle.rng.state, calls: battle.rng.calls };
    const prepared = battle.prepareSpecialAction({
      actionId: "stomp-3",
      actorId: actor.id,
      targetId: target.id,
      viewportOrigin: { x: 0, y: 0 },
    });
    const affected = prepared.result.affectedUnits.find(({ unitId }) => unitId === target.id);
    expect(affected?.damage).toBeGreaterThanOrEqual(20);
    expect(affected?.damage).toBeLessThanOrEqual(39);
    expect(affected).toMatchObject({
      blocked: false,
      statusesAfter: expect.objectContaining({ magicGuard: 2 }),
    });
    expect(prepared.result.affectedUnits).toContainEqual(expect.objectContaining({
      unitId: frozenReceiver.id,
      damage: 0,
      lifeAfter: 100,
      blocked: true,
      blockReason: "frozen",
      statusesAfter: expect.objectContaining({ magicGuard: 2 }),
    }));
    expect(prepared.result.experienceGained).toBe(5);
    expect(prepared.rngCallsAfter).toBe(before.calls + 1);
    battle.commitPreparedAction(prepared);
    expect(target.life).toBe(100 - affected!.damage);
    expect(actor.experience).toBe(prepared.actorExperienceBefore + 5);
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

  it("uses the 50/70/90 intermediate recovery rings and one random call above the threshold", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "recovery-2-actor",
      x: 0,
      y: 0,
      classId: "prayer-guide" as const,
    };
    const baseline = battle.units.find((unit) => unit.side === 1 && unit.id !== "1:0")!;
    const center = { ...baseline, id: "recovery-2-center", x: 5, y: 5, life: 1 };
    const middle = { ...baseline, id: "recovery-2-middle", x: 5, y: 6, life: 1 };
    const outer = { ...baseline, id: "recovery-2-outer", x: 5, y: 7, life: 1 };
    const frozen = {
      ...baseline,
      id: "recovery-2-frozen",
      x: 4,
      y: 5,
      life: 1,
      actionDisabled: true,
    };
    const rng = new DeterministicRng(0x2f2f);
    const prepared = prepareSpecialAction(
      { actionId: "recovery-2", actorId: actor.id, targetId: center.id },
      actor,
      center,
      rng,
      {
        units: [actor, center, middle, outer, frozen],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, healing: 90 }),
      expect.objectContaining({ unitId: middle.id, healing: 70 }),
      expect.objectContaining({ unitId: outer.id, healing: 50 }),
      expect.objectContaining({
        unitId: frozen.id,
        healing: 0,
        blocked: true,
        blockReason: "frozen",
      }),
    ]));
    expect(prepared.result.healing).toBe(210);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(14);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(15);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);
  });

  it("keeps intermediate recovery below fifty deterministic and caps its quotient experience", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "recovery-2-threshold-actor",
      x: 0,
      y: 0,
      classId: "prayer-guide" as const,
    };
    const baseline = battle.units.find((unit) => unit.side === 1 && unit.id !== "1:0")!;
    const maximumLife = battle.statsFor(baseline).maxLife;
    const prepare = (missing: number, units?: BattleUnit[]) => {
      const center = {
        ...baseline,
        id: `recovery-2-${missing}`,
        x: 5,
        y: 5,
        life: maximumLife - missing,
      };
      return prepareSpecialAction(
        { actionId: "recovery-2", actorId: actor.id, targetId: center.id },
        actor,
        center,
        new DeterministicRng(0x2f50, 7),
        {
          units: units ?? [actor, center],
          battlefield: openBattlefield,
          statsFor: (unit) => battle.statsFor(unit),
        },
        center,
      );
    };

    const below = prepare(49);
    expect(below.result).toMatchObject({ healing: 49, experienceGained: 0 });
    expect(below.rngCallsAfter).toBe(below.rngCallsBefore);

    const exact = prepare(50);
    expect(exact.result.healing).toBe(50);
    expect(exact.result.experienceGained).toBeGreaterThanOrEqual(11);
    expect(exact.result.experienceGained).toBeLessThanOrEqual(12);
    expect(exact.rngCallsAfter).toBe(exact.rngCallsBefore + 1);

    const fullTargets = Array.from({ length: 6 }, (_, index) => ({
      ...baseline,
      id: `recovery-2-cap-${index}`,
      x: 5 + (index === 0 ? 0 : index === 1 ? 1 : index === 2 ? -1 : 0),
      y: 5 + (index === 3 ? 1 : index === 4 ? -1 : index === 5 ? 2 : 0),
      life: 1,
    }));
    const cappedCenter = fullTargets[0]!;
    const capped = prepareSpecialAction(
      { actionId: "recovery-2", actorId: actor.id, targetId: cappedCenter.id },
      actor,
      cappedCenter,
      new DeterministicRng(0x2f80),
      {
        units: [actor, ...fullTargets],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      cappedCenter,
    );
    expect(capped.result.healing).toBeGreaterThanOrEqual(400);
    expect(capped.result.experienceGained).toBeGreaterThanOrEqual(18);
    expect(capped.result.experienceGained).toBeLessThanOrEqual(19);
    expect(capped.rngCallsAfter).toBe(capped.rngCallsBefore + 1);
  });

  it("uses the 35/60/85/110 advanced recovery rings and fully excludes frozen allies", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "recovery-3-actor",
      x: 0,
      y: 0,
      classId: "prayer-guide" as const,
    };
    const baseline = battle.units.find((unit) => unit.side === 1 && unit.id !== "1:0")!;
    const center = { ...baseline, id: "recovery-3-center", x: 5, y: 5, life: 1 };
    const inner = { ...baseline, id: "recovery-3-inner", x: 5, y: 6, life: 1 };
    const middle = { ...baseline, id: "recovery-3-middle", x: 5, y: 7, life: 1 };
    const outer = { ...baseline, id: "recovery-3-outer", x: 5, y: 8, life: 1 };
    const frozen = {
      ...baseline,
      id: "recovery-3-frozen",
      x: 4,
      y: 5,
      life: 1,
      actionDisabled: true,
    };
    const prepared = prepareSpecialAction(
      { actionId: "recovery-3", actorId: actor.id, targetId: center.id },
      actor,
      center,
      new DeterministicRng(0x3f3f),
      {
        units: [actor, center, inner, middle, outer, frozen],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      center,
    );

    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: center.id, healing: 110 }),
      expect.objectContaining({ unitId: inner.id, healing: 85 }),
      expect.objectContaining({ unitId: middle.id, healing: 60 }),
      expect.objectContaining({ unitId: outer.id, healing: 35 }),
      expect.objectContaining({
        unitId: frozen.id,
        healing: 0,
        lifeBefore: 1,
        lifeAfter: 1,
        blocked: true,
        blockReason: "frozen",
      }),
    ]));
    expect(prepared.result.healing).toBe(290);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(17);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(18);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);
  });

  it("keeps advanced recovery deterministic below fifty and caps quotient experience", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "recovery-3-threshold-actor",
      x: 0,
      y: 0,
      classId: "prayer-guide" as const,
    };
    const baseline = battle.units.find((unit) => unit.side === 1 && unit.id !== "1:0")!;
    const maximumLife = battle.statsFor(baseline).maxLife;
    const prepare = (missing: number) => {
      const center = {
        ...baseline,
        id: `recovery-3-${missing}`,
        x: 5,
        y: 5,
        life: maximumLife - missing,
      };
      return prepareSpecialAction(
        { actionId: "recovery-3", actorId: actor.id, targetId: center.id },
        actor,
        center,
        new DeterministicRng(0x3f50, 7),
        {
          units: [actor, center],
          battlefield: openBattlefield,
          statsFor: (unit) => battle.statsFor(unit),
        },
        center,
      );
    };

    const below = prepare(49);
    expect(below.result).toMatchObject({ healing: 49, experienceGained: 0 });
    expect(below.rngCallsAfter).toBe(below.rngCallsBefore);

    const exact = prepare(50);
    expect(exact.result.healing).toBe(50);
    expect(exact.result.experienceGained).toBeGreaterThanOrEqual(13);
    expect(exact.result.experienceGained).toBeLessThanOrEqual(14);
    expect(exact.rngCallsAfter).toBe(exact.rngCallsBefore + 1);

    const targets = [
      { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 4, y: 5 },
      { x: 5, y: 6 }, { x: 5, y: 4 },
    ].map((position, index) => ({
      ...baseline,
      id: `recovery-3-cap-${index}`,
      ...position,
      life: 1,
    }));
    const capped = prepareSpecialAction(
      { actionId: "recovery-3", actorId: actor.id, targetId: targets[0]!.id },
      actor,
      targets[0],
      new DeterministicRng(0x3f80),
      {
        units: [actor, ...targets],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      targets[0]!,
    );
    expect(capped.result.healing).toBeGreaterThanOrEqual(400);
    expect(capped.result.experienceGained).toBeGreaterThanOrEqual(20);
    expect(capped.result.experienceGained).toBeLessThanOrEqual(21);
    expect(capped.rngCallsAfter).toBe(capped.rngCallsBefore + 1);
  });

  it("gates intermediate recovery to the native tier-three magic guide menu", () => {
    const battle = new Stage0Battle(0);
    const actor = battle.unit("1:0")!;
    const target = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    actor.classId = "magic-guide";
    actor.className = className("magic-guide");
    actor.experience = classDefinition("magic-guide").dataRows[2].experienceThreshold;
    battle.units = [actor, target];
    const destination = battle.actionRange(actor.id, "recovery-2").cells()
      .find((position) => position.x !== actor.x || position.y !== actor.y)!;
    target.x = destination.x;
    target.y = destination.y;
    expect(battle.actionTargetCells(actor.id, "recovery-2")).toContainEqual(destination);

    actor.experience = classDefinition("magic-guide").dataRows[1].experienceThreshold;
    expect(battle.actionTargetCells(actor.id, "recovery-2")).toEqual([]);
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
        positionAfter: { x: 5, y: 7 },
        moved: true,
        blocked: false,
        actionDisabledAfter: true,
      }),
    ]);
    expect(outer.result.experienceGained).toBeGreaterThanOrEqual(8);
    expect(outer.result.experienceGained).toBeLessThanOrEqual(9);
    expect(outer.rngCallsAfter).toBe(outer.rngCallsBefore + 1);

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
    expect(noMove.result.experienceGained).toBe(0);
    expect(noMove.rngCallsAfter).toBe(noMove.rngCallsBefore);
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

  it("uses the native radius-four, three-ring, and 10..11 experience contract for intermediate ice", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "ice-2-actor",
      x: 5,
      y: 5,
      classId: "wizard" as const,
      experience: 0,
    };
    const enemyTemplate = battle.units.find((unit) => unit.side === 2)!;
    const inner = { ...enemyTemplate, id: "ice-2-inner", x: 5, y: 4 };
    const outer = { ...enemyTemplate, id: "ice-2-outer", x: 5, y: 8 };
    const rng = new DeterministicRng(0x2c2c, 7);
    const prepared = prepareSpecialAction(
      { actionId: "ice-2", actorId: actor.id },
      actor,
      undefined,
      rng,
      {
        units: [actor, inner, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );

    const effectValueAt = (x: number, y: number) => prepared.result.effectCells
      .find(({ position }) => position.x === x && position.y === y)?.value;
    expect(effectValueAt(5, 5)).toBe(4);
    expect(effectValueAt(5, 4)).toBe(3);
    expect(effectValueAt(5, 3)).toBe(2);
    expect(effectValueAt(5, 2)).toBe(1);
    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: inner.id,
        positionAfter: { x: 5, y: 3 },
        moved: true,
        lifeAfter: inner.life,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 5, y: 9 },
        moved: true,
        lifeAfter: outer.life,
        actionDisabledAfter: true,
      }),
    ]);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(11);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);

    const outerOnly = prepareSpecialAction(
      { actionId: "ice-2", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x2c2c, 7),
      {
        units: [actor, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(outerOnly.result).toMatchObject({
      affectedUnits: [expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 5, y: 9 },
        moved: true,
      })],
    });
    expect(outerOnly.result.experienceGained).toBeGreaterThanOrEqual(10);
    expect(outerOnly.result.experienceGained).toBeLessThanOrEqual(11);
    expect(outerOnly.rngCallsAfter).toBe(outerOnly.rngCallsBefore + 1);

    const alreadyFrozen = prepareSpecialAction(
      { actionId: "ice-2", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x2c2c, 7),
      {
        units: [actor, {
          ...inner,
          actionDisabled: true,
          statuses: { ...inner.statuses, magicGuard: 1 },
        }],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(alreadyFrozen.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: inner.id,
        blocked: true,
        blockReason: "frozen",
        moved: false,
        actionDisabledAfter: true,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
    ]);
    expect(alreadyFrozen.result.experienceGained).toBe(0);
    expect(alreadyFrozen.rngCallsAfter).toBe(alreadyFrozen.rngCallsBefore);
  });

  it("uses four rings for advanced ice and pushes the outer ring beyond the effect", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "ice-3-actor",
      x: 5,
      y: 5,
      classId: "wizard" as const,
      experience: classDefinition("wizard").dataRows[1].experienceThreshold,
    };
    const enemyTemplate = battle.units.find((unit) => unit.side === 2)!;
    const inner = { ...enemyTemplate, id: "ice-3-inner", x: 4, y: 5 };
    const frozen = {
      ...enemyTemplate,
      id: "ice-3-frozen",
      x: 6,
      y: 5,
      actionDisabled: true,
      statuses: { ...enemyTemplate.statuses, magicGuard: 1 as const },
    };
    const outer = { ...enemyTemplate, id: "ice-3-outer", x: 5, y: 9 };
    const prepared = prepareSpecialAction(
      { actionId: "ice-3", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x3c3c, 11),
      {
        units: [actor, inner, frozen, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );

    const effectValueAt = (x: number, y: number) => prepared.result.effectCells
      .find(({ position }) => position.x === x && position.y === y)?.value;
    expect(prepared.result.effectCells).toHaveLength(41);
    expect(effectValueAt(5, 5)).toBe(5);
    expect(effectValueAt(5, 4)).toBe(4);
    expect(effectValueAt(5, 3)).toBe(3);
    expect(effectValueAt(5, 2)).toBe(2);
    expect(effectValueAt(5, 1)).toBe(1);
    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: inner.id,
        positionAfter: { x: 4, y: 6 },
        moved: true,
        lifeAfter: inner.life,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({
        unitId: frozen.id,
        positionAfter: { x: 6, y: 5 },
        blocked: true,
        blockReason: "frozen",
        moved: false,
        lifeAfter: frozen.life,
        actionDisabledAfter: true,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
      expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 5, y: 10 },
        moved: true,
        lifeAfter: outer.life,
        actionDisabledAfter: true,
      }),
    ]);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(12);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(14);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);

    const outerOnly = prepareSpecialAction(
      { actionId: "ice-3", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x3c3c, 11),
      {
        units: [actor, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(outerOnly.result).toMatchObject({
      affectedUnits: [expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 5, y: 10 },
        moved: true,
      })],
    });
    expect(outerOnly.result.experienceGained).toBeGreaterThanOrEqual(12);
    expect(outerOnly.result.experienceGained).toBeLessThanOrEqual(14);
    expect(outerOnly.rngCallsAfter).toBe(outerOnly.rngCallsBefore + 1);
  });

  it("uses five rings for ultimate ice with 15..17 move experience and outer-ring push", () => {
    const battle = new Stage0Battle(0);
    const actor = {
      ...battle.unit("1:0")!,
      id: "ice-4-actor",
      x: 5,
      y: 5,
      classId: "wizard" as const,
      experience: classDefinition("wizard").dataRows[2].experienceThreshold,
    };
    const enemyTemplate = battle.units.find((unit) => unit.side === 2)!;
    const inner = { ...enemyTemplate, id: "ice-4-inner", x: 4, y: 5 };
    const frozen = {
      ...enemyTemplate,
      id: "ice-4-frozen",
      x: 6,
      y: 5,
      actionDisabled: true,
      statuses: { ...enemyTemplate.statuses, magicGuard: 1 as const },
    };
    const outer = { ...enemyTemplate, id: "ice-4-outer", x: 5, y: 0 };
    const prepared = prepareSpecialAction(
      { actionId: "ice-4", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x4c4c, 13),
      {
        units: [actor, inner, frozen, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );

    const effectValueAt = (x: number, y: number) => prepared.result.effectCells
      .find(({ position }) => position.x === x && position.y === y)?.value;
    expect(prepared.result.effectCells).toHaveLength(61);
    expect(effectValueAt(5, 5)).toBe(6);
    expect(effectValueAt(5, 4)).toBe(5);
    expect(effectValueAt(5, 3)).toBe(4);
    expect(effectValueAt(5, 2)).toBe(3);
    expect(effectValueAt(5, 1)).toBe(2);
    expect(effectValueAt(5, 0)).toBe(1);
    expect(prepared.result.affectedUnits).toEqual([
      expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 4, y: 0 },
        moved: true,
        lifeAfter: outer.life,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({
        unitId: inner.id,
        positionAfter: { x: 4, y: 6 },
        moved: true,
        lifeAfter: inner.life,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({
        unitId: frozen.id,
        positionAfter: { x: 6, y: 5 },
        blocked: true,
        blockReason: "frozen",
        moved: false,
        lifeAfter: frozen.life,
        actionDisabledAfter: true,
        statusesAfter: expect.objectContaining({ magicGuard: 1 }),
      }),
    ]);
    expect(prepared.result.experienceGained).toBeGreaterThanOrEqual(15);
    expect(prepared.result.experienceGained).toBeLessThanOrEqual(17);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore + 1);

    const outerOnly = prepareSpecialAction(
      { actionId: "ice-4", actorId: actor.id },
      actor,
      undefined,
      new DeterministicRng(0x4c4c, 13),
      {
        units: [actor, outer],
        battlefield: openBattlefield,
        statsFor: (unit) => battle.statsFor(unit),
      },
      actor,
    );
    expect(outerOnly.result).toMatchObject({
      affectedUnits: [expect.objectContaining({
        unitId: outer.id,
        positionAfter: { x: 4, y: 0 },
        moved: true,
      })],
    });
    expect(outerOnly.result.experienceGained).toBeGreaterThanOrEqual(15);
    expect(outerOnly.result.experienceGained).toBeLessThanOrEqual(17);
    expect(outerOnly.rngCallsAfter).toBe(outerOnly.rngCallsBefore + 1);
  });

  it("offers OJ only to tier-three prayer guides and locks it to the actor cell", () => {
    const battle = new Stage0Battle(0, new DeterministicRng(0x0b1e));
    const actor = battle.unit("1:0")!;
    const ally = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    promoteForAction(actor, "prayer");
    battle.units = [actor, ally];

    const prayerRows = classDefinition("prayer-guide").dataRows;
    actor.experience = 0;
    expect(battle.actionTargetCells(actor.id, "prayer")).toEqual([]);
    actor.experience = prayerRows[1].experienceThreshold;
    expect(battle.actionTargetCells(actor.id, "prayer")).toEqual([]);
    actor.experience = prayerRows[2].experienceThreshold;
    expect(battle.actionRange(actor.id, "prayer").cells()).toEqual([{ x: actor.x, y: actor.y }]);
    expect(battle.actionTargetCells(actor.id, "prayer")).toEqual([{ x: actor.x, y: actor.y }]);
    expect(battle.actionTargets(actor.id, "prayer")).toEqual([]);
    expect(() => battle.prepareSpecialAction({
      actionId: "prayer",
      actorId: actor.id,
      target: { x: actor.x + 1, y: actor.y },
    })).toThrow("illegal special action");
    expect(() => battle.prepareSpecialAction({
      actionId: "prayer",
      actorId: actor.id,
      targetId: ally.id,
    })).toThrow("illegal special action");
  });

  it("scans OJ candidates in row-major order and preserves its exact per-unit PRNG contract", () => {
    const seed = 0x0b1e55ed;
    const battle = new Stage0Battle(0, new DeterministicRng(seed));
    const actor = battle.unit("1:0")!;
    const allyTemplate = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    const enemyTemplate = battle.units.find((unit) => unit.side === 2)!;
    promoteForAction(actor, "prayer");
    actor.experience = classDefinition("prayer-guide").dataRows[2].experienceThreshold;
    actor.x = 3;
    actor.y = 3;
    const early = {
      ...allyTemplate,
      statuses: { ...allyTemplate.statuses },
      id: "oj-early",
      x: 9,
      y: 1,
    };
    const late = {
      ...allyTemplate,
      statuses: { ...allyTemplate.statuses },
      id: "oj-late",
      x: 1,
      y: 4,
    };
    const enemy = {
      ...enemyTemplate,
      statuses: { ...enemyTemplate.statuses },
      id: "oj-enemy",
      x: 0,
      y: 0,
    };
    battle.units = [late, enemy, actor, early];
    const before = JSON.stringify(battle.units);
    const expected = expectedPrayerSequence(seed, 3);

    const prepared = battle.prepareSpecialAction({ actionId: "prayer", actorId: actor.id });

    expect(prepared.result.prayerEligibleUnitIds).toEqual([early.id, actor.id, late.id]);
    expect(prepared.affectedUnits.map(({ unitId, prayerOutcome, prayerRolledAmount }) => ({
      unitId,
      prayerOutcome,
      prayerRolledAmount,
    }))).toEqual(expected.outcomes.map(({ candidateIndex, outcome, rolledAmount }) => ({
      unitId: [early.id, actor.id, late.id][candidateIndex],
      prayerOutcome: outcome,
      prayerRolledAmount: rolledAmount,
    })));
    expect(prepared.rngAfter).toBe(expected.stateAfter);
    expect(prepared.rngCallsAfter).toBe(expected.callsAfter);
    expect(prepared.result.experienceGained).toBe(0);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual({ state: seed, calls: 0 });
    expect(JSON.stringify(battle.units)).toBe(before);
  });

  it("applies all four OJ outcomes while blocking only healing on a frozen unit", () => {
    const baseBattle = new Stage0Battle(0);
    const actorTemplate = baseBattle.unit("1:0")!;
    const allyTemplate = baseBattle.units.find((unit) => unit.side === 1 && unit.id !== actorTemplate.id)!;
    const enemyTemplate = baseBattle.units.find((unit) => unit.side === 2)!;

    for (const expectedOutcome of ["healing", "experience", "attackUp", "defenseUp"] as const) {
      const actor = {
        ...actorTemplate,
        statuses: { ...actorTemplate.statuses },
        id: `oj-actor-${expectedOutcome}`,
        x: 5,
        y: 5,
        classId: "prayer-guide" as const,
        experience: classDefinition("prayer-guide").dataRows[2].experienceThreshold,
      };
      const frozen = {
        ...allyTemplate,
        statuses: { ...allyTemplate.statuses, magicGuard: 1 as const },
        id: `oj-frozen-${expectedOutcome}`,
        x: 1,
        y: 1,
        life: Math.max(1, allyTemplate.life - 20),
        actionDisabled: true,
      };
      const enemy = {
        ...enemyTemplate,
        statuses: { ...enemyTemplate.statuses },
        id: `oj-enemy-${expectedOutcome}`,
        x: 0,
        y: 0,
      };
      const seed = findPrayerSeed(2, (outcomes) =>
        outcomes.some(({ candidateIndex, outcome }) =>
          candidateIndex === 0 && outcome === expectedOutcome));
      const prepared = prepareSpecialAction(
        { actionId: "prayer", actorId: actor.id },
        actor,
        undefined,
        new DeterministicRng(seed),
        {
          units: [actor, enemy, frozen],
          battlefield: openBattlefield,
          statsFor: (unit) => baseBattle.statsFor(unit),
        },
        actor,
      );
      const result = prepared.affectedUnits.find(({ unitId }) => unitId === frozen.id)!;
      expect(result.prayerOutcome).toBe(expectedOutcome);
      expect(result.statusesAfter.magicGuard).toBe(1);
      expect(frozen.life).toBe(result.lifeBefore);
      expect(frozen.experience).toBe(result.experienceBefore);

      if (expectedOutcome === "healing") {
        expect(result).toMatchObject({
          healing: 0,
          lifeAfter: frozen.life,
          blocked: true,
          blockReason: "frozen",
        });
        expect(result.prayerRolledAmount).toBeGreaterThanOrEqual(5);
        expect(result.prayerRolledAmount).toBeLessThanOrEqual(14);
      } else if (expectedOutcome === "experience") {
        expect(result.blocked).toBe(false);
        expect(result.experienceAfter).toBe(frozen.experience + result.prayerRolledAmount!);
      } else if (expectedOutcome === "attackUp") {
        expect(result.blocked).toBe(false);
        expect(result.statusesAfter.attackUp).toBe(3);
      } else {
        expect(result.blocked).toBe(false);
        expect(result.statusesAfter.defenseUp).toBe(3);
      }
    }
  });

  it("settles OJ recipients only after each presentation and spends the action at the end", () => {
    const seed = findPrayerSeed(3, (outcomes) => outcomes.length >= 2);
    const battle = new Stage0Battle(0, new DeterministicRng(seed));
    const actor = battle.unit("1:0")!;
    const allyTemplate = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    const enemy = battle.units.find((unit) => unit.side === 2)!;
    promoteForAction(actor, "prayer");
    actor.experience = classDefinition("prayer-guide").dataRows[2].experienceThreshold;
    actor.x = 4;
    actor.y = 3;
    const early = {
      ...allyTemplate,
      statuses: { ...allyTemplate.statuses },
      id: "oj-progress-early",
      x: 1,
      y: 1,
      life: Math.max(1, allyTemplate.life - 20),
    };
    const middle = {
      ...allyTemplate,
      statuses: { ...allyTemplate.statuses },
      id: "oj-progress-middle",
      x: 2,
      y: 2,
      life: Math.max(1, allyTemplate.life - 30),
    };
    battle.units = [actor, enemy, middle, early];
    const before = new Map(battle.units.map((unit) => [unit.id, {
      life: unit.life,
      experience: unit.experience,
      statuses: { ...unit.statuses },
    }]));

    const prepared = battle.prepareSpecialAction({ actionId: "prayer", actorId: actor.id });
    expect(prepared.affectedUnits.length).toBeGreaterThanOrEqual(2);
    expect(() => battle.commitPreparedPrayerOutcome(prepared, 1))
      .toThrow("stale prepared prayer action");
    expect(() => battle.commitPreparedAction(prepared))
      .toThrow("prayer uses progressive commit path");
    expect(actor.acted).toBe(false);
    expect({ state: battle.rng.state, calls: battle.rng.calls })
      .toEqual({ state: seed, calls: 0 });

    const first = battle.commitPreparedPrayerOutcome(prepared, 0);
    expect(battle.unit(first.unitId)).toMatchObject({
      life: first.lifeAfter,
      experience: first.experienceAfter,
      statuses: first.statusesAfter,
    });
    for (const pending of prepared.affectedUnits.slice(1)) {
      expect(battle.unit(pending.unitId)).toMatchObject(before.get(pending.unitId)!);
    }
    expect(actor.acted).toBe(false);
    expect({ state: battle.rng.state, calls: battle.rng.calls })
      .toEqual({ state: prepared.rngAfter, calls: prepared.rngCallsAfter });
    expect(() => battle.commitPreparedPrayerOutcome(prepared, 0))
      .toThrow("stale prepared prayer action");

    for (let index = 1; index < prepared.affectedUnits.length; index += 1) {
      battle.commitPreparedPrayerOutcome(prepared, index);
    }
    expect(actor.acted).toBe(false);
    expect(battle.completePreparedPrayer(prepared)).toBe(prepared.result);
    expect(actor.acted).toBe(true);
    expect(battle.focusId).toBe(prepared.affectedUnits.at(-1)?.unitId);
  });

  it("consumes only OJ gate rolls and the actor action when no unit passes", () => {
    const seed = findPrayerSeed(2, (outcomes) => outcomes.length === 0);
    const battle = new Stage0Battle(0, new DeterministicRng(seed));
    const actor = battle.unit("1:0")!;
    const ally = battle.units.find((unit) => unit.side === 1 && unit.id !== actor.id)!;
    promoteForAction(actor, "prayer");
    actor.experience = classDefinition("prayer-guide").dataRows[2].experienceThreshold;
    battle.units = [actor, ally];

    const prepared = battle.prepareSpecialAction({ actionId: "prayer", actorId: actor.id });
    expect(prepared.result.prayerEligibleUnitIds).toHaveLength(2);
    expect(prepared.affectedUnits).toEqual([]);
    expect(prepared.rngCallsAfter).toBe(2);
    expect({ state: battle.rng.state, calls: battle.rng.calls })
      .toEqual({ state: seed, calls: 0 });
    battle.completePreparedPrayer(prepared);
    expect(actor.acted).toBe(true);
    expect({ state: battle.rng.state, calls: battle.rng.calls })
      .toEqual({ state: prepared.rngAfter, calls: prepared.rngCallsAfter });
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
