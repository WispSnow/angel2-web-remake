import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage6State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  rngState: number;
  rngCalls: number;
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    portrait: number;
    x: number;
    y: number;
    life: number;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage6State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage6State | undefined)?.phase === expected,
  phase,
);

test("S06-A/B/C: portal completion enters nine-unit deployment and switches SAY/14 backgrounds", async ({ page }) => {
  await page.goto("/?debugScenario=stage-42-completed-route&difficulty=0&test=1");
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "過異世界之門 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 1／9");
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(13);
  await expect(page.locator(".deployment-open-cell")).toHaveCount(8);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");

  for (const rosterIndex of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 9／9");
  await page.getByTestId("deployment-roster-9").click();
  await expect(page.getByTestId("deployment-status")).toContainText("出場人數已滿");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage6-deployment.png`,
  });

  const before = await state(page);
  await page.getByTestId("deployment-finish").click();
  await page.getByTestId("deployment-finish").click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "14");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "5");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage6-background-5\.png/u,
  );
  expect(await state(page)).toMatchObject({
    stageId: "stage-06",
    phase: "prebattleStory",
    activeStoryId: "stage-06-prebattle-story",
    campaignRoute: "stage-06",
  });
  expect((await state(page)).units.filter(({ side }) => side === 1)).toHaveLength(9);
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(9);
  expect((await state(page)).rngCalls).toBe(before.rngCalls);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage6-prebattle-background-5.png`,
  });

  for (let wait = 2; wait <= 7; wait += 1) {
    await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "31");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage6-background-31\.png/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage6-prebattle-background-31.png`,
  });

  await skipStoryDialogue(page);
  await expect(dialogue).toHaveAttribute("data-source-record", "15");
  await expect(dialogue).toContainText("遊騎兵");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect((await state(page)).consumedEventIds).toEqual([
    "stage-06-enter-deployment",
    "stage-06-prebattle-story",
    "stage-06-opening-story",
  ]);
});

test("S06-D/E: the stable-remake objective names Xielei and her removal starts SAY/16", async ({ page }) => {
  await page.goto("/?debugScenario=stage-06-near-xielei&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[6].join("\n"));
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units).toContainEqual(expect.objectContaining({
    id: "2:19",
    slot: 19,
    classId: "land-knight",
    name: "西艾蕾",
    portrait: 5,
    life: 1,
  }));
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  const promotion = page.getByTestId("promotion-layer");
  await expect(promotion).toBeVisible();
  await page.locator("[data-action=promotion-target]").first().click();
  await waitForPhase(page, "scriptedStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "16");
  expect((await state(page)).units.some(({ id }) => id === "2:19")).toBe(false);
});

test("S06-F/G/H/I/J: live victory builds the ranger tableau, saves the current schema, and enters stage 7", async ({ page }) => {
  await page.goto("/?debugScenario=stage-06-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "scriptedStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "16");
  const before = await state(page);
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "115");

  const tableau = await state(page);
  const storyUnits = tableau.units.filter(({ id }) => id.startsWith("story:ranger"));
  expect(storyUnits).toHaveLength(9);
  expect(storyUnits).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "story:ranger:0", slot: 0, x: 6, y: 27 }),
    expect.objectContaining({ id: "story:ranger:7", slot: 7, x: 6, y: 33 }),
    expect.objectContaining({
      id: "story:ranger-leader",
      slot: 17,
      classId: "cavalry",
      name: "阿曼妮",
      portrait: 18,
    }),
  ]));
  const nia = tableau.units.find(({ id }) => id === "1:0");
  const leader = tableau.units.find(({ id }) => id === "story:ranger-leader");
  if (!nia || !leader) throw new Error("stage 6 tableau is missing Nia or the ranger leader");
  expect(Math.abs(leader.x - nia.x) + Math.abs(leader.y - nia.y)).toBe(1);
  expect(tableau.rngState).toBe(before.rngState);
  expect(tableau.rngCalls).toBe(before.rngCalls);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage6-ranger-tableau.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "prebattleStory");

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
    stageId: "stage-07",
    stageLabel: "來到異世界",
    stageProgress: 1000,
  });
  expect(completedSave.consumedEventIds).toContain("stage-06-ranger-leader-move");
  expect(await state(page)).toMatchObject({
    stageId: "stage-07",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-07",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "17");
});

test("S06-K/L: loaded completion enters stage 7 without replaying stage-6 presentation", async ({ page }) => {
  await page.goto("/?debugScenario=stage-06-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const completed = await state(page);
  expect(completed).toMatchObject({
    stageId: "stage-07",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-07",
  });
  expect(completed.activeStoryId).toBe("stage-07-prebattle-story");
  expect(completed.units.some(({ id }) => id.startsWith("story:ranger"))).toBe(false);
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "17");
});
