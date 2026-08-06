import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

interface ArenaBattleDebugState {
  phase: string;
  actionMode: string;
  cameraOrigin: { x: number; y: number };
  rngState: number;
  rngCalls: number;
  terrainOverrides: Array<{ x: number; y: number; kind: "iron-plate" | "obstacle" }>;
  lastConstruction?: {
    actionId: "iron-plate" | "obstacle";
    actorId: string;
    actorPositionBefore: { x: number; y: number };
    actorPositionAfter: { x: number; y: number };
    path: Array<{ x: number; y: number }>;
    terrainMutations: Array<{
      x: number;
      y: number;
      kind: "iron-plate" | "obstacle";
      slotBefore: number;
      slotAfter: number;
      changed: boolean;
    }>;
  };
  lastSpecialAction?: {
    actionId: string;
    actorId: string;
    target: { x: number; y: number };
    damage: number;
    healing: number;
    blocked: boolean;
    blockReason?: "magicGuard" | "frozen" | "classImmune";
    experienceGained: number;
    affectedUnits: Array<{
      unitId: string;
      positionAfter: { x: number; y: number };
      lifeAfter: number;
      experienceAfter: number;
      actionDisabledAfter: boolean;
      moved: boolean;
      damage: number;
      healing: number;
      statusesAfter: Record<string, number>;
      prayerOutcome?: "healing" | "experience" | "attackUp" | "defenseUp";
      prayerRolledAmount?: number;
    }>;
  };
  specialActionPresentation?: { phase: string; frame: number; lifeChangeUnitId?: string };
  specialActionPresentationTrace: Array<{
    phase: string;
    frame: number;
    nativeTicks: number;
    lifeChangeUnitId?: string;
  }>;
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
  units: Array<{
    id: string;
    classId: string;
    x: number;
    y: number;
    life: number;
    experience: number;
    acted: boolean;
    actionDisabled: boolean;
    statuses: Record<string, number>;
  }>;
}

const arenaBattleState = (page: import("@playwright/test").Page) => page.evaluate(() =>
  (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle);

async function clickArenaWorldCell(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    arenaBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!battle || !box) throw new Error("arena battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.click({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("debug hub links to the memory-only all-terrain arena", async ({ page }) => {
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-arena-link")).toHaveAttribute("href", "/arena.html");
  await expect(page.getByTestId("debug-arena-link")).toContainText("正式規則與 AI");
});

