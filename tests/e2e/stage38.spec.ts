import { expect, test, type Page } from "@playwright/test";
import { CREDITS_NAME_FRAMES, CREDITS_ROLE_FRAMES } from "../../src/game/content/credits";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage38State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  cameraOrigin: { x: number; y: number };
  campaignRoute?: string;
  consumedEventIds: string[];
  credits?: { section: string; pageIndex: number; transitionIndex: number };
  units: Array<{ id: string; side: number; slot: number; classId: string; x: number; y: number }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage38State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage38State | undefined)?.phase === expected,
  phase,
);

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S38-A/B: hidden stage deployment preserves two fixed actors and 18 open cells", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-deployment&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "異世界 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／20");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(18);
  await expect(page.getByTestId("deployment-guidance")).toContainText("妮雅與希蜜固定出場");
  expect(await state(page)).toMatchObject({
    stageId: "stage-38",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-38",
    consumedEventIds: ["stage-38-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage38-deployment.png`,
  });
});

test("S38-C/D: the battle uses 20 allies, 44 enemies, and the all-enemy objective", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(20);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(44);
  expect(battle.units).toContainEqual(expect.objectContaining({
    id: "2:52", classId: "beast-knight", x: 25, y: 26,
  }));
  expect(battle.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "2:46", classId: "magic-archer" }),
    expect.objectContaining({ id: "2:16", classId: "swift-dragon-knight" }),
    expect.objectContaining({ id: "2:17", classId: "great-dragon-knight" }),
  ]));
  await expect.poll(async () => page.getByTestId("battle-canvas").evaluate((canvas) =>
    JSON.parse(canvas.dataset.unitTextureById ?? "{}") as Record<string, string>))
    .toMatchObject({
      "2:46": "enemy-magic-archer",
      "2:16": "enemy-swift-dragon-knight",
      "2:17": "enemy-great-dragon-knight",
    });
  for (let step = 0; step < 2; step += 1) await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 7; step += 1) await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /魔弓兵魔弓兵/u);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /迅龍騎士娜米/u);
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /巨龍騎士梅蒂/u);
  for (let step = 0; step < 2; step += 1) await page.keyboard.press("ArrowUp");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /瑪西爾/u);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "31");
  await expect(page.getByTestId("unit-portrait"))
    .toHaveAttribute("src", /portraits\/0031\/base\.png$/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage38-named-enemy-hud.png`,
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("所有回到異世界的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage38-battle.png`,
  });
});

test("S38-E: near-victory fixture leaves one adjacent 1-HP enemy", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 25, y: 25 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:52")).toMatchObject({
    classId: "beast-knight",
    x: 30,
    y: 28,
    life: 1,
  });
  expect(prepared.units.find(({ id }) => id === "1:0")).toMatchObject({
    name: "妮雅",
    x: 29,
    y: 28,
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(async () => page.getByTestId("battle-canvas")
    .getAttribute("data-unit-texture-by-id")).toContain("2:52");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage38-near-victory-fixture.png`,
  });
  await clickCell(page, 29, 28);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 30, 28);
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "165");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
});

test("S38-C: the opening focuses Nia after all 44 static enemies already exist", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-opening&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "164");
  await expect(page.getByTestId("dialogue-layer")).toContainText("和煦的陽光");
  const opening = await state(page);
  expect(opening).toMatchObject({
    phase: "openingStory",
    activeStoryId: "stage-38-opening-story",
    cameraOrigin: { x: 25, y: 18 },
    consumedEventIds: [
      "stage-38-enter-deployment",
      "stage-38-opening-story",
    ],
  });
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(44);
  expect(opening.units.filter(({ side, x, y }) => side === 2
    && x >= opening.cameraOrigin.x && x < opening.cameraOrigin.x + 10
    && y >= opening.cameraOrigin.y && y < opening.cameraOrigin.y + 7)).toHaveLength(0);
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-unit-life-label-count", /[1-9]/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage38-opening-story.png`,
  });
});

test("S38-E: Nia defeat retries the hidden-stage deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "異世界 · 出擊準備" })).toBeVisible();
});

