import { expect, test, type Page } from "@playwright/test";

const cursorOf = (page: Page) => page.evaluate(() =>
  (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } } | undefined)?.cursor);

type NotesTab = "fixes" | "features" | "balance" | "classes";

/** 宿主只有一顆入口按鈕且固定開在第一個分頁，其餘分頁要再點一次頁籤。 */
const openNotes = async (page: Page, tab: NotesTab): Promise<void> => {
  await page.getByTestId("remake-notes-open").click();
  await expect(page.getByTestId("remake-notes-body")).toBeVisible();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
  if (tab === "fixes") return;
  await page.getByTestId(`remake-notes-tab-${tab}`).click();
  await expect(page.getByTestId(`remake-notes-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
};

test("the 復刻說明 entry sits in the host chrome, right of the scaling picker", async ({ page }) => {
  await page.goto("/");
  const triggers = page.getByTestId("remake-notes-triggers");
  await expect(triggers).toBeVisible();
  // 單一入口：分頁在覆蓋層自己的頁籤列，宿主那一行不再逐分頁開按鈕。
  await expect(triggers.getByRole("button")).toHaveText(["復刻說明"]);

  // 與「畫面縮放」同一條界線：原版沒有這個畫面，它不得畫進 640×350 邏輯螢幕。
  await expect(triggers.locator("xpath=ancestor::*[@data-testid='startup-screen']")).toHaveCount(0);

  const [scaling, notes] = await Promise.all([
    page.getByTestId("image-scaling-integer").boundingBox(),
    triggers.boundingBox(),
  ]);
  expect(scaling).not.toBeNull();
  expect(notes).not.toBeNull();
  if (!scaling || !notes) return;
  // 同一行、靠右：入口在縮放選項右側，且右緣貼齊該行的右端。
  expect(notes.x).toBeGreaterThan(scaling.x + scaling.width);
  expect(Math.abs(notes.y - scaling.y)).toBeLessThan(scaling.height);
  const row = await page.getByTestId("display-settings").boundingBox();
  expect(row).not.toBeNull();
  if (row) expect(row.x + row.width - (notes.x + notes.width)).toBeLessThan(4);
});

test("四個分頁各載入自己的內容，Esc 關閉並交還焦點", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  await expect(page.getByTestId("remake-notes-tabs").getByRole("tab"))
    .toHaveText(["Bug 修復", "功能增強", "平衡性調整", "職業圖鑑"]);
  await expect(page.getByTestId("remake-note-REMAKE-004")).toContainText("毒不再把生命打到 0");

  await page.getByTestId("remake-notes-tab-features").click();
  await expect(page.getByTestId("remake-note-REMAKE-015")).toContainText("地形特性");
  // 沒有規則決策編號的顯示增強統一標成 `UI [DD]`，並靠 slug 分辨。
  await expect(page.getByTestId("remake-note-status-icon-tooltip")).toContainText("UI [DD]");
  await expect(page.getByTestId("remake-note-REMAKE-004")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-100")).toContainText("魔鎧戰士");
  // 三條已改列「功能增強」的條目不得同時留在平衡分頁。
  for (const id of ["REMAKE-101", "REMAKE-106", "REMAKE-107"]) {
    await expect(page.getByTestId(`remake-note-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId("remake-note-REMAKE-015")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-classes").click();
  await expect(page.getByTestId("compendium-index")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.getByTestId("remake-notes-open")).toBeFocused();

  // 入口固定開在第一個分頁，不記住上次停在哪一頁。
  await page.getByTestId("remake-notes-open").click();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
});

test("職業圖鑑：轉職樹選取與轉職連結都切換右欄", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "classes");
  const detail = page.getByTestId("compendium-detail");

  // 預設停在轉職樹的根，並以正式目錄的固定三行呈現。
  await expect(detail.getByRole("heading", { name: "士兵" })).toBeVisible();
  await expect(detail).toContainText("第 1 層 · 起始職業");
  await expect(detail).toContainText("轉職去向");

  await page.getByTestId("compendium-class-wizard").click();
  await expect(detail.getByRole("heading", { name: "巫師" })).toBeVisible();
  // 技術逐階列出，且職業內等級就是解鎖階級。
  await expect(detail).toContainText("究級冰雪");
  await expect(page.getByTestId("compendium-class-wizard")).toHaveAttribute("aria-current", "true");

  // 轉職來源／去向是可點的：從巫師沿來源回到魔術士。
  await detail.getByRole("button", { name: "魔術士" }).click();
  await expect(detail.getByRole("heading", { name: "魔術士" })).toBeVisible();
  await expect(page.getByTestId("compendium-class-magician")).toHaveAttribute("aria-current", "true");

  // 平衡覆寫必須反映在圖鑑上，否則面板會和戰鬥算出兩套數字。
  await page.getByTestId("compendium-class-half-dragon-warrior").click();
  await expect(detail).toContainText("3 → 6 級每檔");
  await expect(detail).toContainText("6 級之後每檔");
});

