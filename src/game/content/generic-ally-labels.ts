import type { BattleUnit } from "../types";

/**
 * `REMAKE-107`：给通用友军槽一个跨关稳定的字母编号。
 *
 * 原版把战役成长存在按槽索引的 `ME_DATA/ME_EXP` 里，所以「第 0 关那名士兵」的身份
 * 就是槽号本身；模块 29 `0000:51B9` 却把 `FFh` 肖像槽的显示名替换成当前职业名，于是
 * 同关的多名通用友军在名单和右栏里字字相同，玩家无法判断哪一个继承了哪一份成长。
 *
 * 原版角色描述符表其实已经带逐槽编号：槽 34..59 的名字是占位串 `xxxx12..xxxx37`
 * （`xxxx(槽号 − 22)`），而模块 27 的部署名单走 `09B8h→0A1Bh→0B39h` 直接读描述符
 * `+5` 的 `$` 姓名、不调用 `51B9h`，因此原版第 1 关的部署卡上写的就是这些占位串。
 * 本决定只是把那套已经存在、但没清理干净的逐槽编号换成能见人的写法。
 *
 * 编号绑定槽位而不是职业：这些槽会转职，第 8／11／27 关的模板还会强制覆写职业并
 * 写回战役档，所以字母必须跟在**当前**职业名后面（`士兵A` → `騎兵A` → `魔劍戰士A`）。
 */
const FIRST_LABELLED_SLOT = 40;
const LAST_LABELLED_SLOT = 59;
const LETTERS = "ABCDEFGHIJKLMNOPQRST";

/**
 * 全部 44 张 B 模板中，实际作为 side 1 出场的通用槽只有 40..47、50..54、56..58；
 * 描述符表里同为占位名的槽 34..39 从不出场，槽 22 虽是 `FFh` 肖像却带真实姓名
 * （愛莉歐拉），因此都不在编号范围内，继续只显示职业名。
 *
 * 字母按槽号连续分配而不是按「本关第几个」，所以第 3 关的 `50..54` 会显示 K..O、
 * 跳过 I／J。断号本身就是信息：那两个槽在该关不属于我方。
 */
export function genericAllyLabelFor(
  unit: Pick<BattleUnit, "side" | "slot">,
): string {
  if (unit.side !== 1) return "";
  if (unit.slot < FIRST_LABELLED_SLOT || unit.slot > LAST_LABELLED_SLOT) return "";
  return LETTERS[unit.slot - FIRST_LABELLED_SLOT] ?? "";
}
