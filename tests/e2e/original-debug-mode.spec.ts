import { expect, type Page, test } from "@playwright/test";
import { expectMenuOpen, settleMenuAnimation } from "./menu-controls";
import { captureVisualAudit } from "./visual-audit";

/**
 * `REMAKE-174` 原版除錯模式（第一批）與常駐音樂盒。
 *
 * 原版要按住 Caps Lock 才把待機戰場的按鍵交給除錯分發器（模組 29 `0000:B78C`）；
 * 合成鍵盤事件設不了 Caps Lock 的鎖定狀態，所以這裡用「按住」那一條路徑。
 */
async function withCapsLock(page: Page, key: string): Promise<void> {
  await page.keyboard.down("CapsLock");
  await page.keyboard.press(key);
  await page.keyboard.up("CapsLock");
}

async function openBattle(page: Page, scenario: string): Promise<void> {
  await page.goto(`/?debugScenario=${scenario}&difficulty=0&test=1`);
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-phase", "player");
}

test("the 原版除錯 switch arms the native Caps Lock menus and survives a reload", async ({ page }) => {
  await openBattle(page, "stage-00-player");
  const toggle = page.getByTestId("original-debug-toggle");
  const lifeMenu = page.getByTestId("debug-life-menu");
  await expect(toggle).toHaveText("原版除錯");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // Switch off: Caps Lock+J is an unbound key, and F1–F4 keep their group-command meaning.
  await withCapsLock(page, "j");
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-phase", "player");
  await expect(lifeMenu).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await withCapsLock(page, "F4");
  await expectMenuOpen(lifeMenu);
  await expect(lifeMenu.locator("button")).toHaveText(["我全滿", "我全滅", "我 1"]);
  await settleMenuAnimation(lifeMenu);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-life-menu.png",
  });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(lifeMenu.locator("button.is-selected")).toHaveText("我 1");
  await page.keyboard.press("Enter");
  await expect(lifeMenu).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("原版除錯：我方");
  const allyLives = await page.getByTestId("battle-canvas").evaluate((canvas) => {
    const lives = JSON.parse(canvas.dataset.unitDisplayedLifeById ?? "{}") as Record<string, number>;
    return Object.entries(lives).filter(([id]) => id.startsWith("1:")).map(([, life]) => life);
  });
  expect(allyLives.length).toBeGreaterThan(0);
  expect(new Set(allyLives)).toEqual(new Set([1]));

  await page.reload();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("original-debug-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("Caps Lock+J hands the battle to the stage's own victory flow", async ({ page }) => {
  await openBattle(page, "stage-00-player");
  await page.getByTestId("original-debug-toggle").click();
  await withCapsLock(page, "j");
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-phase", /victoryStory|victoryFeedback/u);
});

test("the music box lives in the music panel and keeps playing after it closes", async ({ page }) => {
  await openBattle(page, "stage-00-player");
  const app = page.locator("#app");
  await page.keyboard.press("m");
  const musicPanel = page.getByTestId("music-settings-menu");
  await expectMenuOpen(musicPanel);
  await page.getByTestId("open-music-box").click();
  const box = page.getByTestId("music-box");
  await expect(box).toBeVisible();
  await expect(box.locator("[data-music-box-index]")).toHaveCount(36);
  await expect(box.locator(".music-box-heading")).toHaveText(["原版名單", "原版未收錄"]);

  const t04 = page.getByTestId("music-box-track-native-26");
  await t04.click();
  await expect(t04).toHaveClass(/is-selected/u);
  await expect(t04.locator(".music-box-native")).toHaveText("MUSIC-   26-T04.RIX");
  await page.getByTestId("music-box-play").click();
  await expect(app).toHaveAttribute("data-music-track", "MAGIC/75");
  await expect(t04).toHaveAttribute("data-playing", "true");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-music-box.png",
  });

  // The native box handed the record straight to the driver; closing it never swapped back.
  await page.keyboard.press("Escape");
  await expectMenuOpen(musicPanel);
  await page.keyboard.press("Escape");
  await expect(musicPanel).toBeHidden();
  await expect(app).toHaveAttribute("data-music-track", "MAGIC/75");

  await page.keyboard.press("m");
  await page.getByTestId("open-music-box").click();
  await page.getByTestId("music-box-restore").click();
  await expect(app).toHaveAttribute("data-music-track", /MUSIC\/(6|7)/u);
});

test("stage 37 hides the side-2 map life digits unless the debug switch is on", async ({ page }) => {
  await openBattle(page, "stage-37-player");
  const canvas = page.getByTestId("battle-canvas");
  await expect.poll(async () => (await canvas.getAttribute("data-concealed-life-unit-ids")) ?? "")
    .toMatch(/2:/u);
  await page.getByTestId("original-debug-toggle").click();
  await expect(canvas).toHaveAttribute("data-concealed-life-unit-ids", "");
});
