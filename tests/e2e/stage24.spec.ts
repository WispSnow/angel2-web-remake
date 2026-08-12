import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage24State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  focusId: string;
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
  () => window.__ANGEL2__?.getState() as Stage24State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage24State | undefined)?.phase === expected,
  phase,
);

const settleBattleCanvas = async (page: Page) => {
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-unit-life-label-count",
    /^\d+$/u,
  );
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S24-A/B: stage 23 completion opens the 1–15 castle deployment directly", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "死亡之谷城堡前 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／15");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(14);
  await expect(page.getByTestId("deployment-minimap")).toBeVisible();
  await expect(page.getByTestId("deployment-guidance")).toContainText("不必全滅守軍");
  expect(await state(page)).toMatchObject({
    stageId: "stage-24",
    phase: "deployment",
    campaignRoute: "stage-24",
    consumedEventIds: ["stage-24-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage24-deployment.png`,
  });
});

test("S24-C–E: opening story hands 15 allies to the 22-guard battlefield", async ({ page }) => {
  await page.goto("/?debugScenario=stage-24-deployment&difficulty=0&test=1");
  for (let rosterIndex = 1; rosterIndex <= 14; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 15／15");
  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();

  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "47");
  await expect(page.locator("#story-background")).toBeHidden();
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(15);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(22);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", portrait: 46, x: 27, y: 39 }),
    expect.objectContaining({ id: "2:31", classId: "bone-knight", x: 24, y: 20 }),
    expect.objectContaining({ id: "2:52", classId: "crossbow", x: 17, y: 22 }),
    expect.objectContaining({ id: "2:38", classId: "half-dragon-warrior", x: 19, y: 22 }),
    expect.objectContaining({ id: "2:48", classId: "steel-armor-warrior", x: 25, y: 23 }),
    expect.objectContaining({ id: "2:35", classId: "demon-dragon-knight", x: 29, y: 25 }),
  ]));
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage24-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player).toMatchObject({
    focusId: "1:0",
    cameraOrigin: { x: 23, y: 34 },
    consumedEventIds: [
      "stage-24-enter-deployment",
      "stage-24-opening-story",
    ],
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」到達死亡之谷的城堡");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("打敗所有");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage24-objective-and-map.png`,
  });
});

test("S24-E: the marked destination and one-step fixture enter the victory story", async ({ page }) => {
  await page.goto("/?debugScenario=stage-24-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-objective-destination-cell-count", "1031");
  await expect(canvas).toHaveAttribute("data-objective-destination-visible-cell-count", "28");
  await expect(canvas).toHaveAttribute(
    "data-objective-destination-style",
    "soft-magenta-fill-inset-outline",
  );

  const prepared = await state(page);
  expect(prepared.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 31, y: 20 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(22);

  await clickCell(page, 31, 20);
  await page.getByTestId("unit-command-move").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage24-destination-highlight.png`,
  });
  await clickCell(page, 30, 20);
  await expect(page.getByTestId("unit-command-end")).toBeVisible();
  await page.getByTestId("unit-command-end").click();
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "48");

  const victory = await state(page);
  expect(victory.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 30, y: 20 });
  expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(22);
});

test("S24-F: Nia defeat returns directly to deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-24-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage24-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "死亡之谷城堡前 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／15");
  expect(await state(page)).toMatchObject({
    stageId: "stage-24",
    phase: "deployment",
    campaignRoute: "stage-24",
    consumedEventIds: ["stage-24-enter-deployment"],
  });
});

test("S24-G/H: victory story saves and enters the direct stage-26 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-24-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "48");
  await expect(page.getByTestId("dialogue-layer")).toContainText("城堡的大門打開");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(22);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage24-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅已抵達死亡之谷城堡");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");

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
    stageId: "stage-26",
    stageLabel: "遭遇碧娜維姬",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-24-enter-deployment",
      "stage-24-opening-story",
      "stage-24-objective-reached",
      "stage-24-victory-story",
      "stage-24-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-26",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-26",
    consumedEventIds: ["stage-26-enter-deployment"],
  });
});
