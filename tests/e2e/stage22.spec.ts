import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage22State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  focusId: string;
  cameraOrigin: { x: number; y: number };
  campaignRoute?: string;
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
  () => window.__ANGEL2__?.getState() as Stage22State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage22State | undefined)?.phase === expected,
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

async function moveCursor(page: Page, deltaX: number, deltaY: number): Promise<void> {
  const horizontal = deltaX < 0 ? "ArrowLeft" : "ArrowRight";
  const vertical = deltaY < 0 ? "ArrowUp" : "ArrowDown";
  for (let step = 0; step < Math.abs(deltaY); step += 1) await page.keyboard.press(vertical);
  for (let step = 0; step < Math.abs(deltaX); step += 1) await page.keyboard.press(horizontal);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("S22-A/B: stage 21 completion opens the hidden-enemy 1–19 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-21-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "焦土森林村莊中 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／19");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(18);
  await expect(page.getByTestId("deployment-guidance")).toContainText("暫時看不見敵軍");
  await expect(page.locator(".deployment-enemy-marker")).toHaveCount(0);
  expect(await state(page)).toMatchObject({
    stageId: "stage-22",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-22",
    consumedEventIds: ["stage-22-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage22-deployment.png`,
  });
});

test("S22-C–F: reunion, betrayal, and all six ambush enemies follow native order", async ({ page }) => {
  await page.goto("/?debugScenario=stage-22-deployment&difficulty=0&test=1");
  for (let rosterIndex = 1; rosterIndex <= 14; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await page.getByTestId("deployment-page-1").click();
  for (let rosterIndex = 0; rosterIndex <= 3; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 19／19");
  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage22State | undefined;
    return current?.activeStoryId === "stage-22-search-story";
  });
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "76");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toEqual([]);
  expect((await state(page)).units.find(({ id }) => id === "1:23")).toMatchObject({
    classId: "empress", name: "維絲塔", portrait: 41, x: 28, y: 33,
  });
  expect((await state(page)).units.find(({ id }) => id === "1:7")).toMatchObject({
    classId: "magic-priest", name: "琴斯", portrait: 14, x: 29, y: 34,
  });
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-empress-kins-arrival.png`,
  });

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage22State | undefined;
    return current?.activeStoryId === "stage-22-reunion-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "77");
  expect((await state(page)).focusId).toBe("1:0");

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage22State | undefined;
    return current?.activeStoryId === "stage-22-betrayal-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "78");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({
      id: "2:2", classId: "magic-priest", name: "葛蒂拉斯", portrait: 0, x: 23, y: 39,
    }),
  ]);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-gadirath-betrayal.png`,
  });

  await skipStoryDialogue(page);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage22State | undefined;
    return current?.activeStoryId === "stage-22-dragon-story";
  });
  await expect(dialogue).toHaveAttribute("data-source-record", "79");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({ id: "2:2", classId: "magic-priest", x: 23, y: 39 }),
    expect.objectContaining({
      id: "2:28", classId: "dragon", name: "妖龍", portrait: 66, x: 22, y: 24,
    }),
  ]);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-dragon-arrival.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player.units.some(({ id }) => id === "1:23" || id === "1:7")).toBe(false);
  expect(player.units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({ id: "2:2", classId: "magic-priest", x: 23, y: 39, acted: false }),
    expect.objectContaining({ id: "2:28", classId: "dragon", x: 22, y: 24, acted: false }),
    expect.objectContaining({ id: "2:40", classId: "magic-priest", portrait: 49, x: 39, y: 32, acted: false }),
    expect.objectContaining({ id: "2:41", classId: "magic-priest", portrait: 49, x: 39, y: 34, acted: false }),
    expect.objectContaining({ id: "2:42", classId: "magic-priest", portrait: 49, x: 24, y: 40, acted: false }),
    expect.objectContaining({ id: "2:43", classId: "magic-priest", portrait: 49, x: 22, y: 40, acted: false }),
  ]);
  expect(player).toMatchObject({
    focusId: "2:28",
    cameraOrigin: { x: 18, y: 21 },
  });
  expect(player.consumedEventIds).toEqual([
    "stage-22-enter-deployment",
    "stage-22-empress-arrival",
    "stage-22-empress-move",
    "stage-22-kins-arrival",
    "stage-22-kins-move",
    "stage-22-search-story",
    "stage-22-focus-nia",
    "stage-22-reunion-story",
    "stage-22-gadirath-arrival",
    "stage-22-betrayal-story",
    "stage-22-dragon-arrival",
    "stage-22-dragon-story",
    "stage-22-story-departures",
    "stage-22-ambush-arrivals",
    "stage-22-player-ready",
  ]);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-player-ambush.png`,
  });

  await moveCursor(page, 17, 8);
  await expect(page.locator(".hud-identity-name")).toHaveText("魔祭師／魔祭師");
  await expect(page.getByTestId("unit-portrait-composite")).toHaveAttribute(
    "data-portrait-record",
    "49",
  );
  await expect(page.getByTestId("unit-portrait")).toHaveAttribute(
    "src",
    /portraits\/0049\/base\.png$/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-generic-magic-priest-portrait.png`,
  });
});

test("S22-G: Nia defeat returns to a clean stage 22 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-22-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({
    focusId: "2:28",
    cameraOrigin: { x: 18, y: 21 },
  });
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await expect(page.getByTestId("retry-button")).toBeVisible();
  await expect(page.getByTestId("feedback-text")).toHaveText(
    "啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！",
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "焦土森林村莊中 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／19");
  await expect(page.locator(".deployment-enemy-marker")).toHaveCount(0);
  expect(await state(page)).toMatchObject({
    stageId: "stage-22",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-22",
    consumedEventIds: ["stage-22-enter-deployment"],
  });
});

