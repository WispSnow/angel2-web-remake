import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const deploymentState = (page: Page) => page.evaluate(() => {
  const state = window.__ANGEL2_DEPLOYMENT_LAB__?.getState();
  return state && {
    placements: state.placements,
    currentOpenCell: state.currentOpenCell,
    rosterPage: state.rosterPage,
    focus: state.focus,
    feedback: state.feedback,
    submitted: state.submitted,
  };
});

const entryBox = (page: Page, index: number) =>
  page.getByTestId(`deployment-roster-${index}`).evaluate((element) => ({
    left: (element as HTMLElement).offsetLeft,
    top: (element as HTMLElement).offsetTop,
    width: (element as HTMLElement).offsetWidth,
    height: (element as HTMLElement).offsetHeight,
  }));

/** Counts the marker cores the minimap painted, by side colour. */
const minimapMarkerCounts = (page: Page) => page.getByTestId("deployment-minimap")
  .evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("minimap has no 2d context");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = { ally: 0, enemy: 0, open: 0 };
    for (let offset = 0; offset < data.length; offset += 4) {
      const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
      if (key === "85,85,255") counts.ally += 1;
      else if (key === "255,85,85") counts.enemy += 1;
      else if (key === "255,255,255") counts.open += 1;
    }
    return { ...counts, width: canvas.width, height: canvas.height };
  });

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("deployment projection keeps native roster topology, semantic focus and feedback gate", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/deployment-lab.html");

  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-4")).toContainText("葛蒂拉斯");
  await expect(page.getByTestId("deployment-roster-5")).toContainText("士兵");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("空名單");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "21,33");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-backdrop", "plain");
  // Roster indices are `column * 5 + row`; the remade grid must still flow down
  // each column so arrow navigation matches what the player sees.
  const [first, below, nextColumn, lastIndex] = await Promise.all(
    [0, 1, 5, 14].map((index) => entryBox(page, index)),
  );
  expect(below.left).toBe(first.left);
  expect(below.top).toBeGreaterThan(first.top);
  expect(nextColumn.top).toBe(first.top);
  expect(nextColumn.left).toBeGreaterThan(first.left);
  expect(lastIndex.left + lastIndex.width).toBeLessThanOrEqual(640);
  expect(lastIndex.top + lastIndex.height).toBeLessThanOrEqual(350);

  // The preview crops the battlefield to drawn terrain and scales by whole
  // pixels; five blue allies, seven red enemies and three white `FFh` cells
  // must all be painted, and no terrain colour may collide with them.
  const initialMarkers = await minimapMarkerCounts(page);
  expect(initialMarkers.width % 5).toBe(0);
  expect(initialMarkers.height % 5).toBe(0);
  expect(initialMarkers.ally).toBe(5 * 4 * 4);
  expect(initialMarkers.enemy).toBe(7 * 4 * 4);
  expect(initialMarkers.open).toBe(3 * 4 * 4);

  const ui = page.locator("#deployment-ui-root");
  await ui.focus();
  await ui.press("ArrowDown");
  await ui.press("Space");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-placements", /1@21,33/);
  expect(await minimapMarkerCounts(page)).toMatchObject({
    ally: initialMarkers.ally + 16,
    enemy: initialMarkers.enemy,
    open: initialMarkers.open - 16,
  });

  await ui.press("Tab");
  expect((await deploymentState(page))?.focus).toEqual({ kind: "map" });
  await ui.press("Enter");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "25,33");
  await ui.press("Space");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "23,33");

  await ui.press("Tab");
  await ui.press("ArrowUp");
  await ui.press("Space");
  await expect(page.getByTestId("deployment-status"))
    .toHaveText("此人必須出場戰鬥,不可放棄.");
  await ui.press("ArrowDown");
  expect((await deploymentState(page))?.focus).toEqual({ kind: "roster", index: 0 });
  await ui.press("Space");
  await expect(page.getByTestId("deployment-status"))
    .toHaveText("選擇出場人物；5至8人均可完成。");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");

  await page.getByTestId("deployment-screen").screenshot({
    path: "artifacts/playwright/deployment-lab-screen.png",
  });
  await page.screenshot({
    path: "artifacts/playwright/deployment-lab-desktop.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("the current landing cell blinks over a static canvas marker", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const blink = page.getByTestId("deployment-minimap-blink");

  // Cell (21,33) inside the (14,13) view box at five pixels per cell.
  expect(await blink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      left: (element as HTMLElement).offsetLeft,
      top: (element as HTMLElement).offsetTop,
      size: (element as HTMLElement).offsetWidth,
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
      color: style.backgroundColor,
    };
  })).toEqual({
    left: 36,
    top: 101,
    size: 4,
    duration: "1s",
    // `step-end` serialises as `steps(1)`: a hard 0.5 s on / 0.5 s off toggle.
    timing: "steps(1)",
    color: "rgb(85, 85, 255)",
  });

  // Only the accent moves: the canvas keeps painting the honest white `FFh`
  // core, so reduced motion and frozen captures never lose the marker.
  await page.locator('[data-open-cell="25,33"]').click();
  expect(await blink.evaluate((element) => (element as HTMLElement).offsetLeft)).toBe(56);
  expect(await minimapMarkerCounts(page)).toMatchObject({ ally: 80, open: 48 });

  await page.getByTestId("deployment-finish").click();
  await expect(blink).toHaveCount(0);
});

