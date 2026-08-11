import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage18State {
  stageId: string;
  stageProgress: number;
  phase: string;
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
  () => window.__ANGEL2__?.getState() as Stage18State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage18State | undefined)?.phase === expected,
  phase,
);

test("S18-I: direct debug entry keeps mandatory campaign class baselines", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-deployment&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("多莉");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("咒術師");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("瑪琳");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("摩莉娜");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("水戰士");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage18-debug-inherited-classes.png`,
  });
});

test("S18-A/B/C: stage 17 completion deploys 1–8, plays SAY/37, and starts with sixteen guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-17-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第五層 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／8");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(7);
  await expect(page.getByTestId("deployment-guidance")).toContainText("半龍戰士麗");
  expect(await state(page)).toMatchObject({
    stageId: "stage-18",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-18",
    consumedEventIds: ["stage-18-enter-deployment"],
  });
  for (let rosterIndex = 1; rosterIndex <= 7; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 8／8");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage18-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "37");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("神聖的龍塔");
  await expect(page.locator("#story-background")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage18-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(16);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 33, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:12")).toMatchObject({
    x: 25, y: 24, classId: "half-dragon-warrior", name: "麗", portrait: 38,
  });
  expect(battle.units.filter(({ classId }) => classId === "divine-sword-warrior")).toHaveLength(6);
  expect(battle.consumedEventIds).toEqual([
    "stage-18-enter-deployment",
    "stage-18-opening-story",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔第五層戰術地圖/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage18-battle-map.png`,
  });
});

test("S18-H: SAY/37 keeps Li and Nia in independent battle dialogue windows", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-opening&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === "1") await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "2");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("神聖的龍塔");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("女帝和琴斯");
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === "2") await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "3");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("先打倒我");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("女帝和琴斯");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage18-dual-dialogue.png`,
  });
});

test("S18-J: Li begins as a native sentry", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-near-victory&difficulty=0&test=1");
  const battle = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (25 - battle.cameraOrigin.x) * 40 + 20,
      y: 23 + (30 - battle.cameraOrigin.y) * 44 + 22,
    },
  });
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術守衛");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage18-li-sentry-tactic.png`,
  });
});

test("S18-D/E: the machine objective defeats Li without requiring the other fifteen guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-near-victory&difficulty=0&test=1");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("擊敗「麗」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage18-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(16);
  expect(prepared.units.find(({ id }) => id === "2:12")).toMatchObject({ life: 1 });
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(15);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S18-F/G: defeat retries deployment and completion freezes at Dragon Tower Floor Six", async ({ page }) => {
  await page.goto("/?debugScenario=stage-18-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第五層 · 出擊準備" })).toBeVisible();

  await page.goto("/?debugScenario=stage-18-victory-ready&difficulty=0&test=1");
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
    stageId: "stage-19",
    stageLabel: "龍塔第六層",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-18-enter-deployment",
      "stage-18-opening-story",
      "stage-18-objective-reached",
      "stage-18-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-18",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-19",
  });
});
