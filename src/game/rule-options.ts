import {
  DEFAULT_RULE_PREFERENCES,
  loadRulePreferences,
  saveRulePreferences,
  type RulePreferences,
} from "./preferences";
import type { BattleRuleOptions } from "./simulation/rule-options";

/**
 * `REMAKE-215`／`REMAKE-216` 懷舊規則選項的宿主開關。
 *
 * 用戶 2026-11-23 要求給喜歡原版的玩家兩個可切換的懷舊選項，收在畫面右下角的宿主選單：
 * 失敗／撤退後保留本關新增的經驗，以及原版冰雪機制。兩者預設關閉。
 *
 * 和「原版Debug」一樣是按瀏覽器保存的宿主偏好，隨時可以切換；不同的是它們會改變結算，
 * 所以控制器在重建本關（`REMAKE-215`）與交給戰鬥物件的規則（`REMAKE-216`）裡讀這裡的值。
 * 模擬層本身不讀這個模組：它只收控制器給的 `BattleRuleOptions`。
 */

export type RuleOptionId = keyof RulePreferences;

export interface RuleOptionDescription {
  readonly id: RuleOptionId;
  /** 宿主選單裡的列名（現代字體，不是原版點陣字）。 */
  readonly label: string;
  /** 說明框正文：開或關時各自的一句話。 */
  readonly onText: string;
  readonly offText: string;
}

export const RULE_OPTION_DESCRIPTIONS: readonly RuleOptionDescription[] = [
  {
    id: "keepFailedAttemptGrowth",
    label: "敗退保留經驗",
    onText: "戰敗或全面撤退後重打本關時，保留這次嘗試得到的經驗值，連同升級與轉職（與原版相同）。"
      + "回合、事件與隨機數仍回到入關時。",
    offText: "戰敗或全面撤退後重打本關時，全軍回到進入本關時的經驗、等級與職業（預設）。"
      + "打開後改為原版做法：保留這次嘗試得到的經驗、升級與轉職。",
  },
  {
    id: "originalIce",
    label: "原版冰雪",
    onText: "冰雪系技術使用原版機制：範圍內的敵人一律冰封（連被推出範圍的也是），固定按下、上、左、右推開；"
      + "冰封單位仍會被攻擊、射擊與治療，破邪不能解冰。原版機制明顯過強、不平衡，僅供懷舊。",
    offText: "冰雪系技術使用複刻機制（預設）：沿施法連線推開，被推出範圍者不冰封；冰封單位不能被攻擊或治療，"
      + "破邪可以解冰。打開後改用原版機制——原版明顯過強、不平衡。",
  },
];

const listeners = new Set<(options: Readonly<RulePreferences>) => void>();
let current: RulePreferences | undefined;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Private-mode and sandboxed embeds can throw on property access alone.
    return undefined;
  }
};

export function ruleOptions(): Readonly<RulePreferences> {
  if (current) return current;
  const store = storage();
  try {
    current = store ? loadRulePreferences(store) : { ...DEFAULT_RULE_PREFERENCES };
  } catch {
    current = { ...DEFAULT_RULE_PREFERENCES };
  }
  return current;
}

export function setRuleOption(id: RuleOptionId, enabled: boolean): void {
  if (ruleOptions()[id] === enabled) return;
  current = { ...ruleOptions(), [id]: enabled };
  const store = storage();
  try {
    if (store) saveRulePreferences(store, current);
  } catch {
    // A full or blocked store only loses persistence; the switch still works now.
  }
  for (const listener of listeners) listener(current);
}

export function onRuleOptionsChange(listener: (options: Readonly<RulePreferences>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 交給戰鬥模擬的那一部分；保留成長只在控制器重建本關時讀，不進戰鬥物件。 */
export function battleRuleOptionsFrom(options: Readonly<RulePreferences>): BattleRuleOptions {
  return { originalIce: options.originalIce };
}
