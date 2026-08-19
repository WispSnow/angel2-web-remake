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
    const target = arena.interact(23, 30);
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
  await clickArenaWorldCell(page, 23, 30);

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
    const second = arena.interact(22, 30);
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
    const target = arena.interact(23, 30);
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
  await clickArenaWorldCell(page, 23, 30);

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
    const caster = arena.interact(23, 30);
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

// REMAKE-083 raised 混亂 to `140 + threat/2` while 有效禁咒 stayed at `120 + threat/2`,
// so a tier-three curse-master facing clean technique-menu targets now announces LA, not
// SN. This case therefore pins the AI announcement path on the action the planner really
// picks. SN itself stays covered twice over: the player-cast presentation is the preceding
// case in this file, and `expert-ai.test.ts` asserts the exact `confusion = spellSeal + 20`
// ordering that makes the AI branch unreachable here. Driving the AI to SN would need both
// targets already confused (verified against `planEnemyAiAction`), which costs three enemy
// rounds during which the confused player units act erratically.
test("enemy tier-three curse-master announces the native LA notice its pool now ranks first.", async ({ page }) => {
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
  await expect(dialogue).toHaveAttribute("data-source-wait", "22");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8648");
  await expect(dialogue).toHaveAttribute("data-action-id", "confusion");
  await expect(dialogue).toHaveAttribute("data-effect-center", "20,30");
  await expect(page.getByText("混亂.", { exact: true })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-confusion-ai-notice.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastSpecialAction?.actionId === "confusion"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "confusion",
    actorId: "arena-2-0",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ confusion: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.confusion).toBe(3);
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
      && current.lastSpecialAction.actorId === "arena-2-1"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "poison",
    actorId: "arena-2-1",
    affectedUnits: [expect.objectContaining({
      unitId: "arena-1-0",
      statusesAfter: expect.objectContaining({ poison: 3, confusion: 3 }),
    })],
  });
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.statuses.poison).toBe(3);
  expect(pageErrors).toEqual([]);
});

test("a confused player unit answers a click with the native line and its own move", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  // The evil-sword warrior writes the same 3-round confusion the LA technique
  // does, so one enemy melee hit is enough to confuse a player unit.
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(3);
    const soldier = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("evil-sword-warrior");
    arena.setLevel(1);
    const attacker = arena.interact(21, 30);
    return [soldier, attacker];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.phase === "player"
      && (current.units.find(({ id }) => id === "arena-1-0")?.statuses.confusion ?? 0) > 0;
  });
  const confused = await arenaBattleState(page);
  const soldierBefore = confused?.units.find(({ id }) => id === "arena-1-0");
  // The hit wrote 3; the round boundary that hands the phase back has already
  // consumed one count.
  expect(soldierBefore?.statuses.confusion).toBe(2);
  expect(soldierBefore?.acted).toBe(false);

  // Native 0000:66F4: the click is accepted, but the unit speaks and is handed
  // to the single-unit AI entry instead of opening the command menu.
  await clickArenaWorldCell(page, soldierBefore!.x, soldierBefore!.y);
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "confused-actor");
  await expect(dialogue).toHaveAttribute("data-source-wait", "28");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:86AB");
  await expect(dialogue).toHaveAttribute("data-active-slot", "upper");
  await expect(dialogue).toContainText("我的頭好昏，無法思考．");
  await expect(page.getByTestId("command-menu")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-confused-player-line.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.units.find(({ id }) => id === "arena-1-0")?.acted === true;
  });
  const after = await arenaBattleState(page);
  const soldierAfter = after?.units.find(({ id }) => id === "arena-1-0");
  const attacker = after?.units.find(({ id }) => id === "arena-2-0");
  // The confused ordinary class retreats out of contact and never attacks, so
  // the last exchange on record is still the enemy hit that confused it.
  expect(soldierAfter?.acted).toBe(true);
  expect(after?.lastCombat).toEqual(confused?.lastCombat);
  expect(Math.abs(soldierAfter!.x - attacker!.x) + Math.abs(soldierAfter!.y - attacker!.y))
    .toBeGreaterThan(1);
  expect(after?.actionMode).not.toBe("actionMenu");
  expect(pageErrors).toEqual([]);
});

