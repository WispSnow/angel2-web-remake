import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

/**
 * A 2x2 side-1 squad inside the stomp area. `arena-1-1` at (21,30) is the cell
 * the expert planner selects, and every member stays inside the arena's
 * starting viewport so the quake screen coordinates remain comparable.
 */
const STOMP_SQUAD: ReadonlyArray<readonly [number, number]> =
  [[20, 30], [21, 30], [20, 31], [21, 31]];

async function placeStompScenario(
  page: import("@playwright/test").Page,
  level: 2 | 3,
): Promise<boolean[]> {
  return page.evaluate(([squad, enemyLevel]) => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const placed = squad.map(([x, y]) => arena.interact(x, y));
    arena.setSide(2);
    arena.setClass("great-dragon-knight");
    arena.setLevel(enemyLevel);
    return [...placed, arena.interact(26, 30)];
  }, [STOMP_SQUAD, level] as const);
}

async function restStompSquad(page: import("@playwright/test").Page): Promise<void> {
  for (const [index, [x, y]] of STOMP_SQUAD.entries()) {
    await clickArenaWorldCell(page, x, y);
    await page.getByTestId("unit-command-rest").click();
    await page.waitForFunction((actorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
      return current?.units.find(({ id }) => id === actorId)?.acted === true
        && canvas?.dataset.mapCombatPhase === undefined;
    }, `arena-1-${index}`);
  }
}

function expectStompSquadDamage(
  state: ArenaBattleDebugState | undefined,
  minimum: number,
  maximum: number,
): void {
  const affected = state?.lastSpecialAction?.affectedUnits ?? [];
  expect(affected.map(({ unitId }) => unitId).sort())
    .toEqual(STOMP_SQUAD.map((_, index) => `arena-1-${index}`));
  for (const unit of affected) {
    expect(unit.damage, unit.unitId).toBeGreaterThanOrEqual(minimum);
    expect(unit.damage, unit.unitId).toBeLessThanOrEqual(maximum);
  }
}

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
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "338"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY
      && dataset.mapCombatEffectTileCount === "2";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

test("tier-two great dragon knight lands native 2D male graphics on the selected target", async ({ page }) => {
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
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/51"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

// `REMAKE-037` gives side 2 the shared expert planner, so 2D/3D are chosen on
// utility instead of a native pool roll: one isolated target loses to an
// ordinary attack, while a squad inside the stomp area does not. The cluster
// below is the enemy-side AI staging for both tiers.
test("enemy tier-two great dragon knight uses mirrored 2D and group-13 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await placeStompScenario(page, 2);
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await restStompSquad(page);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "stomp-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "21,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的巨龍.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-2"
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/52"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    target: { x: 21, y: 30 },
  });
  expectStompSquadDamage(after, 15, 29);
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
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/53"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

test("enemy tier-three great dragon knight uses mirrored 3D and group-13 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await placeStompScenario(page, 3);
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await restStompSquad(page);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "stomp-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "21,30");
  await expect(page.getByText("看我的巨龍.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-3"
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/54"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    target: { x: 21, y: 30 },
  });
  expectStompSquadDamage(after, 20, 39);
  expect(pageErrors).toEqual([]);
});
