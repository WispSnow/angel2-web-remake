import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { activeDialogueRecord, skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage20State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  focusId: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  lastSpecialAction?: {
    actionId: string;
    damage: number;
    affectedUnits: Array<{ unitId: string; damage: number; blocked: boolean }>;
  };
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
  () => window.__ANGEL2__?.getState() as Stage20State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage20State | undefined)?.phase === expected,
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

test("S20-A/B: stage 19 completion plays SAY/39 and opens the 3–17 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "39");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("塔頂");
  await expect(page.locator("#story-background")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔頂部 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 3／17");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(14);
  await expect(page.getByTestId("deployment-guidance")).toContainText("妖龍");
  expect(await state(page)).toMatchObject({
    stageId: "stage-20",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-20",
    consumedEventIds: ["stage-20-prebattle-story", "stage-20-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage20-deployment.png`,
  });
});

test("S20-C/D: round one replaces the 16-unit tableau with the WD dragon", async ({ page }) => {
  await page.goto("/?debugScenario=stage-20-deployment&difficulty=0&test=1");
  for (let rosterIndex = 1; rosterIndex <= 14; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 17／17");
  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "scriptedStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "40");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(16);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-half-dragon-tableau.png`,
  });

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage20State | undefined;
    return current?.activeStoryId === "stage-20-guardian-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "41");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "71");
  const dragonArrival = await state(page);
  expect(dragonArrival.units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({
      id: "2:28", classId: "dragon", name: "妖龍", portrait: 66, x: 29, y: 16,
      life: 2_400,
    }),
  ]);
  expect(dragonArrival.units.find(({ id }) => id === "1:32")).toMatchObject({
    classId: "prayer-guide", name: "守護者", portrait: 65, x: 28, y: 17,
  });
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-dragon-arrival.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect((await state(page)).consumedEventIds).toEqual([
    "stage-20-prebattle-story",
    "stage-20-enter-deployment",
    "stage-20-contact-story",
    "stage-20-guardian-move",
    "stage-20-guardian-story",
    "stage-20-tableau-departure",
    "stage-20-dragon-arrival",
    "stage-20-opening-story",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔頂部戰術地圖/u);
});

test("S20-E: demon dragon casts the native-timed WD path and defeats Nia", async ({ page }) => {
  await page.goto("/?debugScenario=stage-20-near-defeat&difficulty=0&test=1&slowMap=1");
  await waitForPhase(page, "player");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  for (let input = 0; input < 8; input += 1) {
    if (await activeDialogueRecord(page) !== "battle-command") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "wdGrowth" && Number(dataset.mapCombatFrame) >= 2;
  });
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-texture-keys", /map-wd-/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-wd-growth.png`,
  });
  await waitForPhase(page, "defeat");
  expect((await state(page)).lastSpecialAction).toMatchObject({ actionId: "wd" });
});

test("S20-F/G: boss victory plays Kins and Dragon King, then enters stage 21", async ({ page }) => {
  await page.goto("/?debugScenario=stage-20-victory-ready&difficulty=0&test=1");
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage20State | undefined;
    return current?.activeStoryId === "stage-20-victory-1-story";
  });
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "72");
  expect((await state(page)).units.find(({ id }) => id === "1:7")).toMatchObject({
    classId: "magic-priest", name: "琴斯", portrait: 14, x: 33, y: 15, life: 305,
  });
  await expect(page.getByTestId("hud-identity")).toHaveText("魔祭師／琴斯");
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-kins-victory-arrival.png`,
  });

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage20State | undefined;
    return current?.activeStoryId === "stage-20-victory-2-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "73");
  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage20State | undefined;
    return current?.activeStoryId === "stage-20-victory-3-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "74");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "75");
  if (await page.getByTestId("dialogue-skip-confirm").isVisible()) {
    await page.getByTestId("dialogue-skip-no").click();
  }
  for (let input = 0; input < 6 && await dialogue.getAttribute("data-source-wait") !== "3"; input += 1) {
    await dialogue.click();
    await page.waitForTimeout(20);
  }
  await expect(dialogue).toHaveAttribute("data-source-wait", "3");
  await expect(dialogue).toContainText("龍王");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage20-dragon-king-victory.png`,
  });
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
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
    stageId: "stage-21",
    stageLabel: "焦土森林村莊外",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-20-prebattle-story",
      "stage-20-enter-deployment",
      "stage-20-contact-story",
      "stage-20-guardian-move",
      "stage-20-guardian-story",
      "stage-20-tableau-departure",
      "stage-20-dragon-arrival",
      "stage-20-opening-story",
      "stage-20-objective-reached",
      "stage-20-kins-arrival",
      "stage-20-kins-move",
      "stage-20-victory-1-story",
      "stage-20-victory-2-story",
      "stage-20-victory-3-story",
      "stage-20-victory-story",
      "stage-20-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-21",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-21",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "42");
});
