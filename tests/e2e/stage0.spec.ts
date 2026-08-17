import { expect, test, type Locator, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { skipOpeningToTitle } from "./startup-controls";
import { captureVisualAudit } from "./visual-audit";

const EDGE_PAN_SETTLE_MS = 180;

interface DebugState {
  phase: string;
  campaignRoute?: "stage-01" | "stage-02" | "stage-03";
  activeStoryId?: string;
  consumedEventIds: string[];
  dialogueIndex: number;
  statusMessage: string;
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
  dialogueSkipConfirmOpen: boolean;
  dialogueSkipConfirmIndex: number;
  quitConfirmOpen: boolean;
  quitConfirmIndex: number;
  groupCommandOpen: boolean;
  groupCommandIndex: number;
  groupCommandDialogueId?: "allRest" | "followLeader" | "freeAction";
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
  terrainInspection?: {
    position: { x: number; y: number };
    terrainSlot: number;
    terrainName: string;
    referenceUnit?: { id: string; name: string; classId: string; className: string };
    movementRule?: number;
    movementCost?: number;
    traversable?: boolean;
    attackBonusPercent: 0;
    defenseBonusPercent?: number;
    defenseBonusPoints?: number;
  };
  minimapPreviewOrigin?: { x: number; y: number };
  round: number;
  cursor: { x: number; y: number };
  cameraOrigin: { x: number; y: number };
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  aiDialogueEnabled: boolean;
  aiTechniqueDialogue?: {
    actionId: string;
    center: { x: number; y: number };
  };
  lastSpecialAction?: {
    actorId: string;
    actionId: string;
    target: { x: number; y: number };
    healing: number;
  };
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
      particles: Array<{ x: number; y: number; frame: number }>;
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
  turnTransitionPresentation?: {
    side: "player" | "enemy";
    phase: "hold" | "motion";
    frame: number;
    x?: number;
    y?: number;
    nativeTicks: number;
  };
  turnTransitionPresentationTrace: Array<{
    side: "player" | "enemy";
    phase: "hold" | "motion";
    frame: number;
    x?: number;
    y?: number;
    nativeTicks: number;
  }>;
  movementPresentation?: {
    unitId: string;
    kind: "scripted" | "player" | "allyAuto" | "enemy" | "rollback";
    path: Array<{ x: number; y: number }>;
    stepIndex: number;
  };
  reachable: Array<{ x: number; y: number }>;
  targets: Array<{ x: number; y: number }>;
  promotionUnitIds: string[];
  promotionDialogueIndex?: number;
  promotionSelectionIndex: number;
  promotionTargets: Array<{ id: string; optionIndex: number }>;
  units: Array<{ id: string; side: number; classId: string; className: string; x: number; y: number; life: number; experience: number; name: string; portrait: number; acted: boolean }>;
}

const debugState = (page: Page) => page.evaluate(() => window.__ANGEL2__?.getState() as DebugState);
const waitForPhase = (page: Page, phase: string) => page.waitForFunction((expected) => window.__ANGEL2__?.getState().phase === expected, phase);
const clickCanvas = (page: Page, x: number, y: number) => page.getByTestId("battle-canvas").click({ position: { x, y } });
const expectNativeDialogueGeometry = async (page: Page, slot: "upper" | "lower") => {
  const placement = (selector: string) => page.locator(selector).evaluate((element) => {
    const node = element as HTMLElement;
    const parent = node.offsetParent as HTMLElement | null;
    return {
      x: node.offsetLeft + (parent?.offsetLeft ?? 0),
      y: node.offsetTop + (parent?.offsetTop ?? 0),
      width: node.offsetWidth,
      height: node.offsetHeight,
    };
  });
  const prebattle = await page.getByTestId("dialogue-layer").evaluate((layer) =>
    layer.classList.contains("prebattle"));
  const [copy, portrait] = await Promise.all([
    placement(`#dialogue-copy-${slot}`),
    placement(`#dialogue-portrait-${slot}`),
  ]);
  const expected = prebattle
    ? slot === "upper"
      ? { copy: { x: 153, y: 2 }, portrait: { x: 8, y: 18 } }
      : { copy: { x: 97, y: 260 }, portrait: { x: 512, y: 210 } }
    : slot === "upper"
      ? { copy: { x: 153, y: 10 }, portrait: { x: 32, y: 26 } }
      : { copy: { x: 97, y: 250 }, portrait: { x: 504, y: 200 } };
  expect(copy).toEqual({ ...expected.copy, width: 400, height: 86 });
  expect(portrait).toEqual({ ...expected.portrait, width: 112, height: 112 });
  if (slot === "upper") {
    expect(copy.x - (portrait.x + 115)).toBe(prebattle ? 30 : 6);
  } else {
    expect(portrait.x - (copy.x + copy.width)).toBe(prebattle ? 15 : 7);
  }
};
const finishGroupCommandDialogue = async (page: Page) => {
  const layer = page.getByTestId("dialogue-layer");
  await expect(layer).toBeVisible();
  await expect(layer).toHaveAttribute("data-source-record", "battle-command");
  const command = (await debugState(page)).groupCommandDialogueId;
  await page.getByTestId("dialogue-layer").click();
  if ((await debugState(page)).groupCommandDialogueId === command) {
    await page.getByTestId("dialogue-layer").click();
  }
  await expect.poll(async () => (await debugState(page)).groupCommandDialogueId).toBeUndefined();
};
const finishPromotionDialogue = async (page: Page) => {
  const layer = page.getByTestId("dialogue-layer");
  while (await layer.isVisible() && await layer.getAttribute("data-source-record") === "promotion") {
    const before = await layer.getAttribute("data-source-wait");
    await page.getByTestId("dialogue-layer").click();
    if (
      await layer.isVisible()
      && await layer.getAttribute("data-source-record") === "promotion"
      && await layer.getAttribute("data-source-wait") === before
    ) {
      await page.getByTestId("dialogue-layer").click();
    }
    await expect.poll(async () =>
      !await layer.isVisible() || await layer.getAttribute("data-source-wait") !== before,
    ).toBe(true);
  }
  await expect(layer).toBeHidden();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
};
const confirmPromotion = async (page: Page, classId = "cavalry") => {
  const dialogueLayer = page.getByTestId("dialogue-layer");
  if (
    await dialogueLayer.isVisible()
    && await dialogueLayer.getAttribute("data-source-record") === "promotion"
  ) {
    await finishPromotionDialogue(page);
  }
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  await page.getByTestId(`promotion-target-${classId}`).click();
  await expect(page.getByTestId("promotion-layer")).toBeHidden();
};
const openSystemMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
};
const expectNativeMenuChrome = async (menu: Locator, expectedHeight: number) => {
  await expect(menu).toHaveClass(/native-command-menu/);
  const presentation = await menu.evaluate((element) => {
    const selected = element.querySelector<HTMLElement>("button.is-selected");
    const label = selected?.querySelector<HTMLElement>(".native-command-label");
    return {
      width: (element as HTMLElement).offsetWidth,
      height: (element as HTMLElement).offsetHeight,
      chrome: getComputedStyle(element).backgroundImage,
      selection: selected ? getComputedStyle(selected, "::before").backgroundImage : "",
      pointer: selected ? getComputedStyle(selected).cursor : "",
      labelCenterOffset: selected && label
        ? label.getBoundingClientRect().left + label.getBoundingClientRect().width / 2
          - (
            Number.parseFloat(getComputedStyle(selected).letterSpacing)
            - Number.parseFloat(getComputedStyle(selected).textIndent)
          ) / 2
          - (element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2)
        : Number.NaN,
    };
  });
  expect(presentation).toMatchObject({ width: 144, height: expectedHeight });
  expect(presentation.chrome).toContain("command-menu-top.png");
  expect(presentation.chrome).toContain("command-menu-side.png");
  expect(presentation.chrome).toContain("command-menu-bottom.png");
  expect(presentation.selection).toContain("command-menu-selection.png");
  expect(presentation.pointer).toContain("command-menu-pointer.png");
  expect(Math.abs(presentation.labelCenterOffset)).toBeLessThanOrEqual(0.5);
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
  if (!movingUnitId) return samples;
  while (window.__ANGEL2__?.getState().movementPresentation?.unitId === movingUnitId) {
    const state = window.__ANGEL2__?.getState() as DebugState;
    // The movement can finish between the loop guard and this semantic-state
    // read under full-suite contention. Do not pair a stale canvas anchor with
    // the next story state's cursor after that transition.
    if (state.movementPresentation?.unitId !== movingUnitId) break;
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
  // A short compressed test-mode route can expose only one browser sample
  // under full-suite CPU contention. The semantic path assertion still proves
  // movement occurred; every render that was observable must keep its anchor.
  expect(samples.length).toBeGreaterThanOrEqual(1);
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
  expect((await debugState(page))).toMatchObject({
    phase: "prebattleStory",
    activeStoryId: "stage-00-prebattle-story",
    consumedEventIds: ["stage-00-prebattle-story"],
  });
  const dialogueLayer = page.getByTestId("dialogue-layer");
  await expect(dialogueLayer).toBeVisible();
  await expect(dialogueLayer.getByRole("button")).toHaveCount(0);
  await dialogueLayer.click({ button: "right" });
  const skipConfirm = page.getByTestId("dialogue-skip-confirm");
  await expect(skipConfirm).toBeVisible();
  await expect(skipConfirm).toContainText("是否跳過劇情對話？");
  await expect(page.getByTestId("dialogue-skip-no")).toHaveAttribute("aria-current", "true");
  expect((await debugState(page))).toMatchObject({
    dialogueIndex: 0,
    dialogueSkipConfirmOpen: true,
    dialogueSkipConfirmIndex: 1,
  });
  await page.locator("#dialogue-skip-question").click();
  expect((await debugState(page))).toMatchObject({
    dialogueIndex: 0,
    dialogueSkipConfirmOpen: true,
  });
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("dialogue-skip-yes")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("dialogue-skip-no")).toHaveAttribute("aria-current", "true");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-dialogue-skip-confirm.png",
  });
  await page.keyboard.press("Escape");
  await expect(skipConfirm).toBeHidden();
  await dialogueLayer.click({ button: "right" });
  await expect(skipConfirm).toBeVisible();
  await page.getByTestId("dialogue-skip-no").click();
  await expect(skipConfirm).toBeHidden();
  expect((await debugState(page))).toMatchObject({
    dialogueIndex: 0,
    dialogueSkipConfirmOpen: false,
  });
  for (let action = 0; action < 4; action += 1) await page.getByTestId("dialogue-layer").click();
  expect((await debugState(page)).dialogueIndex).toBe(2);
  await page.waitForTimeout(130);
  await expectNativeDialogueGeometry(page, "upper");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-dialogue-buttonless-upper.png",
  });
  const dialoguePortrait = page.getByTestId("dialogue-portrait-composite");
  await expect(dialoguePortrait).toBeVisible();
  const dialoguePortraitName = page.getByTestId("dialogue-portrait-name");
  await expect(dialoguePortraitName).toBeVisible();
  expect(await dialoguePortraitName.textContent()).toBe("妮  雅");
  const [portraitBounds, portraitNameBounds] = await Promise.all([
    dialoguePortrait.boundingBox(),
    dialoguePortraitName.boundingBox(),
  ]);
  expect(portraitBounds).not.toBeNull();
  expect(portraitNameBounds).not.toBeNull();
  expect(portraitNameBounds!.x).toBeCloseTo(portraitBounds!.x, 4);
  expect(portraitNameBounds!.width).toBeCloseTo(portraitBounds!.width, 4);
  expect(portraitNameBounds!.x + portraitNameBounds!.width / 2)
    .toBeCloseTo(portraitBounds!.x + portraitBounds!.width / 2, 4);
  expect(portraitNameBounds!.y).toBeCloseTo(portraitBounds!.y + 111, 4);
  const frameBackgrounds = await dialoguePortrait.evaluate((portrait) => ({
    horizontal: getComputedStyle(portrait, "::before").backgroundImage,
    sides: getComputedStyle(portrait, "::after").backgroundImage,
  }));
  expect(frameBackgrounds.horizontal).toContain("/assets/original/dialogue/portrait-top.png");
  expect(frameBackgrounds.horizontal).toContain("/assets/original/dialogue/portrait-nameplate.png");
  expect(frameBackgrounds.sides).toContain("/assets/original/dialogue/portrait-side.png");
  await expect(page.locator("#dialogue-copy-upper")).toHaveCSS(
    "background-image",
    /\/assets\/original\/dialogue\/text-window\.png/u,
  );
  const dialogueFrameSizes = await page.evaluate(async (sources) => Promise.all(sources.map((source) =>
    new Promise<[number, number]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error(`failed to load ${source}`));
      image.src = source;
    }))), [
    "/assets/original/dialogue/portrait-top.png",
    "/assets/original/dialogue/portrait-nameplate.png",
    "/assets/original/dialogue/portrait-side.png",
    "/assets/original/dialogue/text-window.png",
  ]);
  expect(dialogueFrameSizes).toEqual([[112, 17], [112, 23], [8, 8], [400, 86]]);
  await expect(dialoguePortrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(dialoguePortrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect.poll(() => dialoguePortrait.locator(".portrait-mouth").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await expect.poll(async () => Number(await dialoguePortrait.getAttribute("data-talk-count"))).toBeGreaterThan(0);
  await expect(dialoguePortrait).toHaveAttribute("data-mouth-frame", /^[12]$/);
  await dialoguePortrait.evaluate((portrait) => { portrait.setAttribute("data-force-mouth-frame", "2"); });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-dialogue-portrait-talk.png" });
  await captureVisualAudit(dialoguePortrait, { path: "artifacts/playwright/stage0-dialogue-portrait-talk-detail.png" });
  if (await dialoguePortrait.getAttribute("data-speaking") === "true") {
    await page.getByTestId("dialogue-layer").click();
  }
  await expect(dialoguePortrait).toHaveAttribute("data-speaking", "false");
  await dialoguePortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-mouth-frame"); });
  await expect(dialoguePortrait).toHaveAttribute("data-mouth-frame", "1");
  // 在页面内按 rAF 采样，把每个眨眼世代的 count 与 delay 成对取出。眨眼间隔至少
  // 220 ms，远大于一帧，所以不会漏世代。不能用两次独立的 getAttribute 分别读
  // count 和 delay：机器一忙就可能在两次读之间跨过一个世代，把同一个 delay 读两
  // 遍；而 `idleDelay` 只保证相邻世代不同，非相邻世代本就可能相等。
  const blinkGenerations = await dialoguePortrait.evaluate((portrait) =>
    new Promise<[number, number][]>((resolve) => {
      const samples = new Map<number, number>();
      // 采样器必须用 setInterval 而不是 requestAnimationFrame：整套并行时页面可能
      // 被 Chromium 判为不可见并把 rAF 节流到近乎停止，rAF 驱动的采样会连同它自己
      // 的超时检查一起挂死，把失败变成一次无信息的整测超时。
      const record = () => {
        samples.set(Number(portrait.dataset.blinkCount), Number(portrait.dataset.blinkDelayMs));
      };
      const finish = () => {
        clearInterval(interval);
        clearTimeout(guard);
        resolve([...samples].sort(([left], [right]) => left - right));
      };
      record();
      const interval = setInterval(() => {
        record();
        if (samples.size >= 3) finish();
      }, 40);
      const guard = setTimeout(finish, 10_000);
    }));
  // 采样窗口内没看到足够世代，说明眨眼时钟本身没推进；直接报出观察到的世代，
  // 不要退化成一次没有信息的超时。
  expect(blinkGenerations.length,
    `blink clock did not advance; sampled generations ${JSON.stringify(blinkGenerations)}`)
    .toBeGreaterThanOrEqual(3);
  for (const [, delayMs] of blinkGenerations) {
    expect(delayMs).toBeGreaterThanOrEqual(220);
    expect(delayMs).toBeLessThanOrEqual(520);
  }
  for (let index = 1; index < blinkGenerations.length; index += 1) {
    const [priorGeneration, priorDelay] = blinkGenerations[index - 1];
    const [generation, delayMs] = blinkGenerations[index];
    // 世代必须连号，否则下面的“相邻世代延迟不同”就不成立。
    expect(generation).toBe(priorGeneration + 1);
    expect(delayMs).not.toBe(priorDelay);
  }
  await dialoguePortrait.evaluate((portrait) => { portrait.setAttribute("data-force-blink-frame", "3"); });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-dialogue-portrait-blink.png" });
  await dialoguePortrait.evaluate((portrait) => { portrait.removeAttribute("data-force-blink-frame"); });

  await skipStoryDialogue(page);
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "scripted");
  const openingMovement = (await debugState(page)).movementPresentation!;
  expect((await debugState(page)).consumedEventIds).toEqual([
    "stage-00-prebattle-story",
    "stage-00-opening-move",
  ]);
  expect(openingMovement.path.length).toBeGreaterThan(2);
  expect(openingMovement.stepIndex).toBeLessThan(openingMovement.path.length - 1);
  for (let index = 1; index < openingMovement.path.length; index += 1) {
    const prior = openingMovement.path[index - 1];
    const current = openingMovement.path[index];
    expect(Math.abs(prior.x - current.x) + Math.abs(prior.y - current.y)).toBe(1);
  }
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-path-movement.png" });
  const openingSamples = await sampleTrackedUnitPosition(page);
  expectStableTracking(openingSamples);
  expectCursorLocked(openingSamples, openingMovement.path.at(-1)!);
  await waitForPhase(page, "openingStory");
  let state = await debugState(page);
  expect(state.cameraOrigin).toEqual({ x: 25, y: 23 });
  expect(state.units.filter((unit) => unit.side === 1)).toHaveLength(6);
  expect(state.units.filter((unit) => unit.side === 2)).toHaveLength(10);
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 29, y: 26 });
  expect(state).toMatchObject({
    activeStoryId: "stage-00-opening-story",
    consumedEventIds: [
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
    ],
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  // Empty terrain keeps the live minimap and adds the remake terrain card in
  // the upper side-panel surface.
  await clickCanvas(page, 420, 45);
  await expect(page.getByTestId("tactical-hud")).toBeVisible();
  await expect(page.getByTestId("terrain-detail")).toBeVisible();
  await expect(page.locator(".minimap-unit")).toHaveCount(16);
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-unit-life-label-count")).toBe("16");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-count")).toBe("0");
  await expect(page.getByTestId("unit-portrait")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-player.png" });

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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-bottom-banner-edge-pan.png" });

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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-mouse-edge-pan.png" });

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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-portrait-blink.png" });
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-enemy-movement-preview.png" });
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
  await expectNativeMenuChrome(page.getByTestId("system-menu"), 148);
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-system-menu.png" });
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
  await expect(page.getByTestId("action-menu")).toHaveClass(/native-command-menu/);
  const nativeMenuArt = await page.getByTestId("action-menu").evaluate((menu) => {
    const selected = menu.querySelector<HTMLElement>("button.is-selected");
    const label = selected?.querySelector<HTMLElement>(".native-command-label");
    return {
      width: menu.offsetWidth,
      height: menu.offsetHeight,
      chrome: getComputedStyle(menu).backgroundImage,
      backgroundColor: getComputedStyle(menu).backgroundColor,
      darkTexture: getComputedStyle(menu).getPropertyValue("--native-menu-dark").trim(),
      lightTexture: getComputedStyle(menu).getPropertyValue("--native-menu-light").trim(),
      selection: selected ? getComputedStyle(selected, "::before").backgroundImage : "",
      pointer: selected ? getComputedStyle(selected).cursor : "",
      duplicatePointer: label ? getComputedStyle(label, "::after").content : "",
      labelInkCenterOffset: selected && label
        ? label.getBoundingClientRect().left + label.getBoundingClientRect().width / 2
          - (
            Number.parseFloat(getComputedStyle(selected).letterSpacing)
            - Number.parseFloat(getComputedStyle(selected).textIndent)
          ) / 2
          - (menu.getBoundingClientRect().left + menu.getBoundingClientRect().width / 2)
        : Number.NaN,
    };
  });
  expect(nativeMenuArt).toMatchObject({ width: 144, height: 100 });
  expect(nativeMenuArt.chrome).toContain("command-menu-top.png");
  expect(nativeMenuArt.chrome).toContain("command-menu-side.png");
  expect(nativeMenuArt.chrome).toContain("command-menu-bottom.png");
  expect(nativeMenuArt.chrome).toContain("conic-gradient");
  expect(nativeMenuArt.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(nativeMenuArt.darkTexture).toBe("rgb(95 0 0 / 50%)");
  expect(nativeMenuArt.lightTexture).toBe("rgb(231 138 69 / 50%)");
  expect(nativeMenuArt.selection).toContain("command-menu-selection.png");
  expect(nativeMenuArt.pointer).toContain("command-menu-pointer.png");
  expect(nativeMenuArt.duplicatePointer).toBe("none");
  expect(Math.abs(nativeMenuArt.labelInkCenterOffset)).toBeLessThan(0.5);
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-unit-command-menu.png" });
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-move-candidate-hover.png" });
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
  // Native player 移動 reaches the shared walk playback 1000:7F72, which loads
  // E/14 and submits it once per movement — not once per step — through the
  // 移動 category gate 0000:0249.
  const afterFirstMove = await debugState(page);
  expect(afterFirstMove.audioCueLog.filter(
    ({ record, reason }) => record === 14 && reason === "player-movement",
  )).toHaveLength(1);
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "postMove",
    commands: [
      { id: "attack", label: "攻擊" },
      { id: "end", label: "結束" },
      { id: "undo", label: "返悔" },
    ],
  });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-post-move-command-menu.png" });
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
  // 返悔 replays the route in reverse as a remake-only presentation; the native
  // cancel paths restore the previous cell directly, so it must not request a
  // walk sound of its own [DD]. E/14 doubles as the full-combat charge cue, so
  // match the 移動-category reason rather than the record alone.
  const walkCues = (log: Array<{ record: number; reason: string }>) =>
    log.filter(({ record, reason }) => record === 14 && reason.includes("movement"));
  expect(walkCues((await debugState(page)).audioCueLog))
    .toHaveLength(walkCues(afterFirstMove.audioCueLog).length);
  await page.getByTestId("unit-command-move").click();
  await page.getByTestId("battle-canvas").hover({ position: { x: 180, y: 177 } });
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    actionMode: "actionMenu",
    commandMenuKind: "postMove",
  });
  // Re-walking the same route requests the walk sound again, so the gate is per
  // movement rather than a once-per-unit or once-per-turn latch.
  expect((await debugState(page)).audioCueLog.filter(
    ({ record, reason }) => record === 14 && reason === "player-movement",
  )).toHaveLength(2);
  await page.locator("[data-action=attack]").click();
  await expect.poll(async () => (await debugState(page)).units.find((unit) => unit.id === "1:0")?.acted).toBe(true);
  await expect(page.getByTestId("combat-presentation")).toBeHidden();
  await page.waitForFunction(() => !window.__ANGEL2__?.getState().combatPresentation);
  const promotionDialogue = page.getByTestId("dialogue-layer");
  await expect(promotionDialogue).toBeVisible();
  await expect(promotionDialogue).toHaveAttribute("data-source-record", "promotion");
  await expect(promotionDialogue).toHaveAttribute("data-source-address", "0000:0487");
  await expect(promotionDialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("promotion-layer")).toBeHidden();
  await page.getByTestId("dialogue-layer").click();
  await expect(page.locator("#dialogue-text")).toHaveText(
    "我的經驗值已達到轉職的目標，\n應該選擇甚麼職業？",
  );
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute(
    "data-portrait-record",
    "46",
  );
  await expectNativeDialogueGeometry(page, "upper");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-nia-promotion-dialogue.png",
  });
  await page.getByTestId("dialogue-layer").click();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  expect((await debugState(page))).toMatchObject({
    phase: "player",
    promotionUnitIds: ["1:0"],
    promotionTargets: [
      { id: "cavalry", optionIndex: 0 },
      { id: "warrior", optionIndex: 1 },
      { id: "archer", optionIndex: 2 },
      { id: "sister", optionIndex: 3 },
    ],
  });
  for (const classId of ["cavalry", "warrior", "archer", "sister"] as const) {
    const image = page.getByTestId(`promotion-image-${classId}`);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", new RegExp(`unit-ally-${classId}\\.png$`));
    expect(await image.evaluate((element: HTMLImageElement) => ({
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      imageRendering: getComputedStyle(element).imageRendering,
    }))).toEqual({
      naturalWidth: 40,
      naturalHeight: 43,
      imageRendering: "pixelated",
    });
  }
  await expect(page.getByTestId("promotion-target-cavalry")).toHaveAccessibleName(
    /騎兵.*等級 1.*攻擊 55（\+9）.*生命上限 200（\+10）/,
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("promotion-target-warrior")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("promotion-target-sister")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("promotion-target-warrior")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("promotion-target-cavalry")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Alt");
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-promotion-choice.png" });
  await confirmPromotion(page);
  state = await debugState(page);
  expect(state.lastCombat?.counterOccurred).toBe(true);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "primaryHit").map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "counterHit").map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "primaryDamage")).toHaveLength(state.lastCombat!.damage);
  expect(state.combatPresentationTrace.filter(({ phase }) => phase === "counterDamage")).toHaveLength(state.lastCombat!.counterDamage);
  expect(state.combatPresentationTrace.some(({ phase }) => phase === "defenderDeath")).toBe(false);
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({ x: 28, y: 26 });
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({
    classId: "cavalry",
    className: "騎兵",
    experience: 0,
    acted: true,
  });
  expect(state.units.find((unit) => unit.id === "2:45")!.life).toBeLessThan(160);
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-unit-life-label-count")).toBe("16");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-count")).toBe("1");
  await expect.poll(() => page.getByTestId("battle-canvas").getAttribute("data-acted-badge-geometry")).toBe("-22,-15,16,14");
  await clickCanvas(page, 180, 177);
  await expect(page.getByTestId("exp-bar").locator("i")).not.toHaveAttribute("style", "height:0%" );
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-experience-hud.png" });
  await clickCanvas(page, 420, 45);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-acted-marker.png" });

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
  await expect(page.getByTestId("group-command-menu")).toHaveClass(/native-command-menu/);
  await expect(page.getByTestId("group-command-menu")).toHaveCSS("width", "144px");
  await expect(page.getByTestId("group-command-menu")).toHaveCSS("height", "124px");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-group-command-menu.png" });
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeHidden();
  const beforeAllRest = await debugState(page);
  await page.getByTestId("all-rest-hotspot").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-address", "DS:86E4");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText(
    "大家聽著！\n所有還未行動的人在原地休息，補充體力．",
  );
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute("data-portrait-record", "46");
  expect((await debugState(page))).toMatchObject({
    phase: "player",
    round: beforeAllRest.round,
    units: beforeAllRest.units,
    rngState: beforeAllRest.rngState,
    groupCommandDialogueId: "allRest",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-all-rest-command-dialogue.png" });
  await finishGroupCommandDialogue(page);
  await page.waitForFunction(() => {
    const movement = window.__ANGEL2__?.getState().movementPresentation;
    return movement?.kind === "enemy" && movement.unitId === "2:15";
  });
  const enemyMovementState = await debugState(page);
  const enemyMovement = enemyMovementState.movementPresentation!;
  expect(enemyMovement.unitId).toBe("2:15");
  const enemyDestination = enemyMovement.path.at(-1)!;
  expect(enemyMovementState.cursor).toEqual(enemyDestination);
  const enemySamples = await sampleTrackedUnitPosition(page);
  // This test-mode route can finish between the captured semantic state and
  // the in-page sampler. Opening movement above retains the full visual anchor
  // gate; if this shorter route is still observable, audit every sample too.
  if (enemySamples.length > 0) {
    expectStableTracking(enemySamples);
    expectCursorLocked(enemySamples, enemyDestination);
  }
  await waitForPhase(page, "round2Story");
  state = await debugState(page);
  expect(state.round).toBe(2);
  expect(state).toMatchObject({
    activeStoryId: "stage-00-round-2-story",
    consumedEventIds: [
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
      "stage-00-round-2-story",
    ],
  });
  expect(state.units.find((unit) => unit.id === "2:41")!.y).toBeGreaterThan(39);
  expect(state.units.filter((unit) => unit.side === 1).every((unit) => !unit.acted)).toBe(true);

  // Units that begin round 2 inside an enemy control zone may leave their
  // origin; only control-zone cells entered during the move stop expansion.
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-round2-zoc-origin.png" });

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
  await skipStoryDialogue(page);
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await setBattlePresentation(page, "full");
  await clickCanvas(page, 220, 177);
  await clickCanvas(page, 220, 177);
  await page.locator("[data-action=attack]").click();
  await expect(page.getByTestId("combat-presentation")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-combat.png" });
  await confirmPromotion(page);
  await waitForPhase(page, "victoryStory");
  expect((await debugState(page))).toMatchObject({
    activeStoryId: "stage-00-victory-story",
    consumedEventIds: [
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
      "stage-00-victory-story",
    ],
  });
  await skipStoryDialogue(page);
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("save-yes").click();
  await expect(page.locator("[data-action=save-slot]")).toHaveCount(5);
  await expect(page.getByTestId("post-save-page")).toHaveText("第 1／4 頁");
  await page.getByTestId("post-save-next-page").click();
  await page.getByTestId("post-save-next-page").click();
  await page.getByTestId("post-save-next-page").click();
  await expect(page.getByTestId("post-save-page")).toHaveText("第 4／4 頁");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-post-save-page-4.png",
  });
  await page.getByTestId("save-slot-20").click();
  await waitForPhase(page, "prebattleStory");
  expect((await debugState(page))).toMatchObject({
    campaignRoute: "stage-01",
    activeStoryId: "stage-01-prebattle-story",
    consumedEventIds: ["stage-01-prebattle-story"],
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "4");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.20") ?? "null"));
  expect(saved).toMatchObject({
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    stageId: "stage-01",
    stageLabel: "騎士城堡前",
    ruleset: "stableRemake",
    // First record written in this campaign; the post-victory writer advances
    // the same cumulative count the stage-49 epilogue reads.
    saveCount: 1,
    rngCalls: expect.any(Number),
    stageProgress: 0,
    consumedEventIds: [],
  });
  expect(saved.roster).toHaveLength(75);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage1-prebattle-entry.png" });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("REMAKE-015: clicking empty terrain shows class-specific traits in the side panel", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  const baseline = await debugState(page);
  await clickCanvas(page, 420, 45);
  const inspected = await debugState(page);
  expect(inspected.terrainInspection).toMatchObject({
    terrainName: "宮殿地面",
    referenceUnit: { id: "1:0", name: "妮雅", classId: "soldier", className: "士兵" },
    attackBonusPercent: 0,
  });
  expect(inspected.actionMode).toBe("idle");
  expect(inspected.units).toEqual(baseline.units);
  expect(inspected.rngState).toBe(baseline.rngState);

  const detail = page.getByTestId("terrain-detail");
  const terrain = inspected.terrainInspection!;
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-hud-mode", "terrain");
  await expect(page.getByTestId("terrain-name")).toHaveText("宮殿地面");
  await expect(detail).toHaveAttribute("data-terrain-slot", String(terrain.terrainSlot));
  await expect(detail).not.toContainText(/槽\s*\d+/);
  await expect(page.getByTestId("terrain-position"))
    .toHaveText(`格 ${terrain.position.x}，${terrain.position.y}`);
  await expect(page.getByTestId("terrain-reference")).toHaveText("妮雅・士兵");
  await expect(page.getByTestId("terrain-movement-cost"))
    .toHaveText(terrain.traversable ? String(terrain.movementCost) : "不可進入");
  await expect(page.getByTestId("terrain-attack-bonus")).toHaveText("無");
  await expect(page.getByTestId("terrain-defense-bonus")).toHaveText(
    terrain.traversable
      ? `+${terrain.defenseBonusPercent}%（+${terrain.defenseBonusPoints}）`
      : "—",
  );
  await expect(page.getByTestId("tactical-minimap")).toBeVisible();
  await expect(page.locator(".minimap-unit")).toHaveCount(16);
  await expect(page.locator("[data-side-panel-hotspot]:visible")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-terrain-inspection.png",
  });

  await page.getByTestId("close-terrain-detail").click();
  await expect(detail).toBeHidden();
  expect((await debugState(page)).terrainInspection).toBeUndefined();
  await page.keyboard.press(" ");
  await expect(page.getByTestId("terrain-detail")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("terrain-detail")).toBeHidden();
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press(" ");
  await expect(page.getByTestId("terrain-detail")).toBeVisible();

  await clickCanvas(page, 220, 177);
  await expect(page.getByTestId("terrain-detail")).toBeHidden();
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await debugState(page)).terrainInspection).toBeUndefined();
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  const reducedMotionPortrait = page.getByTestId("unit-portrait-composite");
  await expect(reducedMotionPortrait).toBeVisible();
  await expect.poll(async () => Number(await reducedMotionPortrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  await reducedMotionPortrait.evaluate((portrait) => { portrait.setAttribute("data-force-blink-frame", "3"); });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-reduced-motion-portrait-blink.png" });
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
      await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-right-click-next-ally.png" });
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
  await captureVisualAudit(page, { path: "artifacts/playwright/stage0-mobile.png", fullPage: true });
});

