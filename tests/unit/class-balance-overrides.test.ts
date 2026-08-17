import { describe, expect, it } from "vitest";
import unitCatalog from "../../reverse/parsed/native/unit-catalog.json";
import {
  CLASS_IDS,
  classDefinition,
  classStatsFor,
  nextExperienceThresholdFor,
  type ClassId,
} from "../../src/game/content/classes";
import {
  CLASS_GROWTH_OVERRIDES,
  SIDE1_ONLY_SHOOTING_CLASSES,
} from "../../src/game/content/class-balance-overrides";
import {
  BATTLE_ACTION_DEFINITIONS,
  WATER_WARRIOR_SHOT_ACTION_ID,
  shootingActionIdFor,
} from "../../src/game/content/actions";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { initialEnemyExperience, statsFor } from "../../src/game/content/stage0";

function nativeRecord(record: number) {
  const value = unitCatalog.records.find((candidate) => candidate.record === record);
  if (!value) throw new Error(`missing native unit catalog record ${record}`);
  return value;
}

describe("stableRemake class balance overrides", () => {
  it("leaves the generated catalog byte-identical to the native evidence", () => {
    // The override layer must never be a disguised edit of generated content:
    // every class the overrides touch still has to reproduce its native rows
    // and native growth rule inside the catalog itself.
    for (const classId of Object.keys(CLASS_GROWTH_OVERRIDES) as ClassId[]) {
      const definition = classDefinition(classId);
      const evidence = nativeRecord(definition.nativeRecord);
      expect(definition.dataRows, classId).toEqual(evidence.dataRows);
      expect(definition.postThirdRowGrowth, classId).toEqual(evidence.postThirdRowGrowth);
    }
  });

  it("only overrides classes that have no promotion route out", () => {
    // A promotable class can escape a weak block by promoting, so a growth
    // override there would compound with the promotion instead of replacing it.
    for (const classId of Object.keys(CLASS_GROWTH_OVERRIDES) as ClassId[]) {
      expect(classDefinition(classId).promotion.targets, classId).toEqual([]);
    }
    for (const classId of SIDE1_ONLY_SHOOTING_CLASSES) {
      expect(classDefinition(classId).promotion.targets, classId).toEqual([]);
    }
  });

  it("declares every override segment with a non-negative, terminating shape", () => {
    for (const [classId, segments] of Object.entries(CLASS_GROWTH_OVERRIDES)) {
      expect(segments, classId).toBeDefined();
      if (!segments) continue;
      expect(segments.length, classId).toBeGreaterThan(0);
      segments.forEach((segment, index) => {
        const label = `${classId} segment ${index}`;
        expect(segment.thresholdIncrement, label).toBeGreaterThan(0);
        expect(segment.attackIncrement, label).toBeGreaterThanOrEqual(0);
        expect(segment.defenseIncrement, label).toBeGreaterThanOrEqual(0);
        expect(segment.maxLifeIncrement, label).toBeGreaterThanOrEqual(0);
        // Only the final segment may repeat forever; a bounded tail would make
        // the curve silently stop growing at an undeclared ceiling.
        const isLast = index === segments.length - 1;
        expect(segment.rows === undefined, label).toBe(isLast);
        if (segment.rows !== undefined) expect(segment.rows, label).toBeGreaterThan(0);
      });
    }
  });

  it("classes without an override keep the native single-segment curve", () => {
    for (const classId of CLASS_IDS) {
      if (CLASS_GROWTH_OVERRIDES[classId]) continue;
      const definition = classDefinition(classId);
      const third = definition.dataRows[2];
      const growth = definition.postThirdRowGrowth[0];
      if (!growth) continue;
      const stats = classStatsFor({
        classId,
        experience: third.experienceThreshold + growth.thresholdIncrement * 2,
      });
      expect(stats, classId).toEqual({
        attack: third.attack + growth.attackIncrement * 2,
        // Native defense is frozen from the third row onward for every class
        // the overrides do not touch.
        defense: third.defense,
        maxLife: third.maxLife + growth.maxLifeIncrement * 2,
        movement: third.movement,
        level: 5,
      });
    }
  });
});

