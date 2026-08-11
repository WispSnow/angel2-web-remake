import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("tier-two curse-master commits IP after its poison presentation", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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

  await clickArenaWorldCell(page, 24, 30);
  await expect(page.getByTestId("status-icon-confusion")).toHaveAttribute(
    "data-remaining-rounds",
    "3",
  );

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

test("tier-one curse-master commits SA after its formal presentation", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

// LA outranks SA on any target the expert planner can still confuse: its
// control term is `100 + threat/2` against SA's `40 + threat/4`, so no board
// makes SA win first. A second 咒術師 therefore carries the SA audit — once the
// first has landed 混亂, LA is redundant and SA becomes the best remaining
// entry in the same native tier-one pool.
test("enemy tier-one curse-master selects SA once LA is redundant and announces the original typo", async ({ page }) => {
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
    const first = arena.interact(23, 30);
    const second = arena.interact(24, 30);
    return [player, first, second];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "confusion"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "19");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8632");
  await expect(dialogue).toHaveAttribute("data-action-id", "attack-down");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("功擊降低.", { exact: true })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-attack-down-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "attack-down"
      && current.lastSpecialAction.actorId === "arena-2-1"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "attack-down",
    actorId: "arena-2-1",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ attackDown: 3, confusion: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.attackDown).toBe(3);
  expect(pageErrors).toEqual([]);
});

test("tier-one magic-priest commits SD after its formal presentation", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  expect(pageErrors).toEqual([]);
});

test("tier-three curse-master commits SN after its formal presentation", async ({ page }) => {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
  await captureVisualAudit(page.getByTestId("game-screen"), {
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

// Same LA-first ordering as the tier-one SA case: once 混亂 is on the board,
// IP's `80 + life/4` beats SA's `40 + threat/4` and becomes the tier-two pool's
// best remaining entry.
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
    const first = arena.interact(23, 30);
    const second = arena.interact(24, 30);
    return [player, first, second];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "confusion"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-source-wait", "20");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:863C");
  await expect(dialogue).toHaveAttribute("data-action-id", "poison");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("中毒.", { exact: true })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
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
