import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

/**
 * 選單開闔動畫是純表現層的複刻決定：方框自己縮放進出，模擬狀態、輸入語義與存檔不變。
 * 這裡守住三件會真的傷到玩家的事——收合動畫期間選單不能吃掉投向戰場的點擊、動畫播完
 * 一定要真的 `hidden`，以及開啟動畫沒有被誤刪、也沒有被系統「減少動態效果」關掉。
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

interface GlideSample {
  spriteHidden: boolean;
  left: string;
  top: string;
  menuHidden: boolean;
  cursorYielded: boolean;
}

declare global {
  interface Window {
    __menuMutations?: MenuMutation[];
    __glideSamples?: GlideSample[];
  }
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as MenuAnimationState,
);

async function unitCanvasPosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  const current = await state(page);
  const unit = current.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  return {
    x: 40 + (unit.x - current.cameraOrigin.x) * 40 + 20,
    y: 23 + (unit.y - current.cameraOrigin.y) * 44 + 22,
  };
}

async function clickUnit(page: Page, id: string): Promise<void> {
  await page.getByTestId("battle-canvas").click({
    position: await unitCanvasPosition(page, id),
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

/** 記錄畫面內手形精靈、宿主游標讓位與選單出現的先後。 */
async function recordGlide(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sprite = document.querySelector<HTMLElement>("#command-menu-pointer")!;
    const menu = document.querySelector<HTMLElement>("#action-menu")!;
    const screen = document.querySelector<HTMLElement>("#logical-screen")!;
    const log: GlideSample[] = [];
    window.__glideSamples = log;
    const snapshot = () => log.push({
      spriteHidden: sprite.hidden,
      left: sprite.style.left,
      top: sprite.style.top,
      menuHidden: menu.hidden,
      cursorYielded: screen.dataset.pointerGlide === "true",
    });
    const observer = new MutationObserver(snapshot);
    observer.observe(sprite, { attributes: true, attributeFilter: ["style", "hidden"] });
    observer.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
    observer.observe(screen, { attributes: true, attributeFilter: ["data-pointer-glide"] });
  });
}

const glideSamples = (page: Page) => page.evaluate(() => window.__glideSamples ?? []);

test("a pointer-opened command menu keeps the real cursor position and skips the glide", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();

  const actionMenu = page.getByTestId("action-menu");
  await recordGlide(page);
  await clickUnit(page, "1:0");
  await expect(actionMenu).toBeVisible();

  const samples = await glideSamples(page);
  expect(samples.some((sample) => sample.cursorYielded)).toBe(false);
  expect(samples.some((sample) => !sample.spriteHidden)).toBe(false);
  await expect(page.getByTestId("command-menu-pointer")).toBeHidden();
  await expect(page.locator("#logical-screen")).not.toHaveAttribute("data-pointer-glide", "true");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/menu-pointer-open-without-glide.png`,
  });
});

test("keyboard activation retains the native pointer glide when a start point is known", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();

  // 先把戰場焦點與已知宿主指標都放到妮雅，再用鍵盤開選單。
  await canvas.hover({ position: await unitCanvasPosition(page, "1:0") });
  const actionMenu = page.getByTestId("action-menu");
  await recordGlide(page);
  await page.keyboard.press("Space");
  await expect(actionMenu).toBeVisible();

  const samples = await glideSamples(page);
  const gliding = samples.filter((sample) => sample.cursorYielded);
  expect(gliding.length).toBeGreaterThan(0);
  // 滑行期間方框還沒出現，宿主游標也已經讓位給精靈。
  for (const sample of gliding) {
    expect(sample.menuHidden).toBe(true);
    expect(sample.spriteHidden).toBe(false);
  }
  expect(new Set(gliding.map((sample) => `${sample.left}|${sample.top}`)).size)
    .toBeGreaterThan(1);

  // 落點是原生第一行指標點；精靈熱區與 `--native-cursor-hand` 同為 (3, 2)。收起後行內
  // 樣式仍留著最後一格，直接讀它比從變動紀錄回推可靠。
  const landing = await page.getByTestId("command-menu-pointer").evaluate((sprite) => ({
    left: (sprite as HTMLElement).style.left,
    top: (sprite as HTMLElement).style.top,
  }));
  const menuBox = await actionMenu.evaluate((menu) => ({
    left: (menu as HTMLElement).offsetLeft,
    top: (menu as HTMLElement).offsetTop,
  }));
  expect(landing.left).toBe(`${menuBox.left + 120 - 3}px`);
  expect(landing.top).toBe(`${menuBox.top + 28 - 2}px`);

  // 收乾淨：精靈收起、游標交還瀏覽器。
  await expect(page.getByTestId("command-menu-pointer")).toBeHidden();
  await expect(page.locator("#logical-screen")).not.toHaveAttribute("data-pointer-glide", "true");
});

// `test.use({ reducedMotion })` 在本套件不會落到頁面上（實測 `matchMedia` 仍回報
// `no-preference`），所以顯式 `emulateMedia`，斷言才真的跑在系統要求減少動態的路徑上。
test.describe("reduced motion", () => {
  /**
   * 本作刻意不跟隨系統「減少動態效果」：原版的演出是玩法節奏的一部分，壓成瞬時等於
   * 換掉遊戲，而不是保留同一個遊戲的無障礙版本。這裡守住這個決定不被 CSS 或 JS 悄悄
   * 加回一條分支。
   */
  test("the system preference does not switch off the remake's motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    const canvas = page.getByTestId("battle-canvas");
    await expect(canvas).toBeVisible();
    expect(await page.evaluate(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const actionMenu = page.getByTestId("action-menu");
    await canvas.hover({ position: await unitCanvasPosition(page, "1:0") });
    await recordGlide(page);
    await page.keyboard.press("Space");
    await expect(actionMenu).toBeVisible();
    // 鍵盤啟動的指針滑行照常演出，方框開闔動畫也保有真正的時長。
    expect((await glideSamples(page)).some((sample) => sample.cursorYielded)).toBe(true);
    await expectZoomOpenDeclared(actionMenu);

    // 收尾仍必須把 `hidden` 與收合類名處理乾淨。
    await recordMenuMutations(actionMenu);
    await canvas.click({ button: "right", position: { x: 420, y: 45 } });
    await expect(actionMenu).toBeHidden();
    await expect(actionMenu).not.toHaveClass(/is-menu-closing/);
    expect((await menuMutations(page)).some((entry) =>
      entry.className.includes("is-menu-closing") && !entry.hidden)).toBe(true);
  });
});
