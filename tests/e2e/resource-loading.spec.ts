import { expect, test } from "@playwright/test";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { portraitAssetUrls } from "../../src/game/content/portrait-assets";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { STARTUP_IMAGE_URLS } from "../../src/game/startup-screen";
import type { CompletedSaveData } from "../../src/game/types";
import { activateStartup, skipOpeningToTitle } from "./startup-controls";
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

test("boot waits for prepared music and a player gesture before the original opening", async ({ page }) => {
  const musicRequests = new Map([
    ["/assets/original/music/MUSIC/0014.ogg", 0],
    ["/assets/original/music/MUSIC/0001.ogg", 0],
  ]);
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (musicRequests.has(pathname)) {
      musicRequests.set(pathname, (musicRequests.get(pathname) ?? 0) + 1);
    }
  });

  await page.goto("/?test=1");
  const startup = page.getByTestId("startup-screen");
  const enter = page.getByTestId("startup-enter");
  await expect(startup).toHaveAttribute("data-startup-phase", "ready");
  await expect(startup).toHaveAttribute("data-startup-music-ready", "true");
  await expect(startup).toHaveAttribute("data-startup-music-context", "suspended");
  await expect(enter).toBeVisible();
  await expect(enter).toBeEnabled();
  await expect(page.getByTestId("opening-intro")).toBeVisible();
  await captureVisualAudit(startup, {
    path: "artifacts/playwright/startup-audio-entry-gate.png",
  });

  await enter.click();
  await expect(startup).toHaveAttribute("data-startup-music-context", "running");
  await expect(startup).toHaveAttribute("data-startup-phase", "intro");
  await expect(startup).toHaveAttribute("data-intro-music-playing", "true");
  expect(Object.fromEntries(musicRequests)).toEqual({
    "/assets/original/music/MUSIC/0014.ogg": 1,
    "/assets/original/music/MUSIC/0001.ogg": 1,
  });
});

test("versioned resource cache survives a reload without refetching completed packs", async ({ page }) => {
  let loaderFetches = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.resourceType() === "fetch"
      && pathname.startsWith("/assets/original/")
      && pathname !== "/assets/original/resource-manifest.v1.json") {
      loaderFetches += 1;
    }
  });

  const enterStage0 = async () => {
    await skipOpeningToTitle(page);
    await expect(page.getByTestId("title-menu")).toBeVisible();
    await page.getByTestId("new-game").click();
    await page.getByTestId("difficulty-0").click();
    await expect(page.getByTestId("dialogue-layer")).toBeVisible({ timeout: 30_000 });
  };

  await page.goto("/?test=1");
  await enterStage0();
  const firstLoadFetches = loaderFetches;
  expect(firstLoadFetches).toBeGreaterThan(0);

  await page.reload();
  await enterStage0();
  expect(loaderFetches).toBe(firstLoadFetches);
  await expect.poll(() => page.evaluate(async () => (
    (await caches.keys()).filter((name) => name.startsWith("angel2-resources-")).length
  ))).toBe(1);
});

test("boot keeps its retry surface until startup PNGs decode and reuses every response", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      __startupDecodeAttempts?: number;
      __releaseStartupDecode?: () => void;
    };
    const originalDecode = HTMLImageElement.prototype.decode;
    const decodeGate = new Promise<void>((resolve) => {
      target.__releaseStartupDecode = resolve;
    });
    target.__startupDecodeAttempts = 0;
    HTMLImageElement.prototype.decode = function decodeAfterGate() {
      if (!this.src.startsWith("blob:")) return originalDecode.call(this);
      target.__startupDecodeAttempts = (target.__startupDecodeAttempts ?? 0) + 1;
      return decodeGate.then(() => originalDecode.call(this));
    };
  });
  const requests = new Map(STARTUP_IMAGE_URLS.map((url) => [url, 0]));
  for (const url of STARTUP_IMAGE_URLS) {
    await page.route(`**${url}`, async (route) => {
      const count = (requests.get(url) ?? 0) + 1;
      requests.set(url, count);
      if (count > 1) await route.abort("failed");
      else await route.continue();
    });
  }

  await page.goto("/?test=1");
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-resource-pack", "boot");
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __startupDecodeAttempts?: number }
  ).__startupDecodeAttempts ?? 0)).toBeGreaterThan(0);
  await expect(page.getByTestId("startup-screen")).toHaveCount(0);

  await page.evaluate(() => (
    window as Window & { __releaseStartupDecode?: () => void }
  ).__releaseStartupDecode?.());
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  const startup = page.getByTestId("startup-screen");
  await expect(startup).toBeVisible();
  await expect(startup).toHaveAttribute("data-startup-assets-ready", "true");
  await expect(startup).toHaveAttribute("data-startup-phase", "ready");
  await activateStartup(page);
  await expect(startup).toHaveAttribute("data-startup-phase", "intro");
  await expect.poll(() => page.getByTestId("startup-canvas").evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const pixels = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 0 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0) visible += 1;
    }
    return visible;
  })).toBeGreaterThan(100);
  await captureVisualAudit(startup, {
    path: "artifacts/playwright/resource-loading-startup-decoded.png",
  });

  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toBeVisible();
  expect(Object.fromEntries(requests)).toEqual(Object.fromEntries(
    STARTUP_IMAGE_URLS.map((url) => [url, 1]),
  ));
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

