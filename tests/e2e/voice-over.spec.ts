import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

/**
 * `REMAKE-188` story voice-over. The stage 0 prebattle story (SAY/0) is the
 * pilot: every typed page there has a clip. `skipStartup` skips the entry
 * panel, so audio unlocks on the first pointer press like the rest of the
 * game; the first page therefore types unvoiced and the cases start on page 2.
 */
const VOICE_KEY = "angel2.preferences.voice.v1";

const useVoice = async (page: Page, preferences: { voiceVolume: number; autoAdvance?: boolean }) => {
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
  }, [VOICE_KEY, JSON.stringify({ autoAdvance: false, ...preferences })] as const);
};

const voiceRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/original/voice/")) seen.push(new URL(request.url()).pathname);
  });
  return seen;
};

const app = (page: Page) => page.locator("#app");
const dialogue = (page: Page) => page.getByTestId("dialogue-layer");
const speechRequests = async (page: Page) => Number(await app(page).getAttribute("data-speech-effect-request-count"));

const waitForPhase = (page: Page, phase: string) =>
  page.waitForFunction((expected) => window.__ANGEL2__?.getState().phase === expected, phase);

const openPrebattleStory = async (page: Page) => {
  await page.goto("/?test=1&skipStartup=1");
  await waitForPhase(page, "prebattleStory");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "1");
};

const typingDone = (page: Page) => expect(dialogue(page)).toHaveAttribute("data-typing", "false");

/** Unlock audio with the first press and land on SAY/0 KY 2 as a voiced page. */
const reachVoicedPage = async (page: Page) => {
  await openPrebattleStory(page);
  await expect.poll(() => app(page).getAttribute("data-voice-decoded-count")).not.toBe("0");
  // Once page 1 has typed, the press both unlocks audio and advances.
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await expect(app(page)).toHaveAttribute("data-voice-page", "0:2");
  await expect(app(page)).toHaveAttribute("data-voice-playing", /\/voice\/0000-02\.ogg$/u);
};

test("REMAKE-188: with voice at 關 no voice file is requested and every glyph still beeps", async ({ page }) => {
  const requests = voiceRequests(page);
  await openPrebattleStory(page);
  await expect.poll(() => speechRequests(page)).toBeGreaterThan(0);
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  const before = await speechRequests(page);
  await expect.poll(() => speechRequests(page)).toBeGreaterThan(before);
  await expect(app(page)).toHaveAttribute("data-voice-volume-level", "0");
  await expect(app(page)).toHaveAttribute("data-voice-page", "none");
  expect(requests).toEqual([]);
});

test("REMAKE-188: the gate preloads the stage's clips and a voiced page does not beep", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  const requests = voiceRequests(page);
  await openPrebattleStory(page);
  await expect.poll(() => requests.length).toBeGreaterThan(20);
  expect(requests.every((url) => /\/voice\/000[0-3]-\d\d\.ogg$/u.test(url))).toBe(true);
  expect(new Set(requests).size).toBe(requests.length);

  // Page 1 typed (unvoiced: audio was still locked) before the press that
  // reached page 2, so its beep count is final from here on.
  await reachVoicedPage(page);
  const beeps = await speechRequests(page);
  await expect(app(page)).toHaveAttribute("data-voice-page-started", "true");
  await typingDone(page);
  // The whole page typed without a single 說話 request, and the clip outlasts it.
  expect(await speechRequests(page)).toBe(beeps);
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "false");
});

test("REMAKE-188: advancing cuts the clip and the next page starts its own", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  await reachVoicedPage(page);
  await typingDone(page);
  const plays = Number(await app(page).getAttribute("data-voice-play-count"));
  await page.keyboard.press("Enter");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3");
  await expect(app(page)).toHaveAttribute("data-voice-page", "0:3");
  await expect(app(page)).toHaveAttribute("data-voice-playing", /\/voice\/0000-03\.ogg$/u);
  expect(Number(await app(page).getAttribute("data-voice-play-count"))).toBe(plays + 1);
});

test("REMAKE-188: auto-advance turns exactly one page after the clip ends", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4, autoAdvance: true });
  await reachVoicedPage(page);
  await expect(app(page)).toHaveAttribute("data-voice-auto-advance", "true");
  // Page 2 is the narrator's ~7 s line; nothing advances while it plays.
  await page.waitForTimeout(2_000);
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3", { timeout: 15_000 });
  await expect(app(page)).toHaveAttribute("data-voice-page", "0:3");
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "false");
});

