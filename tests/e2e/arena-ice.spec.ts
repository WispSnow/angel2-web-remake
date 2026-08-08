import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

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
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
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
  expect(after?.rngCalls).toBe(before!.rngCalls + 1);
  expect(pageErrors).toEqual([]);
});
