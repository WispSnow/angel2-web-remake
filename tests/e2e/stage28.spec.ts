import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage28State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  focusId: string;
  statusMessage: string;
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
  () => window.__ANGEL2__?.getState() as Stage28State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage28State | undefined)?.phase === expected,
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

test("S28-A/B: stage 27 completion plays SAY/0053 before the 1–29 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "53");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "22");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage28-background-22\.png/u,
  );
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("暫時得到勝利");
  expect(await state(page)).toMatchObject({
    stageId: "stage-28",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-28",
    activeStoryId: "stage-28-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "保衛瓦爾克麗城 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／29");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(34);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十八名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("擊退全部攻城敵軍");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  await page.getByTestId("deployment-page-2").click();
  expect(await visibleRosterSlots()).toEqual([]);
  await page.getByTestId("deployment-page-0").click();
  expect(await state(page)).toMatchObject({
    stageId: "stage-28",
    phase: "deployment",
    campaignRoute: "stage-28",
    consumedEventIds: [
      "stage-28-prebattle-story",
      "stage-28-enter-deployment",
    ],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage28-deployment.png`,
  });
});

test("S28-C–E: SAY/0054 preserves the full 29-allied-unit force and 17 enemies", async ({ page }) => {
  await page.goto("/?debugScenario=stage-28-opening&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "54");
  await expect(dialogue).toContainText("拉朵那");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(29);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(17);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 28, y: 24 }),
    expect.objectContaining({ id: "1:1", name: "希蜜", x: 25, y: 21 }),
    expect.objectContaining({ id: "1:31", name: "嵐", x: 26, y: 28 }),
    expect.objectContaining({ id: "2:41", classId: "demon-dragon-knight", x: 39, y: 12 }),
    expect.objectContaining({ id: "2:55", classId: "magic-sword-warrior", x: 27, y: 15 }),
    expect.objectContaining({ id: "2:49", classId: "magic-master", x: 22, y: 33 }),
    expect.objectContaining({ id: "2:43", classId: "pegasus-warrior", x: 41, y: 39 }),
  ]));
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player.round).toBe(1);
  expect(player.consumedEventIds).toEqual([
    "stage-28-prebattle-story",
    "stage-28-enter-deployment",
    "stage-28-opening-story",
  ]);
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗攻擊瓦爾克麗城的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("回到瓦爾克麗城");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-objective-and-map.png`,
  });
});

test("S28-F: the final enemy's removal starts SAY/0055", async ({ page }) => {
  await page.goto("/?debugScenario=stage-28-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:55")).toMatchObject({
    x: 29,
    y: 24,
    life: 1,
  });
  await clickCell(page, 28, 24);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 29, 24);
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "55");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-elimination-victory.png`,
  });
});

test("S28-G: Nia defeat retries from SAY/0053", async ({ page }) => {
  await page.goto("/?debugScenario=stage-28-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "53");
  expect(await state(page)).toMatchObject({
    stageId: "stage-28",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-28",
    activeStoryId: "stage-28-prebattle-story",
  });
});

test("S28-H/I: SAY/0055 saves v55 and routes to the frozen stage-29 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-28-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "55");
  await expect(dialogue).toContainText("成功的突破");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("敵人已全數離場");
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
    stageId: "stage-29",
    stageLabel: "騎士城堡前",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-28-prebattle-story",
      "stage-28-enter-deployment",
      "stage-28-opening-story",
      "stage-28-objective-reached",
      "stage-28-victory-story",
      "stage-28-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-28",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-29",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage28-stage29-boundary.png`,
  });
});
