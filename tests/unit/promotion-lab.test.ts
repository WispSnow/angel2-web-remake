import { describe, expect, it } from "vitest";
import {
  classDefinition,
  classStatsFor,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
} from "../../src/game/content/classes";
import {
  PROMOTION_LAB_CLASS_IDS,
  PROMOTION_LAB_ENVIRONMENT,
  PROMOTION_LAB_ROWS_PER_COLUMN,
  createPromotionLabPlacements,
  promotionLabEnemyExperienceFor,
  promotionLabExperienceFor,
  promotionLabPair,
} from "../../src/game/promotion-lab-session";
import { ArenaBattle, createArenaRuntime } from "../../src/game/simulation/arena-battle";

describe("promotion trigger lab", () => {
  it("includes every and only native class with ordered promotion targets", () => {
    expect(PROMOTION_LAB_CLASS_IDS.map((classId) => classDefinition(classId).nativeRecord))
      .toEqual([0, 6, 13, 20, 22, 23, 24, 25, 27, 28, 29, 30]);
    expect(PROMOTION_LAB_CLASS_IDS).toHaveLength(12);
    expect(PROMOTION_LAB_CLASS_IDS.flatMap(promotionTargetsFor)).toHaveLength(31);
  });

  it("places 12 adjacent mirrors exactly one point below the fourth growth row", () => {
    const placements = createPromotionLabPlacements();
    expect(placements).toHaveLength(24);
    expect(PROMOTION_LAB_ROWS_PER_COLUMN).toBe(6);
    expect(new Set(placements.map(({ id }) => id)).size).toBe(24);

    for (const classId of PROMOTION_LAB_CLASS_IDS) {
      const threshold = promotionExperienceThresholdFor(classId);
      const pair = promotionLabPair(placements, classId);
      expect(pair, classId).toBeDefined();
      expect(pair?.map(({ side }) => side)).toEqual([1, 2]);
      expect(pair?.map(({ experience }) => experience)).toEqual([threshold - 1, threshold - 1]);
      expect(pair?.[1].x).toBe((pair?.[0].x ?? 0) + 1);
      expect(pair?.[1].y).toBe(pair?.[0].y);
      expect(pair?.map((unit) => classStatsFor({
        classId: unit.classId,
        experience: unit.experience!,
        side: unit.side,
      }).level)).toEqual([3, 3]);
      expect(promotionLabExperienceFor(classId)).toBe(threshold - 1);
    }
  });

  it("places enemies one point below their fourth growth row on every difficulty (REMAKE-159)", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new ArenaBattle(
        createPromotionLabPlacements(difficulty),
        difficulty,
        undefined,
        PROMOTION_LAB_ENVIRONMENT,
      );
      for (const [index, classId] of PROMOTION_LAB_CLASS_IDS.entries()) {
        const enemy = battle.unit(`promotion-2-${index}`);
        if (!enemy) throw new Error(`missing enemy ${classId}`);
        expect(enemy.experience, `${classId} d${difficulty}`)
          .toBe(promotionLabEnemyExperienceFor(classId, difficulty));
        expect(battle.statsFor(enemy).level, `${classId} d${difficulty}`).toBe(3);
        expect(battle.statsFor({ ...enemy, experience: enemy.experience + 1 }).level,
          `${classId} d${difficulty} +1`).toBe(4);
        expect(battle.unit(`promotion-1-${index}`)?.experience).toBe(promotionLabExperienceFor(classId));
      }
    }
    // 难度 1／2 的敵方神劍戰士要在第三行之上拿满自己前 3 级的 450 才进第 4 成长行；
    // 难度 0／3 与我方一样是原版的 +100。
    const swordThird = classDefinition("divine-sword-warrior").dataRows[2].experienceThreshold;
    expect(promotionLabEnemyExperienceFor("divine-sword-warrior", 1)).toBe(swordThird + 449);
    expect(promotionLabEnemyExperienceFor("divine-sword-warrior", 3)).toBe(swordThird + 99);
    expect(promotionLabExperienceFor("divine-sword-warrior")).toBe(swordThird + 99);
  });

  it("uses formal combat to promote allies while enemies only advance a growth level", () => {
    const placements = createPromotionLabPlacements();
    const alliedBattle = new ArenaBattle(placements, 0, undefined, PROMOTION_LAB_ENVIRONMENT);
    const alliedSoldier = alliedBattle.unit("promotion-1-0")!;
    const enemySoldier = alliedBattle.unit("promotion-2-0")!;

    expect(alliedBattle.promotionQueue()).toEqual([]);
    const alliedResult = alliedBattle.attack(alliedSoldier.id, enemySoldier.id);
    expect(alliedResult.defenderDied).toBe(false);
    expect(alliedSoldier.experience).toBeGreaterThanOrEqual(
      promotionExperienceThresholdFor("soldier"),
    );
    expect(classStatsFor(alliedSoldier).level).toBe(4);
    expect(alliedBattle.promotionQueue()).toEqual([alliedSoldier.id]);

    const enemyBattle = new ArenaBattle(placements, 0, undefined, PROMOTION_LAB_ENVIRONMENT);
    const enemyAttacker = enemyBattle.unit("promotion-2-0")!;
    const alliedDefender = enemyBattle.unit("promotion-1-0")!;
    const enemyResult = enemyBattle.attack(enemyAttacker.id, alliedDefender.id);
    expect(enemyResult.defenderDied).toBe(false);
    expect(enemyAttacker.experience).toBeGreaterThanOrEqual(
      promotionExperienceThresholdFor("soldier"),
    );
    expect(classStatsFor(enemyAttacker).level).toBe(4);
    expect(enemyAttacker.classId).toBe("soldier");
    expect(enemyResult.counterExperienceGained).toBeGreaterThan(0);
    expect(alliedDefender.experience).toBeGreaterThanOrEqual(
      promotionExperienceThresholdFor("soldier"),
    );
    expect(enemyBattle.promotionQueue()).toEqual([alliedDefender.id]);
  });

  it("starts a pure-memory formal battle with Nia as the dialogue grantor", () => {
    const placements = createPromotionLabPlacements();
    const battle = new ArenaBattle(placements, 0, undefined, PROMOTION_LAB_ENVIRONMENT);
    const runtime = createArenaRuntime(placements, PROMOTION_LAB_ENVIRONMENT);

    expect(battle.stage).toMatchObject({
      name: "轉職觸發實驗室",
      contentIdentity: "promotion-lab/plain-field-1",
    });
    expect(battle.units).toHaveLength(24);
    expect(battle.unit("promotion-1-0")).toMatchObject({
      name: "妮雅",
      portrait: 46,
      experience: 299,
    });
    expect(battle.units.every((unit) => unit.life === battle.statsFor(unit).maxLife)).toBe(true);
    expect(runtime.assets?.map).toBe(PROMOTION_LAB_ENVIRONMENT.map);
    expect(runtime.assets?.minimap).toBe(PROMOTION_LAB_ENVIRONMENT.minimap);
  });
});