test("arena edits both rosters and starts a formal-rule battle without touching saves", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await expect(page.getByRole("heading", { name: "全地形競技場" })).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-ally-count]")).toHaveText("4 人");
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("4 人");
  await expect(page.getByTestId("arena-class").locator("option")).toHaveCount(26);
  await expect(page.locator("[data-terrain-slot]")).toHaveCount(8);
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("arena-side").selectOption("2");
  await page.getByTestId("arena-class").selectOption("magician");
  await page.getByTestId("arena-level").selectOption("3");
  expect(await page.evaluate(() => window.__ANGEL2_ARENA__?.interact(21, 30))).toBe(true);
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  await page.screenshot({ path: `${ARTIFACT_DIR}/arena-setup.png`, fullPage: true });

  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("arena-battle-toolbar")).toContainText("4 vs 5");
  const state = await page.evaluate(() => window.__ANGEL2_ARENA__?.getState() as {
    mode: string;
    battle: {
      stageId: string;
      phase: string;
      campaignPersistenceEnabled: boolean;
      systemCommands: Array<{ id: string }>;
      units: Array<{ side: number; classId: string; x: number; y: number }>;
    };
  });
  expect(state).toMatchObject({
    mode: "battle",
    battle: {
      stageId: "stage-01",
      phase: "player",
      campaignPersistenceEnabled: false,
      systemCommands: [{ id: "settings" }, { id: "objectives" }],
    },
  });
  expect(state.battle.units).toContainEqual(expect.objectContaining({
    side: 2,
    classId: "magician",
    x: 21,
    y: 30,
  }));
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-battle.png`,
  });

  await page.getByTestId("arena-return-setup").click();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
});

test("tier-one great dragon knight performs native 1D stomp in the integrated arena", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-dragon-knight");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const enemy = arena.interact(23, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");
  expect(actorBefore).toBeDefined();
  expect(targetBefore).toBeDefined();
  await clickArenaWorldCell(page, 20, 30);
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-stomp-1")).toContainText("龍踏");
  await page.getByTestId("technique-stomp-1").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompExplicitTicks === "0"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-stomp-1-quake.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "stomp-1"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "stomp-1",
    experienceGained: 5,
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0" })],
  });
  expect(after?.lastSpecialAction?.damage).toBeGreaterThanOrEqual(10);
  expect(after?.lastSpecialAction?.damage).toBeLessThanOrEqual(19);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + 5);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life)
    .toBe(targetBefore!.life - after!.lastSpecialAction!.damage);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompEffect"))
    .toHaveLength(33);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompPageToggle"))
    .toHaveLength(12);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(13);
  expect(after?.audioCueLog.filter(({ group, record }) => group === "magic" && record === 82))
    .toHaveLength(4);
  expect(pageErrors).toEqual([]);
});

test("tier-two great dragon knight performs 2D with male graphics at the native x coordinate", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-dragon-knight");
    arena.setLevel(2);
    const actor = arena.interact(20, 32);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const target = arena.interact(23, 32);
    return [actor, ally, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");

  await clickArenaWorldCell(page, 20, 32);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-stomp-2")).toContainText("男踏");
  await expect(page.getByTestId("technique-stomp-1")).toHaveCount(0);
  await page.getByTestId("technique-stomp-2").click();
  await clickArenaWorldCell(page, 23, 32);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-2"
      && dataset.mapCombatStompX === "368"
      && dataset.mapCombatStompResource === "MAGIC/51";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-stomp-2-quake.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "stomp-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "stomp-2",
    actorId: "arena-1-0",
    target: { x: 23, y: 32 },
    experienceGained: 5,
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0" })],
  });
  expect(after?.lastSpecialAction?.damage).toBeGreaterThanOrEqual(15);
  expect(after?.lastSpecialAction?.damage).toBeLessThanOrEqual(29);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + 5);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life)
    .toBe(targetBefore!.life - after!.lastSpecialAction!.damage);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompEffect"))
    .toHaveLength(33);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompPageToggle"))
    .toHaveLength(12);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(13);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "magic" && record === 82 && reason.startsWith("stomp-2-impact-")))
    .toHaveLength(4);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two great dragon knight uses mirrored 2D and group-13 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("great-dragon-knight");
    arena.setLevel(2);
    const enemy = arena.interact(23, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "stomp-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的巨龍.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-2"
      && dataset.mapCombatStompX === "368"
      && dataset.mapCombatStompResource === "MAGIC/52";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-stomp-2-ai-quake.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "stomp-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "stomp-2",
    actorId: "arena-2-0",
    target: { x: 20, y: 30 },
    experienceGained: 5,
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0" })],
  });
  expect(after?.lastSpecialAction?.damage).toBeGreaterThanOrEqual(15);
  expect(after?.lastSpecialAction?.damage).toBeLessThanOrEqual(29);
  expect(pageErrors).toEqual([]);
});

test("tier-three great dragon knight performs 3D with female graphics and 20..39 damage", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-dragon-knight");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const target = arena.interact(23, 30);
    return [actor, ally, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-stomp-3")).toContainText("女踏");
  await expect(page.getByTestId("technique-stomp-1")).toHaveCount(0);
  await expect(page.getByTestId("technique-stomp-2")).toHaveCount(0);
  await page.getByTestId("technique-stomp-3").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-3"
      && dataset.mapCombatStompX === "368"
      && dataset.mapCombatStompResource === "MAGIC/53";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-stomp-3-quake.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "stomp-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "stomp-3",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    experienceGained: 5,
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0" })],
  });
  expect(after?.lastSpecialAction?.damage).toBeGreaterThanOrEqual(20);
  expect(after?.lastSpecialAction?.damage).toBeLessThanOrEqual(39);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + 5);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life)
    .toBe(targetBefore!.life - after!.lastSpecialAction!.damage);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompEffect"))
    .toHaveLength(33);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "stompPageToggle"))
    .toHaveLength(12);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(13);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "magic" && record === 82 && reason.startsWith("stomp-3-impact-")))
    .toHaveLength(4);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three great dragon knight uses mirrored 3D and group-13 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("great-dragon-knight");
    arena.setLevel(3);
    const enemy = arena.interact(23, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "stomp-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("看我的巨龍.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-3"
      && dataset.mapCombatStompX === "368"
      && dataset.mapCombatStompResource === "MAGIC/54";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-stomp-3-ai-quake.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "stomp-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "stomp-3",
    actorId: "arena-2-0",
    target: { x: 20, y: 30 },
    experienceGained: 5,
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0" })],
  });
  expect(after?.lastSpecialAction?.damage).toBeGreaterThanOrEqual(20);
  expect(after?.lastSpecialAction?.damage).toBeLessThanOrEqual(39);
  expect(pageErrors).toEqual([]);
});

test("tier-one magic master performs native 2L with its two-stage lightning column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(1);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(22, 30);
    const inner = arena.interact(22, 31);
    const outside = arena.interact(27, 30);
    return [actor, center, inner, outside];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-2")).toContainText("中級落雷");
  await page.getByTestId("technique-lightning-2").click();
  await clickArenaWorldCell(page, 22, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "15");
  const during = await arenaBattleState(page);
  expect(during?.specialActionPresentation?.phase).toBe("lightningMain");
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore);
  expect(during?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 63, reason: "lightning-2-start" }),
    expect.objectContaining({ group: "e", record: 41, reason: "lightning-2-impact" }),
  ]));
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-2-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.specialActionPresentation?.phase === "lightningCleanup";
  });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "3");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-2-cleanup.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-2",
    actorId: "arena-1-0",
    target: { x: 22, y: 30 },
    damage: 105,
    experienceGained: 0,
  });
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 60);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 45);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outsideBefore);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(21);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningHit"))
    .toHaveLength(16);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningCleanup"))
    .toHaveLength(5);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(257);
  expect(after?.specialActionPresentationTrace.some(({ phase }) => phase === "lifeDrain")).toBe(false);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("enemy tier-one magic master uses 2L and the native group-11 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(25, 30);
    arena.setSide(2);
    arena.setClass("magic-master");
    arena.setLevel(1);
    const enemy = arena.interact(30, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 25, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "lightning-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的雷電魔法.", { exact: true })).toBeVisible();

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-2",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    damage: 60,
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(21);
  expect(after?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 63, reason: "lightning-2-start" }),
    expect.objectContaining({ group: "e", record: 41, reason: "lightning-2-impact" }),
  ]));
  expect(pageErrors).toEqual([]);
});

test("tier-two magic master raises the native 3L cloud before landing its inherited-anchor column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(2);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(24, 30);
    const inner = arena.interact(24, 31);
    const outside = arena.interact(29, 30);
    return [actor, center, inner, outside];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-3")).toContainText("高級落雷");
  await expect(page.getByTestId("technique-lightning-2")).toHaveCount(0);
  await page.getByTestId("technique-lightning-3").click();
  await clickArenaWorldCell(page, 24, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-phase", "lightningMain");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "3"
      && dataset.mapCombatAnchorOffset === "0,-1";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-3-cloud.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "9"
      && dataset.mapCombatAnchorOffset === "0,-3";
  }, undefined, { polling: "raf" });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatAnchorOffset === "0,-4";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore);
  expect(during?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 41, reason: "lightning-3-start" }),
    expect.objectContaining({ group: "e", record: 9, reason: "lightning-3-impact" }),
  ]));
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-3-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-3",
    actorId: "arena-1-0",
    target: { x: 24, y: 30 },
    damage: 165,
    experienceGained: 0,
  });
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 90);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 75);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outsideBefore);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(27);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningHit"))
    .toHaveLength(14);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningCleanup"))
    .toHaveLength(5);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(348);
  expect(after?.specialActionPresentationTrace.some(({ phase }) => phase === "lifeDrain")).toBe(false);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two magic master uses 3L at the stable-remake radius and group-11 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(24, 30);
    arena.setSide(2);
    arena.setClass("magic-master");
    arena.setLevel(2);
    const enemy = arena.interact(30, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 24, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "lightning-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "24,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的雷電魔法.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-3-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-3",
    actorId: "arena-2-0",
    target: { x: 24, y: 30 },
    damage: 90,
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(27);
  expect(after?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 41, reason: "lightning-3-start" }),
    expect.objectContaining({ group: "e", record: 9, reason: "lightning-3-impact" }),
  ]));
  expect(pageErrors).toEqual([]);
});

test("formal 3L leaves an ice-frozen covered enemy unharmed with its shell above the bolt", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(20, 30);
    arena.setClass("magic-master");
    arena.setLevel(2);
    const caster = arena.interact(20, 32);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const frozen = arena.interact(23, 30);
    const center = arena.interact(23, 32);
    return [wizard, caster, frozen, center];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const frozenLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-2").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-2"
      && current.specialActionPresentation === undefined;
  });

  await clickArenaWorldCell(page, 20, 32);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-lightning-3").click();
  await clickArenaWorldCell(page, 23, 32);
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatAnchorOffset === "0,-4"
      && dataset.iceDisabledCount === "1"
      && dataset.iceDisabledUnitIds === "arena-2-0";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-3-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-3",
    actorId: "arena-1-1",
    target: { x: 23, y: 32 },
    affectedUnits: expect.arrayContaining([
      expect.objectContaining({
        unitId: "arena-2-0",
        damage: 0,
        lifeAfter: frozenLife,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({ unitId: "arena-2-1", damage: 90 }),
    ]),
  });
  expect(pageErrors).toEqual([]);
});

test("tier-three magic master descends native 4L before planting its inherited-anchor column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(23, 33);
    const inner = arena.interact(24, 33);
    const outer = arena.interact(23, 37);
    const outside = arena.interact(29, 33);
    return [actor, center, inner, outer, outside];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outerBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-3")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-4")).toContainText("究級落雷");
  await expect(page.getByTestId("technique-lightning-2")).toHaveCount(0);
  await expect(page.getByTestId("technique-lightning-3")).toHaveCount(0);
  await page.getByTestId("technique-lightning-4").click();
  await clickArenaWorldCell(page, 23, 33);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "16"
      && dataset.mapCombatAnchorOffset === "0,0";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-4-descending.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "21"
      && dataset.mapCombatAnchorOffset === "0,1";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore);
  expect(during?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 43, reason: "lightning-4-start" }),
  ]));
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-4-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "arena-1-0",
    target: { x: 23, y: 33 },
    damage: 230,
    experienceGained: 0,
  });
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 110);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 90);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outerBefore! - 30);
  expect(after?.units.find(({ id }) => id === "arena-2-3")?.life).toBe(outsideBefore);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(32);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningHit"))
    .toHaveLength(30);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningCleanup"))
    .toHaveLength(5);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(304);
  expect(after?.specialActionPresentationTrace.some(({ phase }) => phase === "lifeDrain")).toBe(false);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three magic master uses 4L at stable radius seven with group-11 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(24, 30);
    arena.setSide(2);
    arena.setClass("magic-master");
    arena.setLevel(3);
    const enemy = arena.interact(31, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 24, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "lightning-4");
  await expect(dialogue).toHaveAttribute("data-effect-center", "24,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的雷電魔法.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-4-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-4"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "arena-2-0",
    target: { x: 24, y: 30 },
    damage: 110,
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lightningMain"))
    .toHaveLength(32);
  expect(after?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "e", record: 43, reason: "lightning-4-start" }),
  ]));
  expect(pageErrors).toEqual([]);
});

test("formal 4L skips an ice-frozen covered enemy and keeps its shell above the full column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(20, 30);
    arena.setClass("magic-master");
    arena.setLevel(3);
    const caster = arena.interact(20, 32);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const frozen = arena.interact(23, 30);
    const center = arena.interact(23, 32);
    return [wizard, caster, frozen, center];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const frozenLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-2").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-2"
      && current.specialActionPresentation === undefined;
  });

  await clickArenaWorldCell(page, 20, 32);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-lightning-4").click();
  await clickArenaWorldCell(page, 23, 32);
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "21"
      && dataset.mapCombatAnchorOffset === "0,1"
      && dataset.iceDisabledCount === "1"
      && dataset.iceDisabledUnitIds === "arena-2-0";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-lightning-4-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "arena-1-1",
    target: { x: 23, y: 32 },
    affectedUnits: expect.arrayContaining([
      expect.objectContaining({
        unitId: "arena-2-0",
        damage: 0,
        lifeAfter: frozenLife,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({ unitId: "arena-2-1", damage: 110 }),
    ]),
  });
  expect(pageErrors).toEqual([]);
});

test("tier-three magic priest performs native 2F as twelve composed fire draws", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-priest");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 30);
    return [actor, target];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");
  expect(actorBefore).toMatchObject({ classId: "magic-priest", x: 20, y: 30 });
  expect(targetBefore).toMatchObject({ classId: "soldier", x: 23, y: 30 });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-2")).toContainText("中級炎暴");
  await expect(page.getByTestId("technique-fire-1")).toHaveCount(0);
  await expect(page.getByTestId("technique-lightning-1")).toContainText("初級落雷");
  await expect(page.getByTestId("technique-recovery-1")).toContainText("初級回復");
  await expect(page.getByTestId("technique-dispel")).toContainText("破邪");
  await page.getByTestId("technique-fire-2").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-2-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(156, Math.floor(targetBefore!.life * 26 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-2",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    damage,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      damage,
      lifeAfter: targetBefore!.life - damage,
    })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(11);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(12);
  expect(after?.specialActionPresentationTrace
    .filter(({ phase }) => phase === "fireEffect")
    .reduce((total, { nativeTicks }) => total + nativeTicks, 0)).toBe(120);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lifeDrain"))
    .toHaveLength(damage);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "magic" && record === 83 && reason === "fire-2-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-one evil mage uses stable radius-six 2F and group-10 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(19, 30);
    arena.setSide(2);
    arena.setClass("evil-mage");
    arena.setLevel(1);
    const enemy = arena.interact(25, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const targetBefore = before?.units.find(({ id }) => id === "arena-1-0");
  await clickArenaWorldCell(page, 19, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "fire-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "19,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的火球魔法.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-2-ai-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(156, Math.floor(targetBefore!.life * 26 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-2",
    actorId: "arena-2-0",
    target: { x: 19, y: 30 },
    damage,
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0", damage })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(12);
  expect(pageErrors).toEqual([]);
});

test("tier-two evil mage performs 3F as thirteen native MAGIC/27 descriptors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("evil-mage");
    arena.setLevel(2);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 30);
    return [actor, target];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");
  expect(actorBefore).toMatchObject({ classId: "evil-mage", x: 20, y: 30 });
  expect(targetBefore).toMatchObject({ classId: "soldier", x: 23, y: 30 });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-3")).toContainText("高級炎暴");
  await expect(page.getByTestId("technique-fire-2")).toHaveCount(0);
  await page.getByTestId("technique-fire-3").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-3-wave.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(192, Math.floor(targetBefore!.life * 32 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-3",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    damage,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      damage,
      lifeAfter: targetBefore!.life - damage,
    })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(12);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(14);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(13);
  expect(after?.specialActionPresentationTrace
    .filter(({ phase }) => phase === "fireEffect")
    .reduce((total, { nativeTicks }) => total + nativeTicks, 0)).toBe(195);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lifeDrain"))
    .toHaveLength(damage);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "magic" && record === 83 && reason === "fire-3-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two evil mage uses stable radius-seven 3F and group-10 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(19, 30);
    arena.setSide(2);
    arena.setClass("evil-mage");
    arena.setLevel(2);
    const enemy = arena.interact(26, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const targetBefore = before?.units.find(({ id }) => id === "arena-1-0");
  await clickArenaWorldCell(page, 19, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "fire-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "19,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的火球魔法.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-3-ai-wave.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(192, Math.floor(targetBefore!.life * 32 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-3",
    actorId: "arena-2-0",
    target: { x: 19, y: 30 },
    damage,
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0", damage })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(13);
  expect(pageErrors).toEqual([]);
});

test("tier-three evil mage performs 4F through its ground, rising-column, and inherited finish phases", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("evil-mage");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 33);
    return [actor, target];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-4")).toContainText("究級炎暴");
  await expect(page.getByTestId("technique-fire-2")).toHaveCount(0);
  await expect(page.getByTestId("technique-fire-3")).toHaveCount(0);
  await page.getByTestId("technique-fire-4").click();
  await clickArenaWorldCell(page, 23, 33);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "20"
      && dataset.mapCombatAnchorOffset === "0,0"
      && dataset.mapCombatEffectTileCount === "9"
      && dataset.mapCombatEffectTextureKeys === Array.from(
        { length: 9 },
        (_, index) => `map-fire-4-finish-${index}`,
      ).join(",");
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(targetBefore?.life);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-4-rising-column.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "24"
      && dataset.mapCombatAnchorOffset === "0,0"
      && dataset.mapCombatEffectTileCount === "4"
      && dataset.mapCombatEffectTextureKeys === [18, 19, 19, 20]
        .map((frame) => `map-fire-4-finish-${frame}`).join(",");
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-4-finish.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "28"
      && dataset.mapCombatAnchorOffset === "0,-4"
      && dataset.mapCombatEffectTileCount === "4";
  }, undefined, { polling: "raf" });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(270, Math.floor(targetBefore!.life * 44 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-4",
    actorId: "arena-1-0",
    target: { x: 23, y: 33 },
    damage,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      damage,
      lifeAfter: targetBefore!.life - damage,
    })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(15);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(17);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(29);
  expect(after?.specialActionPresentationTrace
    .filter(({ phase }) => phase === "fireEffect")
    .reduce((total, { nativeTicks }) => total + nativeTicks, 0)).toBe(290);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "lifeDrain"))
    .toHaveLength(damage);
  expect(after?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "magic", record: 83, reason: "fire-4-start" }),
    expect.objectContaining({ group: "e", record: 51, reason: "fire-4-120" }),
  ]));
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three evil mage uses stable radius-seven 4F and group-10 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(19, 30);
    arena.setSide(2);
    arena.setClass("evil-mage");
    arena.setLevel(3);
    const enemy = arena.interact(26, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const targetBefore = before?.units.find(({ id }) => id === "arena-1-0");
  await clickArenaWorldCell(page, 19, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "fire-4");
  await expect(dialogue).toHaveAttribute("data-effect-center", "19,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的火球魔法.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-fire-4-ai-dialogue.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-4"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const damage = Math.min(270, Math.floor(targetBefore!.life * 44 / 100));
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "fire-4",
    actorId: "arena-2-0",
    target: { x: 19, y: 30 },
    damage,
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0", damage })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(29);
  expect(after?.audioCueLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ group: "magic", record: 83 }),
    expect.objectContaining({ group: "e", record: 51 }),
  ]));
  expect(pageErrors).toEqual([]);
});

test("tier-three prayer guide performs native 2H as two heart cycles plus the shared tail", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 30);
    arena.setSide(2);
    const enemy = arena.interact(26, 30);
    return [actor, target, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-1-1");
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-2")).toContainText("中級治療");
  await expect(page.getByTestId("technique-heal-1")).toHaveCount(0);
  await expect(page.getByTestId("technique-recovery-1")).toHaveCount(0);
  await page.getByTestId("technique-heal-2").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "3"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-heal-2-heart.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "heal-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "heal-2",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    damage: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-1",
      healing: 0,
      lifeAfter: targetBefore?.life,
    })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(0);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(3);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "healPrimary"))
    .toHaveLength(14);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "healTail"))
    .toHaveLength(5);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(215);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "heal-2-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three prayer guide selects full-life 2H from the published pool", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("sister");
    arena.setLevel(1);
    const first = arena.interact(19, 30);
    const second = arena.interact(21, 30);
    arena.setSide(2);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const actor = arena.interact(25, 30);
    return [first, second, actor];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  for (const [x, actorId] of [[19, "arena-1-0"], [21, "arena-1-1"]] as const) {
    await clickArenaWorldCell(page, x, 30);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-heal-1").click();
    await clickArenaWorldCell(page, x, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actionId === "heal-1"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  // Two full-life heals advance the fixed stream twice. The next four-slot
  // 2H/3I/AD/SM draw selects 2H; SM remains a real miss instead of OJ.

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "heal-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("生命單.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "3"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-heal-2-ai-heart.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "heal-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "heal-2",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    healing: 0,
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0", healing: 0 })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(0);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(3);
  expect(pageErrors).toEqual([]);
});

test("tier-three magic guide performs native 3H with its delayed bloom sound", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 30);
    arena.setSide(2);
    const enemy = arena.interact(27, 30);
    return [actor, target, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-1-1");
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-3")).toContainText("高級治療");
  await expect(page.getByTestId("technique-recovery-2")).toContainText("中級回復");
  await expect(page.getByTestId("technique-heal-2")).toHaveCount(0);
  await page.getByTestId("technique-heal-3").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "3"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  expect((await arenaBattleState(page))?.audioCueLog.some(({ reason }) =>
    reason === "heal-3-bloom")).toBe(false);
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatEffectTileCount === "6"
      && current?.audioCueLog.some(({ reason }) => reason === "heal-3-bloom");
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-heal-3-heart.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "heal-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "heal-3",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    damage: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-1",
      healing: 0,
      lifeAfter: targetBefore?.life,
    })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(0);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(2);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "healPrimary"))
    .toHaveLength(28);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "healTail"))
    .toHaveLength(5);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(235);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "heal-3-bloom"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three magic guide can select full-life 3H with group-15 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const first = arena.interact(19, 30);
    const second = arena.interact(20, 30);
    arena.setSide(2);
    const enemy = arena.interact(26, 30);
    return [first, second, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 19, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-heal-3").click();
  await clickArenaWorldCell(page, 19, 30);
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "heal-3"
      && current.lastSpecialAction.actorId === "arena-1-0"
      && current.specialActionPresentation === undefined;
  });
  // Two successful full-life 3H casts consume exactly two experience rolls.
  // The following four-entry 3H/2I/AA/FM pool roll therefore selects 3H.
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-heal-3").click();
  await clickArenaWorldCell(page, 20, 30);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "heal-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "26,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("生命單.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-heal-3-ai-heart.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "heal-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "heal-3",
    actorId: "arena-2-0",
    target: { x: 26, y: 30 },
    healing: 0,
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0", healing: 0 })],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(0);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(2);
  expect(pageErrors).toEqual([]);
});

test("tier-two prayer guide performs native 2I on the stable effect range", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(2);
    const actor = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(22, 30);
    const nearby = arena.interact(22, 31);
    arena.setSide(2);
    const enemy = arena.interact(26, 30);
    return [actor, center, nearby, enemy];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-recovery-2")).toContainText("中級回復");
  await expect(page.getByTestId("technique-recovery-1")).toHaveCount(0);
  await expect(page.getByTestId("technique-heal-2")).toHaveCount(0);
  await page.getByTestId("technique-recovery-2").click();
  await clickArenaWorldCell(page, 22, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "3";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-recovery-2.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "recovery-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "recovery-2",
    actorId: "arena-1-0",
    target: { x: 22, y: 30 },
    healing: 0,
    experienceGained: 0,
  });
  expect(after?.lastSpecialAction?.affectedUnits.map(({ unitId }) => unitId))
    .toEqual(["arena-1-0", "arena-1-1", "arena-1-2"]);
  expect(after?.rngCalls).toBe(before?.rngCalls);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "recoveryEffect"))
    .toHaveLength(17);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(255);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "recovery-2-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two prayer guide uses full-life 2I and group-14 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(19, 30);
    arena.setSide(2);
    arena.setClass("prayer-guide");
    arena.setLevel(2);
    const actor = arena.interact(25, 30);
    return [ally, actor];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 19, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "recovery-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("生命全.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "1";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-recovery-2-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "recovery-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "recovery-2",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    healing: 0,
    experienceGained: 0,
  });
  expect(after?.rngCalls).toBe((before?.rngCalls ?? 0) + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "recoveryEffect"))
    .toHaveLength(17);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "recovery-2-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("tier-three prayer guide performs native 3I on its four recovery rings", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(23, 30);
    const nearby = arena.interact(23, 31);
    const outer = arena.interact(26, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [actor, center, nearby, outer, enemy];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();

  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-2")).toContainText("中級治療");
  await expect(page.getByTestId("technique-recovery-3")).toContainText("高級回復");
  await expect(page.getByTestId("technique-recovery-2")).toHaveCount(0);
  await page.getByTestId("technique-recovery-3").click();
  await clickArenaWorldCell(page, 23, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "4";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-recovery-3.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "recovery-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "recovery-3",
    actorId: "arena-1-0",
    target: { x: 23, y: 30 },
    healing: 0,
    experienceGained: 0,
  });
  expect(after?.lastSpecialAction?.affectedUnits.map(({ unitId }) => unitId))
    .toEqual(["arena-1-0", "arena-1-1", "arena-1-3", "arena-1-2"]);
  expect(after?.rngCalls).toBe(before?.rngCalls);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "recoveryEffect"))
    .toHaveLength(17);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(255);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "recovery-3-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three prayer guide selects 3I and uses group-14 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("sister");
    arena.setLevel(1);
    const first = arena.interact(19, 30);
    const second = arena.interact(21, 30);
    const third = arena.interact(23, 30);
    arena.setSide(2);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const actor = arena.interact(25, 30);
    return [first, second, third, actor];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  for (const [x, actorId] of [
    [19, "arena-1-0"],
    [21, "arena-1-1"],
    [23, "arena-1-2"],
  ] as const) {
    await clickArenaWorldCell(page, x, 30);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-heal-1").click();
    await clickArenaWorldCell(page, x, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actionId === "heal-1"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "recovery-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("生命全.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "1";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-recovery-3-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "recovery-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "recovery-3",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    healing: 0,
    experienceGained: 0,
  });
  expect(after?.rngCalls).toBe((before?.rngCalls ?? 0) + 4);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "recoveryEffect"))
    .toHaveLength(17);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "e" && record === 36 && reason === "recovery-3-start"))
    .toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("formal 3I keeps an ice-frozen ally blocked and leaves its shell above the recovery effect", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(20, 30);
    arena.setClass("sister");
    const first = arena.interact(17, 28);
    const second = arena.interact(19, 28);
    const third = arena.interact(21, 28);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const frozenAlly = arena.interact(23, 30);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const healer = arena.interact(24, 29);
    return [wizard, first, second, third, frozenAlly, healer];
  });
  expect(placed).toEqual([true, true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const frozenLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  for (const [x, actorId] of [
    [17, "arena-1-1"],
    [19, "arena-1-2"],
    [21, "arena-1-3"],
  ] as const) {
    await clickArenaWorldCell(page, x, 28);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-heal-1").click();
    await clickArenaWorldCell(page, x, 28);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actionId === "heal-1"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-2").click();

  // Three healing rolls consume the first three fixed arena draws; this ice
  // layout has no legal displacement and consumes none. Draw four selects 3I
  // from the native 2H/3I/AD/SM pool.

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-action-id", "recovery-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "24,29");
  await expect(page.getByText("生命全.", { exact: true })).toBeVisible();
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
      && dataset.mapCombatEffectTileCount === "1"
      && dataset.iceDisabledCount === "1"
      && dataset.iceDisabledUnitIds === "arena-2-0";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-recovery-3-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "recovery-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "recovery-3",
    actorId: "arena-2-1",
    target: { x: 24, y: 29 },
    healing: 0,
    affectedUnits: expect.arrayContaining([
      expect.objectContaining({ unitId: "arena-2-0", healing: 0, lifeAfter: frozenLife }),
      expect.objectContaining({ unitId: "arena-2-1", healing: 0 }),
    ]),
  });
  expect(pageErrors).toEqual([]);
});

test("tier-one wizard performs native self-centered 2C through the formal technique menu", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(20, 30);
    arena.setClass("soldier");
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const inner = arena.interact(21, 30);
    const outer = arena.interact(23, 30);
    return [wizard, ally, inner, outer];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-0");
  const outerBefore = before?.units.find(({ id }) => id === "arena-2-1");
  expect(actorBefore).toMatchObject({ classId: "wizard", x: 20, y: 30, acted: false });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-ice-2")).toContainText("中級冰雪");
  await expect(page.getByTestId("technique-ice-1")).toHaveCount(0);
  await page.getByTestId("technique-ice-2").click();

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "3"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "12";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-ice-2-outer-ring.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-2",
    actorId: "arena-1-0",
    target: { x: 20, y: 30 },
    damage: 0,
    affectedUnits: [
      expect.objectContaining({
        unitId: "arena-2-0",
        positionAfter: { x: 21, y: 31 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 23, y: 30 },
        lifeAfter: outerBefore?.life,
        actionDisabledAfter: true,
        moved: false,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(11);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(18);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(180);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "un" && record === 50 && reason.startsWith("ice-2-cycle-")))
    .toHaveLength(3);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-one wizard uses 2C with its own cell as the formal effect center", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    const wizard = arena.interact(22, 30);
    return [ally, wizard];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "ice-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "22,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的冰魔法.", { exact: true })).toBeVisible();

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-2",
    actorId: "arena-2-0",
    target: { x: 22, y: 30 },
    affectedUnits: [expect.objectContaining({ unitId: "arena-1-0" })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(18);
  expect(pageErrors).toEqual([]);
});

test("tier-two wizard performs four-ring 3C while the stable-remake outer ring only freezes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(2);
    const wizard = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const inner = arena.interact(21, 30);
    const outer = arena.interact(24, 30);
    return [wizard, ally, inner, outer];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-0");
  const outerBefore = before?.units.find(({ id }) => id === "arena-2-1");
  expect(actorBefore).toMatchObject({ classId: "wizard", x: 20, y: 30, acted: false });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-ice-3")).toContainText("高級冰雪");
  await expect(page.getByTestId("technique-ice-2")).toHaveCount(0);
  await page.getByTestId("technique-ice-3").click();

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "4"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "16";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-ice-3-outer-ring.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-3",
    actorId: "arena-1-0",
    target: { x: 20, y: 30 },
    damage: 0,
    affectedUnits: [
      expect.objectContaining({
        unitId: "arena-2-0",
        positionAfter: { x: 21, y: 31 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 24, y: 30 },
        lifeAfter: outerBefore?.life,
        actionDisabledAfter: true,
        moved: false,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(12);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(14);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(24);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(240);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "un" && record === 50 && reason.startsWith("ice-3-cycle-")))
    .toHaveLength(4);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two wizard uses the 3C distance-four gate but keeps itself as effect center", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(2);
    const wizard = arena.interact(24, 30);
    return [ally, wizard];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "ice-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "24,30");
  await expect(page.getByText("看我的冰魔法.", { exact: true })).toBeVisible();

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-3"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-3",
    actorId: "arena-2-0",
    target: { x: 24, y: 30 },
    experienceGained: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      positionAfter: { x: 20, y: 30 },
      moved: false,
      actionDisabledAfter: true,
    })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(24);
  expect(after?.rngCalls).toBe(before?.rngCalls);
  expect(pageErrors).toEqual([]);
});

test("tier-three wizard performs five-ring 4C while the stable-remake fifth ring only freezes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(3);
    const wizard = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const inner = arena.interact(21, 30);
    const outer = arena.interact(25, 30);
    return [wizard, ally, inner, outer];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-0");
  const outerBefore = before?.units.find(({ id }) => id === "arena-2-1");
  expect(actorBefore).toMatchObject({ classId: "wizard", x: 20, y: 30, acted: false });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-ice-4")).toContainText("究級冰雪");
  await expect(page.getByTestId("technique-ice-3")).toHaveCount(0);
  await page.getByTestId("technique-ice-4").click();

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "5"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "20";
  }, undefined, { polling: "raf" });
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-ice-4-outer-ring.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-4",
    actorId: "arena-1-0",
    target: { x: 20, y: 30 },
    damage: 0,
    affectedUnits: [
      expect.objectContaining({
        unitId: "arena-2-0",
        positionAfter: { x: 21, y: 31 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 25, y: 30 },
        lifeAfter: outerBefore?.life,
        actionDisabledAfter: true,
        moved: false,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(15);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(17);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(30);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(300);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "un" && record === 50 && reason.startsWith("ice-4-cycle-")))
    .toHaveLength(5);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three wizard uses the 4C distance-five gate but keeps itself as effect center", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(3);
    const wizard = arena.interact(25, 30);
    return [ally, wizard];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "ice-4");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(page.getByText("看我的冰魔法.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-ice-4-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-4"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-4",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    experienceGained: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      positionAfter: { x: 20, y: 30 },
      moved: false,
      actionDisabledAfter: true,
    })],
  });
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "iceExpansion"))
    .toHaveLength(30);
  expect(after?.audioCueLog.filter(({ group, record, reason }) =>
    group === "un" && record === 50 && reason.startsWith("ice-4-cycle-")))
    .toHaveLength(5);
  expect(after?.rngCalls).toBe(before?.rngCalls);
  expect(pageErrors).toEqual([]);
});

test("engineer performs reachable native 1K construction in the integrated arena", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("engineer");
    arena.setLevel(3);
    const engineer = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [engineer, ally, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  expect(before?.terrainOverrides).toEqual([]);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  expect(actorBefore).toMatchObject({
    classId: "engineer",
    x: 20,
    y: 30,
    acted: false,
  });

  await clickArenaWorldCell(page, 20, 30);
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-iron-plate")).toContainText("鐵板");
  await page.getByTestId("technique-iron-plate").click();
  await clickArenaWorldCell(page, 21, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-terrain-override-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "21,29:iron-plate|20,30:iron-plate|22,30:iron-plate|21,31:iron-plate",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-iron-plate.png`,
  });

  const after = await arenaBattleState(page);
  expect(after?.lastConstruction).toMatchObject({
    actionId: "iron-plate",
    actorId: "arena-1-0",
    actorPositionBefore: { x: 20, y: 30 },
    actorPositionAfter: { x: 21, y: 30 },
    path: [{ x: 20, y: 30 }, { x: 21, y: 30 }],
  });
  expect(after?.lastConstruction?.terrainMutations.map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 21, y: 31 },
    { x: 21, y: 29 },
    { x: 22, y: 30 },
    { x: 20, y: 30 },
  ]);
  expect(after?.lastConstruction?.terrainMutations.every(({ slotAfter }) => slotAfter === 3))
    .toBe(true);
  expect(after?.terrainOverrides).toEqual([
    { x: 21, y: 29, kind: "iron-plate" },
    { x: 20, y: 30, kind: "iron-plate" },
    { x: 22, y: 30, kind: "iron-plate" },
    { x: 21, y: 31, kind: "iron-plate" },
  ]);
  expect(after?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    x: 21,
    y: 30,
    acted: true,
    experience: actorBefore?.experience,
  });
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(after?.audioCueLog).toEqual(before?.audioCueLog);
  expect(pageErrors).toEqual([]);
});

