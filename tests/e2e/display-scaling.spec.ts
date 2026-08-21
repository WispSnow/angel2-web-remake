import { expect, test, type Page } from "@playwright/test";
import { columnGreenExcess, decodeScreenshot } from "./screenshot-pixels";
import { captureVisualAudit } from "./visual-audit";

const screenMetrics = (page: Page) => page.locator(".logical-screen").evaluate((element) => {
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

test.describe("smooth scaling on a HiDPI panel", () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  test("the battlefield never bleeds through the window frame", async ({ page }) => {
    // 画布只在相机视口 (40,23,400,308) 内绘制，外面完全透明。「平滑」会对整张
    // 画布做双线性重采样，把这条硬透明边缘向外晕开约一个装置像素；边框图必须画
    // 在画布之上才挡得住，否则左右雕像中间会出现一条战场颜色的细纹。
    await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await page.getByTestId("image-scaling-smooth").click();
    await expect.poll(() => page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--image-rendering").trim(),
    )).toBe("auto");

    const paintOrder = await page.evaluate(() => {
      const layer = (selector: string) => Number(
        getComputedStyle(document.querySelector(selector) as HTMLElement).zIndex,
      );
      return {
        backdrop: layer(".battle-backdrop"),
        canvas: layer("#phaser-root"),
        chrome: layer(".battle-chrome"),
        statues: layer(".battle-foreground"),
      };
    });
    expect(paintOrder.backdrop).toBeLessThan(paintOrder.canvas);
    expect(paintOrder.chrome).toBeGreaterThan(paintOrder.canvas);
    expect(paintOrder.statues).toBeGreaterThanOrEqual(paintOrder.chrome);

    const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
    expect(shot.width).toBe(1280);
    // 雕像所在的装置像素行；两侧视口边界落在装置列 80 与 880。
    const firstRow = 300;
    const lastRow = 640;
    const greenExcess = (x: number) => columnGreenExcess(shot, x, firstRow, lastRow);

    // 夹具校验：这些行的战场确实是绿色地形，否则下面的断言会空跑。
    expect(greenExcess(200)).toBeGreaterThan(8);

    // 视口边界两侧的边框列必须和它们的邻列一样中性。修复前左侧为 10.9、右侧为 4.5。
    for (const x of [79, 80, 880, 881]) {
      expect(greenExcess(x), `device column ${x} carries battlefield colour`).toBeLessThan(3);
    }
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

test("the logical screen clips its overflow without becoming scrollable", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // 邏輯畫面是純裁切，不是可捲區。用 `overflow: hidden` 時它其實有捲動餘量：位置牌
  // 的 17px 文字撐在 16px 行高裡，行內盒比 640x350 的下緣多出 2px。Chrome 只要想露出
  // 畫面裡剛被指向或取得焦點的控件（Playwright 點擊前的捲動、或選單開闔動畫還在跑時
  // 就被點到的按鈕都會觸發），就會把那 2px 捲掉，整個畫面連同肖像、對話窗與棋盤一起
  // 上移 2px 並停在那裡。`overflow: clip` 讓它根本不能捲。
  expect(await page.getByTestId("game-screen").evaluate((screen) => {
    const plate = document.querySelector(".bottom-location") as HTMLElement;
    const plateTop = () => plate.getBoundingClientRect().top - screen.getBoundingClientRect().top;
    const settled = plateTop();
    screen.scrollTop = 999;
    screen.scrollLeft = 999;
    return {
      settled,
      afterScrollAttempt: plateTop(),
      scrollTop: screen.scrollTop,
      scrollLeft: screen.scrollLeft,
    };
  })).toEqual({ settled: 332, afterScrollAttempt: 332, scrollTop: 0, scrollLeft: 0 });
});

test.describe("Tauri desktop window scaling", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      Object.defineProperty(window, "__TAURI_TEST_RESIZE_CALLS__", { value: calls });
      Object.defineProperties(window.screen, {
        availWidth: { value: 1920 },
        availHeight: { value: 1080 },
      });
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        value: {
          metadata: { currentWindow: { label: "main" } },
          invoke: async (command: string, args: Record<string, unknown>) => {
            if (command === "plugin:window|is_fullscreen" || command === "plugin:window|is_maximized") {
              return false;
            }
            if (command === "plugin:window|set_size") {
              const value = args.value as { toJSON?: () => unknown } | undefined;
              calls.push(value?.toJSON?.() ?? value);
            }
            return null;
          },
        },
      });
    });
  });

  test("fills a freely resized desktop client and integer mode sizes the native window", async ({ page }) => {
    await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-desktop-runtime", "true");
    await page.getByTestId("image-scaling-sharp").click();
    await expect.poll(() => screenMetrics(page)).toMatchObject({
      scale: 2,
      screenWidth: 1280,
      viewportWidth: 1280,
    });
    const panelBounds = await page.getByTestId("display-settings").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    expect(panelBounds.top).toBe(700);
    expect(panelBounds.bottom).toBeGreaterThan(panelBounds.top);
    expect(panelBounds.bottom).toBeLessThanOrEqual(800);
    await captureVisualAudit(page, {
      path: "artifacts/playwright/tauri-desktop-1280x800.png",
    });

    await page.setViewportSize({ width: 960, height: 600 });
    await expect.poll(async () => (await screenMetrics(page)).scale).toBeCloseTo(1.5, 6);
    expect((await screenMetrics(page)).screenWidth).toBe(960);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__?: unknown[] })
        .__TAURI_TEST_RESIZE_CALLS__;
      calls?.splice(0);
    });
    await page.getByTestId("image-scaling-integer").click();
    await expect.poll(() => page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__?: unknown[] })
        .__TAURI_TEST_RESIZE_CALLS__ ?? [];
      return calls.length;
    })).toBe(1);
    const logical = await page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__: Array<{
        Logical: { width: number; height: number };
      }> }).__TAURI_TEST_RESIZE_CALLS__;
      return calls.at(-1)?.Logical;
    });
    expect(logical?.width).toBe(1280);
    expect(logical?.height).toBeGreaterThan(700);
    expect(logical?.height).toBeLessThan(800);
  });
});
