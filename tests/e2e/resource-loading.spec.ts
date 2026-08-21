import { expect, test } from "@playwright/test";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";
import { skipOpeningToTitle } from "./startup-controls";
import { captureVisualAudit } from "./visual-audit";

const stage1CompletedSave = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: SAVE_CONTENT_VERSION,
  kind: "completed",
  savedAt: "2026-08-20T12:00:00.000Z",
  saveCount: 3,
  stageId: "stage-01",
  stageLabel: "騎士城堡前",
  ruleset: "stableRemake",
  difficulty: 0,
  rngState: 0x1020_3040,
  rngCalls: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "soldier", experience: 399, life: 160 },
  ]),
  recordCounters: Array<number>(75).fill(0),
  stageProgress: 0,
  consumedEventIds: [],
});

test("boot shows only opening resources while stage 0 warms in the background", async ({ page }) => {
  const requested = new Set<string>();
  let releaseStage0 = () => undefined;
  const stage0Gate = new Promise<void>((resolve) => {
    releaseStage0 = resolve;
  });
  await page.route("**/assets/original/stage0-map.png", async (route) => {
    requested.add(new URL(route.request().url()).pathname);
    await stage0Gate;
    await route.continue();
  });
  page.on("request", (request) => requested.add(new URL(request.url()).pathname));

  await page.goto("/?test=1");
  await expect(page.getByTestId("startup-screen")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => requested.has("/assets/original/stage0-map.png"), {
    timeout: 15_000,
  }).toBe(true);
  await expect(page.getByTestId("resource-loading-overlay")).toBeHidden();
  expect(requested.has("/assets/original/stage1-map.png")).toBe(false);
  releaseStage0();
});

test("new game waits for the byte-counted stage 0 pack before mounting Phaser", async ({ page }) => {
  let releaseStage0 = () => undefined;
  const stage0Gate = new Promise<void>((resolve) => {
    releaseStage0 = resolve;
  });
  await page.route("**/assets/original/stage0-map.png", async (route) => {
    await stage0Gate;
    await route.continue();
  });

  await page.goto("/?test=1&skipStartup=1");
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-resource-pack", "stage:stage-00");
  await expect(page.locator("#phaser-root canvas")).toHaveCount(0);
  await expect(page.getByTestId("resource-loading-detail")).toContainText(/%.*MiB／.*MiB/);
  const progress = page.getByTestId("resource-loading-progress");
  await expect.poll(async () => Number(await progress.getAttribute("value"))).toBeGreaterThan(0);
  expect(Number(await progress.getAttribute("value"))).toBeLessThan(100);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/resource-loading-stage0-progress.png",
    animations: "disabled",
  });

  releaseStage0();
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#phaser-root canvas")).toBeVisible({ timeout: 15_000 });
});

