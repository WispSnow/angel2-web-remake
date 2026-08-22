import { expect, test, type Page } from "@playwright/test";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "../../src/game/content/objective-panel.generated";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage8State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  actionMode: string;
  selectedId?: string;
  focusId: string;
  activeStoryId?: string;
  campaignRoute?: string;
  statusMessage: string;
  cameraOrigin: { x: number; y: number };
  rngState: number;
  rngCalls: number;
  presentationFast: boolean;
  combatSoundEnabled: boolean;
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
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage8State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage8State | undefined)?.phase === expected,
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

test("S08-A/B/C/D/F: stage 7 completion plays three SAY/21 backgrounds and enters the fixed battle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-07-cleared&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "21");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "7");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage7-background-7\.png/u,
  );
  expect(await state(page)).toMatchObject({
    stageId: "stage-08",
    stageProgress: 0,
    phase: "prebattleStory",
    activeStoryId: "stage-08-prebattle-story",
    campaignRoute: "stage-08",
  });
  await expect(page.getByTestId("deployment-screen")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-prebattle-background-7.png`,
  });

  for (let wait = 2; wait <= 8; wait += 1) {
    await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "6");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage7-background-6\.png/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-prebattle-background-6.png`,
  });

  for (let wait = 9; wait <= 16; wait += 1) {
    await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
  }
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "8");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage8-background-8\.png/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-prebattle-background-8.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await expect(dialogue).toHaveAttribute("data-source-record", "156");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(dialogue).toContainText("蘇蘭達便指揮遊騎兵");
  expect((await state(page)).units.filter(({ side }) => side === 1)).toHaveLength(8);
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(11);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  expect((await state(page)).consumedEventIds).toEqual([
    "stage-08-prebattle-story",
    "stage-08-opening-story",
  ]);
  await clickUnit(page, "1:42");
  expect(await state(page)).toMatchObject({ actionMode: "actionMenu", selectedId: "1:42" });
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-former-auto-ranger-player-control.png`,
  });
});

test("S08-D/REMAKE-038: all eight allies are manual and all-rest skips NPC actions", async ({ page }) => {
  await page.goto("/?debugScenario=stage-08-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() => {
    const trace: Array<{ phase: string; focusId: string; statusMessage: string }> = [];
    const interval = window.setInterval(() => {
      const current = window.__ANGEL2__?.getState() as Stage8State | undefined;
      if (current) trace.push({
        phase: current.phase,
        focusId: current.focusId,
        statusMessage: current.statusMessage,
      });
    }, 5);
    Object.assign(window, { __stage8Trace: trace, __stage8TraceInterval: interval });
  });

  await clickUnit(page, "1:42");
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await page.getByTestId("unit-command-rest").click();
  await expect.poll(async () =>
    (await state(page)).units.find(({ id }) => id === "1:42")?.acted).toBe(true);

  await page.keyboard.press("g");
  await page.getByTestId("group-command-allRest").click();
  await page.getByTestId("dialogue-layer").click();
  await waitForPhase(page, "enemy");

  const trace = await page.evaluate(() => {
    const holder = window as typeof window & {
      __stage8Trace?: Array<{ phase: string; focusId: string; statusMessage: string }>;
      __stage8TraceInterval?: number;
    };
    if (holder.__stage8TraceInterval !== undefined) window.clearInterval(holder.__stage8TraceInterval);
    return holder.__stage8Trace ?? [];
  });
  expect(trace.some(({ statusMessage }) => statusMessage.includes("友軍 NPC"))).toBe(false);
});

test("S08-E/F: the last raider triggers the REMAKE-032 SAY/157 victory story", async ({ page }) => {
  await page.goto("/?debugScenario=stage-08-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  // `12E7:0008` draws the stage's own SAY record verbatim, so the panel is
  // checked against that record rather than against remake objective wording.
  await expect(page.getByTestId("objective-panel-text"))
    .toHaveText(NATIVE_OBJECTIVE_PANEL_TEXT[8].join("\n"));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-objective.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  const prepared = await state(page);
  expect(prepared.units.filter(({ side }) => side === 2)).toHaveLength(1);
  expect(prepared.units.find(({ side }) => side === 2)?.life).toBe(1);
  await page.getByTestId("battle-canvas").focus();
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "157");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-wait", "1");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText(
    "看樣子敵人大軍等一會兒就會趕來",
  );
  await expect(page.getByTestId("dialogue-window-upper")).toContainText(
    "我們趕快去與妮雅她們會合吧．」",
  );
  expect(await state(page)).toMatchObject({
    activeStoryId: "stage-08-victory-story",
    consumedEventIds: expect.arrayContaining([
      "stage-08-objective-reached",
      "stage-08-victory-story",
    ]),
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage8-victory-story.png`,
  });
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(0);
});

