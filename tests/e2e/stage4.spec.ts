import { expect, test, type Locator, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage4State {
  stageId: string;
  phase: string;
  round: number;
  focusId: string;
  actionMode: string;
  activeStoryId?: string;
  campaignRoute?: string;
  savePromptIndex: number;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  rngCalls: number;
  routePulsePresentation?: {
    frame: number;
    sweepFrame?: number;
    draw: number;
    nativeTicks: number;
    result: { safeCells: Array<{ x: number; y: number }> };
  };
  routePulsePresentationTrace: Array<{
    frame: number;
    sweepFrame?: number;
    draw: number;
    nativeTicks: number;
    visible: boolean;
  }>;
  lastRoutePulse?: {
    actorId: string;
    path: Array<{ x: number; y: number }>;
    safeCells: Array<{ x: number; y: number }>;
    affectedUnits: Array<{
      unitId: string;
      lifeBefore: number;
      lifeAfter: number;
      died: boolean;
    }>;
  };
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    life: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage4State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage4State | undefined)?.phase === expected,
  phase,
);

// 目標與畫面原點必須在同一次量測裡取得：分兩趟讀會讓中途的版面變動把兩個矩形湊成
// 不同時點，量出來的差值不屬於任何一幀。
async function boundsInLogicalScreen(element: Locator) {
  return element.evaluate((node) => {
    const screen = document.querySelector("#logical-screen");
    if (!screen) throw new Error("missing #logical-screen");
    const bounds = node.getBoundingClientRect();
    const origin = screen.getBoundingClientRect();
    return {
      x: bounds.x - origin.x,
      y: bounds.y - origin.y,
      width: bounds.width,
      height: bounds.height,
    };
  });
}

async function insetWithinParent(element: Locator) {
  return element.evaluate((node) => {
    const parent = node.parentElement;
    if (!parent) throw new Error("missing text-window parent");
    const bounds = node.getBoundingClientRect();
    const parentBounds = parent.getBoundingClientRect();
    return { x: bounds.left - parentBounds.left, y: bounds.top - parentBounds.top };
  });
}

