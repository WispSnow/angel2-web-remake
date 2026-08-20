import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage33State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  campaignRoute?: string;
  cursor: { x: number; y: number };
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
  () => window.__ANGEL2__?.getState() as Stage33State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage33State | undefined)?.phase === expected,
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

test("S33-A–E: the stage-32 route enters direct deployment before SAY/0065 and the static garrison", async ({ page }) => {
  await page.goto("/?debugScenario=stage-32-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "拉那洛城外 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／10");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(9);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十八名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選九人");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  expect(await visibleRosterSlots()).not.toEqual(expect.arrayContaining([22, 23, 24]));
  expect(await state(page)).toMatchObject({
    stageId: "stage-33",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-33",
    consumedEventIds: ["stage-33-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage33-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "65");
  await expect(dialogue).toContainText("防守似乎挺好的");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(1);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(29);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 27, y: 44 }),
    expect.objectContaining({ id: "2:55", classId: "demon-dragon-knight", x: 18, y: 8 }),
    expect.objectContaining({
      id: "2:23", classId: "swift-dragon-knight", name: "阿莉絲", portrait: 30, x: 25, y: 12,
    }),
    expect.objectContaining({
      id: "2:24", classId: "swift-dragon-knight", name: "瑪西爾", portrait: 31, x: 27, y: 12,
    }),
    expect.objectContaining({ id: "2:44", classId: "magic-armor-warrior", x: 32, y: 38 }),
  ]));
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage33-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle).toMatchObject({
    round: 1,
    consumedEventIds: [
      "stage-33-enter-deployment",
      "stage-33-opening-story",
    ],
  });
  expect(Object.fromEntries(
    [...new Set(battle.units.filter(({ side }) => side === 2).map(({ classId }) => classId))]
      .map((classId) => [
        classId,
        battle.units.filter((unit) => unit.side === 2 && unit.classId === classId).length,
      ]),
  )).toEqual({
    "demon-dragon-knight": 2,
    "great-axe-warrior": 6,
    "beast-knight": 4,
    "swift-dragon-knight": 2,
    "evil-mage": 4,
    wizard: 2,
    "prayer-guide": 2,
    "magic-master": 2,
    "magic-armor-warrior": 5,
  });
  for (let step = 0; step < 32; step += 1) await page.keyboard.press("ArrowUp");
  expect((await state(page)).cursor).toEqual({ x: 27, y: 12 });
  await expect(page.locator(".hud-identity-name")).toHaveText("迅龍騎士／瑪西爾");
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "31");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect((await state(page)).cursor).toEqual({ x: 25, y: 12 });
  await expect(page.locator(".hud-identity-name")).toHaveText("迅龍騎士／阿莉絲");
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "30");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage33-named-guards.png`,
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗所有的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage33-objective-and-map.png`,
  });
});

test("S33-F: removing the final guard uses ordinary victory feedback without a victory SAY", async ({ page }) => {
  await page.goto("/?debugScenario=stage-33-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 23, y: 35 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "2:55")).toMatchObject({
    x: 28,
    y: 38,
    life: 1,
  });
  await clickCell(page, 27, 38);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 28, 38);
  const promotion = page.getByTestId("promotion-layer");
  await expect.poll(async () =>
    (await state(page)).phase === "victoryFeedback" || await promotion.isVisible()).toBe(true);
  if (await promotion.isVisible()) {
    await promotion.locator('[data-action="promotion-target"]').first().click();
  }
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("拉那洛城外的守軍已全數離場");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage33-elimination-victory.png`,
  });
});

test("S33-G: Nia defeat retries directly from deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-33-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage33-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "拉那洛城外 · 出擊準備" })).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-33",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-33",
    consumedEventIds: ["stage-33-enter-deployment"],
  });
});

test("S33-H/I: ordinary victory uses the current save identity and enters playable stage 34", async ({ page }) => {
  await page.goto("/?debugScenario=stage-33-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("status-strip")).toContainText("拉那洛城外的守軍已全數離場");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");

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
    stageId: "stage-34",
    stageLabel: "拉那洛城內",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-33-enter-deployment",
      "stage-33-opening-story",
      "stage-33-objective-reached",
      "stage-33-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-34",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-34",
    consumedEventIds: ["stage-34-enter-deployment"],
  });
  await expect(page.getByRole("heading", { name: "拉那洛城內 · 出擊準備" })).toBeVisible();
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage33-stage34-deployment.png`,
  });
});
