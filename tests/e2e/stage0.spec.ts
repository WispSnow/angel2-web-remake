import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const EDGE_PAN_SETTLE_MS = 180;

interface DebugState {
  phase: string;
  dialogueIndex: number;
  actionMode: string;
  selectedId?: string;
  commandMenuKind: "initial" | "postMove";
  commandIndex: number;
  commands: Array<{ id: string; label: string }>;
  systemMenuOpen: boolean;
  systemMenuIndex: number;
  systemCommands: Array<{ id: string; label: string }>;
  settingsOpen: boolean;
  soundSettingsOpen: boolean;
  soundSettingsReturn?: "battle" | "settings";
  musicSettingsOpen: boolean;
  musicSettingsReturn?: "battle" | "settings";
  recordMenuMode?: "load" | "save";
  recordMenuReturn?: "battle" | "system";
  recordMenuIndex: number;
  quitConfirmOpen: boolean;
  quitConfirmIndex: number;
  groupCommandOpen: boolean;
  groupCommandIndex: number;
  groupCommands: Array<{ id: string; label: string }>;
  groupLeaderId?: string;
  retreatConfirmOpen: boolean;
  retreatConfirmIndex: number;
  musicVolume: 0 | 1 | 2 | 3 | 4;
  speechEnabled: boolean;
  movementSoundEnabled: boolean;
  combatSoundEnabled: boolean;
  keySoundEnabled: boolean;
  audioCueLog: Array<{ sequence: number; record: number; reason: string }>;
  rngState: number;
  minimapPreviewOrigin?: { x: number; y: number };
  round: number;
  cursor: { x: number; y: number };
  cameraOrigin: { x: number; y: number };
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  lastCombat?: {
    attackerId: string;
    defenderId: string;
    damage: number;
    counterDamage: number;
    counterOccurred: boolean;
    defenderDied: boolean;
    attackerDied: boolean;
  };
  combatPresentation?: {
    phase:
      | "primaryHit"
      | "primaryDamage"
      | "defenderDeath"
      | "counterHit"
      | "counterDamage"
      | "attackerDeath"
      | "fullOpen"
      | "fullWindup"
      | "fullCharge"
      | "fullImpact"
      | "fullHold"
      | "fullDefenderDeath"
      | "fullCounterWindup"
      | "fullCounterCharge"
      | "fullCounterImpact"
      | "fullCounterHold"
      | "fullAttackerDeath";
    frame: number;
    displayedAttackerLife: number;
    displayedDefenderLife: number;
    fullScene?: {
      battleKey: number;
      t: number;
      showLeftPanel: boolean;
      showRightPanel: boolean;
      showWindow: boolean;
      showScene: boolean;
      camera: number;
      sprites: Array<{
        side: "left" | "right";
        classId: number;
        set: "direct" | "plus50";
        frame: number;
        reaction?: "guard" | "hurt" | "death";
        x: number;
        lift: number;
        mirror: boolean;
        opacity: number;
      }>;
      lance?: { x: number; y: number; frame: number; side: "left" | "right" };
      dust: Array<{ x: number; y: number; phase: number }>;
      damage?: { amount: number; x: number };
    };
  };
  combatPresentationTrace: Array<{
    phase: NonNullable<DebugState["combatPresentation"]>["phase"];
    frame: number;
    displayedAttackerLife: number;
    displayedDefenderLife: number;
    fullScene?: NonNullable<DebugState["combatPresentation"]>["fullScene"];
  }>;
  movementPresentation?: {
    unitId: string;
    kind: "scripted" | "player" | "allyAuto" | "enemy" | "rollback";
    path: Array<{ x: number; y: number }>;
    stepIndex: number;
  };
  reachable: Array<{ x: number; y: number }>;
  targets: Array<{ x: number; y: number }>;
  units: Array<{ id: string; side: number; x: number; y: number; life: number; experience: number; name: string; portrait: number; acted: boolean }>;
}

