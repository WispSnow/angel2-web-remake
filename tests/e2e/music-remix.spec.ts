import { expect, test, type Page } from "@playwright/test";
import { skipStoryDialogue } from "./dialogue-controls";

/**
 * `REMAKE-185`: in 交響 mode every surface's resource gate fetches the remixes
 * that surface will play, the way the original tracks ride in their packs.
 * Each case holds one remix response: a gated file keeps the loading surface
 * up until it is released, while an on-demand one would let the surface show
 * and the music arrive late.
 */
const useOrchestralStyle = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("angel2.preferences.music.v1", JSON.stringify({ musicVolume: 4, musicStyle: "orchestral" }));
  });
};

const holdRemix = async (page: Page, file: string) => {
  let requests = 0;
  let release = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/assets/original/music/remix/${file}`, async (route) => {
    requests += 1;
    await gate;
    await route.continue();
  });
  return { requests: () => requests, release: () => release() };
};

const expectRemixPlaying = async (page: Page, track: string) => {
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-music-style", "orchestral");
  await expect(app).toHaveAttribute("data-music-source", "remix");
  await expect(app).toHaveAttribute("data-music-track", track);
};

test("REMAKE-185: a cleared stage's gate holds the next stage until its deployment remix arrives", async ({ page }) => {
  await useOrchestralStyle(page);
  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 15_000 });
  // Stage 1 is scene 1, so module 27 picks MUSIC/16 for its roster screen.
  const deployment = await holdRemix(page, "MUSIC-16.ogg");
  await page.locator("[data-debug-complete]").click();
  const overlay = page.getByTestId("resource-loading-overlay");
  await expect(overlay).toHaveAttribute("data-resource-pack", "stage:stage-01");
  await expect.poll(deployment.requests).toBe(1);
  await expect(overlay).toBeVisible();

  deployment.release();
  await expect(overlay).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await skipStoryDialogue(page);
  await expect(page.getByTestId("deployment-screen")).toBeVisible({ timeout: 60_000 });
  await expectRemixPlaying(page, "MUSIC/16");
  expect(deployment.requests()).toBe(1);
});

test("REMAKE-185: a debug entry into a late deployment preloads MUSIC/17's remix", async ({ page }) => {
  await useOrchestralStyle(page);
  const deployment = await holdRemix(page, "MUSIC-17.ogg");
  await page.goto("/?test=1&debugScenario=stage-24-deployment");
  await expect.poll(deployment.requests).toBe(1);
  await expect(page.getByTestId("resource-loading-overlay")).toBeVisible();
  await expect(page.getByTestId("deployment-screen")).toHaveCount(0);

  deployment.release();
  await expect(page.getByTestId("deployment-screen")).toBeVisible({ timeout: 60_000 });
  await expectRemixPlaying(page, "MUSIC/17");
  expect(deployment.requests()).toBe(1);
});

test("REMAKE-185: the ending gate fetches only the closing remix this record total selects", async ({ page }) => {
  await useOrchestralStyle(page);
  const story = await holdRemix(page, "MAGIC-77.ogg");
  const roster = await holdRemix(page, "UN-06.ogg");
  const prosperous = await holdRemix(page, "MUSIC-40.ogg");
  const decline = await holdRemix(page, "UN-49.ogg");
  await page.goto("/?debugScenario=stage-49-warrior-statue&difficulty=0&test=1");
  await expect.poll(() => prosperous.requests() + decline.requests()).toBe(1);
  await expect.poll(story.requests).toBe(1);
  await expect.poll(roster.requests).toBe(1);
  await expect(page.locator("#stage49-screen")).toHaveCount(0);

  for (const held of [story, roster, prosperous, decline]) held.release();
  await expect(page.locator("#stage49-screen")).toBeVisible({ timeout: 60_000 });
  await expectRemixPlaying(page, prosperous.requests() === 1 ? "MUSIC/40" : "UN/49");
  expect(prosperous.requests() + decline.requests()).toBe(1);
});

test("REMAKE-185: the credits gate fetches UN/55's remix before the roll appears", async ({ page }) => {
  await useOrchestralStyle(page);
  const credits = await holdRemix(page, "UN-55.ogg");
  await page.goto("/?debugScenario=stage-38-cleared&difficulty=0&test=1");
  await expect.poll(credits.requests).toBe(1);
  await expect(page.getByTestId("credits-screen")).toHaveCount(0);

  credits.release();
  await expect(page.getByTestId("credits-screen")).toBeVisible({ timeout: 60_000 });
  await expectRemixPlaying(page, "UN/55");
  expect(credits.requests()).toBe(1);
});
