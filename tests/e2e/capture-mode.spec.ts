import { expect, test, type Page } from "@playwright/test";

/**
 * 開發構建的錄製模式（`capture=1`）：視頻倉庫的錄製工具照鏡頭清單開網址，等 `ready`、起跑、
 * 按事件標記對齊兩遍。這裡驗收準備門（程式時鐘停在第一幀）、事件順序、只差表現設定的兩遍
 * 能逐頁對齊，以及乾淨畫面與錯誤參數處理。錄製工具以 1920×1080 視窗、免手勢自動播放開瀏覽器。
 */
test.use({
  viewport: { width: 1920, height: 1080 },
  launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
});

interface CaptureEventRecord {
  readonly t: number;
  readonly type: string;
  readonly preStart?: boolean;
  readonly page?: number;
  readonly [detail: string]: unknown;
}

const STORY_URL = "/?debugScenario=stage-01-prebattle&capture=1&voice=4&autoPage=1&music=original&until=story-end";

const waitForCaptureReady = async (page: Page) => {
  await page.waitForFunction(() => window.__ANGEL2_CAPTURE__ !== undefined, null, { timeout: 30_000 });
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.ready);
  expect(await page.evaluate(() => window.__ANGEL2_CAPTURE__?.status)).toBe("ready");
};

const captureEvents = (page: Page): Promise<CaptureEventRecord[]> =>
  page.evaluate(() => [...(window.__ANGEL2_CAPTURE__?.events ?? [])] as CaptureEventRecord[]);

/** 起跑後等到第 `pageIndex` 頁對白開窗，回傳到那時為止的事件。 */
const runUntilDialoguePage = async (page: Page, pageIndex: number) => {
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.start());
  await page.waitForFunction((index) => (window.__ANGEL2_CAPTURE__?.events ?? [])
    .some((event) => event.type === "dialogue-page" && event.page === index), pageIndex, { timeout: 45_000 });
  return captureEvents(page);
};

test("capture mode holds a debug story on its first frame with a clean screen", async ({ page }) => {
  await page.goto(STORY_URL);
  await waitForCaptureReady(page);
  await expect(page.getByTestId("debug-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("host-menu-trigger")).toBeHidden();
  await expect(page.getByTestId("program-pause-overlay")).toBeHidden();
  expect(await captureEvents(page)).toEqual([]);

  // 1920×1080 版面：畫面鋪滿寬度並上下置中。
  const rect = await page.evaluate(() => window.__ANGEL2_CAPTURE__?.rect());
  expect(rect).toEqual({ x: 0, y: 15, width: 1920, height: 1050 });

  // 程式時鐘停住：一秒內畫面與對白位置都不動。
  const screen = page.locator("#logical-screen");
  const before = await screen.screenshot();
  await page.waitForTimeout(1_000);
  expect((await screen.screenshot()).equals(before)).toBe(true);
  expect(await page.evaluate(() => (window.__ANGEL2_CAPTURE__?.state() as { dialogueIndex?: number }).dialogueIndex))
    .toBe(0);

  const events = await runUntilDialoguePage(page, 1);
  expect(events[0]).toMatchObject({ type: "scene", t: 0, entry: "stage-01-prebattle" });
  expect(events[0]).toMatchObject({ presentation: { voice: 4, autoPage: true, music: "original" } });
  expect(events.filter(({ preStart }) => preStart).map(({ type }) => type))
    .toEqual(expect.arrayContaining(["phase", "dialogue-page", "voice-start"]));
  const types = events.map(({ type }) => type);
  expect(types).toEqual(expect.arrayContaining(["music-start", "voice-end", "dialogue-page"]));
  expect(types.indexOf("voice-end")).toBeLessThan(types.lastIndexOf("dialogue-page"));
  const times = events.map(({ t }) => t);
  expect(times).toEqual([...times].sort((a, b) => a - b));
  // 同一筆事件也派發給頁面。
  expect(await page.evaluate(() => new Promise((resolve) => {
    window.addEventListener("angel2-capture", (event) => {
      resolve((event as CustomEvent<{ type: string }>).detail.type);
    }, { once: true });
  }))).toEqual(expect.any(String));
});

test("two passes differing only in art align their dialogue pages within 50 ms", async ({ browser }) => {
  test.setTimeout(120_000);
  const pageTimes: number[][] = [];
  for (const art of ["original", "hd"] as const) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(`${STORY_URL}&art=${art}`);
    await waitForCaptureReady(page);
    const events = await runUntilDialoguePage(page, 3);
    expect(events[0]).toMatchObject({ type: "scene", presentation: { art } });
    pageTimes.push(events
      .filter((event) => event.type === "dialogue-page" && !event.preStart)
      .map(({ t }) => t)
      .slice(0, 3));
    await context.close();
  }
  const [original, hd] = pageTimes;
  expect(original).toHaveLength(3);
  expect(hd).toHaveLength(3);
  for (const [index, time] of original.entries()) {
    expect(Math.abs(time - hd[index]), `page ${index + 1}: ${time} vs ${hd[index]}`).toBeLessThanOrEqual(50);
  }
});

test("startup=title assembles the title from its first frame and finishes on until", async ({ page }) => {
  await page.goto("/?capture=1&startup=title&art=original&voice=0&music=original&until=title-shown%2B1500");
  await waitForCaptureReady(page);
  await expect(page.getByTestId("startup-activation")).toBeHidden();
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.start());
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.done);
  const events = await captureEvents(page);
  expect(events.map(({ type }) => type)).toEqual(["scene", "title-shown", "done"]);
  expect(events[1]).toMatchObject({ preStart: true, style: "original" });
  expect(events[2]?.t).toBeGreaterThanOrEqual(1_500);
});