const debugState = (page: Page) => page.evaluate(() => window.__ANGEL2__?.getState() as DebugState);
const waitForPhase = (page: Page, phase: string) => page.waitForFunction((expected) => window.__ANGEL2__?.getState().phase === expected, phase);
const clickCanvas = (page: Page, x: number, y: number) => page.getByTestId("battle-canvas").click({ position: { x, y } });
const openSystemMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
};
const openSettingsMenu = async (page: Page) => {
  await openSystemMenu(page);
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
};
const closeSettingsMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-menu")).toBeHidden();
  await expect(page.getByTestId("system-menu")).toBeHidden();
};
const setBattlePresentation = async (page: Page, desired: "map" | "full") => {
  if ((await debugState(page)).battlePresentation !== desired) {
    await openSettingsMenu(page);
    await page.getByTestId("presentation-button").click();
    await closeSettingsMenu(page);
  }
  expect((await debugState(page)).battlePresentation).toBe(desired);
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

  await page.goto("/?test=1&skipStartup=1");
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
  const skipDialogue = page.getByTestId("skip-dialogue");
  await expect(skipDialogue).toBeVisible();
  await expect(skipDialogue).toHaveText("跳過");
  const activeDialogueCopy = page.getByTestId("dialogue-window-lower").locator(".dialogue-copy");
  const [copyBounds, skipBounds] = await Promise.all([
    activeDialogueCopy.boundingBox(),
    skipDialogue.boundingBox(),
  ]);
  expect(copyBounds).not.toBeNull();
  expect(skipBounds).not.toBeNull();
  expect(skipBounds!.x).toBeGreaterThan(copyBounds!.x + copyBounds!.width / 2);
  expect(skipBounds!.x + skipBounds!.width).toBeLessThanOrEqual(copyBounds!.x + copyBounds!.width);
  expect(skipBounds!.y).toBeGreaterThan(copyBounds!.y + copyBounds!.height / 2);
  expect(skipBounds!.y + skipBounds!.height).toBeLessThanOrEqual(copyBounds!.y + copyBounds!.height);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-dialogue-skip.png" });
  for (let action = 0; action < 4; action += 1) await page.getByTestId("advance-dialogue").click();
  expect((await debugState(page)).dialogueIndex).toBe(2);
  await expect(skipDialogue).toBeVisible();
  expect(await skipDialogue.evaluate((button) =>
    button.parentElement?.parentElement?.id)).toBe("dialogue-copy-upper");
  await page.waitForTimeout(130);
  const [upperCopyBounds, upperSkipBounds] = await Promise.all([
    page.getByTestId("dialogue-window-upper").locator(".dialogue-copy").boundingBox(),
    skipDialogue.boundingBox(),
  ]);
  expect(upperCopyBounds).not.toBeNull();
  expect(upperSkipBounds).not.toBeNull();
  expect(upperSkipBounds!.x + upperSkipBounds!.width)
    .toBeLessThanOrEqual(upperCopyBounds!.x + upperCopyBounds!.width);
  expect(upperSkipBounds!.y + upperSkipBounds!.height)
    .toBeLessThanOrEqual(upperCopyBounds!.y + upperCopyBounds!.height);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-dialogue-skip-upper.png" });
  const dialoguePortrait = page.getByTestId("dialogue-portrait-composite");
  await expect(dialoguePortrait).toBeVisible();
  await expect(dialoguePortrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(dialoguePortrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect.poll(() => dialoguePortrait.locator(".portrait-mouth").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await expect.poll(async () => Number(await dialoguePortrait.getAttribute("data-talk-count"))).toBeGreaterThan(0);
  await expect(dialoguePortrait).toHaveAttribute("data-mouth-frame", /^[12]$/);
  await dialoguePortrait.evaluate((portrait) => { portrait.setAttribute("data-force-mouth-frame", "2"); });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-dialogue-portrait-talk.png" });
  await dialoguePortrait.screenshot({ path: "artifacts/playwright/stage0-dialogue-portrait-talk-detail.png" });
  if (await dialoguePortrait.getAttribute("data-speaking") === "true") {
    await page.getByTestId("advance-dialogue").click();
  }
  await expect(dialoguePortrait).toHaveAttribute("data-speaking", "false");
  await dialoguePortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-mouth-frame"); });
  await expect(dialoguePortrait).toHaveAttribute("data-mouth-frame", "1");
  await expect.poll(async () => Number(await dialoguePortrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  const firstBlinkDelay = Number(await dialoguePortrait.getAttribute("data-blink-delay-ms"));
  expect(firstBlinkDelay).toBeGreaterThanOrEqual(220);
  expect(firstBlinkDelay).toBeLessThanOrEqual(520);
  await expect.poll(async () => Number(await dialoguePortrait.getAttribute("data-blink-count"))).toBeGreaterThan(1);
  const secondBlinkDelay = Number(await dialoguePortrait.getAttribute("data-blink-delay-ms"));
  expect(secondBlinkDelay).toBeGreaterThanOrEqual(220);
  expect(secondBlinkDelay).toBeLessThanOrEqual(520);
  expect(secondBlinkDelay).not.toBe(firstBlinkDelay);
  await dialoguePortrait.evaluate((portrait) => { portrait.setAttribute("data-force-blink-frame", "3"); });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-dialogue-portrait-blink.png" });
  await dialoguePortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-blink-frame"); });

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

  // Native mouse habit: entering a battle-frame edge pans immediately and
  // staying there repeats, while the logical cursor and simulation stay put.
  const battleCanvas = page.getByTestId("battle-canvas");
  await battleCanvas.hover({ position: { x: 220, y: 177 } });
  const edgePanBaseline = await debugState(page);
  expect(edgePanBaseline).toMatchObject({
    actionMode: "idle",
    cursor: { x: 29, y: 26 },
    cameraOrigin: { x: 25, y: 23 },
  });
  const canvasBounds = await battleCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();

  // The complete visible location banner is part of the native lower-edge
  // hotspot, rather than leaving only its uncovered border pixels usable.
  await battleCanvas.hover({ position: { x: 240, y: 340 } });
  await expect(battleCanvas).toHaveAttribute("data-edge-pan-direction", "0,1");
  await expect.poll(async () => (await debugState(page)).cameraOrigin.y).toBeGreaterThan(edgePanBaseline.cameraOrigin.y);
  const bottomPanned = await debugState(page);
  expect(bottomPanned.cameraOrigin.x).toBe(edgePanBaseline.cameraOrigin.x);
  expect(bottomPanned.cursor).toEqual(edgePanBaseline.cursor);
  expect(bottomPanned.selectedId).toBe(edgePanBaseline.selectedId);
  expect(bottomPanned.actionMode).toBe(edgePanBaseline.actionMode);
  expect(bottomPanned.units).toEqual(edgePanBaseline.units);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-bottom-banner-edge-pan.png" });

  await page.mouse.move(canvasBounds!.x + canvasBounds!.width + 8, canvasBounds!.y + 40);
  await expect(battleCanvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  const cameraAfterLeavingEdge = (await debugState(page)).cameraOrigin;
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  expect((await debugState(page)).cameraOrigin).toEqual(cameraAfterLeavingEdge);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect((await debugState(page))).toMatchObject({
    cursor: edgePanBaseline.cursor,
    cameraOrigin: edgePanBaseline.cameraOrigin,
  });

  await battleCanvas.hover({ position: { x: 5, y: 177 } });
  await expect(battleCanvas).toHaveAttribute("data-edge-pan-direction", "-1,0");
  await expect.poll(async () => (await debugState(page)).cameraOrigin.x).toBeLessThanOrEqual(23);
  const edgePanned = await debugState(page);
  expect(edgePanned.cursor).toEqual(edgePanBaseline.cursor);
  expect(edgePanned.cameraOrigin.y).toBe(edgePanBaseline.cameraOrigin.y);
  expect(edgePanned.selectedId).toBe(edgePanBaseline.selectedId);
  expect(edgePanned.actionMode).toBe(edgePanBaseline.actionMode);
  expect(edgePanned.units).toEqual(edgePanBaseline.units);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-mouse-edge-pan.png" });

  await page.mouse.move(canvasBounds!.x + canvasBounds!.width + 8, canvasBounds!.y + 40);
  await expect(battleCanvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect((await debugState(page))).toMatchObject({
    cursor: edgePanBaseline.cursor,
    cameraOrigin: edgePanBaseline.cameraOrigin,
  });

  // Hover alone replaces the live markers with the dimmed, overlaid unit detail.
  await page.getByTestId("battle-canvas").hover({ position: { x: 220, y: 177 } });
  await expect(page.getByTestId("unit-portrait")).toBeVisible();
  await expect(page.getByTestId("tactical-hud")).toHaveClass(/under-unit/);
  await expect(page.locator(".minimap-unit")).toHaveCount(0);
  const hudPortrait = page.getByTestId("unit-portrait-composite");
  await expect(hudPortrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(hudPortrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect(hudPortrait).toHaveAttribute("data-speaking", "false");
  await expect.poll(async () => Number(await hudPortrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  await hudPortrait.evaluate((portrait) => { portrait.setAttribute("data-force-blink-frame", "3"); });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-portrait-blink.png" });
  await hudPortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-blink-frame"); });
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(page.getByTestId("unit-portrait")).toHaveCount(0);
  await expect(page.locator(".minimap-unit")).toHaveCount(16);

  // Remake information assist: clicking an enemy previews the movement range
  // used by its current stage behavior without opening a command menu.
  await clickCanvas(page, 140, 177);
  const enemyPreview = await debugState(page);
  expect(enemyPreview).toMatchObject({ actionMode: "enemyPreview", selectedId: "2:45" });
  expect(enemyPreview.reachable.length).toBeGreaterThan(1);
  await expect(page.getByTestId("action-menu")).toBeHidden();
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-range-mode", "enemyPreview");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-range-cell-count", String(enemyPreview.reachable.length));
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-cell-count", "0");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-enemy-movement-preview.png" });
  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 420, y: 45 } });
  expect((await debugState(page))).toMatchObject({
    actionMode: "idle",
    selectedId: undefined,
    cursor: enemyPreview.cursor,
    reachable: [],
  });

  // Persistent text buttons are replaced by the native-style callable menu surface.
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("system-menu-button").click();
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await expect(page.locator("[data-system-index]")).toHaveCount(5);
  await expect(page.getByTestId("end-turn-button")).toHaveCount(0);
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
  const cursorBeforeSystemCancel = (await debugState(page)).cursor;
  await page.getByTestId("system-menu").click({ button: "right" });
  await expect(page.getByTestId("system-menu")).toBeHidden();
  expect((await debugState(page)).cursor).toEqual(cursorBeforeSystemCancel);

  // Full-screen combat is the native and Web default. This portion of the
  // scenario explicitly selects map mode because it audits the nine-frame
  // board hit and point-drain trace.
  expect((await debugState(page)).battlePresentation).toBe("full");
  await setBattlePresentation(page, "map");

  // Main verb: selecting Nia opens the profession menu before any movement
  // range is shown, then Move enters range selection.
  await clickCanvas(page, 220, 177);
  await expect(page.getByTestId("unit-portrait")).toBeVisible();
  await expect(page.getByTestId("tactical-hud")).toHaveClass(/under-unit/);
  await expect(page.locator(".minimap-unit")).toHaveCount(0);
  await expect(page.getByTestId("exp-bar")).toBeVisible();
  await expect(page.getByTestId("system-menu")).toBeHidden();
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "initial",
    commandIndex: 0,
    reachable: [],
    commands: [
      { id: "move", label: "移動" },
      { id: "attack", label: "攻擊" },
      { id: "rest", label: "休息" },
    ],
  });
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await expect(page.getByTestId("unit-command-move")).toHaveAttribute("aria-current", "true");
  const commandMenuPlacement = await page.getByTestId("action-menu").evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    const screen = menu.closest("[data-testid=game-screen]")!.getBoundingClientRect();
    const scale = screen.width / 640;
    return {
      leftInsideBattlefield: bounds.left >= screen.left + 40 * scale,
      rightInsideBattlefield: bounds.right <= screen.left + 440 * scale,
      topInsideBattlefield: bounds.top >= screen.top + 23 * scale,
      bottomInsideBattlefield: bounds.bottom <= screen.top + 331 * scale,
    };
  });
  expect(Object.values(commandMenuPlacement).every(Boolean)).toBe(true);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-unit-command-menu.png" });
  await page.getByTestId("unit-command-move").click();
  expect((await debugState(page)).actionMode).toBe("move");
  const movementRange = (await debugState(page)).reachable;
  expect(movementRange.length).toBeGreaterThan(1);
  expect(movementRange.every((cell) => Math.abs(cell.x - 29) + Math.abs(cell.y - 26) <= 3)).toBe(true);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-retained-fraction", "0.25");
  expect(Number(await page.getByTestId("battle-canvas").getAttribute("data-native-dither-cell-count"))).toBeGreaterThan(0);
  // Candidate selection follows pointer hover without committing movement:
  // the native black/white cursor frame moves while the unit stays at origin.
  await page.getByTestId("battle-canvas").hover({ position: { x: 180, y: 177 } });
  expect((await debugState(page))).toMatchObject({
    actionMode: "move",
    cursor: { x: 28, y: 26 },
  });
  expect((await debugState(page)).units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 29, y: 26 });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-move-candidate-hover.png" });
  const beforeMoveCancel = await debugState(page);
  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 180, y: 177 } });
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "initial",
    selectedId: beforeMoveCancel.selectedId,
    cursor: beforeMoveCancel.cursor,
    reachable: [],
  });
  await page.getByTestId("unit-command-move").click();
  await page.getByTestId("battle-canvas").hover({ position: { x: 180, y: 177 } });
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "postMove",
    commands: [
      { id: "attack", label: "攻擊" },
      { id: "end", label: "結束" },
      { id: "undo", label: "返悔" },
    ],
  });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-post-move-command-menu.png" });
  const movedBeforeRollback = await debugState(page);
  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 180, y: 177 } });
  await expect.poll(async () => {
    const unit = (await debugState(page)).units.find(({ id }) => id === "1:0");
    return unit ? { x: unit.x, y: unit.y } : undefined;
  }).toEqual({ x: 29, y: 26 });
  await expect.poll(async () => (await debugState(page)).actionMode).toBe("actionMenu");
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "initial",
    selectedId: movedBeforeRollback.selectedId,
    cursor: { x: 29, y: 26 },
  });
  await page.getByTestId("unit-command-move").click();
  await page.getByTestId("battle-canvas").hover({ position: { x: 180, y: 177 } });
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "postMove",
  });
  await page.locator("[data-action=attack]").click();
  await expect.poll(async () => (await debugState(page)).units.find((unit) => unit.id === "1:0")?.acted).toBe(true);
  await expect(page.getByTestId("combat-presentation")).toBeHidden();
  await page.waitForFunction(() => !window.__ANGEL2__?.getState().combatPresentation);
  state = await debugState(page);
  expect(state.lastCombat?.counterOccurred).toBe(true);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "primaryHit").map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "counterHit").map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "primaryDamage")).toHaveLength(state.lastCombat!.damage);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "counterDamage")).toHaveLength(state.lastCombat!.counterDamage);
  expect(state.combatPresentationTrace.some(({ phase }) => phase === "defenderDeath")).toBe(false);
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 28, y: 26 });
  expect(state.units.find((unit) => unit.id === "1:0")!.experience).toBeGreaterThan(0);
  expect(state.units.find((unit) => unit.id === "2:45")!.life).toBeLessThan(160);
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-unit-life-label-count")).toBe("16");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-count")).toBe("1");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-geometry")).toBe("-22,-15,16,14");
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("exp-bar").locator("i")).not.toHaveAttribute("style", "height:0%" );
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-experience-hud.png" });
  await clickCanvas(page, 420, 45);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-acted-marker.png" });

  // On-demand objective layer preserves the battle phase.
  await openSystemMenu(page);
  await page.getByTestId("system-command-objectives").click();
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  expect((await debugState(page)).phase).toBe("player");
  const cursorBeforeObjectiveCancel = (await debugState(page)).cursor;
  await page.getByTestId("objective-panel").click({ button: "right" });
  await expect(page.getByTestId("objective-panel")).toBeHidden();
  expect((await debugState(page)).cursor).toEqual(cursorBeforeObjectiveCancel);

  // S00-B: the native all-rest group command replaces a side-effect-free
  // generic end turn, then behavior 12 moves every enemy.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    groupCommandOpen: true,
    groupCommandIndex: 0,
    groupCommands: [
      { id: "allRest", label: "全部休息" },
      { id: "followLeader", label: "跟隨主將" },
      { id: "freeAction", label: "自由行動" },
      { id: "retreat", label: "全面徹退" },
    ],
  });
  await expect(page.getByTestId("group-command-followLeader")).toBeDisabled();
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-group-command-menu.png" });
  await page.getByTestId("group-command-allRest").click();
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "enemy");
  const enemyMovement = (await debugState(page)).movementPresentation!;
  expect(enemyMovement.unitId).toBe("2:15");
  const enemySamples = await sampleTrackedUnitPosition(page);
  expectStableTracking(enemySamples);
  expectCursorLocked(enemySamples, enemyMovement.path.at(-1)!);
  await waitForPhase(page, "round2Story");
  state = await debugState(page);
  expect(state.round).toBe(2);
  expect(state.units.find((unit) => unit.id === "2:41")!.y).toBeGreaterThan(39);
  expect(state.units.filter((unit) => unit.side === 1).every((unit) => !unit.acted)).toBe(true);

  // Units that begin round 2 inside an enemy control zone may leave their
  // origin; only control-zone cells entered during the move stop expansion.
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await clickCanvas(page, 220, 177);
  expect((await debugState(page)).actionMode).toBe("actionMenu");
  await page.getByTestId("unit-command-move").click();
  expect((await debugState(page)).actionMode).toBe("move");
  expect((await debugState(page)).reachable.length).toBeGreaterThan(1);
  await page.keyboard.press("Enter");
  expect((await debugState(page)).actionMode).toBe("actionMenu");
  await page.keyboard.press("Enter");
  await clickCanvas(page, 180, 133);
  expect((await debugState(page)).actionMode).toBe("actionMenu");
  await page.getByTestId("unit-command-move").click();
  expect((await debugState(page)).actionMode).toBe("move");
  expect((await debugState(page)).reachable.length).toBeGreaterThan(1);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-round2-zoc-origin.png" });

  // S00-C: exact defeat wording and fixed-roster retry.
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await expect(page.getByTestId("native-feedback")).toBeVisible();
  await page.getByTestId("retry-button").click();
  await expect(page.getByTestId("feedback-text")).toContainText("我太低辜敵人的實力");
  await page.getByTestId("retry-button").click();
  await waitForPhase(page, "openingStory");
  state = await debugState(page);
  expect(state.round).toBe(1);
  expect(state.units.filter((unit) => unit.side === 1)).toHaveLength(6);
  expect(state.units.filter((unit) => unit.side === 2)).toHaveLength(10);

  // S00-D: leave one legal target, finish it through the real attack UI, then save.
  await page.getByTestId("skip-dialogue").click();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await setBattlePresentation(page, "full");
  await expect(page.getByTestId("presentation-button")).toHaveText("戰鬥 全景");
  await clickCanvas(page, 220, 177);
  await clickCanvas(page, 220, 177);
  await page.locator("[data-action=attack]").click();
  await expect(page.getByTestId("combat-presentation")).toBeVisible();
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-combat.png" });
  await waitForPhase(page, "victoryStory");
  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("save-yes").click();
  await expect(page.locator("[data-action=save-slot]")).toHaveCount(5);
  await expect(page.getByTestId("post-save-page")).toHaveText("第 1／4 頁");
  await page.getByTestId("post-save-next-page").click();
  await page.getByTestId("post-save-next-page").click();
  await page.getByTestId("post-save-next-page").click();
  await expect(page.getByTestId("post-save-page")).toHaveText("第 4／4 頁");
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-post-save-page-4.png",
  });
  await page.getByTestId("save-slot-20").click();
  await waitForPhase(page, "nextStage");
  await expect(page.getByText("垂直切片完成", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.20") ?? "null"));
  expect(saved).toMatchObject({ format: "ANGEL2-web-save", version: 2, kind: "completed", stage: 1, ruleset: "stableRemake" });
  expect(saved.roster).toHaveLength(6);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-complete.png" });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("S00-E: keyboard objectives and responsive reduced-motion layout preserve the 640×350 simulation surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?test=1&skipStartup=1");
  await page.keyboard.press(" ");
  expect((await debugState(page)).dialogueIndex).toBe(0);
  await expect(page.locator("#dialogue-text")).toContainText("寬廣走廊");
  await page.keyboard.press(" ");
  expect((await debugState(page)).dialogueIndex).toBe(1);
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  const reducedMotionPortrait = page.getByTestId("unit-portrait-composite");
  await expect(reducedMotionPortrait).toBeVisible();
  await expect.poll(async () => Number(await reducedMotionPortrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  await reducedMotionPortrait.evaluate((portrait) => { portrait.setAttribute("data-force-blink-frame", "3"); });
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-reduced-motion-portrait-blink.png" });
  await reducedMotionPortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-blink-frame"); });

  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("objective-panel")).toBeHidden();

  const inputBaseline = await debugState(page);
  await page.keyboard.press("w");
  await page.keyboard.press("z");
  await page.keyboard.press("a");
  await page.keyboard.press("s");
  await page.keyboard.press("Home");
  await page.keyboard.press("PageDown");
  expect((await debugState(page)).cursor).toEqual(inputBaseline.cursor);

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeHidden();

  await page.keyboard.press("F4");
  await expect(page.getByTestId("retreat-confirm")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("retreat-confirm")).toBeHidden();

  await page.keyboard.press("e");
  await expect(page.getByTestId("sound-settings-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    soundSettingsOpen: true,
    speechEnabled: inputBaseline.speechEnabled,
    movementSoundEnabled: inputBaseline.movementSoundEnabled,
    combatSoundEnabled: inputBaseline.combatSoundEnabled,
    keySoundEnabled: inputBaseline.keySoundEnabled,
  });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sound-settings-menu")).toBeHidden();
  await page.keyboard.press("m");
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  expect((await debugState(page)).musicVolume).toBe(inputBaseline.musicVolume);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("music-settings-menu")).toBeHidden();

  await page.keyboard.press(" ");
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({ actionMode: "actionMenu", commandIndex: 0 });
  await page.keyboard.press("ArrowDown");
  expect((await debugState(page)).commandIndex).toBe(1);
  await expect(page.getByTestId("unit-command-attack")).toHaveAttribute("aria-current", "true");
  const beforeRightCycle = await debugState(page);
  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 220, y: 177 } });
  expect((await debugState(page))).toMatchObject({
    actionMode: "idle",
    cursor: beforeRightCycle.cursor,
  });
  await expect(page.getByTestId("action-menu")).toBeHidden();

  const rightClickFocusOrder = [
    { x: 27, y: 25 },
    { x: 21, y: 27 },
    { x: 28, y: 29 },
    { x: 27, y: 32 },
    { x: 22, y: 37 },
    { x: 29, y: 26 },
  ];
  for (const [index, expectedCursor] of rightClickFocusOrder.entries()) {
    await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 220, y: 177 } });
    await expect.poll(async () => (await debugState(page)).cursor).toEqual(expectedCursor);
    expect((await debugState(page))).toMatchObject({
      actionMode: "idle",
      systemMenuOpen: false,
    });
    if (index === 0) {
      await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-right-click-next-ally.png" });
    }
  }
  const afterRightCycle = await debugState(page);
  expect(afterRightCycle.units).toEqual(beforeRightCycle.units);
  expect(afterRightCycle.rngState).toBe(beforeRightCycle.rngState);

  // Only Esc opens the battle system menu. The keyboard secondary action does
  // not reuse that shortcut; mouse right-click cycles allies only after the
  // currently open action layer has consumed its own cancel.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("system-menu")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();

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
  await page.goto("/?test=1&skipStartup=1");
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
  await page.keyboard.press("F1");
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

