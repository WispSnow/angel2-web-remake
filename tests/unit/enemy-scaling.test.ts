import { describe, expect, it } from "vitest";
import {
  CLASS_IDS,
  classDefinition,
  classStatsFor,
  linearExperienceStepFor,
  nativePostThirdRowExperienceStepFor,
  nextExperienceThresholdFor,
  type ClassId,
} from "../../src/game/content/classes";
import { CLASS_GROWTH_OVERRIDES } from "../../src/game/content/class-balance-overrides";
import {
  ENEMY_SCALING,
  SCRIPTED_BOSS_STATS,
  scriptedBossStatsFor,
  stage37BossMaximumLifeByDifficulty,
} from "../../src/game/content/enemy-scaling";
import {
  effectiveStatsFor,
  initialEnemyExperience,
  nextExperienceThresholdAt,
  statsFor,
} from "../../src/game/content/stage0";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { Difficulty, UnitStats, UnitStatuses } from "../../src/game/types";

const DIFFICULTIES: readonly Difficulty[] = [0, 1, 2, 3];

/** 剧情 boss 走 `SCRIPTED_BOSS_STATS`，不参与职业成长曲线。 */
const SCRIPTED_BOSS_CLASS_IDS = Object.keys(SCRIPTED_BOSS_STATS) as ClassId[];

/** 女帝三行恒为 `10/10/10` 且只以 side 1 出场，够不到敌方缩放。 */
const GROWTH_SCALED_CLASS_IDS = CLASS_IDS
  .filter((classId) => !SCRIPTED_BOSS_CLASS_IDS.includes(classId) && classId !== "empress");

const enemyStatsAt = (classId: ClassId, difficulty: Difficulty): UnitStats =>
  statsFor(
    { classId, experience: initialEnemyExperience(classId, difficulty), side: 2 },
    difficulty,
  );

