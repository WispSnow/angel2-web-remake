import { expect, test, type Page } from "@playwright/test";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";
import { skipStoryDialogue } from "./dialogue-controls";
import { skipOpeningToTitle } from "./startup-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface EndingState {
  phase: string;
  campaignRoute?: string;
  stage49Ending?: {
    section: string;
    index: number;
    saveCount: number;
    recordTotal: number;
    dominantClassFamily: string;
  };
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as EndingState,
);

const waitForEnding = (page: Page, section: string, index?: number) => page.waitForFunction(
  ({ expectedSection, expectedIndex }) => {
    const ending = (window.__ANGEL2__?.getState() as EndingState | undefined)?.stage49Ending;
    return ending?.section === expectedSection
      && (expectedIndex === undefined || ending.index === expectedIndex);
  },
  { expectedSection: section, expectedIndex: index },
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as EndingState | undefined)?.phase === expected,
  phase,
);

const openRecordMenu = async (page: Page, command: "save" | "load") => {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.getByTestId(`system-command-${command}`).click();
  await expect(page.getByTestId("record-menu")).toBeVisible();
};

const writeRecord = async (page: Page, slot: number) => {
  await openRecordMenu(page, "save");
  await page.getByTestId(`record-slot-${slot}`).click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
};

const loadRecord = async (page: Page, slot: number) => {
  await openRecordMenu(page, "load");
  await page.getByTestId(`record-slot-${slot}`).click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
};

const savedRecord = (page: Page, slot: number) => page.evaluate(
  (key) => JSON.parse(localStorage.getItem(key) ?? "null") as { kind: string; saveCount: number },
  `angel2.save.${slot}`,
);

async function advance(page: Page, count: number): Promise<void> {
  const button = page.getByTestId("ending-advance");
  for (let index = 0; index < count; index += 1) {
    const before = await state(page);
    await button.click();
    const after = await state(page);
    // A click during native-style typing only completes the line. Compare
    // semantic state instead of racing a transient DOM attribute: if the
    // checkpoint did not move, the next click is the actual KY advance.
    if (before.stage49Ending?.section === after.stage49Ending?.section
      && before.stage49Ending?.index === after.stage49Ending?.index) {
      await button.click();
    }
  }
}

async function storyTextMetrics(page: Page, slot: "upper" | "lower") {
  return page.locator(`.stage49-dialogue-window.${slot} .stage49-dialogue-copy`).evaluate((copy) => {
    const screen = copy.closest<HTMLElement>("#stage49-screen");
    const text = copy.querySelector<HTMLElement>("p");
    const firstGlyph = text?.querySelector<HTMLElement>(".dialogue-glyph");
    if (!screen || !text || !firstGlyph) throw new Error("missing native story text");
    const screenBounds = screen.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    const scale = screenBounds.width / 640;
    const glyphs = [...text.querySelectorAll<HTMLElement>(".dialogue-glyph")];
    const big5Widths = [...new Set(
      glyphs
        .filter((glyph) => glyph.classList.contains("big5"))
        .map((glyph) => glyph.getBoundingClientRect().width / scale),
    )];
    return {
      textAlign: getComputedStyle(copy).textAlign,
      overflow: getComputedStyle(copy).overflow,
      firstGlyphX: (firstGlyph.getBoundingClientRect().left - copyBounds.left) / scale,
      maxGlyphOverflow: Math.max(
        ...glyphs.map((glyph) => (glyph.getBoundingClientRect().right - copyBounds.right) / scale),
      ),
      big5Widths,
    };
  });
}

