import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface DebugState {
  phase: string;
  dialogueIndex: number;
  actionMode: string;
  systemMenuOpen: boolean;
  round: number;
  cursor: { x: number; y: number };
  cameraOrigin: { x: number; y: number };
  battlePresentation: "map" | "full";
  movementPresentation?: {
    unitId: string;
    kind: "scripted" | "player" | "enemy" | "rollback";
    path: Array<{ x: number; y: number }>;
    stepIndex: number;
  };
  reachable: Array<{ x: number; y: number }>;
  units: Array<{ id: string; side: number; x: number; y: number; life: number; experience: number; name: string; portrait: number }>;
}

const debugState = (page: Page) => page.evaluate(() => window.__ANGEL2__?.getState() as DebugState);
const waitForPhase = (page: Page, phase: string) => page.waitForFunction((expected) => window.__ANGEL2__?.getState().phase === expected, phase);
const clickCanvas = (page: Page, x: number, y: number) => page.getByTestId("battle-canvas").click({ position: { x, y } });
const openSystemMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
};
const sampleTrackedUnitPosition = (page: Page) => page.evaluate(async () => {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
  const samples: Array<{ x: number; y: number; cursorX: number; cursorY: number }> = [];
  const movingUnitId = window.__ANGEL2__?.getState().movementPresentation?.unitId;
  while (window.__ANGEL2__?.getState().movementPresentation?.unitId === movingUnitId) {
    const state = window.__ANGEL2__?.getState() as DebugState;
    const x = Number(canvas?.dataset.movingUnitScreenX);
    const y = Number(canvas?.dataset.movingUnitScreenY);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      samples.push({ x, y, cursorX: state.cursor.x, cursorY: state.cursor.y });
    }
    await new Promise((resolve) => window.setTimeout(resolve, 8));
  }
  return samples;
});
const expectStableTracking = (samples: Array<{ x: number; y: number }>) => {
  expect(samples.length).toBeGreaterThan(2);
  const xs = samples.map(({ x }) => x);
  const ys = samples.map(({ y }) => y);
  expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1.5);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.5);
};
const expectCursorLocked = (
  samples: Array<{ cursorX: number; cursorY: number }>,
  destination: { x: number; y: number },
) => {
  expect(samples.every(({ cursorX, cursorY }) => cursorX === destination.x && cursorY === destination.y)).toBe(true);
};

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("S00-A through S00-D: complete playable, defeat/retry, victory and save loop", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?test=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  const chromeImages = page.getByTestId("battle-chrome").locator("img");
  await expect(chromeImages).toHaveCount(9);
  await expect.poll(() => chromeImages.evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  const statueForegrounds = page.getByTestId("battle-foreground").locator("img");
  await expect(statueForegrounds).toHaveCount(2);
  await expect.poll(() => statueForegrounds.evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 32),
  )).toBe(true);
  expect((await debugState(page)).phase).toBe("prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();

  await page.getByTestId("skip-dialogue").click();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "scripted");
  const openingMovement = (await debugState(page)).movementPresentation!;
  expect(openingMovement.path.length).toBeGreaterThan(2);
  expect(openingMovement.stepIndex).toBeLessThan(openingMovement.path.length - 1);
  for (let index = 1; index < openingMovement.path.length; index += 1) {
    const prior = openingMovement.path[index - 1];
    const current = openingMovement.path[index];
    expect(Math.abs(prior.x - current.x) + Math.abs(prior.y - current.y)).toBe(1);
  }
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-path-movement.png" });
  const openingSamples = await sampleTrackedUnitPosition(page);
  expectStableTracking(openingSamples);
  expectCursorLocked(openingSamples, openingMovement.path.at(-1)!);
  await waitForPhase(page, "openingStory");
  let state = await debugState(page);
  expect(state.cameraOrigin).toEqual({ x: 25, y: 23 });
  expect(state.units.filter((unit) => unit.side === 1)).toHaveLength(6);
  expect(state.units.filter((unit) => unit.side === 2)).toHaveLength(10);
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 29, y: 26 });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  // Empty terrain restores the bright tactical side panel and its live unit markers.
  await clickCanvas(page, 420, 45);
  await expect(page.getByTestId("tactical-hud")).toBeVisible();
  await expect(page.locator(".minimap-unit")).toHaveCount(16);
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-unit-life-label-count")).toBe("16");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-count")).toBe("0");
  await expect(page.getByTestId("unit-portrait")).toHaveCount(0);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-player.png" });

  // Hover alone replaces the live markers with the dimmed, overlaid unit detail.
  await page.getByTestId("battle-canvas").hover({ position: { x: 220, y: 177 } });
  await expect(page.getByTestId("unit-portrait")).toBeVisible();
  await expect(page.getByTestId("tactical-hud")).toHaveClass(/under-unit/);
  await expect(page.locator(".minimap-unit")).toHaveCount(0);
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(page.getByTestId("unit-portrait")).toHaveCount(0);
  await expect(page.locator(".minimap-unit")).toHaveCount(16);

  // Persistent text buttons are replaced by the native-style callable menu surface.
  await page.getByTestId("system-menu-button").click();
  await expect(page.getByTestId("system-menu")).toBeVisible();
  const systemMenuContained = await page.getByTestId("system-menu").evaluate((menu) => {
    const panel = menu.getBoundingClientRect();
    return [...menu.querySelectorAll("button")].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= panel.left && bounds.right <= panel.right
        && bounds.top >= panel.top && bounds.bottom <= panel.bottom;
    });
  });
  expect(systemMenuContained).toBe(true);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-system-menu.png" });
  await page.locator("[data-action=close-system-menu]").click();

  // Main verb: select Nia, move one cell, choose ordinary attack and hit an adjacent enemy.
  await clickCanvas(page, 220, 177);
  await expect(page.getByTestId("unit-portrait")).toBeVisible();
  await expect(page.getByTestId("tactical-hud")).toHaveClass(/under-unit/);
  await expect(page.locator(".minimap-unit")).toHaveCount(0);
  await expect(page.getByTestId("exp-bar")).toBeVisible();
  await expect(page.getByTestId("system-menu")).toBeHidden();
  expect((await debugState(page)).actionMode).toBe("move");
  const movementRange = (await debugState(page)).reachable;
  expect(movementRange.length).toBeGreaterThan(1);
  expect(movementRange.every((cell) => Math.abs(cell.x - 29) + Math.abs(cell.y - 26) <= 3)).toBe(true);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-selected-unit.png" });
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await page.locator("[data-action=attack]").click();
  await clickCanvas(page, 140, 177);
  await expect(page.getByTestId("combat-presentation")).toBeHidden();
  state = await debugState(page);
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 28, y: 26 });
  expect(state.units.find((unit) => unit.id === "1:0")!.experience).toBeGreaterThan(0);
  expect(state.units.find((unit) => unit.id === "2:45")!.life).toBeLessThan(160);
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-unit-life-label-count")).toBe("16");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-count")).toBe("1");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-geometry")).toBe("-27,-15,16,14");
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("exp-bar").locator("i")).not.toHaveAttribute("style", "height:0%" );
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-experience-hud.png" });
  await clickCanvas(page, 420, 45);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-acted-marker.png" });

  // On-demand objective layer preserves the battle phase.
  await openSystemMenu(page);
  await page.getByTestId("objectives-button").click();
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  expect((await debugState(page)).phase).toBe("player");
  await page.locator("[data-action=close-objectives]").click();

  // S00-B: behavior 12 moves all enemies, then round 2 dialogue fires.
  await openSystemMenu(page);
  await page.getByTestId("end-turn-button").click();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "enemy");
  const enemyMovement = (await debugState(page)).movementPresentation!;
  const enemySamples = await sampleTrackedUnitPosition(page);
  expectStableTracking(enemySamples);
  expectCursorLocked(enemySamples, enemyMovement.path.at(-1)!);
  await waitForPhase(page, "round2Story");
  state = await debugState(page);
  expect(state.round).toBe(2);
  expect(state.units.find((unit) => unit.id === "2:41")!.y).toBeGreaterThan(39);

  // S00-C: exact defeat wording and fixed-roster retry.
  await page.getByTestId("skip-dialogue").click();
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await expect(page.getByText("妮雅戰敗", { exact: true })).toBeVisible();
  await page.getByTestId("retry-button").click();
  await waitForPhase(page, "openingStory");
  state = await debugState(page);
  expect(state.round).toBe(1);
  expect(state.units.filter((unit) => unit.side === 1)).toHaveLength(6);
  expect(state.units.filter((unit) => unit.side === 2)).toHaveLength(10);

  // S00-D: leave one legal target, finish it through the real attack UI, then save.
  await page.getByTestId("skip-dialogue").click();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await openSystemMenu(page);
  await page.getByTestId("presentation-button").click();
  await page.keyboard.press("Escape");
  expect((await debugState(page)).battlePresentation).toBe("full");
  await clickCanvas(page, 220, 177);
  await clickCanvas(page, 220, 177);
  await page.locator("[data-action=attack]").click();
  await clickCanvas(page, 260, 177);
  await expect(page.getByTestId("combat-presentation")).toBeVisible();
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-combat.png" });
  await waitForPhase(page, "victoryStory");
  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("save-yes").click();
  await expect(page.locator("[data-action=save-slot]")).toHaveCount(5);
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "nextStage");
  await expect(page.getByText("垂直切片完成", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.1") ?? "null"));
  expect(saved).toMatchObject({ format: "ANGEL2-web-save", version: 1, stage: 1, ruleset: "stableRemake" });
  expect(saved.roster).toHaveLength(6);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-complete.png" });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("S00-E: keyboard objectives and responsive reduced-motion layout preserve the 640×350 simulation surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?test=1");
  await page.keyboard.press("Enter");
  expect((await debugState(page)).dialogueIndex).toBe(0);
  await expect(page.locator("#dialogue-text")).toContainText("寬廣走廊");
  await page.keyboard.press("Enter");
  expect((await debugState(page)).dialogueIndex).toBe(1);
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("objective-panel")).toBeHidden();

  const dimensions = await page.getByTestId("battle-canvas").evaluate((canvas) => ({
    logicalWidth: (canvas as HTMLCanvasElement).width,
    logicalHeight: (canvas as HTMLCanvasElement).height,
    visualWidth: canvas.getBoundingClientRect().width,
  }));
  expect(dimensions.logicalWidth).toBe(640);
  expect(dimensions.logicalHeight).toBe(350);
  expect(dimensions.visualWidth).toBeLessThanOrEqual(390);
  expect((await debugState(page)).cameraOrigin).toEqual({ x: 25, y: 23 });
  await page.screenshot({ path: "artifacts/playwright/stage0-mobile.png", fullPage: true });
});

test("S00-F: named cavalry identity and route evacuation are visible end to end", async ({ page }) => {
  await page.goto("/?test=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowLeft");
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowDown");
  await expect(page.getByText("騎兵／哈釘", { exact: true })).toBeVisible();
  await expect(page.getByTestId("unit-portrait")).toHaveAttribute("src", /portrait-hading\.png$/);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-hading.png" });

  await page.evaluate(() => window.__ANGEL2__?.forceEvacuationSetup());
  expect((await debugState(page)).units.filter((unit) => unit.side === 2)).toHaveLength(1);
  await openSystemMenu(page);
  await page.getByTestId("end-turn-button").click();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "enemy");
  const enemyMovement = (await debugState(page)).movementPresentation!;
  expect(enemyMovement.path.length).toBeGreaterThan(1);
  expect(enemyMovement.path.at(-1)).toEqual({ x: 24, y: 47 });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-enemy-route-movement.png" });
  await waitForPhase(page, "victoryStory");
  const evacuated = await debugState(page);
  expect(evacuated.units.filter((unit) => unit.side === 2)).toHaveLength(0);
  expect(evacuated.round).toBe(1);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-evacuation-victory.png" });
});
