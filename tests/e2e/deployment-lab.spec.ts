import { expect, test, type Page } from "@playwright/test";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { captureVisualAudit } from "./visual-audit";

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

const rootRelativeBox = async (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const root = element.closest(".deployment-ui-root");
  if (!(root instanceof HTMLElement)) throw new Error("deployment UI root is missing");
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const scale = rootRect.width / root.clientWidth;
  return {
    left: Math.round((rect.left - rootRect.left) / scale),
    top: Math.round((rect.top - rootRect.top) / scale),
    width: Math.round(rect.width / scale),
    height: Math.round(rect.height / scale),
  };
});

const minimapCell = (page: Page, x: number, y: number) => page.getByTestId("deployment-minimap")
  .evaluate((element, position) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("minimap has no 2d context");
    const pixel = (px: number, py: number) => [...context.getImageData(px, py, 1, 1).data.slice(0, 3)];
    return {
      outer: pixel(position.x * 4, position.y * 4),
      core: pixel(position.x * 4 + 1, position.y * 4 + 1),
      width: canvas.width,
      height: canvas.height,
    };
  }, { x, y });

const nativeTextBounds = (
  page: Page,
  region: { left: number; top: number; width: number; height: number },
) => page.locator(".deployment-native-text").evaluate((element, bounds) => {
  const canvas = element as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("native text canvas has no 2d context");
  const pixels = context.getImageData(bounds.left, bounds.top, bounds.width, bounds.height).data;
  let left = bounds.width;
  let top = bounds.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      if (pixels[(y * bounds.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : {
    left: bounds.left + left,
    top: bounds.top + top,
    right: bounds.left + right,
    bottom: bounds.top + bottom,
  };
}, region);

test("deployment projection reproduces module-27 geometry and keeps semantic input", async ({ page }) => {
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

  expect(await rootRelativeBox(page, ".deployment-entry:nth-child(1)")).toEqual({ left: 8, top: 35, width: 130, height: 50 });
  expect(await rootRelativeBox(page, ".deployment-entry:nth-child(6)")).toEqual({ left: 152, top: 35, width: 130, height: 50 });
  expect(await rootRelativeBox(page, ".deployment-entry:nth-child(15)")).toEqual({ left: 296, top: 275, width: 130, height: 50 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-roster-0"]')).toEqual({ left: 64, top: 59, width: 74, height: 24 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-roster-5"]')).toEqual({ left: 208, top: 59, width: 74, height: 24 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-roster-14"]')).toEqual({ left: 352, top: 299, width: 74, height: 24 });
  const figureFrame = await rootRelativeBox(page, ".deployment-entry:nth-child(1) .deployment-entry-figure-frame");
  const figure = await rootRelativeBox(page, ".deployment-entry:nth-child(1) .deployment-entry-figure");
  const soldierFrame = await rootRelativeBox(page, ".deployment-entry:nth-child(6) .deployment-entry-figure-frame");
  const soldierFigure = await rootRelativeBox(page, ".deployment-entry:nth-child(6) .deployment-entry-figure");
  const profession = await rootRelativeBox(page, '[data-testid="deployment-roster-0"]');
  expect(figure.left + figure.width / 2).toBe(figureFrame.left + figureFrame.width / 2);
  expect(Math.abs(
    figure.top + figure.height / 2 - (figureFrame.top + figureFrame.height / 2),
  )).toBeLessThanOrEqual(0.5);
  expect(soldierFigure).toMatchObject({ width: 32, height: 43 });
  expect(soldierFigure.left + soldierFigure.width / 2)
    .toBe(soldierFrame.left + soldierFrame.width / 2);
  expect(Math.abs(
    soldierFigure.top + soldierFigure.height / 2
      - (soldierFrame.top + soldierFrame.height / 2),
  )).toBeLessThanOrEqual(0.5);
  expect(profession.left).toBe(figureFrame.left + figureFrame.width);

  const longName = { left: 8, top: 275, width: 130, height: 24 };
  const longClass = { left: 8, top: 299, width: 130, height: 24 };
  await expect.poll(() => nativeTextBounds(page, longName)).not.toBeNull();
  const nameInk = await nativeTextBounds(page, longName);
  const classInk = await nativeTextBounds(page, longClass);
  if (!nameInk || !classInk) throw new Error("roster name and profession ink must be painted");
  for (const ink of [nameInk, classInk]) {
    expect(ink.left).toBeGreaterThanOrEqual(64);
    expect(ink.right).toBeLessThan(138);
    expect(Math.abs((ink.left + ink.right + 1) / 2 - 101)).toBeLessThanOrEqual(0.5);
  }
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: "artifacts/playwright/deployment-roster-alignment.png",
  });
  expect(await rootRelativeBox(page, '[data-testid="deployment-page-0"]')).toEqual({ left: 440, top: 35, width: 80, height: 24 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-page-2"]')).toEqual({ left: 440, top: 95, width: 80, height: 24 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-finish"]')).toEqual({ left: 540, top: 35, width: 80, height: 24 });
  expect(await rootRelativeBox(page, '[data-testid="deployment-minimap"]')).toEqual({ left: 440, top: 125, width: 200, height: 200 });

  await expect.poll(() => minimapCell(page, 22, 14)).toEqual({
    outer: [0, 0, 0], core: [239, 32, 36], width: 200, height: 200,
  });
  expect(await minimapCell(page, 21, 33)).toEqual({
    outer: [0, 0, 0], core: [255, 255, 255], width: 200, height: 200,
  });
  const firstPlacement = (await deploymentState(page))?.placements[0];
  if (!firstPlacement) throw new Error("initial fixed placement is missing");
  expect(await minimapCell(page, firstPlacement.position.x, firstPlacement.position.y)).toEqual({
    outer: [0, 0, 0], core: [77, 138, 255], width: 200, height: 200,
  });

  const ui = page.locator("#deployment-ui-root");
  await ui.focus();
  await ui.press("ArrowDown");
  await ui.press("Space");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-placements", /1@21,33/);
  expect(await minimapCell(page, 21, 33)).toEqual({
    outer: [0, 0, 0], core: [77, 138, 255], width: 200, height: 200,
  });

  await ui.press("Tab");
  expect((await deploymentState(page))?.focus).toEqual({ kind: "map" });
  await ui.press("Escape");
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

  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: "artifacts/playwright/deployment-lab-screen.png",
  });
  await captureVisualAudit(page, {
    path: "artifacts/playwright/deployment-lab-desktop.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("all player profession figures keep their native proportions in deployment and promotion slots", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const figures = Object.entries(ALLY_MAP_UNIT_ASSETS).map(([classId, source]) => ({
    classId,
    source,
  }));
  const metrics = await page.evaluate(async (assets) => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:200px;height:200px;";
    document.body.append(host);

    const results = [];
    for (const asset of assets) {
      const deploymentEntry = document.createElement("div");
      deploymentEntry.className = "deployment-entry";
      deploymentEntry.style.position = "relative";
      const deploymentFrame = document.createElement("span");
      deploymentFrame.className = "deployment-entry-figure-frame";
      const deploymentSlot = document.createElement("span");
      deploymentSlot.className = "deployment-entry-figure-slot";
      const deploymentImage = document.createElement("img");
      deploymentImage.className = "deployment-entry-figure";
      deploymentImage.src = asset.source;
      deploymentSlot.append(deploymentImage);
      deploymentEntry.append(deploymentFrame, deploymentSlot);

      const promotionOption = document.createElement("button");
      promotionOption.className = "promotion-option";
      const promotionSlot = document.createElement("span");
      promotionSlot.className = "promotion-art-slot";
      const promotionImage = document.createElement("img");
      promotionImage.className = "promotion-art";
      promotionImage.src = asset.source;
      promotionSlot.append(promotionImage);
      promotionOption.append(promotionSlot);
      host.replaceChildren(deploymentEntry, promotionOption);

      await Promise.all([deploymentImage.decode(), promotionImage.decode()]);
      const deploymentRect = deploymentImage.getBoundingClientRect();
      const deploymentFrameRect = deploymentFrame.getBoundingClientRect();
      const promotionRect = promotionImage.getBoundingClientRect();
      const promotionOptionRect = promotionOption.getBoundingClientRect();
      results.push({
        classId: asset.classId,
        natural: [deploymentImage.naturalWidth, deploymentImage.naturalHeight],
        deployment: {
          width: deploymentRect.width,
          height: deploymentRect.height,
          centerOffsetX: deploymentRect.left + deploymentRect.width / 2
            - (deploymentFrameRect.left + deploymentFrameRect.width / 2),
          centerOffsetY: deploymentRect.top + deploymentRect.height / 2
            - (deploymentFrameRect.top + deploymentFrameRect.height / 2),
        },
        promotion: {
          width: promotionRect.width,
          height: promotionRect.height,
          centerOffsetX: promotionRect.left + promotionRect.width / 2
            - (promotionOptionRect.left + promotionOptionRect.width / 2),
          centerOffsetY: promotionRect.top + promotionRect.height / 2
            - (promotionOptionRect.top + promotionOptionRect.height / 2),
        },
      });
    }
    host.remove();
    return results;
  }, figures);

  expect(metrics).toHaveLength(36);
  for (const metric of metrics) {
    const [naturalWidth, naturalHeight] = metric.natural;
    expect(metric.deployment.width, `${metric.classId} deployment width`).toBe(naturalWidth);
    expect(metric.deployment.height, `${metric.classId} deployment height`).toBe(naturalHeight);
    expect(Math.abs(metric.deployment.centerOffsetX), `${metric.classId} deployment x center`)
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(metric.deployment.centerOffsetY), `${metric.classId} deployment y center`)
      .toBeLessThanOrEqual(0.5);
    expect(metric.promotion.width, `${metric.classId} promotion width`).toBe(naturalWidth);
    expect(metric.promotion.height, `${metric.classId} promotion height`).toBe(naturalHeight);
    expect(Math.abs(metric.promotion.centerOffsetX), `${metric.classId} promotion x center`)
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(metric.promotion.centerOffsetY), `${metric.classId} promotion y center`)
      .toBeLessThanOrEqual(0.5);
  }

  expect(Object.fromEntries(metrics.map(({ classId, natural }) => [classId, natural])))
    .toMatchObject({
      "curse-master": [32, 43],
      "magic-archer": [32, 43],
      crossbow: [32, 43],
    });
});

