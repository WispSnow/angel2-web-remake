import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterAttackTargeting } from "./command-controls";
import { openHostMenu, resumeFromHostMenu } from "./host-menu-helpers";
import { captureVisualAudit } from "./visual-audit";

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

test("REMAKE-192: 原版 is the default and no HD file is requested", async ({ page }) => {
  const requests = hdRequests(page);
  await openPrebattleStory(page);
  // REMAKE-193: the switch is not in the host menu either; it lives in the entry panel.
  await openHostMenu(page);
  await expect(page.getByTestId("host-menu-list").getByText(/肖像|美術風格/)).toHaveCount(0);
  await resumeFromHostMenu(page);
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

test("REMAKE-193: the entry panel offers 肖像風格 with the other remake options", async ({ page }) => {
  const requests = hdRequests(page);
  await page.goto("/?test=1");
  await expect(page.getByTestId("startup-enter")).toBeEnabled({ timeout: 15_000 });
  const row = page.getByTestId("startup-portrait-style-row");
  const original = page.getByTestId("startup-portrait-style-original");
  const hd = page.getByTestId("startup-portrait-style-hd");
  await expect(original).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("startup-portrait-style-hint")).toContainText("AI");
  await expect(page.getByTestId("startup-portrait-style-hint")).toContainText("遊戲功能");
  // The wider box still fits the 640x350 screen with every hint on one line.
  const [box, screen] = await Promise.all([
    page.getByTestId("startup-activation").boundingBox(),
    page.getByTestId("startup-screen").boundingBox(),
  ]);
  expect(box && screen && box.y >= screen.y && box.y + box.height <= screen.y + screen.height).toBe(true);
  await captureVisualAudit(page.getByTestId("startup-screen"), { path: "artifacts/playwright/startup-portrait-style-row.png" });

  // With voice off, ↓↓ goes 音樂風格 → 劇情語音 → 肖像風格 (翻頁方式 is skipped); → picks 高清.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(row).toHaveAttribute("data-row-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(hd).toHaveAttribute("aria-checked", "true");
  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), DISPLAY_KEY);
  expect(await stored()).toMatchObject({ portraitStyle: "hd" });
  await page.keyboard.press("ArrowLeft");
  await expect(original).toHaveAttribute("aria-checked", "true");
  await hd.click();
  expect(await stored()).toMatchObject({ portraitStyle: "hd" });
  // Choosing never enters the game, and the opening has no portraits to fetch.
  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "ready");
  expect(requests).toEqual([]);
});

test("REMAKE-193: 遊戲功能 carries 肖像風格 below the native submenu; switching mid-battle swaps the faces and persists", async ({ page }) => {
  const requests = hdRequests(page);
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const hud = page.getByTestId("unit-portrait-composite");
  await expect(hud).toHaveAttribute("data-portrait-style", "original");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.getByTestId("system-command-settings").click();
  const menu = page.getByTestId("settings-menu");
  const strip = page.getByTestId("settings-portrait-style");
  await expect(menu).toBeVisible();
  await expect(strip).toBeVisible();
  // The native panel keeps its five switches; the remake row sits below its shadow.
  await expect(menu.locator("[data-settings-index]")).toHaveCount(5);
  const [menuBox, stripBox] = await Promise.all([menu.boundingBox(), strip.boundingBox()]);
  expect(menuBox && stripBox && stripBox.y >= menuBox.y + menuBox.height).toBe(true);
  await expect(page.getByTestId("settings-portrait-style-original")).toHaveAttribute("aria-checked", "true");

  // ↓ five times reaches it, → picks 高清, ↓ wraps back to 人物圖像.
  for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowDown");
  await expect(strip).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("settings-portrait-style-hd")).toHaveAttribute("aria-checked", "true");
  await expect(hud).toHaveAttribute("data-portrait-style", "hd");
  await expect(hud).toHaveAttribute("data-portrait-hd-video", "playing");
  await expect(hud.locator("canvas.portrait-hd-canvas")).toHaveAttribute("data-drawn", "true");
  const time = Number(await hud.getAttribute("data-portrait-hd-video-time"));
  await expect.poll(async () => Number(await hud.getAttribute("data-portrait-hd-video-time"))).not.toBe(time);
  expect(requests).toContain("/assets/original/portraits/hd/0046/portrait.mp4");
  expect(new Set(requests).size).toBe(requests.length);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/settings-portrait-style.png" });
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("portraits-button")).toHaveClass(/is-selected/);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(strip).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("unit-portrait-composite")).toHaveAttribute("data-portrait-style", "hd");
  const stored = await page.evaluate((key) => localStorage.getItem(key), DISPLAY_KEY);
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ portraitStyle: "hd" });

  // Back to 原版 with a click: the same face returns to the pixel layers.
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-settings").click();
  await page.getByTestId("settings-portrait-style-original").click();
  await expect(page.getByTestId("unit-portrait-composite")).toHaveAttribute("data-portrait-style", "original");
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

