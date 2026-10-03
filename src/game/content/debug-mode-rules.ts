import { techniqueActionIdForNativeCode, type BattleActionId } from "./actions";
import { CLASS_IDS, type ClassId } from "./classes";
import { NATIVE_DEBUG_BEHAVIOUR_EDITOR, NATIVE_DEBUG_TECHNIQUE_MENUS } from "./debug-mode.generated";

/**
 * `REMAKE-174` 原版Debug第二批的規則常數，模擬、控制器、介面與存檔校驗共用同一份。
 */

/**
 * F1 與 EDIT 能寫入的行為值。原版 F1 面板列出 13 個名字，但指標列只到 `正 1`（11），
 * `目地`（12）點不到；EDIT 的行為框同樣只在 0..11 之間步進。
 */
export const DEBUG_AI_BEHAVIOUR_VALUES: readonly number[] = NATIVE_DEBUG_BEHAVIOUR_EDITOR.selectableValues;

export function isDebugAiBehaviourValue(value: unknown): value is number {
  return typeof value === "number" && DEBUG_AI_BEHAVIOUR_VALUES.includes(value);
}

/**
 * EDIT 可改成的職業：原版職業記錄 0..34。記錄 35..38（女帝、龍、頭、手）屬特殊執行期職業：
 * 龍／頭／手沒有我方棋子，四者都沒有左側全景戰鬥圖，並各自依附第 20／22／37 關的專用腳本，
 * 用戶 2026-10-02 選擇的受限版不開放它們。
 */
export const DEBUG_EDITABLE_CLASS_IDS: readonly ClassId[] = CLASS_IDS.slice(0, 35);

export function isDebugEditableClassId(classId: ClassId): boolean {
  return DEBUG_EDITABLE_CLASS_IDS.includes(classId);
}

/**
 * F5／F6 二級選單裡有複刻動作的技術代碼。`VIRT A/B/C`（`1V/2V/3V`）的路徑平局、對自己施放與
 * 殘留路徑仍未閉合（`developer-debug-mode.md`），複刻列出但不可選。
 */
export const DEBUG_TECHNIQUE_ACTION_IDS: readonly BattleActionId[] = [
  ...NATIVE_DEBUG_TECHNIQUE_MENUS.attack.items,
  ...NATIVE_DEBUG_TECHNIQUE_MENUS.support.items,
].flatMap(({ ranks }) => ranks.flatMap(({ code }) => {
  const actionId = techniqueActionIdForNativeCode(code);
  return actionId ? [actionId] : [];
}));

export function isDebugTechniqueAction(actionId: BattleActionId): boolean {
  return DEBUG_TECHNIQUE_ACTION_IDS.includes(actionId);
}