test("the current FF cell uses the native inverse 4x4 projection", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const blink = page.getByTestId("deployment-minimap-blink");

  expect(await blink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      left: (element as HTMLElement).offsetLeft,
      top: (element as HTMLElement).offsetTop,
      size: (element as HTMLElement).offsetWidth,
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
    };
  })).toEqual({ left: 84, top: 132, size: 4, duration: "1s", timing: "steps(1)" });
  await expect(blink).toHaveAttribute("data-current-cell", "21,33");

  const colorsAt = (milliseconds: number) => blink.evaluate((element, currentTime) => {
    const animations = element.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = currentTime;
    }
    return {
      outer: getComputedStyle(element).backgroundColor,
      core: getComputedStyle(element, "::after").backgroundColor,
    };
  }, milliseconds);

  expect(await colorsAt(250)).toEqual({ outer: "rgb(0, 0, 0)", core: "rgb(255, 255, 255)" });
  await captureVisualAudit(page.locator(".deployment-map-frame"), {
    path: "artifacts/playwright/deployment-current-cell-native.png",
    animations: "allow",
  });
  expect(await colorsAt(750)).toEqual({ outer: "rgb(255, 255, 255)", core: "rgb(0, 0, 0)" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(blink).toHaveCSS("animation-name", "deployment-native-cell-outer");
  await expect(blink).toHaveCSS("animation-duration", "1s");

  await page.locator('[data-open-cell="25,33"]').click();
  expect(await blink.evaluate((element) => (element as HTMLElement).offsetLeft)).toBe(100);
  await expect(blink).toHaveAttribute("data-current-cell", "25,33");
  await page.getByTestId("deployment-finish").click();
  await expect(blink).toHaveCount(0);
});

