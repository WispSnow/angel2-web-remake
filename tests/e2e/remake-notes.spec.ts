import { expect, test, type Page } from "@playwright/test";
import { hostMenu, openHostMenu, openHostOverlay } from "./host-menu-helpers";
import { captureVisualAudit } from "./visual-audit";

const cursorOf = (page: Page) => page.evaluate(() =>
  (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } } | undefined)?.cursor);

type NotesTab = "fixes" | "features" | "balance" | "controls" | "disclaimer";

/** 宿主選單只有一列入口且固定開在第一個分頁，其餘分頁要再點一次頁籤。 */
const openNotes = async (page: Page, tab: NotesTab): Promise<void> => {
  await openHostOverlay(page, "remake-notes");
  await expect(page.getByTestId("remake-notes-body")).toBeVisible();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
  if (tab === "fixes") return;
  await page.getByTestId(`remake-notes-tab-${tab}`).click();
  await expect(page.getByTestId(`remake-notes-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
};

test("三個參考面板收在畫面右下角的選單裡，頁面上沒有畫面外的宿主列", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  await expect(page.getByTestId("host-overlay-triggers")).toHaveCount(0);
  await expect(page.getByTestId("display-settings")).toHaveCount(0);

  await openHostMenu(page);
  // 每個面板只有一列入口；分頁在各自覆蓋層的頁籤列。
  for (const id of ["remake-notes", "compendium", "roadmap"]) {
    await expect(hostMenu(page).getByTestId(`host-menu-row-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId("host-menu-row-remake-notes")).toContainText("復刻說明");
  await expect(page.getByTestId("host-menu-row-compendium")).toContainText("圖鑑");
  await expect(page.getByTestId("host-menu-row-roadmap")).toContainText("RoadMap");

  // 選單整組蓋在遊戲畫面上（1 倍畫面時完全落在 640×350 之內）。
  const [screen, list] = await Promise.all([
    page.getByTestId("startup-screen").boundingBox(),
    page.getByTestId("host-menu-list").boundingBox(),
  ]);
  expect(screen).not.toBeNull();
  expect(list).not.toBeNull();
  if (!screen || !list) return;
  expect(list.x).toBeGreaterThanOrEqual(screen.x);
  expect(list.y).toBeGreaterThanOrEqual(screen.y);
  expect(list.x + list.width).toBeLessThanOrEqual(screen.x + screen.width);
  expect(list.y + list.height).toBeLessThanOrEqual(screen.y + screen.height);
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
  await expect(page.getByTestId("host-menu-row-remake-notes")).toBeFocused();
  await page.getByTestId("host-menu-row-compendium").click();
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
  await page.getByTestId("host-menu-row-roadmap").click();
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
  await openHostOverlay(page, "roadmap");
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
    "宿主選單",
    "處理器",
    "渲染器",
    "戰鬥動畫實驗室",
    "stableRemake",
    "legacyStrict",
  ];
  await expect(page.getByTestId("remake-notes-tabs").getByRole("tab"))
    .toHaveText(["Bug 修復", "功能增強", "平衡性調整", "操作說明", "免責聲明"]);
  await expect(body.locator(".rn-intro")).toHaveText(
    "本頁整理了重製版針對原版已知問題與缺陷所做的修復。每項均對照說明原版行為與復刻調整；"
      + "戰鬥動畫、音效與加速等設置僅影響視聽演出，不改變實際數值與結算規則。",
  );
  await expect(page.locator(".rn-foot")).toHaveText(
    "遊戲在選單打開期間保持暫停；關閉本說明會回到選單，視窗內的按鍵不會誤觸戰場指令。",
  );
  for (const term of playerFacingDevTerms) await expect(body).not.toContainText(term);
  const poisonFix = page.getByTestId("remake-note-REMAKE-004");
  await expect(poisonFix).toContainText("中毒狀態不再殘留 0 生命存活單位");
  await expect(poisonFix).toContainText("但歸零時不會觸發死亡結算");
  // REMAKE-165：原版迅龍騎士的格擋本來就貼地，那條「修復」撤下後不能再出現。
  await expect(page.getByTestId("remake-note-swift-dragon-guard-ground")).toHaveCount(0);
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
  const diagonalEdgeNote = page.getByTestId("remake-note-edge-scroll-diagonal");
  await expect(diagonalEdgeNote).toContainText("↖、↗、↙、↘ 斜向箭頭");
  await expect(diagonalEdgeNote.locator(".rn-note-id")).toHaveCount(0);
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
  // REMAKE-188: the story voices name both synthesis services.
  await expect(page.getByTestId("remake-disclaimer-ai-voice"))
    .toContainText("MiniMax");
  await expect(page.getByTestId("remake-disclaimer-ai-voice"))
    .toContainText("ElevenLabs");
  // REMAKE-192: the HD portraits name the models that drew and animated them.
  await expect(page.getByTestId("remake-disclaimer-ai-portraits"))
    .toContainText("Qwen-Image-Edit");
  await expect(page.getByTestId("remake-disclaimer-ai-portraits"))
    .toContainText("RIFE");
  await expect(page.getByTestId("remake-disclaimer-ai-portraits"))
    .toContainText("美術風格");
  // REMAKE-196/197/198/200/201: the HD story pictures name the models that drew, extended and animated them.
  const storyArt = page.getByTestId("remake-disclaimer-ai-story-art");
  for (const model of ["Qwen-Image-Edit", "FLUX.1 Fill", "MiniMax", "RIFE"]) {
    await expect(storyArt).toContainText(model);
  }
  await expect(storyArt).toContainText("The end");
  // REMAKE-203: the HD technique effects name the models that redrew the frames and filled the motion between them.
  const effects = page.getByTestId("remake-disclaimer-ai-effects");
  for (const model of ["Qwen-Image-Edit", "MiniMax", "美術風格"]) {
    await expect(effects).toContainText(model);
  }
  await expect(page.getByTestId("remake-note-REMAKE-100")).toHaveCount(0);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-disclaimer-desktop.png",
  });

  // 圖鑑已經搬到自己的入口，說明面板不得再帶著它。
  await expect(page.getByTestId("remake-notes-tab-classes")).toHaveCount(0);
  await expect(page.getByTestId("compendium-index")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.getByTestId("host-menu-row-remake-notes")).toBeFocused();

  // 入口固定開在第一個分頁，不記住上次停在哪一頁。
  await page.getByTestId("host-menu-row-remake-notes").click();
  await expect(page.getByTestId("remake-notes-tab-fixes")).toHaveAttribute("aria-selected", "true");
});

