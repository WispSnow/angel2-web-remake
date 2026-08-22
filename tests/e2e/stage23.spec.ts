import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage23State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  focusId: string;
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
  () => window.__ANGEL2__?.getState() as Stage23State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage23State | undefined)?.phase === expected,
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

test("S23-A/B: stage 22 postbattle save opens the 1–15 deployment directly", async ({ page }) => {
  await page.goto("/?debugScenario=stage-22-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "死亡之谷中 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／15");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(14);
  await expect(page.getByTestId("deployment-minimap")).toBeVisible();
  await expect(page.getByTestId("deployment-guidance")).toContainText("不必全滅守軍");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("琴斯");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("魔祭師");
  await expect(page.getByTestId("deployment-roster-7").locator("img")).toHaveAttribute(
    "src",
    "/assets/original/unit-ally-magic-priest.png",
  );
  expect(await state(page)).toMatchObject({
    stageId: "stage-23",
    phase: "deployment",
    campaignRoute: "stage-23",
    consumedEventIds: ["stage-23-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage23-deployment.png`,
  });
  await page.getByTestId("deployment-page-1").click();
  await expect(page.getByTestId("deployment-roster-7")).toContainText("半龍戰士");
  await expect(page.getByTestId("deployment-roster-7").locator("img")).toHaveAttribute(
    "src",
    "/assets/original/technique-lab/units/ally-half-dragon-warrior.png",
  );
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage23-deployment-half-dragons.png`,
  });
});

test("S23-C–E: opening story hands 15 allies to the 21-guard battlefield", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-deployment&difficulty=0&test=1");
  for (let rosterIndex = 1; rosterIndex <= 14; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 15／15");
  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();

  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "46");
  await expect(page.locator("#story-background")).toBeHidden();
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(15);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(21);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", name: "妮雅", portrait: 46, x: 25, y: 38 }),
    expect.objectContaining({ id: "2:45", classId: "half-dragon-warrior", x: 16, y: 10 }),
    expect.objectContaining({ id: "2:36", classId: "flying-dragon-knight", x: 24, y: 10 }),
    expect.objectContaining({ id: "2:34", classId: "magic-archer", x: 22, y: 19 }),
    expect.objectContaining({ id: "2:43", classId: "crossbow", x: 32, y: 14 }),
    expect.objectContaining({ id: "2:48", classId: "steel-armor-warrior", x: 24, y: 29 }),
  ]));
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage23-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player).toMatchObject({
    focusId: "1:0",
    cameraOrigin: { x: 21, y: 33 },
    consumedEventIds: [
      "stage-23-enter-deployment",
      "stage-23-opening-story",
    ],
  });
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[23].join("\n"));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage23-objective-and-map.png`,
  });
});

test("S23-E: the marked destination and one-step fixture reach victory without a detour", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-objective-destination-cell-count", "525");
  await expect(canvas).toHaveAttribute("data-objective-destination-visible-cell-count", "25");
  await expect(canvas).toHaveAttribute(
    "data-objective-destination-style",
    "soft-magenta-fill-inset-outline",
  );

  const prepared = await state(page);
  expect(prepared.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 10 });
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(21);

  await clickCell(page, 25, 10);
  await page.getByTestId("unit-command-move").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage23-destination-highlight.png`,
  });
  await clickCell(page, 25, 9);
  await expect(page.getByTestId("unit-command-end")).toBeVisible();
  await page.getByTestId("unit-command-end").click();
  await waitForPhase(page, "victoryFeedback");

  const victory = await state(page);
  expect(victory.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 25, y: 9 });
  expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(21);
});

test("S23-F: Nia defeat returns directly to deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage23-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "死亡之谷中 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／15");
  expect(await state(page)).toMatchObject({
    stageId: "stage-23",
    phase: "deployment",
    campaignRoute: "stage-23",
    consumedEventIds: ["stage-23-enter-deployment"],
  });
});

test("S23-G/H: Nia reaches the top with every guard alive, saves, and opens stage 24", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  const victory = await state(page);
  expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(21);
  expect(victory.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 24, y: 10 });
  await expect(page.getByTestId("status-strip")).toContainText("妮雅已抵達死亡之谷頂端");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage23-victory-with-guards.png`,
  });

  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "死亡之谷城堡前 · 出擊準備" })).toBeVisible();

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
    stageId: "stage-24",
    stageLabel: "死亡之谷城堡前",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-23-enter-deployment",
      "stage-23-opening-story",
      "stage-23-objective-reached",
      "stage-23-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-24",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-24",
    consumedEventIds: ["stage-24-enter-deployment"],
  });
});

test("stage 24's deployment screen plays module 27's own roster track", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", /MUSIC\/(18|19)/u);

  await clickCell(page, 25, 10);
  await page.getByTestId("unit-command-move").click();
  await clickCell(page, 25, 9);
  await expect(page.getByTestId("unit-command-end")).toBeVisible();
  await page.getByTestId("unit-command-end").click();
  await waitForPhase(page, "victoryFeedback");
  // Nothing stops the battle track at victory; it keeps playing through the
  // feedback and save-prompt screens, same as every other stage.
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", /MUSIC\/(18|19)/u);

  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");

  expect(await state(page)).toMatchObject({ stageId: "stage-24", phase: "deployment" });
  // Native module 27 owns the roster screen and starts its own looping track
  // there (`0000:06A1`): MUSIC/17 from scene 6 on. Stage 24 has no prebattle
  // story of its own, so without that track the screen would still be
  // carrying stage 23's player-phase battle music across the stage boundary.
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/17");
});

test("toggling 確定/取消 in the save-confirm menu reuses its DOM node instead of replaying the pop-in", async ({ page }) => {
  await page.goto("/?debugScenario=stage-23-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");

  const menu = page.getByTestId("save-confirm-menu");
  await expect(page.getByTestId("save-yes")).toHaveClass(/is-selected/);
  await menu.evaluate((element) => {
    (element as unknown as { __regressionMarker?: boolean }).__regressionMarker = true;
  });

  // Clicking a button commits it immediately (`save-yes`/`save-no` call
  // `showSaveSlots`/`skipSave` straight away); only arrow keys toggle
  // `savePromptIndex` without committing (see `moveCursor` in
  // controller.ts), so the toggle has to be driven by keyboard here.
  // `renderResult` used to rebuild this menu from a template string on every
  // selection change, replacing the DOM node and replaying
  // `native-menu-zoom-in` each time the player switched 確定/取消. A reused
  // node keeps the JS-only marker; a freshly templated one would not.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("save-no")).toHaveClass(/is-selected/);
  await expect(page.getByTestId("save-yes")).not.toHaveClass(/is-selected/);
  expect(await menu.evaluate((element) =>
    (element as unknown as { __regressionMarker?: boolean }).__regressionMarker)).toBe(true);

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("save-yes")).toHaveClass(/is-selected/);
  expect(await menu.evaluate((element) =>
    (element as unknown as { __regressionMarker?: boolean }).__regressionMarker)).toBe(true);
});