describe("REMAKE-103 敌方难度缩放", () => {
  it("难度 0 与难度 3 逐值保持原版：等级 2、等级 5 + ×1.5", () => {
    // 改动前 `statsFor` 就是「`classStatsFor` 默认 legacy 曲线，难度 3 再 ×1.5」，
    // 出场经验则是从 0 连走 difficulty + 1 级门槛。这条用例把首尾两档钉死在旧行为上。
    for (const classId of CLASS_IDS) {
      if (SCRIPTED_BOSS_CLASS_IDS.includes(classId)) continue;

      let legacyExperience = 0;
      const legacyExperienceByLevel: number[] = [];
      for (let step = 0; step < 4; step += 1) {
        legacyExperience = nextExperienceThresholdFor(
          { classId, experience: legacyExperience, side: 2 },
        ) + 1;
        legacyExperienceByLevel.push(legacyExperience);
      }

      for (const difficulty of [0, 3] as const) {
        const experience = initialEnemyExperience(classId, difficulty);
        expect(experience, `${classId} d${difficulty} experience`)
          .toBe(legacyExperienceByLevel[difficulty]);

        const legacy = classStatsFor({ classId, experience, side: 2 });
        const expected = difficulty === 3
          ? {
            ...legacy,
            attack: legacy.attack + Math.floor(legacy.attack / 2),
            defense: legacy.defense + Math.floor(legacy.defense / 2),
            maxLife: legacy.maxLife + Math.floor(legacy.maxLife / 2),
          }
          : legacy;
        expect(statsFor({ classId, experience, side: 2 }, difficulty), `${classId} d${difficulty}`)
          .toEqual(expected);
      }
    }
  });

  it("敌方出场等级等于难度表登记的成长行", () => {
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      for (const difficulty of DIFFICULTIES) {
        expect(enemyStatsAt(classId, difficulty).level, `${classId} d${difficulty}`)
          .toBe(ENEMY_SCALING[difficulty].level);
      }
    }
  });

  it("linear 模式把前 3 级的每行增量延续到 3 级之后", () => {
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const rows = classDefinition(classId).dataRows;
      const delta = {
        attack: rows[1].attack - rows[0].attack,
        defense: rows[1].defense - rows[0].defense,
        maxLife: rows[1].maxLife - rows[0].maxLife,
      };
      for (const difficulty of [1, 2] as const) {
        const level = ENEMY_SCALING[difficulty].level;
        const stats = enemyStatsAt(classId, difficulty);
        expect(
          { attack: stats.attack, defense: stats.defense, maxLife: stats.maxLife },
          `${classId} d${difficulty}`,
        ).toEqual({
          attack: rows[2].attack + (level - 3) * delta.attack,
          defense: rows[2].defense + (level - 3) * delta.defense,
          maxLife: rows[2].maxLife + (level - 3) * delta.maxLife,
        });
      }
    }
  });

  it("REMAKE-159：linear 模式 3 级之后的门槛延续职业自己前 3 级的步长", () => {
    // 属性步长取自前 3 级，门槛也取自前 3 级，3 级前后每点经验换到的属性因此相同。
    // 改动前门槛沿用原版 3 级后的 +100，神劍戰士这类职业 3 级后成长快 4.5 倍。
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const rows = classDefinition(classId).dataRows;
      const step = rows[1].experienceThreshold - rows[0].experienceThreshold;
      // 除女帝外两段前期门槛逐值相同，「前 3 级的步长」没有歧义。
      expect(rows[2].experienceThreshold - rows[1].experienceThreshold, `${classId} early rows`)
        .toBe(step);
      expect(linearExperienceStepFor(classId), classId).toBe(step);

      const third = rows[2].experienceThreshold;
      for (const rowsAbove of [0, 1, 3, 10]) {
        for (const earned of [0, 1, step - 1]) {
          const unit = { classId, experience: third + rowsAbove * step + earned, side: 2 as const };
          expect(classStatsFor(unit, "linear").level, `${classId} +${rowsAbove}/${earned}`)
            .toBe(3 + rowsAbove);
          expect(nextExperienceThresholdFor(unit, "linear"), `${classId} +${rowsAbove}/${earned} next`)
            .toBe(third + (rowsAbove + 1) * step);
        }
      }

      // 出场后要再拿满一整个前期步长才升下一级，这就是敌方战中升级的节奏。
      for (const difficulty of [1, 2] as const) {
        const seeded = initialEnemyExperience(classId, difficulty);
        const unit = { classId, experience: seeded, side: 2 as const };
        expect(nextExperienceThresholdFor(unit, "linear") - (seeded - 1), `${classId} d${difficulty}`)
          .toBe(step);
      }
    }
  });

  it("只有原版 +100 门槛的一转、二转职业与祈導師／魔導師换了阶梯", () => {
    // 原版的 +100 只出现在可转职职业上，它是「3 级后再拿 100 经验就进入转职扫描」；
    // 会一直升下去的终端职业，3 级后门槛本来就等于自己前 3 级的步长。
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const promotable = classDefinition(classId).promotion.targets.length > 0;
      expect(nativePostThirdRowExperienceStepFor(classId) === 100, classId).toBe(promotable);
    }
    // 士兵前 3 级同样是每行 100，所以实际换阶梯的是 11 个一转、二转职业，外加原版
    // 3 级前后门槛为 590／570 的两名法系。
    const changed = GROWTH_SCALED_CLASS_IDS.filter((classId) =>
      linearExperienceStepFor(classId) !== nativePostThirdRowExperienceStepFor(classId));
    expect([...changed].sort()).toEqual([
      "archer",
      "cavalry",
      "divine-sword-warrior",
      "land-knight",
      "magic-guide",
      "magician",
      "monk",
      "pegasus-warrior",
      "prayer-guide",
      "priest",
      "sister",
      "steel-armor-warrior",
      "warrior",
    ]);
    // 新阶梯只会更长，同一成长行里已拿到的经验换算后仍留在这一行（存档迁移依赖这一点）。
    for (const classId of changed) {
      expect(linearExperienceStepFor(classId), classId)
        .toBeGreaterThan(nativePostThirdRowExperienceStepFor(classId) ?? Infinity);
    }
  });

  it("剧情 boss 保留原版门槛：属性逐难度取脚本值，经验只决定显示等级", () => {
    for (const classId of SCRIPTED_BOSS_CLASS_IDS) {
      expect(linearExperienceStepFor(classId), classId)
        .toBe(nativePostThirdRowExperienceStepFor(classId));
      for (const difficulty of [1, 2] as const) {
        const unit = {
          classId,
          experience: initialEnemyExperience(classId, difficulty),
          side: 2 as const,
        };
        expect(nextExperienceThresholdFor(unit, "linear"), `${classId} d${difficulty}`)
          .toBe(nextExperienceThresholdFor(unit, "legacy"));
      }
    }
  });

  it("经验栏按单位自己的成长规则取下一级门槛", () => {
    // `REMAKE-159` 之后难度 1／2 的敌方 3 级后不再与我方共用门槛，HUD 与详情页读这个口。
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const third = classDefinition(classId).dataRows[2].experienceThreshold;
      const enemy = { classId, experience: third + 1, side: 2 as const };
      const ally = { ...enemy, side: 1 as const };
      for (const difficulty of DIFFICULTIES) {
        const mode = ENEMY_SCALING[difficulty].growth;
        expect(nextExperienceThresholdAt(enemy, difficulty), `${classId} enemy d${difficulty}`)
          .toBe(nextExperienceThresholdFor(enemy, mode));
        expect(nextExperienceThresholdAt(ally, difficulty), `${classId} ally d${difficulty}`)
          .toBe(nextExperienceThresholdFor(ally));
      }
    }
    const swordThird = classDefinition("divine-sword-warrior").dataRows[2].experienceThreshold;
    const sword = { classId: "divine-sword-warrior" as const, experience: swordThird + 1 };
    expect(nextExperienceThresholdAt({ ...sword, side: 2 }, 2)).toBe(swordThird + 450);
    expect(nextExperienceThresholdAt({ ...sword, side: 2 }, 3)).toBe(swordThird + 100);
    expect(nextExperienceThresholdAt({ ...sword, side: 1 }, 2)).toBe(swordThird + 100);
  });

  it("linear 模式接管 REMAKE-092 半龍戰士覆写，但敌方出场行完全一致", () => {
    // 覆写是为 legacy 曲线打的补丁，其第 1 段（3 行、每行 380 经验 +6/+3/+20）本身
    // 就是「把前 3 级曲线续下去」，与 linear 的通用规则同值；两者只在第 7 行起分岔，
    // 那时覆写切到每行 500 经验而 linear 继续按 380 走。
    expect(CLASS_GROWTH_OVERRIDES["half-dragon-warrior"]).toBeDefined();
    const third = classDefinition("half-dragon-warrior").dataRows[2].experienceThreshold;

    for (const difficulty of DIFFICULTIES) {
      // 敌方出场只用到第 4～6 行，落在覆写第 1 段内，四个难度的经验与等级都不受影响。
      const experience = initialEnemyExperience("half-dragon-warrior", difficulty);
      const unit = { classId: "half-dragon-warrior" as const, experience, side: 2 as const };
      expect(classStatsFor(unit, "linear").level, `d${difficulty}`)
        .toBe(classStatsFor(unit, "legacy").level);
    }

    // 第 7 行起分岔：同样的经验在 linear 下走得更快。
    const deepUnit = {
      classId: "half-dragon-warrior" as const,
      experience: third + 5_000,
      side: 2 as const,
    };
    expect(classStatsFor(deepUnit, "linear").level)
      .toBeGreaterThan(classStatsFor(deepUnit, "legacy").level);
  });

  it("四个难度的攻击、防御与生命严格递增", () => {
    // 等级 6 是保持这条不变量的最大跨度：等级 7 会让魔鎧戰士（每行 +12 防）在难度 2
    // 反超难度 3 的 ×1.5，等级 8 起士兵防御与戰士生命同样反超。
    for (const classId of [...GROWTH_SCALED_CLASS_IDS, ...SCRIPTED_BOSS_CLASS_IDS]) {
      const byDifficulty = DIFFICULTIES.map((difficulty) => enemyStatsAt(classId, difficulty));
      for (const key of ["attack", "defense", "maxLife"] as const) {
        for (let index = 1; index < byDifficulty.length; index += 1) {
          expect(
            byDifficulty[index][key],
            `${classId} ${key} d${index - 1}→d${index}`,
          ).toBeGreaterThan(byDifficulty[index - 1][key]);
        }
      }
    }
  });

  it("难度 1 与难度 2 之间拉开了可感知的差距", () => {
    // 本次改动的目标就是这一条：原版难度 1→2 只多走一段 3 级后成长，防御恒为 +0%。
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const first = enemyStatsAt(classId, 1);
      const second = enemyStatsAt(classId, 2);
      expect(second.defense, `${classId} defense`).toBeGreaterThan(first.defense);
      expect(second.maxLife - first.maxLife, `${classId} maxLife`).toBeGreaterThanOrEqual(20);
    }
  });

  it("我方单位在任何难度下都走原版曲线", () => {
    for (const classId of CLASS_IDS) {
      for (const difficulty of DIFFICULTIES) {
        for (const experience of [0, 299, 5_000]) {
          const unit = { classId, experience, side: 1 as const };
          expect(statsFor(unit, difficulty), `${classId} d${difficulty} exp${experience}`)
            .toEqual(classStatsFor(unit));
        }
      }
    }
  });

  it("剧情 boss 逐难度取脚本值，且首尾两档等于原版", () => {
    // 妖龍难度 0 = 原版等级 2；难度 3 = 原版等级 5 × 1.5。
    const dragonRows = classDefinition("dragon").dataRows;
    const dragonGrowth = classDefinition("dragon").postThirdRowGrowth[0];
    const legacyLevelFive = {
      attack: dragonRows[2].attack + 2 * dragonGrowth.attackIncrement,
      defense: dragonRows[2].defense,
      maxLife: dragonRows[2].maxLife + 2 * dragonGrowth.maxLifeIncrement,
    };
    expect(scriptedBossStatsFor("dragon", 0)).toEqual({
      attack: dragonRows[1].attack,
      defense: dragonRows[1].defense,
      maxLife: dragonRows[1].maxLife,
    });
    expect(scriptedBossStatsFor("dragon", 3)).toEqual({
      attack: legacyLevelFive.attack + Math.floor(legacyLevelFive.attack / 2),
      defense: legacyLevelFive.defense + Math.floor(legacyLevelFive.defense / 2),
      maxLife: legacyLevelFive.maxLife + Math.floor(legacyLevelFive.maxLife / 2),
    });

    // 頭／手保留 `Stage37Battle` 原有的「难度 3 / 其余」两档端点。
    for (const classId of ["head", "hand"] as const) {
      expect(scriptedBossStatsFor(classId, 0)).toEqual({ attack: 100, defense: 10, maxLife: 10_000 });
      expect(scriptedBossStatsFor(classId, 3)).toEqual({ attack: 150, defense: 15, maxLife: 15_000 });
    }

    // 脚本值直接落到 `statsFor`，不再叠加难度 3 倍率。
    for (const classId of SCRIPTED_BOSS_CLASS_IDS) {
      for (const difficulty of DIFFICULTIES) {
        const scripted = scriptedBossStatsFor(classId, difficulty);
        expect(scripted, `${classId} d${difficulty}`).toBeDefined();
        expect(enemyStatsAt(classId, difficulty)).toMatchObject(scripted!);
      }
    }
  });

  it("存档的 boss 生命上限与脚本表读同一份数字", () => {
    expect(stage37BossMaximumLifeByDifficulty)
      .toEqual(DIFFICULTIES.map((difficulty) => SCRIPTED_BOSS_STATS.head[difficulty].maxLife));
    expect(SCRIPTED_BOSS_STATS.hand).toEqual(SCRIPTED_BOSS_STATS.head);
  });
});

