import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";
import { skipOpeningToTitle } from "./startup-controls";

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
  expect([...new Set(requests)].sort()).toEqual([
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