test("rich character information is hover and keyboard enhancement only", async ({ page }) => {
  await page.goto("/deployment-lab.html");
  const details = page.locator(".deployment-detail");
  expect(await details.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).visibility === "hidden"))).toBe(true);

  await page.getByTestId("deployment-roster-4").hover();
  const detail = page.getByTestId("deployment-detail-4");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("葛蒂拉斯");
  await expect(detail).toContainText("魔術士 · Lv 1 · 技術");
  await expect(detail).toContainText("250／250");
  await expect(detail).toContainText("初級炎暴・初級落雷・初級冰雪");
  const cardBox = await rootRelativeBox(page, '[data-testid="deployment-detail-4"]');
  expect(cardBox.left).toBeGreaterThanOrEqual(0);
  expect(cardBox.left + cardBox.width).toBeLessThanOrEqual(640);
  expect(cardBox.top + cardBox.height).toBeLessThanOrEqual(328);

  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: "artifacts/playwright/deployment-lab-hover-detail.png",
  });

  await page.getByTestId("deployment-roster-1").hover();
  await expect(page.getByTestId("deployment-detail-1")).toBeVisible();
  await page.getByTestId("deployment-roster-1").click();
  await expect(page.getByTestId("deployment-detail-1")).toBeHidden();
  await page.mouse.move(1, 0);

  const ui = page.locator("#deployment-ui-root");
  await ui.focus();
  await ui.press("ArrowDown");
  await expect(page.getByTestId("deployment-detail-2")).toBeVisible();
});

test("pointer pages, native feedback gate and capacity rules remain unchanged", async ({ page }) => {
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
  expect(await rootRelativeBox(page, ".deployment-error-frame")).toEqual({ left: 2, top: 328, width: 636, height: 20 });
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
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [gamepad] });
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

test("five-unit finish hides FF projection and narrow screen keeps native composition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/deployment-lab.html");
  await page.getByTestId("deployment-finish").click();

  await expect(page.getByTestId("deployment-submitted")).toContainText("部署結果已建立");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-submitted", "true");
  await expect(page.getByTestId("deployment-canvas"))
    .toHaveAttribute("data-deployment-current-cell", "");
  await expect(page.locator("[data-open-cell]:not(:disabled)")).toHaveCount(0);
  expect((await deploymentState(page))?.placements).toHaveLength(5);
  const viewportBox = await page.locator("#deployment-viewport").boundingBox();
  expect(viewportBox?.width).toBeLessThanOrEqual(370);
  expect(viewportBox?.height).toBeGreaterThan(190);

  await captureVisualAudit(page, {
    path: "artifacts/playwright/deployment-lab-narrow-reduced-motion.png",
    fullPage: true,
  });
});