test("S49-A–D: main ending plays story, roster, conditional epilogue, then enters hidden stage 38", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-cleared&difficulty=0&test=1");
  await expect(page.getByTestId("start-stage49-ending")).toBeVisible();
  await page.getByTestId("start-stage49-ending").click();
  await waitForEnding(page, "story", 0);

  expect(await state(page)).toMatchObject({
    phase: "ending",
    campaignRoute: "stage-49",
    stage49Ending: { section: "story", index: 0, saveCount: 1, recordTotal: 0 },
  });
  await expect(page.getByTestId("stage49-story")).toContainText("恭禧妳！妮雅");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MAGIC/77");
  const storyPortrait = page.getByTestId("stage49-story-portrait-lower");
  await expect(storyPortrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(storyPortrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect.poll(async () => Number(await storyPortrait.getAttribute("data-talk-count")))
    .toBeGreaterThan(0);
  await expect(storyPortrait).toHaveAttribute("data-speaking", "false");
  await expect(storyPortrait).toHaveAttribute("data-mouth-frame", "1");
  await expect.poll(async () => Number(await storyPortrait.getAttribute("data-blink-count")), {
    timeout: 2_000,
  }).toBeGreaterThan(0);
  const originalDialoguePresentation = await page.getByTestId("ending-advance").evaluate((screen) => {
    const nativeBounds = (selector: string) => {
      const element = screen.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing story element ${selector}`);
      const screenBounds = screen.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const scale = screenBounds.width / 640;
      return {
        x: (bounds.left - screenBounds.left) / scale,
        y: (bounds.top - screenBounds.top) / scale,
        width: bounds.width / scale,
        height: bounds.height / scale,
      };
    };
    const portrait = screen.querySelector<HTMLElement>(".stage49-dialogue-portrait");
    const copy = screen.querySelector<HTMLElement>(".stage49-dialogue-copy");
    if (!portrait || !copy) throw new Error("missing original story window composition");
    return {
      portrait: nativeBounds(".stage49-dialogue-portrait"),
      copy: nativeBounds(".stage49-dialogue-copy"),
      portraitTopAndNameplate: getComputedStyle(portrait, "::before").backgroundImage,
      portraitSides: getComputedStyle(portrait, "::after").backgroundImage,
      textWindow: getComputedStyle(copy).backgroundImage,
    };
  });
  expect(originalDialoguePresentation.portrait).toMatchObject({
    x: 512,
    y: 210,
    width: 112,
    height: 112,
  });
  expect(originalDialoguePresentation.copy).toMatchObject({
    x: 97,
    y: 260,
    width: 400,
    height: 86,
  });
  expect(originalDialoguePresentation.portraitTopAndNameplate).toContain("portrait-top.png");
  expect(originalDialoguePresentation.portraitTopAndNameplate).toContain("portrait-nameplate.png");
  expect(originalDialoguePresentation.portraitSides).toContain("portrait-side.png");
  expect(originalDialoguePresentation.textWindow).toContain("text-window.png");
  await expect(page.getByText(/戰後道別 \d+／17/)).toHaveCount(0);
  const centerDelta = await page.getByTestId("ending-advance").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left + bounds.width / 2 - window.innerWidth / 2;
  });
  expect(Math.abs(centerDelta)).toBeLessThanOrEqual(1);
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-story.png`,
  });

  await advance(page, 2);
  await waitForEnding(page, "story", 2);
  const upperText = page.locator(".stage49-dialogue-window.upper .stage49-dialogue-copy p");
  await expect.poll(() => upperText.locator(".dialogue-glyph").count()).toBeGreaterThan(0);
  const upperTypingStart = await storyTextMetrics(page, "upper");
  expect(upperTypingStart.firstGlyphX).toBeCloseTo(12, 1);
  await expect(page.getByTestId("ending-advance")).toHaveAttribute("data-story-typing", "false");
  const upperTextComplete = await storyTextMetrics(page, "upper");
  expect(upperTextComplete).toMatchObject({ textAlign: "left", overflow: "hidden" });
  expect(upperTextComplete.firstGlyphX).toBeCloseTo(12, 1);
  expect(upperTextComplete.maxGlyphOverflow).toBeLessThanOrEqual(0);
  expect(upperTextComplete.big5Widths).toEqual([16]);
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-story-long-upper.png`,
  });

  await advance(page, 1);
  await waitForEnding(page, "story", 3);
  await expect(page.getByTestId("ending-advance")).toHaveAttribute("data-story-typing", "false");
  const lowerTextComplete = await storyTextMetrics(page, "lower");
  expect(lowerTextComplete).toMatchObject({ textAlign: "left", overflow: "hidden" });
  expect(lowerTextComplete.firstGlyphX).toBeCloseTo(12, 1);
  expect(lowerTextComplete.maxGlyphOverflow).toBeLessThanOrEqual(0);
  expect(lowerTextComplete.big5Widths).toEqual([16]);
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-story-long-lower.png`,
  });

  await advance(page, 11);
  await waitForEnding(page, "story", 14);
  await expect(page.getByTestId("ending-advance")).toHaveAttribute("data-story-typing", "false");
  await expect(page.locator(".stage49-dialogue-window")).toHaveCount(2);
  const upperWindowGeometry = await page.getByTestId("ending-advance").evaluate((screen) => {
    const nativeBounds = (selector: string) => {
      const element = screen.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing story element ${selector}`);
      const screenBounds = screen.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const scale = screenBounds.width / 640;
      return {
        x: (bounds.left - screenBounds.left) / scale,
        y: (bounds.top - screenBounds.top) / scale,
        width: bounds.width / scale,
        height: bounds.height / scale,
      };
    };
    return {
      portrait: nativeBounds(".stage49-dialogue-window.upper .stage49-dialogue-portrait"),
      copy: nativeBounds(".stage49-dialogue-window.upper .stage49-dialogue-copy"),
    };
  });
  expect(upperWindowGeometry.portrait).toMatchObject({ x: 8, y: 18, width: 112, height: 112 });
  expect(upperWindowGeometry.copy).toMatchObject({ x: 153, y: 2, width: 400, height: 86 });
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-story-two-windows.png`,
  });

  await advance(page, 3);
  await waitForEnding(page, "roster", 0);
  await expect(page.getByTestId("stage49-roster")).toContainText("妮雅");
  // Native card field is 兵種 with 戰績：00000 人.
  await expect(page.getByTestId("stage49-roster")).toContainText("兵種");
  await expect(page.getByTestId("stage49-record")).toHaveText("00000 人");
  await expect(page.getByTestId("stage49-roster-class-illustration"))
    .toHaveAttribute("src", "/assets/original/ending/class-illustrations/00.png");
  await expect.poll(() => page.getByTestId("stage49-roster-class-illustration")
    .evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const rosterGeometry = await page.getByTestId("ending-advance").evaluate((screen) => {
    const nativeBounds = (selector: string) => {
      const element = screen.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing roster element ${selector}`);
      const screenBounds = screen.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const scale = screenBounds.width / 640;
      return {
        x: (bounds.left - screenBounds.left) / scale,
        y: (bounds.top - screenBounds.top) / scale,
        width: bounds.width / scale,
        height: bounds.height / scale,
        centerX: (bounds.left + bounds.width / 2 - screenBounds.left) / scale,
        bottom: (bounds.bottom - screenBounds.top) / scale,
      };
    };
    return {
      portrait: nativeBounds(".stage49-roster-portrait"),
      decoration: nativeBounds(".stage49-decoration"),
      classIllustration: nativeBounds(".stage49-roster-class-illustration"),
    };
  });
  expect(rosterGeometry.portrait).toMatchObject({ x: 16, y: 50, width: 112, height: 112 });
  expect(rosterGeometry.decoration).toMatchObject({ x: 148, y: 50, width: 448, height: 148 });
  expect(rosterGeometry.classIllustration.centerX).toBeCloseTo(200, 1);
  expect(rosterGeometry.classIllustration.bottom).toBeCloseTo(186, 1);
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/6");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-roster.png`,
  });

  await advance(page, 22);
  await waitForEnding(page, "epilogue", 0);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute(
    "data-segment",
    "dominantClassFamily",
  );
  // Native module 35 starts the record-total branch track before segment 1, so
  // the whole epilogue plays over it rather than switching at segment 4.
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-class-family.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 1);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute(
    "data-segment",
    "warriorStatue",
  );
  await expect(page.getByTestId("stage49-epilogue")).toContainText("興建了一座戰士雕像");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-warrior-statue.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 2);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "1");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("神將官");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 3);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "0");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("歷久不衰");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-prosperous.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "stage38-boundary", 0);
  expect(await state(page)).toMatchObject({
    phase: "ending",
    campaignRoute: "stage-38",
    stage49Ending: { section: "stage38-boundary" },
  });
  await expect(page.getByTestId("stage38-boundary")).toContainText("墓碑上的異世界之門再次開啟");
  await expect(page.getByTestId("start-stage38")).toHaveText("進入異世界");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "none");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-stage38-boundary.png`,
  });

  await page.getByTestId("start-stage38").click();
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  expect(await state(page)).toMatchObject({
    phase: "deployment",
    campaignRoute: "stage-38",
  });
});

test("S49-E: a loaded stage-49 completed save reaches the same main-ending entry with its own records", async ({ page }) => {
  const recordCounters = Array<number>(75).fill(0);
  recordCounters[0] = 60;
  recordCounters[1] = 41;
  const save = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2026-08-14T12:00:00.000Z",
    saveCount: 101,
    stageId: "stage-49",
    stageLabel: "主線結局",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: 0x1234_5678,
    rngCalls: 49,
    roster: completeCampaignRoster([]),
    recordCounters,
    stageProgress: 1000,
    consumedEventIds: [
      "stage-37-enter-deployment",
      "stage-37-opening-story",
      "stage-37-objective-reached",
      "stage-37-completed-route",
    ],
  } satisfies CompletedSaveData;

  await page.goto("/?test=1");
  await page.evaluate((value) => localStorage.setItem("angel2.save.1", value), JSON.stringify(save));
  await page.reload();
  // Load it the way a player does: skip the opening, 繼續遊戲, pick record 1.
  await skipOpeningToTitle(page);
  await page.getByTestId("continue-game").click();
  await page.getByTestId("title-record-slot-1").click();
  await expect(page.getByTestId("start-stage49-ending")).toBeVisible();
  await page.getByTestId("start-stage49-ending").click();
  await waitForEnding(page, "story", 0);

  // saveCount 101 (> 100) and record total 101 (> 100) pick the opposite
  // branch from the fresh-clear run above.
  expect(await state(page)).toMatchObject({
    phase: "ending",
    stage49Ending: { saveCount: 101, recordTotal: 101 },
  });
  await advance(page, 17);
  await waitForEnding(page, "roster", 0);
  await expect(page.getByTestId("stage49-record")).toHaveText("00060 人");

  await advance(page, 22);
  await waitForEnding(page, "epilogue", 0);
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/49");
  await advance(page, 2);
  await waitForEnding(page, "epilogue", 2);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "0");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("重新舉行登基大典");
  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 3);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "1");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("結束了輝煌的傳奇霸業");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/49");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-decline.png`,
  });
});

