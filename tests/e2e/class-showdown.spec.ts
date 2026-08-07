import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

interface ClassShowdownBattleState {
  cameraOrigin: { x: number; y: number };
  cursor: { x: number; y: number };
  actionMode: string;
  actionRange: Array<{ x: number; y: number }>;
  targets: Array<{ x: number; y: number }>;
  effectPreviewCells: Array<{ x: number; y: number }>;
  lastCombat?: { attackerId: string; defenderId: string; defenderDied: boolean };
  combatPresentation?: { phase: string };
  specialActionPresentation?: { phase: string };
  specialActionPresentationTrace: Array<{ phase: string }>;
  units: Array<{
    id: string;
    classId: string;
    statuses: Record<string, number>;
  }>;
}

const classShowdownBattleState = (page: import("@playwright/test").Page) => page.evaluate(() =>
  (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    battle?: ClassShowdownBattleState;
  }).battle);

async function clickClassShowdownWorldCell(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    classShowdownBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!battle || !box) throw new Error("class showdown battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.click({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

async function hoverClassShowdownWorldCell(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    classShowdownBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!battle || !box) throw new Error("class showdown battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.hover({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub links to the memory-only all-class showdown", async ({ page }) => {
  await page.goto("/debug.html");
  const link = page.getByTestId("debug-class-showdown-link");
  await expect(link).toHaveAttribute("href", "/class-showdown.html");
  await expect(link).toContainText("35 組同職業敵我相鄰");
});

test("all-class showdown applies one level to every mirror and enters formal battle", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");

  await expect(page.getByRole("heading", { name: "全職業對陣場" })).toBeVisible();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  await expect(page.getByText("35 MATCHUPS · 70 UNITS")).toBeVisible();
  await expect(page.getByText(/女帝、龍、頭、手屬於特殊運行記錄/)).toBeVisible();
  await expect(page.getByTestId("class-showdown-status")).toContainText("35 組、70 名單位");
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("class-showdown-level").selectOption("2");
  await page.getByTestId("class-showdown-apply-level").click();
  await expect(page.getByTestId("class-showdown-status")).toContainText("全部 35 組職業");
  const setupState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    level: number;
    placements: Array<{ side: number; classId: string; level: number; x: number; y: number }>;
  });
  expect(setupState.mode).toBe("setup");
  expect(setupState.level).toBe(2);
  expect(setupState.placements).toHaveLength(70);
  expect(setupState.placements.every(({ level }) => level === 2)).toBe(true);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-setup.png`,
    fullPage: true,
  });

  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("class-showdown-toolbar")).toContainText("35 組 · 第 2 級資料");
  const battleState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    battle: {
      phase: string;
      campaignPersistenceEnabled: boolean;
      units: Array<{ side: number; classId: string; experience: number; x: number; y: number }>;
    };
  });
  expect(battleState).toMatchObject({
    mode: "battle",
    battle: {
      phase: "player",
      campaignPersistenceEnabled: false,
    },
  });
  expect(battleState.battle.units).toHaveLength(70);
  expect(battleState.battle.units.filter(({ side }) => side === 1)).toHaveLength(35);
  expect(battleState.battle.units.filter(({ side }) => side === 2)).toHaveLength(35);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-battle.png`,
  });

  await page.getByTestId("class-showdown-return").click();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
  expect(pageErrors).toEqual([]);
});

