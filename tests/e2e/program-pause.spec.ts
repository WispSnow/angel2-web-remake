import { expect, test, type Page } from "@playwright/test";
import { hostMenu } from "./host-menu-helpers";
import { captureVisualAudit } from "./visual-audit";

interface PauseBattleState {
  readonly cursor: { x: number; y: number };
  readonly actionMode: string;
  readonly phase: string;
}

const battleState = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as PauseBattleState,
);

test("the opening timeline does not age while the global pause is open", async ({ page }) => {
  await page.goto("/?test=1");
  const startup = page.getByTestId("startup-screen");
  await expect(page.getByTestId("startup-enter")).toBeEnabled();
  await page.getByTestId("startup-enter").click();
  await expect(startup).toHaveAttribute("data-startup-phase", "intro");
  await expect.poll(async () => Number(await startup.getAttribute("data-intro-update")))
    .toBeGreaterThan(0);

  await page.keyboard.press("p");
  await expect(page.getByTestId("program-pause-overlay")).toBeVisible();
  const frozen = {
    phase: await startup.getAttribute("data-startup-phase"),
    update: await startup.getAttribute("data-intro-update"),
  };
  await page.waitForTimeout(500);
  await expect(startup).toHaveAttribute("data-startup-phase", frozen.phase ?? "");
  await expect(startup).toHaveAttribute("data-intro-update", frozen.update ?? "");

  await page.keyboard.press("p");
  await expect.poll(async () => Number(await startup.getAttribute("data-intro-update")))
    .toBeGreaterThan(Number(frozen.update));
});

test("the host pause freezes Phaser, audio and battle input until an explicit resume", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  const before = await battleState(page);

  // Pointer-down also unlocks Web Audio, then the click on the corner menu
  // establishes the pause: opening the host menu is the pause.
  await page.getByTestId("host-menu-trigger").click();
  const overlay = page.getByTestId("program-pause-overlay");
  await expect(overlay).toBeVisible();
  await expect(hostMenu(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "true");
  await expect(canvas).toHaveAttribute("data-program-paused", "true");
  await expect(page.getByTestId("host-menu-row-resume")).toBeFocused();
  await expect.poll(() => page.locator("#app").getAttribute("data-sound-effect-context"))
    .toBe("suspended");

  await page.keyboard.press("d");
  await page.keyboard.press("g");
  await page.waitForTimeout(150);
  expect(await battleState(page)).toEqual(before);
  // 點一下壓暗的畫面也只是回到遊戲的選項之一；這裡先確認點在選單外框上不會漏到戰場。
  await page.getByTestId("host-menu-description").click();
  await expect(overlay).toBeVisible();
  expect(await battleState(page)).toEqual(before);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/program-pause-desktop.png",
    animations: "allow",
  });

  await page.getByTestId("host-menu-row-resume").click();
  await expect(overlay).toBeHidden();
  await expect(canvas).toHaveAttribute("data-program-paused", "false");
  await expect.poll(() => page.locator("#app").getAttribute("data-sound-effect-context"))
    .toBe("running");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("d");
  await expect.poll(async () => (await battleState(page)).cursor)
    .toEqual({ x: before.cursor.x + 1, y: before.cursor.y });

  // The keyboard-only path is available on laptops without a physical Pause key.
  await page.keyboard.press("p");
  await expect(overlay).toBeVisible();
  await expect(hostMenu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();

  // 點選單外壓暗的地方回到遊戲，這一下不會落到底下的戰場。
  await page.keyboard.press("p");
  await expect(overlay).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(overlay).toBeHidden();
  expect((await battleState(page)).actionMode).toBe(before.actionMode);
});

test("the reference panels opened from the menu keep the game paused until the player resumes", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await page.getByTestId("host-menu-trigger").click();
  const row = page.getByTestId("host-menu-row-roadmap");
  await row.click();
  const panel = page.getByTestId("roadmap");
  await expect(panel).toBeVisible();
  await expect(canvas).toHaveAttribute("data-program-paused", "true");
  // 面板蓋在暫停層之上，而且仍可操作。
  await page.getByTestId("roadmap-tab-story").click();
  await expect(page.getByTestId("roadmap-tab-story")).toHaveAttribute("aria-selected", "true");

  // 面板內的 Esc 回到選單，遊戲仍停著。
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  await expect(canvas).toHaveAttribute("data-program-paused", "true");

  // 面板開著時按 P 直接回到遊戲，面板一併收起。
  await row.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("p");
  await expect(panel).toBeHidden();
  await expect(hostMenu(page)).toBeHidden();
  await expect(canvas).toHaveAttribute("data-program-paused", "false");
});