test("S49-F: the save-count selector accumulates across record slots and resumes from a loaded record", async ({ page }) => {
  // REMAKE-086 defines the third epilogue segment's selector as the campaign's
  // cumulative record-write count: writing any slot advances it once, and
  // loading a record resumes from the count that record was written with.
  // S49-E injects a finished count and asserts the branch; this asserts the
  // producer, so it runs from a real battle where records can be written.
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  await writeRecord(page, 1);
  expect(await savedRecord(page, 1)).toMatchObject({ kind: "battle", saveCount: 1 });

  // A different slot keeps counting the campaign's writes, not that slot's.
  await writeRecord(page, 2);
  expect(await savedRecord(page, 2)).toMatchObject({ saveCount: 2 });
  expect(await savedRecord(page, 1)).toMatchObject({ saveCount: 1 });

  // Loading record 1 resumes from its own count, so the next write is 2 again.
  await loadRecord(page, 1);
  await writeRecord(page, 3);
  expect(await savedRecord(page, 3)).toMatchObject({ saveCount: 2 });
  expect(await savedRecord(page, 2)).toMatchObject({ saveCount: 2 });
});

test("S49-G: the epilogue types its native bitmap text and the first press only finishes it", async ({ page }) => {
  // Runs from the debug entry rather than ?test=1 so the native cadence is
  // live: module 35 draws no text window and types one full-width glyph every
  // 24 native ticks (0000:069E-0725), and the warrior-statue segment alone
  // holds the screen for 46 of them.
  await page.goto(
    "/?debugScenario=stage-49-warrior-statue&difficulty=0&roster=representative-growth&growth=100",
  );
  const screen = page.locator("#stage49-screen");
  const epilogue = page.getByTestId("stage49-epilogue");
  await expect(epilogue).toHaveAttribute("data-segment", "warriorStatue");
  await expect(screen).toHaveAttribute("data-epilogue-typing", "true");

  const inkPixels = () => page.getByTestId("stage49-epilogue-text")
    .evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext("2d");
      if (!context) return 0;
      const { data } = context.getImageData(
        0,
        0,
        (canvas as HTMLCanvasElement).width,
        (canvas as HTMLCanvasElement).height,
      );
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) opaque += 1;
      return opaque;
    });
  // Not a race: 0000:0725 waits *after* each glyph, so the first one is drawn
  // before `data-epilogue-typing` flips. A blank canvas here means the typer has
  // gone back to waiting one interval before its first glyph.
  const partial = await inkPixels();
  expect(partial).toBeGreaterThan(0);

  // [SR] 0000:0717/071E mean to skip a glyph's wait while an action flag is set
  // but both branches land on the wait itself. Restoring the intent makes the
  // first press finish the remaining text without advancing the segment.
  await screen.click();
  await expect(screen).toHaveAttribute("data-epilogue-typing", "false");
  expect(await inkPixels()).toBeGreaterThan(partial);
  await expect(epilogue).toHaveAttribute("data-segment", "warriorStatue");

  await screen.click();
  await expect(epilogue).toHaveAttribute("data-segment", "saveCountOutcome");
});