/**
 * `REMAKE-194` full-screen combat panels. Stage 0's test hook puts 妮雅 between
 * two soldiers; `slowFull` plays the presentation at native speed so the
 * panels stay up long enough to watch.
 */
const openFullCombat = async (page: Page) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1&slowFull=1");
  await expect(page.getByTestId("unit-portrait-composite")).toBeVisible();
  const state = () => page.evaluate(() => window.__ANGEL2__?.getState() as unknown as {
    battlePresentation: "map" | "full";
    cameraOrigin: { x: number; y: number };
    targets: Array<{ x: number; y: number }>;
  });
  if ((await state()).battlePresentation !== "full") {
    await page.keyboard.press("Escape");
    await page.getByTestId("system-command-settings").click();
    await page.getByTestId("presentation-button").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("system-menu")).toBeHidden();
  }
  expect((await state()).battlePresentation).toBe("full");
  await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
  await page.keyboard.press(" ");
  await enterAttackTargeting(page);
  const { cameraOrigin, targets: [target] } = await state();
  await page.getByTestId("battle-canvas").click({
    position: { x: 40 + (target.x - cameraOrigin.x) * 40 + 20, y: 23 + (target.y - cameraOrigin.y) * 44 + 22 },
  });
  await expect(page.getByTestId("full-left-status")).toBeVisible();
  await expect(page.getByTestId("full-right-status")).toBeVisible();
};

/**
 * The 92x104 framed box crops a square face exactly like the old `<img>`: every
 * face layer (base or poster, and the HD canvas) fills the 88x100 inner box with
 * `object-fit: cover`, so the face is 100x100 with 6 px cut off each side.
 */
const expectCoverCrop = async (portrait: Locator) => {
  const geometry = await portrait.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const scale = box.width / (element as HTMLElement).offsetWidth;
    const layers = [...element.querySelectorAll<HTMLElement>(".portrait-base, canvas.portrait-hd-canvas")].map((layer) => {
      const rect = layer.getBoundingClientRect();
      return [
        Math.round((rect.left - box.left) / scale),
        Math.round((rect.top - box.top) / scale),
        Math.round(rect.width / scale),
        Math.round(rect.height / scale),
        getComputedStyle(layer).objectFit,
      ].join(" ");
    });
    return { width: Math.round(box.width / scale), height: Math.round(box.height / scale), layers: [...new Set(layers)] };
  });
  expect(geometry).toEqual({ width: 92, height: 104, layers: ["2 2 88 100 cover"] });
};

test("REMAKE-194: in HD the full-screen combat panels play the idle loop with the mouth shut", async ({ page }) => {
  await usePreferences(page, { hd: true });
  await openFullCombat(page);
  for (const side of ["left", "right"] as const) {
    const portrait = page.getByTestId(`full-${side}-portrait`);
    await expect(portrait).toHaveAttribute("data-portrait-style", "hd");
    await expect(portrait).toHaveAttribute("data-portrait-hd-video", "playing");
    await expect(portrait.locator("canvas.portrait-hd-canvas")).toHaveAttribute("data-drawn", "true");
    const time = Number(await portrait.getAttribute("data-portrait-hd-video-time"));
    await expect.poll(async () => Number(await portrait.getAttribute("data-portrait-hd-video-time"))).not.toBe(time);
    await expect(portrait).toHaveAttribute("data-mouth-openness", "0.000");
    await expectCoverCrop(portrait);
    // The global `canvas { … !important }` used to win and shrink the 448² frame nearest-neighbour.
    expect(await portrait.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).imageRendering)).toBe("auto");
    // The player halves the 448² composite down to the square's on-screen device pixels itself.
    const backing = await portrait.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, displayed: Math.round(Math.max(rect.width, rect.height) * devicePixelRatio) };
    });
    expect(backing.width).toBe(Math.min(448, backing.displayed));
    expect(backing.height).toBe(backing.width);
  }
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/full-combat-hd-idle-loop.png" });
});

