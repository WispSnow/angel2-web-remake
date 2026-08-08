import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage5State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  rngState: number;
  rngCalls: number;
  presentationFast: boolean;
  combatSoundEnabled: boolean;
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    life: number;
  }>;
  lastSpecialAction?: {
    actionId: string;
    actorId: string;
    target: { x: number; y: number };
    damage: number;
    experienceGained: number;
    affectedUnits: Array<{
      unitId: string;
      damage: number;
      lifeAfter: number;
      blocked: boolean;
      died: boolean;
    }>;
  };
  specialActionPresentation?: { phase: string; frame: number };
  specialActionPresentationTrace: Array<{
    phase: string;
    frame: number;
    nativeTicks: number;
  }>;
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage5State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage5State | undefined)?.phase === expected,
  phase,
);

test("S05-A/B/C/D: stage 5 enters a one-to-six unit deployment and starts SAY/9", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-cleared&difficulty=0&test=1");
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  expect(await state(page)).toMatchObject({
    stageId: "stage-05",
    phase: "deployment",
    campaignRoute: "stage-05",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveCount(0);

  await page.goto("/?debugScenario=stage-05-deployment&difficulty=0&test=1");
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "遭遇丁塔琪 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／6");
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(8);
  await expect(page.locator(".deployment-open-cell")).toHaveCount(5);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");

  for (const rosterIndex of [1, 2, 3, 4, 5]) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／6");
  await page.getByTestId("deployment-roster-6").click();
  await expect(page.getByTestId("deployment-status")).toContainText("出場人數已滿");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage5-deployment.png`,
  });

  const before = await state(page);
  await page.getByTestId("deployment-finish").click();
  await page.getByTestId("deployment-finish").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "9");
  const opening = await state(page);
  expect(opening).toMatchObject({
    stageId: "stage-05",
    phase: "openingStory",
    activeStoryId: "stage-05-opening-story",
    campaignRoute: "stage-05",
  });
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(6);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(14);
  expect(opening.rngCalls).toBe(before.rngCalls);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage5-opening-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  expect((await state(page)).consumedEventIds).toEqual([
    "stage-05-enter-deployment",
    "stage-05-opening-story",
  ]);
});

test("S05-E/F: either named boss ends the battle while the other remains", async ({ page }) => {
  for (const fixture of [
    { scenario: "stage-05-near-tintachi", targetSlot: 25, survivorSlot: 26 },
    { scenario: "stage-05-near-rhein", targetSlot: 26, survivorSlot: 25 },
  ]) {
    await page.goto(`/?debugScenario=${fixture.scenario}&difficulty=0&test=1`);
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await page.keyboard.press("o");
    await expect(page.getByTestId("objective-panel"))
      .toContainText("擊敗汀塔琪或萊茵任一人");
    await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
    await expect(page.getByTestId("objective-panel")).not.toContainText("麗");
    await page.locator("[data-action=close-objectives]").click();

    const prepared = await state(page);
    expect(prepared.units).toContainEqual(expect.objectContaining({
      side: 2,
      slot: fixture.targetSlot,
      life: 1,
    }));
    expect(prepared.units).toContainEqual(expect.objectContaining({
      side: 2,
      slot: fixture.survivorSlot,
    }));

    await page.keyboard.press(" ");
    await page.getByTestId("unit-command-attack").click();
    const promotion = page.getByTestId("promotion-layer");
    await expect(promotion).toBeVisible();
    await page.getByTestId("promotion-target-cavalry").click();
    await waitForPhase(page, "victoryStory");
    const resolved = await state(page);
    expect(resolved.units.some(({ side, slot }) => side === 2 && slot === fixture.targetSlot))
      .toBe(false);
    expect(resolved.units.some(({ side, slot }) => side === 2 && slot === fixture.survivorSlot))
      .toBe(true);
    await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "10");
  }
});

test("S05-G/H: battle saves use v19 and victory saves enter the live portal scene", async ({ page }) => {
  await page.goto("/?debugScenario=stage-05-player&difficulty=0&test=1");
  const before = await state(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-1").click();
  const battleSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
      version: number;
      contentVersion: string;
      kind: string;
      stageId: string;
      rngState: number;
      rngCalls: number;
    });
  expect(battleSave).toMatchObject({
    version: 19,
    contentVersion: "stage-05-portal-1",
    kind: "battle",
    stageId: "stage-05",
    rngState: before.rngState,
    rngCalls: before.rngCalls,
  });

  await page.goto("/?debugScenario=stage-05-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "10");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-2").click();
  const completedSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.2") ?? "null") as {
      version: number;
      contentVersion: string;
      kind: string;
      stageId: string;
      stageProgress: number;
    });
  expect(completedSave).toMatchObject({
    version: 19,
    contentVersion: "stage-05-portal-1",
    kind: "completed",
    stageId: "stage-42-portal",
    stageProgress: 1000,
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "11");
  expect(await state(page)).toMatchObject({
    stageId: "stage-42-portal",
    phase: "scriptedStory",
    activeStoryId: "stage-42-portal-arrival-story",
  });
});

async function enterPortalLightning(page: Page): Promise<Stage5State> {
  await page.goto("/?debugScenario=stage-42-portal-live&difficulty=0&test=1");
  return advancePortalToLightning(page);
}

async function advancePortalToLightning(page: Page): Promise<Stage5State> {
  await waitForPhase(page, "scriptedStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "11");
  const initial = await state(page);
  expect(initial.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 24, y: 24 });
  expect(initial.units).toContainEqual(expect.objectContaining({ id: "1:23", classId: "empress" }));
  expect(initial.units).toContainEqual(expect.objectContaining({ id: "1:7", classId: "magic-priest" }));

  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "18");
  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "20");
  expect((await state(page)).units.find(({ id }) => id === "1:24"))
    .toMatchObject({ x: 25, y: 24 });
  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-map-combat-phase", "lightningMain");
  return initial;
}

test("S05-I/J: scene 42 commits native 4L, story departures, and the stage-06 route", async ({ page }) => {
  const initial = await enterPortalLightning(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage42-portal-lightning.png`,
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "19");
  const resolved = await state(page);
  expect(resolved.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "story:portal-lightning",
    target: { x: 24, y: 22 },
    experienceGained: 0,
  });
  expect(resolved.lastSpecialAction?.affectedUnits).toHaveLength(6);
  expect(resolved.lastSpecialAction?.affectedUnits).toEqual(expect.arrayContaining([
    expect.objectContaining({ unitId: "1:7", damage: 110 }),
    expect.objectContaining({ unitId: "1:0", damage: 70 }),
    expect.objectContaining({ unitId: "1:24", damage: 50 }),
  ]));
  expect(resolved.specialActionPresentationTrace
    .reduce((total, entry) => total + entry.nativeTicks, 0)).toBe(304);
  expect(resolved.units.some(({ id }) => id === "1:7" || id === "1:23")).toBe(false);
  expect(resolved.units).toHaveLength(8);
  expect(resolved.rngState).toBe(initial.rngState);
  expect(resolved.rngCalls).toBe(initial.rngCalls);
  expect(resolved.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 43 }),
  ]));
  await expect(page.getByTestId("feedback-layer")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage42-portal-departure-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({
    stageId: "stage-42-portal",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-06",
  });
});

