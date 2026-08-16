import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("tier-one wizard pushes the outer ring beyond 2C through the formal technique menu", async ({ page }) => {
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
  // Radius 4 covers 25 cells: the 13 at value 2 or more freeze, the 12-cell rim
  // at value 1 is shoved clear of the effect instead (`REMAKE-094`).
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-freeze-cell-count", "13");
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "12");
  await page.keyboard.press(" ");

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "3"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "12";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-ice-2-outer-pushed.png`,
  });
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "ice-2",
    actorId: "arena-1-0",
    target: { x: 20, y: 30 },
    damage: 0,
    affectedUnits: [
      expect.objectContaining({
        unitId: "arena-2-0",
        // REMAKE-095: due east of the caster, so it is pushed east.
        positionAfter: { x: 22, y: 30 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 24, y: 30 },
        lifeAfter: outerBefore?.life,
        // REMAKE-094: it lands on a value-0 cell, so it leaves without freezing.
        actionDisabledAfter: false,
        moved: true,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(10);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(11);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});

test("the ice footprint is previewed in two bands and a right click cancels it untouched", async ({ page }) => {
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
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const inner = arena.interact(21, 30);
    const outer = arena.interact(24, 30);
    return [wizard, inner, outer];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const before = await arenaBattleState(page);

  const screen = page.getByTestId("game-screen");
  const canvas = page.getByTestId("battle-canvas");
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-3").click();

  // Nothing is committed yet: the spell only draws its own footprint.
  await expect(screen).toHaveAttribute("data-action-mode", "selfAreaConfirm");
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-action-id", "ice-3");
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-center", "20,30");
  // Radius 5 covers 41 cells; the 16-cell rim at value 1 is the band whose
  // targets get shoved clear instead of frozen (`REMAKE-094`).
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-freeze-cell-count", "25");
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "16");
  await expect(page.getByTestId("ice-cast-summary")).toContainText("高級冰雪");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-ice-3-cast-preview.png`,
  });
  const previewing = await arenaBattleState(page);
  expect(previewing?.lastSpecialAction).toBeUndefined();
  expect(previewing?.rngCalls).toBe(before!.rngCalls);
  expect(previewing?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);

  // One right click on the battlefield unwinds exactly one level, back to the
  // technique menu the cast was chosen from — not past it to the action menu.
  await clickArenaWorldCell(page, 22, 30, { button: "right" });
  await expect(screen).toHaveAttribute("data-action-mode", "techniqueMenu");
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-action-id", "");
  const cancelled = await arenaBattleState(page);
  expect(cancelled?.lastSpecialAction).toBeUndefined();
  expect(cancelled?.rngCalls).toBe(before!.rngCalls);
  expect(cancelled?.rngState).toBe(before!.rngState);
  expect(cancelled?.units).toEqual(before?.units);

  // Re-entering and clicking inside the drawn footprint commits the same cast.
  await page.getByTestId("technique-ice-3").click();
  await expect(screen).toHaveAttribute("data-action-mode", "selfAreaConfirm");
  await clickArenaWorldCell(page, 22, 30);
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
  });
  expect(after?.lastSpecialAction?.affectedUnits).toEqual([
    expect.objectContaining({ unitId: "arena-2-0", actionDisabledAfter: true }),
    // The rim target lands outside the effect, so it never freezes.
    expect.objectContaining({ unitId: "arena-2-1", actionDisabledAfter: false }),
  ]);
  expect(pageErrors).toEqual([]);
});

test("enemy wizard waits for a non-ice ally and the frozen player phase advances", async ({ page }) => {
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
    arena.setClass("warrior");
    const warrior = arena.interact(30, 30);
    return [ally, wizard, warrior];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "ice-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "22,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的冰魔法.", { exact: true })).toBeVisible();
  expect((await arenaBattleState(page))?.units.find(({ id }) => id === "arena-2-1")?.acted)
    .toBe(true);

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
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return (current?.round ?? 0) >= 2
      && current?.units.find(({ id }) => id === "arena-2-1")?.acted === true;
  });
  expect(pageErrors).toEqual([]);
});

test("enemy wizard does not use ice when every surviving enemy can freeze", async ({ page }) => {
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

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.round === 2
      && current.phase === "player"
      && current.combatPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction?.actionId).not.toBe("ice-2");
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.actionDisabled).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("tier-two wizard pushes the fourth ring beyond 3C", async ({ page }) => {
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
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-freeze-cell-count", "25");
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "16");
  await page.keyboard.press(" ");

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "4"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "16";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
        // REMAKE-095: due east of the caster, so it is pushed east.
        positionAfter: { x: 22, y: 30 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 25, y: 30 },
        lifeAfter: outerBefore?.life,
        // REMAKE-094: it lands on a value-0 cell, so it leaves without freezing.
        actionDisabledAfter: false,
        moved: true,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(12);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(14);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});

test("tier-three wizard pushes the fifth ring beyond 4C", async ({ page }) => {
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
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-freeze-cell-count", "41");
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "20");
  await page.keyboard.press(" ");

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatIceDistance === "5"
      && dataset.mapCombatIceRangeValue === "1"
      && dataset.mapCombatEffectTileCount === "20";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
        // REMAKE-095: due east of the caster, so it is pushed east.
        positionAfter: { x: 22, y: 30 },
        lifeAfter: innerBefore?.life,
        actionDisabledAfter: true,
        moved: true,
      }),
      expect.objectContaining({
        unitId: "arena-2-1",
        positionAfter: { x: 26, y: 30 },
        lifeAfter: outerBefore?.life,
        // REMAKE-094: it lands on a value-0 cell, so it leaves without freezing.
        actionDisabledAfter: false,
        moved: true,
      }),
    ],
  });
  expect(after?.lastSpecialAction?.experienceGained).toBeGreaterThanOrEqual(15);
  expect(after?.lastSpecialAction?.experienceGained).toBeLessThanOrEqual(17);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.experience)
    .toBe(actorBefore!.experience + after!.lastSpecialAction!.experienceGained);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});