test("S22-H/I: Dragon victory saves the exact boundary and routes to stage 23", async ({ page }) => {
  await page.goto("/?debugScenario=stage-22-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "45");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("還好吧");
  await expect(page.locator("#story-background")).toBeHidden();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-22",
    phase: "victoryStory",
    activeStoryId: "stage-22-postbattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-postbattle-story.png`,
  });
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("妖龍已被擊退");
  await expect(page.getByTestId("native-feedback")).toBeVisible();
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
    stageId: "stage-23",
    stageLabel: "死亡之谷中",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-22-enter-deployment",
      "stage-22-empress-arrival",
      "stage-22-empress-move",
      "stage-22-kins-arrival",
      "stage-22-kins-move",
      "stage-22-search-story",
      "stage-22-focus-nia",
      "stage-22-reunion-story",
      "stage-22-gadirath-arrival",
      "stage-22-betrayal-story",
      "stage-22-dragon-arrival",
      "stage-22-dragon-story",
      "stage-22-story-departures",
      "stage-22-ambush-arrivals",
      "stage-22-player-ready",
      "stage-22-objective-reached",
      "stage-22-postbattle-story",
      "stage-22-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-23",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-23",
    consumedEventIds: ["stage-23-enter-deployment"],
  });
  await expect(page.getByRole("heading", { name: "死亡之谷中 · 出擊準備" })).toBeVisible();
});

test("S22-J: a deployed half-dragon warrior flies the native teleport across the map", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/?debugScenario=stage-22-deployment&difficulty=0&test=1");

  // Scene 22 overwrites deployable slots 25–31, so the half-dragon candidates
  // sit on the second roster page. Deploy one of them and nothing else.
  await page.getByTestId("deployment-page-1").click();
  await expect(page.getByTestId("deployment-roster-6")).toContainText("半龍戰士");
  await page.getByTestId("deployment-roster-6").click();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／19");
  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();

  for (let story = 0; story < 4; story += 1) {
    await page.waitForFunction(() =>
      (window.__ANGEL2__?.getState() as Stage22State | undefined)?.phase === "scriptedStory");
    await skipStoryDialogue(page);
  }
  await waitForPhase(page, "player");

  const actor = (await state(page)).units.find(({ classId }) =>
    classId === "half-dragon-warrior");
  expect(actor).toMatchObject({ id: "1:25", acted: false });

  const cursor = await page.evaluate(() =>
    (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } }).cursor);
  await moveCursor(page, actor!.x - cursor.x, actor!.y - cursor.y);
  await page.keyboard.press("Space");

  // BAT-068: `1N` is a technique-menu class, and REMAKE-062 names its single
  // hard-coded action instead of jumping straight into target selection.
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-half-dragon-teleport")).toHaveText("傳送");
  await page.getByTestId("technique-half-dragon-teleport").click();

  const targeting = await page.evaluate(() => {
    const current = window.__ANGEL2__?.getState() as {
      actionMode: string;
      statusMessage: string;
      actionRange: Array<{ x: number; y: number }>;
      targets: Array<{ x: number; y: number }>;
      units: unknown[];
    };
    return {
      actionMode: current.actionMode,
      statusMessage: current.statusMessage,
      rangeCells: current.actionRange.length,
      targets: current.targets.length,
      unitCount: current.units.length,
    };
  });
  expect(targeting.actionMode).toBe("specialTarget");
  expect(targeting.statusMessage).toBe("選擇半龍戰士要傳送到的空格。");
  // Seed 200 covers the grid, but scene 22 terrain the class may not enter is
  // excluded, so this is never the unconditional 2,500-cell map.
  expect(targeting.rangeCells).toBeGreaterThan(1000);
  expect(targeting.rangeCells).toBeLessThan(50 * 50);
  expect(targeting.targets).toBe(targeting.rangeCells - targeting.unitCount);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage22-half-dragon-teleport-targeting.png`,
  });

  const destination = await page.evaluate((from) => {
    const current = window.__ANGEL2__?.getState() as {
      targets: Array<{ x: number; y: number }>;
    };
    return current.targets.find((cell) =>
      Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y) > 25)!;
  }, { x: actor!.x, y: actor!.y });
  await moveCursor(page, destination.x - actor!.x, destination.y - actor!.y);
  await page.keyboard.press("Space");

  // The native handler replays the ordinary movement walk, so a real multi-step
  // flight runs before the actor commits to the far cell.
  await page.waitForFunction(() =>
    (window.__ANGEL2__?.getState() as {
      movementPresentation?: { unitId: string };
    }).movementPresentation?.unitId === "1:25", undefined, { polling: "raf" });
  const flight = await page.evaluate(() => (window.__ANGEL2__?.getState() as {
    movementPresentation?: { kind: string; path: Array<{ x: number; y: number }> };
  }).movementPresentation);
  expect(flight?.kind).toBe("player");
  expect(flight?.path[0]).toEqual({ x: actor!.x, y: actor!.y });
  expect(flight?.path.at(-1)).toEqual(destination);
  expect(flight!.path.length).toBeGreaterThan(25);

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage22State & {
      movementPresentation?: unknown;
    };
    return current.movementPresentation === undefined
      && current.units.some(({ id, acted }) => id === "1:25" && acted);
  });
  const after = await state(page);
  expect(after.units.find(({ id }) => id === "1:25")).toMatchObject({
    x: destination.x,
    y: destination.y,
    acted: true,
    life: actor!.life,
  });
  await expect(page.getByTestId("status-strip"))
    .toContainText(`已傳送至（${destination.x}, ${destination.y}）`);
  // Spending the technique ends the activation; no post-move 攻擊 menu appears.
  await expect(page.getByTestId("unit-command-attack")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
