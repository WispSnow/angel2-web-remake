import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";
import { activateStartup, skipOpeningToTitle } from "./startup-controls";

/**
 * `REMAKE-196` optional HD story illustrations. The stage 10 prebattle story
 * (SAY/28, `PP 10`, reached from the stage-11-cleared fixture) is the fixture: BK/10, the airship at the cliff, has an HD
 * version. In 原版 the illustration stays the native 320x200 at (160,80) on the A/20
 * backdrop; in 高清 it covers the whole 640x350 screen under the unchanged story
 * window: a muted looping video, a still, or (cloudy pictures, user review
 * 2026-11-18) a canvas that scrolls a tileable sky strip behind the scene's loop.
 */
const DISPLAY_KEY = "angel2.preferences.display.v1";
const HD = "/assets/original/story/hd";
const BK10_LOOP = `${HD}/bk10/loop.mp4`;

/** Mean absolute change of the canvas' top band (the sky) over `ms`, read back from the canvas itself. */
const skyBandChange = (page: Page, ms: number) => page.evaluate(async (wait) => {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=story-hd-canvas]")!;
  const read = () => canvas.getContext("2d")!.getImageData(0, 8, canvas.width, 24).data;
  const before = read();
  await new Promise((resolve) => setTimeout(resolve, wait));
  const after = read();
  let sum = 0;
  for (let i = 0; i < before.length; i += 4) sum += Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]);
  return sum / (before.length / 2);
}, ms);

const useHd = (page: Page) => page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
  DISPLAY_KEY,
  JSON.stringify({ imageScaling: "sharp", interfaceZoom: 100, portraitStyle: "hd" }),
] as const);

declare global {
  interface Window {
    __storyHdSkyDraws?: { fractionalStrip: number; band: number };
    __titleHdDraws?: { base: number; band: number; bandSource: string; bandX: number[]; multiply: number; lighter: number };
    __introHdDraws?: { base: number; videos: number[]; originals: number; rect: number[] };
  }
}

/** Counts how the sky reaches the story canvas: the strip image itself at a fractional x, or a band canvas. */
const recordSkyDraws = (page: Page) => page.addInitScript(() => {
  const counts = { fractionalStrip: 0, band: 0 };
  window.__storyHdSkyDraws = counts;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.testid === "story-hd-canvas") {
      const source = args[0];
      const dx = Number(args.length >= 9 ? args[5] : args[1]);
      if (source instanceof HTMLImageElement && source.dataset.sourceUrl?.endsWith("/sky.webp") && !Number.isInteger(dx)) counts.fractionalStrip += 1;
      if (source instanceof HTMLCanvasElement) counts.band += 1;
    }
    return (draw as (...a: unknown[]) => void).apply(this, args);
  } as typeof draw;
});

const storyHdRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/original/story/hd/")) seen.push(new URL(request.url()).pathname);
  });
  return seen;
};

const openStage10Story = async (page: Page) => {
  // Clearing stage 11 routes into stage 10, whose prebattle story opens on `PP 10` (S10-A).
  await page.goto("/?debugScenario=stage-11-cleared&difficulty=0&test=1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "28");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "10");
};

test("REMAKE-196: in 原版 the illustration keeps the native 320x200 at (160,80) and no HD file is requested", async ({ page }) => {
  const requests = storyHdRequests(page);
  await openStage10Story(page);
  const background = page.locator("#story-background");
  await expect(background).toBeVisible();
  await expect(background).not.toHaveAttribute("data-story-style", "hd");
  await expect(background.locator("video")).toHaveCount(0);
  const layout = await background.evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.backgroundPosition, size: style.backgroundSize, source: element.style.getPropertyValue("--story-illustration-source") };
  });
  expect(layout.source).toBe("/assets/original/story-stage10-background-10.png");
  expect(layout.position).toContain("160px 80px");
  expect(layout.size).toContain("320px 200px");
  expect(requests).toEqual([]);
});