test("a sealed caster still gets the 技術 command and refuses it in the native words", async ({ page }) => {
  // Several full enemy technique presentations have to play before the seal
  // outlives the confusion it arrives with.
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    // One tier-three curse master lands LA first and only reaches SN in the next
    // round, so the seal outlives the confusion by exactly one round. Clicking a
    // confused unit runs its own route, so the test needs that clear-headed gap.
    arena.setSide(2);
    arena.setClass("curse-master");
    arena.setLevel(3);
    const casters = [arena.interact(24, 30)];
    arena.setSide(1);
    arena.setClass("magician");
    arena.setLevel(3);
    const player = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const reserve = arena.interact(20, 32);
    return [...casters, player, reserve];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();

  const magicianStatuses = async () => (await arenaBattleState(page))
    ?.units.find(({ id }) => id === "arena-1-0")?.statuses;
  const sealedAndClearHeaded = async () => {
    const statuses = await magicianStatuses();
    return (statuses?.techniqueSeal ?? 0) > 0 && (statuses?.confusion ?? 0) === 0;
  };
  for (let round = 0; round < 8 && !await sealedAndClearHeaded(); round += 1) {
    const before = await arenaBattleState(page);
    // 全部休息 spends every remaining ally and runs the rest of the round, which
    // keeps confused units on their own automatic route. The side-panel hotspots
    // only appear once nothing is focused, so hover empty ground first.
    await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
    await expect(page.getByTestId("game-screen"))
      .toHaveAttribute("data-side-panel-hotspots", "active");
    await page.getByTestId("all-rest-hotspot").click();
    const layer = page.getByTestId("dialogue-layer");
    await expect(layer).toHaveAttribute("data-source-record", "battle-command");
    await layer.click();
    await expect.poll(async () => (await arenaBattleState(page))?.groupCommandDialogueId)
      .toBeUndefined();
    await page.waitForFunction((previous) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
      return current?.phase === "player" && current.round > previous;
    }, before?.round ?? 0, { timeout: 40_000 });
  }
  expect(await sealedAndClearHeaded()).toBe(true);

  const magician = (await arenaBattleState(page))?.units.find(({ id }) => id === "arena-1-0");
  await clickArenaWorldCell(page, magician!.x, magician!.y);
  // `0000:6FFD` keeps listing 技術 while sealed; the refusal is spoken on use.
  const technique = page.getByTestId("unit-command-technique");
  await expect(technique).toBeVisible();
  await technique.click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "spell-sealed");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8677");
  await expect(dialogue).toContainText("我中了禁咒，無法使用法術．");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-spell-sealed-line.png`,
  });

  // Nothing was spent: the command menu comes back and the unit can still act.
  await expect(dialogue).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("unit-command-rest")).toBeVisible();
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);
  expect(after?.actionMode).toBe("actionMenu");
  expect(pageErrors).toEqual([]);
});

test("attacking with an empty reach speaks the native line instead of a strip note", async ({ page }) => {
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
    const player = arena.interact(20, 30);
    arena.setSide(2);
    const distant = arena.interact(30, 30);
    return [player, distant];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-attack").click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "no-target-in-range");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8692");
  await expect(dialogue).toContainText("沒有人在我的攻擊範圍內．");

  await expect(dialogue).toBeHidden({ timeout: 15_000 });
  const after = await arenaBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-0")?.acted).toBe(false);
  expect(after?.actionMode).toBe("actionMenu");
  expect(pageErrors).toEqual([]);
});

test("a counterattacking defender speaks between the hit and its counter", async ({ page }) => {
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
    const attacker = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(3);
    const defender = arena.interact(21, 30);
    return [attacker, defender];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  // The native counter line lives on the map branch only: `0000:9296`, the
  // full-screen route, never reaches `0000:92B3`. Turn 戰鬥動畫 off first.
  expect((await arenaBattleState(page))?.battlePresentation).toBe("full");
  await page.getByTestId("battle-canvas").hover({ position: { x: 420, y: 45 } });
  await page.getByTestId("battle-presentation-hotspot").click();
  await expect.poll(async () => (await arenaBattleState(page))?.battlePresentation).toBe("map");

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-attack").click();
  await clickArenaWorldCell(page, 21, 30);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "counterattack");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:86D7");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(dialogue).toContainText("妳竟敢打我．");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-counterattack-line.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as { battle?: ArenaBattleDebugState }).battle;
    return current?.lastCombat?.attackerId === "arena-1-0" && current.combatPresentation === undefined;
  }, undefined, { timeout: 30_000 });
  const after = await arenaBattleState(page);
  expect(after?.lastCombat?.counterOccurred).toBe(true);
  expect(after?.lastCombat?.counterDamage).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("a physical shot that cannot land makes the target say so", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("archer");
    arena.setLevel(1);
    const archer = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("swift-dragon-knight");
    arena.setLevel(1);
    const dragon = arena.interact(24, 30);
    return [archer, dragon];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  const dragonBefore = (await arenaBattleState(page))
    ?.units.find(({ id }) => id === "arena-2-0");
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-shoot").click();
  await clickArenaWorldCell(page, 24, 30);

  // REMAKE-099 made the native PIT coin flip a deterministic immunity, so every
  // such shot now reaches `0000:7260`'s line, spoken by the target.
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "dodged-shot");
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:86C2");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(dialogue).toContainText("要打中我沒那麼容易．");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-dodged-shot-line.png`,
  });

  await expect(dialogue).toBeHidden({ timeout: 15_000 });
  const after = await arenaBattleState(page);
  const dragonAfter = after?.units.find(({ id }) => id === "arena-2-0");
  expect(after?.lastSpecialAction?.damage).toBe(0);
  expect(dragonAfter?.life).toBe(dragonBefore?.life);
  expect(pageErrors).toEqual([]);
});
