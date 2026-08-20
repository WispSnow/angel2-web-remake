import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const cursorOf = (page: Page) => page.evaluate(() =>
  (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } } | undefined)?.cursor);

type NotesTab = "fixes" | "features" | "balance" | "controls" | "disclaimer";

/** 宿主只有一顆入口按鈕且固定開在第一個分頁，其餘分頁要再點一次頁籤。 */
const openNotes = async (page: Page, tab: NotesTab): Promise<void> => {
  await page.getByTestId("remake-notes-open").click();
  await expect(page.getByTestId("remake-notes-body")).toBeVisible();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
  if (tab === "fixes") return;
  await page.getByTestId(`remake-notes-tab-${tab}`).click();
  await expect(page.getByTestId(`remake-notes-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
};

test("三個覆蓋層入口並排在宿主工具列上，靠在縮放選項右側", async ({ page }) => {
  await page.goto("/");
  const triggers = page.getByTestId("host-overlay-triggers");
  await expect(triggers).toBeVisible();
  // 分頁在各自覆蓋層的頁籤列，宿主這一行只保留三個表面的單一入口。
  await expect(triggers.getByRole("button")).toHaveText(["復刻說明", "圖鑑", "RoadMap"]);

  // 與「畫面縮放」同一條界線：原版沒有這些畫面，它們不得畫進 640×350 邏輯螢幕。
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

test("五個分頁各載入自己的內容，操作與免責說明都可獨立查閱", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  await expect(page.getByTestId("remake-notes-tabs").getByRole("tab"))
    .toHaveText(["Bug 修復", "功能增強", "平衡性調整", "操作說明", "免責聲明"]);
  await expect(page.getByTestId("remake-note-REMAKE-004")).toContainText("毒不再把生命打到 0");
  const swiftGuardFix = page.getByTestId("remake-note-swift-dragon-guard-ground");
  await expect(swiftGuardFix).toContainText("迅龍騎士格擋不再懸空");
  await expect(swiftGuardFix.locator(".rn-note-id")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-features").click();
  await expect(page.getByTestId("remake-note-REMAKE-015")).toContainText("地形特性");
  // 發行版不附決定記錄：沒有決定編號的顯示增強不得畫出玩家查不到的徽章。
  const tooltipNote = page.getByTestId("remake-note-status-icon-tooltip");
  await expect(tooltipNote).toBeVisible();
  await expect(tooltipNote.locator(".rn-note-id")).toHaveCount(0);
  await expect(page.getByTestId("remake-note-REMAKE-015").locator(".rn-note-id"))
    .toHaveText("REMAKE-015");
  await expect(page.getByTestId("remake-note-REMAKE-004")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-100")).toContainText("魔鎧戰士");
  // 三條已改列「功能增強」的條目不得同時留在平衡分頁。
  for (const id of ["REMAKE-101", "REMAKE-106", "REMAKE-107"]) {
    await expect(page.getByTestId(`remake-note-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId("remake-note-REMAKE-015")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-controls").click();
  const controls = page.getByTestId("remake-controls");
  await expect(controls).toBeVisible();
  const keyboard = controls.locator(".rn-control-card.is-keyboard");
  for (const key of ["方向鍵", "WASD", "Enter", "Space", "Esc", "Backspace"]) {
    await expect(keyboard.getByText(key, { exact: true })).toBeVisible();
  }
  await expect(controls).toContainText("下一名待行動角色");
  await expect(controls).toContainText("標準手把");
  await expect(controls).toContainText("Menu");
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-controls-desktop.png",
  });

  await page.getByTestId("remake-notes-tab-disclaimer").click();
  await expect(page.getByTestId("remake-disclaimer")).toBeVisible();
  await expect(page.getByTestId("remake-disclaimer-rights"))
    .toContainText("大宇資訊股份有限公司");
  await expect(page.getByTestId("remake-disclaimer-noncommercial"))
    .toContainText("僅供學習、研究、保存與交流使用");
  await expect(page.getByTestId("remake-disclaimer-unofficial"))
    .toContainText("不存在隸屬、合作、贊助或授權關係");
  await expect(page.getByTestId("remake-disclaimer-redistribution"))
    .toContainText("本聲明不授予任何人");
  await expect(page.getByTestId("remake-disclaimer-contact"))
    .toContainText("RoadMap");
  await expect(page.getByTestId("remake-note-REMAKE-100")).toHaveCount(0);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-disclaimer-desktop.png",
  });

  // 圖鑑已經搬到自己的入口，說明面板不得再帶著它。
  await expect(page.getByTestId("remake-notes-tab-classes")).toHaveCount(0);
  await expect(page.getByTestId("compendium-index")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.getByTestId("remake-notes-open")).toBeFocused();

  // 入口固定開在第一個分頁，不記住上次停在哪一頁。
  await page.getByTestId("remake-notes-open").click();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
});

test("免責聲明在窄螢幕使用單欄並可完整捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openNotes(page, "disclaimer");

  const disclaimer = page.getByTestId("remake-disclaimer");
  const rights = page.getByTestId("remake-disclaimer-rights");
  const noncommercial = page.getByTestId("remake-disclaimer-noncommercial");
  const [disclaimerBox, rightsBox, noncommercialBox] = await Promise.all([
    disclaimer.boundingBox(),
    rights.boundingBox(),
    noncommercial.boundingBox(),
  ]);
  expect(disclaimerBox).not.toBeNull();
  expect(rightsBox).not.toBeNull();
  expect(noncommercialBox).not.toBeNull();
  if (disclaimerBox && rightsBox && noncommercialBox) {
    expect(rightsBox.width).toBeGreaterThan(disclaimerBox.width - 2);
    expect(noncommercialBox.y).toBeGreaterThan(rightsBox.y + rightsBox.height);
  }

  await page.getByTestId("remake-notes-body").evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  await expect(page.getByTestId("remake-disclaimer-contact")).toBeVisible();
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-disclaimer-mobile.png",
  });
});

test("操作說明在窄螢幕收為單欄且分頁列可橫向捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openNotes(page, "controls");

  const cards = page.getByTestId("remake-controls").locator(".rn-control-card");
  await expect(cards).toHaveCount(4);
  const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  if (first && second) expect(second.y).toBeGreaterThan(first.y + first.height);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-controls-mobile.png",
  });
});

test("面板打開時鍵盤不會操作戰場，敵方階段照常跑完", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.locator("#bottom-round-text")).toHaveText("第 1 回合");
  const before = await cursorOf(page);
  expect(before).toBeDefined();

  await openNotes(page, "balance");
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

  await page.keyboard.press("g");
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
