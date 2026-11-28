import { expect, test, type Page } from "@playwright/test";
import { NATIVE_CONTEXTUAL_BATTLE_LINES } from "../../src/game/content/ai-technique-dialogue.generated";
import { OUTCOME_FEEDBACK_TEXT } from "../../src/game/content/outcome-feedback";
import { VOICE_PORTRAIT_VOICES, voiceLineSource, voiceTextHash } from "../../src/game/content/voice-catalog";
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

const quitVoiceUrl = voiceLineSource(VOICE_PORTRAIT_VOICES[46], voiceTextHash(OUTCOME_FEEDBACK_TEXT.quit));

const openQuitConfirmation = async (page: Page) => {
  await page.getByTestId("battle-canvas").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.getByTestId("system-command-quit").click();
  await expect(page.getByTestId("quit-confirm")).toBeVisible();
};

const cancelQuitConfirmation = async (page: Page) => {
  await page.getByTestId("quit-confirm-menu").getByRole("menuitem", { name: /取/u }).click();
  await expect(page.getByTestId("quit-confirm")).toBeHidden();
  if (await page.getByTestId("system-menu").isVisible()) await page.keyboard.press("Escape");
};

const useBattleRecord = async (page: Page, action: "save" | "load", slot: number) => {
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId(`${action}-hotspot`).click();
  await page.getByTestId(`record-slot-${slot}`).click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
  if (action === "load") await expect(page.getByTestId("status-strip")).toContainText(`已讀取記錄 ${slot}`);
};

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
  // Story clips of this gate, then (REMAKE-189) the battle lines of the voices on the board.
  const story = requests.filter((url) => /\/voice\/000[0-3]-\d\d\.ogg$/u.test(url));
  const lines = requests.filter((url) => /\/voice\/line\/[A-Za-z0-9]+\/[0-9a-f]{8}\.ogg$/u.test(url));
  expect(story.length).toBeGreaterThan(20);
  expect(story.length + lines.length).toBe(requests.length);
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
  // REMAKE-189: turning voice on in the box fetches the opening narration, and only that.
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => /\/voice\/narration\/startup-\d\d\.ogg$/u.test(url))).toBe(true);
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

test("REMAKE-189: the opening crawl is narrated sentence by sentence, and skipping it cuts the narration", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  const requests = voiceRequests(page);
  await page.goto("/?test=1");
  const screen = page.getByTestId("startup-screen");
  await expect(page.getByTestId("startup-enter")).toBeEnabled({ timeout: 15_000 });
  await expect.poll(() => requests.filter((url) => url.includes("/narration/startup-")).length).toBe(9);
  await page.getByTestId("startup-enter").click();
  await expect(screen).toHaveAttribute("data-startup-phase", "intro");
  await expect(screen).toHaveAttribute("data-narration-playing", "true");
  await expect.poll(async () => Number(await screen.getAttribute("data-narration-started"))).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(screen).toHaveAttribute("data-startup-phase", "title-assemble");
  await expect(screen).toHaveAttribute("data-narration-playing", "false");
});

test("REMAKE-189: a group command is voiced in the commander's voice and waits for the clip", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  const requests = voiceRequests(page);
  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("battle-canvas")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => requests.filter((url) => url.includes("/voice/line/")).length).toBeGreaterThan(30);
  // A press on the empty page unlocks audio without touching the board; `g` opens the group commands.
  await page.mouse.click(100, 600);
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  const beeps = await speechRequests(page);
  await page.getByTestId("group-command-allRest").click();
  await expect(dialogue(page)).toHaveClass(/group-command-dialogue/);
  await expect(app(page)).toHaveAttribute("data-voice-page", /^[A-Za-z0-9]+:[0-9a-f]{8}$/u);
  await expect(app(page)).toHaveAttribute("data-voice-playing", /\/voice\/line\//u);
  await typingDone(page);
  expect(await speechRequests(page)).toBe(beeps);
  // Test mode advances a group command 1.2 s after typing; a voiced one waits for its clip.
  await page.waitForTimeout(1_500);
  await expect(dialogue(page)).toHaveClass(/group-command-dialogue/);
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "false");
  await expect(dialogue(page)).not.toHaveClass(/group-command-dialogue/, { timeout: 10_000 });
});

