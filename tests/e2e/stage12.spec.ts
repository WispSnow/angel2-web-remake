import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { expectStoryBackground } from "./story-background";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage12State {
  stageId: string;
  stageProgress: number;
  phase: string;
  actionMode: string;
  battlePresentation: "map" | "full";
  focusId: string;
  activeStoryId?: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  lastCombat?: {
    defenderId: string;
    damage: number;
  };
  combatPresentation?: {
    phase: string;
    displayedAttackerLife: number;
    displayedDefenderLife: number;
    displayedLifeByUnitId: Record<string, number>;
  };
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    x: number;
    y: number;
    life: number;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage12State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage12State | undefined)?.phase === expected,
  phase,
);

async function waitForBackgroundImage(page: Page): Promise<void> {
  await page.locator("#story-background").evaluate(async (element) => {
    const match = /url\(["']?(.*?)["']?\)/u.exec(getComputedStyle(element).backgroundImage);
    if (!match?.[1]) throw new Error("story background URL is missing");
    const image = new Image();
    image.src = match[1];
    await image.decode();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function waitForBattleScene(page: Page, unitCount: number): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("aria-label", /落入沼澤戰術地圖/u);
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", String(unitCount));
  await canvas.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function setBattlePresentation(page: Page, mode: "map" | "full"): Promise<void> {
  if ((await state(page)).battlePresentation !== mode) {
    await page.getByTestId("battle-presentation-hotspot").evaluate((button) => button.click());
  }
  await expect.poll(async () => (await state(page)).battlePresentation).toBe(mode);
}

const renderedLifeByUnitId = (page: Page) => page.getByTestId("battle-canvas").evaluate(
  (canvas) => JSON.parse(canvas.dataset.unitDisplayedLifeById ?? "{}") as Record<string, number>,
);

async function startPreparedWaterWarriorAttack(page: Page): Promise<number> {
  await waitForPhase(page, "player");
  const prepared = await state(page);
  const root = prepared.units.find(({ id }) => id === "2:40");
  const split = prepared.units.find(({ id }) => id === "2:40:split-1");
  expect(root).toBeDefined();
  expect(split).toMatchObject({ life: root?.life });
  expect(prepared.focusId).toBe("1:1");
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  return root!.life;
}

test("S12-A/B/C: stage 10 completion plays the crash story, deploys 1–9, then opens on BK/14", async ({ page }) => {
  await page.goto("/?debugScenario=stage-10-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "29");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "10");
  await expectStoryBackground(page, /story-stage10-background-10\.png/u);
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("女帝現在的狀況");
  await waitForBackgroundImage(page);
  expect(await state(page)).toMatchObject({
    stageId: "stage-12",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-12",
    activeStoryId: "stage-12-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage12-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "落入沼澤 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／9");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(8);
  await expect(page.getByTestId("deployment-guidance")).toContainText("水戰士受到近戰攻擊後可能分裂");
  for (let rosterIndex = 1; rosterIndex <= 8; rosterIndex += 1) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 9／9");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage12-deployment.png`,
  });

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "30");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "14");
  await expect(page.locator("#story-background")).toBeVisible();
  await expectStoryBackground(page, /story-stage12-background-14\.png/u);
  await waitForBackgroundImage(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage12-opening-story.png`,
  });
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
  expect(battle.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 23, y: 20, name: "妮雅" });
  expect(battle.units.find(({ id }) => id === "2:40")).toMatchObject({
    x: 39, y: 17, classId: "water-warrior", name: "水戰士",
  });
  expect(battle.consumedEventIds).toEqual([
    "stage-12-prebattle-story",
    "stage-12-enter-deployment",
    "stage-12-opening-story",
  ]);
  await waitForBattleScene(page, 14);
});

test("S12-D: the formal battle restores and renders a shared-life water-warrior split", async ({ page }) => {
  await page.goto("/?debugScenario=stage-12-split&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const current = await state(page);
  const root = current.units.find(({ id }) => id === "2:40");
  const split = current.units.find(({ id }) => id === "2:40:split-1");
  expect(root).toBeDefined();
  expect(split).toBeDefined();
  expect(split).toMatchObject({ side: 2, slot: 40, classId: "water-warrior", life: root?.life });
  expect(current.units.filter(({ side }) => side === 2)).toHaveLength(6);
  await waitForBattleScene(page, 15);
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[12].join("\n"));
  await page.locator("[data-action=close-objectives]").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage12-water-warrior-split.png`,
  });
});

test("S12-D2: map combat defers shared-copy life until the ordinary battle ends", async ({ page }) => {
  await page.goto("/?debugScenario=stage-12-split&difficulty=0&test=1&slowMap=1");
  await waitForPhase(page, "player");
  await setBattlePresentation(page, "map");
  const lifeBefore = await startPreparedWaterWarriorAttack(page);

  await page.waitForFunction(() =>
    (window.__ANGEL2__?.getState() as Stage12State | undefined)
      ?.combatPresentation?.phase === "primaryHit");
  const duringHit = await state(page);
  expect(duringHit.units.find(({ id }) => id === "2:40")!.life).toBeLessThan(lifeBefore);
  expect(duringHit.combatPresentation?.displayedDefenderLife).toBe(lifeBefore);
  expect(duringHit.combatPresentation?.displayedLifeByUnitId["2:40:split-1"]).toBe(lifeBefore);
  await expect.poll(async () => (await renderedLifeByUnitId(page))["2:40:split-1"]).toBe(lifeBefore);
  await page.waitForFunction((before) => {
    const presentation = (window.__ANGEL2__?.getState() as Stage12State | undefined)
      ?.combatPresentation;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    const displayed = JSON.parse(canvas?.dataset.unitDisplayedLifeById ?? "{}") as Record<string, number>;
    return presentation?.phase === "counterHit"
      && presentation.displayedDefenderLife < before
      && displayed["2:40:split-1"] === before;
  }, lifeBefore);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage12-water-warrior-map-life-deferred.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage12State | undefined;
    return current?.lastCombat?.defenderId === "2:40" && current.combatPresentation === undefined;
  });
  const resolved = await state(page);
  const rootLife = resolved.units.find(({ id }) => id === "2:40")!.life;
  expect(rootLife).toBeLessThan(lifeBefore);
  expect(resolved.units.find(({ id }) => id === "2:40:split-1")!.life).toBe(rootLife);
  await expect.poll(async () => (await renderedLifeByUnitId(page))["2:40:split-1"])
    .toBe(rootLife);
});

test("S12-D3: full combat keeps every shared body at pre-battle life until returning to the map", async ({ page }) => {
  await page.goto("/?debugScenario=stage-12-split&difficulty=0&test=1&slowFull=1");
  await waitForPhase(page, "player");
  await setBattlePresentation(page, "full");
  const lifeBefore = await startPreparedWaterWarriorAttack(page);

  await page.waitForFunction(() =>
    (window.__ANGEL2__?.getState() as Stage12State | undefined)
      ?.combatPresentation?.phase === "fullImpact");
  const duringFullCombat = await state(page);
  expect(duringFullCombat.units.find(({ id }) => id === "2:40")!.life).toBeLessThan(lifeBefore);
  expect(duringFullCombat.combatPresentation?.displayedDefenderLife).toBe(lifeBefore);
  expect(duringFullCombat.combatPresentation?.displayedLifeByUnitId["2:40:split-1"])
    .toBe(lifeBefore);
  await expect.poll(async () => (await renderedLifeByUnitId(page))["2:40"]).toBe(lifeBefore);
  await expect.poll(async () => (await renderedLifeByUnitId(page))["2:40:split-1"]).toBe(lifeBefore);
  await expect(page.getByTestId("hp-bar")).toHaveAttribute(
    "aria-label",
    new RegExp(`生命 ${lifeBefore}／`),
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage12-water-warrior-full-life-deferred.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage12State | undefined;
    return current?.lastCombat?.defenderId === "2:40" && current.combatPresentation === undefined;
  });
  const resolved = await state(page);
  const rootLife = resolved.units.find(({ id }) => id === "2:40")!.life;
  expect(rootLife).toBeLessThan(lifeBefore);
  expect(resolved.units.find(({ id }) => id === "2:40:split-1")!.life).toBe(rootLife);
  await expect.poll(async () => (await renderedLifeByUnitId(page))["2:40:split-1"])
    .toBe(rootLife);
  const focusedLife = resolved.units.find(({ id }) => id === resolved.focusId)?.life;
  expect(focusedLife).toBeDefined();
  await expect(page.getByTestId("hp-bar")).toHaveAttribute(
    "aria-label",
    new RegExp(`生命 ${focusedLife}／`),
  );
});

test("S12-E/F: victory plays SAY/31, defeat retries SAY/29, and completion enters playable stage 13", async ({ page }) => {
  await page.goto("/?debugScenario=stage-12-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "31");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("水戰士");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");

  await page.goto("/?debugScenario=stage-12-near-defeat&difficulty=0&test=1");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "29");

  await page.goto("/?debugScenario=stage-12-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "32");

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
    stageId: "stage-13",
    stageLabel: "龍塔外",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-12-prebattle-story",
      "stage-12-enter-deployment",
      "stage-12-opening-story",
      "stage-12-objective-reached",
      "stage-12-victory-story",
      "stage-12-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-13",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-13",
  });
});
