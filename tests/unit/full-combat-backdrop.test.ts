import { describe, expect, it } from "vitest";
import {
  FULL_COMBAT_BACKDROP_INITIAL_PHASES,
  advanceFullCombatBackdropPhases,
  fullCombatBackdropLayerOffsets,
  fullCombatBackdropSourcePixel,
  type FullCombatBackdropPhases,
} from "../../src/game/full-combat-backdrop";
import { buildFullCombatScript, type FullCombatScript } from "../../src/game/full-combat";
import { className } from "../../src/game/content/classes";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { AttackResult, BattleUnit, UnitClassId } from "../../src/game/types";

const unit = (side: 1 | 2, classId: UnitClassId): BattleUnit => ({
  id: `${side}:0`,
  side,
  slot: 0,
  classId,
  className: className(classId),
  name: side === 1 ? "我方" : "敵方",
  portrait: side === 1 ? 46 : 47,
  x: side === 1 ? 24 : 25,
  y: 26,
  life: 260,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: emptyUnitStatuses(),
});

/** Both strikes land for more than 10 and nobody dies, as in both captured battles. */
const exchange = (
  attackerClass: UnitClassId,
  defenderClass: UnitClassId,
  from: FullCombatBackdropPhases,
): FullCombatScript => {
  const attacker = unit(1, attackerClass);
  const defender = unit(2, defenderClass);
  const result: AttackResult = {
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: 24,
    counterDamage: 15,
    counterOccurred: true,
    defenderDied: false,
    attackerDied: false,
    experienceGained: 1,
    counterExperienceGained: 1,
  };
  return buildFullCombatScript(attacker, defender, result, 5, from);
};

const markTime = (script: FullCombatScript, phase: string): number => {
  const mark = script.marks.find((entry) => entry.phase === phase);
  if (!mark) throw new Error(`missing ${phase} mark`);
  return mark.t;
};
/** The first strike substep composes 40 ms after its step starts. */
const STRIKE_SUBSTEP = 40;

