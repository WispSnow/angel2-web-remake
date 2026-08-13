import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage31State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
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
    life: number;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage31State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage31State | undefined)?.phase === expected,
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

test("S31-A–E: SAY/0060 leads through five fixed allies into the SAY/0061 ambush", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "60");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "23");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage31-background-23\.png/u,
  );
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("外面的吵雜聲");
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "前往斯德林海峽 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／17");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(12);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十四名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選十二人");
  for (const slot of [0, 1, 2, 3, 4]) {
    await expect(page.getByTestId(`deployment-roster-${slot}`)).toContainText("固定");
  }
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage31-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "61");
  await expect(dialogue).toContainText("橫渡斯德林海峽");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(5);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(15);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:4", name: "拉朵那", x: 25, y: 12 }),
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 26, y: 33 }),
    expect.objectContaining({
      id: "2:5",
      classId: "demon-dragon-knight",
      name: "菲伊魯茵",
      portrait: 25,
      x: 16,
      y: 14,
    }),
  ]));
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({
    round: 1,
    consumedEventIds: [
      "stage-31-prebattle-story",
      "stage-31-enter-deployment",
      "stage-31-opening-story",
    ],
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗所有的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-objective-and-map.png`,
  });
});

test("S31-F: defeating the final ambusher starts SAY/0062", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 21, y: 21 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:5")).toMatchObject({
    x: 26,
    y: 24,
    life: 1,
  });
  await clickCell(page, 25, 24);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 26, 24);
  const promotion = page.getByTestId("promotion-layer");
  await expect.poll(async () =>
    (await state(page)).phase === "victoryStory" || await promotion.isVisible()).toBe(true);
  if (await promotion.isVisible()) {
    await promotion.locator('[data-action="promotion-target"]').first().click();
  }
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "62");
  await expect(page.getByTestId("dialogue-layer")).toContainText("快撤退呀");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-elimination-victory.png`,
  });
});

test("S31-G: Nia defeat retries from SAY/0060", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "60");
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
});

test("S31-H/I: SAY/0062 saves v60 and reaches the frozen stage-32 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "62");
  await expect(dialogue).toContainText("快撤退呀");
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("伏兵已全數離場");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "nextStage");

  const completedSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
      version: number;
      contentVersion: string;
      kind: string;
      stageId: string;
      stageLabel: string;
      stageProgress: number;
      consumedEventIds: string[];
    });
  expect(completedSave).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    stageId: "stage-32",
    stageLabel: "斯德林海峽",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-31-prebattle-story",
      "stage-31-enter-deployment",
      "stage-31-opening-story",
      "stage-31-objective-reached",
      "stage-31-victory-story",
      "stage-31-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-32",
  });
  await expect(page.getByText(/stage-32/u)).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage31-stage32-boundary.png`,
  });
});
