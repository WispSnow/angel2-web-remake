import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub links to the memory-only all-class showdown", async ({ page }) => {
  await page.goto("/debug.html");
  const link = page.getByTestId("debug-class-showdown-link");
  await expect(link).toHaveAttribute("href", "/class-showdown.html");
  await expect(link).toContainText("35 組同職業敵我相鄰");
});

test("all-class showdown applies one level to every mirror and enters formal battle", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");

  await expect(page.getByRole("heading", { name: "全職業對陣場" })).toBeVisible();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  await expect(page.getByText("35 MATCHUPS · 70 UNITS")).toBeVisible();
  await expect(page.getByText(/女帝、龍、頭、手屬於特殊運行記錄/)).toBeVisible();
  await expect(page.getByTestId("class-showdown-status")).toContainText("35 組、70 名單位");
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("class-showdown-level").selectOption("2");
  await page.getByTestId("class-showdown-apply-level").click();
  await expect(page.getByTestId("class-showdown-status")).toContainText("全部 35 組職業");
  const setupState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    level: number;
    placements: Array<{ side: number; classId: string; level: number; x: number; y: number }>;
  });
  expect(setupState.mode).toBe("setup");
  expect(setupState.level).toBe(2);
  expect(setupState.placements).toHaveLength(70);
  expect(setupState.placements.every(({ level }) => level === 2)).toBe(true);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-setup.png`,
    fullPage: true,
  });

  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("class-showdown-toolbar")).toContainText("35 組 · 第 2 級資料");
  const battleState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    battle: {
      phase: string;
      campaignPersistenceEnabled: boolean;
      units: Array<{ side: number; classId: string; experience: number; x: number; y: number }>;
    };
  });
  expect(battleState).toMatchObject({
    mode: "battle",
    battle: {
      phase: "player",
      campaignPersistenceEnabled: false,
    },
  });
  expect(battleState.battle.units).toHaveLength(70);
  expect(battleState.battle.units.filter(({ side }) => side === 1)).toHaveLength(35);
  expect(battleState.battle.units.filter(({ side }) => side === 2)).toHaveLength(35);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-battle.png`,
  });

  await page.getByTestId("class-showdown-return").click();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
  expect(pageErrors).toEqual([]);
});
