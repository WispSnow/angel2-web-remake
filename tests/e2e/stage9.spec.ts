import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage9State {
  stageId: string;
  stageProgress: number;
  phase: string;
  actionMode: string;
  selectedId?: string;
  focusId: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  rngState: number;
  rngCalls: number;
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
  () => window.__ANGEL2__?.getState() as Stage9State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage9State | undefined)?.phase === expected,
  phase,
);

async function clickUnit(page: Page, id: string): Promise<void> {
  const current = await state(page);
  const unit = current.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (unit.x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (unit.y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S09-A/B/C: stage 8 completion enters deployment, then SAY/22 opens the escort", async ({ page }) => {
  await page.goto("/?debugScenario=stage-08-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  expect(await state(page)).toMatchObject({
    stageId: "stage-09",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-09",
  });
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "找尋傳說中的飛船 · 出擊準備" }))
    .toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／9");
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(14);
  await expect(page.locator(".deployment-open-cell")).toHaveCount(7);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("多莉");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("咒術師");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("固定");

  for (const rosterIndex of [1, 2, 3, 4, 5, 6, 8]) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 9／9");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage9-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "22");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("有件事我想請妳幫個忙");
  expect((await state(page)).units.filter(({ side }) => side === 1)).toHaveLength(9);
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(14);
  await page.waitForTimeout(200);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage9-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect((await state(page)).consumedEventIds).toEqual([
    "stage-09-enter-deployment",
    "stage-09-opening-story",
  ]);
  await clickUnit(page, "1:9");
  expect(await state(page)).toMatchObject({ focusId: "1:9", actionMode: "allyPreview" });
  await expect(page.getByTestId("unit-tactic")).toHaveText("友軍・戰術飛船引路");
  await expect(page.getByTestId("action-menu")).toBeHidden();
});

test("S09-D/E: the corrected objective and Dori route trigger SAY/23 without stale movement", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-near-route&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-objective-destination-cell-count", "934");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText(
    "護送「多莉」抵達死亡之谷頂端，或擊退全部敵軍",
  );
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」或「多莉」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("「妮雅」到達");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage9-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const before = await state(page);
  const doriBefore = before.units.find(({ id }) => id === "1:9");
  expect(doriBefore && doriBefore.y * 50 + doriBefore.x).toBeGreaterThan(933);
  await page.keyboard.press("g");
  await page.getByTestId("group-command-allRest").click();
  await page.getByTestId("dialogue-layer").click();
  await waitForPhase(page, "victoryStory");
  const after = await state(page);
  const doriAfter = after.units.find(({ id }) => id === "1:9");
  expect(doriAfter && doriAfter.y * 50 + doriAfter.x).toBeLessThanOrEqual(933);
  expect(doriAfter).toMatchObject({ x: 33, y: 17 });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "23");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("我已經登上飛船了");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage9-victory-story.png`,
  });
});

test("S09-D: eliminating the blockade is an independent alternative victory", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-near-elimination&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ side }) => side === 2)?.life).toBe(1);
  expect((prepared.units.find(({ id }) => id === "1:9")?.y ?? 0) * 50
    + (prepared.units.find(({ id }) => id === "1:9")?.x ?? 0)).toBeGreaterThan(933);
  await page.getByTestId("battle-canvas").focus();
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryStory");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "23");
});

test("S09-F/G: defeat retries deployment and completion saves the non-linear stage 11 route", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／9");

  await page.goto("/?debugScenario=stage-09-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "openingStory");

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
    stageId: "stage-11",
    stageLabel: "拯救蘇蘭達",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-09-enter-deployment",
      "stage-09-opening-story",
      "stage-09-objective-reached",
      "stage-09-victory-story",
      "stage-09-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-11",
    stageProgress: 0,
    phase: "openingStory",
    campaignRoute: "stage-11",
  });

  await page.goto("/?debugScenario=stage-09-cleared&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-11",
    phase: "openingStory",
    campaignRoute: "stage-11",
    activeStoryId: "stage-11-opening-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "24");
});
