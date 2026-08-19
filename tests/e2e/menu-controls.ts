import { expect, type Locator } from "@playwright/test";

/**
 * 等選單的開闔動畫落地。
 *
 * 選單以縮放動畫進出，動畫期間 `getBoundingClientRect()` 讀到的是縮放中的方框，
 * 量測型斷言（原生 `144 px` 外框、逐行 `112×24` 熱區、面板是否落在畫面內）必須先
 * 等動畫結束，否則量到的是中途尺寸。`offsetWidth/offsetHeight` 不受 transform 影響，
 * 但同一段斷言常常兩種都讀，統一先等比較不易漏。
 */
export async function settleMenuAnimation(menu: Locator): Promise<void> {
  await menu.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
}

/**
 * 等選單真的重新開著。
 *
 * 收合動畫期間舊方框還留在畫面上，`toBeVisible()` 會在它身上提前成立；「關掉再開同一個
 * 選單」的流程（例如選 `移動` 之後等移動後選單）必須先讓收合走完，否則後面的狀態斷言會
 * 讀到上一拍。
 */
export async function expectMenuOpen(menu: Locator): Promise<void> {
  await expect(menu).not.toHaveClass(/is-menu-closing/);
  await expect(menu).toBeVisible();
}
