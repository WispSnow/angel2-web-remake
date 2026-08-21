import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("tier-three magic priest commits native 2F through the formal technique flow", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    const enemy = arena.interact(24, 30);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

test("tier-two evil mage commits native 3F through the formal technique flow", async ({ page }) => {
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
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-map-combat-effect-atlas-frames",
    [39, 40, 41, 42, 43, 44].map((frame) => `fire-3__effect__${frame}`).join(","),
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});