test("S00-F: named cavalry identity and route evacuation are visible end to end", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowLeft");
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowDown");
  await expect(page.getByText("騎兵／哈釘", { exact: true })).toBeVisible();
  await expect(page.getByTestId("unit-portrait")).toHaveAttribute("src", /portraits\/0015\/base\.png$/);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-hading.png" });

  await page.evaluate(() => window.__ANGEL2__?.forceEvacuationSetup());
  expect((await debugState(page)).units.filter((unit) => unit.side === 2)).toHaveLength(1);
  await page.keyboard.press("F1");
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "enemy");
  const enemyMovement = (await debugState(page)).movementPresentation!;
  expect(enemyMovement.path.length).toBeGreaterThan(1);
  expect(enemyMovement.path.at(-1)).toEqual({ x: 24, y: 47 });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-enemy-route-movement.png" });
  await waitForPhase(page, "victoryStory");
  const evacuated = await debugState(page);
  expect(evacuated.units.filter((unit) => unit.side === 2)).toHaveLength(0);
  expect(evacuated.round).toBe(1);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-evacuation-victory.png" });
});

test("turn handoff replays the native A/19 runners, hops, shadow and A/26 edge dust", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await finishGroupCommandDialogue(page);
  await page.waitForFunction(() => {
    const transition = window.__ANGEL2__?.getState().turnTransitionPresentation;
    return transition?.side === "enemy"
      && transition.phase === "motion"
      && transition.x <= 250
      && transition.x >= 110;
  }, undefined, { polling: 10 });

  const enemyFrame = await debugState(page);
  expect(enemyFrame.phase).toBe("allyAuto");
  expect(enemyFrame.turnTransitionPresentation).toMatchObject({
    side: "enemy",
    phase: "motion",
    nativeTicks: 10,
  });
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-side", "enemy");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-sprite-count", "2");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-dust-count", "6");
  expect(await page.getByTestId("battle-canvas").evaluate((canvas) => {
    const transition = window.__ANGEL2__?.getState().turnTransitionPresentation;
    return {
      screenOffsetX: Number((canvas as HTMLCanvasElement).dataset.turnTransitionScreenX)
        - transition.x,
      screenOffsetY: Number((canvas as HTMLCanvasElement).dataset.turnTransitionScreenY)
        - transition.y,
      clip: (canvas as HTMLCanvasElement).dataset.turnTransitionClip,
    };
  })).toEqual({ screenOffsetX: 40, screenOffsetY: -45, clip: "40,155,400,132" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-turn-transition-enemy.png",
  });
  await page.waitForFunction((frame) => {
    const transition = window.__ANGEL2__?.getState().turnTransitionPresentation;
    return transition?.side === "enemy"
      && transition.phase === "motion"
      && transition.frame > frame;
  }, enemyFrame.turnTransitionPresentation!.frame, { polling: 10 });
  const enemyLaterFrame = await debugState(page);
  expect(enemyLaterFrame.units).toEqual(enemyFrame.units);
  expect(enemyLaterFrame.rngState).toBe(enemyFrame.rngState);
  expect(enemyLaterFrame.round).toBe(enemyFrame.round);

  await page.waitForFunction(() => {
    const transition = window.__ANGEL2__?.getState().turnTransitionPresentation;
    return transition?.side === "player"
      && transition.phase === "motion"
      && transition.x >= 95
      && transition.x <= 225;
  }, undefined, { polling: 10 });
  const playerFrame = await debugState(page);
  expect(playerFrame.phase).toBe("enemy");
  expect(playerFrame.turnTransitionPresentation).toMatchObject({
    side: "player",
    phase: "motion",
    nativeTicks: 10,
  });
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-side", "player");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-sprite-count", "2");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-turn-transition-dust-count", "6");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-turn-transition-player.png",
  });
  await page.waitForFunction((frame) => {
    const transition = window.__ANGEL2__?.getState().turnTransitionPresentation;
    return transition?.side === "player"
      && transition.phase === "motion"
      && transition.frame > frame;
  }, playerFrame.turnTransitionPresentation!.frame, { polling: 10 });
  const playerLaterFrame = await debugState(page);
  expect(playerLaterFrame.units).toEqual(playerFrame.units);
  expect(playerLaterFrame.rngState).toBe(playerFrame.rngState);
  expect(playerLaterFrame.round).toBe(playerFrame.round);

  await waitForPhase(page, "round2Story");
  const completed = await debugState(page);
  expect(completed.turnTransitionPresentation).toBeUndefined();
  expect(completed.turnTransitionPresentationTrace).toHaveLength(21);
  expect(completed.turnTransitionPresentationTrace[0]).toEqual({
    side: "player",
    phase: "hold",
    frame: -1,
    nativeTicks: 100,
  });
});

