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

// Under `REMAKE-037` the enemy planner scores a full-life 3H as pure waste, so
// the native pool can no longer roll it on an undamaged board. Two 巨斧戰士
// hits put the 魔導師 far enough below its maximum that the 48% single-target
// heal outvalues its own 2I ring and the flat FM shield.
test("enemy tier-three magic guide selects 3H on itself with group-15 dialogue", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-axe-warrior");
    arena.setLevel(1);
    const first = arena.interact(25, 30);
    const second = arena.interact(26, 31);
    arena.setSide(2);
    arena.setClass("magic-guide");
    arena.setLevel(3);
    const enemy = arena.interact(26, 30);
    return [first, second, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const guideMaxLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  for (const [x, y, actorId] of [
    [25, 30, "arena-1-0"],
    [26, 31, "arena-1-1"],
  ] as const) {
    await clickArenaWorldCell(page, x, y);
    await page.getByTestId("unit-command-attack").click();
    await clickArenaWorldCell(page, 26, 30);
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastCombat?.attackerId === expectedActorId
        && current.combatPresentation === undefined
        && current.specialActionPresentation === undefined;
    }, actorId);
  }
  const wounded = (await arenaBattleState(page))?.units.find(({ id }) => id === "arena-2-0");
  expect(wounded!.life).toBeLessThan(guideMaxLife! - 90);

  const healHeartFrame = page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "healPrimary"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "heal-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "26,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("生命單.", { exact: true })).toBeVisible();
  await healHeartFrame;
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
    affectedUnits: [expect.objectContaining({ unitId: "arena-2-0" })],
  });
  // 3H restores 48% of the maximum, capped by the missing life.
  expect(after?.lastSpecialAction?.healing)
    .toBe(Math.min(guideMaxLife! - wounded!.life, Math.floor(guideMaxLife! * 48 / 100)));
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life)
    .toBe(wounded!.life + after!.lastSpecialAction!.healing);
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
    arena.setClass("great-axe-warrior");
    arena.setLevel(1);
    const first = arena.interact(24, 30);
    const second = arena.interact(25, 31);
    const third = arena.interact(26, 29);
    arena.setSide(2);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const actor = arena.interact(25, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const escort = arena.interact(26, 30);
    return [first, second, third, actor, escort];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  // Two hits on the 祈導師 and one on its 士兵 escort give the ring two real
  // recipients, which is what makes 3I outscore the single-target 2H that
  // shares the tier-three pool.
  for (const [x, y, targetX, targetY, actorId, defenderId] of [
    [24, 30, 25, 30, "arena-1-0", "arena-2-0"],
    [25, 31, 25, 30, "arena-1-1", "arena-2-0"],
    [26, 29, 26, 30, "arena-1-2", "arena-2-1"],
  ] as const) {
    await clickArenaWorldCell(page, x, y);
    await page.getByTestId("unit-command-attack").click();
    await clickArenaWorldCell(page, targetX, targetY);
    await page.waitForFunction(([expectedActorId, expectedDefenderId]) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastCombat?.attackerId === expectedActorId
        && current.lastCombat.defenderId === expectedDefenderId
        && current.combatPresentation === undefined
        && current.specialActionPresentation === undefined;
    }, [actorId, defenderId] as const);
  }
  const wounded = await arenaBattleState(page);
  const guideLife = wounded?.units.find(({ id }) => id === "arena-2-0")?.life ?? 0;
  const escortLife = wounded?.units.find(({ id }) => id === "arena-2-1")?.life ?? 0;
  expect(360 - guideLife).toBeGreaterThan(110);
  expect(160 - escortLife).toBeGreaterThan(85);

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
      && dataset.mapCombatFrame === "8";
  }, undefined, { polling: "raf" });
  // Both real recipients carry a life-change tile now that the ring heals.
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-map-combat-effect-tile-count", "2");
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
  });
  // Ring value 4 covers the caster's own cell and value 3 the adjacent escort.
  expect(after?.lastSpecialAction?.affectedUnits.map(({ unitId, healing }) =>
    ({ unitId, healing }))).toEqual([
    { unitId: "arena-2-0", healing: 110 },
    { unitId: "arena-2-1", healing: 85 },
  ]);
  expect(after?.lastSpecialAction?.healing).toBe(195);
  expect(pageErrors).toEqual([]);
});

// The freezer is a 魔術士 rather than a 巫師 on purpose: `REMAKE-036` puts any
// candidate that effectively hits a 巫師 in a priority band above everything
// except a guaranteed kill, so a 巫師 on the board would pull the 祈導師 into
// an ordinary attack instead of the 3I this test audits. The 巨斧戰士 wounds
// the escort so the ring has a real recipient to contrast with the frozen one.
test("formal 3I keeps an ice-frozen ally blocked and leaves its shell above the recovery effect", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magician");
    arena.setLevel(1);
    // 1C's effect value is `effectRadius - distance`, so its outermost ring is
    // two cells out. REMAKE-094 only freezes targets whose landing cell is still
    // inside the effect, so the 士兵 starts on the inner ring at (22,30); REMAKE-095
    // then pushes it due east to the value-1 cell (23,30).
    const magician = arena.interact(21, 30);
    arena.setClass("great-axe-warrior");
    const attacker = arena.interact(24, 31);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const frozenAlly = arena.interact(22, 30);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    const healer = arena.interact(25, 29);
    arena.setClass("soldier");
    arena.setLevel(1);
    const escort = arena.interact(25, 31);
    return [magician, attacker, frozenAlly, healer, escort];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const frozenLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  await clickArenaWorldCell(page, 24, 31);
  await page.getByTestId("unit-command-attack").click();
  await clickArenaWorldCell(page, 25, 31);
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-1"
      && current.lastCombat.defenderId === "arena-2-2"
      && current.combatPresentation === undefined;
  });

  await clickArenaWorldCell(page, 21, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-1").click();
  // Self-centred ice previews its footprint first; the cast needs a confirmation.
  await page.keyboard.press(" ");
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-1"
      && current.units.find(({ id }) => id === "arena-2-0")?.actionDisabled === true
      && current.specialActionPresentation === undefined;
  });
  // `REMAKE-036` pushes the frozen 士兵 one cell outward onto the value-1 ring,
  // where `REMAKE-094` still freezes it, and it lands inside the ring the 祈導師
  // is about to centre on its wounded escort.
  const frozen = (await arenaBattleState(page))?.units.find(({ id }) => id === "arena-2-0");
  expect({ x: frozen?.x, y: frozen?.y, life: frozen?.life }).toEqual({
    x: 23,
    y: 30,
    life: frozenLife,
  });

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-action-id", "recovery-3");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,31");
  await expect(page.getByText("生命全.", { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "recoveryEffect"
      && dataset.mapCombatFrame === "8"
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
    target: { x: 25, y: 31 },
  });
  // The frozen ally stays in the ring's receiver list but takes no healing,
  // while the wounded escort in the same ring does recover.
  expect(after?.lastSpecialAction?.affectedUnits)
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: "arena-2-0", healing: 0, lifeAfter: frozenLife }),
    ]));
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(frozenLife);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.actionDisabled).toBe(true);
  expect(after?.lastSpecialAction?.affectedUnits
    .find(({ unitId }) => unitId === "arena-2-2")?.healing).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