test("REMAKE-124 說明龍類首領可中毒並使用三分之一規則", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const bossPoison = page.getByTestId("remake-note-REMAKE-124");
  await expect(bossPoison).toContainText("中毒效果調整為可對龍類首領生效");
  await expect(bossPoison).toContainText("扣除其當前生命值的三分之一");
  await expect(bossPoison).toContainText("普通單位仍為減半");
  await expect(bossPoison).toContainText("三分之一為「扣除量」而非「剩餘量」");
  await captureVisualAudit(bossPoison, {
    path: "artifacts/playwright/remake-notes-boss-poison.png",
  });
});

test("REMAKE-145 說明劇情首領在四成以下繼續行動", async ({ page }) => {
  await page.goto("/");
  // 原版沒壞，是複刻主動改了首領的手感，所以歸「平衡性調整」而不是「Bug 修復」。
  await openNotes(page, "balance");
  const bossBand = page.getByTestId("remake-note-REMAKE-145");
  await expect(bossBand).toContainText("劇情首領不再半血就罷手");
  await expect(bossBand).toContainText("只有低於兩成才休息");
  await expect(bossBand).toContainText("女帝與所有一般職業");
  await expect(page.getByTestId("remake-note-REMAKE-145").locator(".rn-note-id"))
    .toHaveText("REMAKE-145");
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

test("REMAKE-138 說明魔弓兵射擊不再取得雙份施法經驗", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const magicArcherExperience = page.getByTestId("remake-note-REMAKE-138");
  await expect(magicArcherExperience).toContainText("魔弓兵射擊不再取得雙份施法經驗");
  await expect(magicArcherExperience).toContainText("重複加上同一份 13 點基礎值");
  await expect(magicArcherExperience).toContainText("取得 13–17 點施法經驗");
  await expect(magicArcherExperience).toContainText("弓兵固定 8 點、弩兵固定 13 點");
  await captureVisualAudit(magicArcherExperience, {
    path: "artifacts/playwright/remake-notes-magic-archer-experience.png",
  });
});

test("REMAKE-133 將所有擊殺經驗提示列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "fixes");
  const killExperience = page.getByTestId("remake-note-REMAKE-133");
  await expect(killExperience).toContainText("所有擊殺行動都會顯示實際取得經驗");
  await expect(killExperience).toContainText("射擊、魔法、龍踏等所有特殊行動");
  await expect(killExperience).toContainText("玩家操作、我方自動與敵方行動採用相同規則");
  await expect(killExperience).toContainText("只補齊回饋，不改變經驗公式");
  await captureVisualAudit(killExperience, {
    path: "artifacts/playwright/remake-notes-kill-experience.png",
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

test("REMAKE-156 說明祈禱生命恢復量改為畫面顯示的數字", async ({ page }) => {
  await page.goto("/");
  // 使用者決定保留顯示的抽取量：與原版不同的改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const prayerHeal = page.getByTestId("remake-note-REMAKE-156");
  await expect(prayerHeal).toContainText("祈禱的生命恢復量與畫面數字一致");
  await expect(prayerHeal).toContainText("固定恢復 10 點");
  await expect(prayerHeal).toContainText("扣除 11–26 點生命");
  await expect(prayerHeal).toContainText("一律恢復畫面上顯示的 5–14 點");
  await expect(prayerHeal.locator(".rn-note-id")).toHaveText("REMAKE-156");
  await captureVisualAudit(prayerHeal, {
    path: "artifacts/playwright/remake-notes-prayer-heal.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-156")).toHaveCount(0);
});

test("REMAKE-157 把「治癒維斯塔女帝」的回合上限放寬列在 REMAKE-110 之後", async ({ page }) => {
  await page.goto("/");
  // 使用者把這條列在「平衡調整」之下，它修改的是 REMAKE-110 這條同樣在平衡分頁的復刻規則。
  await openNotes(page, "balance");
  const roundCap = page.getByTestId("remake-note-REMAKE-157");
  await expect(roundCap).toContainText("「治癒維斯塔女帝」的回合上限放寬為 199 回合");
  await expect(roundCap).toContainText("第 199 回合結束仍未喚醒女帝才逾時判負");
  await expect(roundCap.locator(".rn-note-id")).toHaveText("REMAKE-157");
  await expect(page.getByTestId("remake-note-REMAKE-110")).toContainText("見 REMAKE-157");

  await page.getByTestId("remake-notes-tab-fixes").click();
  await expect(page.getByTestId("remake-note-REMAKE-157")).toHaveCount(0);
});

test("REMAKE-152 與 REMAKE-154 將兩關的敵軍配置漏洞列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求的、與原版不同的關卡改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const priestLine = page.getByTestId("remake-note-REMAKE-152");
  await expect(priestLine).toContainText("「遭遇碧娜維姬」的魔祭師不再單獨離隊");
  await expect(priestLine).toContainText("唯獨橫列左起第二名魔祭師被設成追擊");
  await expect(priestLine.locator(".rn-note-id")).toHaveText("REMAKE-152");
  const blockedSpawn = page.getByTestId("remake-note-REMAKE-154");
  await expect(blockedSpawn).toContainText("「趕回瓦爾克麗城」的追兵無法再被占位封鎖");
  await expect(blockedSpawn).toContainText("離該格最近、且該職業能夠進入的空格");
  await expect(blockedSpawn).toContainText("出兵格空著時仍照原版從原處出現");
  await expect(blockedSpawn.locator(".rn-note-id")).toHaveText("REMAKE-154");
  await captureVisualAudit(blockedSpawn, {
    path: "artifacts/playwright/remake-notes-stage27-blocked-spawn.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-152")).toHaveCount(0);
  await expect(page.getByTestId("remake-note-REMAKE-154")).toHaveCount(0);
});

test("REMAKE-170 把「時空異變」牆面上免疫法術的三名敵軍列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求的、與原版不同的關卡改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const wallLedge = page.getByTestId("remake-note-REMAKE-170");
  await expect(wallLedge).toContainText("「時空異變」牆面上的三名敵軍不再免疫法術");
  await expect(wallLedge).toContainText("炎暴、落雷與射擊都選不中，範圍法術也波及不到");
  await expect(wallLedge).toContainText("陸戰騎士與魔鎧戰士 10%、半龍戰士 5%");
  await expect(wallLedge).toContainText("魔鎧戰士各難度的數值與殘血減傷特性均不變");
  await expect(wallLedge.locator(".rn-note-id")).toHaveText("REMAKE-170");
  await captureVisualAudit(wallLedge, {
    path: "artifacts/playwright/remake-notes-stage35-wall-ledge.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-170")).toHaveCount(0);
});

test("REMAKE-173 把「營地遭到偷襲 ２」魔術士不進木屋列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求的、與原版不同的關卡改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const keepOut = page.getByTestId("remake-note-REMAKE-173");
  await expect(keepOut).toContainText("「營地遭到偷襲 ２」的敵方魔術士不會闖進木屋");
  await expect(keepOut).toContainText("她會從門口走進屋內，在狹窄的屋裡近距離施法");
  await expect(keepOut).toContainText("門口也算屋內");
  await expect(keepOut).toContainText("其他襲擊者照常進屋");
  await expect(keepOut.locator(".rn-note-id")).toHaveText("REMAKE-173");
  await captureVisualAudit(keepOut, {
    path: "artifacts/playwright/remake-notes-stage8-magician-keep-out.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-173")).toHaveCount(0);
});

test("REMAKE-184 把「拯救蘇蘭達」無人追擊蘇蘭達列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求的、與原版不同的關卡改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const hunt = page.getByTestId("remake-note-REMAKE-184");
  await expect(hunt).toContainText("「拯救蘇蘭達」的麗蘭特會緊追蘇蘭達");
  await expect(hunt).toContainText("沒有人專門追趕蘇蘭達");
  await expect(hunt).toContainText("重傷時也不會停下休息");
  await expect(hunt).toContainText("戰術欄會顯示「追擊蘇蘭達」");
  await expect(hunt).toContainText("轉職為飛馬戰士的蘇蘭達仍快得追不上");
  await expect(hunt.locator(".rn-note-id")).toHaveText("REMAKE-184");
  await captureVisualAudit(hunt, {
    path: "artifacts/playwright/remake-notes-stage11-lilante-hunt.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-184")).toHaveCount(0);
});