test("S00-G: group commands provide allied AI handoff and confirmed retreat", async ({ page }) => {
  const enterPlayerPhase = async () => {
    await page.goto("/?test=1&skipStartup=1");
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "openingStory");
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "player");
  };

  await enterPlayerPhase();
  const initial = await debugState(page);
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-followLeader")).toBeEnabled();
  expect((await debugState(page)).groupLeaderId).toBe("1:0");
  await page.getByTestId("group-command-retreat").click();
  await expect(page.getByTestId("retreat-confirm")).toBeVisible();
  await page.locator("[data-action=retreat-confirm]").click();
  await expect(page.getByTestId("retreat-confirm")).toContainText("哦！．．．要撤退嗎？");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-retreat-confirm.png" });
  await page.locator("[data-action=retreat-cancel]").click();
  expect((await debugState(page))).toMatchObject({
    phase: "player",
    round: initial.round,
    units: initial.units,
    retreatConfirmOpen: false,
  });

  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-retreat").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await waitForPhase(page, "openingStory");
  const retreated = await debugState(page);
  expect(retreated.round).toBe(1);
  expect(retreated.units.filter((unit) => unit.side === 1)).toHaveLength(6);
  expect(retreated.units.filter((unit) => unit.side === 2)).toHaveLength(10);
  expect(retreated.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 29, y: 26 });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.keyboard.press("Tab");
  await page.keyboard.press("F3");
  await waitForPhase(page, "allyAuto");
  await expect.poll(async () => (await debugState(page)).units.some((unit) => unit.side === 1 && unit.acted)).toBe(true);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-free-action.png" });

  await enterPlayerPhase();
  await page.keyboard.press("Tab");
  await page.keyboard.press("F2");
  await waitForPhase(page, "allyAuto");
  await expect.poll(async () => (await debugState(page)).units.find((unit) => unit.id === "1:0")?.acted).toBe(true);
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "allyAuto");
  const alliedMovement = (await debugState(page)).movementPresentation!;
  expect(alliedMovement.path.length).toBeGreaterThan(1);
  for (let index = 1; index < alliedMovement.path.length; index += 1) {
    expect(Math.abs(alliedMovement.path[index - 1].x - alliedMovement.path[index].x)
      + Math.abs(alliedMovement.path[index - 1].y - alliedMovement.path[index].y)).toBe(1);
  }
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-follow-leader.png" });
});

