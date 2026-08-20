import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage7State {
  stageId: string;
  stageProgress: number;
  phase: string;
  activeStoryId?: string;
  campaignRoute?: string;
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
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage7State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage7State | undefined)?.phase === expected,
  phase,
);

test("S07-A/B/C: accepted stage-6 completion plays SAY/17 and enters two-plus-five deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-06-cleared&difficulty=0&test=1");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "17");
  await expect(dialogue).toHaveAttribute("data-source-wait", "1");
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "6");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage7-background-6\.png/u,
  );
  expect(await state(page)).toMatchObject({
    stageId: "stage-07",
    stageProgress: 0,
    phase: "prebattleStory",
    activeStoryId: "stage-07-prebattle-story",
    campaignRoute: "stage-07",
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage7-prebattle-background-6.png`,
  });

  for (let wait = 2; wait <= 14; wait += 1) {
    await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
    await expect(dialogue).toHaveAttribute("data-source-wait", String(wait));
    if (wait === 11) {
      const upperText = page.getByTestId("dialogue-window-upper").locator(".dialogue-copy p");
      await expect(upperText).toHaveText(
        "「所以為了妳們的安全，我只能留妳們過今晚，等天\n  一亮妳們就得離開。」",
      );
      const firstLineLayout = await upperText.evaluate((text) => {
        const copy = text.parentElement;
        const glyphs = Array.from(text.querySelectorAll<HTMLElement>(".dialogue-glyph"));
        const firstLine = glyphs.slice(0, 23);
        if (!copy || firstLine.length !== 23) throw new Error("missing upper-dialogue first line");
        const copyBounds = copy.getBoundingClientRect();
        const textBounds = text.getBoundingClientRect();
        const firstGlyphBounds = firstLine[0].getBoundingClientRect();
        const lastGlyphBounds = firstLine.at(-1)!.getBoundingClientRect();
        return {
          inset: {
            x: textBounds.left - copyBounds.left,
            y: textBounds.top - copyBounds.top,
          },
          lineWidth: lastGlyphBounds.right - firstGlyphBounds.left,
          rightClearance: copyBounds.right - lastGlyphBounds.right,
          glyphWidths: firstLine.map((glyph) => glyph.getBoundingClientRect().width),
          leadingSpaceWidths: glyphs.slice(23, 25).map((glyph) => glyph.getBoundingClientRect().width),
        };
      });
      expect(firstLineLayout.inset).toEqual({ x: 12, y: 12 });
      expect(firstLineLayout.lineWidth).toBe(368);
      expect(firstLineLayout.rightClearance).toBe(20);
      expect(new Set(firstLineLayout.glyphWidths)).toEqual(new Set([16]));
      expect(firstLineLayout.leadingSpaceWidths).toEqual([8, 8]);
      await captureVisualAudit(page.getByTestId("dialogue-window-upper"), {
        path: `${ARTIFACT_DIR}/stage7-long-upper-dialogue.png`,
      });
    }
  }
  await expect(page.locator("#story-background")).toHaveAttribute("data-background-id", "7");
  await expect(page.locator("#story-background")).toHaveCSS(
    "background-image",
    /story-stage7-background-7\.png/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage7-prebattle-background-7.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "來到異世界 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／7");
  await expect(page.locator(".deployment-entry:not(.is-empty)")).toHaveCount(13);
  await expect(page.locator(".deployment-open-cell")).toHaveCount(5);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-1")).toContainText("固定");
  await expect(page.getByTestId("deployment-roster-1")).toContainText("希蜜");

  for (const rosterIndex of [2, 3, 4, 5, 6]) {
    await page.getByTestId(`deployment-roster-${rosterIndex}`).click();
  }
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 7／7");
  await page.getByTestId("deployment-roster-7").click();
  await expect(page.getByTestId("deployment-status")).toContainText("出場人數已滿");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage7-deployment.png`,
  });

  const before = await state(page);
  await page.getByTestId("deployment-finish").click();
  await page.getByTestId("deployment-finish").click();
  await waitForPhase(page, "player");
  const battle = await state(page);
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(7);
  expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(11);
  expect(battle.rngCalls).toBe(before.rngCalls);
  expect(battle.consumedEventIds).toEqual([
    "stage-07-prebattle-story",
    "stage-07-enter-deployment",
  ]);
});

test("S07-D/E: the objective names Laili and removing slot 18 ends the battle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-07-near-laili&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("打敗入侵的敵首領「萊莉」");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("妖龍");
  await page.locator("[data-action=close-objectives]").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage7-battle-map.png`,
  });

  expect((await state(page)).units).toContainEqual(expect.objectContaining({
    id: "2:18",
    slot: 18,
    classId: "land-knight",
    name: "萊莉",
    portrait: 19,
    life: 1,
  }));
  await page.keyboard.press(" ");
  await page.getByTestId("unit-command-attack").click();
  const promotion = page.getByTestId("promotion-layer");
  await expect(promotion).toBeVisible();
  await page.locator("[data-action=promotion-target]").first().click();
  await waitForPhase(page, "victoryFeedback");
  expect((await state(page)).units.some(({ id }) => id === "2:18")).toBe(false);
});

test("S07-F/G/H: defeat and retreat replay SAY/17, victory saves v25, and enters stage 8", async ({ page }) => {
  await page.goto("/?debugScenario=stage-07-near-defeat&difficulty=0&test=1");
  const entry = await state(page);
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("retry-button")).toBeVisible();
  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") {
    await page.getByTestId("retry-button").click();
  }
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "17");
  expect(await state(page)).toMatchObject({ rngState: entry.rngState, rngCalls: entry.rngCalls });
  expect((await state(page)).units.find(({ id }) => id === "1:0")?.life).toBeGreaterThan(1);
  await skipStoryDialogue(page);
  await waitForPhase(page, "deployment");
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 2／7");

  await page.getByTestId("deployment-finish").click();
  if ((await state(page)).phase === "deployment") {
    await page.getByTestId("deployment-finish").click();
  }
  await waitForPhase(page, "player");
  await page.keyboard.press("g");
  await page.getByTestId("group-command-retreat").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await waitForPhase(page, "prebattleStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "17");

  await page.goto("/?debugScenario=stage-07-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
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
    stageId: "stage-08",
    stageLabel: "營地遭到偷襲",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-07-prebattle-story",
      "stage-07-enter-deployment",
      "stage-07-objective-reached",
      "stage-07-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-08",
    stageProgress: 0,
    phase: "prebattleStory",
    activeStoryId: "stage-08-prebattle-story",
    campaignRoute: "stage-08",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "21");

  await page.goto("/?debugScenario=stage-07-cleared&difficulty=0&test=1");
  await waitForPhase(page, "prebattleStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-08",
    stageProgress: 0,
    phase: "prebattleStory",
    activeStoryId: "stage-08-prebattle-story",
    campaignRoute: "stage-08",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "21");
});

test("S07-I: fast and reduced presentation with combat sound off preserves the result", async ({ page }) => {
  const resolveLaili = async (configured: boolean) => {
    if (configured) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?debugScenario=stage-07-near-laili&difficulty=0&test=1");
    await page.waitForFunction(() => String(
      (window.__ANGEL2__?.getState() as Stage7State | undefined)?.statusMessage,
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
    await expect(page.getByTestId("promotion-layer")).toBeVisible();
    await page.locator("[data-action=promotion-target]").first().click();
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

  const normal = await resolveLaili(false);
  const configured = await resolveLaili(true);
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
