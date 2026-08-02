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

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("deployment projection preserves compact roster, semantic focus and feedback gate", async ({ page }) => {
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

  const ui = page.locator("#deployment-ui-root");
  await ui.focus();
  await ui.press("ArrowDown");
  await ui.press("Space");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-placements", /1@21,33/);

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
    .toHaveText("選擇出場人物；五至八人均可完成。");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");

  await page.screenshot({
    path: "artifacts/playwright/deployment-lab-desktop.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("pointer chooses a deployment cell without placing and empty pages use native feedback", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const canvas = page.getByTestId("deployment-canvas");
  await canvas.click({ position: { x: 340, y: 45 } });
  expect((await deploymentState(page))?.currentOpenCell).toEqual({ x: 25, y: 33 });
  expect((await deploymentState(page))?.placements).toHaveLength(5);

  await page.getByTestId("deployment-page-1").click();
  await expect(page.locator("#deployment-ui-root")).toHaveAttribute("data-roster-page", "1");
  await page.getByTestId("deployment-roster-0").click();
  await expect(page.getByTestId("deployment-status")).toHaveText("此處沒有人.");
  await page.getByTestId("deployment-page-0").click();
  await expect(page.getByTestId("deployment-status"))
    .toHaveText("選擇出場人物；五至八人均可完成。");
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
  expect((await deploymentState(page))?.placements).toHaveLength(5);
  const viewportBox = await page.locator("#deployment-viewport").boundingBox();
  expect(viewportBox?.width).toBeLessThanOrEqual(370);
  expect(viewportBox?.height).toBeGreaterThan(190);

  await page.screenshot({
    path: "artifacts/playwright/deployment-lab-narrow-reduced-motion.png",
    fullPage: true,
  });
});
