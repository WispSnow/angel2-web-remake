import { expect, test, type Page } from "@playwright/test";

/**
 * `REMAKE-192` optional HD portraits and voice-paced speech. The stage 0
 * prebattle story (SAY/0) is the fixture: KY 3 is 妮雅 (D/46, a lip-synced HD
 * record) with a ~3 s clip, far longer than her 21 glyphs take to type, so the
 * mouth visibly has to keep following the voice after the text is complete.
 * `skipStartup` leaves audio locked until the first press, so page 1 always
 * types unvoiced and the voiced cases start further in.
 */
const DISPLAY_KEY = "angel2.preferences.display.v1";
const VOICE_KEY = "angel2.preferences.voice.v1";

const usePreferences = async (page: Page, options: { hd?: boolean; voiceVolume?: number }) => {
  await page.addInitScript(([displayKey, display, voiceKey, voice]) => {
    if (display) localStorage.setItem(displayKey, display);
    if (voice) localStorage.setItem(voiceKey, voice);
  }, [
    DISPLAY_KEY,
    options.hd ? JSON.stringify({ imageScaling: "sharp", interfaceZoom: 100, portraitStyle: "hd" }) : "",
    VOICE_KEY,
    options.voiceVolume ? JSON.stringify({ voiceVolume: options.voiceVolume, autoAdvance: false }) : "",
  ] as const);
};

const hdRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/original/portraits/hd/")) seen.push(new URL(request.url()).pathname);
  });
  return seen;
};

const app = (page: Page) => page.locator("#app");
const dialogue = (page: Page) => page.getByTestId("dialogue-layer");
const activePortrait = (page: Page) => page.getByTestId("dialogue-portrait-composite");
const typingDone = (page: Page) => expect(dialogue(page)).toHaveAttribute("data-typing", "false");

const openPrebattleStory = async (page: Page) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "1");
};

/** Unlock audio on page 1, then reach 妮雅's KY 3 as a voiced page. */
const reachVoicedNia = async (page: Page) => {
  await openPrebattleStory(page);
  await expect.poll(() => app(page).getAttribute("data-voice-decoded-count")).not.toBe("0");
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await typingDone(page);
  await page.keyboard.press("Enter");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3");
  await expect(app(page)).toHaveAttribute("data-voice-page", "0:3");
  await expect(app(page)).toHaveAttribute("data-voice-page-started", "true");
};

/** Reads `name` from the active portrait every ~40 ms for `duration` ms. */
const sampleActivePortrait = (page: Page, name: string, duration: number) =>
  page.evaluate(async ([attribute, milliseconds]) => {
    const values: string[] = [];
    const end = performance.now() + milliseconds;
    while (performance.now() < end) {
      const element = document.querySelector<HTMLElement>("[data-testid=dialogue-portrait-composite]");
      values.push(element?.getAttribute(attribute) ?? "");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return values;
  }, [name, duration] as const);

test("REMAKE-192: 原版 is the default, the switch sits in the host chrome and no HD file is requested", async ({ page }) => {
  const requests = hdRequests(page);
  await openPrebattleStory(page);
  await expect(page.getByTestId("portrait-style-original")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("portrait-style-hd")).toHaveAttribute("aria-checked", "false");
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await typingDone(page);
  await page.keyboard.press("Enter");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "original");
  await expect(activePortrait(page).locator("canvas, video")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("REMAKE-192: choosing 高清 mid-story downloads this stage's records, swaps the face in place and persists", async ({ page }) => {
  const requests = hdRequests(page);
  await openPrebattleStory(page);
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await typingDone(page);
  await page.keyboard.press("Enter");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "original");

  await page.getByTestId("portrait-style-hd").click();
  await expect(page.getByTestId("portrait-style-hd")).toHaveAttribute("aria-checked", "true");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "hd");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-hd-mode", "tween");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-ready", "true");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-hd-video", "playing");
  await expect(activePortrait(page).locator("canvas.portrait-hd-canvas")).toHaveAttribute("data-drawn", "true");
  // The loop keeps running: the drawn video time moves on.
  const time = Number(await activePortrait(page).getAttribute("data-portrait-hd-video-time"));
  await expect.poll(async () => Number(await activePortrait(page).getAttribute("data-portrait-hd-video-time"))).not.toBe(time);
  expect(requests).toContain("/assets/original/portraits/hd/0046/portrait.mp4");
  expect(requests).toContain("/assets/original/portraits/hd/0046/poster.webp");
  // Only this stage's faces were fetched, each once.
  expect(new Set(requests).size).toBe(requests.length);
  expect(requests.every((url) => /\/portraits\/hd\/00(?:15|42|43|44|45|46|47|48)\//u.test(url))).toBe(true);

  await page.reload();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "prebattleStory");
  await expect(page.getByTestId("portrait-style-hd")).toHaveAttribute("aria-checked", "true");
  const stored = await page.evaluate((key) => localStorage.getItem(key), DISPLAY_KEY);
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ portraitStyle: "hd" });

  // Back to 原版: the same face returns to the pixel layers without a download.
  await page.getByTestId("portrait-style-original").click();
  await expect(page.locator(".dialogue-portrait[data-portrait-style=hd]")).toHaveCount(0);
});