test("engineer performs reachable native 2K obstacle construction in the integrated arena", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("engineer");
    arena.setLevel(2);
    const engineer = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const enemy = arena.interact(30, 30);
    return [engineer, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-iron-plate")).toContainText("鐵板");
  await expect(page.getByTestId("technique-obstacle")).toContainText("障礙");
  await page.getByTestId("technique-obstacle").click();
  await clickArenaWorldCell(page, 21, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-terrain-override-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "21,29:obstacle|20,30:obstacle|22,30:obstacle|21,31:obstacle",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-obstacle.png`,
  });

  const after = await arenaBattleState(page);
  expect(after?.lastConstruction).toMatchObject({
    actionId: "obstacle",
    actorId: "arena-1-0",
    actorPositionBefore: { x: 20, y: 30 },
    actorPositionAfter: { x: 21, y: 30 },
    path: [{ x: 20, y: 30 }, { x: 21, y: 30 }],
  });
  expect(after?.lastConstruction?.terrainMutations.every(({ kind, slotAfter }) =>
    kind === "obstacle" && slotAfter === 3)).toBe(true);
  expect(after?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    x: 21,
    y: 30,
    acted: true,
  });
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(after?.audioCueLog).toEqual(before?.audioCueLog);
  expect(pageErrors).toEqual([]);
});

test("magic guide performs AA as twenty atomic MAGIC/16 pairs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(1);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const ally = arena.interact(24, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [caster, ally, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const allyBefore = before?.units.find(({ id }) => id === "arena-1-1");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-recovery-1")).toContainText("初級回復");
  await expect(page.getByTestId("technique-attack-up")).toContainText("攻擊提昇");
  await page.getByTestId("technique-attack-up").click();
  await clickArenaWorldCell(page, 24, 30);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-1")?.statuses.attackUp).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-attack-up-mid.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "attack-up"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "attack-up",
    actorId: "arena-1-0",
    target: { x: 24, y: 30 },
    damage: 0,
    healing: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-1",
      lifeAfter: allyBefore?.life,
      actionDisabledAfter: false,
      statusesAfter: expect.objectContaining({ attackUp: 3 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(13);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(20);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(300);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "un",
    record: 51,
    reason: "attack-up-start",
  }));
  await clickArenaWorldCell(page, 24, 30);
  await expect(page.getByTestId("unit-attack-stat")).toContainText("／");
  const attackReadout = await page.getByTestId("unit-attack-stat").textContent();
  const values = attackReadout?.match(/\d+/gu)?.map(Number) ?? [];
  expect(values[0]).toBe(values[1]! + 20);
  expect(pageErrors).toEqual([]);
});

test("enemy magic guide uses AA with the original group-17 typo", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(1);
    const first = arena.interact(18, 30);
    const second = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("magic-guide");
    const guide = arena.interact(26, 30);
    arena.setClass("soldier");
    const ally = arena.interact(28, 30);
    return [first, second, guide, ally];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  // Two successful full-life 1H casts consume exactly two presentation-neutral
  // experience rolls, so the enemy's next original three-entry pool roll selects AA.
  for (const [x, actorId] of [[18, "arena-1-0"], [20, "arena-1-1"]] as const) {
    await clickArenaWorldCell(page, x, 30);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-heal-1").click();
    await clickArenaWorldCell(page, x, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actionId === "heal-1"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "attack-up");
  await expect(dialogue).toHaveAttribute("data-effect-center", "26,31");
  await expect(page.getByText("功擊提昇.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-attack-up-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "attack-up"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "attack-up",
    actorId: "arena-2-0",
    target: { x: 26, y: 31 },
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-1",
      statusesAfter: expect.objectContaining({ attackUp: 3 }),
    })],
  });
  expect(pageErrors).toEqual([]);
});

test("AA buffs an ice-frozen ally while the persistent shell stays above the effect", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(1);
    const guide = arena.interact(18, 30);
    arena.setClass("soldier");
    const frozenTarget = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(23, 30);
    return [guide, frozenTarget, wizard];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return current?.units.find(({ id }) => id === "arena-1-0")?.acted === true
      && canvas?.dataset.mapCombatPhase === undefined;
  });
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.phase === "player"
      && current.lastSpecialAction?.actionId === "ice-2"
      && current.units.find(({ id }) => id === "arena-1-1")?.actionDisabled === true;
  });

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-attack-up").click();
  await clickArenaWorldCell(page, 20, 30);
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "statusEffect"
      && canvas.dataset.mapCombatFrame === "10"
      && canvas.dataset.iceDisabledUnitIds === "arena-1-1";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "2");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-attack-up-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "attack-up"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-1")).toMatchObject({
    actionDisabled: true,
    acted: false,
    statuses: expect.objectContaining({ attackUp: 3 }),
  });
  expect(after?.lastSpecialAction?.affectedUnits).toEqual([
    expect.objectContaining({
      unitId: "arena-1-1",
      actionDisabledAfter: true,
      statusesAfter: expect.objectContaining({ attackUp: 3 }),
    }),
  ]);
  expect(pageErrors).toEqual([]);
});

test("prayer guide performs AD as eleven atomic MAGIC/33 shield states", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(1);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const ally = arena.interact(24, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [caster, ally, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const allyBefore = before?.units.find(({ id }) => id === "arena-1-1");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-recovery-1")).toContainText("初級回復");
  await expect(page.getByTestId("technique-defense-up")).toContainText("防禦提昇");
  await page.getByTestId("technique-defense-up").click();
  await clickArenaWorldCell(page, 24, 30);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "5"
      && dataset.mapCombatEffectTileCount === "4";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-1")?.statuses.defenseUp).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-defense-up-mid.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "defense-up"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "defense-up",
    actorId: "arena-1-0",
    target: { x: 24, y: 30 },
    damage: 0,
    healing: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-1",
      lifeAfter: allyBefore?.life,
      actionDisabledAfter: false,
      statusesAfter: expect.objectContaining({ defenseUp: 3 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(13);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(11);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(165);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "un",
    record: 52,
    reason: "defense-up-start",
  }));
  await clickArenaWorldCell(page, 24, 30);
  await expect(page.getByTestId("unit-defense-stat")).toContainText("／");
  const defenseReadout = await page.getByTestId("unit-defense-stat").textContent();
  const values = defenseReadout?.match(/\d+/gu)?.map(Number) ?? [];
  expect(values[0]).toBe(values[1]! + 20);
  expect(pageErrors).toEqual([]);
});

test("enemy prayer guide uses AD with the original group-16 line", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(1);
    const first = arena.interact(18, 30);
    const second = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("prayer-guide");
    const guide = arena.interact(26, 30);
    arena.setClass("soldier");
    const ally = arena.interact(28, 30);
    return [first, second, guide, ally];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  // Two full-life 1H casts consume two experience rolls. The following
  // original three-entry prayer-guide pool roll therefore selects AD.
  for (const [x, actorId] of [[18, "arena-1-0"], [20, "arena-1-1"]] as const) {
    await clickArenaWorldCell(page, x, 30);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-heal-1").click();
    await clickArenaWorldCell(page, x, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actionId === "heal-1"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "defense-up");
  await expect(page.getByText("防禦提昇.", { exact: true })).toBeVisible();
  const center = await dialogue.getAttribute("data-effect-center");
  expect(center).toMatch(/^\d+,\d+$/u);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-defense-up-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "defense-up"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "defense-up",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      statusesAfter: expect.objectContaining({ defenseUp: 3 }),
    })],
  });
  expect(pageErrors).toEqual([]);
});

test("AD buffs an ice-frozen ally while the persistent shell stays above the shield", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(1);
    const guide = arena.interact(18, 30);
    arena.setClass("soldier");
    const frozenTarget = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(23, 30);
    return [guide, frozenTarget, wizard];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return current?.units.find(({ id }) => id === "arena-1-0")?.acted === true
      && canvas?.dataset.mapCombatPhase === undefined;
  });
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.phase === "player"
      && current.lastSpecialAction?.actionId === "ice-2"
      && current.units.find(({ id }) => id === "arena-1-1")?.actionDisabled === true;
  });

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-defense-up").click();
  await clickArenaWorldCell(page, 20, 30);
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "statusEffect"
      && canvas.dataset.mapCombatFrame === "5"
      && canvas.dataset.iceDisabledUnitIds === "arena-1-1";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "4");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-defense-up-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "defense-up"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-1")).toMatchObject({
    actionDisabled: true,
    acted: false,
    statuses: expect.objectContaining({ defenseUp: 3 }),
  });
  expect(after?.lastSpecialAction?.affectedUnits).toEqual([
    expect.objectContaining({
      unitId: "arena-1-1",
      actionDisabledAfter: true,
      statusesAfter: expect.objectContaining({ defenseUp: 3 }),
    }),
  ]);
  expect(pageErrors).toEqual([]);
});

test("tier-three prayer guide performs OJ as progressive per-recipient procedural results", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const caster = arena.interact(18, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const skipped = arena.interact(20, 30);
    const experience = arena.interact(22, 30);
    const attack = arena.interact(24, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [caster, skipped, experience, attack, enemy];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const audioBefore = before?.audioCueLog.length ?? 0;
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0")!;
  const experienceBefore = before?.units.find(({ id }) => id === "arena-1-2")!;

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-2")).toContainText("中級治療");
  await expect(page.getByTestId("technique-recovery-3")).toContainText("高級回復");
  await expect(page.getByTestId("technique-defense-up")).toContainText("防禦提昇");
  await expect(page.getByTestId("technique-prayer")).toContainText("祈禱");
  await page.getByTestId("technique-prayer").click();

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "prayerEffect"
      && dataset.mapCombatLifeChangeUnit === "arena-1-0"
      && dataset.mapCombatPrayerOutcome === "defenseUp";
  }, undefined, { polling: "raf" });
  let during = await arenaBattleState(page);
  expect(during?.lastSpecialAction).toBeUndefined();
  expect(during?.specialActionPresentation).toMatchObject({
    phase: "prayerEffect",
    frame: 0,
    lifeChangeUnitId: "arena-1-0",
  });
  expect(during?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    acted: false,
    statuses: expect.objectContaining({ defenseUp: 3 }),
  });
  expect(during?.units.find(({ id }) => id === "arena-1-2")?.experience)
    .toBe(experienceBefore.experience);
  expect(during?.units.find(({ id }) => id === "arena-1-3")?.statuses.attackUp).toBe(0);
  expect(during?.rngCalls).toBe(before!.rngCalls + 8);
  expect(during?.audioCueLog).toHaveLength(audioBefore);
  await expect(canvas).toHaveAttribute("data-map-combat-prayer-rolled-amount", "");
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-prayer.png`,
  });

  // The native result hold is skippable. Advancing it must reveal and commit
  // the next recipient without spending the caster action early.
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatLifeChangeUnit === "arena-1-2"
      && dataset.mapCombatPrayerOutcome === "experience"
      && dataset.mapCombatPrayerRolledAmount === "9";
  }, undefined, { polling: "raf" });
  during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-2")?.experience)
    .toBe(experienceBefore.experience + 9);
  expect(during?.units.find(({ id }) => id === "arena-1-3")?.statuses.attackUp).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatLifeChangeUnit === "arena-1-3"
      && dataset.mapCombatPrayerOutcome === "attackUp";
  }, undefined, { polling: "raf" });
  during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-3")?.statuses.attackUp).toBe(3);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "prayer"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "prayer",
    actorId: "arena-1-0",
    target: { x: 18, y: 30 },
    experienceGained: 0,
    affectedUnits: [
      expect.objectContaining({ unitId: "arena-1-0", prayerOutcome: "defenseUp" }),
      expect.objectContaining({
        unitId: "arena-1-2",
        prayerOutcome: "experience",
        prayerRolledAmount: 9,
      }),
      expect.objectContaining({ unitId: "arena-1-3", prayerOutcome: "attackUp" }),
    ],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    acted: true,
    experience: casterBefore.experience,
    statuses: expect.objectContaining({ defenseUp: 3 }),
  });
  expect(after?.units.find(({ id }) => id === "arena-1-1")?.statuses)
    .toEqual(before?.units.find(({ id }) => id === "arena-1-1")?.statuses);
  expect(after?.specialActionPresentationTrace).toEqual([
    expect.objectContaining({
      phase: "prayerEffect",
      frame: 0,
      nativeTicks: 60,
      lifeChangeUnitId: "arena-1-0",
    }),
    expect.objectContaining({
      phase: "prayerEffect",
      frame: 1,
      nativeTicks: 60,
      lifeChangeUnitId: "arena-1-2",
    }),
    expect.objectContaining({
      phase: "prayerEffect",
      frame: 2,
      nativeTicks: 60,
      lifeChangeUnitId: "arena-1-3",
    }),
  ]);
  expect(after?.audioCueLog).toHaveLength(audioBefore);
  expect(pageErrors).toEqual([]);
});