test("REMAKE-176／177／178 把女踏敵我、冰雪經驗與魔弓防魔列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者批准的、與原版不同的規則一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const femaleStomp = page.getByTestId("remake-note-REMAKE-176");
  await expect(femaleStomp).toContainText("女踏只能指定敵人，不再誤傷我方");
  await expect(femaleStomp).toContainText("可以選中射程內的友軍");
  await expect(femaleStomp.locator(".rn-note-id")).toHaveText("REMAKE-176");
  const iceExperience = page.getByTestId("remake-note-REMAKE-177");
  await expect(iceExperience).toContainText("冰雪施法經驗依實際作用的目標判定");
  await expect(iceExperience).toContainText("即使範圍內沒有任何敵人也一樣");
  await expect(iceExperience).toContainText("至少一名敵人被冰封或被擊退時取得一次施法經驗");
  const archerGuard = page.getByTestId("remake-note-REMAKE-178");
  await expect(archerGuard).toContainText("魔弓兵射擊不再清除自己與友軍的防魔");
  await expect(archerGuard).toContainText("射手與友軍保留各自的防魔");
  await expect(page.getByTestId("remake-note-REMAKE-125")).toContainText("冰雪的施法經驗見 REMAKE-177");
  // 原版炎暴本來就先由防魔擋下再清除，REMAKE-005 不再把它當成原版缺陷。
  await expect(page.getByTestId("remake-note-REMAKE-005")).not.toContainText("炎暴");
  await captureVisualAudit(iceExperience, {
    path: "artifacts/playwright/remake-notes-ice-experience.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  for (const id of ["REMAKE-176", "REMAKE-177", "REMAKE-178", "REMAKE-179", "REMAKE-180"]) {
    await expect(page.getByTestId(`remake-note-${id}`)).toHaveCount(0);
  }
});

