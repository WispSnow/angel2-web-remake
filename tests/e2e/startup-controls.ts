import { expect, type Page } from "@playwright/test";

/**
 * 0000:0CE2 puts the Softstar logo in front of the scrolling opening, and
 * 0000:0D2F only ends that logo's hold early — 0000:0D1C still runs its fade-out
 * and the scroll still starts. "Skip the opening" therefore means waiting for
 * the scroll to own the screen and then sending one action; an action sent while
 * the logo is up merely shortens it. At native speed the logo takes about 4.8 s
 * (64 fade-in steps, 300 ticks of hold, 63 fade-out steps), so the wait needs
 * more room than the default expect timeout.
 *
 * Returns as soon as the action is sent, with the title art still assembling.
 */
export async function skipOpeningToTitle(
  page: Page,
  via: "key" | "pointer" = "key",
): Promise<void> {
  await expect(page.getByTestId("startup-screen"))
    .toHaveAttribute("data-startup-phase", "intro", { timeout: 10_000 });
  if (via === "pointer") await page.getByTestId("opening-intro").click();
  else await page.keyboard.press("x");
}