test("S00-H: minimap hover previews and primary click relocates the native viewport", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await clickCanvas(page, 420, 45);
  await expect(page.getByTestId("tactical-minimap")).toBeVisible();

  const baseline = await debugState(page);
  const minimap = page.getByTestId("tactical-minimap");
  await minimap.hover({ position: { x: 121, y: 121 } });
  await expect(page.getByTestId("minimap-preview")).toBeVisible();
  expect((await debugState(page)).minimapPreviewOrigin).toEqual({ x: 36, y: 37 });
  await expect(page.getByTestId("minimap-preview")).toHaveAttribute("style", /left: 108px; top: 111px/);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-minimap-hover-preview.png" });

  await minimap.click({ position: { x: 121, y: 121 } });
  const relocated = await debugState(page);
  expect(relocated.cameraOrigin).toEqual({ x: 36, y: 37 });
  expect(relocated.cursor).toEqual({ x: 40, y: 40 });
  expect(relocated.minimapPreviewOrigin).toBeUndefined();
  expect(relocated.units).toEqual(baseline.units);
  expect(relocated.rngState).toBe(baseline.rngState);

  await page.getByTestId("tactical-minimap").hover({ position: { x: 2, y: 2 } });
  expect((await debugState(page)).minimapPreviewOrigin).toEqual({ x: 0, y: 0 });
  await page.getByTestId("tactical-minimap").click({ position: { x: 2, y: 2 } });
  expect((await debugState(page))).toMatchObject({
    cameraOrigin: { x: 0, y: 0 },
    cursor: { x: 4, y: 3 },
    units: baseline.units,
    rngState: baseline.rngState,
  });
});

test("RHP-01: native side-panel hitboxes share one gated coordinate layer", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  const screen = page.getByTestId("game-screen");
  const system = page.getByTestId("system-menu-button");
  const group = page.getByTestId("group-command-hotspot");
  const allRest = page.getByTestId("all-rest-hotspot");

  // Nia is initially focused, so her detail HUD covers the desk and the
  // underlying object hitboxes must not remain blindly clickable.
  await expect(screen).toHaveAttribute("data-hud-mode", "unit");
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "inactive");
  await expect(system).toBeHidden();
  await expect(group).toBeHidden();
  await expect(allRest).toBeHidden();

  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(screen).toHaveAttribute("data-hud-mode", "tactical");
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "active");

  const logicalBounds = async (locator: Locator) => locator.evaluate((element) => {
    const bounds = getComputedStyle(element);
    return {
      left: Math.round(Number.parseFloat(bounds.left)),
      top: Math.round(Number.parseFloat(bounds.top)),
      width: Math.round(Number.parseFloat(bounds.width)),
      height: Math.round(Number.parseFloat(bounds.height)),
    };
  });
  expect(await logicalBounds(system)).toEqual({ left: 545, top: 6, width: 16, height: 37 });
  expect(await logicalBounds(group)).toEqual({ left: 490, top: 36, width: 24, height: 25 });
  expect(await logicalBounds(allRest)).toEqual({ left: 490, top: 61, width: 26, height: 24 });

  await system.hover();
  await screen.screenshot({ path: "artifacts/playwright/stage0-side-panel-hotspot-foundation.png" });
  await system.click();
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "inactive");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();

  await group.click();
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "inactive");
});

test("RHP-02: objective and battle-animation objects reuse canonical presentation actions", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });

  const before = await debugState(page);
  const objective = page.getByTestId("objectives-hotspot");
  const battleAnimation = page.getByTestId("battle-presentation-hotspot");
  const battleAnimationArt = page.getByTestId("tactical-panel-battleAnimation-state");
  await expect(objective).toBeVisible();
  await expect(battleAnimation).toBeVisible();
  await expect(battleAnimationArt).toHaveAttribute("data-state", "on");
  await expect(battleAnimationArt).toHaveAttribute("data-native-frame", "21");

  await objective.hover();
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-objective-hotspot.png",
  });
  await objective.click();
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  const objectiveState = await debugState(page);
  expect(objectiveState.units).toEqual(before.units);
  expect(objectiveState.rngState).toBe(before.rngState);
  expect(objectiveState.cursor).toEqual(before.cursor);
  expect(objectiveState.cameraOrigin).toEqual(before.cameraOrigin);
  await page.getByTestId("objective-panel").click({ button: "right" });
  await expect(page.getByTestId("objective-panel")).toBeHidden();

  await battleAnimation.click();
  let toggled = await debugState(page);
  expect(toggled.battlePresentation).toBe("map");
  expect(toggled.units).toEqual(before.units);
  expect(toggled.rngState).toBe(before.rngState);
  expect(toggled.cursor).toEqual(before.cursor);
  expect(toggled.cameraOrigin).toEqual(before.cameraOrigin);
  await expect(battleAnimationArt).toHaveAttribute("data-state", "off");
  await expect(battleAnimationArt).toHaveAttribute("data-native-frame", "20");
  await battleAnimation.click();
  toggled = await debugState(page);
  expect(toggled.battlePresentation).toBe("full");
  expect(toggled.units).toEqual(before.units);
  expect(toggled.rngState).toBe(before.rngState);
  await expect(battleAnimationArt).toHaveAttribute("data-state", "on");
  await expect(battleAnimationArt).toHaveAttribute("data-native-frame", "21");
});

test("RHP-03: desk save and load objects preserve record data and return origin", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });

  const initial = await debugState(page);
  const saveHotspot = page.getByTestId("save-hotspot");
  const loadHotspot = page.getByTestId("load-hotspot");
  await expect(saveHotspot).toBeVisible();
  await expect(loadHotspot).toBeVisible();

  await saveHotspot.click();
  await expect(page.getByTestId("record-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({ recordMenuMode: "save", recordMenuReturn: "battle" });
  await expect(page.locator("[data-action=record-slot]")).toHaveCount(5);
  await expect(page.getByTestId("record-page")).toHaveText("第 1／4 頁");
  await expect(page.getByTestId("record-slot-1")).toContainText("此處沒有記錄");
  await page.getByTestId("record-next-page").click();
  await page.getByTestId("record-next-page").click();
  await page.getByTestId("record-next-page").click();
  await expect(page.getByTestId("record-page")).toHaveText("第 4／4 頁");
  await expect(page.getByTestId("record-slot-20")).toContainText("此處沒有記錄");
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-record-page-4.png",
  });
  await page.getByTestId("record-slot-20").click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.20") ?? "null"));
  expect(saved).toMatchObject({
    format: "ANGEL2-web-save",
    version: 2,
    kind: "battle",
    stage: 0,
    rngState: initial.rngState,
    battle: {
      round: initial.round,
      cursor: initial.cursor,
      cameraOrigin: initial.cameraOrigin,
      units: initial.units,
    },
  });

  await loadHotspot.click();
  expect((await debugState(page))).toMatchObject({ recordMenuMode: "load", recordMenuReturn: "battle" });
  await page.locator("[data-action=close-record-menu]").click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
  await expect(page.getByTestId("system-menu")).toBeHidden();

  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-move").click();
  await clickCanvas(page, 180, 177);
  await page.getByTestId("unit-command-end").click();
  expect((await debugState(page)).units).not.toEqual(initial.units);
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await loadHotspot.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("record-page")).toHaveText("第 4／4 頁");
  await page.getByTestId("record-slot-20").click();
  const restored = await debugState(page);
  expect(restored.round).toBe(initial.round);
  expect(restored.units).toEqual(initial.units);
  expect(restored.rngState).toBe(initial.rngState);
  expect(restored.cursor).toEqual(initial.cursor);
  expect(restored.cameraOrigin).toEqual(initial.cameraOrigin);
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await saveHotspot.hover();
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-record-hotspots.png",
  });
});

