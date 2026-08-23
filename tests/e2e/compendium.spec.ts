import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

type CompendiumTab = "classes" | "characters";

/** 入口固定開在職業圖鑑，角色圖鑑要再點一次頁籤。 */
const openCompendium = async (page: Page, tab: CompendiumTab): Promise<void> => {
  await page.getByTestId("compendium-open").click();
  await expect(page.getByTestId("compendium-body")).toBeVisible();
  await expect(page.getByTestId("compendium-tab-classes")).toHaveAttribute("aria-selected", "true");
  if (tab === "classes") return;
  await page.getByTestId(`compendium-tab-${tab}`).click();
  await expect(page.getByTestId(`compendium-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
};

test("圖鑑有兩個分頁，Esc 關閉並交還焦點給自己的入口", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
  await expect(page.getByTestId("compendium-tabs").getByRole("tab"))
    .toHaveText(["職業圖鑑", "角色圖鑑"]);
  await expect(page.getByTestId("compendium-index")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("compendium-body")).toBeHidden();
  await expect(page.getByTestId("compendium-open")).toBeFocused();

  await page.getByTestId("compendium-open").click();
  await expect(page.getByTestId("compendium-tab-classes")).toHaveAttribute("aria-selected", "true");
});

test("職業圖鑑：轉職樹選取與轉職連結都切換右欄", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
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

test("職業圖鑑：默认静态站立，棋子与全景共用阵营且四种动作可重播", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
  const detail = page.getByTestId("compendium-detail");
  const mapSprite = detail.getByTestId("compendium-map-sprite");

  // 普通职业默认以我军左侧出现，棋子和全景保持同一阵营与方向。
  await expect(detail.getByTestId("compendium-side-ally")).toHaveAttribute("aria-pressed", "true");
  await expect(mapSprite).toHaveAttribute("src", /ally-soldier\.png$/);
  const stage = detail.getByTestId("compendium-combat-stage");
  await expect(detail.getByTestId("compendium-animation-stand"))
    .toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveAttribute("data-side", "ally");
  await expect(stage).toHaveAttribute("data-animation", "stand");
  await expect(stage).toHaveAttribute("data-static", "true");
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute("data-side", "left");
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute(
    "data-frame-source",
    /left\/soldier\/direct/,
  );
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "0");
  await expect(detail.getByTestId("compendium-preview-direction"))
    .toContainText("靜態站立");
  const standingFrame = await detail.getByTestId("full-victim-sprite").evaluate((image) => ({
    src: image.getAttribute("src"),
    frame: image.dataset.frame,
    x: image.dataset.x,
  }));
  await page.waitForTimeout(350);
  await expect.poll(() => detail.getByTestId("full-victim-sprite").evaluate((image) => ({
    src: image.getAttribute("src"),
    frame: image.dataset.frame,
    x: image.dataset.x,
  }))).toEqual(standingFrame);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-class-preview-desktop.png",
    animations: "allow",
  });

  await detail.getByTestId("compendium-side-enemy").click();
  await expect(detail.getByTestId("compendium-side-enemy")).toHaveAttribute("aria-pressed", "true");
  await expect(mapSprite).toHaveAttribute("src", /enemy-soldier\.png$/);
  await expect(detail.getByTestId("compendium-combat-stage")).toHaveAttribute("data-side", "enemy");
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute("data-side", "right");
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute(
    "data-frame-source",
    /right\/soldier\/direct/,
  );
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "0");
  await expect(detail.getByTestId("compendium-preview-direction"))
    .toContainText("靜態站立");

  await detail.getByTestId("compendium-animation-attack").click();
  await expect(detail.getByTestId("compendium-combat-stage")).toHaveAttribute("data-static", "false");
  await expect(detail.getByTestId("compendium-preview-direction"))
    .toContainText("由右向左攻擊");

  // 防守动作由当前职业担任受击者；阈值直接走正式脚本的 guard / hurt / death 流。
  await detail.getByTestId("compendium-animation-guard").click();
  await expect(detail.getByTestId("compendium-animation-guard"))
    .toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByTestId("compendium-combat-stage")).toHaveAttribute(
    "data-animation",
    "guard",
  );
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute(
    "data-reaction",
    "guard",
  );

  await detail.getByTestId("compendium-animation-hurt").click();
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute(
    "data-reaction",
    "hurt",
  );
  await detail.getByTestId("compendium-animation-death").click();
  await expect(detail.getByTestId("full-victim-sprite")).toHaveAttribute(
    "data-reaction",
    "death",
  );
  await expect(stage).toHaveAttribute("data-phase", "fullDefenderDeath");
  const [deathVictimX, deathDustX] = await Promise.all([
    detail.getByTestId("full-victim-sprite").getAttribute("data-x"),
    detail.locator(".full-combat-particles .full-combat-frame:not([hidden])").evaluateAll((frames) =>
      frames.map((frame) => Number((frame as HTMLElement).dataset.x))),
  ]);
  expect(deathVictimX).not.toBeNull();
  expect(deathDustX).toHaveLength(3);
  expect(deathDustX.every((x) => x < Number(deathVictimX))).toBe(true);
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-class-preview-right-death.png",
    animations: "allow",
  });

  // 龍没有我方棋子；女帝有我方棋子但没有对应的左侧普通全景图形。
  await page.getByTestId("compendium-class-dragon").click();
  await expect(detail.getByTestId("compendium-side-ally")).toBeDisabled();
  await expect(detail.getByTestId("compendium-side-enemy")).toHaveAttribute("aria-pressed", "true");
  await expect(mapSprite).toHaveAttribute("src", /enemy-dragon\.png$/);

  await page.getByTestId("compendium-class-empress").click();
  await detail.getByTestId("compendium-side-ally").click();
  await expect(mapSprite).toHaveAttribute("src", /ally-empress\.png$/);
  await expect(detail.getByTestId("compendium-combat-stage"))
    .toHaveAttribute("data-class-combat-available", "false");
  await expect(detail.getByTestId("compendium-combat-stage"))
    .toContainText("原版沒有這個職業的我方左側普通全景圖形");
  await expect(detail.getByTestId("compendium-animation-attack")).toBeDisabled();

  await detail.getByTestId("compendium-side-enemy").click();
  await detail.getByTestId("compendium-animation-attack").click();
  await expect(detail.getByTestId("compendium-combat-stage"))
    .toHaveAttribute("data-class-combat-available", "true");
  await expect(detail.getByTestId("full-actor-sprite")).toHaveAttribute("data-side", "right");

  // 关闭后重新进入职业图鉴，总是回到静态站立默认页。
  await page.getByTestId("compendium-close").click();
  await page.getByTestId("compendium-open").click();
  await expect(page.getByTestId("compendium-animation-stand"))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("compendium-combat-stage")).toHaveAttribute("data-static", "true");
});

test("職業圖鑑：REMAKE-121 让点名的受击画布保持同侧站立中心", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
  const detail = page.getByTestId("compendium-detail");
  const victim = detail.getByTestId("full-victim-sprite");
  const visualRegistration = () => victim.evaluate((image) => {
    const box = image.getBoundingClientRect();
    const scene = image.closest(".full-combat-scene")?.getBoundingClientRect();
    if (!scene) throw new Error("full-combat scene is missing");
    const scale = scene.width / 448;
    return ((box.left + box.width / 2) - scene.left) / scale - Number(image.dataset.x);
  });
  const cases = [
    { classId: "beast-knight", side: "ally", correction: "37" },
    { classId: "magic-priest", side: "ally", correction: "51" },
    { classId: "wizard", side: "enemy", correction: "37" },
  ] as const;

  for (const entry of cases) {
    await page.getByTestId(`compendium-class-${entry.classId}`).click();
    await detail.getByTestId(`compendium-side-${entry.side}`).click();
    await detail.getByTestId("compendium-animation-stand").click();
    await expect(victim).toHaveAttribute("data-frame", "0");
    const standingRegistration = await visualRegistration();
    await detail.getByTestId("compendium-animation-death").click();
    await expect(victim).toHaveAttribute("data-reaction", "death");
    await expect(victim).toHaveAttribute("data-x-offset-correction", entry.correction);
    expect(Math.abs((await visualRegistration()) - standingRegistration)).toBeLessThanOrEqual(1);
    await captureVisualAudit(page.locator(".rn-dialog"), {
      path: `artifacts/playwright/compendium-${entry.classId}-${entry.side}-death-registration.png`,
      animations: "allow",
    });
  }

  await page.getByTestId("compendium-class-great-dragon-knight").click();
  await detail.getByTestId("compendium-side-enemy").click();
  await detail.getByTestId("compendium-animation-stand").click();
  const standingRegistration = await visualRegistration();
  for (const reaction of [
    { action: "guard", correction: "33" },
    { action: "hurt", correction: "69" },
    { action: "death", correction: "65" },
  ] as const) {
    await detail.getByTestId(`compendium-animation-${reaction.action}`).click();
    await expect(victim).toHaveAttribute("data-reaction", reaction.action);
    await expect(victim).toHaveAttribute("data-x-offset-correction", reaction.correction);
    expect(Math.abs((await visualRegistration()) - standingRegistration)).toBeLessThanOrEqual(1);
  }
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-great-dragon-reaction-registration.png",
    animations: "allow",
  });
});

test("職業圖鑑：窄屏的阵营与动作控件不会挤出详情栏", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openCompendium(page, "classes");
  const detail = page.getByTestId("compendium-detail");
  const preview = detail.locator(".rn-class-preview");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  await expect(detail.getByTestId("compendium-side-ally")).toBeVisible();
  await expect(detail.getByTestId("compendium-animation-stand"))
    .toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByTestId("compendium-animation-death")).toBeVisible();
  const [detailBox, actionBox] = await Promise.all([
    detail.boundingBox(),
    detail.locator(".rn-class-animation-switch").boundingBox(),
  ]);
  expect(detailBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  if (detailBox && actionBox) {
    expect(actionBox.x).toBeGreaterThanOrEqual(detailBox.x);
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(detailBox.x + detailBox.width + 1);
  }
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-class-preview-mobile.png",
    animations: "allow",
  });
});

/**
 * 面板是動態載入的，慢速連線上點下去到視窗出現之間有一段空窗。指標移上去會先暖模組，
 * 但真的還沒到齊時按鈕要自己標成忙碌，玩家才看得出是在讀取而不是壞掉。
 */
test("圖鑑入口在面板還沒載入完成前標成忙碌", async ({ page }) => {
  let releasePanel = () => undefined;
  const panelGate = new Promise<void>((resolve) => {
    releasePanel = resolve;
  });
  await page.route("**/compendium/panel*", async (route) => {
    await panelGate;
    await route.continue();
  });

  await page.goto("/?test=1&debugScenario=stage-00-player");
  const trigger = page.getByTestId("compendium-open");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("compendium-body")).toHaveCount(0);

  releasePanel();
  await expect(page.getByTestId("compendium-body")).toBeVisible();
  await expect(trigger).not.toHaveAttribute("aria-busy", "true");
});

/**
 * 瀏覽器縮放會等比縮小 CSS 視窗，所以「放大到 200% 以上」對版面來說就是一個又矮又窄的
 * 橫向視窗：1920×1080 放大到 250% 正好是 768×432。既有的窄屏案例都是手機那種高視窗，
 * 蓋不到這一格。
 */
test("職業圖鑑：放大後的矮視窗仍是雙欄，兩欄都拿得到高度", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 432 });
  await page.goto("/");
  await openCompendium(page, "classes");
  const index = page.getByTestId("compendium-index");
  const detail = page.getByTestId("compendium-detail");
  await expect(detail.getByRole("heading", { name: "士兵" })).toBeVisible();

  const [indexBox, detailBox] = await Promise.all([index.boundingBox(), detail.boundingBox()]);
  expect(indexBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  if (indexBox && detailBox) {
    // 並排，不是疊起來。
    expect(detailBox.x).toBeGreaterThanOrEqual(indexBox.x + indexBox.width - 1);
    expect(Math.abs(detailBox.y - indexBox.y)).toBeLessThan(2);
    expect(indexBox.height).toBeGreaterThan(120);
    expect(detailBox.height).toBeGreaterThan(120);
  }
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-zoomed-landscape.png",
    animations: "allow",
  });
});

/**
 * 再窄一階（560px 以下）才疊成單欄。索引欄原本吃固定 200px，比整格還高，詳情欄因此被
 * 算成 0px；`.rn-body` 又是 overflow:hidden，玩家連捲都捲不到。改成按比例分配後兩段都留得住。
 */
test("職業圖鑑：疊成單欄時詳情欄仍分得到高度", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 320 });
  await page.goto("/");
  await openCompendium(page, "classes");
  const index = page.getByTestId("compendium-index");
  const detail = page.getByTestId("compendium-detail");
  await expect(detail.getByRole("heading", { name: "士兵" })).toBeVisible();

  const [indexBox, detailBox] = await Promise.all([index.boundingBox(), detail.boundingBox()]);
  expect(indexBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  if (indexBox && detailBox) {
    expect(detailBox.y).toBeGreaterThanOrEqual(indexBox.y + indexBox.height - 1);
    expect(indexBox.height).toBeGreaterThan(24);
    // 索引最多只占 38%，剩下的都留給詳情。
    expect(detailBox.height).toBeGreaterThan(indexBox.height);
  }
  await captureVisualAudit(page.locator(".rn-dialog"), {
    path: "artifacts/playwright/compendium-zoomed-stacked.png",
    animations: "allow",
  });
});

test("職業圖鑑覆蓋全部職業，每一項都畫得出屬性", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
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
    await expect.poll(() => detail.getByTestId("compendium-map-sprite")
      .evaluate((image: HTMLImageElement) => image.naturalWidth), { message: name })
      .toBeGreaterThan(0);
  }
});

test("角色圖鑑：陣營分組、簡介與出場關卡", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "characters");
  const index = page.getByTestId("compendium-index");
  const detail = page.getByTestId("compendium-detail");

  // 預設停在妮雅，並列出她逐關的身分。
  await expect(detail.getByRole("heading", { name: "妮雅" })).toBeVisible();
  await expect(detail).toContainText("第 0 關 瓦爾克麗宮");
  await expect(detail).toContainText("戰敗條件");
  await expect(page.getByTestId("compendium-character-nia")).toHaveAttribute("aria-current", "true");

  // 兩側都有描述子的角色自成一組，並同時列出兩個名冊槽。
  await expect(index).toContainText("曾經敵對");
  await page.getByTestId("compendium-character-gedilasi").click();
  await expect(detail.getByRole("heading", { name: "葛蒂拉斯" })).toBeVisible();
  await expect(detail).toContainText("我方名冊槽 24");
  await expect(detail).toContainText("敵方名冊槽 2");
  // 第 4 關同時是她的戰敗條件與護送目標，兩個標記都得畫出來。
  const forceField = detail.locator(".rn-character-stage", { hasText: "第 4 關 通過力場" });
  await expect(forceField).toContainText("戰敗條件");
  await expect(forceField).toContainText("護送目標");

  // 只在劇情裡出現的角色照樣進圖鑑，且不會被說成上過場。
  await page.getByTestId("compendium-character-longwang").click();
  await expect(detail.getByRole("heading", { name: "龍王" })).toBeVisible();
  await expect(detail.getByTestId("compendium-character-stages").locator("li")).toHaveCount(1);
  await expect(detail).toContainText("對白登場");

  // 原版沒有替愛莉歐拉畫肖像，圖鑑必須照實說，而不是畫一張別人的臉。
  await page.getByTestId("compendium-character-ailioula").click();
  await expect(detail).toContainText("無專屬肖像");
  await expect(detail).toContainText("肖像 職業回退");
  await expect(detail.locator("img")).toHaveCount(0);
});

test("角色圖鑑覆蓋全部具名角色，有肖像的都畫得出來", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "characters");
  const rows = page.getByTestId("compendium-index").locator(".rn-character-row");
  // 原版角色描述子表裡的 51 名具名角色，雙陣營角色只算一次。
  await expect(rows).toHaveCount(51);

  const detail = page.getByTestId("compendium-detail");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const name = (await row.locator("span").first().textContent())?.trim() ?? "";
    await row.click();
    await expect(detail.getByRole("heading", { level: 3 })).toHaveText(name);
    // 每個角色至少列出一處登場，否則圖鑑就在展示一筆查不到出處的資料。
    await expect(detail.getByTestId("compendium-character-stages").locator("li").first())
      .toBeVisible();
    const portrait = detail.locator(".rn-figure-portrait img");
    if (await portrait.count() === 0) continue;
    await expect.poll(() => portrait
      .evaluate((image: HTMLImageElement) => image.naturalWidth), { message: name })
      .toBeGreaterThan(0);
  }
});

test("兩個分頁各自記住選取，來回切換不會重設", async ({ page }) => {
  await page.goto("/");
  await openCompendium(page, "classes");
  await page.getByTestId("compendium-class-wizard").click();
  await page.getByTestId("compendium-tab-characters").click();
  await page.getByTestId("compendium-character-sulanda").click();

  await page.getByTestId("compendium-tab-classes").click();
  await expect(page.getByTestId("compendium-detail").getByRole("heading", { name: "巫師" }))
    .toBeVisible();
  await page.getByTestId("compendium-tab-characters").click();
  await expect(page.getByTestId("compendium-detail").getByRole("heading", { name: "蘇蘭達" }))
    .toBeVisible();
});
