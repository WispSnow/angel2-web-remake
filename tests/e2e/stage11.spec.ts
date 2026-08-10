import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage11State {
  stageId: string;
  stageProgress: number;
  round: number;
  phase: string;
  actionMode: string;
  focusId: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    x: number;
    y: number;
    life: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage11State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage11State | undefined)?.phase === expected,
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

async function clickUnit(page: Page, id: string): Promise<void> {
  const unit = (await state(page)).units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  await clickCell(page, unit.x, unit.y);
}

test("S11-A/B/C: SAY/24–26 keeps Dori aboard until the dialogue finishes", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-cleared&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "24");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("妮雅她們馬上就來了");
  expect(await state(page)).toMatchObject({
    stageId: "stage-11",
    stageProgress: 0,
    phase: "openingStory",
    campaignRoute: "stage-11",
    activeStoryId: "stage-11-opening-story",
  });
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(9);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(opening.units.find(({ id }) => id === "1:9")).toMatchObject({ x: 26, y: 2, name: "多莉" });
  await page.waitForTimeout(200);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage11-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player.units.filter(({ side }) => side === 1)).toHaveLength(8);
  expect(player.units.find(({ id }) => id === "1:9")).toBeUndefined();
  expect(player.consumedEventIds).toEqual([
    "stage-11-opening-story",
    "stage-11-dori-departure",
  ]);
  await clickUnit(page, "1:8");
  expect(await state(page)).toMatchObject({ actionMode: "actionMenu", focusId: "1:8" });
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("action-menu")).toBeVisible();
});

test("S11-D/E: the corrected objective uses Sulanda's native boarding cells", async ({ page }) => {
  await page.goto("/?debugScenario=stage-11-near-route&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("護送「蘇蘭達」登上飛船");
  await expect(page.getByTestId("objective-panel")).toContainText("「蘇蘭達」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("碧娜維姬");
  await expect(page.getByTestId("objective-panel")).not.toContainText("「妮雅」戰敗");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage11-objective-and-map.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ id }) => id === "1:8")).toMatchObject({ x: 29, y: 6 });
  await clickUnit(page, "1:8");
  await page.getByTestId("unit-command-move").click();
  await clickCell(page, 29, 5);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage11State | undefined;
    return current?.phase === "victoryStory" || current?.actionMode === "actionMenu";
  });
  if ((await state(page)).phase === "player") {
    await page.getByTestId("unit-command-end").click();
  }
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "27");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("我們的人是不是都上來了");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage11-victory-story.png`,
  });
});

test("S11-H: every player-to-enemy transition adds one immediately active lower-edge reinforcement", async ({ page }) => {
  await page.goto("/?debugScenario=stage-11-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  expect((await state(page)).units.filter(({ side }) => side === 2).map(({ id }) => id))
    .toEqual(["2:21"]);

  await page.evaluate(() => {
    const trace: Array<Stage11State> = [];
    const interval = window.setInterval(() => {
      const current = window.__ANGEL2__?.getState() as Stage11State | undefined;
      if (current) trace.push(structuredClone(current));
    }, 5);
    Object.assign(window, { __stage11ReinforcementTrace: trace, __stage11TraceInterval: interval });
  });
  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-allRest").click();
  await page.getByTestId("dialogue-layer").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage11State | undefined;
    return current?.units.some(({ id }) => id === "2:40") ?? false;
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage11State | undefined;
    return current?.phase === "enemy" && current.cameraOrigin.y >= 40;
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage11-lower-edge-reinforcement.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage11State | undefined;
    return current?.phase === "player" && current.round === 2;
  });

  const trace = await page.evaluate(() => {
    const holder = window as typeof window & {
      __stage11ReinforcementTrace?: Stage11State[];
      __stage11TraceInterval?: number;
    };
    if (holder.__stage11TraceInterval !== undefined) window.clearInterval(holder.__stage11TraceInterval);
    return holder.__stage11ReinforcementTrace ?? [];
  });
  const arrival = trace.find((sample) => sample.phase === "enemy"
    && sample.units.some(({ id, x, y, acted }) => id === "2:40" && x === 32 && y === 48 && !acted));
  expect(arrival).toBeDefined();

  const round2 = await state(page);
  expect(round2.units.filter(({ side }) => side === 2)).toHaveLength(2);
  expect(round2.units.find(({ id }) => id === "2:40")).toMatchObject({ classId: "cavalry" });
  expect(round2.units.find(({ id }) => id === "2:41")).toBeUndefined();
});

test("S11-F/G: defeat rebuilds the opening and completion routes to internal stage 10", async ({ page }) => {
  await page.goto("/?debugScenario=stage-11-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "openingStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "24");
  expect((await state(page)).units.find(({ id }) => id === "1:9")).toBeDefined();

  await page.goto("/?debugScenario=stage-11-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "27");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
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
    stageId: "stage-10",
    stageLabel: "飛船上遭遇敵人",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-11-opening-story",
      "stage-11-dori-departure",
      "stage-11-objective-reached",
      "stage-11-victory-story",
      "stage-11-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-11",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-10",
  });

  await page.goto("/?debugScenario=stage-11-cleared&difficulty=0&test=1");
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({ campaignRoute: "stage-10" });
});