test("RHP-04: grid, edge-scroll and portrait objects control persistent presentation only", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.presentation.v1"));
  await page.reload();
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await canvas.hover({ position: { x: 420, y: 45 } });

  const baseline = await debugState(page);
  expect(baseline).toMatchObject({
    battlePresentation: "full",
    gridEnabled: false,
    edgeScrollEnabled: true,
    portraitsEnabled: true,
  });
  await expect(canvas).toHaveAttribute("data-grid-enabled", "false");
  await expect(canvas).toHaveAttribute("data-grid-line-count", "0");

  const grid = page.getByTestId("grid-hotspot");
  const edgeScroll = page.getByTestId("edge-scroll-hotspot");
  const portraits = page.getByTestId("portraits-hotspot");
  const gridArt = page.getByTestId("tactical-panel-grid-state");
  const edgeScrollArt = page.getByTestId("tactical-panel-edgeScroll-state");
  const portraitsArt = page.getByTestId("tactical-panel-portraits-state");
  const battleAnimationArt = page.getByTestId("tactical-panel-battleAnimation-state");
  await expect(gridArt).toHaveAttribute("data-native-frame", "24");
  await expect(edgeScrollArt).toHaveAttribute("data-native-frame", "27");
  await expect(portraitsArt).toHaveAttribute("data-native-frame", "31");
  await expect(battleAnimationArt).toHaveAttribute("data-native-frame", "21");
  await grid.click();
  expect((await debugState(page)).gridEnabled).toBe(true);
  await expect(canvas).toHaveAttribute("data-grid-enabled", "true");
  await expect(canvas).toHaveAttribute("data-grid-line-count", "102");
  await expect(gridArt).toHaveAttribute("data-state", "on");
  await expect(gridArt).toHaveAttribute("data-native-frame", "25");
  await grid.hover();
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-grid-enabled.png",
  });

  await edgeScroll.click();
  expect((await debugState(page)).edgeScrollEnabled).toBe(false);
  await expect(canvas).toHaveAttribute("data-edge-scroll-enabled", "false");
  await expect(edgeScrollArt).toHaveAttribute("data-state", "off");
  await expect(edgeScrollArt).toHaveAttribute("data-native-frame", "26");
  const cameraBeforeDisabledEdge = (await debugState(page)).cameraOrigin;
  await canvas.hover({ position: { x: 5, y: 177 } });
  await expect(canvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  expect((await debugState(page)).cameraOrigin).toEqual(cameraBeforeDisabledEdge);
  await edgeScroll.click();
  await expect(canvas).toHaveAttribute("data-edge-scroll-enabled", "true");
  await edgeScroll.click();
  await expect(canvas).toHaveAttribute("data-edge-scroll-enabled", "false");
  await expect(edgeScrollArt).toHaveAttribute("data-native-frame", "26");

  await portraits.click();
  expect((await debugState(page)).portraitsEnabled).toBe(false);
  await expect(portraitsArt).toHaveAttribute("data-state", "off");
  await expect(portraitsArt).toHaveAttribute("data-native-frame", "30");
  await canvas.hover({ position: { x: 220, y: 177 } });
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-hud-mode", "tactical");
  await expect(page.getByTestId("unit-detail")).toHaveCount(0);
  await expect(portraits).toBeVisible();
  await portraits.click();
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-hud-mode", "unit");
  await expect(page.getByTestId("unit-detail")).toBeVisible();
  await canvas.hover({ position: { x: 420, y: 45 } });
  await portraits.click();
  expect((await debugState(page)).portraitsEnabled).toBe(false);

  await page.getByTestId("battle-presentation-hotspot").click();
  expect((await debugState(page)).battlePresentation).toBe("map");
  await expect(battleAnimationArt).toHaveAttribute("data-state", "off");
  await expect(battleAnimationArt).toHaveAttribute("data-native-frame", "20");
  const afterToggles = await debugState(page);
  expect(afterToggles.units).toEqual(baseline.units);
  expect(afterToggles.rngState).toBe(baseline.rngState);
  expect(afterToggles.cameraOrigin).toEqual(baseline.cameraOrigin);
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-toggle-visuals.png",
  });

  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("presentation-button")).toHaveText("戰鬥 地圖");
  await expect(page.getByTestId("grid-button")).toHaveText("方格 開");
  await expect(page.getByTestId("edge-scroll-button")).toHaveText("捲動 關");
  await expect(page.getByTestId("portraits-button")).toHaveText("圖像 關");

  await page.reload();
  expect(await debugState(page)).toMatchObject({
    battlePresentation: "map",
    gridEnabled: true,
    edgeScrollEnabled: false,
    portraitsEnabled: false,
  });
});

test("RHP-05: sound desk object exposes four persistent request gates", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.sound.v1"));
  await page.reload();
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-speech-effect-count", "0");
  await expect(app).toHaveAttribute("data-movement-effect-count", "0");
  await expect(app).toHaveAttribute("data-combat-effect-count", "0");
  await expect(app).toHaveAttribute("data-key-effect-count", "0");

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });

  const baseline = await debugState(page);
  expect(baseline).toMatchObject({
    speechEnabled: true,
    movementSoundEnabled: true,
    combatSoundEnabled: true,
    keySoundEnabled: true,
  });
  expect(Number(await app.getAttribute("data-movement-effect-count"))).toBeGreaterThan(0);

  const soundHotspot = page.getByTestId("sound-hotspot");
  await expect(soundHotspot).toBeVisible();
  await soundHotspot.click();
  await expect(page.getByTestId("sound-settings-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    soundSettingsOpen: true,
    soundSettingsReturn: "battle",
  });
  await expect(page.getByTestId("sound-speech-button")).toHaveText("說話 開");
  await expect(page.getByTestId("sound-movement-button")).toHaveText("移動 開");
  await expect(page.getByTestId("sound-combat-button")).toHaveText("戰鬥 開");
  await expect(page.getByTestId("sound-key-button")).toHaveText("按鍵 開");
  await page.keyboard.press("m");
  await page.keyboard.press("Tab");
  await page.keyboard.press("o");
  await expect(page.getByTestId("sound-settings-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    musicVolume: baseline.musicVolume,
    groupCommandOpen: false,
    objectiveOpen: false,
  });
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-sound-settings.png",
  });

  await page.getByTestId("sound-speech-button").click();
  await page.getByTestId("sound-combat-button").click();
  await page.getByTestId("sound-key-button").click();
  const keyCountAfterDisable = Number(await app.getAttribute("data-key-effect-count"));
  await page.getByTestId("sound-movement-button").click();
  await page.getByTestId("sound-movement-button").click();
  expect(Number(await app.getAttribute("data-key-effect-count"))).toBe(keyCountAfterDisable);

  const afterToggles = await debugState(page);
  expect(afterToggles).toMatchObject({
    speechEnabled: false,
    movementSoundEnabled: true,
    combatSoundEnabled: false,
    keySoundEnabled: false,
  });
  expect(afterToggles.units).toEqual(baseline.units);
  expect(afterToggles.rngState).toBe(baseline.rngState);
  expect(afterToggles.cursor).toEqual(baseline.cursor);
  expect(afterToggles.cameraOrigin).toEqual(baseline.cameraOrigin);

  await page.getByTestId("close-sound-settings").click();
  await expect(page.getByTestId("sound-settings-menu")).toBeHidden();
  await expect(page.getByTestId("system-menu")).toBeHidden();
  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  await page.getByTestId("sound-button").click();
  expect((await debugState(page)).soundSettingsReturn).toBe("settings");
  await page.getByTestId("close-sound-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await closeSettingsMenu(page);

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.preferences.sound.v1") ?? "null"))).toEqual({
    speechEnabled: false,
    movementSoundEnabled: true,
    combatSoundEnabled: false,
    keySoundEnabled: false,
  });

  await page.reload();
  expect(await debugState(page)).toMatchObject({
    speechEnabled: false,
    movementSoundEnabled: true,
    combatSoundEnabled: false,
    keySoundEnabled: false,
  });
  await expect(app).toHaveAttribute("data-speech-effect-count", "0");
  await expect(app).toHaveAttribute("data-key-effect-count", "0");
  await expect.poll(async () => Number(await app.getAttribute("data-speech-effect-request-count"))).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-speech-effect-count", "0");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  expect(Number(await app.getAttribute("data-key-effect-request-count"))).toBeGreaterThan(0);
  expect(Number(await app.getAttribute("data-movement-effect-count"))).toBeGreaterThan(0);
  expect(Number(await app.getAttribute("data-movement-effect-request-count"))).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-speech-effect-count", "0");
  await expect(app).toHaveAttribute("data-key-effect-count", "0");

  await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  const targeting = await debugState(page);
  const target = targeting.targets[0];
  await clickCanvas(
    page,
    40 + (target.x - targeting.cameraOrigin.x) * 40 + 20,
    23 + (target.y - targeting.cameraOrigin.y) * 44 + 22,
  );
  await page.waitForFunction(() => window.__ANGEL2__?.getState().audioCueLog.some(
    ({ reason }: { reason: string }) => reason.startsWith("full-"),
  ));
  expect((await debugState(page)).audioCueLog.some(({ reason }) => reason.startsWith("full-"))).toBe(true);
  expect(Number(await app.getAttribute("data-combat-effect-request-count"))).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-combat-effect-count", "0");
});

test("RHP-06: music desk object selects five persistent levels without restarting transport", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.music.v1"));
  await page.reload();
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-music-volume-level", "4");
  await expect(app).toHaveAttribute("data-music-volume", "0.32");

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/6", { timeout: 10_000 });
  await expect(app).toHaveAttribute("data-music-part", "loop");
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });

  const baseline = await debugState(page);
  expect(baseline.musicVolume).toBe(4);
  const musicHotspot = page.getByTestId("music-hotspot");
  await expect(musicHotspot).toBeVisible();
  await musicHotspot.click();
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    musicSettingsOpen: true,
    musicSettingsReturn: "battle",
  });
  await expect(page.getByTestId("music-volume-4")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-music-settings.png",
  });

  const trackBeforeLevels = await app.getAttribute("data-music-track");
  const partBeforeLevels = await app.getAttribute("data-music-part");
  const playRequestsBeforeLevels = await app.getAttribute("data-music-play-request-count");
  const expectStableTransport = async (level: 0 | 2 | 3, gain: string) => {
    await page.getByTestId(`music-volume-${level}`).click();
    expect((await debugState(page)).musicVolume).toBe(level);
    await expect(app).toHaveAttribute("data-music-volume-level", String(level));
    await expect(app).toHaveAttribute("data-music-volume", gain);
    await expect(app).toHaveAttribute("data-music-playing", "true");
    await expect(app).toHaveAttribute("data-music-track", trackBeforeLevels ?? "");
    await expect(app).toHaveAttribute("data-music-part", partBeforeLevels ?? "");
    await expect(app).toHaveAttribute("data-music-play-request-count", playRequestsBeforeLevels ?? "");
  };
  await expectStableTransport(2, "0.16");
  await expectStableTransport(0, "0");
  await expectStableTransport(3, "0.24");

  const afterLevels = await debugState(page);
  expect(afterLevels.units).toEqual(baseline.units);
  expect(afterLevels.rngState).toBe(baseline.rngState);
  expect(afterLevels.cursor).toEqual(baseline.cursor);
  expect(afterLevels.cameraOrigin).toEqual(baseline.cameraOrigin);
  await page.getByTestId("close-music-settings").click();
  await expect(page.getByTestId("music-settings-menu")).toBeHidden();

  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("music-button")).toHaveText("音樂 3");
  await page.getByTestId("music-button").click();
  expect((await debugState(page)).musicSettingsReturn).toBe("settings");
  await page.getByTestId("close-music-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await closeSettingsMenu(page);

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.preferences.music.v1") ?? "null"))).toEqual({
    musicVolume: 3,
  });
  await page.reload();
  expect((await debugState(page)).musicVolume).toBe(3);
  await expect(app).toHaveAttribute("data-music-volume-level", "3");
  await expect(app).toHaveAttribute("data-music-volume", "0.24");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.keyboard.press("m");
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  await expect(page.getByTestId("music-volume-3")).toHaveAttribute("aria-checked", "true");
});