test("REMAKE-192: an unvoiced HD page talks only while it types", async ({ page }) => {
  await usePreferences(page, { hd: true });
  await openPrebattleStory(page);
  await typingDone(page);
  await dialogue(page).click();
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "2");
  await typingDone(page);
  await page.keyboard.press("Enter");
  await expect(dialogue(page)).toHaveAttribute("data-source-wait", "3");
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "hd");
  await expect(activePortrait(page)).toHaveAttribute("data-speech-driver", "glyph");
  await typingDone(page);
  // The last syllable closes within ~300 ms of the last glyph, then the mouth stays shut.
  await page.waitForTimeout(400);
  const after = await sampleActivePortrait(page, "data-mouth-openness", 600);
  expect(after.every((value) => Number(value) === 0)).toBe(true);
});

test("REMAKE-192: on a voiced page the HD mouth follows the voice past the end of typing and stops with the clip", async ({ page }) => {
  await usePreferences(page, { hd: true, voiceVolume: 4 });
  await reachVoicedNia(page);
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "hd");
  await expect(activePortrait(page)).toHaveAttribute("data-speech-driver", "voice");
  await typingDone(page);
  // Typing ends ~0.3 s in (test pace); the 3 s clip is still being spoken.
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "false");
  const talking = await sampleActivePortrait(page, "data-mouth-openness", 900);
  expect(talking.filter((value) => Number(value) > 0.3).length).toBeGreaterThan(3);
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "true", { timeout: 6_000 });
  await page.waitForTimeout(300);
  const after = await sampleActivePortrait(page, "data-mouth-openness", 500);
  expect(after.every((value) => Number(value) === 0)).toBe(true);
});

test("REMAKE-192: on a voiced page the original mouth keeps its 80 ms flap until the clip ends", async ({ page }) => {
  await usePreferences(page, { voiceVolume: 4 });
  await reachVoicedNia(page);
  await expect(activePortrait(page)).toHaveAttribute("data-portrait-style", "original");
  await expect(activePortrait(page)).toHaveAttribute("data-speech-driver", "voice");
  await typingDone(page);
  const before = Number(await activePortrait(page).getAttribute("data-talk-count"));
  await page.waitForTimeout(600);
  expect(Number(await activePortrait(page).getAttribute("data-talk-count"))).toBeGreaterThan(before + 3);
  await expect(app(page)).toHaveAttribute("data-voice-page-ended", "true", { timeout: 6_000 });
  await expect(activePortrait(page)).toHaveAttribute("data-mouth-frame", "1");
  const settled = Number(await activePortrait(page).getAttribute("data-talk-count"));
  await page.waitForTimeout(400);
  expect(Number(await activePortrait(page).getAttribute("data-talk-count"))).toBe(settled);
});
