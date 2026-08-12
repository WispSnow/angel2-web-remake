import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage26State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  focusId: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  enemyPhaseTailPresentationTrace: Array<{
    execution: number;
    phase: string;
    draw: number;
    nativeTicks: number;
    origin: { x: number; y: number };
  }>;
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
  () => window.__ANGEL2__?.getState() as Stage26State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage26State | undefined)?.phase === expected,
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

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S26-A/B: stage 24 completion opens the four-fixed 22-unit deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-24-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "遭遇碧娜維姬 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 4／22");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(18);
  await expect(page.getByTestId("deployment-guidance")).toContainText("擊敗碧娜維姬");
  expect(await state(page)).toMatchObject({
    stageId: "stage-26",
    phase: "deployment",
    campaignRoute: "stage-26",
    consumedEventIds: ["stage-26-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage26-deployment.png`,
  });
});

test("S26-C–E: opening story hands 22 allies to Binaweiji and seven priests", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-opening&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "49");
  await expect(dialogue).toContainText("蘇蘭達");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(22);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(8);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:1", name: "希蜜", x: 19, y: 31 }),
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 22, y: 31 }),
    expect.objectContaining({ id: "1:8", name: "蘇蘭達", x: 26, y: 31 }),
    expect.objectContaining({ id: "1:7", name: "琴斯", classId: "magic-priest", x: 30, y: 31 }),
    expect.objectContaining({ id: "2:1", name: "碧娜維姬", classId: "magic-master", portrait: 8, x: 22, y: 15 }),
    expect.objectContaining({ id: "2:40", classId: "magic-priest", x: 18, y: 15 }),
  ]));
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({
    focusId: "1:0",
    consumedEventIds: [
      "stage-26-enter-deployment",
      "stage-26-opening-story",
    ],
  });
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗「碧娜維姬」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-objective-and-map.png`,
  });
});

test("S26-F: enemy phase runs two complete presentations before committing each push", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-enemy-tail&difficulty=0&test=1&slowMap=1");
  await waitForPhase(page, "player");
  expect((await state(page)).units.find(({ id }) => id === "1:0")).toMatchObject({ x: 22, y: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await page.getByTestId("dialogue-layer").click();

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "enemy-phase-tail-sweep"
      && dataset.enemyPhaseTailExecution === "1";
  });
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-texture-keys", /enemy-phase-tail-/u);
  await expect(canvas).toHaveAttribute("data-enemy-phase-tail-move-count", "1");
  expect((await state(page)).units.find(({ id }) => id === "1:0"))
    .toMatchObject({ x: 22, y: 20 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-column-push-first-sweep.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "enemy-phase-tail-sweep"
      && dataset.enemyPhaseTailExecution === "2";
  });
  expect((await state(page)).units.find(({ id }) => id === "1:0"))
    .toMatchObject({ x: 22, y: 23 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-column-push-second-sweep.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage26State | undefined;
    return current?.phase === "player" && current.round === 2;
  });

  const finished = await state(page);
  expect(finished.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 22, y: 26 });
  expect(finished.enemyPhaseTailPresentationTrace).toHaveLength(86);
  expect(finished.enemyPhaseTailPresentationTrace.filter(({ execution }) => execution === 1))
    .toHaveLength(43);
  expect(finished.enemyPhaseTailPresentationTrace.filter(({ execution }) => execution === 2))
    .toHaveLength(43);
});

test("S26-G: Binaweiji's removal starts SAY/0050 while seven priests remain", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await clickCell(page, 22, 17);
  await page.getByTestId("unit-command-attack").click();
  await clickCell(page, 22, 16);
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "50");
  const victory = await state(page);
  expect(victory.units.find(({ id }) => id === "2:1")).toBeUndefined();
  expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(7);
});

test("S26-H: Nia defeat returns directly to the same deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "遭遇碧娜維姬 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 4／22");
  expect(await state(page)).toMatchObject({
    stageId: "stage-26",
    phase: "deployment",
    campaignRoute: "stage-26",
    consumedEventIds: ["stage-26-enter-deployment"],
  });
});

test("S26-I/J: victory story saves the stage-27 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "50");
  await expect(page.getByTestId("dialogue-layer")).toContainText("碧娜維姬倒下");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(7);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage26-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("碧娜維姬已被擊敗");
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
    stageId: "stage-27",
    stageLabel: "趕回瓦爾克麗城",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-26-enter-deployment",
      "stage-26-opening-story",
      "stage-26-objective-reached",
      "stage-26-victory-story",
      "stage-26-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-26",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-27",
  });
});