test("jungle warrior melee poison is direct and leaves the persistent native status icon", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickClassShowdownWorldCell(page, 17, 17);
  await expect(page.locator(".hud-identity-name")).toHaveText("叢林戰士");
  await page.getByTestId("unit-command-attack").click();
  await clickClassShowdownWorldCell(page, 18, 17);

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-2"
      && current.combatPresentation === undefined
      && current.specialActionPresentation === undefined;
  });
  const battle = await classShowdownBattleState(page);
  expect(battle?.lastCombat).toMatchObject({
    attackerId: "arena-1-2",
    defenderId: "arena-2-2",
    defenderDied: false,
  });
  expect(battle?.units.find(({ id }) => id === "arena-2-2")?.statuses.poison).toBe(3);
  expect(battle?.specialActionPresentationTrace).toEqual([]);

  await clickClassShowdownWorldCell(page, 18, 17);
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術主動進攻");
  await expect(page.getByTestId("status-strip")).toHaveText("戰術主動進攻");
  await expect(page.getByTestId("status-strip")).not.toContainText("紅色格");
  await expect(page.getByTestId("hud-identity").locator("span")).toHaveCount(0);
  const poisonIcon = page.getByTestId("status-icon-poison");
  await expect(poisonIcon).toHaveAttribute("data-remaining-rounds", "3");
  await expect(poisonIcon).toHaveAttribute("aria-label", "施毒，剩餘 3 回合");
  await expect(poisonIcon.locator("img")).toHaveAttribute(
    "src",
    "/assets/original/status-icons/06.png",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-jungle-poison-status-icon.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("ordinary-hit status careers do not apply their status during a counterattack", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickClassShowdownWorldCell(page, 17, 16);
  await expect(page.locator(".hud-identity-name")).toHaveText("魔劍戰士");
  await page.getByTestId("unit-command-attack").click();
  await clickClassShowdownWorldCell(page, 18, 16);

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-1"
      && current.combatPresentation === undefined
      && current.specialActionPresentation === undefined;
  });
  const battle = await classShowdownBattleState(page);
  expect(battle?.lastCombat).toMatchObject({
    attackerId: "arena-1-1",
    defenderId: "arena-2-1",
    defenderDied: false,
  });
  expect(battle?.units.find(({ id }) => id === "arena-2-1")?.statuses.defenseDown).toBe(3);
  expect(battle?.units.find(({ id }) => id === "arena-1-1")?.statuses.defenseDown).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("unnamed class units use their native branch portrait in the battle HUD", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickClassShowdownWorldCell(page, 17, 15);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "47");

  await page.keyboard.press("Delete");
  await clickClassShowdownWorldCell(page, 17, 17);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "57");

  await page.keyboard.press("Delete");
  await clickClassShowdownWorldCell(page, 18, 17);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "58");
  expect(pageErrors).toEqual([]);
});

test("area techniques add a read-only effect-radius overlay to native selection dither", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // The magic priest is the first visible class with both lightning and area
  // recovery in the showdown roster.
  await clickClassShowdownWorldCell(page, 17, 18);
  await page.getByTestId("unit-command-technique").click();

  await page.getByTestId("technique-lightning-1").click();
  const lightning = await classShowdownBattleState(page);
  expect(lightning).toMatchObject({ actionMode: "specialTarget" });
  expect(lightning?.actionRange.length).toBeGreaterThan(0);
  expect(lightning?.targets.length).toBeGreaterThan(0);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-retained-fraction",
    "0.25",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-cell-count",
    /[1-9]/,
  );
  expect(lightning?.effectPreviewCells).toHaveLength(0);

  await hoverClassShowdownWorldCell(page, 18, 18);
  const lightningPreview = await classShowdownBattleState(page);
  expect(lightningPreview?.effectPreviewCells).toHaveLength(13);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-action-id",
    "lightning-1",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-center",
    "18,18",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-cell-count",
    "13",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-visible-cell-count",
    /[1-9]/,
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-lightning-effect-range.png`,
  });

  // Cancel returns to the technique menu; recovery uses the same target-range
  // projection and must not replace it with its effect radius.
  await page.keyboard.press("Alt");
  await expect.poll(async () => (await classShowdownBattleState(page))?.actionMode)
    .toBe("techniqueMenu");
  await page.getByTestId("technique-recovery-1").click();
  const recovery = await classShowdownBattleState(page);
  expect(recovery).toMatchObject({ actionMode: "specialTarget" });
  expect(recovery?.actionRange.length).toBe(lightning?.actionRange.length);
  expect(recovery?.targets.length).toBeGreaterThan(0);
  expect(recovery?.effectPreviewCells).toHaveLength(0);
  await hoverClassShowdownWorldCell(page, 17, 18);
  const recoveryPreview = await classShowdownBattleState(page);
  expect(recoveryPreview?.effectPreviewCells).toHaveLength(13);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-action-id",
    "recovery-1",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-center",
    "17,18",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-cell-count",
    "13",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-retained-fraction",
    "0.25",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-cell-count",
    /[1-9]/,
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-recovery-effect-range.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("great dragon knight stomp lands on its selected target in the all-class showdown", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // Index 19 is the second matchup in the second column: move from the initial
  // (17,15) focus to the allied great dragon knight at (29,16).
  for (let step = 0; step < 12; step += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 29, y: 16 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("巨龍騎士");
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-stomp-3")).toContainText("女踏");
  await page.getByTestId("technique-stomp-3").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-3"
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/53"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/class-showdown-stomp-3-target-impact.png`,
  });
  expect(pageErrors).toEqual([]);
});