test("面板打開時鍵盤不會操作戰場，敵方階段照常跑完", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.locator("#bottom-round-text")).toHaveText("第 1 回合");
  const before = await cursorOf(page);
  expect(before).toBeDefined();

  await openNotes(page, "classes");
  // `ui.ts` 把 keydown 綁在 `window`，未攔截的按鍵會在玩家只是翻閱說明時移動戰場游標。
  for (const key of ["ArrowRight", "ArrowDown", "Enter", " ", "w", "a", "s", "z", "o", "Tab"]) {
    await page.keyboard.press(key);
  }
  expect(await cursorOf(page)).toEqual(before);
  const state = await page.evaluate(() =>
    window.__ANGEL2__?.getState() as { selectedId?: string; systemMenuOpen: boolean });
  expect(state.selectedId).toBeUndefined();
  expect(state.systemMenuOpen).toBe(false);
  await expect(page.getByTestId("objective-panel")).toBeHidden();
  await expect(page.getByTestId("group-command-menu")).toBeHidden();

  // 說明視窗不暫停模擬：關掉之後戰場停在原處，玩家繼續打同一個回合。
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.getByTestId("remake-notes-open")).toBeFocused();
  // 焦點刻意留在入口按鈕上，所以要先移開再用鍵盤操作戰場。
  await page.getByTestId("remake-notes-open").blur();

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toBeVisible();
  await expect.poll(async () => {
    await dialogue.click();
    return page.evaluate(() =>
      (window.__ANGEL2__?.getState() as { groupCommandDialogueId?: string }).groupCommandDialogueId);
  }).toBeUndefined();

  // 全部休息即交出本回合，敵方階段在面板打開時繼續推進到下一個回合。
  await openNotes(page, "fixes");
  await expect(page.locator("#bottom-round-text")).toHaveText("第 2 回合", { timeout: 45_000 });
  await expect(page.getByTestId("remake-notes-body")).toBeVisible();
});

test("圖鑑覆蓋全部職業，每一項都畫得出屬性", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "classes");
  const rows = page.getByTestId("compendium-index").locator(".rn-class-row");
  // 39 個職業目錄記錄：32 個在轉職樹上、3 個非轉職記錄、4 個特殊運行記錄。
  await expect(rows).toHaveCount(39);

  const detail = page.getByTestId("compendium-detail");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const name = (await row.textContent())?.trim() ?? "";
    await row.click();
    await expect(detail.getByRole("heading", { level: 3 })).toHaveText(name);
    await expect(detail.locator("table.rn-stats").first()).toBeVisible();
    // 棋子圖必須真的存在：缺一張素材在畫面上只是空白，不會報錯。
    await expect.poll(() => detail.locator("img")
      .evaluate((image: HTMLImageElement) => image.naturalWidth), { message: name })
      .toBeGreaterThan(0);
  }
});