test("REMAKE-196: in 高清 the airship scene covers the whole screen, its clouds scroll as their own layer, and only stage 10's files are fetched", async ({ page }) => {
  const requests = storyHdRequests(page);
  await useHd(page);
  await recordSkyDraws(page);
  await openStage10Story(page);
  const background = page.locator("#story-background");
  await expect(background).toHaveAttribute("data-story-style", "hd");
  await expect(background).toHaveAttribute("data-story-hd-background", "10");
  await expect(background).toHaveAttribute("data-story-hd-kind", "sky");
  await expect(background).toHaveAttribute("data-story-hd-sky-source", `${HD}/bk10/sky.webp`);
  const video = background.getByTestId("story-hd-video");
  await expect(video).toHaveAttribute("data-source-url", BK10_LOOP);
  await expect(video).toHaveAttribute("data-alpha", "stacked");
  await expect(background).toHaveAttribute("data-story-hd-video", "playing");
  const time = Number(await background.getAttribute("data-story-hd-video-time"));
  await expect.poll(async () => Number(await background.getAttribute("data-story-hd-video-time"))).not.toBe(time);
  const offset = Number(await background.getAttribute("data-story-hd-sky-offset"));
  await expect.poll(async () => Number(await background.getAttribute("data-story-hd-sky-offset"))).not.toBe(offset);
  // the clouds move on the canvas itself, at a few frame pixels per second
  expect(await skyBandChange(page, 1500)).toBeGreaterThan(0.5);
  // the sky strip reaches the visible canvas only through the pre-tiled band: drawing the strip's copies at fractional x
  // left a thin black seam where their partly covered edge pixels met (user review round 4). Headless software canvases
  // do not show that seam, so the draw calls themselves are checked.
  const draws = await page.evaluate(() => window.__storyHdSkyDraws);
  expect(draws?.fractionalStrip).toBe(0);
  expect(draws?.band).toBeGreaterThan(10);

  const geometry = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>(".logical-screen")!;
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=story-hd-canvas]")!;
    const source = document.querySelector<HTMLVideoElement>("[data-testid=story-hd-video]")!;
    const scale = screen.getBoundingClientRect().width / screen.offsetWidth;
    const box = element.getBoundingClientRect();
    const host = screen.getBoundingClientRect();
    const window = document.querySelector<HTMLElement>("[data-testid=dialogue-layer]")!;
    return {
      x: (box.x - host.x) / scale,
      y: (box.y - host.y) / scale,
      width: box.width / scale,
      height: box.height / scale,
      pixels: [element.width, element.height],
      fit: getComputedStyle(element).objectFit,
      rendering: getComputedStyle(element).imageRendering,
      sourceOpacity: getComputedStyle(source).opacity,
      backdrop: getComputedStyle(element.parentElement!).backgroundImage,
      windowAbove: Number(getComputedStyle(window).zIndex) > Number(getComputedStyle(element.parentElement!).zIndex),
    };
  });
  expect(geometry).toMatchObject({ x: 0, y: 0, pixels: [1408, 768], fit: "cover", rendering: "auto", sourceOpacity: "0", backdrop: "none", windowAbove: true });
  expect(geometry.width).toBeCloseTo(640, 0);
  expect(geometry.height).toBeCloseTo(350, 0);
  expect([...new Set(requests)].sort()).toEqual([BK10_LOOP, `${HD}/bk10/poster.webp`, `${HD}/bk10/sky.webp`]);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage10-hd-story-illustration.png" });
});

