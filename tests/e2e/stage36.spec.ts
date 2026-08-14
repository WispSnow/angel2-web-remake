import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage36State {
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
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage36State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage36State | undefined)?.phase === expected,
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

test("S36-A–E: the stage-35 route enters deployment before SAY/0080 and the static otherworld force", async ({ page }) => {
  await page.goto("/?debugScenario=stage-35-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "異世界的碧娜維姬 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／28");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(27);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十八名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選二十七人");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  expect(await visibleRosterSlots()).not.toEqual(expect.arrayContaining([22, 23, 24]));
  expect(await state(page)).toMatchObject({
    stageId: "stage-36",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-36",
    consumedEventIds: ["stage-36-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage36-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "80");
  await expect(dialogue).toContainText("碧娜維姬");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(1);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(30);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", portrait: 46, x: 24, y: 27 }),
    expect.objectContaining({ id: "2:1", classId: "wizard", name: "碧娜維姬", portrait: 8, x: 23, y: 13 }),
    expect.objectContaining({ id: "2:53", classId: "demon-dragon-knight", x: 17, y: 12 }),
    expect.objectContaining({ id: "2:58", classId: "bone-knight", x: 34, y: 20 }),
  ]));
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage36-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({
    round: 1,
    consumedEventIds: [
      "stage-36-enter-deployment",
      "stage-36-opening-story",
    ],
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗「碧娜維姬」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage36-objective-and-map.png`,
  });

  await page.goto("/?debugScenario=stage-36-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  expect((await state(page)).units.filter(({ side }) => side === 1)).toHaveLength(28);
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(30);
});

test("S36-F: defeating Bina Vige wins while the other 29 enemies remain", async ({ page }) => {
  await page.goto("/?debugScenario=stage-36-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 18, y: 10 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(30);
  expect(prepared.units.find(({ id }) => id === "2:1")).toMatchObject({
    x: 23,
    y: 13,
    life: 1,
  });
  await clickCell(page, 22, 13);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 23, 13);
  const promotion = page.getByTestId("promotion-layer");
  await expect.poll(async () =>
    (await state(page)).phase === "victoryFeedback" || await promotion.isVisible()).toBe(true);
  if (await promotion.isVisible()) {
    await promotion.locator('[data-action="promotion-target"]').first().click();
  }
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(29);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("碧娜維姬已被擊敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage36-boss-victory.png`,
  });
});

test("S36-G: Nia defeat retries directly from deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-36-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage36-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "異世界的碧娜維姬 · 出擊準備" })).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-36",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-36",
    consumedEventIds: ["stage-36-enter-deployment"],
  });
});

test("S36-H/I: ordinary victory saves v65 and reaches the frozen stage-37 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-36-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("碧娜維姬已被擊敗");
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
    stageId: "stage-37",
    stageLabel: "究極女神",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-36-enter-deployment",
      "stage-36-opening-story",
      "stage-36-objective-reached",
      "stage-36-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-36",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-37",
  });
  await expect(page.getByText(/stage-37/u)).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage36-stage37-boundary.png`,
  });
});
