import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { completeCampaignRoster } from "../../src/game/content/stage0";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage1DebugState {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  consumedEventIds: string[];
  rngState: number;
  rngCalls: number;
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    life: number;
    acted: boolean;
  }>;
  lastSpecialAction?: {
    actionId: string;
    actorId: string;
    damage: number;
    affectedUnits: Array<{ unitId: string; moved: boolean }>;
  };
  specialActionPresentation?: { phase: string; frame: number };
  specialActionPresentationTrace: Array<{ phase: string; frame: number }>;
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
}

const stage0ClearSave = () => ({
  format: "ANGEL2-web-save" as const,
  version: 7 as const,
  contentVersion: "stage-01-actions-1" as const,
  kind: "completed" as const,
  savedAt: "2026-08-02T12:00:00.000Z",
  saveCount: 1,
  stageId: "stage-01" as const,
  stageLabel: "騎士城堡前" as const,
  ruleset: "stableRemake" as const,
  difficulty: 0 as const,
  rngState: 0x71a9_2002,
  rngCalls: 17,
  roster: completeCampaignRoster(),
  stageProgress: 0 as const,
  consumedEventIds: [] as string[],
});

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage1DebugState,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage1DebugState | undefined)?.phase === expected,
  phase,
);

const clickMapCell = (page: Page, x: number, y: number) =>
  page.getByTestId("battle-canvas").click({ position: { x, y } });