test("S00-G: group commands provide allied AI handoff and confirmed retreat", async ({ page }) => {
  const enterPlayerPhase = async () => {
    await page.goto("/?test=1&skipStartup=1");
    await skipStoryDialogue(page);
    await waitForPhase(page, "openingStory");
    await skipStoryDialogue(page);
    await waitForPhase(page, "player");
  };

  await enterPlayerPhase();
  const initial = await debugState(page);
  // Reproduce the shipping mouse route: hovering empty ground restores the
  // tactical desk before the player clicks its map/group-command object.
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-side-panel-hotspots", "active");
  await page.getByTestId("group-command-hotspot").click();
  await expect(page.getByTestId("group-command-followLeader")).toBeEnabled();
  expect((await debugState(page)).groupLeaderId).toBe("1:0");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-follow-leader-hotspot-menu.png",
  });
  await page.getByTestId("group-command-retreat").click();
  await expect(page.getByTestId("retreat-confirm")).toBeVisible();
  await expectNativeMenuChrome(page.getByTestId("retreat-confirm-menu"), 76);
  await page.locator("[data-action=retreat-confirm]").click();
  await expect(page.getByTestId("retreat-confirm")).toContainText("哦！．．．要撤退嗎？");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-retreat-confirm.png" });
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

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.keyboard.press("Tab");
  await page.keyboard.press("F3");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-address", "DS:8716");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText(
    "大家聽著！\n所有還未行動的人自由行動．",
  );
  expect((await debugState(page)).groupCommandDialogueId).toBe("freeAction");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-free-action-dialogue.png" });
  await finishGroupCommandDialogue(page);
  await waitForPhase(page, "allyAuto");
  await expect.poll(async () => (await debugState(page)).units.some((unit) => unit.side === 1 && unit.acted)).toBe(true);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-free-action.png" });

  await enterPlayerPhase();
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("group-command-hotspot").click();
  await page.getByTestId("group-command-followLeader").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-address", "DS:873C");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText(
    "大家聽著！\n所有還未行動的人跟著我來．",
  );
  expect((await debugState(page))).toMatchObject({
    groupCommandDialogueId: "followLeader",
    groupLeaderId: "1:0",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-follow-leader-dialogue.png" });
  await finishGroupCommandDialogue(page);
  await waitForPhase(page, "allyAuto");
  await expect.poll(async () => (await debugState(page)).units.find((unit) => unit.id === "1:0")?.acted).toBe(true);
  await page.waitForFunction(() => window.__ANGEL2__?.getState().movementPresentation?.kind === "allyAuto");
  const alliedMovement = (await debugState(page)).movementPresentation!;
  expect(alliedMovement.path.length).toBeGreaterThan(1);
  for (let index = 1; index < alliedMovement.path.length; index += 1) {
    expect(Math.abs(alliedMovement.path[index - 1].x - alliedMovement.path[index].x)
      + Math.abs(alliedMovement.path[index - 1].y - alliedMovement.path[index].y)).toBe(1);
  }
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-follow-leader.png" });
});

