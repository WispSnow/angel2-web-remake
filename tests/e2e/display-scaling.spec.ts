import { expect, test, type Page } from "@playwright/test";

const screenMetrics = (page: Page) => page.getByTestId("startup-screen").evaluate((element) => {
  const style = getComputedStyle(element);
  const viewport = element.parentElement as HTMLElement;
  return {
    imageRendering: style.imageRendering,
    scale: Number(style.getPropertyValue("--game-scale")),
    offset: style.getPropertyValue("--game-offset-x").trim(),
    screenWidth: element.getBoundingClientRect().width,
    viewportWidth: viewport.clientWidth,
    documentMode: document.documentElement.dataset.imageScaling,
  };
});

test("the scaling picker lives outside the logical screen and defaults to sharp", async ({ page }) => {
  await page.goto("/");
  const panel = page.getByTestId("display-settings");
  await expect(panel).toBeVisible();

  // The picker is host chrome, not an original menu entry: it must never be
  // inside the 640x350 logical screen the original UI evidence describes.
  await expect(panel.locator("xpath=ancestor::*[@data-testid='startup-screen']")).toHaveCount(0);
  await expect(panel.getByRole("radio")).toHaveText(["銳利", "平滑", "整數倍"]);
  await expect(page.getByTestId("image-scaling-sharp")).toHaveAttribute("aria-checked", "true");
  await expect(await screenMetrics(page)).toMatchObject({
    imageRendering: "pixelated",
    scale: 1,
    documentMode: "sharp",
  });
});

test("smooth swaps the filter without moving the screen", async ({ page }) => {
  await page.goto("/");
  const before = await screenMetrics(page);
  await page.getByTestId("image-scaling-smooth").click();

  const after = await screenMetrics(page);
  expect(after.imageRendering).toBe("auto");
  expect(after.documentMode).toBe("smooth");
  expect(after.scale).toBe(before.scale);
  expect(after.screenWidth).toBe(before.screenWidth);

  // The choice is a device preference, so it has to survive a reload without a save.
  await page.reload();
  await expect(page.getByTestId("image-scaling-smooth")).toHaveAttribute("aria-checked", "true");
  expect((await screenMetrics(page)).imageRendering).toBe("auto");
});

test.describe("fractional device pixel ratio", () => {
  test.use({ viewport: { width: 500, height: 800 }, deviceScaleFactor: 2 });

  test("integer snaps the scale to whole device pixels and letterboxes the slack", async ({ page }) => {
    await page.goto("/");
    const fitted = await screenMetrics(page);
    // 500px viewport, 640px logical screen: the default fit is fractional.
    expect(fitted.scale).toBeGreaterThan(.5);
    expect(fitted.scale).toBeLessThan(1);
    expect(fitted.scale * 640 * 2 % 1).toBeCloseTo(0, 6);

    await page.getByTestId("image-scaling-integer").click();
    const snapped = await screenMetrics(page);
    expect(snapped.documentMode).toBe("integer");
    expect(snapped.imageRendering).toBe("pixelated");
    expect(snapped.scale).toBe(.5);
    expect(snapped.scale * 2).toBe(1);
    // The screen no longer fills the viewport, so it is centred on the grid.
    expect(snapped.screenWidth).toBeLessThan(snapped.viewportWidth);
    expect(Number.parseFloat(snapped.offset) * 2 % 1).toBeCloseTo(0, 6);
    expect(Number.parseFloat(snapped.offset)).toBeCloseTo(
      (snapped.viewportWidth - snapped.screenWidth) / 2,
      1,
    );
  });
});

test("keyboard focus inside the picker never reaches the battlefield", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const cursor = () => page.evaluate(() =>
    (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } } | undefined)?.cursor);
  const before = await cursor();
  expect(before).toBeDefined();

  // `ui.ts` binds keydown on `window`, so an unstopped press in the host chrome
  // would drive the battle cursor while the player is only picking a filter.
  await page.getByTestId("image-scaling-sharp").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("image-scaling-smooth")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("image-scaling-integer")).toHaveAttribute("aria-checked", "true");
  for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "w", "a", "s", "z"]) {
    await page.keyboard.press(key);
  }
  expect(await cursor()).toEqual(before);
});