test("URL presentation settings apply to this page only and are never written back", async ({ page, context }) => {
  await page.goto("/?debugScenario=stage-01-player&capture=1&art=hd&music=orchestral&voice=max&autoPage=0");
  await waitForCaptureReady(page);
  expect(await page.evaluate(() => window.__ANGEL2_CAPTURE__?.state())).toMatchObject({
    portraitStyle: "hd",
    musicStyle: "orchestral",
  });
  const hub = await context.newPage();
  await hub.goto("/debug.html");
  expect(await hub.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("angel2.preferences.")))).toEqual([]);
  await expect(hub.getByTestId("debug-portrait-style")).toHaveValue("original");
  await expect(hub.getByTestId("debug-music-style")).toHaveValue("original");
});

test("invalid capture parameters fall back to the debug load error", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-player&capture=1&art=4k");
  await expect(page.getByRole("heading", { name: "無效錄製參數" })).toBeVisible();
  await expect(page.locator(".debug-load-error")).toContainText("art=4k");
  await expect(page.getByRole("link", { name: "返回場景選擇" })).toHaveAttribute("href", "/debug.html");

  await page.goto("/?debugScenario=stage-01-player&until=story-end");
  await expect(page.locator(".debug-load-error")).toContainText("capture=1");
});

test("debug scenarios without capture=1 keep the toolbar and expose no capture API", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-player");
  await expect(page.getByTestId("debug-toolbar")).toBeVisible();
  expect(await page.evaluate(() => window.__ANGEL2_CAPTURE__)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.dataset.capture)).toBeUndefined();
});

test("in-scene directives open a host panel or select a unit before the ready gate", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-player&capture=1&art=hd&open=roadmap");
  await waitForCaptureReady(page);
  // 打開宿主選單就是暫停：起跑後畫面仍停在面板上，由錄製工具自己關掉。
  await expect(page.getByTestId("roadmap")).toBeVisible();
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.start());
  const opened = (await captureEvents(page)).filter(({ type }) => type === "menu-open");
  expect(opened.map(({ menu, preStart }) => ({ menu, preStart })))
    .toEqual([{ menu: "host-menu", preStart: true }, { menu: "roadmap", preStart: true }]);
  await expect(page.getByTestId("roadmap")).toBeVisible();

  await page.goto(`/?debugScenario=stage-05-player&capture=1&select=${encodeURIComponent("萊茵")}&panel=detail`);
  await waitForCaptureReady(page);
  const state = await page.evaluate(() => window.__ANGEL2_CAPTURE__?.state() as { selectedId?: string; portraitsEnabled?: boolean });
  expect(state.selectedId).toBeTruthy();
  expect(state.portraitsEnabled).toBe(true);
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /萊茵/u);

  await page.goto("/?debugScenario=stage-01-player&capture=1&focus=nobody");
  await expect(page.getByRole("heading", { name: "無效錄製參數" })).toBeVisible();
  await expect(page.locator(".debug-load-error")).toContainText("妮雅");
});

test("the technique lab plays a URL sequence after start and finishes on sequence-end", async ({ page }) => {
  await page.goto("/technique-lab.html?capture=1&art=original&preset=example&sequence=1F,1H&autoplay=1&until=sequence-end");
  await waitForCaptureReady(page);
  const rect = await page.evaluate(() => window.__ANGEL2_CAPTURE__?.rect());
  expect(rect?.height).toBeCloseTo(1080, 0);
  // 起跑前停在第一幀，時間軸不前進。
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.getState().playback.timeMs)).toBe(0);
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.start());
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.done);
  const events = await captureEvents(page);
  expect(events.map(({ type, action }) => action ? `${type}:${String(action)}` : type)).toEqual([
    "scene",
    "technique-start:1F",
    "technique-end:1F",
    "technique-start:1H",
    "technique-end:1H",
    "sequence-end",
    "done",
  ]);

  await page.goto("/technique-lab.html?capture=1&sequence=4F,ZZ");
  await expect(page.getByRole("heading", { name: "無效實驗室參數" })).toBeVisible();
});

test("the combat lab holds its first frame and plays once on start with autoplay=1", async ({ page }) => {
  await page.goto("/combat-lab.html?capture=1&attacker=warrior&defender=archer&autoplay=1&until=combat-end");
  await waitForCaptureReady(page);
  expect(await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.getState().t)).toBe(0);
  expect(await page.evaluate(() => window.__ANGEL2_CAPTURE__?.rect())).toEqual({ x: 0, y: 15, width: 1920, height: 1050 });
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.start());
  await page.evaluate(() => window.__ANGEL2_CAPTURE__?.done);
  expect((await captureEvents(page)).map(({ type }) => type)).toEqual(["scene", "combat-start", "combat-end", "done"]);
});
