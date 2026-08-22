import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage14State {
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
  () => window.__ANGEL2__?.getState() as Stage14State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage14State | undefined)?.phase === expected,
  phase,
);

test("S14-I: direct debug entry keeps mandatory campaign class baselines", async ({ page }) => {
  await page.goto("/?debugScenario=stage-14-deployment&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("多莉");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("咒術師");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("瑪琳");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-figure-9")).toHaveAttribute(
    "data-source-url",
    /ally-water-warrior\.png$/u,
  );
  await expect(page.getByTestId("deployment-roster-10")).toContainText("摩莉娜");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-figure-10")).toHaveAttribute(
    "data-source-url",
    /ally-water-warrior\.png$/u,
  );
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage14-debug-inherited-classes.png`,
  });
});

test("S14-A/B/C: stage 13 completion deploys 1–10, plays SAY/33, and starts with seven guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-13-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第一層 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／10");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(9);
  await expect(page.getByTestId("deployment-guidance")).toContainText("半龍戰士芳");
  expect(await state(page)).toMatchObject({
    stageId: "stage-14",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-14",
    consumedEventIds: ["stage-14-enter-deployment"],
  });
  for (let rosterIndex = 1; rosterIndex <= 9; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 10／10");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage14-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "33");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("為何私闖龍塔");
  await expect(page.locator("#story-background")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage14-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 31, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:8")).toMatchObject({
    x: 25, y: 12, classId: "half-dragon-warrior", name: "芳", portrait: 34,
  });
  expect(battle.consumedEventIds).toEqual([
    "stage-14-enter-deployment",
    "stage-14-opening-story",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔第一層戰術地圖/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage14-battle-map.png`,
  });
});

test("S14-H: SAY/33 keeps Fang's first line visible while appending the order to stop Nia", async ({ page }) => {
  await page.goto("/?debugScenario=stage-14-opening&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  const dialogueText = page.locator("#dialogue-text");

  for (let wait = 2; wait <= 4; wait += 1) {
    const previousWait = String(wait - 1);
    await dialogue.click();
    if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }

  const firstHalf = "「什麼．．．！";
  const fullLine = `${firstHalf}\n    快．．快點擋住她們！別讓她們通過這兒！」`;
  await dialogue.click();
  await expect(dialogueText).toHaveText(firstHalf);
  await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "5");
  await expect(dialogue).toHaveAttribute("data-reveal-start", String(firstHalf.length));
  expect((await dialogueText.textContent())?.startsWith(firstHalf)).toBe(true);
  await page.waitForTimeout(120);
  await expect(dialogueText).toHaveText(fullLine);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage14-appended-dialogue.png`,
  });
});

test("S14-J: Fang is visibly identified as a sentry before the round-six release", async ({ page }) => {
  await page.goto("/?debugScenario=stage-14-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const battle = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (25 - battle.cameraOrigin.x) * 40 + 20,
      y: 23 + (13 - battle.cameraOrigin.y) * 44 + 22,
    },
  });
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術守衛");
});

test("S14-D/E: the corrected objective defeats Fang without requiring the other six guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-14-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[14].join("\n"));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage14-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(7);
  expect(prepared.units.find(({ id }) => id === "2:8")).toMatchObject({ life: 1 });
  expect(prepared.focusId).toBe("1:0");
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(6);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S14-F/G: defeat retries deployment and completion enters Dragon Tower Floor Two", async ({ page }) => {
  await page.goto("/?debugScenario=stage-14-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第一層 · 出擊準備" })).toBeVisible();

  await page.goto("/?debugScenario=stage-14-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第二層 · 出擊準備" })).toBeVisible();

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
    stageId: "stage-15",
    stageLabel: "龍塔第二層",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-14-enter-deployment",
      "stage-14-opening-story",
      "stage-14-objective-reached",
      "stage-14-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-15",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-15",
  });
});