test("current dialogue portrait layers decode before stage clocks and reuse staged bytes", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      __portraitDecodeAttempts?: number;
      __releasePortraitDecode?: () => void;
      __portraitDomDecodeAttempts?: number;
      __releasePortraitDomDecode?: () => void;
    };
    const originalDecode = HTMLImageElement.prototype.decode;
    const decodeGate = new Promise<void>((resolve) => {
      target.__releasePortraitDecode = resolve;
    });
    const domDecodeGate = new Promise<void>((resolve) => {
      target.__releasePortraitDomDecode = resolve;
    });
    target.__portraitDecodeAttempts = 0;
    target.__portraitDomDecodeAttempts = 0;
    HTMLImageElement.prototype.decode = function decodePortraitAfterGate() {
      if (this.dataset.stagedAssetUrl?.startsWith("/assets/original/portraits/")) {
        target.__portraitDecodeAttempts = (target.__portraitDecodeAttempts ?? 0) + 1;
        return decodeGate.then(() => originalDecode.call(this));
      }
      if (this.closest(".animated-portrait")) {
        target.__portraitDomDecodeAttempts = (target.__portraitDomDecodeAttempts ?? 0) + 1;
        return domDecodeGate.then(() => originalDecode.call(this));
      }
      return originalDecode.call(this);
    };
  });
  const portraitUrls = portraitAssetUrls(46);
  const requests = new Map(portraitUrls.map((url) => [url, 0]));
  for (const url of portraitUrls) {
    await page.route(`**${url}`, async (route) => {
      const count = (requests.get(url) ?? 0) + 1;
      requests.set(url, count);
      if (count > 1) await route.abort("failed");
      else await route.continue();
    });
  }

  await page.goto("/?test=1&skipStartup=1");
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-resource-pack", "stage:stage-00");
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __portraitDecodeAttempts?: number }
  ).__portraitDecodeAttempts ?? 0)).toBeGreaterThan(0);
  await expect(page.getByTestId("game-screen")).toHaveCount(0);

  await page.evaluate(() => (
    window as Window & { __releasePortraitDecode?: () => void }
  ).__releasePortraitDecode?.());
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toBeVisible({ timeout: 15_000 });
  for (let action = 0; action < 4; action += 1) await dialogue.click();

  const portrait = page.getByTestId("dialogue-portrait-composite");
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute("data-portrait-record", "46");
  await expect(portrait).toHaveAttribute("data-portrait-ready", "false");
  await expect(portrait).toHaveAttribute("data-talk-count", "0");
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __portraitDomDecodeAttempts?: number }
  ).__portraitDomDecodeAttempts ?? 0)).toBeGreaterThan(0);
  await dialogue.click();
  expect((await page.evaluate(() => window.__ANGEL2__?.getState()))?.dialogueIndex).toBe(2);

  await page.evaluate(() => (
    window as Window & { __releasePortraitDomDecode?: () => void }
  ).__releasePortraitDomDecode?.());
  await expect(portrait).toHaveAttribute("data-portrait-ready", "true");
  await expect.poll(() => portrait.locator("img").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).src.startsWith("blob:")
      && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await expect.poll(async () => Number(await portrait.getAttribute("data-talk-count")))
    .toBeGreaterThan(0);
  await expect.poll(() => page.locator("#dialogue-copy-upper").evaluate((panel) =>
    panel.getAnimations().every((animation) => animation.playState === "finished"),
  )).toBe(true);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-dialogue-portrait-ready.png",
  });
  expect(Object.fromEntries(requests)).toEqual(Object.fromEntries(
    portraitUrls.map((url) => [url, 1]),
  ));
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

test("formal map skills reuse staged map, unit and atlas bytes through Phaser", async ({ page }) => {
  const tracked = [
    "/assets/original/stage0-map.png",
    "/assets/original/unit-ally-soldier.png",
    "/assets/original/unit-enemy-soldier.png",
    "/assets/original/map-action-atlases/fire-1.png",
    "/assets/original/map-action-atlases/fire-1.json",
  ] as const;
  const requests = new Map(tracked.map((url) => [url, 0]));
  for (const url of tracked) {
    await page.route(`**${url}`, async (route) => {
      const count = (requests.get(url) ?? 0) + 1;
      requests.set(url, count);
      // Before the staged-object-URL bridge, these aborts exhausted Phaser's
      // retries after the resource gate had already hidden its retry surface.
      if (count > 1) await route.abort("failed");
      else await route.continue();
    });
  }

  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__ANGEL2__?.getState() !== undefined);
  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("sister"));
  await canvas.click({ position: { x: 220, y: 177 } });
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-fire-1").click();
  await canvas.click({ position: { x: 380, y: 177 } });
  await page.waitForFunction(() => {
    const state = window.__ANGEL2__?.getState() as {
      specialActionPresentation?: { phase: string; frame: number };
    } | undefined;
    return state?.specialActionPresentation?.phase === "fireEffect";
  });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", /[1-9]/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-staged-map-skill.png",
  });
  await page.waitForFunction(() => {
    const state = window.__ANGEL2__?.getState() as {
      lastSpecialAction?: { actionId: string };
      specialActionPresentation?: object;
    } | undefined;
    return state?.lastSpecialAction?.actionId === "fire-1"
      && state.specialActionPresentation === undefined;
  });
  expect(Object.fromEntries(requests)).toEqual(Object.fromEntries(
    tracked.map((url) => [url, 1]),
  ));
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