test("S08-G/H: retry and retreat replay SAY/21, while completion enters stage 9 deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-08-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const entry = await state(page);
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "21");
  expect(await state(page)).toMatchObject({ rngState: entry.rngState, rngCalls: entry.rngCalls });
  expect((await state(page)).units.find(({ id }) => id === "1:8")?.life).toBeGreaterThan(1);

  await skipStoryDialogue(page);
  await waitForPhase(page, "openingStory");
  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.keyboard.press("g");
  await page.getByTestId("group-command-retreat").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "21");

  await page.goto("/?debugScenario=stage-08-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "157");
  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") {
    await page.getByTestId("victory-continue").click();
  }
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "deployment");

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
    stageId: "stage-09",
    stageLabel: "找尋傳說中的飛船",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-08-prebattle-story",
      "stage-08-opening-story",
      "stage-08-objective-reached",
      "stage-08-victory-story",
      "stage-08-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-09",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-09",
  });
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／9");

  await page.goto("/?debugScenario=stage-08-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  expect(await state(page)).toMatchObject({
    stageId: "stage-09",
    stageProgress: 0,
    phase: "deployment",
    campaignRoute: "stage-09",
  });
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
});

test("S08-I: fast and reduced presentation with combat sound off preserves the result", async ({ page }) => {
  const resolveLastRaider = async (configured: boolean) => {
    if (configured) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?debugScenario=stage-08-near-victory&difficulty=0&test=1");
    await page.waitForFunction(() => String(
      (window.__ANGEL2__?.getState() as Stage8State | undefined)?.statusMessage,
    ).startsWith("自動驗收："));
    if (configured) {
      await expect(page.getByTestId("battle-canvas")).toBeVisible();
      await page.evaluate(() => window.__ANGEL2__?.setPresentationFast(true));
      await page.keyboard.press("e");
      await page.getByTestId("sound-combat-button").click();
      await page.getByTestId("close-sound-settings").click();
      await expect(page.getByTestId("system-menu")).toBeHidden();
    }
    await page.getByTestId("battle-canvas").focus();
    await page.keyboard.press(" ");
    await page.getByTestId("unit-command-attack").click();
    await waitForPhase(page, "victoryStory");
    await skipStoryDialogue(page);
    await waitForPhase(page, "victoryFeedback");
    const resolved = await state(page);
    return {
      rngState: resolved.rngState,
      rngCalls: resolved.rngCalls,
      consumedEventIds: resolved.consumedEventIds,
      units: resolved.units.map(({ id, classId, life }) => ({ id, classId, life })),
      presentationFast: resolved.presentationFast,
      combatSoundEnabled: resolved.combatSoundEnabled,
    };
  };

  const normal = await resolveLastRaider(false);
  const configured = await resolveLastRaider(true);
  expect(configured).toMatchObject({ presentationFast: true, combatSoundEnabled: false });
  expect({
    rngState: configured.rngState,
    rngCalls: configured.rngCalls,
    consumedEventIds: configured.consumedEventIds,
    units: configured.units,
  }).toEqual({
    rngState: normal.rngState,
    rngCalls: normal.rngCalls,
    consumedEventIds: normal.consumedEventIds,
    units: normal.units,
  });
});
