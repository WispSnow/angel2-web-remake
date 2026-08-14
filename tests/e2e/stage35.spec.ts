import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage35State {
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
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage35State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage35State | undefined)?.phase === expected,
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

test("S35-A–E: the stage-34 route opens SAY/0067 on the fixed nine-versus-ten board", async ({ page }) => {
  await page.goto("/?debugScenario=stage-34-cleared&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "67");
  await expect(dialogue).toContainText("異世界之門");
  await expect(page.getByTestId("deployment-screen")).toHaveCount(0);
  const opening = await state(page);
  expect(opening).toMatchObject({
    stageId: "stage-35",
    stageProgress: 0,
    phase: "openingStory",
    campaignRoute: "stage-35",
    activeStoryId: "stage-35-opening-story",
  });
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(9);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(10);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", portrait: 46, x: 32, y: 10 }),
    expect.objectContaining({ id: "1:18", name: "雷伊拉", portrait: 21, x: 19, y: 12 }),
    expect.objectContaining({ id: "2:39", classId: "land-knight", x: 23, y: 8 }),
    expect.objectContaining({ id: "2:38", classId: "demon-dragon-knight", x: 25, y: 9 }),
    expect.objectContaining({ id: "2:42", classId: "magician", x: 22, y: 10 }),
  ]));
  if (process.env.VISUAL_AUDIT === "1") await page.waitForTimeout(1_000);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage35-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({
    round: 1,
    consumedEventIds: ["stage-35-opening-story"],
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗所有的敵人");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage35-objective-and-map.png`,
  });
});

test("S35-F: behavior-12 enemies consume a phase without moving or attacking", async ({ page }) => {
  await page.goto("/?debugScenario=stage-35-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const before = await state(page);
  const enemyBefore = before.units.filter(({ side }) => side === 2)
    .map(({ id, x, y, life }) => ({ id, x, y, life }));
  const allyLifeBefore = before.units.filter(({ side }) => side === 1)
    .map(({ id, life }) => ({ id, life }));

  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-allRest").click();
  const confirmation = page.getByTestId("dialogue-layer");
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage35State | undefined;
    return current?.phase === "player" && current.round === 2;
  });

  const after = await state(page);
  expect(after.units.filter(({ side }) => side === 2)
    .map(({ id, x, y, life }) => ({ id, x, y, life }))).toEqual(enemyBefore);
  expect(after.units.filter(({ side }) => side === 1)
    .map(({ id, life }) => ({ id, life }))).toEqual(allyLifeBefore);
  await expect(page.getByTestId("status-strip")).toContainText("第 2 回合");
});

test("S35-G/H: final elimination plays SAY/0068 and Nia defeat retries the opening", async ({ page }) => {
  await page.goto("/?debugScenario=stage-35-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await clickCell(page, 22, 11);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 22, 10);
  const promotion = page.getByTestId("promotion-layer");
  await expect.poll(async () =>
    (await state(page)).phase === "victoryStory" || await promotion.isVisible()).toBe(true);
  if (await promotion.isVisible()) {
    await promotion.locator('[data-action="promotion-target"]').first().click();
  }
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "68");
  await expect(page.getByTestId("dialogue-layer")).toContainText("不像是要作戰");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage35-victory-story.png`,
  });

  await page.goto("/?debugScenario=stage-35-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "openingStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "67");
  expect(await state(page)).toMatchObject({
    stageId: "stage-35",
    stageProgress: 0,
    consumedEventIds: ["stage-35-opening-story"],
  });
});

test("S35-I: victory saves v68 and enters the playable stage-36 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-35-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "68");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("死亡之谷士兵已全數離場");
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
    stageId: "stage-36",
    stageLabel: "異世界的碧娜維姬",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-35-opening-story",
      "stage-35-objective-reached",
      "stage-35-victory-story",
      "stage-35-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-36",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-36",
  });
  await expect(page.getByRole("heading", { name: "異世界的碧娜維姬 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／28");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage35-stage36-deployment-route.png`,
  });
});