test("S05-K/L: completed and reduced-motion portal paths preserve deterministic routing", async ({ page }) => {
  await page.goto("/?debugScenario=stage-42-completed-route&difficulty=0&test=1");
  await waitForPhase(page, "nextStage");
  const completed = await state(page);
  expect(completed).toMatchObject({
    stageId: "stage-42-portal",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-06",
  });
  expect(completed.activeStoryId).toBeUndefined();
  expect(completed.specialActionPresentationTrace).toEqual([]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const initial = await enterPortalLightning(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage42-portal-reduced-motion-lightning.png`,
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "19");
  const reduced = await state(page);
  expect(reduced.specialActionPresentationTrace.map(({ phase }) => phase)).toEqual([
    "lightningMain",
    "lightningHit",
    "lightningCleanup",
  ]);
  expect(reduced.specialActionPresentationTrace
    .reduce((total, entry) => total + entry.nativeTicks, 0)).toBe(304);
  expect(reduced.rngState).toBe(initial.rngState);
  expect(reduced.rngCalls).toBe(initial.rngCalls);
  expect(reduced.units.some(({ id }) => id === "1:7" || id === "1:23")).toBe(false);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage42-portal-reduced-motion-departure.png`,
  });
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "nextStage");
  const reducedFinal = await state(page);
  expect(reducedFinal.campaignRoute).toBe("stage-06");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?debugScenario=stage-42-portal-live&difficulty=0&test=1");
  await waitForPhase(page, "scriptedStory");
  await expect(page.getByTestId("skip-scripted-sequence")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage42-portal-skip-control.png`,
  });
  const beforeSkip = await state(page);
  await page.getByTestId("skip-scripted-sequence").click();
  await waitForPhase(page, "nextStage");
  const skipped = await state(page);
  expect(skipped).toMatchObject({
    stageId: "stage-42-portal",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-06",
    rngState: beforeSkip.rngState,
    rngCalls: beforeSkip.rngCalls,
  });
  expect(skipped.units.map(({ id, x, y, life }) => ({ id, x, y, life })))
    .toEqual(reducedFinal.units.map(({ id, x, y, life }) => ({ id, x, y, life })));
  expect(skipped.lastSpecialAction).toEqual(reducedFinal.lastSpecialAction);
  expect(skipped.consumedEventIds).toEqual(reducedFinal.consumedEventIds);
  expect(skipped.specialActionPresentationTrace).toEqual([]);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S05-L: fast presentation and disabled combat sound preserve the portal result", async ({ page }) => {
  await page.goto("/?debugScenario=stage-05-player&difficulty=0&test=1");
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-settings").click();
  await page.getByTestId("speed-button").click();
  await page.getByTestId("sound-button").click();
  await page.getByTestId("sound-combat-button").click();
  await page.getByTestId("close-sound-settings").click();
  await page.locator("[data-action=close-settings]").click();
  expect(await state(page)).toMatchObject({
    presentationFast: true,
    combatSoundEnabled: false,
  });

  await page.getByRole("button", { name: "直接通關" }).click();
  const initial = await advancePortalToLightning(page);
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "19");
  const resolved = await state(page);
  expect(resolved).toMatchObject({
    presentationFast: true,
    combatSoundEnabled: false,
    rngState: initial.rngState,
    rngCalls: initial.rngCalls,
    lastSpecialAction: {
      actionId: "lightning-4",
      target: { x: 24, y: 22 },
      experienceGained: 0,
    },
  });
  expect(resolved.units.some(({ id }) => id === "1:7" || id === "1:23")).toBe(false);
  await expect(page.locator("#app")).toHaveAttribute("data-combat-effect-count", "0");
  await expect.poll(async () => Number(
    await page.locator("#app").getAttribute("data-combat-effect-request-count"),
  )).toBeGreaterThan(0);

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "nextStage");
  expect((await state(page)).campaignRoute).toBe("stage-06");
});