test("REMAKE-014: side-1 autonomous techniques use the upper native dialogue window", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("sister"));
  const before = await debugState(page);
  const allyBefore = before.units.find(({ id }) => id === "1:1")!;
  await page.keyboard.press("Tab");
  await page.keyboard.press("F3");
  await finishGroupCommandDialogue(page);
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().aiTechniqueDialogue?.actionId === "heal-1",
  );

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "15");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:860C");
  await expect(dialogue).toHaveAttribute("data-active-slot", "upper");
  await expect(page.getByText("妮雅・初級治療", { exact: true })).toBeVisible();
  await expect(page.getByText("生命單.", { exact: true })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-ally-auto-heal-notice.png",
  });
  const during = await debugState(page);
  expect(during).toMatchObject({
    cursor: { x: 31, y: 26 },
    aiTechniqueDialogue: {
      actionId: "heal-1",
      center: { x: 31, y: 26 },
    },
  });
  expect(during.units.find(({ id }) => id === "1:1")?.life).toBe(allyBefore.life);

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState();
    return current?.lastSpecialAction?.actorId === "1:0"
      && current.lastSpecialAction.actionId === "heal-1"
      && current.aiTechniqueDialogue === undefined;
  });
  const after = await debugState(page);
  const allyAfter = after.units.find(({ id }) => id === "1:1")!.life;
  expect(allyAfter).toBeGreaterThan(allyBefore.life);
  expect(allyAfter).toBeLessThanOrEqual(
    allyBefore.life + after.lastSpecialAction!.healing,
  );
});