test("tier-three magic guide performs FM as twenty atomic MAGIC/16 pairs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const ally = arena.interact(24, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [caster, ally, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const allyBefore = before?.units.find(({ id }) => id === "arena-1-1");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-3")).toContainText("高級治療");
  await expect(page.getByTestId("technique-recovery-2")).toContainText("中級回復");
  await expect(page.getByTestId("technique-attack-up")).toContainText("攻擊提昇");
  await expect(page.getByTestId("technique-magic-guard")).toContainText("防魔");
  await page.getByTestId("technique-magic-guard").click();
  await clickArenaWorldCell(page, 24, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-1")?.statuses.magicGuard).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-magic-guard-mid.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-guard"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "magic-guard",
    actorId: "arena-1-0",
    target: { x: 24, y: 30 },
    damage: 0,
    healing: 0,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-1",
      lifeAfter: allyBefore?.life,
      actionDisabledAfter: false,
      statusesAfter: expect.objectContaining({ magicGuard: 1 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(13);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(20);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(300);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "un",
    record: 51,
    reason: "magic-guard-start",
  }));
  expect(after?.units.find(({ id }) => id === "arena-1-1")?.statuses.magicGuard).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three magic guide uses stable FM without inventing native dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    const player = arena.interact(18, 30);
    arena.setSide(2);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const guide = arena.interact(26, 30);
    arena.setClass("soldier");
    const ally = arena.interact(28, 30);
    return [player, guide, ally];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  await expect(dialogue).toBeHidden();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-magic-guard-ai.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-guard"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "magic-guard",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-1",
      statusesAfter: expect.objectContaining({ magicGuard: 1 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.statuses.magicGuard).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("FM protects an ice-frozen ally while the persistent shell stays above the effect", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const guide = arena.interact(18, 30);
    arena.setClass("soldier");
    const frozenTarget = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(23, 30);
    return [guide, frozenTarget, wizard];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return current?.units.find(({ id }) => id === "arena-1-0")?.acted === true
      && canvas?.dataset.mapCombatPhase === undefined;
  });
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.phase === "player"
      && current.lastSpecialAction?.actionId === "ice-2"
      && current.units.find(({ id }) => id === "arena-1-1")?.actionDisabled === true;
  });

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-magic-guard").click();
  await clickArenaWorldCell(page, 20, 30);
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "statusEffect"
      && canvas.dataset.mapCombatFrame === "10"
      && canvas.dataset.iceDisabledUnitIds === "arena-1-1";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "2");
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-1-1")?.statuses.magicGuard).toBe(0);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-magic-guard-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-guard"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-1")).toMatchObject({
    actionDisabled: true,
    acted: false,
    statuses: expect.objectContaining({ magicGuard: 1 }),
  });
  expect(after?.lastSpecialAction?.affectedUnits).toEqual([
    expect.objectContaining({
      unitId: "arena-1-1",
      actionDisabledAfter: true,
      statusesAfter: expect.objectContaining({ magicGuard: 1 }),
    }),
  ]);
  expect(pageErrors).toEqual([]);
});