test("RHP-07: all twelve desk objects are discoverable, accessible and coordinate-operable", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });

  const screen = page.getByTestId("game-screen");
  const tooltip = page.getByTestId("side-panel-tooltip");
  const hotspots = [
    { id: "save", testId: "save-hotspot", label: "儲存記錄", bounds: [489, 88, 32, 35] },
    { id: "load", testId: "load-hotspot", label: "讀取記錄", bounds: [526, 110, 45, 27] },
    { id: "grid", testId: "grid-hotspot", label: "地圖方格", bounds: [602, 65, 25, 20] },
    { id: "sound", testId: "sound-hotspot", label: "音效開關", bounds: [587, 33, 26, 21] },
    { id: "edgeScroll", testId: "edge-scroll-hotspot", label: "地圖捲動", bounds: [580, 107, 28, 31] },
    { id: "portraits", testId: "portraits-hotspot", label: "人物圖像", bounds: [611, 108, 17, 25] },
    { id: "battleAnimation", testId: "battle-presentation-hotspot", label: "戰鬥動畫", bounds: [504, 8, 36, 39] },
    { id: "music", testId: "music-hotspot", label: "音樂開關", bounds: [524, 77, 42, 28] },
    { id: "groupCommands", testId: "group-command-hotspot", label: "集體命令", bounds: [490, 36, 24, 25] },
    { id: "objectives", testId: "objectives-hotspot", label: "勝利條件", bounds: [571, 75, 30, 12] },
    { id: "allRest", testId: "all-rest-hotspot", label: "全部休息", bounds: [490, 61, 26, 24] },
    { id: "systemMenu", testId: "system-menu-button", label: "遊戲功能", bounds: [545, 6, 16, 37] },
  ] as const;

  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "active");
  await expect(tooltip).toBeHidden();
  for (const hotspot of hotspots) {
    const button = page.getByTestId(hotspot.testId);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-label", hotspot.label);
    expect(await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        Math.round(Number.parseFloat(style.left)),
        Math.round(Number.parseFloat(style.top)),
        Math.round(Number.parseFloat(style.width)),
        Math.round(Number.parseFloat(style.height)),
      ];
    })).toEqual(hotspot.bounds);
  }
  await expect(page.getByTestId("grid-hotspot")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("edge-scroll-hotspot")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("portraits-hotspot")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("battle-presentation-hotspot")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sound-hotspot")).toHaveAttribute("aria-haspopup", "dialog");
  await expect(page.getByTestId("music-hotspot")).toHaveAttribute("aria-haspopup", "dialog");
  await expect(page.getByTestId("system-menu-button")).toHaveAttribute("aria-haspopup", "menu");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-cursor-frame-style", "native-bevel");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-cursor-frame-shadow",
    "palette-0:40x44:2px",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-cursor-frame-highlight",
    "palette-15:39x43:1px",
  );

  await page.getByTestId("system-menu-button").hover();
  expect(await page.getByTestId("system-menu-button").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      backgroundColor: style.backgroundColor,
      outlineStyle: style.outlineStyle,
    };
  })).toEqual({
    borderWidth: "1px",
    borderColor: "rgba(255, 229, 107, 0.38)",
    backgroundColor: "rgba(255, 229, 107, 0.04)",
    outlineStyle: "none",
  });
  await page.waitForTimeout(250);
  await expect(tooltip).toBeHidden();
  await expect(tooltip).toHaveText("遊戲功能", { timeout: 1_000 });
  await expect(tooltip).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-side-panel-discovery-hint.png",
  });
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(tooltip).toBeHidden();

  await page.getByTestId("save-hotspot").focus();
  await expect(tooltip).toHaveText("儲存記錄");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("load-hotspot")).toBeFocused();
  await expect(tooltip).toHaveText("讀取記錄");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("record-menu")).toBeHidden();

  const logicalClick = async (x: number, y: number) => {
    const box = await screen.boundingBox();
    if (!box) throw new Error("logical screen is not visible");
    await page.mouse.click(
      box.x + x * box.width / 640,
      box.y + y * box.height / 350,
    );
  };
  const center = (id: (typeof hotspots)[number]["id"]) => {
    const hotspot = hotspots.find((entry) => entry.id === id);
    if (!hotspot) throw new Error(`unknown hotspot ${id}`);
    const [left, top, width, height] = hotspot.bounds;
    return [left + width / 2, top + height / 2] as const;
  };
  const clickHotspot = async (id: (typeof hotspots)[number]["id"]) => {
    const [x, y] = center(id);
    await logicalClick(x, y);
  };

  const baseline = await debugState(page);
  await clickHotspot("save");
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await clickHotspot("load");
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await page.keyboard.press("Enter");

  await clickHotspot("grid");
  expect((await debugState(page)).gridEnabled).toBe(true);
  await clickHotspot("grid");
  await clickHotspot("sound");
  await expect(page.getByTestId("sound-settings-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await clickHotspot("edgeScroll");
  expect((await debugState(page)).edgeScrollEnabled).toBe(false);
  await clickHotspot("edgeScroll");
  await clickHotspot("portraits");
  expect((await debugState(page)).portraitsEnabled).toBe(false);
  await clickHotspot("portraits");
  await clickHotspot("battleAnimation");
  expect((await debugState(page)).battlePresentation).toBe("map");
  await clickHotspot("battleAnimation");
  await clickHotspot("music");
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await clickHotspot("groupCommands");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await clickHotspot("objectives");
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  await page.keyboard.press("Enter");
  await clickHotspot("systemMenu");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.keyboard.press("Enter");

  const afterNonRuleActions = await debugState(page);
  expect(afterNonRuleActions.units).toEqual(baseline.units);
  expect(afterNonRuleActions.rngState).toBe(baseline.rngState);
  expect(afterNonRuleActions.cursor).toEqual(baseline.cursor);
  expect(afterNonRuleActions.cameraOrigin).toEqual(baseline.cameraOrigin);
  expect(afterNonRuleActions).toMatchObject({
    gridEnabled: false,
    edgeScrollEnabled: true,
    portraitsEnabled: true,
    battlePresentation: "full",
  });

  await clickHotspot("allRest");
  await expect.poll(async () => (await debugState(page)).phase).not.toBe("player");
});

test("S00-I: native range dither and ordinary attack target-count branches", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  // Nia has no adjacent target at the untouched opening: remain in the
  // profession menu and restore the neutral fully bright map.
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  expect((await debugState(page))).toMatchObject({ actionMode: "actionMenu", targets: [] });
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-cell-count", "0");
  await page.keyboard.press("Enter");

  // Two legal targets enter manual target selection. Only those two cells
  // remain bright; every other visible cell uses the exact 1/4 dither mask.
  await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  const multiTarget = await debugState(page);
  expect(multiTarget.actionMode).toBe("target");
  expect(multiTarget.targets).toHaveLength(2);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-cell-count", "68");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-retained-fraction", "0.25");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-target-dither.png" });
  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 220, y: 177 } });
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    selectedId: multiTarget.selectedId,
    cursor: multiTarget.cursor,
    targets: [],
  });
  await page.getByTestId("unit-command-attack").click();
  const restoredTargeting = await debugState(page);
  expect(restoredTargeting.actionMode).toBe("target");
  expect(restoredTargeting.targets).toHaveLength(2);
  const target = restoredTargeting.targets[0];
  await clickCanvas(
    page,
    40 + (target.x - restoredTargeting.cameraOrigin.x) * 40 + 20,
    23 + (target.y - restoredTargeting.cameraOrigin.y) * 44 + 22,
  );
  await expect.poll(async () => (await debugState(page)).units.find((unit) => unit.id === "1:0")?.acted).toBe(true);
  expect((await debugState(page)).actionMode).toBe("idle");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-native-dither-cell-count", "0");
});

test("S00-J: native map hit, point-drain and death descriptors preserve the board erase boundary", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await setBattlePresentation(page, "map");

  const setup = await debugState(page);
  const finalEnemy = setup.units.find((unit) => unit.side === 2)!;
  expect(finalEnemy.life).toBe(1);
  expect(setup.battlePresentation).toBe("map");

  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  const canvas = page.getByTestId("battle-canvas");

  await expect(canvas).toHaveAttribute("data-map-combat-phase", "primaryHit");
  await expect(canvas).toHaveAttribute("data-map-combat-target", finalEnemy.id);
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "1");
  await expect(canvas).toHaveAttribute("data-combat-shadow-unit-count", "1");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-map-hit-native-frame.png" });

  await page.waitForFunction(() => {
    const canvasElement = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return canvasElement?.dataset.mapCombatPhase === "defenderDeath"
      && canvasElement.dataset.mapCombatFrame === "3";
  });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "6");
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "7");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-map-death-before-erase.png" });

  await page.waitForFunction(() => {
    const canvasElement = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return canvasElement?.dataset.mapCombatPhase === "defenderDeath"
      && Number(canvasElement.dataset.mapCombatFrame) >= 6
      && Number(canvasElement.dataset.mapCombatFrame) < 14
      && Number(canvasElement.dataset.mapCombatEffectTileCount) > 0;
  });
  const afterErase = await canvas.evaluate((canvasElement) => ({
    phase: canvasElement.dataset.mapCombatPhase,
    frame: Number(canvasElement.dataset.mapCombatFrame),
    effectTiles: Number(canvasElement.dataset.mapCombatEffectTileCount),
    visibleUnits: Number(canvasElement.dataset.unitLifeLabelCount),
  }));
  expect(afterErase.phase).toBe("defenderDeath");
  expect(afterErase.frame).toBeGreaterThanOrEqual(6);
  expect(afterErase.frame).toBeLessThan(14);
  expect(afterErase.effectTiles).toBeGreaterThan(0);
  expect(afterErase.visibleUnits).toBe(6);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-map-death-after-erase.png" });

  await waitForPhase(page, "victoryStory");
  const resolved = await debugState(page);
  expect(resolved.lastCombat).toMatchObject({
    defenderId: finalEnemy.id,
    counterOccurred: false,
    defenderDied: true,
  });
  expect(resolved.combatPresentationTrace.filter(({ phase }) => phase === "primaryHit").map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(resolved.combatPresentationTrace.filter(({ phase }) => phase === "primaryDamage")).toHaveLength(1);
  expect(resolved.combatPresentationTrace.filter(({ phase }) => phase === "defenderDeath").map(({ frame }) => frame)).toEqual(
    Array.from({ length: 15 }, (_, frame) => frame),
  );
  expect(resolved.combatPresentationTrace.some(({ phase }) => phase.startsWith("counter"))).toBe(false);
});

