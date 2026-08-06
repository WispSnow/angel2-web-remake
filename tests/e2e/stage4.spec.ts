import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage4State {
  stageId: string;
  phase: string;
  round: number;
  focusId: string;
  actionMode: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  rngCalls: number;
  routePulsePresentation?: {
    frame: number;
    draw: number;
    nativeTicks: number;
  };
  routePulsePresentationTrace: Array<{
    frame: number;
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

async function boundsInLogicalScreen(page: Page, element: Locator) {
  const [bounds, screen] = await Promise.all([
    element.boundingBox(),
    page.locator("#logical-screen").boundingBox(),
  ]);
  expect(bounds).not.toBeNull();
  expect(screen).not.toBeNull();
  return {
    x: bounds!.x - screen!.x,
    y: bounds!.y - screen!.y,
    width: bounds!.width,
    height: bounds!.height,
  };
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

async function endManualPhase(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await page.getByTestId("advance-dialogue").click();
}

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("S04-A/B/C: stage 4 enters SAY/7 and exposes an evidence-driven deployment hazard map", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: /通過力場/u })).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "7");
  expect(await state(page)).toMatchObject({
    stageId: "stage-04",
    phase: "prebattleStory",
    activeStoryId: "stage-04-prebattle-story",
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-prebattle-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／8");
  await expect(page.getByTestId("deployment-guidance"))
    .toContainText("結界外我方目前生命減半");
  await expect(page.locator(".deployment-open-cell.is-danger")).toHaveCount(2);
  await expect(page.locator(".deployment-open-cell.is-danger").first()).toContainText("危險");
  await page.getByTestId("deployment-screen").screenshot({
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
  await page.goto("/?debugScenario=stage-04-first-pulse&difficulty=0&test=1");
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
  await expect(page.getByTestId("unit-force")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-route-pulse-safe-cell-count", "13");
  await expect(canvas).toHaveAttribute("data-route-pulse-danger-unit-ids", /1:1/u);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-safe-area-preview.png`,
  });

  await page.keyboard.press("Enter");
  await clickUnit(page, "1:1");
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("route-pulse-safety")).toHaveText("力場危險");
  await expect(page.getByTestId("route-pulse-safety")).toHaveAttribute("data-safety", "danger");
  await expect(canvas).toHaveAttribute("data-route-pulse-safe-cell-count", "13");
  await page.keyboard.press("Enter");
  await endManualPhase(page);
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return element?.dataset.mapCombatPhase === "route-pulse"
      && ["11", "12"].includes(element.dataset.mapCombatFrame ?? "")
      && element.dataset.routePulseVisible === "true"
      && Number(element.dataset.mapCombatEffectTileCount) > 0;
  });
  await expect(canvas).toHaveAttribute("data-route-pulse-native-ticks", "2");
  await expect(canvas).toHaveAttribute(
    "data-route-pulse-visible-unit-ids",
    "1:1,1:2,1:3,1:4,1:20,1:21",
  );
  await page.getByTestId("game-screen").screenshot({
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

test("S04-K: reduced motion keeps one readable damage impact outside the shield", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debugScenario=stage-04-first-pulse&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  const initial = await state(page);

  await endManualPhase(page);
  await expect(canvas).toHaveAttribute("data-map-combat-phase", "route-pulse");
  await expect(canvas).toHaveAttribute("data-route-pulse-visible", "true");
  await expect(canvas).toHaveAttribute("data-route-pulse-native-ticks", "15");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "6");
  await expect(canvas).toHaveAttribute(
    "data-route-pulse-visible-unit-ids",
    "1:1,1:2,1:3,1:4,1:20,1:21",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-force-field-pulse-reduced-motion.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage4State | undefined;
    return current?.lastRoutePulse !== undefined && current.routePulsePresentation === undefined;
  });
  const resolved = await state(page);
  expect(resolved.routePulsePresentationTrace).toEqual([{
    frame: 12,
    draw: 0,
    nativeTicks: 15,
    visible: true,
  }]);
  expect(resolved.rngCalls).toBe(initial.rngCalls);
  for (const affected of resolved.lastRoutePulse!.affectedUnits) {
    expect(resolved.units.find(({ id }) => id === affected.unitId)?.life)
      .toBe(affected.lifeAfter);
  }
});

test("S04-G: the active deployment round-trips through save format v17", async ({ page }) => {
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
    version: 18,
    contentVersion: "dynamic-terrain-2",
    stageId: "stage-04",
  });
  expect(saved.battle.units).toHaveLength(before.units.length);

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  await page.getByTestId("record-slot-1").click();
  await waitForPhase(page, "player");
  expect(await state(page)).toMatchObject({ stageId: "stage-04", round: before.round });
});

test("S04-H/I/J: the escort objective plays SAY/174 and stops at the stage-05 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("護送葛蒂拉斯進入力場出口");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」或「葛蒂拉斯」戰敗");
  await expect(page.getByTestId("route-pulse-guidance")).toContainText("防魔無效");
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
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-victory-story.png`,
  });

  await page.getByTestId("advance-dialogue").click();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("謝謝妳！葛蒂拉斯");
  const regularNiaPortrait = page.getByTestId("dialogue-portrait-composite");
  await expect(regularNiaPortrait).toHaveAttribute("data-portrait-record", "46");
  const regularNiaBounds = await boundsInLogicalScreen(page, regularNiaPortrait);
  const regularUpperCopyBounds = await boundsInLogicalScreen(
    page,
    page.getByTestId("dialogue-window-upper").locator(".dialogue-copy"),
  );
  expect(regularNiaBounds).toMatchObject({ x: 32, width: 112, height: 112 });
  expect(regularUpperCopyBounds).toMatchObject({ x: 144, width: 480, height: 84 });
  await page.waitForTimeout(130);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-victory-story-nia-upper.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "victoryFeedback");
  const feedbackPortrait = page.getByTestId("feedback-portrait");
  await expect(feedbackPortrait).toHaveAttribute("data-portrait-record", "46");
  expect(await boundsInLogicalScreen(page, feedbackPortrait)).toEqual(regularNiaBounds);
  expect(await boundsInLogicalScreen(
    page,
    page.getByTestId("native-feedback").locator(".native-feedback-copy"),
  ))
    .toEqual(regularUpperCopyBounds);
  await expect(page.getByTestId("feedback-text"))
    .toHaveText("哦！．．\n這次的戰役結束了，是否要記錄下來．");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-victory-save-offer-portrait.png`,
  });
  await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  const savePromptPortrait = page.getByTestId("feedback-portrait");
  await expect(savePromptPortrait).toHaveAttribute("data-portrait-record", "46");
  const [savePromptPortraitBounds, savePromptCopyBounds] = await Promise.all([
    boundsInLogicalScreen(page, savePromptPortrait),
    boundsInLogicalScreen(
      page,
      page.getByTestId("native-feedback").locator(".native-feedback-copy"),
    ),
  ]);
  expect(savePromptCopyBounds).toMatchObject({ width: 480, height: 84 });
  expect(savePromptCopyBounds.x).toBe(savePromptPortraitBounds.x + savePromptPortraitBounds.width);
  expect(savePromptCopyBounds.y).toBe(savePromptPortraitBounds.y);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-save-prompt-portrait-alignment.png`,
  });
  await page.locator("[data-action=save-no]").click();
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({
    stageId: "stage-04",
    campaignRoute: "stage-05",
  });
  await expect(page.getByText("第 4 關已完成", { exact: true })).toBeVisible();
  await expect(page.getByText(/「遭遇丁塔琪」（stage-05）入口/u)).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage4-stage5-boundary.png`,
  });
});
