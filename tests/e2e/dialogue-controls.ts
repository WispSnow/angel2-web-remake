import { expect, type Page } from "@playwright/test";

/**
 * 目前正在等待玩家的對話記錄；沒有對話時回傳 `null`。
 *
 * `A/18` 窗體收回的那一百多毫秒裡對話層還留在畫面上，但 `currentDialogue` 已經結束：
 * 那時的圖層只是殘影，已經 `pointer-events: none`，不能再當成可點擊的對話。
 */
export async function activeDialogueRecord(page: Page): Promise<string | null> {
  const layer = page.getByTestId("dialogue-layer");
  if (!await layer.isVisible()) return null;
  if (await layer.getAttribute("data-dialogue-closing") !== null) return null;
  return layer.getAttribute("data-source-record");
}

export async function skipStoryDialogue(page: Page): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.click({ button: "right" });
  await expect(page.getByTestId("dialogue-skip-confirm")).toBeVisible();
  await page.getByTestId("dialogue-skip-yes").click();
}
