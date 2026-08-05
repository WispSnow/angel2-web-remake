import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub links to the memory-only all-terrain arena", async ({ page }) => {
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-arena-link")).toHaveAttribute("href", "/arena.html");
  await expect(page.getByTestId("debug-arena-link")).toContainText("正式規則與 AI");
});

test("arena edits both rosters and starts a formal-rule battle without touching saves", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await expect(page.getByRole("heading", { name: "全地形競技場" })).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-ally-count]")).toHaveText("4 人");
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("4 人");
  await expect(page.getByTestId("arena-class").locator("option")).toHaveCount(22);
  await expect(page.locator("[data-terrain-slot]")).toHaveCount(8);
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("arena-side").selectOption("2");
  await page.getByTestId("arena-class").selectOption("magician");
  await page.getByTestId("arena-level").selectOption("3");
  expect(await page.evaluate(() => window.__ANGEL2_ARENA__?.interact(21, 30))).toBe(true);
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  await page.screenshot({ path: `${ARTIFACT_DIR}/arena-setup.png`, fullPage: true });

  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("arena-battle-toolbar")).toContainText("4 vs 5");
  const state = await page.evaluate(() => window.__ANGEL2_ARENA__?.getState() as {
    mode: string;
    battle: {
      stageId: string;
      phase: string;
      campaignPersistenceEnabled: boolean;
      systemCommands: Array<{ id: string }>;
      units: Array<{ side: number; classId: string; x: number; y: number }>;
    };
  });
  expect(state).toMatchObject({
    mode: "battle",
    battle: {
      stageId: "stage-01",
      phase: "player",
      campaignPersistenceEnabled: false,
      systemCommands: [{ id: "settings" }, { id: "objectives" }],
    },
  });
  expect(state.battle.units).toContainEqual(expect.objectContaining({
    side: 2,
    classId: "magician",
    x: 21,
    y: 30,
  }));
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-battle.png`,
  });

  await page.getByTestId("arena-return-setup").click();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
});

test("arena setup remains usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/arena.html?test=1");
  await expect(page.getByTestId("arena-start")).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root")).toBeVisible();
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${ARTIFACT_DIR}/arena-setup-narrow.png`, fullPage: true });
});
