import { expect, test, type Page } from "@playwright/test";
import { skipStoryDialogue } from "./dialogue-controls";
import { skipOpeningToTitle } from "./startup-controls";
import { captureVisualAudit } from "./visual-audit";

async function enterStage0FromOrdinaryStartup(page: Page, difficulty: 0 | 3): Promise<void> {
  await page.goto("/");
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("difficulty-menu")).toBeVisible();
  await page.getByTestId(`difficulty-${difficulty}`).click();

  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await skipStoryDialogue(page);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await skipStoryDialogue(page);
  await expect(page.getByText("士兵／妮雅", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__ANGEL2__)).toBeUndefined();
}

async function expectHudValues(page: Page, identity: string, values: readonly string[]): Promise<void> {
  await expect(page.getByText(identity, { exact: true })).toBeVisible();
  await expect(page.getByTestId("unit-hud").locator(".unit-core-stat dd")).toHaveText([...values]);
}

// The 等級 column is the profession-internal growth row, not the native
// `DATA.field6` all-class-tree level. 騎兵 is the only stage-0 class where the
// two disagree: its three fixed rows carry `field6` 4/5/6, so 哈釘 reads 2 at
// difficulty 0 and 5 at difficulty 3. See `04-units-progression-balance.md`
// `[DD]` and `systems/promotion.md`.
test("S00-Q: ordinary startup exposes the native lowest and highest difficulty stats", async ({ page }) => {
  const cases = [
    {
      difficulty: 0 as const,
      soldier: ["170／170", "42／42", "24／24", "2", "101／200"],
      hading: ["230／230", "60／60", "33／33", "2", "181／360"],
      screenshot: "artifacts/playwright/stage0-difficulty-0-hading.png",
    },
    {
      difficulty: 3 as const,
      soldier: ["300／300", "70／70", "40／40", "5", "401／500"],
      hading: ["420／420", "100／100", "54／54", "5", "561／660"],
      screenshot: "artifacts/playwright/stage0-difficulty-3-hading.png",
    },
  ] as const;

  for (const scenario of cases) {
    await enterStage0FromOrdinaryStartup(page, scenario.difficulty);
    await expectHudValues(page, "士兵／妮雅", [
      "180／180",
      "45／45",
      "27／27",
      "3",
      "299／300",
    ]);

    const canvas = page.getByTestId("battle-canvas");
    const namedAlly = ["180／180", "45／45", "27／27", "3", "299／300"] as const;
    const genericAlly = ["160／160", "39／39", "21／21", "1", "0／100"] as const;
    // REMAKE-107: the four generic palace soldiers are campaign slots 43/42/40/41,
    // so the cycle reads their stable letters D/C/A/B instead of four identical rows.
    const allyCycle = [
      { identity: "士兵／士兵D", values: genericAlly },
      { identity: "士兵／士兵C", values: genericAlly },
      { identity: "士兵／希蜜", values: namedAlly },
      { identity: "士兵／士兵A", values: genericAlly },
      { identity: "士兵／士兵B", values: genericAlly },
      { identity: "士兵／妮雅", values: namedAlly },
    ] as const;
    for (const [index, ally] of allyCycle.entries()) {
      await canvas.click({ button: "right", position: { x: 220, y: 177 } });
      await expectHudValues(page, ally.identity, ally.values);
      if (scenario.difficulty === 0 && index === 2) {
        await captureVisualAudit(page.getByTestId("game-screen"), {
          path: "artifacts/playwright/stage0-allies-ximi.png",
        });
      }
    }

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expectHudValues(page, "士兵／士兵", scenario.soldier);

    for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowLeft");
    for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowDown");
    await expectHudValues(page, "騎兵／哈釘", scenario.hading);
    await captureVisualAudit(page.getByTestId("game-screen"), { path: scenario.screenshot });

    if (scenario.difficulty === 3) {
      await page.keyboard.press("g");
      await page.getByTestId("group-command-retreat").click();
      await page.locator("[data-action=retreat-confirm]").click();
      await page.locator("[data-action=retreat-confirm]").click();
      await expect(page.getByTestId("dialogue-layer")).toBeVisible();
      await skipStoryDialogue(page);
      await expect(page.getByText("士兵／妮雅", { exact: true })).toBeVisible();
      for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowLeft");
      for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowDown");
      await expectHudValues(page, "騎兵／哈釘", scenario.hading);
    }
  }
});
