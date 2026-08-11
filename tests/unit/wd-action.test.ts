import { beforeAll, describe, expect, it } from "vitest";
import * as actionContent from "../../src/game/content/stage1-actions.generated";
import { BATTLE_ACTION_DEFINITIONS, registerActionContent } from "../../src/game/content/actions";
import { classStatsFor } from "../../src/game/content/classes";
import { prepareSpecialAction } from "../../src/game/simulation/actions/resolve";
import { expertSpecialUtility } from "../../src/game/simulation/expert-ai";
import { DeterministicRng } from "../../src/game/simulation/rng";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { BattleUnit, UnitClassId } from "../../src/game/types";

const unit = (
  id: string,
  side: 1 | 2,
  classId: UnitClassId,
  x: number,
  y: number,
  life: number,
): BattleUnit => ({
  id,
  side,
  slot: Number(id.split(":")[1] ?? 0),
  classId,
  className: classId,
  name: id,
  portrait: side === 1 ? 46 : 66,
  x,
  y,
  life,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: emptyUnitStatuses(),
});

const battlefield = {
  width: 12,
  height: 12,
  terrainSlotAt: () => 1,
};

beforeAll(() => registerActionContent(actionContent));

describe("WD path attack", () => {
  it("keeps the target-to-source line, damages only the target side, and preserves magic guard", () => {
    const actor = unit("2:28", 2, "dragon", 1, 1, 2_000);
    const target = unit("1:0", 1, "cavalry", 4, 1, 120);
    const guarded = unit("1:1", 1, "sister", 3, 1, 100);
    guarded.statuses.magicGuard = 3;
    const frozen = unit("1:2", 1, "sister", 2, 1, 100);
    frozen.actionDisabled = true;
    frozen.statuses.magicGuard = 2;
    const friendlyIntermediary = unit("2:40", 2, "half-dragon-warrior", 2, 1, 300);
    const units = [actor, target, guarded, frozen, friendlyIntermediary];
    const rng = new DeterministicRng(0x1234_5678);

    const prepared = prepareSpecialAction(
      { actionId: "wd", actorId: actor.id, targetId: target.id, target },
      actor,
      target,
      rng,
      {
        units,
        battlefield,
        statsFor: (candidate) => classStatsFor(candidate),
      },
      target,
    );

    expect(BATTLE_ACTION_DEFINITIONS.wd).toMatchObject({
      nativeCode: "WD",
      range: { selectionRadius: 10 },
      damage: { perEligibleLineCell: 90, clearsMagicGuard: false },
      presentationId: "wd",
    });
    expect(prepared.result.effectCells.map(({ position }) => position)).toEqual([
      { x: 4, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 },
    ]);
    expect(prepared.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: target.id, damage: 90, lifeAfter: 30, blocked: false }),
      expect.objectContaining({
        unitId: guarded.id,
        damage: 0,
        lifeAfter: 100,
        blocked: true,
        blockReason: "magicGuard",
        statusesAfter: expect.objectContaining({ magicGuard: 3 }),
      }),
    ]));
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === frozen.id)).toBe(false);
    expect(frozen).toMatchObject({ life: 100, actionDisabled: true, statuses: { magicGuard: 2 } });
    expect(prepared.result.affectedUnits.some(({ unitId }) => unitId === friendlyIntermediary.id)).toBe(false);
    expect(prepared.actorExperienceAfter).toBe(prepared.actorExperienceBefore);
    expect(prepared.rngCallsAfter).toBe(prepared.rngCallsBefore);
    expect(expertSpecialUtility({
      ...battlefield,
      units,
      statsFor: (candidate) => classStatsFor(candidate),
      effectiveStatsFor: (candidate) => classStatsFor(candidate),
    }, actor, "wd", target, [actor])).toMatchObject({
      effectiveDamage: 90,
      support: 0,
      waste: 0,
    });
  });

  it("rejects a frozen selected target under REMAKE-013", () => {
    const actor = unit("2:28", 2, "dragon", 1, 1, 2_000);
    const target = unit("1:0", 1, "cavalry", 4, 1, 120);
    target.actionDisabled = true;
    const rng = new DeterministicRng(0x1234_5678);

    expect(() => prepareSpecialAction(
      { actionId: "wd", actorId: actor.id, targetId: target.id, target },
      actor,
      target,
      rng,
      {
        units: [actor, target],
        battlefield,
        statsFor: (candidate) => classStatsFor(candidate),
      },
      target,
    )).toThrow("WD cannot target a frozen unit");
  });

  it("uses the serialized gameplay RNG only when equal predecessors exist", () => {
    const actor = unit("2:28", 2, "dragon", 1, 1, 2_000);
    const target = unit("1:0", 1, "cavalry", 2, 2, 120);
    const prepare = (seed: number) => prepareSpecialAction(
      { actionId: "wd", actorId: actor.id, targetId: target.id, target },
      actor,
      target,
      new DeterministicRng(seed),
      {
        units: [actor, target],
        battlefield,
        statsFor: (candidate) => classStatsFor(candidate),
      },
      target,
    );

    const first = prepare(0xcafe_babe);
    const replay = prepare(0xcafe_babe);
    expect(first.result.effectCells).toEqual(replay.result.effectCells);
    expect(first.rngCallsAfter - first.rngCallsBefore).toBe(1);
    expect(first.rngAfter).toBe(replay.rngAfter);
  });
});