test("S00-H: minimap hover previews and primary click relocates the native viewport", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await clickCanvas(page, 420, 45);
  await expect(page.getByTestId("tactical-minimap")).toBeVisible();

  const baseline = await debugState(page);
  const minimap = page.getByTestId("tactical-minimap");
  await minimap.hover({ position: { x: 121, y: 121 } });
  await expect(page.getByTestId("minimap-preview")).toBeVisible();
  expect((await debugState(page)).minimapPreviewOrigin).toEqual({ x: 36, y: 37 });
  await expect(page.getByTestId("minimap-preview")).toHaveAttribute("style", /left: 108px; top: 111px/);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-minimap-hover-preview.png" });

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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  const screen = page.getByTestId("game-screen");
  const system = page.getByTestId("system-menu-button");
  const group = page.getByTestId("group-command-hotspot");
  const allRest = page.getByTestId("all-rest-hotspot");
  const logicalElementBounds = async (locator: Locator) => locator.evaluate((element) => {
    let node: HTMLElement | null = element as HTMLElement;
    let left = 0;
    let top = 0;
    while (node && !node.classList.contains("logical-screen")) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    const target = element as HTMLElement;
    return { left, top, width: target.offsetWidth, height: target.offsetHeight };
  });
  const naturalSize = (locator: Locator) => locator.evaluate((element) => ({
    width: (element as HTMLImageElement).naturalWidth,
    height: (element as HTMLImageElement).naturalHeight,
  }));

  // Nia is initially focused, so her detail HUD covers the desk and the
  // underlying object hitboxes must not remain blindly clickable.
  await expect(screen).toHaveAttribute("data-hud-mode", "unit");
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "inactive");
  await expect(system).toBeHidden();
  await expect(group).toBeHidden();
  await expect(allRest).toBeHidden();
  await expect(page.getByTestId("hud-identity").locator("span")).toHaveCount(0);
  expect(await logicalElementBounds(page.getByTestId("hud-identity")))
    .toEqual({ left: 484, top: 123, width: 152, height: 22 });
  const unitTopChrome = page.getByTestId("hud-unit-top-chrome");
  const unitBodyFrame = page.getByTestId("hud-unit-body-frame");
  await expect(unitTopChrome).toBeVisible();
  await expect(unitBodyFrame).toBeVisible();
  await expect.poll(() => naturalSize(unitTopChrome)).toEqual({ width: 160, height: 149 });
  await expect.poll(() => naturalSize(unitBodyFrame)).toEqual({ width: 160, height: 171 });
  expect(await logicalElementBounds(unitTopChrome)).toEqual({ left: 480, top: 0, width: 160, height: 149 });
  expect(await logicalElementBounds(unitBodyFrame)).toEqual({ left: 480, top: 150, width: 160, height: 171 });
  expect(await logicalElementBounds(page.locator("#bottom-round"))).toEqual({ left: 480, top: 322, width: 160, height: 28 });
  await captureVisualAudit(screen, { path: "artifacts/playwright/stage0-side-panel-unit-chrome.png" });

  await page.getByTestId("battle-canvas").click({ position: { x: 220, y: 177 } });
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await expect(page.getByTestId("status-strip")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("hud-identity").locator("span")).toHaveCount(0);
  await captureVisualAudit(screen, { path: "artifacts/playwright/stage0-selected-unit-context-strip.png" });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("action-menu")).toBeHidden();

  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await expect(screen).toHaveAttribute("data-hud-mode", "tactical");
  await expect(screen).toHaveAttribute("data-side-panel-hotspots", "active");
  const minimapFrame = page.getByTestId("tactical-minimap-frame");
  await expect(minimapFrame).toBeVisible();
  await expect.poll(() => naturalSize(minimapFrame)).toEqual({ width: 160, height: 171 });
  expect(await logicalElementBounds(minimapFrame)).toEqual({ left: 480, top: 150, width: 160, height: 171 });
  expect(await logicalElementBounds(page.getByTestId("tactical-minimap"))).toEqual({ left: 485, top: 161, width: 150, height: 150 });

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
  await captureVisualAudit(screen, { path: "artifacts/playwright/stage0-side-panel-hotspot-foundation.png" });
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-record-page-4.png",
  });
  await page.getByTestId("record-slot-20").click();
  await expect(page.getByTestId("record-menu")).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.20") ?? "null"));
  expect(saved).toMatchObject({
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    stageId: "stage-00",
    rngState: initial.rngState,
    stageEntrySnapshot: {
      stageId: "stage-00",
      rngState: initial.rngState,
    },
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
  expect(restored.consumedEventIds).toEqual([
    "stage-00-prebattle-story",
    "stage-00-opening-move",
    "stage-00-opening-story",
  ]);
  expect(restored.cursor).toEqual(initial.cursor);
  expect(restored.cameraOrigin).toEqual(initial.cameraOrigin);
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await saveHotspot.hover();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-side-panel-record-hotspots.png",
  });
});