test("stage music finishes before the scene mounts and playback reuses the staged bytes", async ({ page }) => {
  let musicRequests = 0;
  let releaseMusic = () => undefined;
  const musicGate = new Promise<void>((resolve) => {
    releaseMusic = resolve;
  });
  await page.route("**/music/generated/stage0-story-seamless.ogg", async (route) => {
    musicRequests += 1;
    await musicGate;
    await route.continue();
  });

  await page.goto("/?test=1&skipStartup=1");
  await expect(page.getByTestId("resource-loading-overlay")).toBeVisible();
  await expect(page.locator("#phaser-root canvas")).toHaveCount(0);
  await expect.poll(() => musicRequests).toBe(1);

  releaseMusic();
  await expect(page.getByTestId("resource-loading-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("game-screen").click({ position: { x: 620, y: 340 } });
  await expect(page.locator("#app")).toHaveAttribute("data-music-playing", "true", {
    timeout: 15_000,
  });
  expect(musicRequests).toBe(1);
});

test("current class full-combat textures decode before the first panorama frame", async ({ page }) => {
  let atlasRequests = 0;
  let backdropRequests = 0;
  let releaseFullCombat = () => undefined;
  const fullCombatGate = new Promise<void>((resolve) => {
    releaseFullCombat = resolve;
  });
  await page.route("**/full-combat-atlases/left-soldier.png", async (route) => {
    atlasRequests += 1;
    await fullCombatGate;
    await route.continue();
  });
  await page.route("**/full-combat/backgrounds/05.png", async (route) => {
    backdropRequests += 1;
    await route.continue();
  });

  await page.goto("/?test=1&slowFull=1&skipStartup=1");
  await expect(page.getByTestId("resource-loading-overlay")).toBeVisible();
  await expect(page.locator("#phaser-root canvas")).toHaveCount(0);
  releaseFullCombat();
  await expect(page.getByTestId("resource-loading-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#phaser-root canvas")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__ANGEL2__?.getState() !== undefined);
  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("soldier", true));
  await page.getByTestId("battle-canvas").click({ position: { x: 220, y: 177 } });
  await page.getByTestId("unit-command-attack").click();
  const actor = page.getByTestId("full-actor-sprite");
  await expect(actor).toBeVisible();
  await expect(actor).toHaveAttribute("data-atlas", "left-soldier");
  await expect(actor).toHaveAttribute("data-atlas-image-ready", "true");
  expect(await actor.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toMatch(/^url\(["']?blob:/u);
  const backdrop = page.getByTestId("full-combat-background");
  await expect(backdrop).toHaveAttribute("data-image-ready", "true");
  expect(await backdrop.getAttribute("src")).toMatch(/^blob:/u);
  expect(atlasRequests).toBe(1);
  expect(backdropRequests).toBe(1);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-full-combat-first-frame.png",
  });
});

test("a failed stage resource stays on a readable retry surface and retries the URL", async ({ page }) => {
  let stage0MapRequests = 0;
  await page.route("**/assets/original/stage0-map.png", async (route) => {
    stage0MapRequests += 1;
    if (stage0MapRequests === 1) {
      await route.fulfill({ status: 503, contentType: "text/plain", body: "temporary failure" });
      return;
    }
    await route.continue();
  });

  await page.goto("/?test=1&skipStartup=1");
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("resource-loading-status")).toHaveText("資源讀取失敗");
  await expect(page.getByTestId("resource-loading-detail")).toContainText("stage0-map.png");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/resource-loading-retry.png",
    animations: "disabled",
  });

  await page.getByTestId("resource-loading-retry").click();
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#phaser-root canvas")).toBeVisible({ timeout: 15_000 });
  expect(stage0MapRequests).toBeGreaterThanOrEqual(2);
});

test("continue gates the saved target stage rather than assuming stage 0", async ({ page }) => {
  const save = JSON.stringify(stage1CompletedSave());
  await page.addInitScript((serialized) => {
    localStorage.setItem("angel2.save.1", serialized);
  }, save);
  let releaseStage1 = () => undefined;
  const stage1Gate = new Promise<void>((resolve) => {
    releaseStage1 = resolve;
  });
  await page.route("**/assets/original/stage1-map.png", async (route) => {
    await stage1Gate;
    await route.continue();
  });

  await page.goto("/?test=1");
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();
  await page.getByTestId("title-record-slot-1").click();

  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-resource-pack", "stage:stage-01");
  await expect(page.getByTestId("deployment-screen")).toHaveCount(0);
  releaseStage1();
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("game-screen")).toHaveAttribute("aria-label", /騎士城堡前/);
});

test("clearing a stage forces only its successor, then prefetches the following two", async ({ page }) => {
  const requested = new Set<string>();
  page.on("request", (request) => requested.add(new URL(request.url()).pathname));
  let releaseStage1 = () => undefined;
  const stage1Gate = new Promise<void>((resolve) => {
    releaseStage1 = resolve;
  });
  await page.route("**/assets/original/stage1-map.png", async (route) => {
    await stage1Gate;
    await route.continue();
  });

  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await page.locator("[data-debug-complete]").click();
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-resource-pack", "stage:stage-01");
  expect(requested.has("/assets/original/stage2-map.png")).toBe(false);
  releaseStage1();

  await expect(overlay).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => requested.has("/assets/original/stage2-map.png"), {
    timeout: 15_000,
  }).toBe(true);
  await expect.poll(() => requested.has("/assets/original/stage3-map.png"), {
    timeout: 15_000,
  }).toBe(true);
  expect(requested.has("/assets/original/stage4-map.png")).toBe(false);
});