test("REMAKE-196: the stage 0 opening story plays the layered BK/1 loop in 高清", async ({ page }) => {
  await useHd(page);
  await page.goto("/?test=1&skipStartup=1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  const background = page.locator("#story-background");
  await expect(background).toHaveAttribute("data-story-hd-background", "1");
  await expect(background.getByTestId("story-hd-video")).toHaveAttribute("data-source-url", "/assets/original/story/hd/bk01/loop.mp4");
  await expect(background).toHaveAttribute("data-story-hd-video", "playing");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-hd-story-illustration.png" });
});

test("REMAKE-196: in 高清 the stage 6 prebattle story switches from BK/5 to BK/31 mid-story on the same canvas, the clouds carrying on", async ({ page }) => {
  const requests = storyHdRequests(page);
  await useHd(page);
  // stage 6 opens on its deployment screen (S06-A, from the portal completion); SAY/14 follows the deployment
  await page.goto("/?debugScenario=stage-42-completed-route&difficulty=0&test=1");
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  for (const rosterIndex of [1, 2, 3, 4, 5, 6, 7, 8]) await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  // the finish button may ask for a confirming second press; it is gone once the story starts
  await page.getByTestId("deployment-finish").click();
  if (await page.getByTestId("deployment-finish").isVisible()) await page.getByTestId("deployment-finish").click();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  const background = page.locator("#story-background");
  await expect(dialogue).toHaveAttribute("data-source-record", "14");
  await expect(background).toHaveAttribute("data-story-hd-background", "5");
  await expect(background.getByTestId("story-hd-video")).toHaveAttribute("data-source-url", `${HD}/bk05/loop.mp4`);
  await expect(background).toHaveAttribute("data-story-hd-video", "playing");
  // the gate fetched the stage's whole story set up front (BK/31 borrows BK/5's sky), so `PP 31` needs no new download
  expect([...new Set(requests)].sort()).toEqual([
    `${HD}/bk05/loop.mp4`,
    `${HD}/bk05/poster.webp`,
    `${HD}/bk05/sky.webp`,
    `${HD}/bk31/loop.mp4`,
    `${HD}/bk31/poster.webp`,
  ]);
  for (let wait = 2; wait <= 6; wait += 1) {
    await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement & { mark?: string }>("[data-testid=story-hd-canvas]")!;
    canvas.mark = "bk05";
    return { offset: Number(canvas.parentElement!.dataset.storyHdSkyOffset), at: performance.now() };
  });
  await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
  await expect(dialogue).toHaveAttribute("data-source-wait", "7");
  await expect(background).toHaveAttribute("data-story-hd-background", "31");
  const after = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement & { mark?: string }>("[data-testid=story-hd-canvas]")!;
    return { mark: canvas.mark, offset: Number(canvas.parentElement!.dataset.storyHdSkyOffset), at: performance.now() };
  });
  expect(after.mark).toBe("bk05");
  await expect(background).toHaveAttribute("data-story-hd-sky-source", `${HD}/bk05/sky.webp`);
  // BK/5's sky moves at -10 frame px/s with a 1408 px period: BK/31 continues from where BK/5 was, not from 0
  const expected = before.offset - (10 * (after.at - before.at)) / 1000;
  const drift = (((after.offset - expected) % 1408) + 1408) % 1408;
  expect(Math.min(drift, 1408 - drift)).toBeLessThan(12);
  await expect(background.getByTestId("story-hd-video")).toHaveAttribute("data-source-url", `${HD}/bk31/loop.mp4`);
  await expect(background).toHaveAttribute("data-story-hd-video", "playing");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage6-hd-story-bk31.png" });
});

