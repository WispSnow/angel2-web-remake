import { techniqueActionIdForNativeCode, type BattleActionId } from "./content/actions";
import {
  NATIVE_DEBUG_EDIT_MENU,
  NATIVE_DEBUG_SIDE_LIFE_MENUS,
  NATIVE_DEBUG_TECHNIQUE_MENUS,
} from "./content/debug-mode.generated";

/**
 * `REMAKE-174` 原版Debug的原版選單：F2（EDIT）、F3／F4（全體生命）、F5／F6（技術測試）與
 * 技術的二級選單。原版五組都經通用選單執行器 `0000:5651`，共用同一個選單位置，所以複刻
 * 也共用一個選單表面，只換列表。原文（含 Big5 字串裡的半形空格）一律取自生成內容。
 */

export type DebugTechniqueGroup = keyof typeof NATIVE_DEBUG_TECHNIQUE_MENUS;

export type DebugMenuState =
  | { readonly kind: "life"; readonly side: 1 | 2; readonly index: number }
  | { readonly kind: "edit"; readonly index: number }
  | {
    readonly kind: "technique";
    readonly group: DebugTechniqueGroup;
    readonly casterId: string;
    readonly index: number;
  }
  | {
    readonly kind: "techniqueRank";
    readonly group: DebugTechniqueGroup;
    readonly category: string;
    readonly casterId: string;
    readonly index: number;
  };

export interface DebugMenuItem {
  readonly code: string;
  readonly label: string;
  readonly enabled: boolean;
}

const lifeItems = (side: 1 | 2): readonly DebugMenuItem[] =>
  (side === 2 ? NATIVE_DEBUG_SIDE_LIFE_MENUS.enemy : NATIVE_DEBUG_SIDE_LIFE_MENUS.ally).items
    .map(({ code, label }) => ({ code, label, enabled: true }));

/** F2 的兵種／地型屬第三批，先列出但不可選。 */
const EDIT_TARGETS_AVAILABLE = new Set<string>(["allyUnitEditor", "enemyUnitEditor"]);

const techniqueCategory = (group: DebugTechniqueGroup, category: string) =>
  NATIVE_DEBUG_TECHNIQUE_MENUS[group].items.find(({ code }) => code === category);

export function debugTechniqueActionId(code: string): BattleActionId | undefined {
  return techniqueActionIdForNativeCode(code);
}

export interface DebugMenuContext {
  /** 這場戰鬥已預載地圖表現的技術；沒有預載的技術列出但不可選，避免演出時缺圖。 */
  readonly techniqueAvailable?: (actionId: BattleActionId) => boolean;
}

export function debugMenuItems(
  menu: DebugMenuState,
  context: DebugMenuContext = {},
): readonly DebugMenuItem[] {
  const techniqueEnabled = (code: string): boolean => {
    const actionId = debugTechniqueActionId(code);
    return actionId !== undefined && (context.techniqueAvailable?.(actionId) ?? true);
  };
  switch (menu.kind) {
    case "life":
      return lifeItems(menu.side);
    case "edit":
      return NATIVE_DEBUG_EDIT_MENU.items.map(({ code, label, target }) => ({
        code,
        label,
        enabled: EDIT_TARGETS_AVAILABLE.has(target),
      }));
    case "technique":
      return NATIVE_DEBUG_TECHNIQUE_MENUS[menu.group].items.map(({ code, label, ranks }) => ({
        code,
        label,
        enabled: ranks.some((rank) => techniqueEnabled(rank.code)),
      }));
    case "techniqueRank":
      return (techniqueCategory(menu.group, menu.category)?.ranks ?? []).map(({ code, label }) => ({
        code,
        label,
        enabled: techniqueEnabled(code),
      }));
  }
}

/** 讀屏用的選單名稱；原版選單本身沒有標題。 */
export function debugMenuAccessibleName(menu: DebugMenuState): string {
  switch (menu.kind) {
    case "life": return menu.side === 2 ? "原版Debug：敵方全體生命" : "原版Debug：我方全體生命";
    case "edit": return "原版Debug：編輯";
    case "technique": return "原版Debug：技術測試";
    case "techniqueRank": return "原版Debug：技術測試等級";
  }
}

export function withDebugMenuIndex(menu: DebugMenuState, index: number): DebugMenuState {
  return { ...menu, index };
}

/** 上下移動跳過不可選的列；全部不可選時原地不動。 */
export function steppedDebugMenuIndex(
  menu: DebugMenuState,
  delta: number,
  context: DebugMenuContext = {},
): number {
  const items = debugMenuItems(menu, context);
  if (items.length === 0 || delta === 0) return menu.index;
  let index = menu.index;
  for (let step = 0; step < items.length; step += 1) {
    index = (index + Math.sign(delta) + items.length) % items.length;
    if (items[index]?.enabled) return index;
  }
  return menu.index;
}
