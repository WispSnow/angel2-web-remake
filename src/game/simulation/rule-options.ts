import type { BattleUnit } from "../types";

/**
 * 進入戰鬥模擬的懷舊規則選項（`REMAKE-216`）。
 *
 * 玩家在宿主選單切換；控制器把目前的值交給戰鬥物件，模擬層只從這裡讀，不碰宿主偏好或
 * `localStorage`。預設值就是複刻規則，因此沒有拿到選項的呼叫者（實驗室、單元測試、舊的
 * 內部入口）照舊按複刻規則結算。
 *
 * 失敗／撤退保留成長（`REMAKE-215`）只發生在控制器重建本關的那一刻，不屬於戰鬥結算，
 * 所以不在這裡。
 */
export interface BattleRuleOptions {
  /**
   * `REMAKE-216` 原版冰雪：取消 `REMAKE-013` 的冰封護盾與破邪解冰、`REMAKE-094` 的落點
   * 冰封判定，以及 `REMAKE-095`／`REMAKE-096` 的連線方向外推——冰封只剩原版的「跳過下一次
   * 本陣營行動、不能反擊」。
   */
  readonly originalIce: boolean;
}

export const DEFAULT_BATTLE_RULE_OPTIONS: BattleRuleOptions = Object.freeze({ originalIce: false });

/**
 * `REMAKE-013` 的冰封護盾：冰封單位不能被攻擊、射擊、傷害技術或治療選中，被範圍效果覆蓋時
 * 傷害與治療都是 0，也不消耗防魔。原版冰雪（`REMAKE-216`）下冰封只禁止行動，單位照常受攻治。
 *
 * 只用在「這名單位能不能被作用」的判斷；「冰封單位不能行動、不能反擊」兩種規則下都成立，
 * 那些地方照舊直接讀 `actionDisabled`。
 */
export function iceShielded(
  unit: Pick<BattleUnit, "actionDisabled">,
  rules: BattleRuleOptions | undefined,
): boolean {
  return unit.actionDisabled && !rules?.originalIce;
}