/**
 * `REMAKE-217` Every controller notification rewrites the right HUD's `innerHTML` and adopts the old
 * portrait back, and full combat notifies every frame. Each rewrite parses a fresh HD portrait that is
 * thrown away in the same task, so it never reaches an observer as an added node; the observer also
 * walks removed nodes to see it. A `<video src>` in that markup used to start a media pipeline and
 * decode a frame even after it was discarded (about 280 in this fight), which stuttered the map and
 * the fight under Windows hardware decoding.
 */
const trackHdPortraitVideos = (page: Page) => page.addInitScript(() => {
  const seen = new Set<HTMLVideoElement>();
  const started = new Set<HTMLVideoElement>();
  let hudRebuilds = 0;
  const collect = (node: Node) => {
    if (!(node instanceof Element)) return;
    const videos = node.matches("video.portrait-hd-video")
      ? [node as HTMLVideoElement]
      : [...node.querySelectorAll<HTMLVideoElement>("video.portrait-hd-video")];
    for (const video of videos) {
      if (seen.has(video)) continue;
      seen.add(video);
      video.addEventListener("loadstart", () => started.add(video));
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target instanceof Element && record.target.matches(".unit-hud")) hudRebuilds += 1;
      record.addedNodes.forEach(collect);
      record.removedNodes.forEach(collect);
    }
  }).observe(document, { childList: true, subtree: true });
  (window as unknown as { __hdPortraitVideos: () => unknown }).__hdPortraitVideos = () => ({
    parsed: seen.size,
    started: started.size,
    hudRebuilds,
    // A face that left the document must not keep its decoder until garbage collection.
    detachedWithSource: [...seen].filter((video) => !video.isConnected && video.hasAttribute("src")).length,
  });
});

interface HdPortraitVideoCounts {
  readonly parsed: number;
  readonly started: number;
  readonly hudRebuilds: number;
  readonly detachedWithSource: number;
}

const hdPortraitVideoCounts = (page: Page) => page.evaluate(() =>
  (window as unknown as { __hdPortraitVideos: () => HdPortraitVideoCounts }).__hdPortraitVideos());

test("REMAKE-217: rebuilding the right HUD every frame of a fight starts no throwaway HD video", async ({ page }) => {
  await trackHdPortraitVideos(page);
  await usePreferences(page, { hd: true });
  await openFullCombat(page);
  await expect(page.getByTestId("full-left-portrait")).toHaveAttribute("data-portrait-hd-video", "playing");
  const before = await hdPortraitVideoCounts(page);
  await page.waitForTimeout(1_500);
  const after = await hdPortraitVideoCounts(page);
  // The fight really rebuilds the HUD (once per frame) and parses a portrait each time…
  expect(after.hudRebuilds - before.hudRebuilds).toBeGreaterThan(20);
  expect(after.parsed - before.parsed).toBeGreaterThan(20);
  // …but only the faces on screen ever load: the HUD's, both combat panels' and any dialogue window's.
  expect(after.started).toBeLessThanOrEqual(8);
  expect(after.started - before.started).toBe(0);
  // Faces that left the document (the HUD changes face as the fight opens) let go of their decoders.
  expect(after.detachedWithSource).toBe(0);
  // The adopted HUD face still plays.
  const hud = page.getByTestId("unit-portrait-composite");
  const time = Number(await hud.getAttribute("data-portrait-hd-video-time"));
  await expect.poll(async () => Number(await hud.getAttribute("data-portrait-hd-video-time"))).not.toBe(time);
});