test("REMAKE-189: 妮雅's quit confirmation is voiced instead of beeping", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  const requests = voiceRequests(page);
  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("battle-canvas")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => requests.filter((url) => url.includes("/voice/line/")).length).toBeGreaterThan(30);
  await page.mouse.click(100, 600);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  const beeps = await speechRequests(page);
  await page.getByTestId("system-command-quit").click();
  await expect(page.getByTestId("quit-confirm")).toBeVisible();
  await expect(app(page)).toHaveAttribute("data-voice-playing", /\/voice\/line\/8RCmdqih4CKjJ7Bd3ZxT\//u);
  await page.waitForTimeout(600);
  expect(await speechRequests(page)).toBe(beeps);
  // Cancelling closes the window and fades its line out.
  await page.getByTestId("quit-confirm-menu").getByRole("menuitem", { name: /取/u }).click();
  await expect(page.getByTestId("quit-confirm")).toBeHidden();
  await expect(app(page)).toHaveAttribute("data-voice-playing", "none");
});

test("REMAKE-189: the first confirmation after loading another stage reuses the shared voice", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  const requests = voiceRequests(page);
  await page.goto("/?debugScenario=stage-01-player&difficulty=0&test=1");
  await useBattleRecord(page, "save", 2);
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.waitForFunction(async (url) => (await import("/src/game/voice-transport.ts")).hasEncodedVoice(url), quitVoiceUrl);
  await openQuitConfirmation(page);
  await expect(app(page)).toHaveAttribute("data-voice-playing", quitVoiceUrl);
  await cancelQuitConfirmation(page);
  const downloadsBefore = requests.filter((url) => url === quitVoiceUrl).length;

  await useBattleRecord(page, "load", 2);
  await expect(app(page)).toHaveAttribute("data-voice-gate", "stage-01");
  const beeps = await speechRequests(page);
  await openQuitConfirmation(page);
  await expect(app(page)).toHaveAttribute("data-voice-playing", quitVoiceUrl);
  expect(await speechRequests(page)).toBe(beeps);
  expect(requests.filter((url) => url === quitVoiceUrl)).toHaveLength(downloadsBefore);
});

test("REMAKE-189: reopening a failed line after a same-stage load retries it for the next window", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  await page.addInitScript(() => {
    localStorage.setItem("angel2.preferences.display.v1", JSON.stringify({ portraitStyle: "hd" }));
  });
  const pattern = `**${quitVoiceUrl}`;
  let online = false;
  await page.route(pattern, (route) => online ? route.continue() : route.fulfill({ status: 503, body: "" }));
  const failedDownload = page.waitForResponse((response) => response.url().endsWith(quitVoiceUrl) && response.status() === 503);
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await failedDownload;
  await openQuitConfirmation(page);
  await expect(app(page)).toHaveAttribute("data-voice-failed-count", "1");
  await cancelQuitConfirmation(page);
  online = true;
  await useBattleRecord(page, "save", 1);
  await useBattleRecord(page, "load", 1);

  const retry = page.waitForResponse((response) => response.url().endsWith(quitVoiceUrl) && response.ok());
  await openQuitConfirmation(page);
  await retry;
  await expect(app(page)).toHaveAttribute("data-voice-failed-count", "0");
  await expect(app(page)).toHaveAttribute("data-voice-playing", "none");
  await cancelQuitConfirmation(page);

  const beeps = await speechRequests(page);
  await openQuitConfirmation(page);
  await expect(app(page)).toHaveAttribute("data-voice-playing", quitVoiceUrl);
  expect(await speechRequests(page)).toBe(beeps);
  await expect(page.getByTestId("quit-confirm").locator(".animated-portrait")).toHaveAttribute("data-portrait-style", "hd");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/hd-voice-recovered.png" });
});

test("REMAKE-202: a kill's 得經驗值 window says 獲得經驗值 in the killer's voice instead of beeping", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  // The commander 妮雅 (D/46) stands next to a 1-life enemy; whatever the award, one clip reads it.
  const voiceId = VOICE_PORTRAIT_VOICES[46];
  const textHash = voiceTextHash(NATIVE_CONTEXTUAL_BATTLE_LINES.experienceGain.text);
  const clip = voiceLineSource(voiceId, textHash);
  const fetched: string[] = [];
  page.on("requestfinished", (request) => fetched.push(new URL(request.url()).pathname));
  await page.goto("/?test=1&debugScenario=stage-00-near-victory&difficulty=0");
  await waitForPhase(page, "player");
  // Battle lines play only once their bytes are in memory, so wait for the board's download.
  await expect.poll(() => fetched.includes(clip), { timeout: 30_000 }).toBe(true);
  const beeps = await speechRequests(page);
  await page.getByTestId("battle-canvas").click({ position: { x: 220, y: 177 } });
  await page.getByTestId("unit-command-attack").click();
  await expect(dialogue(page)).toHaveAttribute("data-source-record", "experience-gain", { timeout: 40_000 });
  await expect(dialogue(page)).toContainText(/得經驗值 *\d+ 點/u);
  await expect(app(page)).toHaveAttribute("data-voice-page", `${voiceId}:${textHash}`);
  await expect(app(page)).toHaveAttribute("data-voice-playing", new RegExp(`/voice/line/${voiceId}/${textHash}\\.ogg$`, "u"));
  await typingDone(page);
  expect(await speechRequests(page)).toBe(beeps);
  await expect(dialogue(page)).not.toHaveAttribute("data-source-record", "experience-gain", { timeout: 10_000 });
});

