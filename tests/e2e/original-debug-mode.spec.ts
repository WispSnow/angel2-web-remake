import { expect, type Page, test } from "@playwright/test";
import { expectMenuOpen, settleMenuAnimation } from "./menu-controls";
import { captureVisualAudit } from "./visual-audit";

/**
 * `REMAKE-174` 原版Debug模式（第一、二批）與常駐音樂盒。
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

interface DebugStateUnit {
  id: string;
  classId: string;
  x: number;
  y: number;
  acted: boolean;
}

interface DebugTestState {
  actionMode: string;
  units: DebugStateUnit[];
}

const testState = (page: Page): Promise<DebugTestState> => page.evaluate(() => {
  const api = (window as unknown as { __ANGEL2__: { getState(): DebugTestState } }).__ANGEL2__;
  return api.getState();
});

async function openDebugBattle(page: Page, scenario: string): Promise<void> {
  await openBattle(page, scenario);
  await page.getByTestId("original-debug-toggle").click();
  await expect(page.getByTestId("original-debug-toggle")).toHaveAttribute("aria-pressed", "true");
}

test("the 原版Debug switch arms the native Caps Lock menus and survives a reload", async ({ page }) => {
  await openBattle(page, "stage-00-player");
  const toggle = page.getByTestId("original-debug-toggle");
  const lifeMenu = page.getByTestId("debug-menu");
  await expect(toggle).toHaveText("原版Debug");
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
  await expect(page.getByTestId("status-strip")).toContainText("原版Debug：我方");
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

test("F1 opens the native behaviour panel and hands a player unit to the automatic phase", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  await withCapsLock(page, "F1");
  const panel = page.getByTestId("debug-behaviour-editor");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-unit-id", "1:0");
  await expect(panel).toHaveAttribute("data-current", "0");
  // 原版指標點不到第 13 項「目地」：它畫出來，但不是按鈕。
  await expect(page.getByTestId("debug-behaviour-row-12")).toHaveAttribute("aria-disabled", "true");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-behaviour-editor.png",
  });
  await page.getByTestId("debug-behaviour-row-1").click();
  await expect(panel).toHaveAttribute("data-current", "1");
  await expect(page.getByTestId("status-strip")).toContainText("交給我方自動行動");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const canvas = page.getByTestId("battle-canvas");
  await expect.poll(async () => (await canvas.getAttribute("data-npc-ally-badge-unit-ids")) ?? "")
    .toContain("1:0");
});

test("我 EDIT draws the native page, edits a class and puts a removed unit back", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  await withCapsLock(page, "F2");
  const menu = page.getByTestId("debug-menu");
  await expectMenuOpen(menu);
  await expect(menu.locator("button")).toHaveText(["我 EDIT", "敵 EDIT", "兵 種", "地 型"]);
  await expect(menu.locator("button[aria-disabled=true]")).toHaveCount(2);
  await page.keyboard.press("Enter");
  const editor = page.getByTestId("debug-unit-editor");
  await expect(editor).toBeVisible();
  const nia = page.getByTestId("debug-edit-slot-0");
  await expect(nia).toHaveAttribute("data-state", "present");
  await expect(page.getByTestId("debug-edit-slot-5")).toHaveAttribute("data-state", /absent|empty/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-unit-editor.png",
  });

  // 原版棋子框：次鍵（右鍵）下一個職業。
  await nia.locator("[data-debug-edit-field=figure]").click({ button: "right" });
  await expect(nia).toHaveAttribute("data-class-id", "magic-sword-warrior");
  await expect(editor).toBeVisible();

  const ximi = page.getByTestId("debug-edit-slot-1");
  await ximi.locator("[data-debug-edit-field=name]").click();
  await expect(ximi).toHaveAttribute("data-state", "departed");
  await ximi.locator("[data-debug-edit-field=name]").click();
  await expect(editor).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("點選空格放回");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-strip")).toContainText("已放回戰場");
  const state = await testState(page);
  expect(state.units.find(({ id }) => id === "1:1")).toMatchObject({ x: 24, y: 33, acted: false });
  const canvas = page.getByTestId("battle-canvas");
  await expect.poll(async () => JSON.parse((await canvas.getAttribute("data-unit-texture-by-id")) ?? "{}")["1:0"])
    .toBe("ally-magic-sword-warrior");
});

test("F6 lets a soldier cast a heal through the full presentation", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  await withCapsLock(page, "F6");
  const menu = page.getByTestId("debug-menu");
  await expectMenuOpen(menu);
  await expect(menu.locator("button")).toHaveText(["治 療", "生命全", "防禦攻擊", "咒 術"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu.locator("button")).toHaveText(["初級治療", "中級治療", "高級治療"]);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("specialTarget");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).units.find(({ id }) => id === "1:0")?.acted, {
    timeout: 20_000,
  }).toBe(true);
  await expect.poll(async () => (await testState(page)).actionMode).toBe("idle");
});

test("holding Caps Lock+1 overlays the native range values while choosing a move", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("move");
  const readout = page.getByTestId("debug-range-readout");
  await page.keyboard.down("CapsLock");
  await page.keyboard.down("1");
  await expect(readout).toBeVisible();
  await expect(readout.locator(":scope > span")).toHaveCount(70);
  await expect(readout.locator("span[data-value='4']")).toHaveCount(1);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-range-readout.png",
  });
  await page.keyboard.up("1");
  await page.keyboard.up("CapsLock");
  await expect(readout).toBeHidden();
});