test("REMAKE-196: in 高清 the stage 12 prebattle story shares BK/10's sky with BK/12 and ends on the still BK/13", async ({ page }) => {
  const requests = storyHdRequests(page);
  await useHd(page);
  await page.goto("/?debugScenario=stage-12-prebattle&difficulty=0&test=1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  const background = page.locator("#story-background");
  await expect(dialogue).toHaveAttribute("data-source-record", "29");
  await expect(background).toHaveAttribute("data-story-hd-background", "10");
  await expect(background).toHaveAttribute("data-story-hd-kind", "sky");
  // the whole stage's story set, the opening story's swamp (BK/14) included; BK/12 borrows BK/10's sky, BK/13 is a poster
  expect([...new Set(requests)].sort()).toEqual([
    `${HD}/bk10/loop.mp4`, `${HD}/bk10/poster.webp`, `${HD}/bk10/sky.webp`,
    `${HD}/bk11/loop.mp4`, `${HD}/bk11/poster.webp`, `${HD}/bk11/sky.webp`,
    `${HD}/bk12/loop.mp4`, `${HD}/bk12/poster.webp`,
    `${HD}/bk13/poster.webp`,
    `${HD}/bk14/loop.mp4`, `${HD}/bk14/poster.webp`, `${HD}/bk14/sky.webp`,
  ]);
  const advanceTo = async (wait: number) => {
    while (Number(await dialogue.getAttribute("data-source-wait")) < wait) {
      const current = Number(await dialogue.getAttribute("data-source-wait"));
      await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
      await expect(dialogue).toHaveAttribute("data-source-wait", String(current + 1));
    }
  };
  await advanceTo(5);
  await expect(background).toHaveAttribute("data-story-hd-background", "11");
  await expect(background).toHaveAttribute("data-story-hd-sky-source", `${HD}/bk11/sky.webp`);
  await advanceTo(6);
  await expect(background).toHaveAttribute("data-story-hd-background", "12");
  await expect(background).toHaveAttribute("data-story-hd-sky-source", `${HD}/bk10/sky.webp`);
  await expect(background).toHaveAttribute("data-story-hd-video", "playing");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage12-hd-story-bk12.png" });
  await advanceTo(9);
  await expect(background).toHaveAttribute("data-story-hd-background", "13");
  await expect(background).toHaveAttribute("data-story-hd-kind", "still");
  await expect(background.getByTestId("story-hd-still")).toHaveAttribute("data-source-url", `${HD}/bk13/poster.webp`);
  await expect(background.locator("video, canvas")).toHaveCount(0);
  await expect.poll(() => background.getByTestId("story-hd-still").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(1408);
});

/**
 * `REMAKE-197` HD title screen: in 高清 the startup downloads the title's layers in the background; when the title
 * assembles, an HD canvas over the original one draws the original canvas (background, menu labels), the land and the
 * scrolling clouds inside the frame, the rebuilt frame, the two women's stacked loop and the logo letters.
 */
const TITLE = `${HD}/title`;

/** Counts what reaches the title's HD canvas: the original canvas, the cloud band (and its source x), the women's halves. */
const recordTitleDraws = (page: Page) => page.addInitScript(() => {
  const counts = { base: 0, band: 0, bandSource: "", bandX: [] as number[], multiply: 0, lighter: 0 };
  window.__titleHdDraws = counts;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.testid === "title-hd-canvas") {
      const source = args[0];
      if (source instanceof HTMLCanvasElement && source.id === "startup-canvas") counts.base += 1;
      else if (source instanceof HTMLCanvasElement && source.dataset.source) {
        counts.band += 1;
        counts.bandSource = source.dataset.source;
        counts.bandX.push(Number(args[1]));
        if (counts.bandX.length > 400) counts.bandX.shift();
      } else if (source instanceof HTMLVideoElement) {
        if (this.globalCompositeOperation === "multiply") counts.multiply += 1;
        if (this.globalCompositeOperation === "lighter") counts.lighter += 1;
      }
    }
    return (draw as (...a: unknown[]) => void).apply(this, args);
  } as typeof draw;
});

test("REMAKE-197: in 高清 the title draws HD land, scrolling clouds and the two women's loop inside the original frame and logo", async ({ page }) => {
  test.setTimeout(120_000);
  const requests = storyHdRequests(page);
  await useHd(page);
  await recordTitleDraws(page);
  await page.goto("/?test=1");
  const screen = page.getByTestId("startup-screen");
  // the layers download in the background while the entry box is up; nothing waits for them
  await expect(screen).toHaveAttribute("data-title-hd-ready", "true", { timeout: 30_000 });
  expect([...new Set(requests.filter((url) => url.startsWith(`${TITLE}/`)))].sort()).toEqual([
    `${TITLE}/frame.png`, `${TITLE}/land-0.webp`, `${TITLE}/land-1.webp`, `${TITLE}/logo-0.png`, `${TITLE}/logo-1.png`,
    `${TITLE}/sky-0.webp`, `${TITLE}/sky-1.webp`, `${TITLE}/women.mp4`,
  ]);
  await skipOpeningToTitle(page);
  await expect(screen).toHaveAttribute("data-title-style", "hd");
  await expect(page.getByTestId("title-menu")).toBeVisible({ timeout: 15_000 });
  const canvas = page.getByTestId("title-hd-canvas");
  await expect(canvas).toBeVisible();
  // it covers the 640x350 screen exactly, its backing at least one canvas pixel per screen pixel
  const [canvasBox, screenBox] = await Promise.all([canvas.boundingBox(), screen.boundingBox()]);
  expect(canvasBox && screenBox && Math.abs(canvasBox.width - screenBox.width) < 1 && Math.abs(canvasBox.x - screenBox.x) < 1).toBe(true);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(0.99);
  // the menu labels and the background come from the original canvas, then the clouds, land, women and logo
  const draws = () => page.evaluate(() => ({ ...window.__titleHdDraws!, bandX: [...window.__titleHdDraws!.bandX] }));
  await expect.poll(async () => (await draws()).lighter).toBeGreaterThan(20);
  const first = await draws();
  expect(first.base).toBeGreaterThan(20);
  expect(first.multiply).toBe(first.lighter);
  expect(first.bandSource).toBe(`${TITLE}/sky-0.webp`);
  // the clouds scroll leftwards at a constant speed: the band's source x keeps growing (modulo the period)
  await page.waitForTimeout(1500);
  const later = await draws();
  const moved = (later.bandX.at(-1)! - first.bandX.at(-1)! + 1488) % 1488;
  expect(moved).toBeGreaterThan(8);
  expect(moved).toBeLessThan(40);
  // the frame bar on the left is the original's light blue, the logo's red fill sits over the women
  const pixel = (x: number, y: number) => canvas.evaluate((element: HTMLCanvasElement, [sx, sy]) => {
    const k = element.width / 640;
    return [...element.getContext("2d")!.getImageData(Math.floor((sx + 0.5) * k), Math.floor((sy + 0.5) * k), 1, 1).data].slice(0, 3);
  }, [x, y] as const);
  expect(await pixel(32 + 12, 150)).toEqual([77, 138, 255]);
  await captureVisualAudit(screen, { path: "artifacts/playwright/title-hd.png" });
  // the menu still answers: ↓ moves the stipple to 繼續遊戲 on the original canvas, which the HD canvas copies
  await page.keyboard.press("ArrowDown");
  await expect(screen).toHaveAttribute("data-title-index", "1");
});