test("REMAKE-174 把原版Debug模式與音樂盒列入功能增強，並在操作說明列出熱鍵", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "features");
  const debugMode = page.getByTestId("remake-note-REMAKE-174");
  await expect(debugMode).toContainText("原版Debug模式與音樂盒");
  await expect(debugMode).toContainText("按住數字鍵盤 1、3、5");
  await expect(debugMode).toContainText("「原版Debug」開關");
  await expect(debugMode).toContainText("音樂盒常駐「音樂開關」面板");
  await expect(debugMode).toContainText("F2 我／敵 EDIT");
  await expect(debugMode).toContainText("兵種／地型數值編輯");
  await expect(debugMode).toContainText("複刻只在這場戰鬥生效");
  await expect(debugMode.locator(".rn-note-id")).toHaveText("REMAKE-174");

  await page.getByTestId("remake-notes-tab-controls").click();
  const card = page.getByTestId("remake-controls-original-debug");
  await expect(card).toContainText("原版Debug");
  await expect(card.locator("kbd")).toContainText([
    "F1", "F2", "F3", "F4", "F5", "F6", "F10", "U", "D", "－", "S", "1", "2", "J", "＊", "Shift＋8", "M",
  ]);
});

test("REMAKE-162 把「騎士城堡前」隔河攻擊娜米的漏洞列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求的、與原版不同的關卡改動一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const guardedCommander = page.getByTestId("remake-note-REMAKE-162");
  await expect(guardedCommander).toContainText("「騎士城堡前」攻擊娜米會驚動城堡守軍");
  await expect(guardedCommander).toContainText("就能隔河反覆對她施法或射擊");
  await expect(guardedCommander).toContainText("就與直接攻擊守軍一樣");
  await expect(guardedCommander).toContainText("娜米本人仍從下一回合起才出擊");
  await expect(guardedCommander.locator(".rn-note-id")).toHaveText("REMAKE-162");
  await captureVisualAudit(guardedCommander, {
    path: "artifacts/playwright/remake-notes-stage1-guarded-commander.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-162")).toHaveCount(0);
});