test("REMAKE-191: the entry panel's 翻頁方式 row starts on 自動 with voice and writes the panel's 自動翻頁", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByTestId("startup-enter")).toBeEnabled({ timeout: 15_000 });
  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), VOICE_KEY);
  const auto = page.getByTestId("startup-voice-mode-auto");
  const manual = page.getByTestId("startup-voice-mode-manual");
  const row = page.getByTestId("startup-voice-mode-row");
  // With voice off the row only shows the default and cannot be changed.
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await expect(auto).toBeDisabled();
  await expect(manual).toBeDisabled();
  await expect(row).toHaveAttribute("data-disabled", "true");

  // ↓ voice row, → on: voice starts in 自動 page turning.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("startup-voice-on")).toHaveAttribute("aria-checked", "true");
  expect(await stored()).toEqual({ voiceVolume: 4, autoAdvance: true });
  await expect(row).toHaveAttribute("data-disabled", "false");
  await captureVisualAudit(page.getByTestId("startup-screen"), { path: "artifacts/playwright/startup-voice-mode-row.png" });

  // ↓ reaches 翻頁方式; → picks 手動, ← back to 自動. Nothing enters the game.
  await page.keyboard.press("ArrowDown");
  await expect(row).toHaveAttribute("data-row-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(manual).toHaveAttribute("aria-checked", "true");
  expect(await stored()).toEqual({ voiceVolume: 4, autoAdvance: false });
  await page.keyboard.press("ArrowLeft");
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await manual.click();
  expect(await stored()).toEqual({ voiceVolume: 4, autoAdvance: false });
  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "ready");

  // Turning voice off greys the row and moves the selection back to 劇情語音;
  // turning it on again starts from 自動.
  await page.getByTestId("startup-voice-off").click();
  await expect(row).toHaveAttribute("data-disabled", "true");
  await expect(page.getByTestId("startup-voice-row")).toHaveAttribute("data-row-selected", "true");
  await page.getByTestId("startup-voice-on").click();
  await expect(auto).toHaveAttribute("aria-checked", "true");
  expect(await stored()).toEqual({ voiceVolume: 4, autoAdvance: true });
});

test("REMAKE-191: turning voice on in the 音效開關 panel starts in 自動翻頁", async ({ page }) => {
  await useVoice(page, { voiceVolume: 0, autoAdvance: false });
  await page.goto("/?test=1&debugScenario=stage-00-player");
  await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("sound-hotspot").click();
  await expect(page.getByTestId("voice-auto-advance-off")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("voice-volume-2").click();
  await expect(page.getByTestId("voice-auto-advance-on")).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), VOICE_KEY))
    .toEqual({ voiceVolume: 2, autoAdvance: true });
  // A volume change while voice is already on keeps the player's choice.
  await page.getByTestId("voice-auto-advance-off").click();
  await page.getByTestId("voice-volume-4").click();
  await expect(page.getByTestId("voice-auto-advance-off")).toHaveAttribute("aria-checked", "true");
});

test("a debug scenario opened from /debug.html voices its very first page, before any press", async ({ page }) => {
  await useVoice(page, { voiceVolume: 4 });
  // Not in test mode (the hub's own link), so the voice data attributes are off:
  // record every buffer the page starts instead. Music buffers are far longer.
  await page.addInitScript(() => {
    const starts: number[] = [];
    (window as unknown as { __bufferStarts: number[] }).__bufferStarts = starts;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      starts.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  });
  await page.goto("/debug.html");
  await page.locator('a[data-debug-scenario-id="stage-00-prebattle"]').click();
  await page.waitForURL(/debugScenario=stage-00-prebattle/u);
  await expect(dialogue(page)).toBeVisible({ timeout: 15_000 });
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "1");
  // SAY/0 KY 1 is clip 0:1 (6,416 ms). The hub's click lets audio start on this
  // page, and the gate decoded the clip before the loading screen lifted.
  const firstClipSeconds = 6.416;
  await expect.poll(
    () => page.evaluate(() => (window as unknown as { __bufferStarts: number[] }).__bufferStarts),
    { timeout: 5_000 },
  ).toContainEqual(expect.closeTo(firstClipSeconds, 1));
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "1");
});
