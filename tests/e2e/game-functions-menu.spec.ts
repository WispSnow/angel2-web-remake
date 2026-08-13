import { expect, test } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

test("game functions opens contained sound controls and the group-command menu", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-player&difficulty=0&test=1");
  const battleCanvas = page.getByTestId("battle-canvas");
  await expect(battleCanvas).toBeVisible();
  await battleCanvas.hover({ position: { x: 420, y: 45 } });

  await expect(page.getByTestId("system-menu-button")).toBeVisible();
  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();

  await page.getByTestId("sound-button").click();
  const soundMenu = page.getByTestId("sound-settings-menu");
  await expect(soundMenu).toBeVisible();
  const containment = await soundMenu.evaluate((menu) => {
    const menuBounds = menu.getBoundingClientRect();
    return [...menu.querySelectorAll("button")].map((button) => {
      const buttonBounds = button.getBoundingClientRect();
      return {
        left: buttonBounds.left - menuBounds.left,
        right: menuBounds.right - buttonBounds.right,
      };
    });
  });
  expect(containment.length).toBe(5);
  for (const [index, inset] of containment.entries()) {
    expect(inset.left, `sound button ${index} left edge`).toBeGreaterThanOrEqual(0);
    expect(inset.right, `sound button ${index} right edge`).toBeGreaterThanOrEqual(0);
  }
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/game-functions-sound-menu.png",
  });

  await page.getByTestId("close-sound-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await page.getByTestId("group-commands-button").click();
  await expect(page.getByTestId("settings-menu")).toBeHidden();
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await expect(page.getByTestId("group-command-allRest")).toBeVisible();
  await expect(page.getByTestId("group-command-retreat")).toBeVisible();
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    groupCommandOpen: boolean;
    settingsOpen: boolean;
  });
  expect(state).toMatchObject({ groupCommandOpen: true, settingsOpen: false });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/game-functions-group-command-menu.png",
  });
});
