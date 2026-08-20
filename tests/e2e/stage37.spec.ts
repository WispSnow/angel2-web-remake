import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage37State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    life: number;
    statuses: { techniqueSeal: number };
  }>;
  lastSpecialAction?: { actionId: string; actorId: string };
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage37State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage37State | undefined)?.phase === expected,
  phase,
);

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  // The offsets below assume the drawn camera already sits on the simulated
  // origin, but `waitForPhase` only proves the controller reached that phase.
  // A static debug fixture can still be on its first scene tick with the Phaser
  // camera parked at world (0,0), which silently shifts every click by the
  // whole camera offset. The grid flag is published by the same scene sync that
  // scrolls the camera, so its presence means the two agree.
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-grid-enabled", /^(?:true|false)$/u);
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    force: true,
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S37-A–E: the stage-36 route enters deployment, SAY/0081, and the three-part board", async ({ page }) => {
  await page.goto("/?debugScenario=stage-36-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "究極女神 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／27");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(26);
  await expect(page.getByTestId("deployment-guidance")).toContainText("二十八名候選");
  await expect(page.getByTestId("deployment-guidance")).toContainText("最多再選二十六人");
  expect(await state(page)).toMatchObject({
    stageId: "stage-37",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-37",
    consumedEventIds: ["stage-37-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage37-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "81");
  await expect(page.getByTestId("dialogue-layer")).toContainText("我要變強");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(1);
  expect(opening.units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({ id: "2:56", classId: "head", x: 23, y: 11, life: 10_000 }),
    expect.objectContaining({ id: "2:54", classId: "hand", x: 22, y: 12, life: 10_000 }),
    expect.objectContaining({ id: "2:55", classId: "hand", x: 24, y: 12, life: 10_000 }),
  ]);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage37-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("三個部位");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
});

test("S37-F: boss HUD conceals all numeric fields while preserving the gauges", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await clickCell(page, 23, 11);
  const detail = page.getByTestId("unit-detail");
  await expect(detail).toHaveAttribute("data-concealed-stats", "true");
  await expect(detail).toContainText("?????／?????");
  await expect(page.getByTestId("unit-portrait"))
    .toHaveAttribute("src", "/assets/original/portraits/0008/base.png");
  await expect(page.getByTestId("hp-bar")).toHaveAttribute("aria-label", "生命數值隱藏");
  await expect(page.getByTestId("exp-bar")).toHaveAttribute("aria-label", "經驗數值隱藏");
  await expect(page.getByTestId("hp-bar").locator("i")).toHaveAttribute("style", /height:100%/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage37-concealed-boss-hud.png`,
  });

  await clickCell(page, 22, 12);
  await expect(page.getByTestId("unit-portrait"))
    .toHaveAttribute("src", "/assets/original/portraits/0008/base.png");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage37-hand-bina-portrait.png`,
  });
});

test("S37-G: the ice round lets both immobile hands act before the head", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const bossPositions = (await state(page)).units.filter(({ side }) => side === 2)
    .map(({ id, x, y }) => ({ id, x, y }));
  await page.evaluate(() => window.__ANGEL2__?.setPresentationFast(true));
  await page.keyboard.press("g");
  await page.getByTestId("group-command-allRest").click();
  const confirmation = page.getByTestId("dialogue-layer");
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage37State | undefined;
    return current?.phase === "player" && current.round === 2;
  });
  expect((await state(page)).units.filter(({ side }) => side === 2)
    .map(({ id, x, y }) => ({ id, x, y }))).toEqual(bossPositions);
  expect((await state(page)).lastSpecialAction)
    .toMatchObject({ actionId: "fire-4", actorId: "2:55" });
  await expect(page.getByTestId("status-strip")).toContainText("第 2 回合");

  await page.keyboard.press("F1");
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage37State | undefined;
    return current?.phase === "player" && current.round === 3;
  });
  expect((await state(page)).lastSpecialAction)
    .toMatchObject({ actionId: "ice-3", actorId: "2:56" });
  expect((await state(page)).units.filter(({ side }) => side === 2)
    .map(({ id, x, y }) => ({ id, x, y }))).toEqual(bossPositions);
});

test("S37-H: Nia defeat retries deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "究極女神 · 出擊準備" })).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-37",
    stageProgress: 0,
    consumedEventIds: ["stage-37-enter-deployment"],
  });
});

test("S37-I: victory saves v73 and exposes the native stage-49 main ending", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("頭與兩隻手已全部被擊破");
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
    stageId: "stage-49",
    stageLabel: "主線結局",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-37-enter-deployment",
      "stage-37-opening-story",
      "stage-37-objective-reached",
      "stage-37-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-37",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-49",
  });
  await expect(page.getByTestId("start-stage49-ending")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage37-stage49-ending-boundary.png`,
  });
});

test("S37-J: spell seal is visible on a hand but does not block its dedicated action", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-status-audit&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.evaluate(() => window.__ANGEL2__?.setPresentationFast(true));

  await clickCell(page, 27, 15);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-spell-seal").click();
  await clickCell(page, 24, 12);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage37State | undefined;
    return current?.lastSpecialAction?.actionId === "spell-seal";
  });
  expect((await state(page)).units.find(({ id }) => id === "2:55")?.statuses.techniqueSeal)
    .toBe(3);
  await expect(page.getByTestId("status-strip")).toContainText("專屬行動不受影響");

  await clickCell(page, 24, 12);
  await expect(page.getByTestId("status-icon-techniqueSeal"))
    .toHaveAttribute("data-remaining-rounds", "3");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage37-spell-sealed-hand.png`,
  });

  await page.keyboard.press("F1");
  const confirmation = page.getByTestId("dialogue-layer");
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage37State | undefined;
    return current?.phase === "player" && current.round === 2;
  });
  const after = await state(page);
  expect(after.lastSpecialAction).toMatchObject({ actionId: "fire-4", actorId: "2:55" });
  expect(after.units.find(({ id }) => id === "2:55")?.statuses.techniqueSeal).toBe(2);
});
