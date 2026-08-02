import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub selects a difficulty and opens the formal stage-one deployment", async ({ page }) => {
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-hub")).toBeVisible();
  await expect(page.locator("[data-debug-scenario-id]")).toHaveCount(11);
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
