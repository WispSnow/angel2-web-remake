import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage10State {
  stageId: string;
  stageProgress: number;
  phase: string;
  actionMode: string;
  focusId: string;
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
  () => window.__ANGEL2__?.getState() as Stage10State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage10State | undefined)?.phase === expected,
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

test("S10-A/B/C: stage 11 completion plays SAY/28 on BK/10 before the 1–13 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-11-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "28");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "10");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage10-background-10\.png/u,
  );
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("半龍戰士都追上來了");
  expect(await state(page)).toMatchObject({
    stageId: "stage-10",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-10",
    activeStoryId: "stage-10-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage10-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "飛船上遭遇敵人 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／13");
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(15);
  await page.getByRole("button", { name: "名單第 2 頁" }).click();
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(5);
  await page.getByRole("button", { name: "名單第 1 頁" }).click();
  await expect(page.locator(".deployment-open-cell")).toHaveCount(12);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");

  const previewGeometry = await page.locator(".deployment-rail").evaluate((rail) => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const panel = rail.querySelector(".deployment-map-panel");
    const frame = rail.querySelector(".deployment-map-frame");
    const chips = [...rail.querySelectorAll(".deployment-open-cell")];
    if (!panel || !frame) throw new Error("stage 10 deployment preview is incomplete");
    const root = rail.closest(".deployment-ui-root");
    if (!(root instanceof HTMLElement)) throw new Error("deployment UI root is missing");
    return {
      rail: bounds(rail),
      panel: bounds(panel),
      frame: bounds(frame),
      chips: chips.map(bounds),
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
    };
  });
  expect(previewGeometry.rootScrollWidth).toBeLessThanOrEqual(previewGeometry.rootClientWidth);
  expect(previewGeometry.panel.left).toBeGreaterThanOrEqual(previewGeometry.rail.left);
  expect(previewGeometry.panel.right).toBeLessThanOrEqual(previewGeometry.rail.right);
  expect(previewGeometry.frame.left).toBeGreaterThanOrEqual(previewGeometry.panel.left);
  expect(previewGeometry.frame.right).toBeLessThanOrEqual(previewGeometry.panel.right);
  for (const chip of previewGeometry.chips) {
    expect(chip.left).toBeGreaterThanOrEqual(previewGeometry.panel.left);
    expect(chip.right).toBeLessThanOrEqual(previewGeometry.panel.right);
    expect(chip.top).toBeGreaterThanOrEqual(previewGeometry.panel.top);
    expect(chip.bottom).toBeLessThanOrEqual(previewGeometry.panel.bottom);
  }

  for (let rosterIndex = 1; rosterIndex <= 12; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 13／13");
  await page.getByTestId("deployment-roster-13").click();
  await expect(page.getByTestId("deployment-status")).toContainText("出場人數已滿");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage10-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(13);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 27, y: 29, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:20")).toMatchObject({
    x: 26, y: 13, classId: "half-dragon-warrior", name: "克諾絲", portrait: 4,
  });
  expect(battle.consumedEventIds).toEqual([
    "stage-10-prebattle-story",
    "stage-10-enter-deployment",
  ]);
});

test("S10-D/E: the corrected objective requires eliminating every pursuer and protects Nia", async ({ page }) => {
  await page.goto("/?debugScenario=stage-10-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("擊退全部追兵");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("回到瓦爾克麗城");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage10-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage10-battle-map.png`,
  });

  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect((await state(page)).units.find(({ id }) => id === "2:20")).toMatchObject({ life: 1 });
  await clickCell(page, 26, 20);
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
});

test("S10-F/G: defeat replays SAY/28 and completion saves the frozen stage-12 route", async ({ page }) => {
  await page.goto("/?debugScenario=stage-10-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "28");

  await page.goto("/?debugScenario=stage-10-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
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
    stageId: "stage-12",
    stageLabel: "落入沼澤",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-10-prebattle-story",
      "stage-10-enter-deployment",
      "stage-10-objective-reached",
      "stage-10-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-10",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-12",
  });
});
