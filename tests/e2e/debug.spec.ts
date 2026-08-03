import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub selects a difficulty and opens the formal stage-one deployment", async ({ page }) => {
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-hub")).toBeVisible();
  await expect(page.locator("[data-debug-scenario-id]")).toHaveCount(12);
  expect(await page.evaluate(() => window.__ANGEL2_DEBUG__)).toBeUndefined();

  await page.getByTestId("debug-difficulty").selectOption("3");
  const deployment = page.getByTestId("debug-scenario-stage-01-deployment");
  await expect(deployment).toHaveAttribute(
    "href",
    "/?debugScenario=stage-01-deployment&difficulty=3",
  );
  await page.screenshot({ path: `${ARTIFACT_DIR}/debug-hub.png`, fullPage: true });
  await deployment.click();

  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await expect(page.getByTestId("debug-toolbar")).toBeVisible();
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageId: string;
    phase: string;
    difficulty: number;
  });
  expect(state).toMatchObject({
    stageId: "stage-01",
    phase: "deployment",
    difficulty: 3,
  });
  await page.screenshot({ path: `${ARTIFACT_DIR}/debug-stage1-deployment.png` });
});

test("debug scenarios can enter player phases and directly complete either implemented stage", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=2");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("第 0 關");
  await page.getByRole("button", { name: "直接通關" }).click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "4");
  await expect(page.getByTestId("debug-toolbar")).toContainText("stage-01 · prebattleStory");

  await page.goto("/?debugScenario=stage-01-player&difficulty=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const player = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageId: string;
    phase: string;
    units: Array<{ id: string; classId: string }>;
  });
  expect(player).toMatchObject({ stageId: "stage-01", phase: "player" });
  expect(player.units).toContainEqual(expect.objectContaining({ id: "1:24", classId: "magician" }));

  await page.getByRole("button", { name: "直接通關" }).click();
  await expect(page.getByText("第 1 關已完成", { exact: true })).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("stage-01 · nextStage");
  expect((await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageProgress: number;
    campaignRoute?: string;
  }))).toMatchObject({ stageProgress: 1000, campaignRoute: "stage-02" });
});

test("the magician range fixture releases its pursuing target after exactly one enemy phase", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-magician&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const debugState = () => page.evaluate(() => window.__ANGEL2__?.getState() as {
    phase: string;
    round: number;
    units: Array<{
      id: string;
      x: number;
      y: number;
      actionDisabled: boolean;
    }>;
    enemyIntents: Record<string, string>;
    lastSpecialAction?: { actionId: string };
    specialActionPresentation?: object;
  });
  const finishPlayerPhase = async (round: number) => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("group-command-menu")).toBeVisible();
    await page.getByTestId("group-command-allRest").click();
    await expect(page.getByTestId("dialogue-layer")).toBeVisible();
    for (let input = 0; input < 6; input += 1) {
      const dialogue = page.getByTestId("dialogue-layer");
      if (!await dialogue.isVisible()
        || await dialogue.getAttribute("data-source-record") !== "battle-command") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(20);
    }
    await page.waitForFunction((expectedRound) => {
      const current = window.__ANGEL2__?.getState() as {
        phase?: string;
        round?: number;
      } | undefined;
      return current?.phase === "player" && current.round === expectedRound;
    }, round);
  };

  const initial = await debugState();
  expect(initial.enemyIntents).toMatchObject({ "2:45": "pursuit", "2:16": "sentry" });
  expect(initial.units.filter(({ id }) => id.startsWith("2:")).map(({ id }) => id).sort())
    .toEqual(["2:16", "2:45"]);

  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-1").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as {
      lastSpecialAction?: { actionId?: string };
      specialActionPresentation?: object;
    } | undefined;
    return current?.lastSpecialAction?.actionId === "ice-1"
      && current.specialActionPresentation === undefined;
  });

  const frozen = await debugState();
  const frozenTarget = frozen.units.find(({ id }) => id === "2:45");
  expect(frozenTarget?.actionDisabled).toBe(true);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-ice-disabled-unit-ids",
    /2:45/u,
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/debug-stage1-magician-frozen.png`,
  });

  await finishPlayerPhase(2);
  const thawed = await debugState();
  const thawedTarget = thawed.units.find(({ id }) => id === "2:45");
  expect(thawedTarget).toMatchObject({
    x: frozenTarget?.x,
    y: frozenTarget?.y,
    actionDisabled: false,
  });

  await finishPlayerPhase(3);
  const movedTarget = (await debugState()).units.find(({ id }) => id === "2:45");
  expect(movedTarget).toBeDefined();
  expect({ x: movedTarget?.x, y: movedTarget?.y })
    .not.toEqual({ x: thawedTarget?.x, y: thawedTarget?.y });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/debug-stage1-magician-thawed.png`,
  });
});

test("dispel uses its original map animation and releases a frozen ally", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-dispel&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  const frozenTargetId = await page.evaluate(() => {
    const state = window.__ANGEL2__?.getState() as {
      units: Array<{ id: string; actionDisabled: boolean }>;
    };
    return state.units.find(({ actionDisabled }) => actionDisabled)?.id;
  });
  if (!frozenTargetId) throw new Error("dispel fixture is missing its frozen ally");
  await expect(canvas).toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);

  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-dispel")).toHaveText("破邪");
  await page.getByTestId("technique-dispel").click();
  await canvas.click({ position: { x: 260, y: 177 } });

  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return element?.dataset.mapCombatPhase === "dispelEffect"
      && Number(element.dataset.mapCombatFrame) >= 20;
  });
  await expect(canvas).toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);
  await expect(canvas).not.toHaveAttribute("data-map-combat-effect-tile-count", "0");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/debug-stage1-dispel-animation.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as {
      lastSpecialAction?: { actionId?: string };
      specialActionPresentation?: object;
    } | undefined;
    return current?.lastSpecialAction?.actionId === "dispel"
      && current.specialActionPresentation === undefined;
  });
  const state = await page.evaluate(() => window.__ANGEL2__?.getState() as {
    units: Array<{
      id: string;
      acted: boolean;
      actionDisabled: boolean;
      statuses: Record<string, number>;
    }>;
  });
  expect(state.units.find(({ id }) => id === frozenTargetId)).toMatchObject({
    acted: false,
    actionDisabled: false,
    statuses: {
      attackDown: 0,
      defenseDown: 0,
      confusion: 0,
      poison: 0,
      techniqueSeal: 0,
    },
  });
  await expect(canvas).not.toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/debug-stage1-dispel-result.png`,
  });
});

test("debug hub remains usable at a narrow reduced-motion viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-hub")).toBeVisible();
  await expect(page.getByTestId("debug-scenario-stage-01-near-victory")).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/debug-hub-narrow.png`, fullPage: true });
});

test("stage-one dialogue uses generated animation layers for newly introduced speakers", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-prebattle&difficulty=0&test=1");
  for (let input = 0; input < 8; input += 1) {
    if (await page.locator('[data-portrait-record="42"]:visible').count() > 0) break;
    await page.getByTestId("advance-dialogue").click();
    await page.waitForTimeout(30);
  }
  const portrait = page.locator('[data-portrait-record="42"]:visible');
  await expect(portrait).toHaveAttribute("data-portrait-record", "42");
  await expect(portrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(portrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect.poll(async () => Number(await portrait.getAttribute("data-talk-count"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await portrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  await portrait.evaluate((element) => {
    element.dataset.forceBlinkFrame = "3";
    element.dataset.forceMouthFrame = "2";
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-dialogue-mengxinman-animation.png`,
  });
});
