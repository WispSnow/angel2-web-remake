import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { attackOnlyAdjacentEnemy } from "./command-controls";
import { activeDialogueRecord, skipStoryDialogue } from "./dialogue-controls";
import { skipOpeningToTitle } from "./startup-controls";
import { expectStoryBackground } from "./story-background";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage30State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  focusId: string;
  statusMessage: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
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
    experience: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage30State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage30State | undefined)?.phase === expected,
  phase,
);

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

async function acknowledgeBattleContext(page: Page): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.click();
  if (await activeDialogueRecord(page) === "battle-context") {
    await dialogue.click();
  }
}

async function advanceDialogueCheckpoint(page: Page, wait: number): Promise<void> {
  const dialogue = page.getByTestId("dialogue-layer");
  const previousWait = String(wait - 1);
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-wait") === previousWait) await dialogue.click();
  await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
}

test("S30-A–E: SAY/0057 and SAY/0058 lead through the Empress mutation into the fixed-trio battle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-29-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "57");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "23");
  await expectStoryBackground(page, /story-stage29-background-23\.png/u);
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("收復騎士團堡");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-prebattle-story",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-prebattle-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "58");
  await expect(dialogue).toContainText("女帝");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toEqual([
    expect.objectContaining({ id: "1:40", classId: "magic-sword-warrior", x: 30, y: 19 }),
    expect.objectContaining({ id: "1:7", classId: "magic-priest", name: "琴斯", x: 26, y: 25 }),
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 28, y: 25 }),
  ]);
  expect(opening.units.filter(({ side }) => side === 2)).toEqual([
    expect.objectContaining({
      id: "2:27", classId: "empress", name: "維絲塔", portrait: 41, x: 28, y: 17,
    }),
  ]);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await expect(dialogue).toHaveAttribute("data-source-record", "battle-context");
  await expect(dialogue).toHaveAttribute("data-source-wait", "34");
  await expect(dialogue).toContainText("頭好痛啊");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "41");
  // Module 29's dialogue blink draws D/41 frame 7 while the stage is undecided.
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-red-eyes", "true");
  expect((await state(page)).units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "empress",
    portrait: 41,
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-opening-form-context.png`,
  });

  await acknowledgeBattleContext(page);
  await waitForPhase(page, "player");
  const player = await state(page);
  expect(player.round).toBe(1);
  expect(player.units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "soldier",
    name: "維絲塔",
    portrait: 41,
    experience: 0,
    acted: false,
  });
  expect(player.consumedEventIds).toEqual([
    "stage-30-prebattle-story",
    "stage-30-opening-story",
    "stage-30-opening-form-transition",
  ]);
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[30].join("\n"));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-objective-and-map.png`,
  });
});

