import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage2State {
  stageId: string;
  phase: string;
  round: number;
  actionMode: string;
  focusId: string;
  rngState: number;
  rngCalls: number;
  selectedId?: string;
  activeStoryId?: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    life: number;
    experience: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage2State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage2State | undefined)?.phase === expected,
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

test("S02-A/B/J: stage 2 opens from evidence content and marks six allies as automatic", async ({ page }) => {
  await page.goto("/?debugScenario=stage-02-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: /攻打騎士堡/u })).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "155");
  expect(await state(page)).toMatchObject({
    stageId: "stage-02",
    phase: "openingStory",
    activeStoryId: "stage-02-opening-story",
  });
  expect((await state(page)).units).toHaveLength(14);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage2-opening-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await clickUnit(page, "1:44");
  expect(await state(page)).toMatchObject({ actionMode: "allyPreview", selectedId: "1:44" });
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-range-mode", "allyPreview");
  await expect(page.getByTestId("allied-control-mode")).toContainText("友軍自動");
  await expect(page.getByTestId("action-menu")).toBeHidden();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage2-auto-ally-hud.png`,
  });

  await page.keyboard.press("Escape");
  await clickUnit(page, "1:0");
  expect(await state(page)).toMatchObject({ actionMode: "actionMenu", selectedId: "1:0" });
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage2-fixed-roster-and-auto-ally.png`,
  });
});

test("S02-C/D: all-rest spends only manual units, then every automatic ally acts before enemies", async ({ page }) => {
  await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() => {
    const trace: Array<{ phase: string; focusId: string }> = [];
    const interval = window.setInterval(() => {
      const current = window.__ANGEL2__?.getState() as Stage2State | undefined;
      if (current) trace.push({ phase: current.phase, focusId: current.focusId });
    }, 5);
    Object.assign(window, { __stage2Trace: trace, __stage2TraceInterval: interval });
  });

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await page.getByTestId("advance-dialogue").click();
  await waitForPhase(page, "enemy");

  const trace = await page.evaluate(() => {
    const holder = window as typeof window & {
      __stage2Trace?: Array<{ phase: string; focusId: string }>;
      __stage2TraceInterval?: number;
    };
    if (holder.__stage2TraceInterval !== undefined) window.clearInterval(holder.__stage2TraceInterval);
    return holder.__stage2Trace ?? [];
  });
  const alliedFocusIds = new Set(
    trace.filter(({ phase }) => phase === "allyAuto").map(({ focusId }) => focusId),
  );
  for (const id of ["1:40", "1:41", "1:42", "1:43", "1:44", "1:45"]) {
    expect(alliedFocusIds.has(id), `${id} should receive its automatic action`).toBe(true);
  }
  expect(trace.some(({ phase }) => phase === "allyAuto")).toBe(true);
  expect((await state(page)).phase).toBe("enemy");
});

test("S02-E/H: defeating Lan plays SAY/175 once and enters stage 3", async ({ page }) => {
  await page.goto("/?debugScenario=stage-02-near-victory&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await clickUnit(page, "1:0");
  await page.getByTestId("unit-command-attack").click();
  const promotion = page.getByTestId("promotion-layer");
  await expect(promotion).toBeVisible();
  await page.getByTestId("promotion-target-cavalry").click();
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "175");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("殿下，我們已將敵人全數殲滅了");
  expect(await state(page)).toMatchObject({
    stageId: "stage-02",
    activeStoryId: "stage-02-victory-story",
  });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage2-victory-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.locator("[data-action=save-no]").click();
  await waitForPhase(page, "openingStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-03",
    campaignRoute: "stage-03",
    activeStoryId: "stage-03-opening-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "12");
});

test("REMAKE-016: retreat and defeat restore the immutable stage-entry campaign", async ({ page }) => {
  await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-1").click();
  const baseline = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
      version: number;
      contentVersion: string;
      rngState: number;
      rngCalls: number;
      roster: Array<{ slot: number; classId: string; experience: number; life: number }>;
      stageEntrySnapshot: {
        rngState: number;
        rngCalls: number;
        roster: Array<{ slot: number; classId: string; experience: number; life: number }>;
      };
      battle: {
        units: Array<{
          id: string;
          classId: string;
          className: string;
          experience: number;
          life: number;
        }>;
      };
    };
    const entry = save.stageEntrySnapshot.roster.find(({ slot }) => slot === 0);
    const current = save.roster.find(({ slot }) => slot === 0);
    const unit = save.battle.units.find(({ id }) => id === "1:0");
    if (!entry || !current || !unit) throw new Error("stage-2 save is missing Nia");
    current.classId = "cavalry";
    current.experience = 0;
    current.life = 123;
    unit.classId = "cavalry";
    unit.className = "騎兵";
    unit.experience = 0;
    unit.life = 123;
    save.rngState = 0x2468_ace0;
    save.rngCalls += 23;
    localStorage.setItem("angel2.save.1", JSON.stringify(save));
    return {
      version: save.version,
      contentVersion: save.contentVersion,
      rngState: save.stageEntrySnapshot.rngState,
      rngCalls: save.stageEntrySnapshot.rngCalls,
      rosterEntry: entry,
    };
  });
  expect(baseline).toMatchObject({
    version: 18,
    contentVersion: "dynamic-terrain-2",
  });

  const loadMutatedBattle = async () => {
    await page.keyboard.press("Escape");
    await page.getByTestId("system-command-load").click();
    await page.getByTestId("record-slot-1").click();
    await waitForPhase(page, "player");
    const loaded = await state(page);
    expect(loaded).toMatchObject({ rngState: 0x2468_ace0 });
    expect(loaded.units.find(({ id }) => id === "1:0")).toMatchObject({
      classId: "cavalry",
      experience: 0,
      life: 123,
    });
  };
  const expectEntryCampaign = async () => {
    await waitForPhase(page, "openingStory");
    const restarted = await state(page);
    expect(restarted).toMatchObject({
      stageId: "stage-02",
      round: 1,
      rngState: baseline.rngState,
      rngCalls: baseline.rngCalls,
    });
    expect(restarted.units.find(({ id }) => id === "1:0")).toMatchObject({
      classId: baseline.rosterEntry.classId,
      experience: baseline.rosterEntry.experience,
      life: baseline.rosterEntry.life,
      acted: false,
    });
  };

  await loadMutatedBattle();
  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-retreat").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await page.locator("[data-action=retreat-confirm]").click();
  await expectEntryCampaign();

  await page.getByTestId("skip-dialogue").click();
  await waitForPhase(page, "player");
  await loadMutatedBattle();
  await page.evaluate(() => window.__ANGEL2__?.forceDefeat());
  await expect(page.getByTestId("native-feedback")).toBeVisible();
  await page.getByTestId("retry-button").click();
  await page.getByTestId("retry-button").click();
  await expectEntryCampaign();
});

test("S02-J: fixed battle remains readable in a narrow reduced-motion viewport", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 620 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
  await page.locator(".debug-toolbar-toggle").click();
  const screen = page.getByTestId("game-screen");
  await expect(screen).toBeVisible();
  const bounds = await screen.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(620);
  await expect(page.getByTestId("unit-detail")).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/stage2-narrow-reduced-motion.png`,
    fullPage: true,
  });
});
