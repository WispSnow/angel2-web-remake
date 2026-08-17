/**
 * `REMAKE-108`：第 2／3 关的通用友军槽整体对调。
 *
 * 原版模板把玩家从第 0／1 关一路养起来的槽 40–43 放进第 2 关，而且是行为 11 的自动
 * 友军；第 3 关「救援友軍」里由玩家亲手控制的四名士兵反而是全新的槽 51–54。第 1 关
 * 胜利剧情（SAY/0006）明确让妮雅把兵分出去：「妳和拉朵那兩人各帶一些士兵，立刻趕去
 * 第四軍團那兒」，希蜜与拉朵那随后正是第 3 关的玩家单位。因此把玩家已经投入养成的
 * 四个槽交给第 3 关、由玩家继续控制，比留在第 2 关当自动友军更贴合这段剧情，也让
 * 前三关的成长有连续的着落。
 *
 * 这是明确偏离原版模板的产品决定，不是取证缺口：`battle-templates.json` 的 B/0005 与
 * B/0007 仍然是原版槽位，覆写只发生在语义层。
 *
 * 对调规则分两步，便于逐关核对：
 *
 * 1. 两组槽 `{40,41,42,43}` 与 `{51,52,53,54}` 整体交换所在关卡；
 * 2. 每关内部按落点 `x` 升序分配槽号，使槽字母（`REMAKE-107`）在棋盘上从左到右递增。
 *
 * 第二步让两张表不是互逆置换，这是有意为之——两关的四个落点顺序本来就不同，各自排序
 * 才能让玩家在两关都读到连续的 A、B、C、D 或 L、M、N、O。落点、行为与职业继承规则
 * 全部不变，交换的只是占用这些落点的战役槽。
 */

/** 第 2 关：原槽 40–43 的四个落点改由 51–54 占用（`x` = 20/23/27/29）。 */
export const STAGE2_GENERIC_ALLY_SLOT_SWAP: ReadonlyMap<number, number> = new Map([
  [43, 51],
  [41, 52],
  [40, 53],
  [42, 54],
]);

/** 第 3 关：原槽 51–54 的四个玩家落点改由 40–43 占用（`x` = 18/19/20/21）。 */
export const STAGE3_GENERIC_ALLY_SLOT_SWAP: ReadonlyMap<number, number> = new Map([
  [54, 40],
  [53, 41],
  [52, 42],
  [51, 43],
]);

/**
 * 按对调表改写生成单位的槽号。未登记的槽原样返回，所以第 2 关的 44／45 与第 3 关的
 * 45–47、50 这些自动友军不受影响。
 */
export function withSwappedGenericAllySlots<T extends { slot: number }>(
  units: readonly T[],
  swap: ReadonlyMap<number, number>,
): T[] {
  return units.map((unit) => {
    const swapped = swap.get(unit.slot);
    return swapped === undefined ? unit : { ...unit, slot: swapped };
  });
}