test("tier-two curse-master performs IP only after the full poison timeline", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("curse-master");
    arena.setLevel(2);
    const caster1 = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const soldier = arena.interact(24, 30);
    return [caster1, reserve, soldier];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const caster1Before = before?.units.find(({ id }) => id === "arena-1-0");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-poison")).toContainText("施毒");
  await page.getByTestId("technique-poison").click();
  await clickArenaWorldCell(page, 24, 30);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "poisonEffect"
      && dataset.mapCombatFrame === "18"
      && dataset.mapCombatEffectTileCount === "4";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.statuses.poison).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(caster1Before?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-poison-cloud.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "poison"
      && current.lastSpecialAction.actorId === "arena-1-0"
      && current.specialActionPresentation === undefined;
  });
  const afterNormal = await arenaBattleState(page);
  expect(afterNormal?.lastSpecialAction).toMatchObject({
    actionId: "poison",
    actorId: "arena-1-0",
    blocked: false,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      statusesAfter: expect.objectContaining({ poison: 3 }),
    })],
  });
  expect(afterNormal!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(14);
  expect(afterNormal!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(17);
  expect(afterNormal?.rngCalls).toBe(before!.rngCalls + 1);
  expect(afterNormal?.specialActionPresentationTrace.filter(({ phase }) => phase === "poisonEffect"))
    .toHaveLength(29);
  expect(afterNormal?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(290);
  expect(afterNormal?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 58,
    reason: "poison-cloud-start",
  }));

  expect(pageErrors).toEqual([]);
  await expect(canvas).toBeVisible();
});