describe("状态 ±20 与难度倍率的原版顺序", () => {
  // 模块 29 的单位装载链是 `0000:502A → 0000:51EC → 1000:8C2D`（把 ±20 写进有效攻／防）
  // `→ 1000:8B60 → 1000:8BD1`（难度 3 的 side 2 才 ×1.5，且同时放大有效值与基础值）。
  // 倍率作用在已经加减过 20 的有效值上，所以「無法無天」的敌方状态修正是 30 点。
  const statusesWith = (overrides: Partial<UnitStatuses>): UnitStatuses =>
    ({ ...emptyUnitStatuses(), ...overrides });

  const effectiveAt = (
    classId: ClassId,
    difficulty: Difficulty,
    overrides: Partial<UnitStatuses>,
    side: 1 | 2 = 2,
  ): UnitStats => effectiveStatsFor(
    {
      classId,
      experience: side === 2 ? initialEnemyExperience(classId, difficulty) : 0,
      side,
      statuses: statusesWith(overrides),
    },
    difficulty,
  );

  it("難度 3 的敵方攻擊下降／防禦下降各降 30 点，攻防提升各升 30 点", () => {
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      const experience = initialEnemyExperience(classId, 3);
      // 倍率前的原版值：难度 3 沿用 legacy 曲线，所以就是 `classStatsFor` 默认值。
      const unscaled = classStatsFor({ classId, experience, side: 2 });
      const scaled = statsFor({ classId, experience, side: 2 }, 3);
      const scale = (value: number): number => Math.floor(Math.max(0, value) * 3 / 2);

      const down = effectiveAt(classId, 3, { attackDown: 3, defenseDown: 3 });
      expect(down.attack, `${classId} attack down`).toBe(scale(unscaled.attack - 20));
      expect(down.defense, `${classId} defense down`).toBe(scale(unscaled.defense - 20));

      const up = effectiveAt(classId, 3, { attackUp: 3, defenseUp: 3 });
      expect(up.attack, `${classId} attack up`).toBe(scale(unscaled.attack + 20));
      expect(up.defense, `${classId} defense up`).toBe(scale(unscaled.defense + 20));

      // 未被 `max(0, …)` 夹到的职业必须正好差 30，而不是 20。
      if (unscaled.attack >= 20) {
        expect(scaled.attack - down.attack, `${classId} attack down delta`).toBe(30);
      }
      expect(up.attack - scaled.attack, `${classId} attack up delta`).toBe(30);
      if (unscaled.defense >= 20) {
        expect(scaled.defense - down.defense, `${classId} defense down delta`).toBe(30);
      }
      expect(up.defense - scaled.defense, `${classId} defense up delta`).toBe(30);

      // 生命不受状态影响，攻升与攻降仍然相消。
      expect(down.maxLife, `${classId} maxLife`).toBe(scaled.maxLife);
      expect(effectiveAt(classId, 3, { attackUp: 3, attackDown: 3 }).attack, `${classId} cancel`)
        .toBe(scaled.attack);
    }
  });

  it("其余难度与我方单位仍是固定 20 点", () => {
    for (const classId of GROWTH_SCALED_CLASS_IDS) {
      for (const difficulty of [0, 1, 2] as const) {
        const base = enemyStatsAt(classId, difficulty);
        const down = effectiveAt(classId, difficulty, { attackDown: 3, defenseDown: 3 });
        expect(down.attack, `${classId} d${difficulty} attack`)
          .toBe(Math.max(0, base.attack - 20));
        expect(down.defense, `${classId} d${difficulty} defense`)
          .toBe(Math.max(0, base.defense - 20));
      }

      for (const difficulty of DIFFICULTIES) {
        const base = statsFor({ classId, experience: 0, side: 1 }, difficulty);
        const down = effectiveAt(classId, difficulty, { attackDown: 3, defenseDown: 3 }, 1);
        expect(down.attack, `${classId} side 1 d${difficulty} attack`)
          .toBe(Math.max(0, base.attack - 20));
        expect(down.defense, `${classId} side 1 d${difficulty} defense`)
          .toBe(Math.max(0, base.defense - 20));
      }
    }
  });

  /**
   * 剧情 boss 的表值已经是难度倍率之后的最终属性，但状态 `±20` 在原版里写在倍率之前
   * （`1000:8C2D → 8B60 → 8BD1`），所以它必须和其余 side 2 单位一样被放大。此前
   * boss 分支直接在最终值上加减 20，无法無天的妖龍被攻击下降只掉 20 点而不是 30。
   */
  it("剧情 boss 的状态修正与其余敌方同样被难度 3 放大到 30 点", () => {
    for (const classId of SCRIPTED_BOSS_CLASS_IDS) {
      for (const difficulty of DIFFICULTIES) {
        const base = enemyStatsAt(classId, difficulty);
        const delta = difficulty === 3 ? 30 : 20;
        const down = effectiveAt(classId, difficulty, { attackDown: 3, defenseDown: 3 });
        expect(down.attack, `${classId} d${difficulty} attack`).toBe(base.attack - delta);
        expect(down.defense, `${classId} d${difficulty} defense`)
          .toBe(Math.max(0, base.defense - delta));

        const up = effectiveAt(classId, difficulty, { attackUp: 3, defenseUp: 3 });
        expect(up.attack, `${classId} d${difficulty} attack up`).toBe(base.attack + delta);
        expect(up.defense, `${classId} d${difficulty} defense up`).toBe(base.defense + delta);

        // 生命不受状态影响；攻升与攻降仍然相消。
        expect(down.maxLife, `${classId} d${difficulty} maxLife`).toBe(base.maxLife);
        expect(
          effectiveAt(classId, difficulty, { attackUp: 3, attackDown: 3 }).attack,
          `${classId} d${difficulty} cancel`,
        ).toBe(base.attack);
      }
    }
  });

  /**
   * 表值仍是倍率之后的最终属性，所以 `(倍率前 ± 20) × 1.5` 必须与
   * `最终值 ± 30` 逐值相等——`20 × 1.5` 是整数，这条恒等式让实现不必回推
   * 不可逆的 `x + floor(x / 2)`。
   */
  it("妖龍难度 3 的实得值等于倍率前 252/85 各 ±20 再 ×1.5", () => {
    const scale = (value: number): number => Math.floor(value * 3 / 2);
    expect(enemyStatsAt("dragon", 3)).toMatchObject({ attack: 378, defense: 127, maxLife: 4230 });
    const down = effectiveAt("dragon", 3, { attackDown: 3, defenseDown: 3 });
    expect(down.attack).toBe(scale(252 - 20));
    expect(down.defense).toBe(scale(85 - 20));
    const up = effectiveAt("dragon", 3, { attackUp: 3, defenseUp: 3 });
    expect(up.attack).toBe(scale(252 + 20));
    expect(up.defense).toBe(scale(85 + 20));
  });
});