test("S49-H: the epilogue keeps its native trailing pause after the last glyph", async ({ page }) => {
  test.setTimeout(90_000);
  // `warriorStatue` is the one typing-bound segment: wait 0 against 46 glyphs, so
  // the evidence table's 1104 ticks are entirely `0000:0725`'s per-glyph waits.
  // Because that wait runs off the module's tick counter, the 46th glyph lands at
  // tick 1080 and the segment still owes one 24-tick wait before it advances.
  // Chained `setTimeout` delays drift far enough over 46 redraws to swallow that
  // pause, so the schedule has to be anchored to the segment's own start.
  await page.goto(
    "/?debugScenario=stage-49-warrior-statue&difficulty=0&roster=representative-growth&growth=100",
  );
  const epilogue = page.getByTestId("stage49-epilogue");
  await expect(epilogue).toHaveAttribute("data-segment", "warriorStatue");
  await expect(page.locator("#stage49-screen")).toHaveAttribute("data-epilogue-typing", "true");
  await expect(page.getByTestId("stage49-epilogue-text")).toBeAttached();
  const timeline = await page.evaluate(() => new Promise<{
    firstInkAt: number;
    typingEndedAt: number;
    advancedAt: number;
    glyphSteps: number;
  }>((resolve) => {
    const screen = document.querySelector<HTMLElement>("#stage49-screen");
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=stage49-epilogue-text]");
    const context = canvas?.getContext("2d");
    if (!screen || !canvas || !context) throw new Error("epilogue surface not found");
    const ink = () => {
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) opaque += 1;
      return opaque;
    };
    const started = performance.now();
    const marks = { firstInkAt: 0, typingEndedAt: 0, advancedAt: 0, glyphSteps: 0 };
    let previous = -1;
    const poll = window.setInterval(() => {
      const current = ink();
      if (current > 0 && !marks.firstInkAt) marks.firstInkAt = performance.now() - started;
      if (current > previous) {
        marks.glyphSteps += 1;
        previous = current;
      }
      if (screen.dataset.epilogueTyping === "false" && !marks.typingEndedAt) {
        marks.typingEndedAt = performance.now() - started;
      }
      const segment = document.querySelector<HTMLElement>("[data-testid=stage49-epilogue]")
        ?.dataset.segment;
      if (marks.typingEndedAt && segment && segment !== "warriorStatue") {
        marks.advancedAt = performance.now() - started;
        window.clearInterval(poll);
        resolve(marks);
      }
    // 30 ms still resolves every 240 ms glyph while keeping this probe's own
    // `getImageData` cost off the timer the segment is being measured against.
    }, 30);
  }));

  // The first glyph is drawn before the typing flag flips, not one wait later.
  expect(timeline.firstInkAt).toBeLessThan(200);
  expect(timeline.glyphSteps).toBe(46);
  // 46 glyphs x 24 ticks = 1104; the last glyph lands one wait before the end.
  expect(timeline.typingEndedAt).toBeGreaterThan(9_000);
  expect(timeline.typingEndedAt).toBeLessThan(11_040);
  // The tolerance is wide on purpose: 240 ms is the target, drift regressions
  // collapse this to single digits, and a slow host only stretches it.
  expect(timeline.advancedAt - timeline.typingEndedAt).toBeGreaterThan(120);
});