test("REMAKE-163 把弓兵系移動後的自動出手與撤回移動列入 Bug 修復", async ({ page }) => {
  await page.goto("/");
  // 使用者要求保留的、與原版不同的操作流程一律算原版缺陷修復，不歸「平衡性調整」。
  await openNotes(page, "fixes");
  const rangedMenu = page.getByTestId("remake-note-REMAKE-163");
  await expect(rangedMenu).toContainText("弓兵系移動後不再自動出手或撤回移動");
  await expect(rangedMenu).toContainText("會不經選單直接攻擊");
  await expect(rangedMenu).toContainText("則會撤銷整次移動、退回出發位置");
  await expect(rangedMenu).toContainText("「結束」只結束本單位的行動");
  await expect(rangedMenu).toContainText("移動後沒有任何目標時的「確定／取消」");
  await expect(rangedMenu.locator(".rn-note-id")).toHaveText("REMAKE-163");
  await captureVisualAudit(rangedMenu, {
    path: "artifacts/playwright/remake-notes-ranged-post-move-menu.png",
  });

  await page.getByTestId("remake-notes-tab-balance").click();
  await expect(page.getByTestId("remake-note-REMAKE-163")).toHaveCount(0);
});

test("REMAKE-103 說明線性成長的屬性與升級經驗都延續前 3 級", async ({ page }) => {
  await page.goto("/");
  await openNotes(page, "balance");
  const linearGrowth = page.getByTestId("remake-note-REMAKE-103");
  await expect(linearGrowth).toContainText("敵方難度細化為「成長曲線」與「登場等級」雙重維度");
  // REMAKE-159: the post-level-3 EXP step follows the class's own levels 1–3 as well.
  await expect(linearGrowth).toContainText("與升級所需經驗，都延續該職業 1 至 3 級的步調");
  await expect(linearGrowth).toContainText("關卡內的升級不會一口氣跨過難度檔位");
  await expect(linearGrowth).toContainText("分別提至 4 級與 6 級");
  await captureVisualAudit(linearGrowth, {
    path: "artifacts/playwright/remake-notes-linear-growth.png",
  });
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
  await expect(cards).toHaveCount(5);
  const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  if (first && second) expect(second.y).toBeGreaterThan(first.y + first.height);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/remake-controls-mobile.png",
  });
});

test("面板打開時鍵盤不會操作戰場，遊戲停在原處直到玩家回到遊戲", async ({ page }) => {
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

  // 說明視窗從暫停選單打開：關掉回到選單，遊戲仍停著；回到遊戲後玩家繼續打同一個回合。
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.getByTestId("host-menu-row-remake-notes")).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "true");
  await page.keyboard.press("Escape");
  await expect(hostMenu(page)).toBeHidden();
  expect(await cursorOf(page)).toEqual(before);

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

  // 全部休息即交出本回合；面板開著時敵方階段停在原處，回到遊戲後才推進到下一個回合。
  await openNotes(page, "fixes");
  const roundWhilePaused = await page.locator("#bottom-round-text").textContent();
  await page.waitForTimeout(1500);
  await expect(page.locator("#bottom-round-text")).toHaveText(roundWhilePaused ?? "");
  await expect(page.locator("html")).toHaveAttribute("data-program-paused", "true");
  await page.keyboard.press("p");
  await expect(page.getByTestId("remake-notes-body")).toBeHidden();
  await expect(page.locator("#bottom-round-text")).toHaveText("第 2 回合", { timeout: 45_000 });
});