async function clickUnit(page: Page, id: string): Promise<void> {
  const current = await state(page);
  const unit = current.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (unit.x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (unit.y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

// `slowMap` only stretches the presentation wall clock, so a screenshot can land on a chosen
// sweep draw instead of racing the 22-draw wave.
const SLOW_PULSE_QUERY = "&slowMap=1";

const waitForSweepFrame = (page: Page, frame: string) => page.waitForFunction(
  (expected) => document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")
    ?.dataset.routePulseSweepFrame === expected,
  frame,
  { polling: 16 },
);

async function endManualPhase(page: Page): Promise<void> {
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await page.getByTestId("dialogue-layer").click();
}

test("S04-A/B/C: stage 4 enters SAY/7 and exposes an evidence-driven deployment hazard map", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("game-screen"))
    .toHaveAttribute("aria-label", "天使帝國 II 通過力場遊戲畫面");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "7");
  expect(await state(page)).toMatchObject({
    stageId: "stage-04",
    phase: "prebattleStory",
    activeStoryId: "stage-04-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／8");
  await expect(page.getByTestId("deployment-guidance"))
    .toContainText("結界外我方目前生命減半");
  await expect(page.locator(".deployment-open-cell.is-danger")).toHaveCount(2);
  await expect(page.locator(".deployment-open-cell.is-danger").first()).toContainText("危險");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage4-deployment-danger-zones.png`,
  });
  await page.getByTestId("deployment-roster-1").click();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 3／8");
  await page.getByTestId("deployment-finish").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "8");
  expect(await state(page)).toMatchObject({
    stageId: "stage-04",
    phase: "openingStory",
    activeStoryId: "stage-04-opening-story",
  });
  expect((await state(page)).units.filter(({ side }) => side === 1)).toHaveLength(3);
});

test("S04-D/E/F: Gadirath is independent, projects the safe area, and emits the full pulse", async ({ page }) => {
  await page.goto(`/?debugScenario=stage-04-first-pulse&difficulty=0&test=1${SLOW_PULSE_QUERY}`);
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => performance.getEntriesByType("resource")
    .some(({ name }) => name.endsWith("/assets/original/unit-ally-magician.png")));
  const initial = await state(page);
  expect(initial.units.filter(({ side }) => side === 1)).toHaveLength(8);
  expect(initial.units.find(({ id }) => id === "1:24")).toMatchObject({
    classId: "magician",
    x: 25,
    y: 41,
  });

  await clickUnit(page, "1:24");
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  await expect(page.getByTestId("unit-tactic")).toHaveText("友軍・戰術引導結界");
  await expect(page.getByTestId("route-pulse-safety")).toHaveText("力場安全");
  await expect(page.getByTestId("route-pulse-safety")).toHaveAttribute("data-safety", "safe");
  await expect(page.getByTestId("status-strip")).toHaveText("友軍・戰術引導結界・力場安全");
  await expect(page.getByTestId("unit-force")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-route-pulse-safe-cell-count", "13");
  await expect(canvas).toHaveAttribute("data-route-pulse-danger-unit-ids", /1:1/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-safe-area-preview.png`,
  });

  await page.keyboard.press("Escape");
  await clickUnit(page, "1:1");
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("route-pulse-safety")).toHaveText("力場危險");
  await expect(page.getByTestId("route-pulse-safety")).toHaveAttribute("data-safety", "danger");
  await expect(canvas).toHaveAttribute("data-route-pulse-safe-cell-count", "13");
  await page.keyboard.press("Escape");
  await endManualPhase(page);
  await waitForSweepFrame(page, "4");
  await expect(canvas).toHaveAttribute("data-map-combat-phase", "route-pulse");
  await expect(canvas).toHaveAttribute("data-route-pulse-visible", "true");
  await expect(canvas).toHaveAttribute("data-map-combat-frame", /^1[12]$/u);
  await expect(canvas).toHaveAttribute("data-route-pulse-native-ticks", "2");
  await expect(canvas).toHaveAttribute(
    "data-route-pulse-visible-unit-ids",
    "1:1,1:2,1:3,1:4,1:20,1:21",
  );
  // The sweep layer covers the whole camera window outside the barrier: `0000:97DC` walks
  // the same 10x7 screen array the remake viewport renders, and only the safe area is skipped.
  const sweepSample = await page.evaluate(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    const current = window.__ANGEL2__?.getState() as Stage4State;
    return {
      sweepCells: Number(element?.dataset.routePulseSweepCellCount),
      tileCount: Number(element?.dataset.mapCombatEffectTileCount),
      cameraOrigin: current.cameraOrigin,
      safeCells: current.routePulsePresentation?.result.safeCells ?? [],
    };
  });
  const safeInWindow = sweepSample.safeCells.filter(({ x, y }) =>
    x >= sweepSample.cameraOrigin.x && x < sweepSample.cameraOrigin.x + 10
    && y >= sweepSample.cameraOrigin.y && y < sweepSample.cameraOrigin.y + 7).length;
  expect(safeInWindow).toBeGreaterThan(0);
  expect(sweepSample.sweepCells).toBe(70 - safeInWindow);
  expect(sweepSample.tileCount).toBe(sweepSample.sweepCells + 6);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-force-field-pulse.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage4State | undefined;
    return current?.lastRoutePulse !== undefined && current.routePulsePresentation === undefined;
  });
  const resolved = await state(page);
  expect(resolved.lastRoutePulse).toMatchObject({ actorId: "1:24" });
  expect(resolved.lastRoutePulse!.path.length).toBeGreaterThan(1);
  expect(resolved.lastRoutePulse!.affectedUnits.length).toBeGreaterThan(0);
  expect(resolved.routePulsePresentationTrace).toHaveLength(22);
  expect(resolved.routePulsePresentationTrace.map(({ frame }) => frame))
    .toEqual(Array.from({ length: 22 }, (_, index) => index % 2 === 0 ? 11 : 12));
  expect(resolved.routePulsePresentationTrace.map(({ sweepFrame }) => sweepFrame))
    .toEqual([
      ...Array.from({ length: 11 }, (_, index) => index),
      ...Array<undefined>(11).fill(undefined),
    ]);
  expect(resolved.routePulsePresentationTrace.map(({ visible }) => visible))
    .toEqual([...Array<boolean>(11).fill(true), ...Array<boolean>(11).fill(false)]);
  expect(resolved.routePulsePresentationTrace.every(({ nativeTicks }) => nativeTicks === 2)).toBe(true);
  expect(resolved.rngCalls).toBe(initial.rngCalls);
  for (const affected of resolved.lastRoutePulse!.affectedUnits) {
    expect(affected.lifeAfter).toBe(Math.floor(affected.lifeBefore / 2));
    const survivor = resolved.units.find(({ id }) => id === affected.unitId);
    if (affected.died) expect(survivor).toBeUndefined();
    else expect(survivor?.life).toBe(affected.lifeAfter);
  }
});