test("RHP-04: grid, edge-scroll and portrait objects control persistent presentation only", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.presentation.v1"));
  await page.reload();
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await canvas.hover({ position: { x: 420, y: 45 } });

  const baseline = await debugState(page);
  expect(baseline).toMatchObject({
    battlePresentation: "full",
    gridEnabled: false,
    edgeScrollEnabled: true,
    portraitsEnabled: true,
    aiDialogueEnabled: true,
  });
  await expect(canvas).toHaveAttribute("data-grid-enabled", "false");
  await expect(canvas).toHaveAttribute("data-grid-line-count", "0");

  const expectNativePointer = async (
    position: { x: number; y: number },
    cursor: "hand" | "up" | "down" | "left" | "right",
    frame: number,
    asset: string,
  ) => {
    await canvas.hover({ position });
    await expect(canvas).toHaveAttribute("data-native-pointer-cursor", cursor);
    await expect(canvas).toHaveAttribute("data-native-pointer-frame", String(frame));
    expect(await canvas.evaluate((element) => getComputedStyle(element).cursor)).toContain(asset);
  };
  await expectNativePointer({ x: 420, y: 45 }, "hand", 0, "command-menu-pointer.png");

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
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-side-panel-grid-enabled.png",
  });

  await edgeScroll.click();
  expect((await debugState(page)).edgeScrollEnabled).toBe(false);
  await expect(canvas).toHaveAttribute("data-edge-scroll-enabled", "false");
  await expect(edgeScrollArt).toHaveAttribute("data-state", "off");
  await expect(edgeScrollArt).toHaveAttribute("data-native-frame", "26");
  const cameraBeforeDisabledEdge = (await debugState(page)).cameraOrigin;
  await expectNativePointer({ x: 220, y: 5 }, "up", 1, "native-cursor-up.png");
  await expectNativePointer({ x: 5, y: 5 }, "up", 1, "native-cursor-up.png");
  await expectNativePointer({ x: 220, y: 340 }, "down", 2, "native-cursor-down.png");
  await expectNativePointer({ x: 5, y: 177 }, "left", 3, "native-cursor-left.png");
  await expect(canvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  await expectNativePointer({ x: 450, y: 177 }, "right", 4, "native-cursor-right.png");
  await expectNativePointer({ x: 420, y: 45 }, "hand", 0, "command-menu-pointer.png");
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  expect((await debugState(page)).cameraOrigin).toEqual(cameraBeforeDisabledEdge);

  // The native edge direction survives the toggle: with automatic scrolling
  // off, primary down still moves once immediately and repeats while held.
  const cameraBeforeDisabledClick = (await debugState(page)).cameraOrigin;
  await canvas.click({ position: { x: 5, y: 177 } });
  await expect.poll(async () => (await debugState(page)).cameraOrigin.x).toBe(
    cameraBeforeDisabledClick.x - 1,
  );
  await expect(canvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  const cameraAfterDisabledClick = (await debugState(page)).cameraOrigin;
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  expect((await debugState(page)).cameraOrigin).toEqual(cameraAfterDisabledClick);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-disabled-edge-click-pan.png",
  });

  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.move(canvasBounds!.x + 5, canvasBounds!.y + 177);
  await page.mouse.down({ button: "left" });
  await expect(canvas).toHaveAttribute("data-primary-pointer-held", "true");
  await expect(canvas).toHaveAttribute("data-edge-pan-direction", "-1,0");
  await expect.poll(async () => (await debugState(page)).cameraOrigin.x).toBeLessThanOrEqual(
    cameraAfterDisabledClick.x - 2,
  );
  await page.mouse.up({ button: "left" });
  await expect(canvas).toHaveAttribute("data-primary-pointer-held", "false");
  await expect(canvas).toHaveAttribute("data-edge-pan-direction", "0,0");
  const cameraAfterDisabledHold = (await debugState(page)).cameraOrigin;
  await page.waitForTimeout(EDGE_PAN_SETTLE_MS);
  expect((await debugState(page)).cameraOrigin).toEqual(cameraAfterDisabledHold);

  const restoreSteps = cameraBeforeDisabledEdge.x - cameraAfterDisabledHold.x;
  expect(restoreSteps).toBeGreaterThan(0);
  for (let step = 0; step < restoreSteps; step += 1) {
    await canvas.click({ position: { x: 450, y: 177 } });
  }
  expect((await debugState(page)).cameraOrigin).toEqual(cameraBeforeDisabledEdge);
  await expectNativePointer({ x: 420, y: 45 }, "hand", 0, "command-menu-pointer.png");

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
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-side-panel-toggle-visuals.png",
  });

  await page.getByTestId("system-menu-button").click();
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("presentation-button").locator(".native-settings-state")).toHaveText("OFF");
  await expect(page.getByTestId("grid-button").locator(".native-settings-state")).toHaveText("ON");
  await expect(page.getByTestId("edge-scroll-button").locator(".native-settings-state")).toHaveText("OFF");
  await expect(page.getByTestId("portraits-button").locator(".native-settings-state")).toHaveText("OFF");
  await expect(page.getByTestId("ai-dialogue-button").locator(".native-settings-state")).toHaveText("ON");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-settings-ai-dialogue.png",
  });
  await page.getByTestId("ai-dialogue-button").click();
  await expect(page.getByTestId("ai-dialogue-button").locator(".native-settings-state")).toHaveText("OFF");
  expect((await debugState(page)).aiDialogueEnabled).toBe(false);

  await page.reload();
  expect(await debugState(page)).toMatchObject({
    battlePresentation: "map",
    gridEnabled: true,
    edgeScrollEnabled: false,
    portraitsEnabled: false,
    aiDialogueEnabled: false,
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

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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

test("RHP-05b: the 移動 switch gates the ordinary player walk, not only scripted movement", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.sound.v1"));
  await page.reload();
  const app = page.locator("#app");

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");

  const movementRequests = async () => Number(await app.getAttribute("data-movement-effect-request-count"));
  const movementPlaybacks = async () => Number(await app.getAttribute("data-movement-effect-count"));

  // Walk (29,26) → (28,26) and take it back, so every call leaves the board in
  // its starting arrangement and contributes exactly one ordinary player walk.
  const walkUnitOneCell = async () => {
    await clickCanvas(page, 220, 177);
    await expect(page.getByTestId("action-menu")).toBeVisible();
    await page.getByTestId("unit-command-move").click();
    await expect.poll(async () => (await debugState(page)).actionMode).toBe("move");
    await page.getByTestId("battle-canvas").hover({ position: { x: 180, y: 177 } });
    await clickCanvas(page, 180, 177);
    await expect.poll(async () => (await debugState(page)).commandMenuKind).toBe("postMove");
    await page.getByTestId("unit-command-undo").click();
    await expect.poll(async () => (await debugState(page)).commandMenuKind).toBe("initial");
    await expect.poll(async () => {
      const unit = (await debugState(page)).units.find(({ id }) => id === "1:0");
      return unit ? { x: unit.x, y: unit.y } : undefined;
    }).toEqual({ x: 29, y: 26 });
  };

  // With the switch on, an ordinary player 移動 both requests and plays E/14.
  const enabledRequests = await movementRequests();
  const enabledPlaybacks = await movementPlaybacks();
  await walkUnitOneCell();
  expect(await movementRequests()).toBeGreaterThan(enabledRequests);
  expect(await movementPlaybacks()).toBeGreaterThan(enabledPlaybacks);
  // E/14 runs 1.261 s but this walk is one step, so the clip must already be
  // released once the unit has arrived rather than sounding over the next
  // action. The short release fade is why this polls instead of reading once.
  await expect.poll(async () => await app.getAttribute("data-walk-effect-active"))
    .toBe("false");
  expect((await debugState(page)).movementPresentation).toBeUndefined();

  await page.getByTestId("battle-canvas").click({ button: "right", position: { x: 220, y: 177 } });
  await expect(page.getByTestId("action-menu")).toBeHidden();
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  const soundHotspot = page.getByTestId("sound-hotspot");
  await expect(soundHotspot).toBeVisible();
  await soundHotspot.click();
  await expect(page.getByTestId("sound-settings-menu")).toBeVisible();
  await page.getByTestId("sound-movement-button").click();
  await expect(page.getByTestId("sound-movement-button")).toHaveText("移動 關");
  await page.getByTestId("close-sound-settings").click();
  await expect(page.getByTestId("sound-settings-menu")).toBeHidden();

  // With it off the request still reaches the gate — matching the native
  // wrapper 0000:0249, which tests DS:10EC bit 0 before submitting — but no
  // sound is played, and the deterministic state is untouched.
  const gatedBaseline = await debugState(page);
  const disabledRequests = await movementRequests();
  const disabledPlaybacks = await movementPlaybacks();
  await walkUnitOneCell();
  expect(await movementRequests()).toBeGreaterThan(disabledRequests);
  expect(await movementPlaybacks()).toBe(disabledPlaybacks);
  const gatedAfter = await debugState(page);
  expect(gatedAfter.rngState).toBe(gatedBaseline.rngState);
  expect(gatedAfter.units).toEqual(gatedBaseline.units);
});

test("RHP-06: music desk object selects five persistent levels without restarting transport", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => localStorage.removeItem("angel2.preferences.music.v1"));
  await page.reload();
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-music-volume-level", "4");
  await expect(app).toHaveAttribute("data-music-volume", "0.32");

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.preferences.music.v1") ?? "null"))).toEqual({
    musicVolume: 3,
  });
  await page.reload();
  expect((await debugState(page)).musicVolume).toBe(3);
  await expect(app).toHaveAttribute("data-music-volume-level", "3");
  await expect(app).toHaveAttribute("data-music-volume", "0.24");
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.keyboard.press("m");
  await expect(page.getByTestId("music-settings-menu")).toBeVisible();
  await expect(page.getByTestId("music-volume-3")).toHaveAttribute("aria-checked", "true");
});

test("RHP-07: all twelve desk objects are discoverable, accessible and coordinate-operable", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-target-dither.png" });
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
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-map-hit-native-frame.png" });

  await page.waitForFunction(() => {
    const canvasElement = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return canvasElement?.dataset.mapCombatPhase === "defenderDeath"
      && canvasElement.dataset.mapCombatFrame === "3";
  });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "6");
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "7");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-map-death-before-erase.png" });

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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-map-death-after-erase.png" });

  await finishPromotionDialogue(page);
  expect((await debugState(page)).phase).toBe("player");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-promotion-before-victory.png" });
  await confirmPromotion(page, "warrior");
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

test("the status strip reports ordinary-combat damage only after the presentation", async ({ page }) => {
  // Both presentations count the life bars down themselves, so the strip must
  // narrate the swing while it plays and report the exchange only once it is
  // over. Writing the damage line before the await spoiled the result under
  // either battle-animation setting.
  const attackWithStatusTrace = async (presentation: "map" | "full") => {
    await page.evaluate(() => {
      const samples: Array<{ presenting: boolean; statusMessage: string }> = [];
      const interval = window.setInterval(() => {
        const current = window.__ANGEL2__?.getState() as DebugState | undefined;
        if (current) samples.push({
          presenting: Boolean(current.combatPresentation),
          statusMessage: current.statusMessage,
        });
      }, 4);
      Object.assign(window, { __statusTrace: samples, __statusTraceInterval: interval });
    });

    await page.keyboard.press(" ");
    // The fixture leaves exactly one adjacent enemy, so 攻擊 auto-locks it and
    // commits without a target click.
    await page.getByTestId("unit-command-attack").click();
    await page.waitForFunction(() => window.__ANGEL2__?.getState().combatPresentation !== undefined);
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `artifacts/playwright/stage0-${presentation}-combat-strip-narration.png`,
      animations: "allow",
    });
    await page.waitForFunction(() => window.__ANGEL2__?.getState().combatPresentation === undefined);
    const reported = await debugState(page);
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `artifacts/playwright/stage0-${presentation}-combat-strip-report.png`,
      animations: "allow",
    });

    return {
      reported,
      samples: await page.evaluate(() => {
        const holder = window as typeof window & {
          __statusTrace?: Array<{ presenting: boolean; statusMessage: string }>;
          __statusTraceInterval?: number;
        };
        if (holder.__statusTraceInterval !== undefined) window.clearInterval(holder.__statusTraceInterval);
        return holder.__statusTrace ?? [];
      }),
    };
  };

  for (const presentation of ["map", "full"] as const) {
    await page.goto("/?test=1&skipStartup=1");
    await skipStoryDialogue(page);
    await waitForPhase(page, "openingStory");
    await skipStoryDialogue(page);
    await waitForPhase(page, "player");
    await setBattlePresentation(page, presentation);
    // The class-action fixture restarts Nia at zero experience and leaves a
    // second ally unspent, so this swing neither queues a promotion prompt nor
    // hands the phase over — the report it writes is the one that stays up.
    await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("cavalry"));

    const { reported, samples } = await attackWithStatusTrace(presentation);
    const presenting = samples.filter(({ presenting: active }) => active);
    expect(presenting.length).toBeGreaterThan(0);
    expect(presenting.every(({ statusMessage }) => !statusMessage.includes("點傷害"))).toBe(true);
    expect(presenting.every(({ statusMessage }) => statusMessage === "妮雅攻擊士兵……")).toBe(true);
    expect(reported.promotionUnitIds).toEqual([]);
    expect(reported.lastCombat!.damage).toBeGreaterThan(0);
    expect(reported.statusMessage).toBe(
      `造成 ${reported.lastCombat!.damage} 點傷害${reported.lastCombat!.counterDamage
        ? `，受到 ${reported.lastCombat!.counterDamage} 點反擊`
        : ""}。`,
    );
  }
});

