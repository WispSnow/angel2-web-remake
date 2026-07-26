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
  it("keeps the struck unit fixed on screen while the native camera recoil completes", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result(),
    );
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");
    const impact = script.sample(impactAt);
    const apex = script.sample(impactAt + 180);
    const hold = script.sample(holdAt);
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    const apexVictim = apex.sprites.find(({ set }) => set === "direct");
    const holdVictim = hold.sprites.find(({ set }) => set === "direct");

    expect(hold.camera - impact.camera).toBe(64);
    expect(apexVictim).toMatchObject({ x: impactVictim?.x, lift: 12 });
    expect(holdVictim).toMatchObject({ x: impactVictim?.x, lift: 0 });
    expect(hold.damage?.x).toBe(impact.damage?.x);
    expect(hold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();

    const counterImpactAt = markTime(script, "fullCounterImpact");
    const counterImpact = script.sample(counterImpactAt);
    const counterApex = script.sample(counterImpactAt + 180);
    const counterHold = script.sample(markTime(script, "fullCounterHold"));
    const counterImpactVictim = counterImpact.sprites.find(({ set }) => set === "direct");
    const counterApexVictim = counterApex.sprites.find(({ set }) => set === "direct");
    const counterHoldVictim = counterHold.sprites.find(({ set }) => set === "direct");

    expect(counterHold.camera - counterImpact.camera).toBe(-64);
    expect(counterApexVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
    expect(counterHoldVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
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
    expect(script.cues.some(({ record, reason }) => record === 2 && reason === "full-primary-hurt")).toBe(true);
    expect(script.cues.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
    expect(script.sample(holdAt - 40).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 1,
      reaction: "hurt",
      lift: 4,
    });
    expect(script.sample(holdAt).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 2,
      reaction: "death",
      lift: 0,
    });
    expect(script.sample(holdAt + 100).sprites.find(({ set }) => set === "direct")?.opacity).toBe(1);
    expect(script.sample(holdAt + 200).sprites.find(({ set }) => set === "direct")?.opacity).toBe(.45);
    expect(script.sample(holdAt + 1_100).sprites.find(({ set }) => set === "direct")?.opacity).toBeLessThan(1);
    expect(script.sample(holdAt + 1_210).sprites.find(({ set }) => set === "direct")).toBeUndefined();
    expect(script.sample(script.duration + 100).camera).toBe(208);

    const lowDamageDeath = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({
        damage: 10,
        counterOccurred: false,
        counterDamage: 0,
        defenderDied: true,
      }),
    );
    expect(lowDamageDeath.cues.some(({ record, reason }) => record === 0 && reason === "full-primary-guard")).toBe(true);
    expect(lowDamageDeath.cues.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
    const lowDamageDeathAt = markTime(lowDamageDeath, "fullDefenderDeath");
    expect(lowDamageDeath.sample(lowDamageDeathAt - 40).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 3,
      reaction: "guard",
      lift: 0,
    });
    expect(lowDamageDeath.sample(lowDamageDeathAt).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 2,
      reaction: "death",
      lift: 0,
    });
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
    const impact = script.sample(impactAt);
    const firstApex = script.sample(impactAt + 100);
    const reboundApex = script.sample(impactAt + 550);
    const hold = script.sample(holdAt);
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    expect(firstApex.sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 1,
      reaction: "hurt",
      x: impactVictim?.x,
      lift: 36,
    });
    expect(reboundApex.sprites.find(({ set }) => set === "direct")).toMatchObject({
      x: impactVictim?.x,
      lift: 24,
    });
    expect(hold.camera - impact.camera).toBe(112);
    expect(hold.sprites.find(({ set }) => set === "direct")).toMatchObject({
      x: impactVictim?.x,
      lift: 0,
    });
    expect(hold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(script.cues.some(({ reason }) => reason === "full-primary-lance-throw")).toBe(true);
    expect(script.cues.some(({ record, reason }) => record === 38 && reason.startsWith("full-primary"))).toBe(false);

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

  it.each([
    { damage: 10, expectedFrame: 3, expectedReaction: "guard", expectedRecord: 0, label: "standing guard" },
    { damage: 11, expectedFrame: 1, expectedReaction: "hurt", expectedRecord: 2, label: "ordinary hit" },
  ] as const)("uses the $label reaction for $damage damage", ({
    damage,
    expectedFrame,
    expectedReaction,
    expectedRecord,
  }) => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({ damage, counterOccurred: false, counterDamage: 0 }),
    );

    expect(script.sample(markTime(script, "fullHold")).sprites.find(({ set }) => set === "direct"))
      .toMatchObject({ frame: expectedFrame, reaction: expectedReaction });
    expect(script.cues.some(({ record, reason }) =>
      record === expectedRecord && reason === `full-primary-${expectedReaction}`)).toBe(true);
    expect(script.cues.filter(({ record }) => record === 14)).toHaveLength(1);
  });
});
