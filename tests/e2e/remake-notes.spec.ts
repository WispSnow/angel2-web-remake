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

test("說明文件可在繁簡中文間切換，三個覆蓋層共用並記住選擇", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");

  const notes = page.getByTestId("remake-notes");
  const traditional = page.getByTestId("remake-notes-language-traditional");
  const simplified = page.getByTestId("remake-notes-language-simplified");
  await expect(notes).toHaveAttribute("lang", "zh-Hant");
  await expect(traditional).toHaveAttribute("aria-pressed", "true");
  await expect(simplified).toHaveAttribute("aria-pressed", "false");

  await simplified.click();
  await expect(notes).toHaveAttribute("lang", "zh-Hans");
  await expect(traditional).toHaveAttribute("aria-pressed", "false");
  await expect(simplified).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("remake-notes-tabs").getByRole("tab"))
    .toHaveText(["Bug 修复", "功能增强", "平衡性调整", "操作说明", "免责声明"]);
  await expect(page.getByTestId("remake-note-REMAKE-004"))
    .toContainText("中毒状态不再残留 0 生命存活单位");
  await expect(notes.locator(".rn-foot")).toContainText("不会误触战场指令");

  await page.keyboard.press("Escape");
  await page.getByTestId("compendium-open").click();
  const compendium = page.getByTestId("compendium");
  await expect(compendium).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByTestId("compendium-tabs").getByRole("tab"))
    .toHaveText(["职业图鉴", "角色图鉴"]);
  await expect(page.getByTestId("compendium-detail")).toContainText("属性与成长");
  await page.getByTestId("compendium-tab-characters").click();
  await page.getByTestId("compendium-character-longwang").click();
  await expect(page.getByTestId("compendium-detail").getByRole("heading", { name: "龙王" }))
    .toBeVisible();
  await expect(page.getByTestId("compendium-detail")).toContainText("对白登场");
  await page.getByTestId("compendium-language-traditional").click();
  await expect(page.getByTestId("compendium-tab-characters"))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("compendium-detail").getByRole("heading", { name: "龍王" }))
    .toBeVisible();
  await page.getByTestId("compendium-language-simplified").click();
  await expect(page.getByTestId("compendium-detail").getByRole("heading", { name: "龙王" }))
    .toBeVisible();

  await page.getByTestId("compendium-close").click();
  await page.getByTestId("roadmap-open").click();
  const roadmap = page.getByTestId("roadmap");
  await expect(roadmap).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByTestId("roadmap-tabs").getByRole("tab"))
    .toHaveText(["画面与声音", "剧情与玩法", "Mod 与共创"]);
  await expect(page.getByTestId("roadmap-item-hd-portraits")).toContainText("立绘高清化重制");
  await expect(page.getByRole("img", { name: "QQ 交流群 1107513111 二维码" })).toBeVisible();
  await captureVisualAudit(roadmap.locator(".rn-dialog"), {
    path: "artifacts/playwright/roadmap-simplified-desktop.png",
  });

  // 刷新後仍沿用本机偏好；切回繁體則立即還原同一頁，不重設目前分頁。
  await page.reload();
  await page.getByTestId("roadmap-open").click();
  await expect(page.getByTestId("roadmap-tab-presentation")).toHaveText("画面与声音");
  await page.getByTestId("roadmap-language-traditional").click();
  await expect(page.getByTestId("roadmap-tab-presentation")).toHaveText("畫面與聲音");
  await expect(page.getByTestId("roadmap-item-hd-portraits")).toContainText("立繪高清化重製");
  await expect(page.getByTestId("roadmap-language-traditional"))
    .toHaveAttribute("aria-pressed", "true");
});