describe("REMAKE-092 half-dragon warrior extended curve", () => {
  const stats = (experience: number) =>
    classStatsFor({ classId: "half-dragon-warrior", experience, side: 1 });

  it("continues the native pre-third-row cadence through profession level 6", () => {
    // Levels 1-3 are the untouched native rows; 4-6 keep the same native
    // +380 experience / +6 attack / +3 defense / +20 life cadence.
    expect(stats(0)).toMatchObject({ attack: 66, defense: 36, maxLife: 300, level: 1 });
    expect(stats(380)).toMatchObject({ attack: 72, defense: 39, maxLife: 320, level: 2 });
    expect(stats(760)).toMatchObject({ attack: 78, defense: 42, maxLife: 340, level: 3 });
    expect(stats(1140)).toMatchObject({ attack: 84, defense: 45, maxLife: 360, level: 4 });
    expect(stats(1520)).toMatchObject({ attack: 90, defense: 48, maxLife: 380, level: 5 });
    expect(stats(1900)).toMatchObject({ attack: 96, defense: 51, maxLife: 400, level: 6 });
  });

  it("lands profession level 6 on the tier-4 opening block", () => {
    // 96/51/400 at 1900 accumulated experience is the design anchor: a great-axe
    // warrior opens its tier-4 rows at 96/46/380 after roughly 1750 lifetime
    // experience spent reaching the promotion.
    expect(stats(1900)).toMatchObject({ attack: 96, maxLife: 400 });
  });

  it("switches to the terminal rate from profession level 7 with defense frozen", () => {
    expect(stats(2400)).toMatchObject({ attack: 99, defense: 51, maxLife: 420, level: 7 });
    expect(stats(2900)).toMatchObject({ attack: 102, defense: 51, maxLife: 440, level: 8 });
    expect(stats(3400)).toMatchObject({ attack: 105, defense: 51, maxLife: 460, level: 9 });
  });

  it("holds each row until its full threshold is paid", () => {
    expect(stats(1139)).toMatchObject({ level: 3, attack: 78, defense: 42 });
    expect(stats(1899)).toMatchObject({ level: 5, attack: 90, defense: 48 });
    // The first terminal-rate row costs 500, not the 380 the previous segment used.
    expect(stats(2399)).toMatchObject({ level: 6, attack: 96, maxLife: 400 });
  });

  it("reports the next threshold across the segment boundary", () => {
    const next = (experience: number) =>
      nextExperienceThresholdFor({ classId: "half-dragon-warrior", experience, side: 1 });
    expect(next(0)).toBe(380);
    expect(next(760)).toBe(1140);
    expect(next(1520)).toBe(1900);
    // Crossing from the +380 segment into the +500 segment.
    expect(next(1900)).toBe(2400);
    expect(next(2400)).toBe(2900);
  });

  it("keeps difficulty 0 enemy half-dragons on their native fixed row", () => {
    // 难度 0 坐在原版固定行 2，任何 3 级后的成长规则都够不到它。
    // 六姊妹关卡默认就跑在这一档。
    expect(statsFor(
      { classId: "half-dragon-warrior", experience: initialEnemyExperience("half-dragon-warrior", 0), side: 2 },
      0,
    )).toMatchObject({ attack: 72, defense: 39, maxLife: 320 });
  });

  it("accepts the difficulty 1 to 3 enemy increase the extended curve implies", () => {
    // 三档都落在第 3 行之后。难度 1／2 走 `REMAKE-103` 的 linear 曲线（等级 4／6），
    // 难度 3 走本覆写的 legacy 曲线（等级 5）并叠加原版 side-2 +50%。
    expect(statsFor(
      { classId: "half-dragon-warrior", experience: initialEnemyExperience("half-dragon-warrior", 1), side: 2 },
      1,
    )).toMatchObject({ attack: 84, defense: 45, maxLife: 360 });
    expect(statsFor(
      { classId: "half-dragon-warrior", experience: initialEnemyExperience("half-dragon-warrior", 2), side: 2 },
      2,
    )).toMatchObject({ attack: 96, defense: 51, maxLife: 400 });
    expect(statsFor(
      { classId: "half-dragon-warrior", experience: initialEnemyExperience("half-dragon-warrior", 3), side: 2 },
      3,
    )).toMatchObject({ attack: 135, defense: 72, maxLife: 570 });
  });

  it("agrees with REMAKE-103 linear growth across the override's first segment", () => {
    // 本覆写第 1 段就是「把前 3 级曲线续下去」，与 linear 的通用规则同值，所以敌方
    // 难度 1／2 无论读哪一边都得到同一组数值——难度 2 正好落在覆写描述的 96/51/400。
    for (const difficulty of [1, 2] as const) {
      const experience = initialEnemyExperience("half-dragon-warrior", difficulty);
      const unit = { classId: "half-dragon-warrior" as const, experience, side: 2 as const };
      expect(classStatsFor(unit, "linear"), `d${difficulty}`).toEqual(classStatsFor(unit, "legacy"));
    }
  });
});