test("S00-K: native full-screen records, step tables and death sequence preserve map-mode results", async ({ page }) => {
  // The full-screen presentation is a measured wall-clock timeline, so the
  // runs that inspect its individual beats use `slowFull` to play it at native
  // speed instead of the compressed test-mode rate.
  const enterPlayableBattle = async ({ nativeSpeed = false } = {}) => {
    await page.goto(`/?test=1&skipStartup=1${nativeSpeed ? "&slowFull=1" : ""}`);
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "openingStory");
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "player");
  };
  const attackFirstForcedTarget = async () => {
    await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
    await page.keyboard.press(" ");
    await page.getByTestId("unit-command-attack").click();
    const targeting = await debugState(page);
    const target = targeting.targets[0];
    await clickCanvas(
      page,
      40 + (target.x - targeting.cameraOrigin.x) * 40 + 20,
      23 + (target.y - targeting.cameraOrigin.y) * 44 + 22,
    );
  };

  await enterPlayableBattle();
  await setBattlePresentation(page, "map");
  await attackFirstForcedTarget();
  // The attack submits the last manual ally and asynchronously starts the
  // enemy route phase. Compare both presentation modes at the same stable
  // round boundary instead of racing different animation durations.
  await waitForPhase(page, "round2Story");
  const mapResolved = await debugState(page);

  await enterPlayableBattle({ nativeSpeed: true });
  await setBattlePresentation(page, "full");
  await attackFirstForcedTarget();

  const fullLayer = page.getByTestId("combat-presentation");
  // The window opens before the scene: panels first, then the framed stage.
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.fullScene?.showScene === true);
  await expect(fullLayer).toHaveAttribute("data-full-left-record", "M_00/50");
  await expect(fullLayer).toHaveAttribute("data-full-right-record", "Y_00/0");
  await expect(page.getByTestId("full-combat-background")).toHaveAttribute("src", /stage0-background/);
  await expect(page.getByTestId("full-left-status")).toBeVisible();
  await expect(page.getByTestId("full-right-status")).toBeVisible();
  await expect(page.getByTestId("full-combat-window")).toBeVisible();

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullImpact");
  await expect(fullLayer).toHaveAttribute("data-full-combat-phase", "fullImpact");
  await expect(page.getByTestId("full-actor-sprite")).toBeVisible();
  await expect(page.getByTestId("full-victim-sprite")).toBeVisible();
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "1");
  await expect(page.getByTestId("full-damage-number")).toBeVisible();
  const primaryImpact = (await debugState(page)).combatPresentation?.fullScene;
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "12");
  const primaryApex = (await debugState(page)).combatPresentation?.fullScene;
  expect(primaryApex?.sprites.find(({ set }) => set === "direct")?.x)
    .toBe(primaryImpact?.sprites.find(({ set }) => set === "direct")?.x);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-primary-recoil-apex.png" });

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullHold");
  await expect(page.getByTestId("full-actor-sprite")).toBeHidden();
  await expect(page.getByTestId("full-victim-sprite")).toBeVisible();
  const primaryHold = (await debugState(page)).combatPresentation?.fullScene;
  expect(primaryHold?.camera).toBeGreaterThan(primaryImpact?.camera ?? Number.POSITIVE_INFINITY);
  const impactVictimX = primaryImpact?.sprites.find(({ set }) => set === "direct")?.x;
  const holdVictimX = primaryHold?.sprites.find(({ set }) => set === "direct")?.x;
  expect(holdVictimX).toBe(impactVictimX);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "0");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-primary-hold.png" });

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterHold");
  const counterReaction = await debugState(page);
  expect(counterReaction.lastCombat?.counterDamage).toBeLessThanOrEqual(10);
  await expect(page.getByTestId("full-actor-sprite")).toBeHidden();
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "3");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "0");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-counter-guard.png" });

  await waitForPhase(page, "round2Story");
  const fullResolved = await debugState(page);
  expect(fullResolved.lastCombat).toEqual(mapResolved.lastCombat);
  expect(fullResolved.rngState).toBe(mapResolved.rngState);
  expect(fullResolved.units).toEqual(mapResolved.units);
  // One mark per choreography beat, in native order, for both exchanges.
  expect(fullResolved.combatPresentationTrace.map(({ phase }) => phase)).toEqual([
    "fullOpen",
    "fullWindup",
    "fullCharge",
    "fullImpact",
    "fullHold",
    "fullCounterWindup",
    "fullCounterCharge",
    "fullCounterImpact",
    "fullCounterHold",
  ]);
  const beat = (phase: string) =>
    fullResolved.combatPresentationTrace.find((entry) => entry.phase === phase)?.fullScene;
  // The camera pans away from the attacker's edge during the charge and the
  // counter pans it back; the status panels freeze their pre-strike life.
  expect(beat("fullWindup")?.camera).toBe(0);
  expect(beat("fullImpact")?.camera).toBe(144);
  expect(beat("fullHold")?.camera).toBe(208);
  // The counter's measured 64 px recoil completes exactly at its hold mark.
  expect(beat("fullCounterHold")?.camera).toBe(0);
  expect(beat("fullImpact")?.damage?.amount).toBe(fullResolved.lastCombat?.damage);
  expect(beat("fullCounterImpact")?.damage?.amount).toBe(fullResolved.lastCombat?.counterDamage);
  // The victim only appears shortly before contact, and the attacker uses the
  // class+50 bundle while the victim uses the direct one.
  expect(beat("fullWindup")?.sprites.map(({ set }) => set)).toEqual(["plus50"]);
  expect(beat("fullImpact")?.sprites.map(({ set }) => set).sort()).toEqual(["direct", "plus50"]);
  expect(beat("fullImpact")?.sprites.find(({ set }) => set === "plus50")?.side).toBe("left");
  expect(beat("fullCounterImpact")?.sprites.find(({ set }) => set === "plus50")?.side).toBe("right");
  expect(fullResolved.audioCueLog.some(({ record, reason }) =>
    record === 2 && reason === "full-primary-hurt")).toBe(true);
  expect(fullResolved.audioCueLog.some(({ record, reason }) =>
    record === 0 && reason === "full-counter-guard")).toBe(true);
  expect(fullResolved.audioCueLog.filter(({ record, reason }) =>
    record === 14 && reason.startsWith("full-"))).toHaveLength(2);

  await enterPlayableBattle({ nativeSpeed: true });
  await page.evaluate(() => window.__ANGEL2__?.forceCavalryCounterSetup());
  await setBattlePresentation(page, "full");
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await clickCanvas(page, 260, 177);
  // The cavalry counter throws its lance as a separate travelling channel:
  // the rider launches it, then leaves while the lance crosses the window.
  const lanceX = () => page.evaluate(() =>
    window.__ANGEL2__?.getState().combatPresentation?.fullScene?.lance?.x ?? Number.NaN);
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.fullScene?.lance !== undefined);
  await expect(fullLayer).toHaveAttribute("data-full-right-record", "Y_00/72");
  await expect(page.getByTestId("full-actor-sprite")).toHaveAttribute("data-set", "plus50");
  const lanceLaunchX = await lanceX();
  expect(lanceLaunchX).toBeGreaterThan(250);
  // A right-side thrower sends the lance leftwards across the scene.
  await page.waitForFunction((launch) => {
    const lance = window.__ANGEL2__?.getState().combatPresentation?.fullScene?.lance;
    return lance !== undefined && lance.x < launch - 120;
  }, lanceLaunchX);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-cavalry-counter.png" });

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterImpact");
  const cavalryHit = (await debugState(page)).combatPresentation?.fullScene;
  // The lance is consumed on contact and the victim takes the direct bundle.
  expect(cavalryHit?.lance).toBeUndefined();
  expect(cavalryHit?.sprites.find(({ set }) => set === "direct")?.side).toBe("left");
  expect(cavalryHit?.damage?.amount).toBeGreaterThan(0);
  const cavalryVictimX = cavalryHit?.sprites.find(({ set }) => set === "direct")?.x;
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "36");
  const cavalryApex = (await debugState(page)).combatPresentation?.fullScene;
  expect(cavalryApex?.sprites.find(({ set }) => set === "direct")?.x).toBe(cavalryVictimX);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-cavalry-recoil-apex.png" });

  await enterPlayableBattle({ nativeSpeed: true });
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await setBattlePresentation(page, "full");
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullImpact");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "1");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "12");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-fatal-hurt.png" });
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullDefenderDeath");
  await expect(fullLayer).toHaveAttribute("data-full-combat-phase", "fullDefenderDeath");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "2");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "0");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-full-native-death.png" });
  await waitForPhase(page, "victoryStory");
  const deathResolved = await debugState(page);
  // A fatal strike ends the presentation: no counter beats follow, and the
  // native full-screen death sound E/11 fires once.
  expect(deathResolved.combatPresentationTrace.map(({ phase }) => phase)).toEqual([
    "fullOpen",
    "fullWindup",
    "fullCharge",
    "fullImpact",
    "fullDefenderDeath",
  ]);
  expect(deathResolved.audioCueLog.filter(({ record }) => record === 11)).toHaveLength(1);
  expect(deathResolved.audioCueLog.some(({ record, reason }) => record === 2 && reason === "full-primary-hurt")).toBe(true);
  expect(deathResolved.audioCueLog.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
});