test("the remade read-out reports class, level, life, stats and class actions", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const detail = page.getByTestId("deployment-detail");

  await expect(detail).toContainText("妮雅");
  await expect(detail).toContainText("士兵 · Lv 3 · 普通");
  await expect(detail).toContainText("180／180");
  await expect(detail).toContainText("299／300");
  await expect(detail).toContainText("固定出場");

  await page.getByTestId("deployment-roster-4").click();
  await expect(detail).toContainText("葛蒂拉斯");
  await expect(detail).toContainText("魔術士 · Lv 1 · 技術");
  await expect(detail).toContainText("250／250");
  await expect(detail).toContainText("初級炎暴・初級落雷・初級冰雪");
  await expect(detail).toContainText("已出場");

  await page.getByTestId("deployment-roster-1").click();
  await expect(detail).toContainText("希蜜");
  await expect(detail).toContainText("已出場");
  await page.getByTestId("deployment-roster-1").click();
  await expect(detail).toContainText("待命中");
});

test("pointer chooses a deployment cell without placing and empty pages use native feedback", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  await page.locator('[data-open-cell="25,33"]').click();
  expect((await deploymentState(page))?.currentOpenCell).toEqual({ x: 25, y: 33 });
  expect((await deploymentState(page))?.placements).toHaveLength(5);

  await page.getByTestId("deployment-page-1").click();
  await expect(page.locator("#deployment-ui-root")).toHaveAttribute("data-roster-page", "1");
  await page.getByTestId("deployment-roster-0").click();
  await expect(page.getByTestId("deployment-status")).toHaveText("此處沒有人.");
  await page.getByTestId("deployment-page-0").click();
  await expect(page.getByTestId("deployment-status"))
    .toHaveText("選擇出場人物；5至8人均可完成。");
  await expect(page.locator("#deployment-ui-root")).toHaveAttribute("data-roster-page", "1");
  await page.getByTestId("deployment-page-0").click();
  await expect(page.locator("#deployment-ui-root")).toHaveAttribute("data-roster-page", "0");

  for (const index of [1, 2, 3]) await page.getByTestId(`deployment-roster-${index}`).click();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 8／8");
  await page.getByTestId("deployment-roster-4").click();
  await expect(page.getByTestId("deployment-status")).toHaveText("出場人數已滿.");
});

test("gamepad actions reach the same semantic reducer and contextual map cycle", async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      hapticActuators: [],
      id: "deployment-test-pad",
      index: 0,
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null,
    } as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (window as typeof window & { __setDeploymentPadButton?: (index: number, down: boolean) => void })
      .__setDeploymentPadButton = (index, down) => {
        buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 };
      };
  });
  const pulse = async (button: number) => {
    await page.evaluate((index) => {
      (window as typeof window & { __setDeploymentPadButton?: (index: number, down: boolean) => void })
        .__setDeploymentPadButton?.(index, true);
    }, button);
    await page.waitForTimeout(70);
    await page.evaluate((index) => {
      (window as typeof window & { __setDeploymentPadButton?: (index: number, down: boolean) => void })
        .__setDeploymentPadButton?.(index, false);
    }, button);
    await page.waitForTimeout(40);
  };

  await page.goto("/deployment-lab.html");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await pulse(13);
  await pulse(0);
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-placements", /1@21,33/);

  await pulse(4);
  expect((await deploymentState(page))?.focus).toEqual({ kind: "map" });
  await pulse(1);
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "25,33");
});

test("five-unit finish hides FF projection and narrow reduced-motion layout stays readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/deployment-lab.html");
  await page.getByTestId("deployment-finish").click();

  await expect(page.getByTestId("deployment-submitted")).toBeVisible();
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-submitted", "true");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "");
  await expect(page.locator("[data-open-cell]:not(:disabled)")).toHaveCount(0);
  expect((await deploymentState(page))?.placements).toHaveLength(5);
  const viewportBox = await page.locator("#deployment-viewport").boundingBox();
  expect(viewportBox?.width).toBeLessThanOrEqual(370);
  expect(viewportBox?.height).toBeGreaterThan(190);

  await page.screenshot({
    path: "artifacts/playwright/deployment-lab-narrow-reduced-motion.png",
    fullPage: true,
  });
});