async function enterStage1PlayerPhase(page: Page): Promise<void> {
  const save = stage0ClearSave();
  await page.goto("/?test=1");
  await page.evaluate((value) => localStorage.setItem("angel2.save.1", JSON.stringify(value)), save);
  await page.reload();
  await page.keyboard.press("x");
  await page.getByTestId("continue-game").click();
  await page.getByTestId("title-record-slot-1").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveAttribute("data-source-record", "4");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MAGIC/72");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-prebattle.png`,
  });
  await page.getByTestId("skip-dialogue").click();

  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await expect(page.getByTestId("deployment-roster-4")).toContainText("葛蒂拉斯");
  await page.getByTestId("deployment-roster-4").click();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 6／8");
  await page.getByTestId("deployment-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-deployment.png`,
  });
  await page.getByTestId("deployment-finish").click();

  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveAttribute("data-source-record", "5");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-opening.png`,
  });
  const opening = await state(page);
  expect(opening).toMatchObject({
    stageId: "stage-01",
    phase: "openingStory",
    activeStoryId: "stage-01-opening-story",
    consumedEventIds: [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
    ],
  });
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(6);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(7);
  expect(opening.units).toContainEqual(expect.objectContaining({
    id: "1:24",
    classId: "magician",
    x: 21,
    y: 33,
  }));
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
}

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("S01-A through S01-E: deployment, techniques, save restore and victory route run in the main game", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await enterStage1PlayerPhase(page);
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", /MUSIC\/(10|11)/u);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "aria-label",
    "騎士城堡前戰術地圖，使用滑鼠或方向鍵操作",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-player-start.png`,
  });

  const checkpoint = await state(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-2").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("angel2.save.2") ?? "null"));
  expect(saved).toMatchObject({
    version: 7,
    contentVersion: "stage-01-actions-1",
    kind: "battle",
    stageId: "stage-01",
    stageLabel: "騎士城堡前",
    rngCalls: checkpoint.rngCalls,
    stageProgress: 0,
    consumedEventIds: checkpoint.consumedEventIds,
  });
  expect(saved.roster).toHaveLength(75);

  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("magician"));
  expect((await state(page)).units).not.toEqual(checkpoint.units);
  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  await page.getByTestId("record-slot-2").click();
  const restored = await state(page);
  expect(restored).toMatchObject({
    stageId: "stage-01",
    phase: "player",
    rngState: checkpoint.rngState,
    rngCalls: checkpoint.rngCalls,
  });
  expect(restored.units).toEqual(checkpoint.units);

  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await expect(page.getByTestId("native-feedback")).toBeVisible();
  await expect(page.getByTestId("feedback-text")).toHaveAttribute(
    "data-full-text",
    /竟然失敗了/,
  );
  await page.getByTestId("retry-button").click();
  await page.getByTestId("retry-button").click();
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await page.getByTestId("deployment-roster-4").click();
  await page.getByTestId("deployment-finish").click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "5");
  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");

  await page.evaluate(() => window.__ANGEL2__?.forceEnemySisterSetup());
  const enemyFireBefore = await state(page);
  const niaBeforeEnemyFire = enemyFireBefore.units.find(({ id }) => id === "1:0")!;
  await page.keyboard.press("F1");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute(
    "data-source-record",
    "battle-command",
  );
  for (let input = 0; input < 6; input += 1) {
    const commandDialogue = page.getByTestId("dialogue-layer");
    if (!await commandDialogue.isVisible()
      || await commandDialogue.getAttribute("data-source-record") !== "battle-command") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.specialActionPresentation?.phase === "fireEffect";
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-enemy-sister-fire.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.phase === "player"
      && current.lastSpecialAction?.actorId === "2:43"
      && current.lastSpecialAction.actionId === "fire-1";
  });
  const enemyFireAfter = await state(page);
  expect(enemyFireAfter.units.find(({ id }) => id === "1:0")?.life)
    .toBe(niaBeforeEnemyFire.life - enemyFireAfter.lastSpecialAction!.damage);

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  await page.getByTestId("record-slot-2").click();

  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("magician"));
  const lightningBefore = await state(page);
  const bossBeforeLightning = lightningBefore.units.find(({ id }) => id === "2:16")!;
  await clickMapCell(page, 220, 177);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-1")).toHaveText("初級炎暴");
  await expect(page.getByTestId("technique-lightning-1")).toHaveText("初級落雷");
  await expect(page.getByTestId("technique-ice-1")).toHaveText("初級冰雪");
  await page.getByTestId("technique-lightning-1").click();
  await clickMapCell(page, 260, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.specialActionPresentation?.phase === "lightningMain"
      && current.specialActionPresentation.frame >= 8;
  });
  await expect(page.getByTestId("battle-canvas"))
    .not.toHaveAttribute("data-map-combat-effect-tile-count", "0");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-lightning.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.lastSpecialAction?.actionId === "lightning-1"
      && current.specialActionPresentation === undefined;
  });
  const lightningAfter = await state(page);
  expect(lightningAfter.units.find(({ id }) => id === "2:16")?.life)
    .toBeLessThan(bossBeforeLightning.life);
  expect(lightningAfter.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(32);
  expect(lightningAfter.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningHit"))
    .toHaveLength(22);
  expect(lightningAfter.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningCleanup"))
    .toHaveLength(5);
  expect(lightningAfter.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 43,
    reason: "lightning-1-impact",
  }));

  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("magician"));
  await clickMapCell(page, 220, 177);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-1").click();
  await clickMapCell(page, 260, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.specialActionPresentation?.phase === "iceExpansion";
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-ice.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage1DebugState | undefined;
    return current?.lastSpecialAction?.actionId === "ice-1"
      && current.specialActionPresentation === undefined;
  });
  const iceAfter = await state(page);
  expect(iceAfter.lastSpecialAction?.affectedUnits).toContainEqual(expect.objectContaining({
    unitId: "2:16",
    moved: true,
  }));
  expect(iceAfter.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(12);
  expect(iceAfter.audioCueLog.filter(({ group, record }) => group === "un" && record === 50))
    .toHaveLength(2);

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-load").click();
  await page.getByTestId("record-slot-2").click();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await clickMapCell(page, 220, 177);
  await page.getByTestId("unit-command-attack").click();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
  await page.getByTestId("promotion-target-cavalry").click();
  await waitForPhase(page, "victoryStory");
  const victory = await state(page);
  expect(victory).toMatchObject({
    stageId: "stage-01",
    stageProgress: 999,
    activeStoryId: "stage-01-victory-story",
  });
  expect(victory.units).toContainEqual(expect.objectContaining({
    id: "1:48",
  }));
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "6");
  await page.getByTestId("advance-dialogue").click();
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("就在妮雅等人準備進入騎士團堡時");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-victory-story.png`,
  });
  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.locator("[data-action=save-no]").click();
  await waitForPhase(page, "nextStage");
  expect(await state(page)).toMatchObject({
    stageId: "stage-01",
    stageProgress: 1000,
  });
  await expect(page.getByText("第 1 關已完成", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage1-complete.png`,
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
