import type { ClassId } from "./class-catalog.generated";
import type { Difficulty } from "../types";

/**
 * `REMAKE-103` 敌方难度缩放层。
 *
 * 原版把敌方出场成长行硬绑成「难度 + 2」，而职业内 3 级之后的原版成长只加攻击与
 * 生命、防御永久冻结（见 `class-balance-overrides.ts` 对成长段的说明）。两者叠加的
 * 结果是难度 1（第 3 行，固定行）与难度 2（第 4 行，只多走一段 3 级后成长）几乎没有
 * 区别：实测攻击 +0%～7%、防御恒为 +0%、生命 +2%～6%，法師一档甚至攻击 0%。
 *
 * 本层把「成长曲线」和「出场等级」拆成两个可配旋钮：
 *
 * - `legacy` 沿用原版 3 级后成长，保留难度 0 与难度 3 的原版手感；
 * - `linear` 把职业前 3 级的每行增量一直延续下去（含防御），于是等级本身成为
 *   有效的难度旋钮——这正是 `REMAKE-092` 对半龍戰士做过的事情的一般化。
 *
 * 只作用于 side 2。玩家单位在任何难度下都走 `legacy`，我方成长语义完全不变。
 */

export type EnemyGrowthMode = "legacy" | "linear";

export interface EnemyScalingRule {
  readonly growth: EnemyGrowthMode;
  /** 敌方出场成长行（职业内等级）。原版为「难度 + 2」。 */
  readonly level: number;
  /**
   * 原版难度 3 对 side 2 全属性的 ×1.5。写成百分比只是为了让倍率显式化；
   * `150` 与原版的 `x + floor(x / 2)` 逐值相等。
   */
  readonly statMultiplierPercent?: number;
}

/**
 * 难度 0／3 逐字保持原版：等级 2 与等级 5 + ×1.5。难度 1／2 换用 `linear` 并拉开
 * 等级差。等级 4／6 是「四个难度全属性单调递增」条件下的最大跨度：等级 7 会让
 * 魔鎧戰士的防御（每行 +12）在难度 2 反超难度 3，等级 8 起士兵防御与戰士生命同样
 * 反超。`enemy-scaling.test.ts` 对全部普通职业锁定这条单调性。
 */
export const ENEMY_SCALING = {
  0: { growth: "legacy", level: 2 },
  1: { growth: "linear", level: 4 },
  2: { growth: "linear", level: 6 },
  3: { growth: "legacy", level: 5, statMultiplierPercent: 150 },
} as const satisfies Readonly<Record<Difficulty, EnemyScalingRule>>;

export const enemyScalingFor = (difficulty: Difficulty): EnemyScalingRule =>
  ENEMY_SCALING[difficulty];

export interface ScriptedBossStats {
  readonly attack: number;
  readonly defense: number;
  readonly maxLife: number;
}

/**
 * 剧情 boss 不参与 `linear` 缩放，逐难度直接给值。
 *
 * 妖龍、頭、手的行增量是普通职业的一到两个数量级（妖龍每行 `+50/+5/+400`），套用
 * `linear` 会让难度 2 直接越过难度 3；頭／手原本更是只有「难度 3 / 其余」两档，难度
 * 1 与 2 的最终 boss 完全一样。这里按难度 0 与难度 3 的原版值做线性插值取整，既补齐
 * 中间两档，又保证首尾逐字等于原版。
 *
 * 难度 0／3 的数值必须与原版一致：
 * - 妖龍难度 0 = 原版等级 2 = `200/80/2400`；难度 3 = 原版等级 5 × 1.5 = `378/127/4230`；
 * - 頭／手难度 0 = `100/10/10000`；难度 3 = `150/15/15000`（`Stage37Battle` 原有两档）。
 *
 * 表内数值已经是最终属性，不再叠加 `statMultiplierPercent`。
 */
export const SCRIPTED_BOSS_STATS = {
  dragon: [
    { attack: 200, defense: 80, maxLife: 2400 },
    { attack: 260, defense: 95, maxLife: 3000 },
    { attack: 320, defense: 110, maxLife: 3600 },
    { attack: 378, defense: 127, maxLife: 4230 },
  ],
  head: [
    { attack: 100, defense: 10, maxLife: 10_000 },
    { attack: 115, defense: 12, maxLife: 11_500 },
    { attack: 132, defense: 13, maxLife: 13_000 },
    { attack: 150, defense: 15, maxLife: 15_000 },
  ],
  hand: [
    { attack: 100, defense: 10, maxLife: 10_000 },
    { attack: 115, defense: 12, maxLife: 11_500 },
    { attack: 132, defense: 13, maxLife: 13_000 },
    { attack: 150, defense: 15, maxLife: 15_000 },
  ],
} as const satisfies Readonly<
  Partial<Record<ClassId, Readonly<Record<Difficulty, ScriptedBossStats>>>>
>;

export function scriptedBossStatsFor(
  classId: ClassId,
  difficulty: Difficulty,
): ScriptedBossStats | undefined {
  const table: Readonly<Record<Difficulty, ScriptedBossStats>> | undefined =
    SCRIPTED_BOSS_STATS[classId as keyof typeof SCRIPTED_BOSS_STATS];
  return table?.[difficulty];
}

/** `Stage37Battle` 的 boss 生命上限校验读同一张表，避免存档规则再抄一份数字。 */
export const stage37BossMaximumLifeByDifficulty: readonly number[] =
  SCRIPTED_BOSS_STATS.head.map((stats) => stats.maxLife);