test("五個分頁各載入自己的內容，操作與免責說明都可獨立查閱", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const body = page.getByTestId("remake-notes-body");
  const playerFacingDevTerms = [
    "模擬隨機",
    "存檔語義",
    "原子提交",
    "宿主工具列",
    "處理器",
    "渲染器",
    "戰鬥動畫實驗室",
  ];
  await expect(page.getByTestId("remake-notes-tabs").getByRole("tab"))
    .toHaveText(["Bug 修復", "功能增強", "平衡性調整", "操作說明", "免責聲明"]);
  await expect(body.locator(".rn-intro")).toHaveText(
    "本頁整理了復刻版針對原版已知問題與缺陷所做的修復。每項均對照說明原版行為與復刻調整；"
      + "戰鬥動畫、音效與加速等設置僅影響視聽演出，不改變實際數值與結算規則。",
  );
  await expect(page.locator(".rn-foot")).toHaveText(
    "打開本說明不會暫停遊戲進程；視窗內的按鍵操作僅供查閱，不會誤觸戰場指令。",
  );
  for (const term of playerFacingDevTerms) await expect(body).not.toContainText(term);
  const poisonFix = page.getByTestId("remake-note-REMAKE-004");
  await expect(poisonFix).toContainText("中毒狀態不再殘留 0 生命存活單位");
  await expect(poisonFix).toContainText("但歸零時不會觸發死亡結算");
  const swiftGuardFix = page.getByTestId("remake-note-swift-dragon-guard-ground");
  await expect(swiftGuardFix).toContainText("迅龍騎士格擋動畫回歸地面");
  await expect(swiftGuardFix.locator(".rn-note-id")).toHaveCount(0);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-notes-fixes-desktop.png",
  });

  await page.getByTestId("remake-notes-tab-features").click();
  for (const term of playerFacingDevTerms) await expect(body).not.toContainText(term);
  await expect(page.getByTestId("remake-note-REMAKE-015")).toContainText("地形屬性");
  // 發行版不附決定記錄：沒有決定編號的顯示增強不得畫出玩家查不到的徽章。
  const tooltipNote = page.getByTestId("remake-note-status-icon-tooltip");
  await expect(tooltipNote).toBeVisible();
  await expect(tooltipNote.locator(".rn-note-id")).toHaveCount(0);
  await expect(page.getByTestId("remake-note-REMAKE-015").locator(".rn-note-id"))
    .toHaveText("REMAKE-015");
  await expect(page.getByTestId("remake-note-REMAKE-004")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-balance").click();
  for (const term of playerFacingDevTerms) await expect(body).not.toContainText(term);
  await expect(page.getByTestId("remake-note-REMAKE-100")).toContainText("魔鎧戰士");
  const leaderCaution = page.getByTestId("remake-note-REMAKE-012-118");
  await expect(leaderCaution).toContainText("敵方主將保持陣線協同");
  await expect(leaderCaution).toContainText("原版缺乏對具名主將的協同保護邏輯");
  await expect(leaderCaution).not.toContainText("遠追只移動");
  await captureVisualAudit(leaderCaution, {
    path: "artifacts/playwright/remake-notes-leader-caution.png",
  });
  // 三條已改列「功能增強」的條目不得同時留在平衡分頁。
  for (const id of ["REMAKE-101", "REMAKE-106", "REMAKE-107"]) {
    await expect(page.getByTestId(`remake-note-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId("remake-note-REMAKE-015")).toHaveCount(0);

  await page.getByTestId("remake-notes-tab-controls").click();
  const controls = page.getByTestId("remake-controls");
  await expect(controls).toBeVisible();
  const keyboard = controls.locator(".rn-control-card.is-keyboard");
  for (const key of ["方向鍵", "WASD", "Enter", "Space", "Esc", "Backspace", "P", "Pause"]) {
    await expect(keyboard.getByText(key, { exact: true })).toBeVisible();
  }
  await expect(controls).toContainText("下一名待行動角色");
  await expect(controls).toContainText("標準手柄");
  await expect(controls).toContainText("Menu");
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-controls-desktop.png",
  });

  await page.getByTestId("remake-notes-tab-disclaimer").click();
  await expect(page.getByTestId("remake-disclaimer")).toBeVisible();
  await expect(page.getByTestId("remake-disclaimer-rights"))
    .toContainText("大宇資訊股份有限公司");
  await expect(page.getByTestId("remake-disclaimer-noncommercial"))
    .toContainText("僅供技術研究、經典保存與同好交流之用");
  await expect(page.getByTestId("remake-disclaimer-unofficial"))
    .toContainText("不存在任何隸屬、合作、贊助或官方授權關係");
  await expect(page.getByTestId("remake-disclaimer-redistribution"))
    .toContainText("本聲明未向任何第三方");
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

test("REMAKE-124 說明龍類首領可中毒並使用三分之一規則", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const bossPoison = page.getByTestId("remake-note-REMAKE-124");
  await expect(bossPoison).toContainText("中毒效果調整為可對龍類首領生效");
  await expect(bossPoison).toContainText("當前生命值降至三分之一");
  await expect(bossPoison).toContainText("普通單位仍為減半");
  await captureVisualAudit(bossPoison, {
    path: "artifacts/playwright/remake-notes-boss-poison.png",
  });
});

test("REMAKE-125 說明龍踏保留固定經驗並累加擊殺經驗", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const stompExperience = page.getByTestId("remake-note-REMAKE-125");
  await expect(stompExperience).toContainText("龍踏擊殺不再遺失擊殺經驗");
  await expect(stompExperience).toContainText("固定 5 點經驗");
  await expect(stompExperience).toContainText("多名敵人會完整累加");
  await captureVisualAudit(stompExperience, {
    path: "artifacts/playwright/remake-notes-stomp-experience.png",
  });
});

test("REMAKE-128 說明落雷無擊殺也有分層施法經驗", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const lightningExperience = page.getByTestId("remake-note-REMAKE-128");
  await expect(lightningExperience).toContainText("落雷恢復原版分層施法經驗");
  await expect(lightningExperience).toContainText("8–9、10–11、12–14、15–17");
  await expect(lightningExperience).toContainText("沒有擊殺");
});

test("REMAKE-127 將第 8、11 關敵軍難度成長列為平衡調整", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "balance");
  const stageDifficulty = page.getByTestId("remake-note-REMAKE-127");
  await expect(stageDifficulty).toContainText("第 8、11 關保留完整敵軍難度成長");
  await expect(stageDifficulty).toContainText("四檔敵軍登場等級依次為 2、4、6、5");
  await expect(stageDifficulty).toContainText("第 11 關的初始追兵與每輪增援使用相同規則");
  await expect(stageDifficulty).toContainText("第 3 關「救援友軍」另有專項規則");
  await captureVisualAudit(stageDifficulty, {
    path: "artifacts/playwright/remake-notes-stage8-stage11-difficulty.png",
  });
});

test("REMAKE-129 說明救援友軍僅在無法無天採用 1 級敵軍", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "balance");
  const stageDifficulty = page.getByTestId("remake-note-REMAKE-129");
  await expect(stageDifficulty).toContainText("僅在無法無天採用 1 級敵軍");
  await expect(stageDifficulty).toContainText("登場等級依次為 2、4、6");
  await expect(stageDifficulty).toContainText("只有無法無天保留 1 級敵軍");
  await expect(stageDifficulty).toContainText("不影響第 8、11 關");
  await captureVisualAudit(stageDifficulty, {
    path: "artifacts/playwright/remake-notes-stage3-lawless-level-one.png",
  });
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