/**
 * Chrome 只在下一次繪製更新才把焦點從 `display:none` 的元素移走。恢復時若不主動放掉，
 * 收起的紅寶石、選單列或面板控件會在那幾幀裡留著焦點，緊接著按的鍵落進暫停層自己的
 * 處理器而不是戰場（負載下 Caps Lock＋F4 約四次掉一次）。這裡在恢復的同一個工作階段裡
 * 讀焦點，中間沒有繪製更新，修正前必定失敗。
 */
test("resuming hands focus back at once, so the next key reaches the game", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const focusInOverlayAfter = (resume: "close-gem" | "p-key" | "panel-p-key") => page.evaluate((how) => {
    const target = how === "close-gem"
      ? document.querySelector<HTMLElement>("[data-testid=host-menu-close]")
      : document.activeElement;
    if (!(target instanceof HTMLElement)) throw new Error(`nothing to resume from (${how})`);
    target.focus();
    if (how === "close-gem") target.click();
    else target.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
    if (document.documentElement.dataset.programPaused !== "false") throw new Error(`${how} did not resume`);
    const active = document.activeElement;
    return active instanceof Element
      && (active.closest(".program-pause-overlay") !== null || active.closest("[data-program-pause-exempt]") !== null);
  }, resume);

  await page.getByTestId("host-menu-trigger").click();
  await expect(page.getByTestId("host-menu-close")).toBeVisible();
  expect(await focusInOverlayAfter("close-gem")).toBe(false);

  await page.getByTestId("host-menu-trigger").click();
  await expect(page.getByTestId("host-menu-row-resume")).toBeFocused();
  expect(await focusInOverlayAfter("p-key")).toBe(false);

  await page.getByTestId("host-menu-trigger").click();
  await page.getByTestId("host-menu-row-roadmap").click();
  await page.getByTestId("roadmap-tab-story").click();
  await expect(page.getByTestId("roadmap-tab-story")).toBeFocused();
  expect(await focusInOverlayAfter("panel-p-key")).toBe(false);
});

test("dialogue typing and portrait presentation retain their exact pause point", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-prebattle&difficulty=0");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const glyphs = page.locator("#dialogue-layer .dialogue-box:not([hidden]) .dialogue-glyph");
  await expect.poll(() => glyphs.count()).toBeGreaterThan(0);
  await page.keyboard.press("p");
  await expect(page.getByTestId("program-pause-overlay")).toBeVisible();

  const paused = await page.evaluate(() => {
    const activeBox = document.querySelector<HTMLElement>("#dialogue-layer .dialogue-box:not([hidden])");
    const activeCopy = activeBox?.querySelector<HTMLElement>(".dialogue-copy");
    const portrait = activeBox?.querySelector<HTMLElement>(".animated-portrait");
    return {
      glyphs: activeCopy?.querySelectorAll(".dialogue-glyph").length ?? 0,
      blinkCount: portrait?.dataset.blinkCount ?? "",
      mouthFrame: portrait?.dataset.mouthFrame ?? "",
      phase: (window.__ANGEL2__?.getState() as { phase: string } | undefined)?.phase,
    };
  });
  expect(paused.glyphs).toBeGreaterThan(0);

  // A battle shortcut would normally open another surface; under the pause it is consumed.
  await page.keyboard.press("g");
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => {
    const activeBox = document.querySelector<HTMLElement>("#dialogue-layer .dialogue-box:not([hidden])");
    const activeCopy = activeBox?.querySelector<HTMLElement>(".dialogue-copy");
    const portrait = activeBox?.querySelector<HTMLElement>(".animated-portrait");
    return {
      glyphs: activeCopy?.querySelectorAll(".dialogue-glyph").length ?? 0,
      blinkCount: portrait?.dataset.blinkCount ?? "",
      mouthFrame: portrait?.dataset.mouthFrame ?? "",
      phase: (window.__ANGEL2__?.getState() as { phase: string } | undefined)?.phase,
    };
  });
  expect(held).toEqual(paused);

  await page.keyboard.press("p");
  await expect(page.getByTestId("program-pause-overlay")).toBeHidden();
  await expect.poll(() => glyphs.count()).toBeGreaterThan(paused.glyphs);
});
