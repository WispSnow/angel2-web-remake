import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("title artwork uses staged palette fades before the menu appears", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("x");

  const title = page.getByTestId("title-screen");
  const opacityOf = (selector: string) => title.locator(selector).evaluate((element) =>
    Number(getComputedStyle(element).opacity));

  await expect(page.getByTestId("title-menu")).toBeHidden();
  await expect.poll(() => opacityOf(".startup-title-background")).toBeGreaterThan(0);
  expect(await opacityOf(".startup-title-upper")).toBe(0);
  expect(await opacityOf(".startup-title-lower")).toBe(0);

  await expect.poll(() => opacityOf(".startup-title-upper")).toBeGreaterThan(0);
  expect(await opacityOf(".startup-title-lower")).toBe(0);
  await expect(page.getByTestId("title-menu")).toBeHidden();

  await expect.poll(() => opacityOf(".startup-title-lower")).toBeGreaterThan(0);
  await expect(page.getByTestId("title-menu")).toBeHidden();
  await expect(page.getByTestId("title-menu")).toBeVisible();
});

test("BOOT-A: opening story, title and difficulty selection enter stage zero", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?test=1");
  const startup = page.getByTestId("startup-screen");
  const intro = page.getByTestId("opening-intro");
  await expect(startup).toHaveAttribute("data-startup-phase", "intro");
  await expect(intro).toBeVisible();
  await expect.poll(() => intro.locator(".startup-intro-background").evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth === 608 && element.naturalHeight === 257;
  })).toBe(true);
  await expect.poll(() => intro.locator("[data-intro-slot]").evaluateAll((lines) =>
    lines.some((line) => !line.hasAttribute("hidden") && (line.textContent?.trim().length ?? 0) > 0),
  )).toBe(true);
  await startup.screenshot({ path: "artifacts/playwright/startup-opening-intro.png" });

  await page.keyboard.press("x");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect.poll(() => page.getByTestId("title-screen").locator(".startup-title-upper").evaluate((image) =>
    getComputedStyle(image).animationName,
  )).toContain("startup-palette-fade");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await expect(page.getByTestId("new-game")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("startup-title-menu-frame")).toBeVisible();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toBeHidden();
  await expect(page.getByTestId("startup-title-menu-frame")).toHaveCSS("top", "50px");
  await expect.poll(() => page.getByTestId("title-screen").locator("img").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await startup.screenshot({ path: "artifacts/playwright/startup-title-menu.png" });

  await page.keyboard.press("Enter");
  const difficultyMenu = page.getByTestId("difficulty-menu");
  await expect(difficultyMenu).toBeVisible();
  await expect(difficultyMenu.getByRole("menuitem")).toHaveCount(4);
  await expect(page.getByTestId("difficulty-0")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("startup-title-menu-frame")).toBeHidden();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toBeVisible();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toHaveCSS("top", "21px");
  await expect.poll(() => page.getByTestId("startup-difficulty-menu-frame").evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth === 144 && element.naturalHeight === 150;
  })).toBe(true);
  await startup.screenshot({ path: "artifacts/playwright/startup-difficulty-menu.png" });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("difficulty-2")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  const debugState = await page.evaluate(() => window.__ANGEL2__?.getState() as { phase: string; difficulty: number });
  expect(debugState).toMatchObject({ phase: "prebattleStory", difficulty: 2 });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/startup-stage0-entry.png" });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