test("S00-L: native KY checkpoints preserve dual windows, appended text and the blank victory pause", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  const layer = page.getByTestId("dialogue-layer");
  await expect(layer).toHaveAttribute("data-source-record", "0");
  await expect(layer).toHaveAttribute("data-source-wait", "1");

  // Primary input first fast-forwards the current typewriter, then advances on
  // the following press, matching the native input-clear behavior after KY.
  await page.getByTestId("advance-dialogue").click();
  expect((await debugState(page)).dialogueIndex).toBe(0);
  await expect(page.locator("#dialogue-text")).toContainText("寬廣走廊");
  await page.getByTestId("advance-dialogue").click();
  expect((await debugState(page)).dialogueIndex).toBe(1);

  // Reach SAY0/KY5, where the prior upper window remains open while the
  // wounded soldier starts speaking in the lower window.
  for (let checkpoint = 1; checkpoint < 4; checkpoint += 1) {
    await page.getByTestId("advance-dialogue").click();
    await page.getByTestId("advance-dialogue").click();
  }
  expect((await debugState(page)).dialogueIndex).toBe(4);
  await expect(layer).toHaveAttribute("data-source-wait", "5");
  await expect(page.getByTestId("dialogue-window-upper")).toBeVisible();
  await expect(page.getByTestId("dialogue-window-lower")).toBeVisible();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("怎麼會傷成這樣");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("不好了");
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute("data-portrait-record", "47");

  await page.getByTestId("advance-dialogue").click();
  await page.getByTestId("advance-dialogue").click();
  expect((await debugState(page)).dialogueIndex).toBe(5);
  await expect(layer).toHaveAttribute("data-source-wait", "6");
  await expect(layer).toHaveAttribute("data-reveal-start", /^[1-9][0-9]*$/);
  await expect(page.locator("#dialogue-text")).toContainText("不好了");
  await page.getByTestId("advance-dialogue").click();
  await expect(page.locator("#dialogue-text")).toContainText("騎士團的軍隊");
  await page.waitForTimeout(130);
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-dual-dialogue.png" });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryStory");

  const advanceOneCheckpoint = async () => {
    const before = (await debugState(page)).dialogueIndex;
    await page.getByTestId("advance-dialogue").click();
    if ((await debugState(page)).dialogueIndex === before) {
      await page.getByTestId("advance-dialogue").click();
    }
    expect((await debugState(page)).dialogueIndex).toBe(before + 1);
  };
  for (let checkpoint = 0; checkpoint < 2; checkpoint += 1) await advanceOneCheckpoint();
  expect((await debugState(page)).dialogueIndex).toBe(2);
  await expect(layer).toHaveAttribute("data-source-record", "3");
  await expect(layer).toHaveAttribute("data-source-wait", "3");
  await expect(layer).toHaveAttribute("data-active-slot", "none");
  await expect(page.getByTestId("dialogue-window-upper")).toBeHidden();
  await expect(page.getByTestId("dialogue-window-lower")).toBeHidden();
  await page.getByTestId("advance-dialogue").click();
  expect((await debugState(page)).dialogueIndex).toBe(3);
});

test("S00-M: native system records restore battle state and combat cues follow presentation events", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  const initial = await debugState(page);
  expect(initial.audioCueLog.some(({ record, reason }) => record === 14 && reason === "stage-event-scripted-movement")).toBe(true);

  await openSystemMenu(page);
  expect((await debugState(page)).systemCommands).toEqual([
    { id: "settings", label: "遊戲功能" },
    { id: "objectives", label: "勝利條件" },
    { id: "load", label: "讀取記錄" },
    { id: "save", label: "儲存記錄" },
    { id: "quit", label: "離開遊戲" },
  ]);
  await page.getByTestId("system-command-quit").click();
  await expect(page.getByTestId("quit-confirm")).toBeVisible();
  await page.locator("[data-action=quit-confirm]").click();
  await expect(page.getByTestId("quit-feedback-text")).toHaveText("唉啊！．．．要休息了嗎？\n請再考慮一下吧！");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-quit-confirm.png" });
  await page.locator("[data-action=quit-cancel]").click();
  expect((await debugState(page))).toMatchObject({ phase: "player", quitConfirmOpen: false });

  await openSystemMenu(page);
  await page.getByTestId("system-command-save").click();
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await expect(page.getByTestId("record-slot-1")).toContainText("此處沒有記錄");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-save-selector.png" });
  await page.getByTestId("record-slot-1").click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.1") ?? "null"));
  expect(saved).toMatchObject({
    format: "ANGEL2-web-save",
    version: 2,
    kind: "battle",
    stage: 0,
    stageLabel: "瓦爾克麗宮",
    rngState: initial.rngState,
    battle: {
      phase: "player",
      round: initial.round,
      focusId: initial.units.find((unit) => unit.id === "1:0")?.id,
      cursor: initial.cursor,
      cameraOrigin: initial.cameraOrigin,
    },
  });
  expect(saved.battle.units).toEqual(initial.units);

  // Change both simulation and view state, then reload the exact checkpoint.
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-move").click();
  await clickCanvas(page, 180, 177);
  await page.getByTestId("unit-command-end").click();
  let changed = await debugState(page);
  expect(changed.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 28, y: 26, acted: true });

  await openSystemMenu(page);
  await page.getByTestId("system-command-load").click();
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await page.getByTestId("record-slot-1").click();
  const restored = await debugState(page);
  expect(restored.phase).toBe("player");
  expect(restored.round).toBe(initial.round);
  expect(restored.units).toEqual(initial.units);
  expect(restored.cursor).toEqual(initial.cursor);
  expect(restored.cameraOrigin).toEqual(initial.cameraOrigin);
  expect(restored.rngState).toBe(initial.rngState);

  // This assertion audits the native map-hit cue sequence, so select that
  // presentation explicitly instead of depending on the product default.
  await setBattlePresentation(page, "map");
  await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  const targeting = await debugState(page);
  const target = targeting.targets[0];
  await clickCanvas(
    page,
    40 + (target.x - targeting.cameraOrigin.x) * 40 + 20,
    23 + (target.y - targeting.cameraOrigin.y) * 44 + 22,
  );
  await page.waitForFunction(() => !window.__ANGEL2__?.getState().combatPresentation);
  const afterCombat = await debugState(page);
  const mapHitCues = afterCombat.audioCueLog.filter(({ record, reason }) => record === 38 && reason.startsWith("map-"));
  expect(mapHitCues.map(({ reason }) => reason)).toEqual([
    "map-primary-hit-first",
    "map-primary-hit-second",
    "map-counter-hit-first",
    "map-counter-hit-second",
  ]);
});

test("S00-N: defeat and victory use native feedback text, portrait and two-step input", async ({ page }) => {
  const enterPlayerPhase = async () => {
    await page.goto("/?test=1&skipStartup=1");
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "openingStory");
    await page.getByTestId("skip-dialogue").click();
    await waitForPhase(page, "player");
  };

  await enterPlayerPhase();
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await page.getByTestId("retry-button").click();
  expect((await debugState(page)).phase).toBe("defeat");
  await expect(page.getByTestId("feedback-text")).toHaveText("啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！");
  await expect(page.getByTestId("feedback-portrait")).toHaveAttribute("data-portrait-record", "46");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-defeat-feedback.png" });

  await enterPlayerPhase();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryStory");
  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  expect((await debugState(page)).phase).toBe("victoryFeedback");
  await expect(page.getByTestId("feedback-text")).toHaveText("哦！．．\n這次的戰役結束了，是否要記錄下來．");
  await page.getByTestId("game-screen").screenshot({ path: "artifacts/playwright/stage0-native-victory-feedback.png" });
  await page.getByTestId("victory-continue").click();
  expect((await debugState(page)).phase).toBe("savePrompt");
  await expect(page.getByRole("menu", { name: "是否儲存" })).toBeVisible();
  await expect(page.getByTestId("save-yes")).toHaveText("確 定");
});

test("S00-P: stage zero uses native entry-to-loop music pairs and preserves them across volume changes", async ({ page }) => {
  const app = page.locator("#app");
  const battleRequests = new Set<string>();
  page.on("request", (request) => {
    const match = request.url().match(/\/assets\/original\/(battle-stage0-[^?]+\.wav)/);
    if (match) battleRequests.add(match[1]);
  });

  await page.goto("/?test=1&skipStartup=1");
  await expect(app).toHaveAttribute("data-music-track", "MAGIC/73");
  await expect(app).toHaveAttribute("data-music-playing", "false");
  await expect(app).toHaveAttribute("data-music-volume-level", "4");
  await expect(app).toHaveAttribute("data-music-volume", "0.32");

  // A neutral click supplies the browser user gesture without advancing SAY/0000.
  await page.getByTestId("game-screen").click({ position: { x: 620, y: 340 } });
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "true");

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "openingStory");
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/7");
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "false");
  expect(battleRequests.has("battle-stage0-player-entry.wav")).toBe(true);

  // MUSIC/7 is a 7.85 second non-looping entry. Its ended event must hand
  // playback to the 62.7 second MUSIC/6 loop without advancing game state.
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/6", { timeout: 10_000 });
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "true");
  expect(battleRequests.has("battle-stage0-player-loop.wav")).toBe(true);
  expect((await debugState(page)).phase).toBe("openingStory");

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  const loopPlayRequests = await app.getAttribute("data-music-play-request-count");
  await page.keyboard.press("m");
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  await page.getByTestId("music-volume-0").click();
  await expect(app).toHaveAttribute("data-music-volume", "0");
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/6");
  await expect(app).toHaveAttribute("data-music-play-request-count", loopPlayRequests ?? "");
  await page.getByTestId("music-volume-4").click();
  await expect(app).toHaveAttribute("data-music-volume", "0.32");
  await expect(app).toHaveAttribute("data-music-play-request-count", loopPlayRequests ?? "");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("music-settings-menu")).toBeHidden();

  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-allRest").click();
  await waitForPhase(page, "enemy");
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/5");
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "false");
  expect(battleRequests.has("battle-stage0-enemy-entry.wav")).toBe(true);
});
