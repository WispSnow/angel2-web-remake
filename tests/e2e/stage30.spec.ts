import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { activeDialogueRecord, skipStoryDialogue } from "./dialogue-controls";
import { skipOpeningToTitle } from "./startup-controls";
import { expectStoryBackground } from "./story-background";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage30State {
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
    experience: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage30State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage30State | undefined)?.phase === expected,
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

async function acknowledgeBattleContext(page: Page): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.click();
  if (await activeDialogueRecord(page) === "battle-context") {
    await dialogue.click();
  }
}

async function advanceDialogueCheckpoint(page: Page, wait: number): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  const previousWait = String(wait - 1);
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
}

test("S30-A–E: SAY/0057 and SAY/0058 lead through the Empress mutation into the fixed-trio battle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-29-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "57");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "23");
  await expectStoryBackground(page, /story-stage29-background-23\.png/u);
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("收復騎士團堡");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "58");
  await expect(dialogue).toContainText("女帝");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toEqual([
    expect.objectContaining({ id: "1:40", classId: "magic-sword-warrior", x: 30, y: 19 }),
    expect.objectContaining({ id: "1:7", classId: "magic-priest", name: "琴斯", x: 26, y: 25 }),
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 28, y: 25 }),
  ]);
  expect(opening.units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({
      id: "2:27", classId: "empress", name: "維絲塔", portrait: 41, x: 28, y: 17,
    }),
  ]);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await expect(dialogue).toHaveAttribute("data-source-record", "battle-context");
  await expect(dialogue).toHaveAttribute("data-source-wait", "34");
  await expect(dialogue).toContainText("頭好痛啊");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "41");
  expect((await state(page)).units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "empress",
    portrait: 41,
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-opening-form-context.png`,
  });

  await acknowledgeBattleContext(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player.round).toBe(1);
  expect(player.units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "soldier",
    name: "維絲塔",
    portrait: 41,
    experience: 0,
    acted: false,
  });
  expect(player.consumedEventIds).toEqual([
    "stage-30-prebattle-story",
    "stage-30-opening-story",
    "stage-30-opening-form-transition",
  ]);
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[30].join("\n"));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-objective-and-map.png`,
  });
});

test("S30-F–I: the difficulty-final form changes sides before SAY/0059, saves v60, and enters stage 31", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-near-victory&difficulty=3&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 24, y: 20 });
  expect(prepared.units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "wizard",
    portrait: 41,
    x: 28,
    y: 23,
    life: 1,
    experience: 0,
  });
  await clickCell(page, 27, 23);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 28, 23);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "battle-context");
  await expect(dialogue).toContainText("頭好痛啊");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "41");
  expect((await state(page)).units.find(({ id }) => id === "2:27")).toBeUndefined();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-final-form-context.png`,
  });

  await acknowledgeBattleContext(page);
  await waitForPhase(page, "victoryStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "59");
  await expect(dialogue).toContainText("女帝恢復正常");
  const restored = await state(page);
  expect(restored.units.find(({ id }) => id === "2:27")).toBeUndefined();
  expect(restored.units.find(({ id }) => id === "1:23")).toMatchObject({
    side: 1,
    slot: 23,
    classId: "empress",
    name: "維絲塔",
    portrait: 41,
    experience: 0,
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-victory-story.png`,
  });

  for (let wait = 2; wait <= 6; wait += 1) {
    await advanceDialogueCheckpoint(page, wait);
    expect(await state(page)).toMatchObject({
      stageId: "stage-30",
      phase: "victoryStory",
      activeStoryId: "stage-30-victory-story",
    });
  }
  await dialogue.click();
  if ((await state(page)).phase === "victoryStory") await dialogue.click();
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("恢復神智");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
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
      roster: Array<{ slot: number; classId: string; experience: number }>;
      consumedEventIds: string[];
    });
  expect(completedSave).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    stageId: "stage-31",
    stageLabel: "前往斯德林海峽",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-30-prebattle-story",
      "stage-30-opening-story",
      "stage-30-opening-form-transition",
      "stage-30-objective-reached",
      "stage-30-completed-route",
    ],
  });
  expect(completedSave.roster.find(({ slot }) => slot === 23)).toMatchObject({
    classId: "empress",
    experience: 0,
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "60");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-stage31-prebattle.png`,
  });

  await page.goto("/?test=1");
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();
  // 完成档的记录摘要显示刚打完的第 30 关；存档本身仍以第 31 关入口为身份。
  await expect(page.getByTestId("title-record-slot-1"))
    .toHaveAttribute("aria-label", /治癒維斯塔女帝/u);
  await page.getByTestId("title-record-slot-1").click();
  await waitForPhase(page, "prebattleStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "60");
});

test("S30-G: Nia defeat retries from SAY/0057", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "57");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-prebattle-story",
  });
});
