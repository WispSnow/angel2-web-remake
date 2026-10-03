import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectMenuOpen, settleMenuAnimation } from "./menu-controls";
import { captureVisualAudit } from "./visual-audit";

/**
 * `REMAKE-174` 原版Debug模式（三批）與常駐音樂盒。
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
  selectedId?: string;
  phase: string;
  promotionUnitIds: string[];
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

/** 開關先開著再進關：資源門才會一併備妥兵種／地型列出的全部 side 2 棋子。 */
async function openBattleWithDebugSwitch(page: Page, scenario: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("angel2.preferences.debug.v1", JSON.stringify({ originalDebugMode: true }));
  });
  await openBattle(page, scenario);
  await expect(page.getByTestId("original-debug-toggle")).toHaveAttribute("aria-pressed", "true");
}

/** 兵種／地型的命中規則用原生 640×350 座標；編輯器鋪滿邏輯畫面。 */
async function clickNative(page: Page, surface: Locator, x: number, y: number, button: "left" | "right" = "left") {
  const box = await surface.boundingBox();
  if (!box) throw new Error("editor surface is not laid out");
  await page.mouse.click(box.x + (x + 0.5) * box.width / 640, box.y + (y + 0.5) * box.height / 350, { button });
}

async function openEditMenuItem(page: Page, downPresses: number): Promise<void> {
  await withCapsLock(page, "F2");
  await expectMenuOpen(page.getByTestId("debug-menu"));
  for (let index = 0; index < downPresses; index += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

test("the 原版Debug switch arms the native Caps Lock menus and survives a reload", async ({ page }) => {
  await openBattle(page, "stage-00-player");
  const toggle = page.getByTestId("original-debug-toggle");
  const lifeMenu = page.getByTestId("debug-menu");
  await expect(toggle).toHaveText("原版Debug");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("original-debug-caps")).toBeHidden();

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

test("with Caps Lock on, F1–F4 never fall back to the group commands inside a command menu", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  const lamp = page.getByTestId("original-debug-caps");
  await expect(lamp).toBeVisible();
  await expect(lamp).toHaveAttribute("data-engaged", "false");
  await page.keyboard.down("CapsLock");
  await expect(lamp).toHaveAttribute("data-engaged", "true");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("actionMenu");
  // 指令選單開著：F1 不是「全軍休息」，只提示先關閉選單；F4 也不會要求撤退。
  await page.keyboard.press("F1");
  await expect(page.getByTestId("status-strip")).toContainText("熱鍵在我方待機、選格與轉職選擇時有效");
  await page.keyboard.press("F4");
  expect((await testState(page)).actionMode).toBe("actionMenu");
  await expect(page.getByTestId("status-strip")).not.toContainText("全軍休息");
  await page.keyboard.up("CapsLock");
  await expect(lamp).toHaveAttribute("data-engaged", "false");
});

test("hotkeys run inside a move selection, and the promotion they cause waits for the idle battlefield", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  const status = page.getByTestId("status-strip");
  const menu = page.getByTestId("debug-menu");
  const promotionLayer = page.getByTestId("promotion-layer");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("move");

  await page.keyboard.down("CapsLock");
  await page.keyboard.press("F3");
  await expectMenuOpen(menu);
  await settleMenuAnimation(menu);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-menu-in-move-selection.png",
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(status).toContainText("原版Debug：敵方");
  expect(await testState(page)).toMatchObject({ actionMode: "move", selectedId: "1:0" });

  // 經驗跨過轉職門檻：原版只在待機循環掃描，所以選格中不跳出轉職。
  await page.keyboard.press("u");
  await expect(status).toContainText("經驗 ＋50，現為 349");
  expect(await testState(page)).toMatchObject({ actionMode: "move", promotionUnitIds: [] });
  await page.keyboard.press("j");
  await expect(status).toContainText("這個熱鍵只在我方待機時有效");
  await page.keyboard.up("CapsLock");

  await page.keyboard.press("Escape");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("actionMenu");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await testState(page)).promotionUnitIds).toEqual(["1:0"]);
  for (let page_ = 0; page_ < 6 && !(await promotionLayer.isVisible()); page_ += 1) {
    await page.getByTestId("dialogue-layer").click();
  }
  await expect(promotionLayer).toBeVisible();
  await expect(promotionLayer).toHaveAttribute("data-debug-above", "false");

  // 轉職選擇中同樣接受熱鍵：除錯選單疊在轉職選單上面。
  await page.keyboard.down("CapsLock");
  await page.keyboard.press("F4");
  await expectMenuOpen(menu);
  await settleMenuAnimation(menu);
  await expect(promotionLayer).toHaveAttribute("data-debug-above", "true");
  expect(await menu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-testid='debug-menu']") !== null;
  })).toBe(true);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-menu-over-promotion.png",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(status).toContainText("已返回轉職選擇。");
  await expect(promotionLayer).toBeVisible();
  await page.keyboard.press("F5");
  await expect(status).toContainText("轉職選擇中不能做技術測試");

  // 經驗退回門檻以下：不再符合條件，轉職等待結束，回到待機戰場。
  await page.keyboard.press("d");
  await page.keyboard.up("CapsLock");
  await expect(promotionLayer).toBeHidden();
  await expect.poll(async () => testState(page)).toMatchObject({
    phase: "player",
    actionMode: "idle",
    promotionUnitIds: [],
  });
  expect((await testState(page)).units.find(({ id }) => id === "1:0")?.classId).toBe("soldier");
});

