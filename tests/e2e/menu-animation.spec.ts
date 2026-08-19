import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 選單開闔動畫是純表現層的複刻決定：方框自己縮放進出，模擬狀態、輸入語義與存檔不變。
 * 這裡守住三件會真的傷到玩家的事——收合動畫期間選單不能吃掉投向戰場的點擊、動畫播完
 * 一定要真的 `hidden`（含 `prefers-reduced-motion` 路徑），以及開啟動畫沒有被誤刪。
 */

interface MenuMutation {
  className: string;
  hidden: boolean;
  inert: boolean;
  pointerEvents: string;
}

interface MenuAnimationState {
  cameraOrigin: { x: number; y: number };
  units: Array<{ id: string; side: number; x: number; y: number }>;
}

declare global {
  interface Window {
    __menuMutations?: MenuMutation[];
  }
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as MenuAnimationState,
);

async function clickUnit(page: Page, id: string): Promise<void> {
  const current = await state(page);
  const unit = current.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (unit.x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (unit.y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

/**
 * 收合只有一百多毫秒，靠「關閉後立刻斷言」會變成計時競賽。改成先掛 MutationObserver
 * 記錄整段過程，關完再回頭檢查中間態，斷言就與機器快慢無關。
 */
async function recordMenuMutations(menu: Locator): Promise<void> {
  await menu.evaluate((element) => {
    const log: MenuMutation[] = [];
    window.__menuMutations = log;
    const snapshot = () => log.push({
      className: element.className,
      hidden: (element as HTMLElement).hidden,
      inert: (element as HTMLElement).inert,
      pointerEvents: getComputedStyle(element).pointerEvents,
    });
    new MutationObserver(snapshot).observe(element, {
      attributes: true,
      attributeFilter: ["class", "hidden", "inert"],
    });
  });
}

const menuMutations = (page: Page) => page.evaluate(() => window.__menuMutations ?? []);

async function expectZoomOpenDeclared(menu: Locator): Promise<void> {
  const animation = await menu.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(animation.name).toBe("native-menu-zoom-in");
  expect(Number.parseFloat(animation.duration)).toBeGreaterThan(0.05);
}

test("menus zoom open and stay inert while the close animation plays", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();

  const systemMenu = page.getByTestId("system-menu");
  await canvas.hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("system-menu-button").click();
  await expect(systemMenu).toBeVisible();
  await expectZoomOpenDeclared(systemMenu);

  await recordMenuMutations(systemMenu);
  await systemMenu.click({ button: "right" });
  await expect(systemMenu).toBeHidden();

  const systemLog = await menuMutations(page);
  const closing = systemLog.filter((entry) => entry.className.includes("is-menu-closing"));
  expect(closing.length).toBeGreaterThan(0);
  // 收合中的那一格：仍在畫面上，但已退出無障礙樹，也不再攔截指標。
  expect(closing.some((entry) => !entry.hidden)).toBe(true);
  for (const entry of closing) {
    if (entry.hidden) continue;
    expect(entry.inert).toBe(true);
    expect(entry.pointerEvents).toBe("none");
  }
  // 收尾必須把收合類名與 `inert` 一起清掉，否則下次開啟會停在收合態。
  const final = systemLog.at(-1);
  expect(final).toMatchObject({ hidden: true, inert: false });
  expect(final?.className).not.toContain("is-menu-closing");

  const actionMenu = page.getByTestId("action-menu");
  await clickUnit(page, "1:0");
  await expect(actionMenu).toBeVisible();
  await expectZoomOpenDeclared(actionMenu);

  await recordMenuMutations(actionMenu);
  await canvas.click({ button: "right", position: { x: 420, y: 45 } });
  await expect(actionMenu).toBeHidden();
  expect((await menuMutations(page)).some((entry) =>
    entry.className.includes("is-menu-closing") && !entry.hidden)).toBe(true);

  // 收合期間發出的下一個點擊必須照常選到單位，不能被淡出中的方框吞掉。
  await clickUnit(page, "1:0");
  await expect(actionMenu).toBeVisible();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("menus still finish closing when motion is reduced", async ({ page }) => {
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    const canvas = page.getByTestId("battle-canvas");
    await expect(canvas).toBeVisible();

    const actionMenu = page.getByTestId("action-menu");
    await clickUnit(page, "1:0");
    await expect(actionMenu).toBeVisible();
    await canvas.click({ button: "right", position: { x: 420, y: 45 } });
    await expect(actionMenu).toBeHidden();
    await expect(actionMenu).not.toHaveClass(/is-menu-closing/);
  });
});
