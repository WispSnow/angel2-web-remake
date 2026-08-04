import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage3State {
  stageId: string;
  phase: string;
  actionMode: string;
  activeStoryId?: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  rngCalls: number;
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
  specialActionPresentation?: { phase: string; frame: number };
  lastSpecialAction?: {
    actionId: string;
    healing: number;
    experienceGained: number;
    affectedUnits: Array<{ unitId: string; healing: number; blocked: boolean }>;
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
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage3State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage3State | undefined)?.phase === expected,
  phase,
);

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

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("S03-A/B/C/J: stage 3 boots from evidence content with the corrected objective", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: /通過力場/u })).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "12");
  expect(await state(page)).toMatchObject({
    stageId: "stage-03",
    phase: "openingStory",
    activeStoryId: "stage-03-opening-story",
  });
  expect((await state(page)).units).toHaveLength(25);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage3-opening-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗敵人首領「莎」");
  await expect(page.getByTestId("objective-panel")).toContainText("「希蜜」或「黛西」戰敗");
  await page.getByTestId("objective-panel").screenshot({
    path: `${ARTIFACT_DIR}/stage3-corrected-objective.png`,
  });
});

test("S03-F/G: monk recovery exposes the native menu and marks only allies inside its effect diamond", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("monk"));
  const setup = await state(page);
  const actor = setup.units.find(({ side, classId, x, y }) =>
    side === 1 && classId === "monk" && x === 29 && y === 26);
  const target = setup.units.find(({ side, id, x, y }) =>
    side === 1 && id !== actor?.id && x === 31 && y === 26);
  if (!actor || !target) throw new Error("missing recovery fixture units");

  await clickUnit(page, actor.id);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toHaveText("初級治療");
  await expect(page.getByTestId("technique-recovery-1")).toHaveText("初級回復");
  await page.getByTestId("technique-recovery-1").click();
  await clickUnit(page, target.id);

  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "recoveryEffect"
      && Number(canvas.dataset.mapCombatFrame) >= 3
      && Number(canvas.dataset.mapCombatEffectTileCount) === 2;
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage3-recovery-effect.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage3State | undefined;
    return current?.lastSpecialAction?.actionId === "recovery-1"
      && current.specialActionPresentation === undefined;
  });
  const result = await state(page);
  expect(result.lastSpecialAction).toMatchObject({ actionId: "recovery-1" });
  expect(result.lastSpecialAction!.healing).toBeGreaterThan(0);
  expect(result.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 36,
    reason: "recovery-1-start",
  }));
});

test("S03-D/E/H/I: Sha defeat plays SAY/13 once and completes to the stage-04 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const commander = (await state(page)).units.find(({ side, acted }) => side === 1 && !acted);
  if (!commander) throw new Error("missing stage-3 victory commander");
  await clickUnit(page, commander.id);
  await page.getByTestId("unit-command-attack").click();
  const promotion = page.getByTestId("promotion-layer");
  if (await promotion.isVisible()) await page.getByTestId("promotion-target-cavalry").click();
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "13");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("由於希蜜等人的幫助");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage3-victory-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.locator("[data-action=save-no]").click();
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({
    stageId: "stage-03",
    campaignRoute: "stage-04",
  });
  await expect(page.getByText("第 3 關已完成", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage3-stage4-boundary.png`,
  });
});

test("S03-E: either protected commander triggers defeat", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await waitForPhase(page, "defeat");
  await expect(page.locator("#status-strip")).toHaveText("「希蜜」或「黛西」戰敗");
  await expect(page.getByTestId("feedback-text")).toContainText("竟然失敗了");
});

test("stage 3 group commands use the current allied focus instead of absent Nia", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("希蜜");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "45");
  await expect(page.getByTestId("dialogue-layer"))
    .toHaveAttribute("data-source-address", "DS:86E4");
});

test("stage 3 promotions use Himi as the on-field grantor while Nia is absent", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() => window.__ANGEL2__?.forcePromotionSetup());
  await clickUnit(page, "1:4");
  await page.getByTestId("unit-command-attack").click();
  await expect(page.getByTestId("dialogue-layer"))
    .toHaveAttribute("data-source-record", "promotion");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("拉朵那");
  await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
  expect(await page.locator("#dialogue-speaker-upper").textContent()).toBe("希蜜");
  await page.waitForTimeout(120);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage3-promotion-himi-grantor.png`,
  });
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "45");
});
