import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("magic guide commits AA through the formal technique flow", async ({ page }) => {
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
    const ally = arena.interact(23, 30);
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
  await clickArenaWorldCell(page, 23, 30);

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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    target: { x: 23, y: 30 },
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
  await clickArenaWorldCell(page, 23, 30);
  await expect(page.getByTestId("unit-attack-stat")).toContainText("／");
  const attackReadout = await page.getByTestId("unit-attack-stat").textContent();
  const values = attackReadout?.match(/\d+/gu)?.map(Number) ?? [];
  expect(values[0]).toBe(values[1]! + 20);
  expect(pageErrors).toEqual([]);
});

// `REMAKE-037` replaced the native AA pool roll with the shared expert planner,
// so AA now goes to whichever reachable ally gains the most attack. Under
// `REMAKE-102` only melee allies are candidates at all, so the 巨斧戰士 escort
// is the enemy's single legal AA target: the 魔導師 can no longer buff itself.
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
    arena.setClass("great-axe-warrior");
    arena.setLevel(1);
    const ally = arena.interact(28, 30);
    return [first, second, guide, ally];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  for (const [x, actorId] of [[18, "arena-1-0"], [20, "arena-1-1"]] as const) {
    await clickArenaWorldCell(page, x, 30);
    await page.getByTestId("unit-command-rest").click();
    await page.waitForFunction((expectedActorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
      return current?.units.find(({ id }) => id === expectedActorId)?.acted === true
        && canvas?.dataset.mapCombatPhase === undefined;
    }, actorId);
  }

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "attack-up");
  await expect(dialogue).toHaveAttribute("data-effect-center", "28,30");
  await expect(page.getByText("功擊提昇.", { exact: true })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    target: { x: 28, y: 30 },
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-1",
      statusesAfter: expect.objectContaining({ attackUp: 3 }),
    })],
  });
  expect(pageErrors).toEqual([]);
});

// The 巫師 needs a non-ice companion: `REMAKE-034`'s pure-ice remnant gate
// filters every ice candidate while all surviving side-2 units are ice classes,
// so a lone 巫師 would fall back to an ordinary attack and never freeze anyone.
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
    const wizard = arena.interact(22, 30);
    arena.setClass("soldier");
    const escort = arena.interact(26, 30);
    return [guide, frozenTarget, wizard, escort];
  });
  expect(placed).toEqual([true, true, true, true]);
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
  // `REMAKE-095` pushes every unblocked receiver one cell outward along the
  // caster's line; the 巫師 is due east, so the ally is buffed on (19,30).
  const frozen = (await arenaBattleState(page))?.units.find(({ id }) => id === "arena-1-1");
  expect({ x: frozen?.x, y: frozen?.y }).toEqual({ x: 19, y: 30 });

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-attack-up").click();
  await clickArenaWorldCell(page, 19, 30);
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "statusEffect"
      && canvas.dataset.mapCombatFrame === "10"
      && canvas.dataset.iceDisabledUnitIds === "arena-1-1";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "2");
  await captureVisualAudit(page.getByTestId("game-screen"), {
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

test("prayer guide commits AD through the formal technique flow", async ({ page }) => {
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
    const ally = arena.interact(23, 30);
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
  await clickArenaWorldCell(page, 23, 30);

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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    target: { x: 23, y: 30 },
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
  await clickArenaWorldCell(page, 23, 30);
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
    // Same pure-ice remnant gate as the AA case above.
    const frozenTarget = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(22, 30);
    arena.setClass("soldier");
    const escort = arena.interact(26, 30);
    return [guide, frozenTarget, wizard, escort];
  });
  expect(placed).toEqual([true, true, true, true]);
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
  // Same `REMAKE-095` pushback as the AA case above.
  const frozen = (await arenaBattleState(page))?.units.find(({ id }) => id === "arena-1-1");
  expect({ x: frozen?.x, y: frozen?.y }).toEqual({ x: 19, y: 30 });

  await clickArenaWorldCell(page, 18, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-defense-up").click();
  await clickArenaWorldCell(page, 19, 30);
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "statusEffect"
      && canvas.dataset.mapCombatFrame === "5"
      && canvas.dataset.iceDisabledUnitIds === "arena-1-1";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "4");
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await expect(canvas).toHaveAttribute("data-map-combat-prayer-rolled-amount", "");
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

test("tier-three magic guide commits FM through the formal technique flow", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(after?.units.find(({ id }) => id === "arena-1-1")?.statuses.magicGuard).toBe(1);
  expect(pageErrors).toEqual([]);
});

// FM's support value is the flat 120 the expert planner gives every recipient;
// REMAKE-140 drops every 魔導師 recipient (the caster first), so the 士兵 escort
// receives the guard. AA
// cannot outrank it here because the escort's attack is below the FM constant.
// The enemy's guard is written as `2`, so it is still `1` — still up — when
// control returns to the player.
test("enemy tier-three magic guide shields its escort with an FM that is still up in the next player phase", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  const cast = await arenaBattleState(page);
  expect(cast?.lastSpecialAction).toMatchObject({
    actionId: "magic-guard",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-2-1",
      statusesAfter: expect.objectContaining({ magicGuard: 2 }),
    })],
  });

  // Back in the player phase the guard has survived the round boundary.
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.phase === "player" && current.round === 2;
  });
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.statuses.magicGuard).toBe(1);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.statuses.magicGuard).toBe(0);
  expect(pageErrors).toEqual([]);
});
