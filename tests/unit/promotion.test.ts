import { describe, expect, it } from "vitest";
import {
  CLASS_IDS,
  classDefinition,
  classStatsFor,
  isPromotionEligible,
  promotionTargetsFor,
} from "../../src/game/content/classes";
import {
  PROMOTION_DIALOGUE_TEXT,
  promotionDialogueFor,
} from "../../src/game/content/promotion-dialogue";
import { createStage0Units } from "../../src/game/content/stage0";
import { promoteUnit, promotionQueue } from "../../src/game/simulation/promotion";

describe("evidence-backed class catalog and promotion", () => {
  it("contains all 39 native records and 31 ordered promotion edges", () => {
    expect(CLASS_IDS).toHaveLength(39);
    expect(CLASS_IDS.map((id) => classDefinition(id).nativeRecord)).toEqual(
      Array.from({ length: 39 }, (_, record) => record),
    );
    expect(CLASS_IDS.flatMap((id) => promotionTargetsFor(id))).toHaveLength(31);
    expect(promotionTargetsFor("soldier").map((target) => target.id)).toEqual([
      "cavalry",
      "warrior",
      "archer",
      "sister",
    ]);
  });

  it("uses each target profession's zero-experience stats and movement profile", () => {
    expect(classStatsFor({ classId: "cavalry", experience: 0 })).toEqual({
      attack: 55,
      defense: 30,
      maxLife: 200,
      movement: 8,
      level: 1,
    });
    expect(classStatsFor({ classId: "warrior", experience: 0 })).toMatchObject({
      attack: 50,
      defense: 32,
      maxLife: 200,
      movement: 6,
      level: 1,
    });
    expect(classStatsFor({ classId: "archer", experience: 0 })).toMatchObject({
      attack: 48,
      defense: 28,
      maxLife: 200,
      movement: 6,
      level: 1,
    });
    expect(classStatsFor({ classId: "sister", experience: 0 })).toMatchObject({
      attack: 47,
      defense: 30,
      maxLife: 200,
      movement: 5,
      level: 1,
    });

    for (const classId of ["cavalry", "warrior", "archer", "sister"] as const) {
      const unit = createStage0Units().find((candidate) => candidate.id === "1:0")!;
      unit.experience = 300;
      expect(promoteUnit(unit, classId)).toMatchObject({ classId });
      expect(unit).toMatchObject({ classId, experience: 0 });
    }
  });

  it("only queues eligible side-1 units in row-major board order", () => {
    const units = createStage0Units();
    const nia = units.find((unit) => unit.id === "1:0")!;
    const ximi = units.find((unit) => unit.id === "1:1")!;
    const enemy = units.find((unit) => unit.id === "2:48")!;
    nia.experience = 300;
    nia.x = 20;
    nia.y = 30;
    ximi.experience = 300;
    ximi.x = 30;
    ximi.y = 20;
    enemy.experience = 300;

    expect(isPromotionEligible(nia)).toBe(true);
    expect(isPromotionEligible(enemy)).toBe(false);
    expect(promotionQueue(units, 50)).toEqual(["1:1", "1:0"]);
  });

  it("uses the native Nia and teammate pre-promotion dialogue branches", () => {
    const units = createStage0Units();
    const nia = units.find((unit) => unit.id === "1:0")!;
    const ximi = units.find((unit) => unit.id === "1:1")!;

    expect(promotionDialogueFor(nia)).toEqual([
      expect.objectContaining({
        activeSlot: "upper",
        upper: {
          text: PROMOTION_DIALOGUE_TEXT.niaQuestion,
          portrait: 46,
          speaker: "妮雅",
        },
        source: { record: "promotion", wait: 1, address: "0000:0487" },
      }),
    ]);

    const teammatePages = promotionDialogueFor(ximi);
    expect(teammatePages).toHaveLength(2);
    expect(teammatePages[0]).toMatchObject({
      activeSlot: "lower",
      lower: {
        text: PROMOTION_DIALOGUE_TEXT.teammateRequest,
        portrait: 45,
        speaker: "希蜜",
      },
    });
    expect(teammatePages[1]).toMatchObject({
      activeSlot: "upper",
      upper: {
        text: PROMOTION_DIALOGUE_TEXT.niaGrant,
        portrait: 46,
        speaker: "妮雅",
      },
      lower: teammatePages[0]?.lower,
    });
  });

  it("uses the on-field commander when Nia is absent from the battle", () => {
    const units = createStage0Units();
    const himi = units.find((unit) => unit.id === "1:1")!;
    const teammate = units.find((unit) => unit.id === "1:40")!;

    expect(promotionDialogueFor(himi, himi)).toEqual([
      expect.objectContaining({
        activeSlot: "upper",
        upper: {
          text: PROMOTION_DIALOGUE_TEXT.niaQuestion,
          portrait: 45,
          speaker: "希蜜",
        },
      }),
    ]);

    const pages = promotionDialogueFor(teammate, himi);
    expect(pages[0]?.lower).toMatchObject({ speaker: teammate.name });
    expect(pages[1]?.upper).toMatchObject({
      text: PROMOTION_DIALOGUE_TEXT.niaGrant,
      portrait: 45,
      speaker: "希蜜",
    });
  });

  it("atomically changes class and clears experience without healing or spending PRNG", () => {
    const nia = createStage0Units().find((unit) => unit.id === "1:0")!;
    nia.experience = 307;
    nia.life = 123;
    nia.acted = true;
    const originalPosition = { x: nia.x, y: nia.y };

    const result = promoteUnit(nia, "cavalry");

    expect(result).toMatchObject({
      unitId: "1:0",
      previousClassId: "soldier",
      classId: "cavalry",
      previousExperience: 307,
      life: 123,
      stats: { attack: 55, defense: 30, maxLife: 200, movement: 8, level: 1 },
    });
    expect(nia).toMatchObject({
      classId: "cavalry",
      className: "騎兵",
      experience: 0,
      life: 123,
      acted: true,
      ...originalPosition,
    });
  });

  it("rejects cancellation-by-invalid-target and enemies", () => {
    const units = createStage0Units();
    const nia = units.find((unit) => unit.id === "1:0")!;
    const enemy = units.find((unit) => unit.id === "2:48")!;
    nia.experience = 300;
    enemy.experience = 300;

    expect(() => promoteUnit(nia, "crossbow")).toThrow("不是");
    expect(() => promoteUnit(enemy, "cavalry")).toThrow("不能轉職");
  });
});