test("S00-K: native full-screen records, step tables and death sequence preserve map-mode results", async ({ page }) => {
  // The full-screen presentation is a measured wall-clock timeline, so the
  // runs that inspect its individual beats use `slowFull` to play it at native
  // speed instead of the compressed test-mode rate.
  const enterPlayableBattle = async ({ nativeSpeed = false } = {}) => {
    await page.goto(`/?test=1&skipStartup=1${nativeSpeed ? "&slowFull=1" : ""}`);
    await skipStoryDialogue(page);
    await waitForPhase(page, "openingStory");
    await skipStoryDialogue(page);
    await waitForPhase(page, "player");
  };
  const attackFirstForcedTarget = async () => {
    await page.evaluate(() => window.__ANGEL2__?.forceMultipleTargets());
    await page.keyboard.press(" ");
    await page.getByTestId("unit-command-attack").click();
    const targeting = await debugState(page);
    const target = targeting.targets[0];
    const targetUnit = targeting.units.find(({ x, y }) => x === target.x && y === target.y);
    if (!targetUnit) throw new Error("forced ordinary-combat target is missing");
    await clickCanvas(
      page,
      40 + (target.x - targeting.cameraOrigin.x) * 40 + 20,
      23 + (target.y - targeting.cameraOrigin.y) * 44 + 22,
    );
    return {
      id: targetUnit.id,
      life: targetUnit.life,
      experience: targetUnit.experience,
    };
  };

  await enterPlayableBattle();
  await setBattlePresentation(page, "map");
  await attackFirstForcedTarget();
  await confirmPromotion(page);
  // The attack submits the last manual ally and asynchronously starts the
  // enemy route phase. Compare both presentation modes at the same stable
  // round boundary instead of racing different animation durations.
  await waitForPhase(page, "round2Story");
  const mapResolved = await debugState(page);

  await enterPlayableBattle({ nativeSpeed: true });
  await setBattlePresentation(page, "full");
  const fullTargetBefore = await attackFirstForcedTarget();

  const fullLayer = page.getByTestId("combat-presentation");
  // The window opens before the scene: panels first, then the framed stage.
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.fullScene?.showScene === true);
  await expect(fullLayer).toHaveAttribute("data-full-left-record", "M_00/50");
  await expect(fullLayer).toHaveAttribute("data-full-right-record", "Y_00/0");
  // Stage 0's DS:78DC entry is C/5 and its indoor terrain slots never reach
  // the 964E override chain, so the palace backdrop stands for every battle.
  await expect(page.getByTestId("full-combat-background")).toHaveAttribute("data-record", "5");
  await expect(page.getByTestId("full-combat-background"))
    .toHaveAttribute("src", "/assets/original/full-combat/backgrounds/05.png");
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
  await expect.poll(async () => (await debugState(page)).combatPresentationTrace
    .find(({ phase }) => phase === "fullImpact")?.fullScene?.sprites
    .find(({ set }) => set === "plus50")?.frame).toBe(4);
  const primaryImpact = (await debugState(page)).combatPresentationTrace
    .find(({ phase }) => phase === "fullImpact")?.fullScene;
  const primaryImpactActor = primaryImpact?.sprites.find(({ set }) => set === "plus50");
  expect(primaryImpactActor).toMatchObject({ frame: 4, mirror: false });
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "12");
  await expect(page.getByTestId("hp-bar")).toHaveAttribute(
    "aria-label",
    new RegExp(`生命 ${fullTargetBefore.life}／`),
  );
  await expect(page.getByTestId("exp-bar")).toHaveAttribute(
    "aria-label",
    new RegExp(`經驗 ${fullTargetBefore.experience}／`),
  );
  // The 10 ms return frame can fall entirely between two browser rAF samples
  // under parallel load. Its frame/x path is covered deterministically by the
  // full-combat unit test; this browser gate uses the frozen impact trace and
  // the stable hold below instead of racing that transient frame.
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-primary-impact.png",
  });

  // Keep the settled victim and damage number visible for the tuned 667 ms
  // before the counter begins; the primary actor has already left.
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullHold");
  await expect(fullLayer).toHaveAttribute("data-full-combat-phase", "fullHold");
  await expect(page.getByTestId("full-actor-sprite")).toBeHidden();
  await expect(page.getByTestId("full-victim-sprite")).toBeVisible();
  await expect(page.getByTestId("full-damage-number")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-counter-buffer.png",
  });
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterWindup");

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterImpact");
  const counterReaction = await debugState(page);
  expect(counterReaction.lastCombat?.counterDamage).toBeLessThanOrEqual(10);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "3");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "0");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-counter-guard.png" });

  // The final nonfatal reaction uses the same hold instead of immediately
  // dropping the full-screen layer back to the map.
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterHold");
  await expect(fullLayer).toHaveAttribute("data-full-combat-phase", "fullCounterHold");
  await expect(page.getByTestId("full-actor-sprite")).toBeHidden();
  await expect(page.getByTestId("full-victim-sprite")).toBeVisible();
  await expect(page.getByTestId("full-damage-number")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-final-hold.png",
  });

  await confirmPromotion(page);
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
  expect((beat("fullCounterWindup")?.t ?? 0) - (beat("fullHold")?.t ?? 0)).toBe(667);
  expect(beat("fullCounterHold")?.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
  expect(beat("fullCounterHold")?.sprites.find(({ set }) => set === "direct"))
    .toMatchObject({ frame: 3, reaction: "guard", lift: 0 });
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
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-cavalry-counter.png" });

  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullCounterImpact");
  const cavalryHit = (await debugState(page)).combatPresentation?.fullScene;
  // Contact hands the surviving G1 channel back to the up-canted frame 6, which
  // deflects out of the window along the native (-30,-16) post-hit script
  // instead of leaving the lance planted at the contact point.
  expect(cavalryHit?.lance).toMatchObject({ side: "right", frame: 6 });
  expect(cavalryHit?.lance?.x).toBeGreaterThanOrEqual(-44);
  expect(cavalryHit?.lance?.x).toBeLessThanOrEqual(106);
  expect(cavalryHit?.sprites.find(({ set }) => set === "direct"))
    .toMatchObject({ side: "left", x: 120 });
  expect(cavalryHit?.damage?.amount).toBeGreaterThan(0);
  const cavalryVictimX = cavalryHit?.sprites.find(({ set }) => set === "direct")?.x;
  // The 36 px apex occupies a single 50 ms post-hit substep, which the default
  // attribute-assertion backoff regularly steps over; rAF polling samples every
  // rendered frame and catches it.
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="full-victim-sprite"]')
      ?.getAttribute("data-lift") === "36");
  const cavalryApex = (await debugState(page)).combatPresentation?.fullScene;
  expect(cavalryApex?.sprites.find(({ set }) => set === "direct")?.x).toBe(cavalryVictimX);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-cavalry-recoil-apex.png" });
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.fullScene?.lance === undefined);

  await enterPlayableBattle({ nativeSpeed: true });
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await setBattlePresentation(page, "full");
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const presentation = window.__ANGEL2__?.getState().combatPresentation;
    return presentation?.phase === "fullOpen" && presentation.fullScene?.showScene === false;
  });
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "7");
  await expect(canvas).toHaveAttribute("data-combat-shadow-unit-count", "1");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-fatal-map-snapshot.png",
  });
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullImpact");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "1");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "12");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-fatal-hurt.png" });
  await page.waitForFunction(() =>
    window.__ANGEL2__?.getState().combatPresentation?.phase === "fullDefenderDeath");
  await expect(fullLayer).toHaveAttribute("data-full-combat-phase", "fullDefenderDeath");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-frame", "2");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-lift", "0");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-full-native-death.png" });
  await page.waitForFunction(() => {
    const canvasElement = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return canvasElement?.dataset.mapCombatPhase === "defenderDeath"
      && canvasElement.dataset.mapCombatFrame === "3";
  });
  await expect(fullLayer).toBeHidden();
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "7");
  await expect(canvas).toHaveAttribute("data-combat-shadow-unit-count", "1");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-map-death-before-erase.png",
  });
  await page.waitForFunction(() => {
    const canvasElement = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return canvasElement?.dataset.mapCombatPhase === "defenderDeath"
      && Number(canvasElement.dataset.mapCombatFrame) >= 6;
  });
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "6");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-full-map-death-after-erase.png",
  });
  await confirmPromotion(page);
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
    ...Array.from({ length: 15 }, () => "defenderDeath" as const),
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
  await page.getByTestId("dialogue-layer").click();
  expect((await debugState(page)).dialogueIndex).toBe(0);
  await expect(page.locator("#dialogue-text")).toContainText("寬廣走廊");
  await page.getByTestId("dialogue-layer").click();
  expect((await debugState(page)).dialogueIndex).toBe(1);

  // Reach SAY0/KY5, where the prior upper window remains open while the
  // wounded soldier starts speaking in the lower window.
  for (let checkpoint = 1; checkpoint < 4; checkpoint += 1) {
    await page.getByTestId("dialogue-layer").click();
    await page.getByTestId("dialogue-layer").click();
  }
  expect((await debugState(page)).dialogueIndex).toBe(4);
  await expect(layer).toHaveAttribute("data-source-wait", "5");
  await expect(page.getByTestId("dialogue-window-upper")).toBeVisible();
  await expect(page.getByTestId("dialogue-window-lower")).toBeVisible();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("怎麼會傷成這樣");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("不好了");
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute("data-portrait-record", "47");
  await expectNativeDialogueGeometry(page, "upper");
  await expectNativeDialogueGeometry(page, "lower");

  await page.getByTestId("dialogue-layer").click();
  await page.getByTestId("dialogue-layer").click();
  expect((await debugState(page)).dialogueIndex).toBe(5);
  await expect(layer).toHaveAttribute("data-source-wait", "6");
  await expect(layer).toHaveAttribute("data-reveal-start", /^[1-9][0-9]*$/);
  const appendedDialogue = page.locator("#dialogue-text");
  await expect(appendedDialogue).toContainText("不好了");
  if (!(await appendedDialogue.textContent())?.includes("騎士團的軍隊")) {
    await page.getByTestId("dialogue-layer").click();
  }
  await expect(appendedDialogue).toContainText("騎士團的軍隊");
  await page.waitForTimeout(130);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-dual-dialogue.png" });

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await confirmPromotion(page);
  await waitForPhase(page, "victoryStory");

  const advanceOneCheckpoint = async () => {
    const before = (await debugState(page)).dialogueIndex;
    await page.getByTestId("dialogue-layer").click();
    if ((await debugState(page)).dialogueIndex === before) {
      await page.getByTestId("dialogue-layer").click();
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
  await page.getByTestId("dialogue-layer").click();
  expect((await debugState(page)).dialogueIndex).toBe(3);
});