test("S38-F/G: victory saves stage 39, shows seven credit pages, then loops on The End", async ({ page }) => {
  await page.goto("/?debugScenario=stage-38-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "165");
  await expect(page.getByTestId("dialogue-layer")).toContainText("和煦的陽光");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "credits");
  const creditsRoll = page.locator(".credits-roll");
  await expect(creditsRoll).toBeVisible();
  await page.waitForFunction(() =>
    (document.querySelector(".credits-roll")?.getAnimations().length ?? 0) > 0);
  await expect(page.getByTestId("credits-screen")).toHaveAttribute("data-segment-ready", "true");
  await page.evaluate(async () => {
    const animation = document.querySelector(".credits-roll")?.getAnimations()[0];
    if (!animation) throw new Error("credits scroll animation not found");
    if (!(animation.effect instanceof KeyframeEffect)) {
      throw new Error("credits scroll keyframe effect not found");
    }
    animation.effect.setKeyframes([
      { transform: "translateY(-400px)" },
      { transform: "translateY(-400px)" },
    ]);
    animation.pause();
    animation.currentTime = 159;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });

  const completedSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
      version: number; contentVersion: string; stageId: string; stageLabel: string;
      consumedEventIds: string[];
    });
  expect(completedSave).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageId: "stage-39",
    stageLabel: "製作人員表",
    consumedEventIds: [
      "stage-38-enter-deployment",
      "stage-38-opening-story",
      "stage-38-objective-reached",
      "stage-38-victory-story",
      "stage-38-completed-route",
    ],
  });
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/55");
  expect(await state(page)).toMatchObject({
    credits: { section: "page", pageIndex: 0, transitionIndex: 0 },
  });
  await page.getByTestId("credits-screen").click();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await state(page)).credits?.transitionIndex).toBe(0);
  await expect.poll(async () => page.getByTestId("credits-page")
    .locator("img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  await expect(page.getByTestId("credits-page")).toHaveAttribute("aria-label", "製作人員表 1／7");
  await expect(page.getByAltText("工作人員")).toBeInViewport();
  const creditsGeometry = await page.getByTestId("credits-screen").evaluate((screen) => {
    const bounds = screen.getBoundingClientRect();
    return { screenCenter: bounds.left + bounds.width / 2, viewportCenter: window.innerWidth / 2 };
  });
  expect(Math.abs(creditsGeometry.screenCenter - creditsGeometry.viewportCenter)).toBeLessThanOrEqual(1);
  await captureVisualAudit(page, {
    path: `${ARTIFACT_DIR}/stage38-credits-centered.png`,
    fullPage: true,
  });
  await captureVisualAudit(page.getByTestId("credits-screen"), {
    path: `${ARTIFACT_DIR}/stage38-credits-page-1.png`,
  });
  for (let transition = 0; transition < 8; transition += 1) {
    await page.evaluate(() => {
      const animation = document.querySelector(".credits-roll")?.getAnimations()[0];
      if (!animation) throw new Error("credits scroll animation not found");
      animation.finish();
    });
    if (transition + 1 < 8) {
      await expect.poll(async () => (await state(page)).credits?.transitionIndex)
        .toBe(transition + 1);
      if (transition + 1 < 7) {
        await expect(page.getByTestId("credits-page"))
          .toHaveAttribute("aria-label", `製作人員表 ${transition + 2}／7`);
      }
    }
  }
  await expect(page.getByTestId("credits-final")).toBeVisible();
  await expect(page.getByTestId("credits-screen")).toHaveAttribute("data-segment-ready", "true");
  expect(await state(page)).toMatchObject({
    phase: "credits",
    campaignRoute: "stage-39",
    credits: { section: "the-end", pageIndex: 6, transitionIndex: 7 },
  });
  await captureVisualAudit(page.getByTestId("credits-screen"), {
    path: `${ARTIFACT_DIR}/stage38-the-end.png`,
  });
  await page.getByTestId("credits-screen").click();
  await page.keyboard.press("Enter");
  expect((await state(page)).credits).toEqual({ section: "the-end", pageIndex: 6, transitionIndex: 7 });
});

test("S38-H: each credits transition waits for decoded frames and reuses staged responses", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      __releaseCreditsImages?: () => void;
      __creditsDecodeAttempts?: number;
    };
    const originalDecode = HTMLImageElement.prototype.decode;
    const gate = new Promise<void>((resolve) => {
      target.__releaseCreditsImages = resolve;
    });
    target.__creditsDecodeAttempts = 0;
    HTMLImageElement.prototype.decode = function decodeCreditsImageAfterGate() {
      if (!this.closest("#credits-screen")) return originalDecode.call(this);
      target.__creditsDecodeAttempts = (target.__creditsDecodeAttempts ?? 0) + 1;
      return gate.then(() => originalDecode.call(this));
    };
  });
  const tracked = [CREDITS_ROLE_FRAMES[0].src, CREDITS_NAME_FRAMES[0].src];
  const requests = new Map(tracked.map((url) => [url, 0]));
  for (const url of tracked) {
    await page.route(`**${url}`, async (route) => {
      const count = (requests.get(url) ?? 0) + 1;
      requests.set(url, count);
      if (count > 1) await route.abort("failed");
      else await route.continue();
    });
  }

  await page.goto("/?debugScenario=stage-38-cleared&difficulty=0&test=1");
  const screen = page.getByTestId("credits-screen");
  await expect(screen).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __creditsDecodeAttempts?: number }
  ).__creditsDecodeAttempts ?? 0)).toBeGreaterThan(0);
  await expect(screen).toHaveAttribute("data-segment-ready", "false");
  expect(await screen.evaluate((element) => element.querySelector(".credits-roll")?.getAnimations().length ?? 0))
    .toBe(0);
  expect((await state(page)).credits?.transitionIndex).toBe(0);

  await page.evaluate(() => (
    window as Window & { __releaseCreditsImages?: () => void }
  ).__releaseCreditsImages?.());
  await expect(screen).toHaveAttribute("data-segment-ready", "true");
  await expect.poll(() => screen.evaluate((element) =>
    element.querySelector(".credits-roll")?.getAnimations().length ?? 0,
  )).toBeGreaterThan(0);
  await expect.poll(() => page.getByTestId("credits-page").locator("img").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).src.startsWith("blob:")
      && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  expect(Object.fromEntries(requests)).toEqual(Object.fromEntries(
    tracked.map((url) => [url, 1]),
  ));
});