describe("REMAKE-093 water warrior shooting grant", () => {
  it("borrows the magic archer range and the archer damage and experience", () => {
    // Both halves must stay traceable to a native shot; nothing is interpolated.
    const shot = BATTLE_ACTION_DEFINITIONS[WATER_WARRIOR_SHOT_ACTION_ID];
    expect(shot.range).toEqual(BATTLE_ACTION_DEFINITIONS["magic-archer-shot"].range);
    expect(shot.damage).toEqual(BATTLE_ACTION_DEFINITIONS["archer-shot"].damage);
    expect(shot.experience).toEqual(BATTLE_ACTION_DEFINITIONS["archer-shot"].experience);
    expect(shot.kind).toBe("shooting");
    expect(shot.nativeCode).toBeNull();
  });

  it("grants the shot to side 1 and withholds it from side 2", () => {
    expect(shootingActionIdFor("water-warrior", 1)).toBe(WATER_WARRIOR_SHOT_ACTION_ID);
    expect(shootingActionIdFor("water-warrior", 2)).toBeUndefined();
    // Native shooting careers stay symmetric.
    expect(shootingActionIdFor("archer", 2)).toBe("archer-shot");
    expect(shootingActionIdFor("crossbow", 2)).toBe("crossbow-shot");
    expect(shootingActionIdFor("magic-archer", 2)).toBe("magic-archer-shot");
    // A class with no shot at all is unaffected either way.
    expect(shootingActionIdFor("soldier", 1)).toBeUndefined();
  });

  it("fires at the magic archer's reach for the archer's damage band", () => {
    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const target = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, target];
    attacker.classId = "water-warrior";
    attacker.className = classDefinition("water-warrior").nativeName;
    attacker.x = 20;
    attacker.y = 20;
    target.x = 25;
    target.y = 20;
    target.life = 300;
    // Five cells away is inside the magic archer's map and outside the archer's.
    expect(battle.actionTargetCells(attacker.id, WATER_WARRIOR_SHOT_ACTION_ID))
      .toContainEqual({ x: 25, y: 20 });
    const prepared = battle.prepareSpecialAction({
      actionId: WATER_WARRIOR_SHOT_ACTION_ID,
      actorId: attacker.id,
      targetId: target.id,
      target: { x: target.x, y: target.y },
    });
    expect(prepared.result.damage).toBeGreaterThanOrEqual(30);
    expect(prepared.result.damage).toBeLessThanOrEqual(49);
  });

  it("refuses the shot to a side-2 water warrior", () => {
    const battle = new Stage0Battle(0);
    const attacker = battle.units.find(({ side }) => side === 2)!;
    const target = battle.unit("1:0")!;
    battle.units = [attacker, target];
    attacker.classId = "water-warrior";
    attacker.x = 20;
    attacker.y = 20;
    target.x = 24;
    target.y = 20;
    expect(battle.actionTargetCells(attacker.id, WATER_WARRIOR_SHOT_ACTION_ID)).toEqual([]);
  });
});

describe("REMAKE-093 water warrior panel stats", () => {
  it("leaves every water warrior panel value at the native baseline", () => {
    // The shooting grant deliberately routes around the dead panel attack
    // instead of inflating it, so all four difficulty bands stay native.
    expect(classStatsFor({ classId: "water-warrior", experience: 720, side: 1 }))
      .toMatchObject({ attack: 54, defense: 36, maxLife: 305, level: 3 });
    expect(statsFor(
      { classId: "water-warrior", experience: initialEnemyExperience("water-warrior", 0), side: 2 },
      0,
    )).toMatchObject({ attack: 52, defense: 34, maxLife: 290 });
    expect(statsFor(
      { classId: "water-warrior", experience: initialEnemyExperience("water-warrior", 3), side: 2 },
      3,
    )).toMatchObject({ attack: 84, defense: 54, maxLife: 487 });
  });
});