test("REMAKE-197: the idle replay brings the blue variant back in 高清 with its own sky and logo", async ({ page }) => {
  test.setTimeout(150_000);
  await useHd(page);
  await recordTitleDraws(page);
  await page.goto("/?test=1");
  const screen = page.getByTestId("startup-screen");
  await expect(screen).toHaveAttribute("data-title-hd-ready", "true", { timeout: 30_000 });
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible({ timeout: 15_000 });
  // 0000:0480: 201 untouched menu cycles replay the opening and flip the variant
  await expect(screen).toHaveAttribute("data-title-variant", "1", { timeout: 40_000 });
  await expect(page.getByTestId("title-menu")).toBeVisible({ timeout: 40_000 });
  await expect(screen).toHaveAttribute("data-title-style", "hd");
  await expect.poll(() => page.evaluate(() => window.__titleHdDraws!.bandSource)).toBe(`${TITLE}/sky-1.webp`);
  await captureVisualAudit(screen, { path: "artifacts/playwright/title-hd-variant-1.png" });
});

test("REMAKE-197: in 原版 the title stays the original pixels and no HD title file is requested", async ({ page }) => {
  const requests = storyHdRequests(page);
  await page.goto("/?test=1");
  await skipOpeningToTitle(page);
  const screen = page.getByTestId("startup-screen");
  await expect(page.getByTestId("title-menu")).toBeVisible({ timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-title-style", "original");
  await expect(page.getByTestId("title-hd-canvas")).toHaveCount(0);
  expect(requests).toEqual([]);
});

/**
 * `REMAKE-198` HD opening crawl: in 高清 the startup downloads the seven one-shot clips in playing order; while the
 * crawl scrolls, an HD canvas over the original one draws the original canvas (black, crawl rows) and the current
 * picture or two (cross-fading) stretched into the plate rectangle. The pictures switch with the narration.
 */
const INTRO = `${HD}/intro`;
const INTRO_CLIPS = [41, 43, 44, 45, 46, 47, 48].map((record) => `${INTRO}/${record}.mp4`);

/** Counts what reaches the intro's HD canvas: the original canvas, each clip (by index), original plates, the plate rect. */
const recordIntroDraws = (page: Page) => page.addInitScript(() => {
  const counts = { base: 0, videos: [] as number[], originals: 0, rect: [] as number[] };
  window.__introHdDraws = counts;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.testid === "intro-hd-canvas") {
      const source = args[0];
      const k = this.canvas.width / 640;
      if (source instanceof HTMLCanvasElement && source.id === "startup-canvas") counts.base += 1;
      else if (source instanceof HTMLVideoElement) {
        const index = Number(source.dataset.testid?.replace("intro-hd-video-", ""));
        if (!counts.videos.includes(index)) counts.videos.push(index);
        counts.rect = (args.slice(1, 5) as number[]).map((value) => Math.round(value / k));
      } else if (source instanceof HTMLImageElement) counts.originals += 1;
    }
    return (draw as (...a: unknown[]) => void).apply(this, args);
  } as typeof draw;
});

