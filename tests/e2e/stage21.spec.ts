import { expect, test, type Page } from "@playwright/test";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage21State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  campaignRoute?: string;
  dialogueIndex: number;
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    portrait: number;
    x: number;
    y: number;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage21State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage21State | undefined)?.phase === expected,
  phase,
);

/** Walks the story with real clicks; a click first completes any typing reveal. */
async function advanceDialogueTo(page: Page, checkpoint: number): Promise<void> {
  const screen = page.getByTestId("game-screen");
  for (let guard = 0; guard < 40; guard += 1) {
    const current = await page.evaluate(
      () => (window.__ANGEL2__?.getState() as Stage21State | undefined)?.dialogueIndex ?? -1,
    );
    if (current >= checkpoint) return;
    await screen.click();
  }
  throw new Error(`stage 21 dialogue never reached checkpoint ${checkpoint}`);
}

test("S21-A–D: four scouts enter, cross the forest, discover the dolls, and route directly", async ({ page }) => {
  const seenPhases: string[] = [];
  await page.exposeFunction("recordStage21Phase", (phase: string) => seenPhases.push(phase));
  await page.goto(
    "/?debugScenario=stage-21-prebattle&difficulty=0&roster=representative-growth&growth=100&test=1",
  );
  await page.evaluate(() => {
    let previous = "";
    const record = () => {
      const phase = (window.__ANGEL2__?.getState() as Stage21State | undefined)?.phase;
      if (phase && phase !== previous) {
        previous = phase;
        void (window as Window & { recordStage21Phase: (value: string) => Promise<void> })
          .recordStage21Phase(phase);
      }
      requestAnimationFrame(record);
    };
    record();
  });

  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "42");
  await expect(page.locator("#story-background")).toBeVisible();
  await expect(page.getByTestId("dialogue-window-lower")).toContainText(
    /時\s*間\s*就\s*快\s*到\s*了/,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage21-prebattle-teleport.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "43");
  expect((await state(page)).units).toEqual([
    expect.objectContaining({ id: "1:0", name: "妮雅", portrait: 46, x: 42, y: 25 }),
    expect.objectContaining({ id: "1:1", name: "希蜜", portrait: 45, x: 43, y: 24 }),
    expect.objectContaining({ id: "1:24", name: "葛蒂拉斯", portrait: 0, x: 41, y: 24 }),
    expect.objectContaining({ id: "1:8", name: "蘇蘭達", portrait: 10, x: 40, y: 26 }),
  ]);
  for (const unit of (await state(page)).units) expect(unit.classId).not.toBe("soldier");
  // The interlude never reaches a side phase, so nobody wears the 已行動 badge.
  await expect(page.locator("canvas")).toHaveAttribute("data-acted-badge-count", "0");
  await expect(page.getByTestId("unit-hud")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage21-scout-arrival.png`,
  });

  // SAY/0043 lines 38–47 answer Nia's roll call with portraits only: the lower
  // window frame stays closed while 希蜜 → 葛蒂拉斯 → 蘇蘭達 appear in turn.
  const lowerWindow = page.getByTestId("dialogue-window-lower");
  const lowerCopy = page.locator("#dialogue-copy-lower");
  const lowerName = page.locator("#dialogue-portrait-name-lower");
  const lowerPortrait = page.getByTestId("dialogue-portrait-composite-lower");
  // The nameplate keeps the original padded spelling, so match it loosely.
  for (const [checkpoint, record, speaker] of [
    [7, "45", /希\s*蜜/],
    [8, "0", /葛蒂拉斯/],
    [9, "10", /蘇蘭達/],
  ] as const) {
    await advanceDialogueTo(page, checkpoint);
    await expect(lowerPortrait).toHaveAttribute("data-portrait-record", record);
    await expect(lowerName).toHaveText(speaker);
    await expect(lowerWindow).toBeVisible();
    await expect(lowerCopy).toBeHidden();
    if (checkpoint === 8) {
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: `${ARTIFACT_DIR}/stage21-scout-roll-call.png`,
      });
    }
  }

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage21State | undefined;
    return current?.activeStoryId === "stage-21-discovery-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "44");
  expect((await state(page)).units).toEqual([
    expect.objectContaining({ id: "1:0", x: 28, y: 41 }),
    expect.objectContaining({ id: "1:1", x: 30, y: 42 }),
    expect.objectContaining({ id: "1:24", x: 28, y: 40 }),
    expect.objectContaining({ id: "1:8", x: 27, y: 42 }),
  ]);
  await expect(dialogue).toContainText("這裡的人好像都死了");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage21-village-discovery.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({
    stageId: "stage-21",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-22",
    consumedEventIds: [
      "stage-21-prebattle-story",
      "stage-21-scouts-arrive",
      "stage-21-scouting-story",
      "stage-21-nia-move",
      "stage-21-himi-move",
      "stage-21-gadirath-move",
      "stage-21-sulanda-move",
      "stage-21-discovery-story",
      "stage-21-completed-route",
    ],
  });
  expect(seenPhases).not.toContain("player");
  expect(seenPhases).not.toContain("victoryFeedback");
  expect(seenPhases).not.toContain("savePrompt");
});
