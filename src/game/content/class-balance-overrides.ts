import type { ClassId } from "./class-catalog.generated";

/**
 * `stableRemake` 平衡覆写层。
 *
 * `class-catalog.generated.ts` 由 `reverse/parsed/native/unit-catalog.json` 生成，
 * 生成器会断言运行时成长行与原生目录逐字一致，所以它永远保持原版数值。本文件是
 * 唯一允许偏离原版职业数值的地方：每条覆写都必须对应一条已登记的 `REMAKE-0xx`
 * 决定，并在关闭覆写后能无残留地回到原版基线。
 *
 * 覆写只描述规则数值，不描述表现；UI 文案、参考表和存档迁移各自从这里读取，
 * 不再抄写第二份数字。
 */

/**
 * 职业内 3 级之后的一段成长。原版每个职业只有一段无限重复的规则，且防御与移动
 * 在 3 级后永久固定（见 `design/remake-gdd/reference/class-stats-reference.generated.md`
 * 读表须知第 2 条）。覆写层额外允许分段和防御成长，用来表达「先补完被截断的
 * 前期曲线，再切到终局速率」这类复刻决定。
 */
export interface ClassGrowthSegment {
  /**
   * 本段覆盖多少个成长行。省略表示无限重复；只有最后一段可以省略，
   * 因为再往后没有可切换的段。
   */
  readonly rows?: number;
  readonly thresholdIncrement: number;
  readonly attackIncrement: number;
  /** 原版恒为 0；非零值必须由决定条目单独说明。 */
  readonly defenseIncrement: number;
  readonly maxLifeIncrement: number;
}

/**
 * REMAKE-092：半龍戰士按原版是一个第 3 层强度的固定实例，没有上位转职，却要从第 22 关
 * 一直用到战役结束。原版曲线在职业内 3 级处被截断，之后只剩 `+380/+2/+0/+12`，
 * 于是它在第 4 层职业登场后迅速掉队。
 *
 * 覆写把原版 3 级前的成长节奏（每 380 经验 `+6` 攻、`+3` 防、`+20` 生命）继续到职业内
 * 6 级，此时正好 `96/51/400`——与第 4 层职业转职当关的起始行同档，而所需的 1900 累计
 * 经验也和一个单位爬到第 4 层所耗的生涯经验相当。7 级起切到终局速率。
 *
 * 固定三行不变，所以难度 0／1 的敌方半龍戰士（分别坐在第 2、3 行）出场属性完全不变；
 * 难度 2／3 坐在 3 级之后的成长行上，会随本覆写变强，这是已接受的代价。
 */
const HALF_DRAGON_WARRIOR_GROWTH: readonly ClassGrowthSegment[] = [
  { rows: 3, thresholdIncrement: 380, attackIncrement: 6, defenseIncrement: 3, maxLifeIncrement: 20 },
  { thresholdIncrement: 500, attackIncrement: 3, defenseIncrement: 0, maxLifeIncrement: 20 },
];

export const CLASS_GROWTH_OVERRIDES: Readonly<
  Partial<Record<ClassId, readonly ClassGrowthSegment[]>>
> = {
  "half-dragon-warrior": HALF_DRAGON_WARRIOR_GROWTH,
};

/**
 * REMAKE-093：水戰士是全职业表中唯一「伤害读面板攻击、面板攻击却停在法系区间」的近战
 * 职业——职业内 3 级只有 54 攻击，和弩兵、魔弓兵、各系法师同档，但那些职业的伤害走固定
 * 动作表，根本不读面板攻击。
 *
 * 覆写不动它的任何面板数值，改为授予一个复刻版射击动作：射程取魔弓兵的范围种子，伤害与
 * 经验取弓兵的固定表。这样既绕开死掉的面板攻击，又保留了近战受击分裂这一职业机制的战术
 * 张力——想要分裂就得贴脸挨打，想安全输出就得站远。
 *
 * 只授予 side 1。side 2 维持原版纯近战行为，第 13 关沼澤戰的敌方阵容与打法完全不变。
 */
export const SIDE1_ONLY_SHOOTING_CLASSES: readonly ClassId[] = ["water-warrior"];
