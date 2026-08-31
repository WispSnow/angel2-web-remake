import { expect, test, type Page } from "@playwright/test";
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

  // Pointer-down also unlocks Web Audio, then the click establishes the pause.
  await page.getByTestId("program-pause-toggle").click();
  const overlay = page.getByTestId("program-pause-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "true");
  await expect(canvas).toHaveAttribute("data-program-paused", "true");
  await expect(page.getByTestId("program-pause-resume")).toBeFocused();
  await expect.poll(() => page.locator("#app").getAttribute("data-sound-effect-context"))
    .toBe("suspended");

  await page.keyboard.press("d");
  await page.keyboard.press("g");
  await page.waitForTimeout(150);
  expect(await battleState(page)).toEqual(before);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/program-pause-desktop.png",
    animations: "allow",
  });

  await page.getByTestId("program-pause-resume").click();
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
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
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
