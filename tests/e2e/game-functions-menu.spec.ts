import { expect, test } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

test("game functions reproduces the native five-switch submenu", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-player&difficulty=0&test=1");
  const battleCanvas = page.getByTestId("battle-canvas");
  await expect(battleCanvas).toBeVisible();
  await battleCanvas.hover({ position: { x: 420, y: 45 } });

  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  const menu = page.getByTestId("settings-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-label", "子 選 單");
  await expect(menu.locator("h2")).toHaveText("子 選 單");

  const rows = menu.locator("[data-settings-index]");
  await expect(rows).toHaveCount(5);
  await expect(rows.locator(".native-settings-label")).toHaveText([
    "人物圖像",
    "戰鬥動畫",
    "地圖方格",
    "地圖捲動",
    "ＡＩ對話",
  ]);
  await expect(rows.locator(".native-settings-state")).toHaveText(["ON", "ON", "OFF", "ON", "ON"]);
  await expect(page.getByTestId("speed-button")).toHaveCount(0);
  await expect(page.getByTestId("sound-button")).toHaveCount(0);
  await expect(page.getByTestId("music-button")).toHaveCount(0);
  await expect(page.getByTestId("group-commands-button")).toHaveCount(0);
  for (const key of ["e", "m", "Tab"]) {
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
  }
  await expect(page.getByTestId("sound-settings-menu")).toBeHidden();
  await expect(page.getByTestId("music-settings-menu")).toBeHidden();
  await expect(page.getByTestId("group-command-menu")).toBeHidden();

  const presentation = await menu.evaluate((element) => {
    const style = getComputedStyle(element);
    const menuBounds = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll("button")].map((button) => {
      const bounds = button.getBoundingClientRect();
      return {
        left: bounds.left - menuBounds.left,
        top: bounds.top - menuBounds.top,
        width: bounds.width,
        height: bounds.height,
        cursor: getComputedStyle(button).cursor,
      };
    });
    return {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
      background: style.backgroundColor,
      shadow: style.boxShadow,
      buttons,
    };
  });
  expect(presentation).toMatchObject({
    left: "280px",
    top: "40px",
    width: "128px",
    height: "175px",
    background: "rgb(93, 65, 49)",
  });
  expect(presentation.shadow).toContain("16px 16px");
  expect(presentation.buttons).toHaveLength(5);
  for (const [index, button] of presentation.buttons.entries()) {
    expect(button).toMatchObject({ left: 8, top: 38 + index * 25, width: 112, height: 24 });
    expect(button.cursor).toContain("command-menu-pointer.png");
  }

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/game-functions-native-menu.png",
  });

  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("presentation-button")).toHaveClass(/is-selected/);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("presentation-button")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("presentation-button").locator(".native-settings-state")).toHaveText("OFF");

  await page.getByTestId("portraits-button").click();
  await expect(page.getByTestId("portraits-button")).toHaveAttribute("aria-checked", "false");
  const state = await page.evaluate(() => window.__ANGEL2__?.getState() as {
    settingsMenuIndex: number;
    battlePresentation: "map" | "full";
    portraitsEnabled: boolean;
  });
  expect(state).toMatchObject({
    settingsMenuIndex: 0,
    battlePresentation: "map",
    portraitsEnabled: false,
  });

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByTestId("system-menu")).toBeVisible();
});