test("REMAKE-194: in 原版 the full-screen combat panels keep the still face the original draws once", async ({ page }) => {
  await usePreferences(page, {});
  await openFullCombat(page);
  for (const side of ["left", "right"] as const) {
    const portrait = page.getByTestId(`full-${side}-portrait`);
    await expect(portrait).toHaveAttribute("data-portrait-style", "original");
    await expect(portrait).toHaveAttribute("data-original-still", "true");
    await expect(portrait.locator("img")).toHaveCount(1);
    await expect(portrait.locator("canvas, video")).toHaveCount(0);
    await expectCoverCrop(portrait);
  }
  await page.waitForTimeout(800);
  for (const side of ["left", "right"] as const) {
    await expect(page.getByTestId(`full-${side}-portrait`)).toHaveAttribute("data-blink-count", "0");
  }
});

/**
 * `REMAKE-195` red-eye variants. Module 29 draws D/41 frame 7 in place of every
 * blink while stage 30 is undecided (S30-L); in HD the possessed face plays a
 * red-eye loop with the same layout and mouth strip and no blink.
 */
/**
 * `REMAKE-219` A generic unit takes its new class's generic portrait the moment it promotes (S00-V: 士兵A becomes
 * a 修女 and shows D/50). The original layers were staged for the allies' whole promotion closure, but the HD files
 * only for the faces on the board, so in HD the promoted soldier fell back to the original pixel portrait.
 */
test("REMAKE-219: in HD a generic soldier promoted in stage 0 keeps an HD face from the staged pack", async ({ page }) => {
  const requests = hdRequests(page);
  await usePreferences(page, { hd: true });
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "player");
  await page.evaluate(() => window.__ANGEL2__?.forcePromotionThreshold("1:40"));
  await page.getByTestId("battle-canvas").focus();
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-rest").click();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  await page.getByTestId("promotion-target-sister").click();
  await expect(page.getByTestId("promotion-layer")).toBeHidden();
  const hud = page.getByTestId("unit-portrait-composite");
  await expect(hud).toHaveAttribute("data-portrait-record", "50");
  await expect(hud).toHaveAttribute("data-portrait-style", "hd");
  await expect(hud.locator("video")).toHaveAttribute("data-source-url", "/assets/original/portraits/hd/0050/portrait.mp4");
  await expect(hud).toHaveAttribute("data-portrait-hd-video", "playing");
  // The gate brought D/50's files along with the stage; nothing was fetched again when the face appeared.
  expect(requests).toContain("/assets/original/portraits/hd/0050/portrait.mp4");
  expect(new Set(requests).size).toBe(requests.length);
});

/**
 * `REMAKE-219` Any `error` on an HD portrait video used to turn that record original for the rest of the run, and
 * switching 美術風格 could not bring it back — the player saw old and new faces side by side. An error on a file that
 * already decoded this run (a decoder hiccup, a lease that swapped under a surviving node) now drops the video and
 * attaches it again; only a file that never decoded falls back.
 */
test("REMAKE-219: a runtime error on an HD face that already played retries it instead of turning it original", async ({ page }) => {
  const fallbacks: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("falls back to the original")) fallbacks.push(message.text());
  });
  await usePreferences(page, { hd: true });
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const hud = page.getByTestId("unit-portrait-composite");
  await expect(hud).toHaveAttribute("data-portrait-hd-video", "playing");
  const playsAgain = async () => {
    const time = Number(await hud.getAttribute("data-portrait-hd-video-time"));
    await expect.poll(async () => Number(await hud.getAttribute("data-portrait-hd-video-time")), { timeout: 10_000 }).not.toBe(time);
  };
  await playsAgain();

  // A decode error on the current source (what a Windows hardware decoder that runs out reports).
  await hud.locator("video").evaluate((video) => video.dispatchEvent(new Event("error")));
  await page.waitForTimeout(100);
  await expect(hud).toHaveAttribute("data-portrait-style", "hd");
  await expect(hud.locator("video")).toHaveAttribute("src", /^blob:/u, { timeout: 5_000 });
  await playsAgain();

  // A source whose object URL was revoked under the surviving node (a resource lease that changed hands).
  await hud.locator("video").evaluate((video: HTMLVideoElement) => {
    const dead = URL.createObjectURL(new Blob([new Uint8Array(16)], { type: "video/mp4" }));
    URL.revokeObjectURL(dead);
    video.src = dead;
  });
  await expect.poll(() => hud.locator("video").evaluate((video: HTMLVideoElement) => video.error === null && video.readyState >= 2),
    { timeout: 10_000 }).toBe(true);
  await expect(hud).toHaveAttribute("data-portrait-style", "hd");
  await playsAgain();
  expect(fallbacks).toEqual([]);
});