test("S30-F–I: the difficulty-final form changes sides before SAY/0059, saves v60, and enters stage 31", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-near-victory&difficulty=3&test=1");
  await waitForPhase(page, "player");
  const prepared = await state(page);
  expect(prepared.cameraOrigin).toEqual({ x: 24, y: 20 });
  expect(prepared.units.find(({ id }) => id === "2:27")).toMatchObject({
    classId: "wizard",
    portrait: 41,
    x: 28,
    y: 23,
    life: 1,
    experience: 0,
  });
  await clickCell(page, 27, 23);
  await attackOnlyAdjacentEnemy(page);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "battle-context");
  await expect(dialogue).toContainText("頭好痛啊");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "41");
  // The last line comes before the conversion writes the live victory 999.
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-red-eyes", "true");
  expect((await state(page)).units.find(({ id }) => id === "2:27")).toBeUndefined();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-final-form-context.png`,
  });

  await acknowledgeBattleContext(page);
  await waitForPhase(page, "victoryStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "59");
  await expect(dialogue).toContainText("女帝恢復正常");
  const restored = await state(page);
  expect(restored.units.find(({ id }) => id === "2:27")).toBeUndefined();
  expect(restored.units.find(({ id }) => id === "1:23")).toMatchObject({
    side: 1,
    slot: 23,
    classId: "empress",
    name: "維絲塔",
    portrait: 41,
    experience: 0,
  });
  // The rejoined Empress is written long after the scene preloaded its figures; her ally
  // sprite used to be missing, so she rendered as Phaser's `__MISSING` placeholder.
  await expect.poll(async () => (JSON.parse(
    await page.getByTestId("battle-canvas").getAttribute("data-unit-texture-by-id") ?? "{}",
  ) as Record<string, string>)["1:23"]).toBe("ally-empress");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-victory-story.png`,
  });

  for (let wait = 2; wait <= 6; wait += 1) {
    await advanceDialogueCheckpoint(page, wait);
    expect(await state(page)).toMatchObject({
      stageId: "stage-30",
      phase: "victoryStory",
      activeStoryId: "stage-30-victory-story",
    });
  }
  await dialogue.click();
  if ((await state(page)).phase === "victoryStory") await dialogue.click();
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("恢復神智");
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
      roster: Array<{ slot: number; classId: string; experience: number }>;
      consumedEventIds: string[];
    });
  expect(completedSave).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    stageId: "stage-31",
    stageLabel: "前往斯德林海峽",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-30-prebattle-story",
      "stage-30-opening-story",
      "stage-30-opening-form-transition",
      "stage-30-objective-reached",
      "stage-30-completed-route",
    ],
  });
  expect(completedSave.roster.find(({ slot }) => slot === 23)).toMatchObject({
    classId: "empress",
    experience: 0,
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "60");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-stage31-prebattle.png`,
  });

  await page.goto("/?test=1");
  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();
  // 完成档的记录摘要显示刚打完的第 30 关；存档本身仍以第 31 关入口为身份。
  await expect(page.getByTestId("title-record-slot-1"))
    .toHaveAttribute("aria-label", /治癒維斯塔女帝/u);
  await page.getByTestId("title-record-slot-1").click();
  await waitForPhase(page, "prebattleStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-31",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-31",
    activeStoryId: "stage-31-prebattle-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "60");
});

test("S30-G: Nia defeat retries from SAY/0057", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "57");
  expect(await state(page)).toMatchObject({
    stageId: "stage-30",
    stageProgress: 0,
    phase: "prebattleStory",
    campaignRoute: "stage-30",
    activeStoryId: "stage-30-prebattle-story",
  });
});

/**
 * Regression: the save contract held 維絲塔 to exactly the experience her form is rebuilt
 * with, but she earns experience whenever she trades blows and survives. 已儲存至記錄
 * showed, yet from her first such exchange every record listed as 此處沒有記錄 and the
 * export skipped it as 損壞, whatever the round.
 */
test("S30-J: a record saved after 維絲塔 has fought lists and reloads", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-player&difficulty=3&test=1");
  await waitForPhase(page, "player");
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  // The trio rests and 維絲塔 closes in to strike; acknowledge whatever lines she speaks.
  await expect.poll(async () => {
    const current = await state(page);
    if (current.phase === "player" && current.round === 2) return true;
    const dialogue = page.getByTestId("dialogue-layer");
    if (await dialogue.isVisible()) await dialogue.click();
    return false;
  }, { timeout: 30_000 }).toBe(true);
  const fought = await state(page);
  const vesta = fought.units.find(({ id }) => id === "2:27");
  expect(vesta?.experience).toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-1").click();
  await expect.poll(async () => (await state(page)).statusMessage).toBe("已儲存至記錄 1。");

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  const record = page.getByTestId("record-slot-1");
  await expect(record).toContainText("治癒維斯塔女帝");
  await expect(record).not.toContainText("此處沒有記錄");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-record-after-combat.png`,
  });
  await record.click();
  await expect.poll(async () => (await state(page)).statusMessage).toBe("已讀取記錄 1。");
  const loaded = await state(page);
  expect(loaded).toMatchObject({ phase: "player", round: 2 });
  expect(loaded.units.find(({ id }) => id === "2:27")).toEqual(vesta);
});


/**
 * REMAKE-157: stage 30 keeps REMAKE-110's time-out boundary but moves it to round 199,
 * since on 無法無天 the trio has to break 32 forms. The fixture parks the board there.
 */
test("S30-K/REMAKE-157: the stage 30 cap sits at round 199 and still loses on time", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-round-limit&difficulty=0&test=1");
  await waitForPhase(page, "player");
  expect((await state(page)).round).toBe(199);
  // The native round box keeps the last three digits, so 199 fits it unchanged.
  await expect(page.locator("#bottom-round-text")).toHaveText("第 199 回合");
  await expect(page.locator("#bottom-round")).toHaveAttribute("data-round-limit-warning", "true");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-round-limit-final-round.png`,
  });

  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await expect.poll(async () => {
    if ((await state(page)).phase === "defeat") return true;
    const dialogue = page.getByTestId("dialogue-layer");
    if (await dialogue.isVisible()) await dialogue.click();
    return false;
  }, { timeout: 30_000 }).toBe(true);
  await expect(page.locator("#status-strip")).toHaveText("未能在 199 回合內達成目標");
  await expect(page.locator("#bottom-round-text")).toHaveText("第 199 回合");
});

/**
 * Module 29 checks `0000:85EC/860E/862B` before it draws an eye frame: while stage 30 is
 * undecided, 維絲塔's unit detail shows D/41 frame 7 in place of every blink frame.
 */
test("S30-L: the possessed 維絲塔 shows the native red eyes in the unit detail", async ({ page }) => {
  await page.goto("/?debugScenario=stage-30-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const composite = page.getByTestId("unit-portrait-composite");
  // The cursor opens on Nia at (28,25); 維絲塔's soldier form stands at (28,17).
  await expect(composite).toHaveAttribute("data-portrait-record", "46");
  await expect(composite).toHaveAttribute("data-red-eyes", "false");
  for (let step = 0; step < 8; step += 1) await page.keyboard.press("ArrowUp");
  await expect(composite).toHaveAttribute("data-portrait-record", "41");
  await expect(composite).toHaveAttribute("data-red-eyes", "true");
  await expect(composite.locator(".portrait-red-eyes")).toHaveCSS("opacity", "1");
  for (const index of [1, 2, 3]) {
    await expect(composite.locator(`.portrait-eye-${index}`)).toHaveCSS("opacity", "0");
  }
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage30-red-eyes-unit-detail.png`,
  });
});
