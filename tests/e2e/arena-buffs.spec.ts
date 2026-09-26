import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  arenaUnitsProbe,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { drawnFrame, MAP_COMBAT_FRAME_KEYS, recordCanvasFrames } from "./canvas-frame-recorder";
import { pinNativeLineCoin } from "./native-line-coin";
import { captureVisualAudit } from "./visual-audit";

// These specs assert native line windows, which REMAKE-161 opens on a
// six-in-ten coin; pin it open so each asserted window appears.
test.beforeEach(async ({ page }) => pinNativeLineCoin(page));

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
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS, arenaUnitsProbe);
  await clickArenaWorldCell(page, 23, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  }, { path: `${ARTIFACT_DIR}/arena-attack-up-mid.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "attack-up"
      && current.specialActionPresentation === undefined;
  });
  const during = drawnFrame(await frames.stop(), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  });
  expect(during.mapCombatEffectTileCount).toBe("2");
  expect(during.state?.["arena-1-1"]?.statuses.attackUp).toBe(0);
  expect(during.state?.["arena-1-0"]?.experience).toBe(casterBefore?.experience);
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
  const frames = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "iceDisabledUnitIds"]);
  await clickArenaWorldCell(page, 19, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  }, { path: `${ARTIFACT_DIR}/arena-attack-up-frozen-exception.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "attack-up"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "statusEffect", mapCombatFrame: "10" }))
    .toMatchObject({ iceDisabledUnitIds: "arena-1-1", mapCombatEffectTileCount: "2" });
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
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS, arenaUnitsProbe);
  await clickArenaWorldCell(page, 23, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "5",
  }, { path: `${ARTIFACT_DIR}/arena-defense-up-mid.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "defense-up"
      && current.specialActionPresentation === undefined;
  });
  const during = drawnFrame(await frames.stop(), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "5",
  });
  expect(during.mapCombatEffectTileCount).toBe("4");
  expect(during.state?.["arena-1-1"]?.statuses.defenseUp).toBe(0);
  expect(during.state?.["arena-1-0"]?.experience).toBe(casterBefore?.experience);
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
  const frames = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "iceDisabledUnitIds"]);
  await clickArenaWorldCell(page, 19, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "5",
  }, { path: `${ARTIFACT_DIR}/arena-defense-up-frozen-exception.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "defense-up"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "statusEffect", mapCombatFrame: "5" }))
    .toMatchObject({ iceDisabledUnitIds: "arena-1-1", mapCombatEffectTileCount: "4" });
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

