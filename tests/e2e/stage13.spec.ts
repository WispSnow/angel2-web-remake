import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage13State {
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
  () => window.__ANGEL2__?.getState() as Stage13State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage13State | undefined)?.phase === expected,
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

async function moveCursor(page: Page, deltaX: number, deltaY: number): Promise<void> {
  const horizontal = deltaX < 0 ? "ArrowLeft" : "ArrowRight";
  const vertical = deltaY < 0 ? "ArrowUp" : "ArrowDown";
  for (let step = 0; step < Math.abs(deltaY); step += 1) await page.keyboard.press(vertical);
  for (let step = 0; step < Math.abs(deltaX); step += 1) await page.keyboard.press(horizontal);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("S13-A/B/C: stage 12 completion plays SAY/32, deploys 1–12, and starts with nine guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-12-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "32");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "15");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage13-background-15\.png/u,
  );
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("高聳入雲");
  expect(await state(page)).toMatchObject({
    stageId: "stage-13",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-13",
    activeStoryId: "stage-13-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "龍塔外 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／12");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(11);
  await expect(page.getByTestId("deployment-guidance")).toContainText("瑪西爾");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("瑪琳");
  await expect(page.getByTestId("deployment-roster-9")).toContainText("水戰士");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("摩莉娜");
  await expect(page.getByTestId("deployment-roster-10")).toContainText("水戰士");
  for (let rosterIndex = 1; rosterIndex <= 11; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 12／12");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage13-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(12);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(9);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 36, y: 37, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "1:10")).toMatchObject({ classId: "water-warrior", name: "瑪琳" });
  expect(battle.units.find(({ id }) => id === "1:11")).toMatchObject({ classId: "water-warrior", name: "摩莉娜" });
  expect(battle.units.find(({ id }) => id === "2:24")).toMatchObject({
    x: 19, y: 17, classId: "divine-sword-warrior", name: "瑪西爾", portrait: 31,
  });
  expect(battle.consumedEventIds).toEqual([
    "stage-13-prebattle-story",
    "stage-13-enter-deployment",
  ]);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("aria-label", /龍塔外戰術地圖/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-battle-map.png`,
  });
});

test("S13-H: mouse input keeps the first half visible and types only the text appended after KY", async ({ page }) => {
  await page.goto("/?debugScenario=stage-13-prebattle&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  const dialogueText = page.locator("#dialogue-text");

  for (let wait = 2; wait <= 5; wait += 1) {
    const previousWait = String(wait - 1);
    await dialogue.click();
    if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }

  const firstHalf = "「她們一定也是這麼想的．．．";
  const fullLine = `${firstHalf}\n  不如我們現在就衝過去，給她們來個措手不及吧！\n  」`;
  await dialogue.click();
  await expect(dialogueText).toHaveText(firstHalf);

  await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", "6");
  await expect(dialogue).toHaveAttribute("data-reveal-start", String(firstHalf.length));
  const immediatelyAfterKy = await dialogueText.textContent();
  expect(immediatelyAfterKy?.startsWith(firstHalf)).toBe(true);
  expect(immediatelyAfterKy).not.toBe(fullLine);

  await page.waitForTimeout(120);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-appended-dialogue.png`,
  });
  await expect(dialogueText).toHaveText(fullLine);
});

test("S13-I: unnamed Dragon Tower guards use their native enemy class portraits in the HUD", async ({ page }) => {
  await page.goto("/?debugScenario=stage-13-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const portrait = page.getByTestId("unit-portrait-composite");
  const identity = page.locator(".hud-identity-name");

  // Nia starts at (36,37); move to the pegasus warrior at (22,17).
  await moveCursor(page, -14, -20);
  await expect(identity).toHaveText("飛馬戰士／飛馬戰士");
  await expect(portrait).toHaveAttribute("data-portrait-record", "53");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-generic-pegasus-portrait.png`,
  });

  // Magician at (28,18), archer at (23,22), steel armor warrior at (17,21).
  await moveCursor(page, 6, 1);
  await expect(identity).toHaveText("魔術士／魔術士");
  await expect(portrait).toHaveAttribute("data-portrait-record", "49");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-generic-magician-portrait.png`,
  });

  await moveCursor(page, -5, 4);
  await expect(identity).toHaveText("弓兵／弓兵");
  await expect(portrait).toHaveAttribute("data-portrait-record", "60");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-generic-archer-portrait.png`,
  });

  await moveCursor(page, -6, -1);
  await expect(identity).toHaveText("鋼甲戰士／鋼甲戰士");
  await expect(portrait).toHaveAttribute("data-portrait-record", "58");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-generic-steel-armor-portrait.png`,
  });
});

test("S13-D/E: the corrected objective defeats Marsiel without requiring the other eight guards", async ({ page }) => {
  await page.goto("/?debugScenario=stage-13-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("擊敗「瑪西爾」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("打敗所有的敵人");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage13-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(9);
  expect(prepared.units.find(({ id }) => id === "2:24")).toMatchObject({ life: 1 });
  await clickCell(page, 18, 17);
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(8);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S13-F/G: defeat retries SAY/32 and completion freezes at Dragon Tower Floor One", async ({ page }) => {
  await page.goto("/?debugScenario=stage-13-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "32");

  await page.goto("/?debugScenario=stage-13-victory-ready&difficulty=0&test=1");
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
    stageId: "stage-14",
    stageLabel: "龍塔第一層",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-13-prebattle-story",
      "stage-13-enter-deployment",
      "stage-13-objective-reached",
      "stage-13-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-13",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-14",
  });
});
