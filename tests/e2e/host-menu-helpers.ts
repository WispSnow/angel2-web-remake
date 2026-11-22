import { expect, type Page } from "@playwright/test";

/**
 * 宿主選單（`src/game/host-menu.ts`）的共用操作：畫面右下角的入口打開選單並暫停遊戲，
 * 「畫面縮放」與三個參考面板都從這裡進。所有步驟只用玩家看得到的控件。
 */
export type HostOverlayId = "remake-notes" | "compendium" | "roadmap";
export type ImageScalingMode = "sharp" | "smooth" | "integer";

export const hostMenu = (page: Page) => page.getByTestId("host-menu");

export async function openHostMenu(page: Page): Promise<void> {
  await page.getByTestId("host-menu-trigger").click();
  await expect(hostMenu(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "true");
}

/**
 * 右下角 (618,327) 的入口是複刻加上的宿主控件，平時以 30% 疊在畫面上，不屬於原版合成。
 * 逐像素比對原版畫面（肖像投影、過場底紋等）之前先把它藏起來；只藏外觀，不卸下控件。
 */
export async function hideHostMenuTrigger(page: Page): Promise<void> {
  await page.addStyleTag({
    content: ".host-menu-trigger, .host-menu-trigger-tip { visibility: hidden !important; }",
  });
}

/** 打開選單（若還沒打開）並選某個參考面板；回傳被選的那一列，關閉面板後焦點回到它。 */
export async function openHostOverlay(page: Page, id: HostOverlayId) {
  if (!await hostMenu(page).isVisible()) await openHostMenu(page);
  const row = page.getByTestId(`host-menu-row-${id}`);
  await row.click();
  await expect(page.getByTestId(id)).toBeVisible();
  return row;
}

/** 點入口位置上的紅寶石回到遊戲。 */
export async function resumeFromHostMenu(page: Page): Promise<void> {
  await page.getByTestId("host-menu-close").click();
  await expect(hostMenu(page)).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "false");
}

/** 經「畫面縮放」子選單切換取樣方式，然後回到遊戲。 */
export async function setImageScaling(page: Page, mode: ImageScalingMode): Promise<void> {
  await openHostMenu(page);
  await page.getByTestId("host-menu-row-image-scaling").click();
  await page.getByTestId(`host-menu-option-${mode}`).click();
  await expect(page.locator("html")).toHaveAttribute("data-image-scaling", mode);
  await resumeFromHostMenu(page);
}