test("tier-one curse-master performs LA before the confused enemy spends a turn without attacking", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("curse-master");
    arena.setLevel(1);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    const target = arena.interact(24, 30);
    return [caster, reserve, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const reserveBefore = before?.units.find(({ id }) => id === "arena-1-1");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-confusion")).toContainText("混亂");
  await expect(page.getByTestId("technique-poison")).toHaveCount(0);
  await page.getByTestId("technique-confusion").click();
  await clickArenaWorldCell(page, 24, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "5"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.statuses.confusion).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-confusion-faces.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "confusion"
      && current.specialActionPresentation === undefined;
  });
  const afterCast = await arenaBattleState(page);
  expect(afterCast?.lastSpecialAction).toMatchObject({
    actionId: "confusion",
    actorId: "arena-1-0",
    blocked: false,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      statusesAfter: expect.objectContaining({ confusion: 3 }),
    })],
  });
  expect(afterCast!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(14);
  expect(afterCast!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(17);
  expect(afterCast?.rngCalls).toBe(before!.rngCalls + 1);
  expect(afterCast?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(11);
  expect(afterCast?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(165);
  expect(afterCast?.audioCueLog).toEqual(before?.audioCueLog);

  await clickArenaWorldCell(page, 20, 32);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.phase === "player"
      && current.units.find(({ id }) => id === "arena-2-0")?.statuses.confusion === 2;
  });
  const afterTurn = await arenaBattleState(page);
  expect(afterTurn?.units.find(({ id }) => id === "arena-1-1")?.life).toBe(reserveBefore?.life);
  expect(afterTurn?.units.find(({ id }) => id === "arena-2-0")?.statuses.confusion).toBe(2);
  expect(afterTurn?.lastSpecialAction?.actionId).toBe("confusion");
  expect(pageErrors).toEqual([]);
});