test("F5 inside a move selection runs a nested technique test and returns to the move", async ({ page }) => {
  await openDebugBattle(page, "stage-05-player");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("move");
  const menu = page.getByTestId("debug-menu");
  await page.keyboard.down("CapsLock");
  await page.keyboard.press("F6");
  await expectMenuOpen(menu);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu.locator("button")).toHaveText(["初級治療", "中級治療", "高級治療"]);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("specialTarget");
  await page.keyboard.press("F5");
  await expect(page.getByTestId("status-strip")).toContainText("技術測試的選格中不能再開一次技術測試");
  await page.keyboard.up("CapsLock");
  await page.keyboard.press("Escape");
  await expect.poll(async () => testState(page)).toMatchObject({ actionMode: "move", selectedId: "1:0" });
  await expect(page.getByTestId("status-strip")).toContainText("原版Debug：已取消技術測試。");

  // 妮雅自己施放並完成：施法者寫已行動，原來的移動做不成了，取消回到待機。
  await page.keyboard.down("CapsLock");
  await page.keyboard.press("F6");
  await expectMenuOpen(menu);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).actionMode).toBe("specialTarget");
  await page.keyboard.up("CapsLock");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await testState(page)).units.find(({ id }) => id === "1:0")?.acted, {
    timeout: 20_000,
  }).toBe(true);
  await expect.poll(async () => (await testState(page)).actionMode).toBe("idle");
  await expect(page.getByTestId("status-strip")).toContainText("不能再由玩家指揮，這次行動取消。");
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
  await expect(menu.locator("button[aria-disabled=true]")).toHaveCount(0);
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