test("OJ over a split water warrior stacks every body on the shared record and spends the caster once", async ({ page }) => {
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
    arena.setClass("water-warrior");
    arena.setLevel(1);
    const waterWarrior = arena.interact(24, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    const attacker = arena.interact(25, 30);
    return [caster, waterWarrior, attacker];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  // The arena shows 10×7 cells, so a unit off camera has to be brought in by
  // right-clicking, which focuses the next ally that has not acted yet.
  const focusAlly = async (unitId: string) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const current = await arenaBattleState(page);
      const unit = current?.units.find(({ id }) => id === unitId);
      if (!current || !unit) throw new Error(`missing ${unitId}`);
      if (unit.x >= current.cameraOrigin.x && unit.x < current.cameraOrigin.x + 10
        && unit.y >= current.cameraOrigin.y && unit.y < current.cameraOrigin.y + 7) {
        return unit;
      }
      const occupied = new Set(current.units.map(({ x, y }) => `${x},${y}`));
      const empty = [1, 2, 3]
        .map((offset) => ({ x: current.cameraOrigin.x + offset, y: current.cameraOrigin.y + 1 }))
        .find(({ x, y }) => !occupied.has(`${x},${y}`))!;
      await clickArenaWorldCell(page, empty.x, empty.y, { button: "right" });
      await page.waitForFunction((target) => {
        const battle = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
        const focused = battle?.units.find(({ id }) => id === target);
        return !!battle && !!focused
          && focused.x >= battle.cameraOrigin.x && focused.x < battle.cameraOrigin.x + 10
          && focused.y >= battle.cameraOrigin.y && focused.y < battle.cameraOrigin.y + 7;
      }, unitId, { timeout: 5_000 }).catch(() => undefined);
    }
    throw new Error(`could not bring ${unitId} on camera`);
  };
  const waitForIdlePlayer = (round: number, unitIds: readonly string[] = []) => page.waitForFunction(
    ([expectedRound, requiredIds]) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState & { restPresentation?: unknown };
      }).battle;
      return current?.phase === "player"
        && current.round === expectedRound
        && current.actionMode === "idle"
        && current.restPresentation === undefined
        && requiredIds.every((id) => current.units.some((unit) => unit.id === id));
    },
    [round, unitIds] as const,
  );

  // Both allies rest so the adjacent 士兵 strikes the water warrior in the enemy
  // phase, and BAT-054 splits a second body off it.
  for (const unitId of ["arena-1-0", "arena-1-1"]) {
    const ally = await focusAlly(unitId);
    await clickArenaWorldCell(page, ally.x, ally.y);
    await page.getByTestId("unit-command-rest").click();
    if (unitId === "arena-1-0") {
      await page.waitForFunction(() => {
        const current = (window.__ANGEL2_ARENA__?.getState() as {
          battle?: ArenaBattleDebugState & { restPresentation?: unknown };
        }).battle;
        return current?.units.find(({ id }) => id === "arena-1-0")?.acted === true
          && current.actionMode === "idle"
          && current.restPresentation === undefined;
      });
    }
  }
  await waitForIdlePlayer(2, ["arena-1-1:split-1"]);
  const before = await arenaBattleState(page);
  const rootBefore = before?.units.find(({ id }) => id === "arena-1-1")!;
  // The split body sits in the free cell above and points at the same slot, so it
  // carries the root's life, experience and status words.
  expect(before?.units.find(({ id }) => id === "arena-1-1:split-1")).toMatchObject({
    x: 24,
    y: 29,
    life: rootBefore.life,
    experience: rootBefore.experience,
    statuses: rootBefore.statuses,
  });

  const caster = await focusAlly("arena-1-0");
  await clickArenaWorldCell(page, caster.x, caster.y);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-prayer").click();

  // Board order is split (24,29), caster (18,30), root (24,30), and all three pass
  // the gate. The root is the body whose own snapshot used to go stale — the split
  // body had already raised the shared attack word — so the prayer threw here and
  // the caster kept its action.
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "prayerEffect"
      && dataset.mapCombatLifeChangeUnit === "arena-1-1"
      && dataset.mapCombatPrayerOutcome === "experience"
      && dataset.mapCombatPrayerRolledAmount === "13";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  for (const bodyId of ["arena-1-1", "arena-1-1:split-1"]) {
    expect(during?.units.find(({ id }) => id === bodyId)).toMatchObject({
      experience: rootBefore.experience + 13,
      statuses: expect.objectContaining({ attackUp: 3 }),
    });
  }
  expect(during?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-prayer-split-water-warrior.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "prayer"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction?.affectedUnits).toEqual([
    expect.objectContaining({ unitId: "arena-1-1:split-1", prayerOutcome: "attackUp" }),
    expect.objectContaining({ unitId: "arena-1-0", prayerOutcome: "attackUp" }),
    expect.objectContaining({
      unitId: "arena-1-1",
      prayerOutcome: "experience",
      prayerRolledAmount: 13,
      statusesBefore: expect.objectContaining({ attackUp: 3 }),
      experienceAfter: rootBefore.experience + 13,
    }),
  ]);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(true);
  for (const bodyId of ["arena-1-1", "arena-1-1:split-1"]) {
    expect(after?.units.find(({ id }) => id === bodyId)).toMatchObject({
      life: rootBefore.life,
      experience: rootBefore.experience + 13,
      statuses: expect.objectContaining({ attackUp: 3 }),
    });
  }
  expect(after?.rngCalls).toBe(before!.rngCalls + 7);
  for (const step of after?.specialActionPresentationTrace ?? []) {
    expect(step.displayedLifeByUnitId["arena-1-1:split-1"])
      .toBe(step.displayedLifeByUnitId["arena-1-1"]);
  }
  await expect(page.getByTestId("status-strip"))
    .toContainText("祈禱回應 3 名我方：生命 0、經驗 1、攻擊 2、防禦 0。");

  // What the player saw: picking the caster again must not reopen its commands.
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => ((await arenaBattleState(page)) as
    (ArenaBattleDebugState & { cursor?: { x: number; y: number } }) | undefined)?.cursor)
    .toEqual({ x: 18, y: 30 });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("status-strip")).toContainText("此單位本回合已行動。");
  await expect(page.getByTestId("unit-command-technique")).toBeHidden();
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
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS, arenaUnitsProbe);
  await clickArenaWorldCell(page, 24, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  }, { path: `${ARTIFACT_DIR}/arena-magic-guard-mid.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-guard"
      && current.specialActionPresentation === undefined;
  });
  const during = drawnFrame(await frames.stop(), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  });
  expect(during.mapCombatEffectTileCount).toBe("2");
  expect(during.state?.["arena-1-1"]?.statuses.magicGuard).toBe(0);
  expect(during.state?.["arena-1-0"]?.experience).toBe(casterBefore?.experience);
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
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS, () => ({
    dialogueHidden: document.querySelector<HTMLElement>("[data-testid='dialogue-layer']")?.hidden,
  }));
  await page.getByTestId("unit-command-rest").click();
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "statusEffect",
    mapCombatFrame: "10",
  }, { path: `${ARTIFACT_DIR}/arena-magic-guard-ai.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-guard"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "statusEffect", mapCombatFrame: "10" }))
    .toMatchObject({ mapCombatEffectTileCount: "2", state: { dialogueHidden: true } });
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
