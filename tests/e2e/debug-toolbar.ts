import type { Page } from "@playwright/test";

/**
 * The debug scenario toolbar (`mountDebugToolbar`) starts collapsed to its
 * DEBUG button. Expand it before using 一擊勝利／直接通關／戰敗測試; calling it
 * again on an already open toolbar does nothing, so it is safe before every
 * action, including after 直接通關 routed the same page into the next stage.
 */
export async function openDebugToolbar(page: Page): Promise<void> {
  const toggle = page.locator("[data-debug-toggle]");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}
