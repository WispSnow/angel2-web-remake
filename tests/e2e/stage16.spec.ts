import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage16State {
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
  () => window.__ANGEL2__?.getState() as Stage16State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage16State | undefined)?.phase === expected,
  phase,
);

test("S16-I: direct debug entry keeps mandatory campaign class baselines", async ({ page }) => {
  await page.goto("/?debugScenario=stage-16-deployment&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("多莉");
  await expect(page.getByTestId("deployment-roster-8")).toContainText("咒術師");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("瑪琳");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-9").locator("img")).toHaveAttribute(
    "src",
    /ally-water-warrior\.png$/u,
  );
  await expect(page.getByTestId("deployment-roster-10")).toContainText("摩莉娜");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("水戰士");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage16-debug-inherited-classes.png`,
  });
});

test("S16-A/B/C: stage 15 completion deploys 1–10, plays SAY/35, and starts with thirteen guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-15-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第三層 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／10");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(9);
  await expect(page.getByTestId("deployment-guidance")).toContainText("半龍戰士莎");
  expect(await state(page)).toMatchObject({
    stageId: "stage-16",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-16",
    consumedEventIds: ["stage-16-enter-deployment"],
  });
  for (let rosterIndex = 1; rosterIndex <= 9; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 10／10");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage16-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "35");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("闖進龍塔");
  await expect(page.locator("#story-background")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage16-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(10);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(13);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 31, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:10")).toMatchObject({
    x: 25, y: 12, classId: "half-dragon-warrior", name: "莎", portrait: 36,
  });
  expect(battle.units.filter(({ classId }) => classId === "divine-sword-warrior")
    .map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 15, y: 27 }, { x: 18, y: 27 }, { x: 32, y: 27 }, { x: 35, y: 27 },
  ]);
  expect(battle.consumedEventIds).toEqual([
    "stage-16-enter-deployment",
    "stage-16-opening-story",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔第三層戰術地圖/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage16-battle-map.png`,
  });
});

test("S16-H: SAY/35 keeps Sha's accusation visible while appending her closing line", async ({ page }) => {
  await page.goto("/?debugScenario=stage-16-opening&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  const dialogueText = page.locator("#dialogue-text");

  for (let wait = 2; wait <= 3; wait += 1) {
    const previousWait = String(wait - 1);
    await dialogue.click();
    if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }

  const firstHalf = "「但是妳們私闖龍塔，還打敗我兩位姊妹．．，";
  const fullLine = `${firstHalf}\n    為了替她們討回公道，我只有全力阻止妳們了！」`;
  await expect(dialogueText).toHaveText(firstHalf);
  await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "4");
  await expect(dialogue).toHaveAttribute("data-reveal-start", String(firstHalf.length));
  expect((await dialogueText.textContent())?.startsWith(firstHalf)).toBe(true);
  await page.waitForTimeout(120);
  await expect(dialogueText).toHaveText(fullLine);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage16-appended-dialogue.png`,
  });
});

test("S16-J: Sha is a sentry while the flanking divine sword warriors already pursue", async ({ page }) => {
  await page.goto("/?debugScenario=stage-16-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const battle = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (25 - battle.cameraOrigin.x) * 40 + 20,
      y: 23 + (28 - battle.cameraOrigin.y) * 44 + 22,
    },
  });
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術守衛");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage16-sha-sentry-tactic.png`,
  });
});

test("S16-D/E: the machine objective defeats Sha without requiring the other twelve guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-16-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("擊敗「莎」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage16-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(13);
  expect(prepared.units.find(({ id }) => id === "2:10")).toMatchObject({ life: 1 });
  expect(prepared.focusId).toBe("1:0");
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(12);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S16-F/G: defeat retries deployment and completion enters Dragon Tower Floor Four", async ({ page }) => {
  await page.goto("/?debugScenario=stage-16-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第三層 · 出擊準備" })).toBeVisible();

  await page.goto("/?debugScenario=stage-16-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔第四層 · 出擊準備" })).toBeVisible();

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
    stageId: "stage-17",
    stageLabel: "龍塔第四層",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-16-enter-deployment",
      "stage-16-opening-story",
      "stage-16-objective-reached",
      "stage-16-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-17",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-17",
    consumedEventIds: ["stage-17-enter-deployment"],
  });
});
