import { describe, expect, it } from "vitest";
import { buildFullCombatScript, type FullCombatPhaseName, type FullCombatScript } from "../../src/game/full-combat";
import type { AttackResult, BattleUnit, UnitClassId } from "../../src/game/types";

const unit = (
  side: 1 | 2,
  slot: number,
  name: string,
  classId: UnitClassId = 0,
): BattleUnit => ({
  id: `${side}:${slot}`,
  side,
  slot,
  classId,
  className: classId === 22 ? "騎兵" : "士兵",
  name,
  portrait: classId === 22 ? 15 : side === 1 ? 46 : 47,
  x: side === 1 ? 24 : 25,
  y: 26,
  life: side === 1 ? 160 : 180,
  experience: 0,
  acted: false,
});

const result = (overrides: Partial<AttackResult> = {}): AttackResult => ({
  attackerId: "1:0",
  defenderId: "2:48",
  damage: 24,
  counterDamage: 8,
  counterOccurred: true,
  defenderDied: false,
  attackerDied: false,
  experienceGained: 12,
  ...overrides,
});

function markTime(script: FullCombatScript, phase: FullCombatPhaseName): number {
  const mark = script.marks.find((entry) => entry.phase === phase);
  if (!mark) throw new Error(`Missing full-combat mark: ${phase}`);
  return mark.t;
}

describe("Full-screen ordinary combat choreography", () => {
  it("hands the camera to the recoiling defender before the primary hold", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result(),
    );
    const impact = script.sample(markTime(script, "fullImpact"));
    const hold = script.sample(markTime(script, "fullHold"));
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    const holdVictim = hold.sprites.find(({ set }) => set === "direct");

    expect(hold.camera).toBeGreaterThan(impact.camera);
    expect((holdVictim?.x ?? 0) - (impactVictim?.x ?? 0)).toBeGreaterThanOrEqual(12);
    expect((hold.damage?.x ?? 0) - (impact.damage?.x ?? 0)).toBeGreaterThanOrEqual(12);
    expect(hold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();

    const counterImpact = script.sample(markTime(script, "fullCounterImpact"));
    const counterHold = script.sample(markTime(script, "fullCounterHold"));
    const counterImpactVictim = counterImpact.sprites.find(({ set }) => set === "direct");
    const counterHoldVictim = counterHold.sprites.find(({ set }) => set === "direct");

    expect(counterHold.camera).toBeLessThan(counterImpact.camera);
    expect((counterHoldVictim?.x ?? 0) - (counterImpactVictim?.x ?? 0)).toBeLessThanOrEqual(-12);
    expect(counterHold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
  });

  it("opens the native panels and stage in their measured order", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );

    expect(script.sample(0)).toMatchObject({
      showRightPanel: true,
      showLeftPanel: false,
      showWindow: false,
      showScene: false,
      sprites: [],
    });
    expect(script.sample(90)).toMatchObject({
      showRightPanel: true,
      showLeftPanel: true,
      showWindow: false,
      showScene: false,
    });
    expect(script.sample(180)).toMatchObject({
      showWindow: true,
      showScene: false,
    });
    expect(script.sample(599).showScene).toBe(false);
    expect(script.sample(600)).toMatchObject({
      showScene: true,
      camera: 0,
      sprites: [{ set: "plus50", frame: 0 }],
    });

    const chargeAt = markTime(script, "fullCharge");
    const impactAt = markTime(script, "fullImpact");
    const charge = script.sample((chargeAt + impactAt) / 2);
    const beforeReveal = script.sample(impactAt - 331);
    const enteringVictim = script.sample(impactAt - 200);

    expect(charge.camera).toBeGreaterThan(0);
    expect(charge.dust.length).toBeGreaterThan(0);
    expect(beforeReveal.sprites.some(({ set }) => set === "direct")).toBe(false);
    expect(enteringVictim.sprites.some(({ set }) => set === "direct")).toBe(true);
  });

  it("keeps the fatal victim through the native blink and fade sequence", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({
        counterOccurred: false,
        counterDamage: 0,
        defenderDied: true,
      }),
    );
    const holdAt = markTime(script, "fullDefenderDeath");

    expect(script.marks.some(({ phase }) => phase.startsWith("fullCounter"))).toBe(false);
    expect(script.cues.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
    expect(script.sample(holdAt + 100).sprites.find(({ set }) => set === "direct")?.frame).toBe(1);
    expect(script.sample(holdAt + 300).sprites.find(({ set }) => set === "direct")?.opacity).toBe(1);
    expect(script.sample(holdAt + 500).sprites.find(({ set }) => set === "direct")?.opacity).toBe(.45);
    expect(script.sample(holdAt + 1_330).sprites.find(({ set }) => set === "direct")?.opacity).toBeLessThan(1);
    expect(script.sample(holdAt + 1_460).sprites.find(({ set }) => set === "direct")).toBeUndefined();
    expect(script.sample(script.duration + 100).camera).toBe(208);
  });

  it("uses the cavalry throw channel without melee dust", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "哈釘", 22),
      unit(2, 48, "騎士團騎兵", 22),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const windupAt = markTime(script, "fullWindup");
    const throwAt = markTime(script, "fullCharge");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(windupAt + 10).sprites.find(({ set }) => set === "plus50")?.frame).toBe(1);
    expect(script.sample(windupAt + 200).sprites.find(({ set }) => set === "plus50")?.frame).toBe(2);
    expect(script.sample(windupAt + 400).sprites.find(({ set }) => set === "plus50")?.frame).toBe(3);
    expect(script.sample(throwAt + 50).sprites.find(({ set }) => set === "plus50")?.frame).toBe(4);

    const earlyLance = script.sample(throwAt + 120);
    const middleLance = script.sample((throwAt + impactAt) / 2);
    const lateLance = script.sample(impactAt - 20);
    expect(earlyLance.lance?.frame).toBe(6);
    expect(middleLance.lance?.frame).toBe(7);
    expect(lateLance.lance?.frame).toBe(8);
    expect(middleLance.dust).toEqual([]);
    expect(script.sample(throwAt + 300).sprites.find(({ set }) => set === "plus50")?.mirror).toBe(true);
    expect(script.sample(impactAt).lance).toBeUndefined();
    expect(script.sample(impactAt + 241).sprites.find(({ set }) => set === "direct")?.frame).toBe(2);
    expect(script.sample(holdAt).sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(script.cues.some(({ reason }) => reason === "full-primary-lance-throw")).toBe(true);

    const mirrored = buildFullCombatScript(
      unit(2, 15, "哈釘", 22),
      unit(1, 0, "妮雅"),
      result({
        attackerId: "2:15",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredImpact = mirrored.sample(markTime(mirrored, "fullImpact"));
    expect(mirroredImpact.camera).toBeLessThan(0);
    expect(mirroredImpact.sprites.find(({ set }) => set === "direct")?.side).toBe("left");
  });
});