test("S04-K: reduced motion keeps every native draw of the force-field pulse", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?debugScenario=stage-04-first-pulse&difficulty=0&test=1${SLOW_PULSE_QUERY}`);
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  const initial = await state(page);

  await endManualPhase(page);
  await expect(canvas).toHaveAttribute("data-map-combat-phase", "route-pulse");
  await expect(canvas).toHaveAttribute("data-route-pulse-visible", "true");
  await expect(canvas).toHaveAttribute("data-route-pulse-native-ticks", "2");
  await expect(canvas).toHaveAttribute(
    "data-route-pulse-visible-unit-ids",
    "1:1,1:2,1:3,1:4,1:20,1:21",
  );
  await waitForSweepFrame(page, "4");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-force-field-pulse-reduced-motion.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage4State | undefined;
    return current?.lastRoutePulse !== undefined && current.routePulsePresentation === undefined;
  });
  const resolved = await state(page);
  // The shared lightning wave keeps its native draw count under every presentation option;
  // only the player-visible speed toggle may change the wall clock.
  expect(resolved.routePulsePresentationTrace).toHaveLength(22);
  expect(resolved.routePulsePresentationTrace.map(({ sweepFrame }) => sweepFrame))
    .toEqual([
      ...Array.from({ length: 11 }, (_, index) => index),
      ...Array<undefined>(11).fill(undefined),
    ]);
  expect(resolved.routePulsePresentationTrace.every(({ nativeTicks }) => nativeTicks === 2)).toBe(true);
  expect(resolved.rngCalls).toBe(initial.rngCalls);
  for (const affected of resolved.lastRoutePulse!.affectedUnits) {
    expect(resolved.units.find(({ id }) => id === affected.unitId)?.life)
      .toBe(affected.lifeAfter);
  }
});

test("S04-G: the active deployment round-trips through the current save format", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const before = await state(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-1").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
    version: number;
    contentVersion: string;
    stageId: string;
    battle: { units: Stage4State["units"] };
  });
  expect(saved).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    stageId: "stage-04",
  });
  expect(saved.battle.units).toHaveLength(before.units.length);

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  await page.getByTestId("record-slot-1").click();
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({ stageId: "stage-04", round: before.round });
});

test("S04-H/I/J: the escort objective plays SAY/174 and enters stage-05 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-near-victory&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-objective-destination-cell-count", "175");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("護送葛蒂拉斯進入力場出口");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」或「葛蒂拉斯」戰敗");
  await expect(page.getByTestId("objective-guidance")).toContainText("防魔無效");
  await page.locator("[data-action=close-objectives]").click();

  await endManualPhase(page);
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "174");
  await expect(page.getByTestId("dialogue-window-lower"))
    .toContainText(/接下來就不需要我的結界來保護\s*了/u);
  const gadrathPortrait = page.getByTestId("dialogue-portrait-composite");
  await expect(gadrathPortrait).toBeVisible();
  await expect(gadrathPortrait).toHaveAttribute("data-portrait-record", "0");
  await expect.poll(() => gadrathPortrait.locator(".portrait-base").evaluate((image) => ({
    complete: (image as HTMLImageElement).complete,
    width: (image as HTMLImageElement).naturalWidth,
  }))).toEqual({ complete: true, width: 112 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-victory-story.png`,
  });

  await page.getByTestId("dialogue-layer").click();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("謝謝妳！葛蒂拉斯");
  const regularNiaPortrait = page.getByTestId("dialogue-portrait-composite");
  await expect(regularNiaPortrait).toHaveAttribute("data-portrait-record", "46");
  await page.waitForTimeout(130);
  const regularNiaBounds = await boundsInLogicalScreen(regularNiaPortrait);
  const regularUpperCopyBounds = await boundsInLogicalScreen(
    page.getByTestId("dialogue-window-upper").locator(".dialogue-copy"),
  );
  const regularNiaNativeAnchor = await regularNiaPortrait.evaluate((portrait) => ({
    x: (portrait as HTMLElement).offsetLeft
      + ((portrait.parentElement as HTMLElement | null)?.offsetLeft ?? 0),
    y: (portrait as HTMLElement).offsetTop
      + ((portrait.parentElement as HTMLElement | null)?.offsetTop ?? 0),
  }));
  expect(regularNiaNativeAnchor).toEqual({ x: 32, y: 26 });
  expect(regularNiaBounds).toMatchObject({ x: 32, width: 112, height: 112 });
  expect(regularUpperCopyBounds).toEqual({ x: 153, y: 10, width: 400, height: 86 });
  expect(regularUpperCopyBounds.x - (regularNiaBounds.x + 115)).toBe(6);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-victory-story-nia-upper.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  const feedbackPortrait = page.getByTestId("feedback-portrait");
  await expect(feedbackPortrait).toHaveAttribute("data-portrait-record", "46");
  expect(await boundsInLogicalScreen(feedbackPortrait)).toEqual(regularNiaBounds);
  expect(await boundsInLogicalScreen(
    page.getByTestId("native-feedback").locator(".native-feedback-copy"),
  ))
    .toEqual(regularUpperCopyBounds);
  const feedbackText = page.getByTestId("feedback-text");
  await expect(feedbackText)
    .toHaveText("哦！．．\n這次的戰役結束了，是否要記錄下來．");
  await expect(feedbackText.locator(".dialogue-glyph")).toHaveCount(21);
  expect(await insetWithinParent(feedbackText)).toEqual({ x: 27, y: 20 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-victory-save-offer-portrait.png`,
  });
  await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  const savePromptPortrait = page.getByTestId("feedback-portrait");
  await expect(savePromptPortrait).toHaveAttribute("data-portrait-record", "46");
  const [savePromptPortraitBounds, savePromptCopyBounds] = await Promise.all([
    boundsInLogicalScreen(savePromptPortrait),
    boundsInLogicalScreen(
      page.getByTestId("native-feedback").locator(".native-feedback-copy"),
    ),
  ]);
  expect(savePromptCopyBounds).toEqual({ x: 153, y: 10, width: 400, height: 86 });
  expect(savePromptPortraitBounds).toEqual({ x: 32, y: 26, width: 112, height: 112 });
  expect(savePromptCopyBounds.x - (savePromptPortraitBounds.x + 115)).toBe(6);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-save-prompt-portrait-alignment.png`,
  });
  const saveYes = page.getByTestId("save-yes");
  const saveNo = page.getByTestId("save-no");
  await expect(saveYes).toHaveAttribute("aria-current", "true");
  await saveNo.hover();
  await expect(saveNo).toHaveAttribute("aria-current", "true");
  await expect(saveYes).toHaveAttribute("aria-current", "false");
  expect((await state(page)).savePromptIndex).toBe(1);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage4-save-prompt-hover-cancel.png`,
  });
  await saveNo.click();
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-05",
    phase: "deployment",
    campaignRoute: "stage-05",
  });
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／6");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage4-stage5-deployment.png`,
  });
});
