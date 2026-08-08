import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