test("REMAKE-195: in HD the possessed 維絲塔 plays her red-eye loop, and only stage 30's red-eye files are fetched", async ({ page }) => {
  const requests = hdRequests(page);
  await usePreferences(page, { hd: true });
  await page.goto("/?debugScenario=stage-30-player&difficulty=0&test=1");
  const composite = page.getByTestId("unit-portrait-composite");
  await expect(composite).toHaveAttribute("data-portrait-record", "46");
  await expect(composite).toHaveAttribute("data-portrait-style", "hd");
  // The cursor opens on Nia at (28,25); 維絲塔's soldier form stands at (28,17).
  for (let step = 0; step < 8; step += 1) await page.keyboard.press("ArrowUp");
  await expect(composite).toHaveAttribute("data-portrait-record", "41");
  await expect(composite).toHaveAttribute("data-red-eyes", "true");
  await expect(composite).toHaveAttribute("data-portrait-style", "hd");
  await expect(composite).toHaveAttribute("data-portrait-hd-variant", "red-eyes");
  await expect(composite.locator("video")).toHaveAttribute("data-source-url", "/assets/original/portraits/hd/0041/red-eyes.mp4");
  await expect(composite.locator(".portrait-base")).toHaveAttribute("data-source-url", "/assets/original/portraits/hd/0041/red-eyes-poster.webp");
  await expect(composite).toHaveAttribute("data-portrait-hd-video", "playing");
  const time = Number(await composite.getAttribute("data-portrait-hd-video-time"));
  await expect.poll(async () => Number(await composite.getAttribute("data-portrait-hd-video-time"))).not.toBe(time);
  expect(requests).toContain("/assets/original/portraits/hd/0041/red-eyes.mp4");
  expect(requests.filter((url) => url.includes("red-eyes") && !url.includes("/0041/"))).toEqual([]);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage30-hd-red-eyes-unit-detail.png" });
});

test("REMAKE-195: the portrait lab's 紅眼 switch shows frame 7 in 原版 and the red-eye loop in 高清", async ({ page }) => {
  await usePreferences(page, { hd: true });
  await page.goto("/portrait-lab.html");
  const gotis = page.getByTestId("portrait-record-0").locator(".animated-portrait");
  const nia = page.getByTestId("portrait-record-46").locator(".animated-portrait");
  await expect(gotis).toHaveAttribute("data-portrait-style", "hd");
  await page.getByTestId("portrait-lab-red-eyes-on").click();
  await expect(gotis).toHaveAttribute("data-portrait-hd-variant", "red-eyes");
  await expect(gotis.locator("video")).toHaveAttribute("data-source-url", "/assets/original/portraits/hd/0000/red-eyes.mp4");
  // Records without frame 7 are left as they are.
  await expect(nia).toHaveAttribute("data-red-eyes", "false");
  await expect(nia).not.toHaveAttribute("data-portrait-hd-variant", /./u);
  await captureVisualAudit(page.getByTestId("portrait-record-0"), { path: "artifacts/playwright/portrait-lab-hd-red-eyes-d0.png" });
  await page.getByTestId("portrait-lab-style-original").click();
  await expect(gotis).toHaveAttribute("data-portrait-style", "original");
  await expect(gotis).toHaveAttribute("data-red-eyes", "true");
  await expect(gotis.locator(".portrait-red-eyes")).toHaveCSS("opacity", "1");
  await page.getByTestId("portrait-lab-style-hd").click();
  await page.getByTestId("portrait-lab-red-eyes-off").click();
  await expect(gotis).toHaveAttribute("data-portrait-style", "hd");
  await expect(gotis).not.toHaveAttribute("data-portrait-hd-variant", /./u);
  await expect(gotis.locator("video")).toHaveAttribute("data-source-url", "/assets/original/portraits/hd/0000/portrait.mp4");
});