test("REMAKE-188: a press during typing cancels that page's auto-advance", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4, autoAdvance: true });
  await page.clock.install();
  await openPrebattleStory(page);
  await expect.poll(() => app(page).getAttribute("data-voice-decoded-count")).not.toBe("0");
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  // Freeze the typewriter mid-page so the press completes it instead of advancing.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 60);
  await expect(dialogue(page)).toHaveAttribute("data-typing", "true");
  await expect(app(page)).toHaveAttribute("data-voice-page", "0:2");
  await page.keyboard.press("Enter");
  await typingDone(page);
  await page.clock.resume();
  // The clip keeps playing after 補完 and ends on the audio clock.
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "true", { timeout: 15_000 });
  await page.waitForTimeout(1_500);
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
});

test("REMAKE-188: the skip confirm keeps the clip and blocks auto-advance; confirming cuts it", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4, autoAdvance: true });
  await reachVoicedPage(page);
  await dialogue(page).click({ button: "right" });
  await expect(page.getByTestId("dialogue-skip-confirm")).toBeVisible();
  await expect(app(page)).toHaveAttribute("data-voice-playing", /0000-02/u);
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "true", { timeout: 15_000 });
  await page.waitForTimeout(1_500);
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await page.getByTestId("dialogue-skip-yes").click();
  await waitForPhase(page, "openingStory");
  await expect(app(page)).not.toHaveAttribute("data-voice-playing", /0000-02/u);
});

test("REMAKE-188: global pause freezes the clip and the auto-advance timer", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4, autoAdvance: true });
  await reachVoicedPage(page);
  await page.keyboard.press("p");
  await expect(page.getByTestId("program-pause-overlay")).toBeVisible();
  await expect(app(page)).toHaveAttribute("data-voice-context", "suspended");
  await page.waitForTimeout(9_000);
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "false");
  await page.keyboard.press("p");
  await expect(app(page)).toHaveAttribute("data-voice-context", "running");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3", { timeout: 15_000 });
});

test("REMAKE-188: a clip that fails to download leaves its page unvoiced, beeping, and says so once", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4, autoAdvance: true });
  await page.route("**/assets/original/voice/0000-02.ogg", (route) => route.fulfill({ status: 404, body: "" }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPrebattleStory(page);
  await expect(page.getByTestId("resource-loading-overlay")).toBeHidden({ timeout: 30_000 });
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  const beeps = await speechRequests(page);
  await expect.poll(() => speechRequests(page)).toBeGreaterThan(beeps);
  await expect(app(page)).toHaveAttribute("data-voice-page", "none");
  await expect(page.getByTestId("status-strip")).toContainText("劇情語音");
  // Unvoiced pages never auto-advance.
  await page.waitForTimeout(2_000);
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  expect(errors).toEqual([]);
});

test("REMAKE-188: the entry panel and the 音效開關 panel write the same preference", async ({ page }) => {
  const requests = voiceRequests(page);
  await page.goto("/?test=1");
  await expect(page.getByTestId("startup-enter")).toBeEnabled({ timeout: 15_000 });
  const off = page.getByTestId("startup-voice-off");
  const on = page.getByTestId("startup-voice-on");
  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), VOICE_KEY);
  await expect(off).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("startup-voice-hint")).toContainText("AI");
  await captureVisualAudit(page.getByTestId("startup-screen"), { path: "artifacts/playwright/startup-voice-row.png" });

  // ↓ selects the voice row, → turns it on without entering the game.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(on).toHaveAttribute("aria-checked", "true");
  expect(await stored()).toMatchObject({ voiceVolume: 4 });
  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "ready");
  await page.keyboard.press("ArrowLeft");
  await expect(off).toHaveAttribute("aria-checked", "true");
  expect(await stored()).toMatchObject({ voiceVolume: 0 });
  await on.click();
  expect(await stored()).toMatchObject({ voiceVolume: 4 });
  await expect(page.getByTestId("startup-music-style-original")).toHaveAttribute("aria-checked", "true");
  expect(requests).toEqual([]);
});

test("REMAKE-188: turning voice on mid-stage downloads in the background; the panel shows both rows", async ({ page }) => {
  const requests = voiceRequests(page);
  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("sound-hotspot").click();
  const panel = page.getByTestId("sound-settings-menu");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("voice-volume-0")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("voice-auto-advance-off")).toBeDisabled();
  expect(requests).toEqual([]);

  await page.getByTestId("voice-volume-3").click();
  await expect(page.getByTestId("voice-auto-advance-on")).toBeEnabled();
  await page.getByTestId("voice-auto-advance-on").click();
  await expect.poll(() => requests.length).toBeGreaterThan(20);
  await expect(page.getByTestId("resource-loading-overlay")).toBeHidden();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), VOICE_KEY))
    .toEqual({ voiceVolume: 3, autoAdvance: true });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/sound-panel-voice-rows.png" });
});
