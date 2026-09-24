import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 画面内指针（`src/game/native-pointer.ts`）是逻辑画面里的真实 DOM 精灵，会跟着截图一起
 * 被拍下来。逐像素比对前先把指针移到画面下方的宿主区域，精灵收起、交回宿主游标，
 * 比对的就只有游戏画面本身。
 */
export async function parkPointerOutsideScreen(
  page: Page,
  screen: Locator = page.getByTestId("game-screen"),
): Promise<void> {
  const box = await screen.boundingBox();
  if (!box) throw new Error("the logical screen has no layout box to park the pointer beside");
  const viewport = page.viewportSize();
  const below = box.y + box.height + 2;
  const beside = box.x + box.width + 2;
  if (viewport && below < viewport.height) await page.mouse.move(box.x + 2, below);
  else if (viewport && beside < viewport.width) await page.mouse.move(beside, box.y + 2);
  else throw new Error("the logical screen fills the viewport; nowhere outside it to park the pointer");
  await expect(screen.getByTestId("native-pointer")).toBeHidden();
}