test("tier-one curse-master commits SA only after all eleven MAGIC/46 descriptors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("curse-master");
    arena.setLevel(1);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    const target = arena.interact(24, 30);
    return [caster, reserve, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-attack-down")).toContainText("攻擊下降");
  await page.getByTestId("technique-attack-down").click();
  await clickArenaWorldCell(page, 24, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "5"
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.statuses.attackDown).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(targetBefore?.life);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-attack-down.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "attack-down"
      && current.lastSpecialAction.actorId === "arena-1-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "attack-down",
    actorId: "arena-1-0",
    damage: 0,
    blocked: false,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      lifeAfter: targetBefore?.life,
      statusesAfter: expect.objectContaining({ attackDown: 3 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(13);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(11);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(165);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 8,
    reason: "attack-down-start",
  }));
  expect(pageErrors).toEqual([]);
});

test("enemy tier-one curse-master selects SA from native slot two and announces the original typo", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    const player = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("curse-master");
    arena.setLevel(1);
    const caster = arena.interact(24, 30);
    return [player, caster];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "19");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8632");
  await expect(dialogue).toHaveAttribute("data-action-id", "attack-down");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("功擊降低.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-attack-down-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "attack-down"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "attack-down",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ attackDown: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.attackDown).toBe(3);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 8,
    reason: "attack-down-start",
  }));
  expect(pageErrors).toEqual([]);
});