test("REMAKE-198: in 高清 the crawl plays the HD clips at the native scroll speed and switches to BK/43 with the second sentence", async ({ page }) => {
  test.setTimeout(150_000);
  const requests = storyHdRequests(page);
  await useHd(page);
  await recordIntroDraws(page);
  await page.goto("/");
  const screen = page.getByTestId("startup-screen");
  // the clips download in playing order while the entry box is up
  await expect(screen).toHaveAttribute("data-intro-hd-scenes", "7", { timeout: 60_000 });
  expect([...new Set(requests.filter((url) => url.startsWith(`${INTRO}/`)))]).toEqual(INTRO_CLIPS);
  await activateStartup(page);
  await expect(screen).toHaveAttribute("data-startup-phase", "intro", { timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-intro-style", "hd");
  const canvas = page.getByTestId("intro-hd-canvas");
  await expect(canvas).toBeVisible();
  const [canvasBox, screenBox] = await Promise.all([canvas.boundingBox(), screen.boundingBox()]);
  expect(canvasBox && screenBox && Math.abs(canvasBox.width - screenBox.width) < 1 && Math.abs(canvasBox.y - screenBox.y) < 1).toBe(true);
  await expect(canvas).toHaveAttribute("data-scene", "0");
  await expect(canvas).toHaveAttribute("data-scene-source", "video");
  // the first clip runs in step with the crawl: one scroll update is 120 ms
  const sync = (index: number, start: number) => page.evaluate(([i, s]) => {
    const update = Number(document.querySelector<HTMLElement>("[data-testid=startup-screen]")!.dataset.introUpdate);
    const video = document.querySelector<HTMLVideoElement>(`[data-testid=intro-hd-video-${i}]`)!;
    return { drift: Math.abs(video.currentTime - (update * 0.12 - s)), playing: !video.paused, update };
  }, [index, start] as const);
  await page.waitForTimeout(3000);
  const early = await sync(0, 0);
  expect(early.playing).toBe(true);
  expect(early.drift).toBeLessThan(0.4);
  const draws = await page.evaluate(() => ({ ...window.__introHdDraws! }));
  expect(draws.base).toBeGreaterThan(20);
  expect(draws.videos).toEqual([0]);
  expect(draws.originals).toBe(0);
  // stretched into the native plate rectangle, (24,0) 608x257
  expect(draws.rect).toEqual([24, 0, 608, 257]);
  await captureVisualAudit(screen, { path: "artifacts/playwright/intro-hd.png" });
  // sentence 2 (水神「愛西斯」) starts at update 71: BK/43 fades in over the half second either side
  await expect(screen).toHaveAttribute("data-intro-update", /^(7[6-9]|[89]\d)$/u, { timeout: 15_000 });
  await expect(canvas).toHaveAttribute("data-scene", "1");
  const second = await sync(1, 71 * 0.12 - 0.5);
  expect(second.playing).toBe(true);
  expect(second.drift).toBeLessThan(0.4);
  expect(await page.evaluate(() => window.__introHdDraws!.videos)).toEqual([0, 1]);
  // the first clip has left the screen: it waits at frame 0 for the idle replay
  await expect.poll(() => page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>("[data-testid=intro-hd-video-0]")!;
    return video.paused && video.currentTime === 0;
  })).toBe(true);
});