test("兵種 edits the live DATA rows of this battle and clamps life on exit", async ({ page }) => {
  await openBattleWithDebugSwitch(page, "stage-05-player");
  const attack = page.getByTestId("unit-attack-stat").locator("dd");
  const level = Number(await page.getByTestId("unit-level-stat").locator("dd").textContent());
  const [before = 0] = ((await attack.textContent()) ?? "").split("／").map(Number);
  expect(level).toBeGreaterThan(0);

  await openEditMenuItem(page, 2);
  const editor = page.getByTestId("debug-class-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-shown", "0");
  // 開關先開著進場，39 條職業的 side 2 棋子都在資源門裡備妥了。
  await expect(editor.locator("[data-debug-class-record] img:not([hidden])")).toHaveCount(39);
  await expect(page.getByTestId("debug-class-name")).toContainText("士兵");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-class-editor.png",
  });

  // 妮雅（士兵）用的資料行：前三級逐行，之後停在第三行再加成長。
  const row = Math.min(level, 3) - 1;
  const value = page.getByTestId(`debug-class-value-${row}-1`);
  const native = Number(await value.getAttribute("data-value"));
  // 攻擊欄十位：欄起點 176 + 3 × 8；左鍵 +1、右鍵 −1，每位 0..9 不進位。
  await clickNative(page, editor, 204, 220 + row * 25 + 5);
  await expect(value).toHaveAttribute("data-value", String(native + 10));
  await expect(editor).toHaveAttribute("data-row", String(row));
  await expect(editor).toHaveAttribute("data-digit", "3");
  await clickNative(page, editor, 204, 220 + row * 25 + 5, "right");
  await expect(value).toHaveAttribute("data-value", String(native));
  await clickNative(page, editor, 204, 220 + row * 25 + 5);
  await expect(page.getByTestId("status-strip")).toContainText(`士兵第 ${row + 1} 行攻擊 ${native} → ${native + 10}`);

  // 指標懸停移動紅框，在表外按左鍵換面板（原版 `0000:1429`）。
  await page.mouse.move(0, 0);
  await clickNative(page, editor, 9 * 48 + 20, 50 + 25);
  await expect(editor).toHaveAttribute("data-shown", "22");
  await expect(page.getByTestId("debug-class-name")).toContainText("騎兵");

  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("兵種編輯結束");
  await expect(attack).toHaveText(new RegExp(`^${before + 10}／`, "u"));
});

test("地型 edits a terrain cost the movement rules read at once", async ({ page }) => {
  await openBattleWithDebugSwitch(page, "stage-05-player");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  const detail = page.getByTestId("terrain-detail");
  await expect(detail).toBeVisible();
  const slot = Number(await detail.getAttribute("data-terrain-slot"));
  const cost = Number(await page.getByTestId("terrain-movement-cost").textContent());
  expect(cost).toBeLessThan(10);
  await page.getByTestId("close-terrain-detail").click();

  await openEditMenuItem(page, 3);
  const editor = page.getByTestId("debug-terrain-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-terrain-slot", "0");
  await expect(editor.locator("[data-debug-terrain-record] img:not([hidden])")).toHaveCount(37);
  // 地形條 2 × 12，每格 48 × 25；左鍵選定。
  await clickNative(page, editor, (slot % 12) * 48 + 24, Math.floor(slot / 12) * 25 + 12);
  await expect(editor).toHaveAttribute("data-terrain-slot", String(slot));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "test-results/visual-audit/original-debug-terrain-editor.png",
  });

  // 士兵格在 (0,100)：上行移動消耗，可改的十位在格內 x +40..+47。
  const movement = page.getByTestId("debug-terrain-value-0-movement");
  await expect(movement).toHaveAttribute("data-value", String(cost));
  await clickNative(page, editor, 44, 115);
  await expect(movement).toHaveAttribute("data-value", String(cost + 10));
  await expect(editor).toHaveAttribute("data-table", "movement");
  await expect(editor).toHaveAttribute("data-digit", "0");

  // 第 24 格「障礙」是原版表間的重疊字，不能選。
  await clickNative(page, editor, 11 * 48 + 24, 37);
  await expect(editor).toHaveAttribute("data-terrain-slot", String(slot));
  await expect(page.getByTestId("status-strip")).toContainText("不能選");

  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("terrain-movement-cost")).toHaveText(String(cost + 10));
  await page.getByTestId("close-terrain-detail").click();

  // 同一場戰鬥再打開時沿用上次選定的地形（原版 DS:165A）。
  await openEditMenuItem(page, 3);
  await expect(editor).toHaveAttribute("data-terrain-slot", String(slot));
});
