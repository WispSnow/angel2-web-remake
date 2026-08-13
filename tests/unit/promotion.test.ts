import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASS_IDS,
  classDefinition,
  classFallbackPortraitFor,
  className,
  classStatsFor,
  isPromotionEligible,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
  unitDisplayName,
} from "../../src/game/content/classes";
import {
  PROMOTION_DIALOGUE_TEXT,
  PROMOTION_DIALOGUE_TEXT_INSETS,
  promotionDialogueFor,
} from "../../src/game/content/promotion-dialogue";
import { allyMapUnitAsset } from "../../src/game/content/map-unit-assets";
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

  it("publishes an allied map figure for every legal promotion target", () => {
    const targets = new Set(CLASS_IDS.flatMap((id) =>
      promotionTargetsFor(id).map((target) => target.id)));

    expect(targets.size).toBe(31);
    for (const classId of targets) {
      const source = allyMapUnitAsset(classId);
      expect(source, classId)
        .toMatch(/^\/assets\/original\/.+\/ally-.+\.png$|^\/assets\/original\/unit-ally-.+\.png$/u);
      if (!source) throw new Error(`${classId} has no allied map figure`);
      expect(existsSync(resolve("public", source.slice(1))), classId).toBe(true);
    }
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

  it("uses the first post-third-row growth threshold instead of DATA row four", () => {
    const expectedThresholds = new Map([
      ["soldier", 300],
      ["magician", 800],
      ["land-knight", 840],
      ["archer", 480],
      ["cavalry", 460],
      ["pegasus-warrior", 940],
      ["sister", 520],
      ["monk", 760],
      ["divine-sword-warrior", 1000],
      ["warrior", 500],
      ["steel-armor-warrior", 960],
      ["priest", 780],
    ] as const);

    for (const [classId, threshold] of expectedThresholds) {
      const definition = classDefinition(classId);
      expect(promotionExperienceThresholdFor(classId), classId).toBe(threshold);
      expect(definition.promotion.triggerGrowthRow, classId).toBe(4);
      expect(definition.promotion.triggerExperienceThreshold, classId).toBe(threshold);
      expect(classStatsFor({ classId, experience: threshold - 1, side: 1 }).level, classId)
        .toBe(3);
      expect(classStatsFor({ classId, experience: threshold, side: 1 }).level, classId)
        .toBe(4);
      expect(isPromotionEligible({ side: 1, classId, experience: threshold - 1 }), classId)
        .toBe(false);
      expect(isPromotionEligible({ side: 1, classId, experience: threshold }), classId)
        .toBe(true);
      expect(isPromotionEligible({ side: 2, classId, experience: threshold }), classId)
        .toBe(false);

      if (classId !== "soldier") {
        expect(definition.promotion.dataRow4ExperienceThreshold, classId).not.toBe(threshold);
      }
    }
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
          textInset: PROMOTION_DIALOGUE_TEXT_INSETS.upper,
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
        textInset: PROMOTION_DIALOGUE_TEXT_INSETS.lower,
      },
    });
    expect(teammatePages[1]).toMatchObject({
      activeSlot: "upper",
      upper: {
        text: PROMOTION_DIALOGUE_TEXT.niaGrant,
        portrait: 46,
        speaker: "妮雅",
        textInset: PROMOTION_DIALOGUE_TEXT_INSETS.upper,
      },
      lower: teammatePages[0]?.lower,
    });
  });

  it("labels generic promotion dialogue with the actual current profession", () => {
    const generic = createStage0Units().find((unit) => unit.id === "1:40");
    if (!generic) throw new Error("generic promotion fixture is missing");
    generic.classId = "land-knight";
    generic.className = className(generic.classId);
    generic.name = "騎兵";
    const landKnightPortrait = classFallbackPortraitFor(generic.classId, 1);
    if (landKnightPortrait === undefined) throw new Error("land knight portrait is missing");
    generic.portrait = landKnightPortrait;

    expect(unitDisplayName(generic)).toBe("陸戰騎士");
    expect(promotionDialogueFor(generic)[0]?.lower).toMatchObject({
      portrait: generic.portrait,
      speaker: "陸戰騎士",
    });

    generic.classId = "steel-armor-warrior";
    generic.className = className(generic.classId);
    generic.name = "戰士";
    const steelArmorPortrait = classFallbackPortraitFor(generic.classId, 1);
    if (steelArmorPortrait === undefined) throw new Error("steel armor portrait is missing");
    generic.portrait = steelArmorPortrait;
    expect(promotionDialogueFor(generic)[0]?.lower?.speaker).toBe("鋼甲戰士");
  });

  it("keeps a named actor visible while her portrait follows the current profession", () => {
    const actor = createStage0Units().find((unit) => unit.id === "1:40");
    if (!actor) throw new Error("named class-portrait fixture is missing");
    actor.classId = "cavalry";
    actor.className = className(actor.classId);
    actor.name = "愛莉歐拉";
    actor.displayIdentity = "named-class-portrait";
    const portrait = classFallbackPortraitFor(actor.classId, 1);
    if (portrait === undefined) throw new Error("cavalry portrait is missing");
    actor.portrait = portrait;
    actor.experience = promotionExperienceThresholdFor(actor.classId);

    expect(unitDisplayName(actor)).toBe("愛莉歐拉");
    promoteUnit(actor, "land-knight");
    expect(actor).toMatchObject({
      classId: "land-knight",
      className: "陸戰騎士",
      name: "愛莉歐拉",
      portrait: classFallbackPortraitFor("land-knight", 1),
      displayIdentity: "named-class-portrait",
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
          textInset: PROMOTION_DIALOGUE_TEXT_INSETS.upper,
        },
      }),
    ]);

    const pages = promotionDialogueFor(teammate, himi);
    expect(pages[0]?.lower).toMatchObject({ speaker: teammate.name });
    expect(pages[1]?.upper).toMatchObject({
      text: PROMOTION_DIALOGUE_TEXT.niaGrant,
      portrait: 45,
      speaker: "希蜜",
      textInset: PROMOTION_DIALOGUE_TEXT_INSETS.upper,
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
      portrait: 46,
      experience: 0,
      life: 123,
      acted: true,
      ...originalPosition,
    });
  });

  it("updates class-fallback portraits on promotion without replacing named portraits", () => {
    const units = createStage0Units();
    const generic = units.find((unit) => unit.id === "1:40")!;
    const nia = units.find((unit) => unit.id === "1:0")!;
    generic.experience = 300;
    nia.experience = 300;

    promoteUnit(generic, "warrior");
    promoteUnit(nia, "warrior");

    expect(generic).toMatchObject({
      classId: "warrior",
      className: "戰士",
      name: "戰士",
      portrait: 57,
    });
    expect(nia).toMatchObject({
      classId: "warrior",
      className: "戰士",
      name: "妮雅",
      portrait: 46,
    });
  });

  it("keeps generic names synchronized through every promotion edge", () => {
    const template = createStage0Units().find((candidate) => candidate.id === "1:40");
    if (!template) throw new Error("generic promotion fixture is missing");
    for (const sourceClassId of CLASS_IDS) {
      for (const target of promotionTargetsFor(sourceClassId)) {
        const threshold = promotionExperienceThresholdFor(sourceClassId);
        const portrait = classFallbackPortraitFor(sourceClassId, 1);
        if (portrait === undefined) throw new Error(`${sourceClassId} has no generic portrait`);
        const unit = {
          ...template,
          classId: sourceClassId,
          className: className(sourceClassId),
          name: className(sourceClassId),
          portrait,
          experience: threshold,
        };

        promoteUnit(unit, target.id);

        expect(unit, `${sourceClassId} -> ${target.id}`).toMatchObject({
          classId: target.id,
          className: className(target.id),
          name: className(target.id),
          portrait: classFallbackPortraitFor(target.id, 1),
        });
      }
    }
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
