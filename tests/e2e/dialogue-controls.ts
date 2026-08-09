import { expect, type Page } from "@playwright/test";

export async function skipStoryDialogue(page: Page): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.click({ button: "right" });
  await expect(page.getByTestId("dialogue-skip-confirm")).toBeVisible();
  await page.getByTestId("dialogue-skip-yes").click();
}