test("REMAKE-198: the HD crawl reaches all seven pictures in order and a key press leaves it for the title", async ({ page }) => {
  test.setTimeout(120_000);
  await useHd(page);
  await recordIntroDraws(page);
  await page.goto("/?test=1");
  const screen = page.getByTestId("startup-screen");
  await expect(screen).toHaveAttribute("data-intro-hd-scenes", "7", { timeout: 60_000 });
  await activateStartup(page);
  await expect(screen).toHaveAttribute("data-startup-phase", "intro", { timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-intro-style", "hd");
  // test mode squeezes the 71 s crawl into 8 s; every clip still gets drawn, in playing order
  await expect.poll(() => page.evaluate(() => window.__introHdDraws!.videos.length), { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  const order = await page.evaluate(() => [...window.__introHdDraws!.videos]);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // the next run (idle replay) is decided afresh; a key press now skips to the title and stops every clip
  await page.keyboard.press("x");
  await expect(screen).toHaveAttribute("data-startup-phase", /title/u);
  await expect(page.getByTestId("intro-hd-canvas")).toBeHidden();
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLVideoElement>("[data-testid^=intro-hd-video-]")].every((video) => video.paused))).toBe(true);
});

test("REMAKE-198: in 原版 the crawl keeps the original plates and no HD clip is requested", async ({ page }) => {
  const requests = storyHdRequests(page);
  await page.goto("/?test=1");
  await activateStartup(page);
  const screen = page.getByTestId("startup-screen");
  await expect(screen).toHaveAttribute("data-startup-phase", "intro", { timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-intro-style", "original");
  await expect(page.getByTestId("intro-hd-canvas")).toHaveCount(0);
  expect(requests).toEqual([]);
});

// `REMAKE-200` ending epilogue. The warrior-statue debug entry runs the native cadence (no `?test=1`): module 35 types
// the text over the two 320x350 halves, and in 高清 one one-shot clip per spread plays between the halves and the text.
const EPILOGUE = `${HD}/epilogue`;
const openWarriorStatue = async (page: Page) => {
  await page.goto("/?debugScenario=stage-49-warrior-statue&difficulty=0&roster=representative-growth&growth=100");
  const screen = page.locator("#stage49-screen");
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-segment", "warriorStatue");
  await expect(screen).toHaveAttribute("data-segment-ready", "true");
  return screen;
};

test("REMAKE-200: in 高清 each epilogue segment plays its HD spread under the typed text, paused with the program", async ({ page }) => {
  test.setTimeout(90_000);
  const requests = storyHdRequests(page);
  await useHd(page);
  const screen = await openWarriorStatue(page);
  await expect(screen).toHaveAttribute("data-epilogue-style", "hd");
  const video = page.getByTestId("stage49-epilogue-hd");
  await expect(video).toHaveAttribute("data-source-url", `${EPILOGUE}/11.mp4`);
  // between the original halves (left in place underneath) and the text canvas, covering the screen
  const layers = await page.getByTestId("stage49-epilogue").evaluate((host) => [...host.children].map((child) => child.className));
  expect(layers.slice(0, 4)).toEqual(["stage49-epilogue-left", "stage49-epilogue-right", "stage49-epilogue-hd", "stage49-epilogue-text"]);
  const [videoBox, screenBox] = await Promise.all([video.boundingBox(), screen.boundingBox()]);
  expect(videoBox && screenBox && Math.abs(videoBox.width - screenBox.width) < 1 && Math.abs(videoBox.height - screenBox.height) < 1).toBe(true);
  expect(await video.evaluate((element) => getComputedStyle(element).imageRendering)).toBe("auto");
  // the route gate fetched this campaign's four spreads and nothing else from the epilogue folder
  const clips = [...new Set(requests.filter((url) => url.startsWith(`${EPILOGUE}/`)))];
  expect(clips).toHaveLength(4);
  expect(clips).toContain(`${EPILOGUE}/11.mp4`);
  // it plays in step with the segment, and the text is typed on top of it
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 10_000 }).toBeGreaterThan(1.5);
  expect(await video.evaluate((element: HTMLVideoElement) => !element.paused && element.muted)).toBe(true);
  await captureVisualAudit(screen, { path: "artifacts/playwright/epilogue-hd.png" });
  // program pause freezes the clip with the typing; resuming carries on from there
  await page.keyboard.press("p");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  const frozen = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await page.waitForTimeout(600);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(frozen);
  await page.keyboard.press("p");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(frozen + 0.2);
  // first press finishes the text, the second moves on: the next segment brings its own spread
  await screen.click();
  await expect(screen).toHaveAttribute("data-epilogue-typing", "false");
  await screen.click();
  const epilogue = page.getByTestId("stage49-epilogue");
  await expect(epilogue).toHaveAttribute("data-segment", "saveCountOutcome");
  const left = (await epilogue.getAttribute("data-selector")) === "0" ? 17 : 19;
  await expect(page.getByTestId("stage49-epilogue-hd")).toHaveAttribute("data-source-url", `${EPILOGUE}/${left}.mp4`);
  await expect(page.getByTestId("stage49-epilogue-hd")).toHaveCount(1);
  expect(clips).toContain(`${EPILOGUE}/${left}.mp4`);
});

test("REMAKE-200: in 原版 the epilogue keeps the original halves and no HD clip is requested", async ({ page }) => {
  const requests = storyHdRequests(page);
  const screen = await openWarriorStatue(page);
  await expect(screen).toHaveAttribute("data-epilogue-style", "original");
  await expect(page.getByTestId("stage49-epilogue-hd")).toHaveCount(0);
  expect(requests.filter((url) => url.startsWith(`${EPILOGUE}/`))).toEqual([]);
});

// `REMAKE-201` "The end" after the credits. The stage-38-cleared debug entry starts the credits; `?test=1` shortens the
// eight scroll transitions to 160 ms each. In 高清 one seamless loop covers the 320x200 picture inside UN/54 frame 0 while
// the original frame 0 (with the hand-written lettering and the heart) and its arm overlay keep running underneath.
const THE_END_LOOP = `${HD}/the-end/loop.mp4`;
const openTheEnd = async (page: Page) => {
  await page.goto("/?debugScenario=stage-38-cleared&difficulty=0&test=1");
  const screen = page.getByTestId("credits-screen");
  await expect(page.getByTestId("credits-final")).toBeVisible({ timeout: 20_000 });
  await expect(screen).toHaveAttribute("data-segment-ready", "true");
  return screen;
};

test("REMAKE-201: in 高清 The end loops its HD picture over the original frame 0, paused with the program", async ({ page }) => {
  test.setTimeout(60_000);
  const requests = storyHdRequests(page);
  await useHd(page);
  const screen = await openTheEnd(page);
  await expect(screen).toHaveAttribute("data-the-end-style", "hd");
  const video = page.getByTestId("credits-final-hd");
  await expect(video).toHaveAttribute("data-source-url", THE_END_LOOP);
  // above the original frame 0 and its overlay, which stay in place underneath
  const layers = await page.getByTestId("credits-final").evaluate((host) => [...host.children].map((child) => child.className));
  expect(layers).toEqual(["credits-final-base", "credits-final-overlay", "credits-final-hd"]);
  // exactly over the picture: the top left 320x200 of the 408x301 frame, so the lettering and the heart stay visible
  const [videoBox, baseBox] = await Promise.all([video.boundingBox(), page.locator(".credits-final-base").boundingBox()]);
  if (!videoBox || !baseBox) throw new Error("The end layers have no box");
  expect(Math.abs(videoBox.x - baseBox.x)).toBeLessThan(1);
  expect(Math.abs(videoBox.y - baseBox.y)).toBeLessThan(1);
  expect(Math.abs(videoBox.width - baseBox.width * 320 / 408)).toBeLessThan(1);
  expect(Math.abs(videoBox.height - baseBox.height * 200 / 301)).toBeLessThan(1);
  expect(await video.evaluate((element) => getComputedStyle(element).imageRendering)).toBe("auto");
  expect(await video.evaluate((element: HTMLVideoElement) => element.loop && element.muted)).toBe(true);
  // the credits route gate fetched the loop and nothing else from story/hd
  expect([...new Set(requests)]).toEqual([THE_END_LOOP]);
  // it loops: past its own length the clock keeps going while the video time wraps
  const duration = await video.evaluate((element: HTMLVideoElement) => element.duration);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 10_000 }).toBeGreaterThan(1);
  expect(await video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);
  await captureVisualAudit(screen, { path: "artifacts/playwright/the-end-hd.png" });
  // program pause freezes the loop; resuming carries on from there
  await page.keyboard.press("p");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  const frozen = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await page.waitForTimeout(600);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(frozen);
  await page.keyboard.press("p");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await expect.poll(async () => {
    const time = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
    return Math.min(Math.abs(time - frozen), duration - Math.abs(time - frozen));
  }).toBeGreaterThan(0.2);
});

test("REMAKE-201: in 原版 The end keeps the original frames and no HD loop is requested", async ({ page }) => {
  const requests = storyHdRequests(page);
  const screen = await openTheEnd(page);
  await expect(screen).toHaveAttribute("data-the-end-style", "original");
  await expect(page.getByTestId("credits-final-hd")).toHaveCount(0);
  expect(requests).toEqual([]);
});