test("S00-M: native system records restore battle state and combat cues follow presentation events", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());
  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
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
  await expectNativeMenuChrome(page.getByTestId("quit-confirm-menu"), 76);
  await page.locator("[data-action=quit-confirm]").click();
  await expect(page.getByTestId("quit-feedback-text")).toHaveText("唉啊！．．．要休息了嗎？\n請再考慮一下吧！");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-quit-confirm.png" });
  await page.locator("[data-action=quit-cancel]").click();
  expect((await debugState(page))).toMatchObject({ phase: "player", quitConfirmOpen: false });

  await openSystemMenu(page);
  await page.getByTestId("system-command-save").click();
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await expect(page.getByTestId("record-slot-1")).toContainText("此處沒有記錄");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-save-selector.png" });
  await page.getByTestId("record-slot-1").click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.1") ?? "null"));
  expect(saved).toMatchObject({
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    rngState: initial.rngState,
    stageEntrySnapshot: {
      stageId: "stage-00",
      rngState: initial.rngState,
    },
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
    await skipStoryDialogue(page);
    await waitForPhase(page, "openingStory");
    await skipStoryDialogue(page);
    await waitForPhase(page, "player");
  };

  await enterPlayerPhase();
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await page.getByTestId("retry-button").click();
  expect((await debugState(page)).phase).toBe("defeat");
  await expect(page.getByTestId("feedback-text")).toHaveText("啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！");
  await expect(page.getByTestId("feedback-portrait")).toHaveAttribute("data-portrait-record", "46");
  expect(await page.getByTestId("native-feedback")
    .getByTestId("feedback-portrait-name").textContent()).toBe("妮  雅");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-defeat-feedback.png" });

  await enterPlayerPhase();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await clickCanvas(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await confirmPromotion(page);
  await waitForPhase(page, "victoryStory");
  await skipStoryDialogue(page);
  await page.getByTestId("victory-continue").click();
  expect((await debugState(page)).phase).toBe("victoryFeedback");
  await expect(page.getByTestId("feedback-text")).toHaveText("哦！．．\n這次的戰役結束了，是否要記錄下來．");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-victory-feedback.png" });
  await page.getByTestId("victory-continue").click();
  expect((await debugState(page)).phase).toBe("savePrompt");
  await expect(page.getByRole("menu", { name: "是否儲存" })).toBeVisible();
  await expectNativeMenuChrome(page.getByTestId("save-confirm-menu"), 76);
  await expect(page.getByTestId("save-yes")).toHaveText("確 定");
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-native-save-confirm.png" });
});

test("S00-R: Ximi independently enters the shared promotion tree and commits a semantic class", async ({ page }) => {
  await page.goto("/");
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => "__ANGEL2__" in window)).toBe(false);
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("difficulty-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await skipStoryDialogue(page);
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible({ timeout: 10_000 });
  await skipStoryDialogue(page);
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-phase", "player");

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-settings").click();
  await page.getByTestId("presentation-button").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();

  await clickCanvas(page, 180, 309);
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", "我方・玩家・可行動，士兵希蜜");
  await page.getByTestId("unit-command-move").click();
  await clickCanvas(page, 100, 309);
  await expect(page.getByTestId("action-menu")).toHaveAttribute("data-kind", "postMove");
  await page.getByTestId("unit-command-attack").click();
  const promotionDialogue = page.getByTestId("dialogue-layer");
  await expect(promotionDialogue).toBeVisible();
  await expect(promotionDialogue).toHaveAttribute("data-source-record", "promotion");
  await expect(promotionDialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("promotion-layer")).toBeHidden();
  await page.getByTestId("dialogue-layer").click();
  await expect(page.locator("#dialogue-text")).toHaveText(
    "我的經驗值已達到轉職的目標，\n請主將授我新的職業．",
  );
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute(
    "data-portrait-record",
    "45",
  );
  await expectNativeDialogueGeometry(page, "lower");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-ximi-promotion-request.png",
  });
  await page.getByTestId("dialogue-layer").click();
  await expect(promotionDialogue).toHaveAttribute("data-source-wait", "2");
  await page.getByTestId("dialogue-layer").click();
  await expect(page.locator("#dialogue-text")).toHaveText(
    "現在我在水神「愛西斯」的面前，\n授予妳新的職業．",
  );
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("請主將授我新的職業");
  await expect(page.getByTestId("dialogue-portrait-composite")).toHaveAttribute(
    "data-portrait-record",
    "46",
  );
  await expectNativeDialogueGeometry(page, "upper");
  await expectNativeDialogueGeometry(page, "lower");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-ximi-promotion-grant.png",
  });
  await page.getByTestId("dialogue-layer").click();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  await expect(page.getByTestId("promotion-layer").locator("h2")).toContainText("希蜜・士兵轉職");
  await expect(page.getByTestId("promotion-layer").locator(".promotion-option")).toHaveCount(4);
  const currentPromotionText = await page.getByTestId("promotion-layer").locator(".promotion-current").innerText();
  const lifeMatch = currentPromotionText.match(/生命 (\d+)\//);
  expect(lifeMatch).not.toBeNull();
  const ximiLifeAtPromotion = lifeMatch![1];
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-ximi-promotion-choice.png" });
  await confirmPromotion(page, "sister");

  // The mandatory promotion overlay recenters its queued unit before it opens.
  await page.getByTestId("battle-canvas").hover({ position: { x: 220, y: 177 } });
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", "我方・玩家・已行動，修女希蜜");
  await expect(page.getByTestId("unit-level-stat")).toHaveText(/等級\s*1/);
  await expect(page.getByTestId("hp-bar")).toHaveAttribute("aria-label", new RegExp(`生命 ${ximiLifeAtPromotion}／`));
  await expect(page.getByTestId("exp-bar")).toHaveAttribute("aria-label", /^經驗 0／/);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-ximi-promoted-map.png" });
});

test("S00-P: stage zero uses native entry-to-loop music pairs and preserves them across volume changes", async ({ page }) => {
  const app = page.locator("#app");
  const battleRequests = new Set<string>();
  page.on("request", (request) => {
    const match = request.url().match(/\/assets\/original\/(battle-stage0-[^?]+\.wav)/);
    if (match) battleRequests.add(match[1]);
  });

  await page.goto("/?test=1&skipStartup=1");
  const decodedLoopBoundaryDbfs = await page.evaluate(async () => {
    const decoder = new OfflineAudioContext(2, 1, 48_000);
    const inspect = async (url: string) => {
      const response = await fetch(url);
      const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
      const deltas = Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
        const samples = buffer.getChannelData(channel);
        return samples[0] - samples[samples.length - 1];
      });
      const rms = Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length);
      return 20 * Math.log10(rms);
    };
    return Promise.all([
      inspect("/assets/original/battle-stage0-player-loop-seamless.wav"),
      inspect("/assets/original/battle-stage0-enemy-loop-seamless.wav"),
    ]);
  });
  for (const boundaryDbfs of decodedLoopBoundaryDbfs) expect(boundaryDbfs).toBeLessThan(-28);
  await expect(app).toHaveAttribute("data-music-track", "MAGIC/73");
  await expect(app).toHaveAttribute("data-music-playing", "false");
  await expect(app).toHaveAttribute("data-music-engine", "web-audio");
  await expect(app).toHaveAttribute("data-music-volume-level", "4");
  await expect(app).toHaveAttribute("data-music-volume", "0.32");

  // A neutral click supplies the browser user gesture without advancing SAY/0000.
  await page.getByTestId("game-screen").click({ position: { x: 620, y: 340 } });
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "true");
  await expect(app).toHaveAttribute("data-music-seamless-loop", "true");
  expect(Number(await app.getAttribute("data-music-boundary-dbfs"))).toBeLessThan(-30);

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/7");
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "false");
  await expect(app).toHaveAttribute("data-music-seamless-loop", "true");
  await expect(app).toHaveAttribute("data-music-crossfade-ms", "23.220");
  expect(Number(await app.getAttribute("data-music-boundary-dbfs"))).toBeLessThan(-30);
  expect(battleRequests.has("battle-stage0-player-entry.wav")).toBe(true);
  expect(battleRequests.has("battle-stage0-player-loop-seamless.wav")).toBe(true);
  expect(battleRequests.has("battle-stage0-player-loop.wav")).toBe(false);

  // MUSIC/7 is a 7.85 second non-looping entry. MUSIC/6 is already scheduled
  // on the Web Audio timeline before the entry ends; the ended event only
  // changes debug state and cannot introduce a playback gap or advance play.
  await expect(app).toHaveAttribute("data-music-track", "MUSIC/6", { timeout: 10_000 });
  await expect(app).toHaveAttribute("data-music-playing", "true");
  await expect(app).toHaveAttribute("data-music-loop", "true");
  expect(battleRequests.has("battle-stage0-player-loop-seamless.wav")).toBe(true);
  expect((await debugState(page)).phase).toBe("openingStory");

  await skipStoryDialogue(page);
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
  expect(battleRequests.has("battle-stage0-enemy-loop-seamless.wav")).toBe(true);
  expect(battleRequests.has("battle-stage0-enemy-loop.wav")).toBe(false);
});