test("tier-one magic-priest commits SD only after all ten MAGIC/45 descriptors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-priest");
    arena.setLevel(1);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    const target = arena.interact(24, 30);
    return [caster, reserve, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-1")).toContainText("初級炎暴");
  await expect(page.getByTestId("technique-recovery-1")).toContainText("初級回復");
  await expect(page.getByTestId("technique-defense-down")).toContainText("防禦下降");
  await page.getByTestId("technique-defense-down").click();
  await clickArenaWorldCell(page, 24, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "5"
      && dataset.mapCombatEffectTileCount === "4";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.statuses.defenseDown).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(targetBefore?.life);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-defense-down.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "defense-down"
      && current.lastSpecialAction.actorId === "arena-1-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "defense-down",
    actorId: "arena-1-0",
    damage: 0,
    blocked: false,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      lifeAfter: targetBefore?.life,
      statusesAfter: expect.objectContaining({ defenseDown: 3 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(13);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(10);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(150);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 8,
    reason: "defense-down-start",
  }));
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two magic-priest selects SD from native slot four and announces 防禦降低.", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    const player = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("magic-priest");
    arena.setLevel(2);
    const caster = arena.interact(24, 30);
    return [player, caster];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "18");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8628");
  await expect(dialogue).toHaveAttribute("data-action-id", "defense-down");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("防禦降低.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-defense-down-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "defense-down"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "defense-down",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ defenseDown: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.defenseDown).toBe(3);
  expect(after?.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 8,
    reason: "defense-down-start",
  }));
  expect(pageErrors).toEqual([]);
});

test("tier-three curse-master commits SN only after all nine silent MAGIC/36 descriptors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("curse-master");
    arena.setLevel(3);
    const caster = arena.interact(20, 30);
    arena.setClass("soldier");
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    const target = arena.interact(24, 30);
    return [caster, reserve, target];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const casterBefore = before?.units.find(({ id }) => id === "arena-1-0");
  const targetBefore = before?.units.find(({ id }) => id === "arena-2-0");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toContainText("初級治療");
  await expect(page.getByTestId("technique-attack-down")).toContainText("攻擊下降");
  await expect(page.getByTestId("technique-confusion")).toContainText("混亂");
  await expect(page.getByTestId("technique-poison")).toContainText("施毒");
  await expect(page.getByTestId("technique-spell-seal")).toContainText("禁咒");
  await page.getByTestId("technique-spell-seal").click();
  await clickArenaWorldCell(page, 24, 30);

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']")?.dataset;
    return dataset?.mapCombatPhase === "statusEffect"
      && dataset.mapCombatFrame === "4"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.statuses.techniqueSeal).toBe(0);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(targetBefore?.life);
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(casterBefore?.experience);
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-spell-seal.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "spell-seal"
      && current.lastSpecialAction.actorId === "arena-1-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "spell-seal",
    actorId: "arena-1-0",
    damage: 0,
    blocked: false,
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-0",
      lifeAfter: targetBefore?.life,
      statusesAfter: expect.objectContaining({ techniqueSeal: 3 }),
    })],
  });
  expect(after!.lastSpecialAction!.experienceGained).toBeGreaterThanOrEqual(14);
  expect(after!.lastSpecialAction!.experienceGained).toBeLessThanOrEqual(17);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(after?.specialActionPresentationTrace.filter(({ phase }) => phase === "statusEffect"))
    .toHaveLength(9);
  expect(after?.specialActionPresentationTrace.reduce(
    (total, { nativeTicks }) => total + nativeTicks,
    0,
  )).toBe(225);
  expect(after?.audioCueLog).toEqual(before?.audioCueLog);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three curse-master selects native SN after two deterministic rolls and announces 禁咒.", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("curse-master");
    arena.setLevel(1);
    const first = arena.interact(20, 30);
    const second = arena.interact(21, 31);
    arena.setSide(2);
    arena.setClass("curse-master");
    arena.setLevel(3);
    const caster = arena.interact(23, 30);
    return [first, second, caster];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  for (const [x, y] of [[20, 30], [21, 31]] as const) {
    const actorId = y === 30 ? "arena-1-0" : "arena-1-1";
    await clickArenaWorldCell(page, x, y);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId("technique-attack-down").click();
    await clickArenaWorldCell(page, 23, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
      return current?.lastSpecialAction?.actionId === "attack-down"
        && current.lastSpecialAction.actorId === expectedActorId
        && current.specialActionPresentation === undefined;
    }, actorId);
  }

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "21");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8642");
  await expect(dialogue).toHaveAttribute("data-action-id", "spell-seal");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("禁咒.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-spell-seal-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "spell-seal"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "spell-seal",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ techniqueSeal: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.techniqueSeal).toBe(3);
  expect(pageErrors).toEqual([]);
});

test("enemy tier-two curse-master keeps the native IP pool slot and announces 中毒.", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    const player = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("curse-master");
    arena.setLevel(2);
    const caster = arena.interact(25, 30);
    return [player, caster];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "20");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:863C");
  await expect(dialogue).toHaveAttribute("data-action-id", "poison");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("中毒.", { exact: true })).toBeVisible();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/arena-poison-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "poison"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "poison",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ poison: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.poison).toBe(3);
  expect(pageErrors).toEqual([]);
});

test("arena setup remains usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/arena.html?test=1");
  await expect(page.getByTestId("arena-start")).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root")).toBeVisible();
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${ARTIFACT_DIR}/arena-setup-narrow.png`, fullPage: true });
});
