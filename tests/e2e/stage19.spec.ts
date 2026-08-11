import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage19State {
  stageId: string;
  stageProgress: number;
  phase: string;
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
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage19State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage19State | undefined)?.phase === expected,
  phase,
);

test("S19-I: direct debug entry keeps mandatory campaign class baselines", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-deployment&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("多莉");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("咒術師");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("瑪琳");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("摩莉娜");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("水戰士");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage19-debug-inherited-classes.png`,
  });
});

test("S19-A/B/C: stage 18 completion deploys 1–10, plays SAY/38, and starts with twenty-one guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第六層 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／10");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(9);
  await expect(page.getByTestId("deployment-guidance")).toContainText("半龍戰士愛");
  expect(await state(page)).toMatchObject({
    stageId: "stage-19",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-19",
    consumedEventIds: ["stage-19-enter-deployment"],
  });
  for (let rosterIndex = 1; rosterIndex <= 9; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 10／10");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage19-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "38");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("妳們來了");
  await expect(page.locator("#story-background")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage19-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(21);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 33, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:13")).toMatchObject({
    x: 25, y: 12, classId: "half-dragon-warrior", name: "愛", portrait: 39,
  });
  expect(battle.units.filter(({ classId }) => classId === "steel-armor-warrior")).toHaveLength(7);
  expect(battle.units.filter(({ classId }) => classId === "great-axe-warrior")).toHaveLength(4);
  expect(battle.consumedEventIds).toEqual([
    "stage-19-enter-deployment",
    "stage-19-opening-story",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔第六層戰術地圖/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage19-battle-map.png`,
  });
});

test("S19-H: SAY/38 keeps Ai and Sulanda in independent battle dialogue windows", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-opening&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  for (const wait of ["1", "2"] as const) {
    if (await dialogue.getAttribute("data-source-wait") === wait) await dialogue.click();
    if (await dialogue.getAttribute("data-source-wait") === wait) await dialogue.click();
  }
  await expect(dialogue).toHaveAttribute("data-source-wait", "3");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("投靠龍塔");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("蘇蘭達");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("要見龍王");
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === "3") await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "4");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("消滅妳們");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("蘇蘭達");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage19-dual-dialogue.png`,
  });
});

test("S19-J: Ai begins as a native sentry", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-near-victory&difficulty=0&test=1");
  const battle = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (25 - battle.cameraOrigin.x) * 40 + 20,
      y: 23 + (30 - battle.cameraOrigin.y) * 44 + 22,
    },
  });
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術守衛");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage19-ai-sentry-tactic.png`,
  });
});

test("S19-D/E: the machine objective defeats Ai without requiring the other twenty guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-near-victory&difficulty=0&test=1");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("擊敗「愛」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage19-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(21);
  expect(prepared.units.find(({ id }) => id === "2:13")).toMatchObject({ life: 1 });
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(20);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S19-F/G: defeat retries deployment and completion freezes at Dragon Tower Summit", async ({ page }) => {
  await page.goto("/?debugScenario=stage-19-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第六層 · 出擊準備" })).toBeVisible();

  await page.goto("/?debugScenario=stage-19-victory-ready&difficulty=0&test=1");
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
    stageId: "stage-20",
    stageLabel: "龍塔頂部",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-19-enter-deployment",
      "stage-19-opening-story",
      "stage-19-objective-reached",
      "stage-19-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-19",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-20",
  });
});
