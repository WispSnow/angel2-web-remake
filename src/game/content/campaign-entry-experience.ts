/**
 * 名单槽首次上场时带的经验，只在该槽还没有被战役写过时使用。
 *
 * 各关自己的默认值保留在关卡文件里，因为它们描述的是那一关的出场证据（例如琴斯
 * 带着强制剧情职业入队，所以不适用士兵基线）。本模块只承载跨关一致、且必须逐关
 * 同步的入队基线，避免同一个角色因为玩家先在哪一关部署她而拿到不同起点。
 */
import type { ClassId } from "./class-catalog.generated";

/** 第 22 关焦土森林村莊加入的七姊妹，名单覆写为半龍戰士。 */
export const HALF_DRAGON_SISTER_SLOTS: readonly number[] = [25, 26, 27, 28, 29, 30, 31];

/**
 * REMAKE-092：七姊妹入队即为职业内刚满 3 级。
 *
 * 原版让她们沿用 class-0 名单角色的 299 经验基线，但那个数字的意义是「停在士兵
 * 300 转职阈值之下」，对一条从第 8 级起步、永远不转职的曲线毫无意义——照搬的结果
 * 是她们在第 22 关以职业内 1 级（`66/36/300`）入队，比我方主力低一整个层级。
 *
 * 760 是半龍戰士固定第三行的阈值，也就是「刚满 3 级」。它让姊妹入队时与我方平均
 * 水平齐平，并把 REMAKE-092 延长曲线的剩余 1140 经验分摊到之后的十五关。
 */
export const HALF_DRAGON_SISTER_ENTRY_EXPERIENCE = 760;

/**
 * 把跨关一致的入队基线叠加到关卡自己的默认值上。关卡默认值原样传入，未登记的槽
 * 原封不动返回，所以新增一条基线不需要逐关重写既有条件。
 */
export function untouchedEntryExperience(slot: number, stageDefault: number): number {
  return HALF_DRAGON_SISTER_SLOTS.includes(slot)
    ? HALF_DRAGON_SISTER_ENTRY_EXPERIENCE
    : stageDefault;
}

/** 姊妹的入队基线只对半龍戰士曲线成立，所以覆写必须跟着那个职业走。 */
export const HALF_DRAGON_SISTER_CLASS_ID: ClassId = "half-dragon-warrior";