describe("module 29 backdrop phases (REMAKE-169)", () => {
  it("advances the five layers by 1..5 bytes and writes the reset outright", () => {
    expect(advanceFullCombatBackdropPhases(FULL_COMBAT_BACKDROP_INITIAL_PHASES, 1, 1))
      .toEqual([1, 2, 3, 4, 5]);
    expect(advanceFullCombatBackdropPhases(FULL_COMBAT_BACKDROP_INITIAL_PHASES, 0, 9))
      .toEqual([0, 0, 0, 0, 0]);
    // The 3- and 5-byte layers overshoot the 56-byte row and restart at 0:
    // 57 -> 0 after 19 updates, 60 -> 0 after 12.
    expect(advanceFullCombatBackdropPhases(FULL_COMBAT_BACKDROP_INITIAL_PHASES, 1, 12)[4]).toBe(0);
    expect(advanceFullCombatBackdropPhases(FULL_COMBAT_BACKDROP_INITIAL_PHASES, 1, 19)[2]).toBe(0);
    // :L leaves a layer that reaches 0 or below at a full row instead of 0.
    expect(advanceFullCombatBackdropPhases([1, 2, 3, 4, 5], -1, 1)).toEqual([56, 56, 56, 56, 56]);
    expect(advanceFullCombatBackdropPhases([1, 2, 2, 4, 1], -1, 1)).toEqual([56, 56, 56, 56, 56]);
    // ...and the next :R truncates that full row straight back to 0.
    expect(advanceFullCombatBackdropPhases([56, 56, 56, 56, 56], 1, 1)).toEqual([0, 0, 0, 0, 0]);
  });

  it("starts the far layer 16 px into its rows and lets linear layers spill a row", () => {
    expect(fullCombatBackdropLayerOffsets(FULL_COMBAT_BACKDROP_INITIAL_PHASES))
      .toEqual([16, 0, 0, 0, 0]);
    expect(fullCombatBackdropLayerOffsets([54, 56, 56, 56, 56])).toEqual([0, 448, 448, 448, 448]);
    // Far layer: the phase-0 buffer column x shows record column x + 16.
    expect(fullCombatBackdropSourcePixel(0, 0, FULL_COMBAT_BACKDROP_INITIAL_PHASES))
      .toEqual({ x: 16, y: 0 });
    expect(fullCombatBackdropSourcePixel(440, 111, FULL_COMBAT_BACKDROP_INITIAL_PHASES))
      .toEqual({ x: 8, y: 111 });
    // Near layers read one byte run: past the row end they continue into the
    // next record row, and a full-row phase shows the next row outright.
    expect(fullCombatBackdropSourcePixel(0, 112, [0, 52, 0, 0, 0])).toEqual({ x: 416, y: 112 });
    expect(fullCombatBackdropSourcePixel(32, 112, [0, 52, 0, 0, 0])).toEqual({ x: 0, y: 113 });
    expect(fullCombatBackdropSourcePixel(5, 146, [56, 56, 56, 56, 56])).toEqual({ x: 5, y: 147 });
    // Row 150 is presented only under YD and never composed.
    expect(fullCombatBackdropSourcePixel(0, 150, FULL_COMBAT_BACKDROP_INITIAL_PHASES)).toBeUndefined();
  });

  it("replays the first captured stage-0 battle substep by substep", () => {
    // Soldier (left) strikes soldier (right), who counters. Capture frames
    // 61/63/67 show the first three :R updates; 139 the primary hold; 286 on
    // the end of the counter with every near layer at a full row.
    const script = exchange("soldier", "soldier", FULL_COMBAT_BACKDROP_INITIAL_PHASES);
    const charge = markTime(script, "fullCharge");
    expect(script.sample(markTime(script, "fullOpen")).backdropPhases).toEqual([0, 0, 0, 0, 0]);
    expect(script.sample(charge).backdropPhases).toEqual([0, 0, 0, 0, 0]);
    expect(script.sample(charge + STRIKE_SUBSTEP).backdropPhases).toEqual([1, 2, 3, 4, 5]);
    expect(script.sample(charge + 2 * STRIKE_SUBSTEP).backdropPhases).toEqual([2, 4, 6, 8, 10]);
    expect(script.sample(charge + 3 * STRIKE_SUBSTEP).backdropPhases).toEqual([3, 6, 9, 12, 15]);
    expect(script.sample(markTime(script, "fullHold")).backdropPhases).toEqual([26, 52, 21, 48, 10]);
    expect(script.sample(markTime(script, "fullCounterHold")).backdropPhases)
      .toEqual([56, 56, 56, 56, 56]);
    expect(script.finalBackdropPhases).toEqual([56, 56, 56, 56, 56]);
  });

  it("carries the phases into the second captured battle and loses its first step", () => {
    const first = exchange("soldier", "soldier", FULL_COMBAT_BACKDROP_INITIAL_PHASES);
    // Soldier (left) strikes cavalry (right), whose lance counter pans back.
    const second = exchange("soldier", "cavalry", first.finalBackdropPhases);
    const charge = markTime(second, "fullCharge");
    // Capture frames 843..867: the near layers still read one row down.
    expect(second.sample(markTime(second, "fullOpen")).backdropPhases).toEqual([56, 56, 56, 56, 56]);
    expect(second.sample(charge).backdropPhases).toEqual([56, 56, 56, 56, 56]);
    // Frame 868: the first :R only truncates 56 to 0, so the far layer stays;
    // frame 871 is its first visible step, one substep later than battle 1.
    expect(second.sample(charge + STRIKE_SUBSTEP).backdropPhases).toEqual([0, 0, 0, 0, 0]);
    expect(second.sample(charge + 2 * STRIKE_SUBSTEP).backdropPhases).toEqual([1, 2, 3, 4, 5]);
    // Frame 947 (primary hold) and frame 1122 (after the 45-update lance counter).
    expect(second.sample(markTime(second, "fullHold")).backdropPhases).toEqual([25, 50, 18, 44, 5]);
    expect(second.finalBackdropPhases).toEqual([36, 16, 53, 32, 16]);
  });

  it("sends a fresh right-side strike to a full row on its first :L update", () => {
    const attacker = unit(2, "soldier");
    const defender = unit(1, "soldier");
    const script = buildFullCombatScript(attacker, defender, {
      attackerId: attacker.id,
      defenderId: defender.id,
      damage: 24,
      counterDamage: 0,
      counterOccurred: false,
      defenderDied: false,
      attackerDied: false,
      experienceGained: 1,
      counterExperienceGained: 0,
    }, 5);
    const charge = markTime(script, "fullCharge");
    expect(script.sample(charge).backdropPhases).toEqual([0, 0, 0, 0, 0]);
    expect(script.sample(charge + STRIKE_SUBSTEP).backdropPhases).toEqual([56, 56, 56, 56, 56]);
    expect(script.sample(charge + 2 * STRIKE_SUBSTEP).backdropPhases).toEqual([55, 54, 53, 52, 51]);
    expect(script.sample(markTime(script, "fullHold")).backdropPhases).toEqual([31, 6, 38, 12, 51]);
  });

  it("keeps the camera travel and the far layer in step", () => {
    const script = exchange("soldier", "soldier", FULL_COMBAT_BACKDROP_INITIAL_PHASES);
    for (let t = markTime(script, "fullWindup"); t <= script.duration; t += 10) {
      const scene = script.sample(t);
      expect(((scene.camera / 8) % 56 + 56) % 56).toBe(scene.backdropPhases[0] % 56);
    }
  });
});
