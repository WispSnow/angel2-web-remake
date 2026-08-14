import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage34State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
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
  () => window.__ANGEL2__?.getState() as Stage34State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage34State | undefined)?.phase === expected,
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

test("S34-A–E: the stage-33 route enters direct deployment before SAY/0066 and the static interior force", async ({ page }) => {
  await page.goto("/?debugScenario=stage-33-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "拉那洛城內 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／11");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(10);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十八名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選十人");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  expect(await visibleRosterSlots()).not.toEqual(expect.arrayContaining([22, 23, 24]));
  expect(await state(page)).toMatchObject({
    stageId: "stage-34",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-34",
    consumedEventIds: ["stage-34-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage34-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "66");
  await expect(dialogue).toContainText("真沒想到妳們也能到達這裡");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(1);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(19);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 30, y: 21 }),
    expect.objectContaining({ id: "2:6", classId: "great-dragon-knight", name: "芙瑪羅妮", portrait: 11, x: 18, y: 10 }),
    expect.objectContaining({ id: "2:7", classId: "evil-sword-warrior", name: "蕾娜吉芙", portrait: 24, x: 32, y: 10 }),
    expect.objectContaining({ id: "2:44", classId: "magic-master", x: 32, y: 16 }),
  ]));
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage34-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle).toMatchObject({
    round: 1,
    consumedEventIds: [
      "stage-34-enter-deployment",
      "stage-34-opening-story",
    ],
  });
  expect(Object.fromEntries(
    [...new Set(battle.units.filter(({ side }) => side === 2).map(({ classId }) => classId))]
      .map((classId) => [
        classId,
        battle.units.filter((unit) => unit.side === 2 && unit.classId === classId).length,
      ]),
  )).toEqual({
    "great-dragon-knight": 1,
    "prayer-guide": 3,
    "evil-sword-warrior": 5,
    "magic-armor-warrior": 1,
    "evil-mage": 3,
    "magic-sword-warrior": 1,
    "divine-sword-warrior": 2,
    "magic-master": 3,
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗所有的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage34-objective-and-map.png`,
  });
});

test("S34-F: removing the final enemy uses ordinary victory feedback without a victory SAY", async ({ page }) => {
  await page.goto("/?debugScenario=stage-34-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 26, y: 14 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:7")).toMatchObject({
    x: 31,
    y: 17,
    life: 1,
  });
  await clickCell(page, 30, 17);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 31, 17);
  const promotion = page.getByTestId("promotion-layer");
  await expect.poll(async () =>
    (await state(page)).phase === "victoryFeedback" || await promotion.isVisible()).toBe(true);
  if (await promotion.isVisible()) {
    await promotion.locator('[data-action="promotion-target"]').first().click();
  }
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("拉那洛城內的敵軍已全數離場");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage34-elimination-victory.png`,
  });
});

test("S34-G: Nia defeat retries directly from deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-34-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage34-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "拉那洛城內 · 出擊準備" })).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-34",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-34",
    consumedEventIds: ["stage-34-enter-deployment"],
  });
});

test("S34-H/I: ordinary victory saves v64 and enters the playable stage-35 opening", async ({ page }) => {
  await page.goto("/?debugScenario=stage-34-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("拉那洛城內的敵軍已全數離場");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "openingStory");

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
    stageId: "stage-35",
    stageLabel: "時空異變",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-34-enter-deployment",
      "stage-34-opening-story",
      "stage-34-objective-reached",
      "stage-34-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-35",
    stageProgress: 0,
    phase: "openingStory",
    campaignRoute: "stage-35",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "67");
  await expect(page.getByTestId("dialogue-layer")).toContainText("異世界之門");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage34-stage35-opening-route.png`,
  });
});
