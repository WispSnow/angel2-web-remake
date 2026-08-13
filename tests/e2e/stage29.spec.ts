import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage29State {
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
  () => window.__ANGEL2__?.getState() as Stage29State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage29State | undefined)?.phase === expected,
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

async function advanceDialogueCheckpoint(page: Page, wait: number): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  const previousWait = String(wait - 1);
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
}

test("S29-A–E: SAY/0056 leads through the 30-entry roster into the dialogue-free battle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-28-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "56");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "23");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage29-background-23\.png/u,
  );
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("騎士團堡");
  expect(await state(page)).toMatchObject({
    stageId: "stage-29",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-29",
    activeStoryId: "stage-29-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage29-prebattle-story.png`,
  });

  for (let wait = 2; wait <= 7; wait += 1) await advanceDialogueCheckpoint(page, wait);
  await expect(dialogue).toContainText("艾西柯羅");
  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");

  await expect(page.getByRole("heading", { name: "騎士城堡前 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／15");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(14);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十九名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選十四人");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");

  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31]);
  await expect(page.getByTestId("deployment-roster-7")).toContainText("愛莉歐拉");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("巨斧戰士");
  await page.getByTestId("deployment-roster-7").click();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／15");
  await page.getByTestId("deployment-page-2").click();
  expect(await visibleRosterSlots()).toEqual([]);
  await page.getByTestId("deployment-page-1").click();
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage29-deployment-slot22.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.round).toBe(1);
  expect(battle.activeStoryId).toBeUndefined();
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(2);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
  expect(battle.units.find(({ id }) => id === "1:22")).toMatchObject({
    classId: "great-axe-warrior",
    name: "愛莉歐拉",
  });
  const eliola = battle.units.find(({ id }) => id === "1:22");
  if (!eliola) throw new Error("stage 29 battle is missing Eliola");
  await clickCell(page, eliola.x, eliola.y);
  await expect(page.locator(".hud-identity-name")).toHaveText("巨斧戰士／愛莉歐拉");
  await page.getByTestId("battle-canvas").click({
    button: "right",
    position: {
      x: 40 + (eliola.x - battle.cameraOrigin.x) * 40 + 20,
      y: 23 + (eliola.y - battle.cameraOrigin.y) * 44 + 22,
    },
  });
  expect(battle.units.find(({ id }) => id === "2:4")).toMatchObject({
    name: "艾西柯羅",
    portrait: 6,
    classId: "demon-dragon-knight",
    x: 40,
    y: 13,
  });
  expect(battle.consumedEventIds).toEqual([
    "stage-29-prebattle-story",
    "stage-29-enter-deployment",
  ]);
  expect(Object.fromEntries(
    [...new Set(battle.units.filter(({ side }) => side === 2).map(({ classId }) => classId))]
      .map((classId) => [
        classId,
        battle.units.filter((unit) => unit.side === 2 && unit.classId === classId).length,
      ]),
  )).toEqual({
    "magic-archer": 5,
    "evil-mage": 5,
    "demon-dragon-knight": 1,
    "swift-dragon-knight": 4,
  });
  await expect(dialogue).toBeHidden();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗所有的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage29-objective-and-map.png`,
  });
});

test("S29-F: removing the final guard uses ordinary victory feedback without a victory SAY", async ({ page }) => {
  await page.goto("/?debugScenario=stage-29-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 36, y: 23 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:47")).toMatchObject({
    x: 45,
    y: 26,
    life: 1,
  });
  await clickCell(page, 44, 26);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 45, 26);
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("敵軍已全數離場");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage29-elimination-victory.png`,
  });
});

test("S29-G: Nia defeat retries from SAY/0056", async ({ page }) => {
  await page.goto("/?debugScenario=stage-29-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage29-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "56");
  expect(await state(page)).toMatchObject({
    stageId: "stage-29",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-29",
    activeStoryId: "stage-29-prebattle-story",
  });
});

test("S29-H/I: ordinary victory saves v59 and enters the playable stage-30 prebattle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-29-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("敵軍已全數離場");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "prebattleStory");

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
    stageId: "stage-30",
    stageLabel: "治癒維斯塔女帝",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-29-prebattle-story",
      "stage-29-enter-deployment",
      "stage-29-objective-reached",
      "stage-29-completed-route",
    ],
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "57");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "23");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage29-stage30-prebattle.png`,
  });

  const dialogue = page.getByTestId("dialogue-layer");
  for (let wait = 2; wait <= 17; wait += 1) {
    await advanceDialogueCheckpoint(page, wait);
    await expect(dialogue).toHaveAttribute("data-source-record", "57");
    expect(await state(page)).toMatchObject({
      stageId: "stage-30",
      stageProgress: 0,
      phase: "prebattleStory",
      campaignRoute: "stage-30",
      activeStoryId: "stage-30-prebattle-story",
    });
  }
  await dialogue.click();
  if ((await state(page)).phase === "prebattleStory") await dialogue.click();
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "58");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "openingStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-opening-story",
  });
});
