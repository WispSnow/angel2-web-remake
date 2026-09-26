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

// These specs assert native line windows, which REMAKE-161 opens on a
// six-in-ten coin; pin it open so each asserted window appears.
test.beforeEach(async ({ page }) => pinNativeLineCoin(page));

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
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS);
  await clickArenaWorldCell(page, 23, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "fireEffect",
    mapCombatFrame: "8",
  }, { path: `${ARTIFACT_DIR}/arena-fire-2-column.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-2"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "fireEffect", mapCombatFrame: "8" })
    .mapCombatEffectTileCount).toBe("2");
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
  const dialogue = page.getByTestId("dialogue-layer");
  await dialogue.evaluate((layer, expectedLine) => {
    const observed = layer as HTMLElement & { __expectedLineWasVisible?: boolean };
    const record = () => {
      if (!observed.hidden && observed.textContent?.includes(expectedLine)) {
        observed.__expectedLineWasVisible = true;
      }
    };
    record();
    new MutationObserver(record).observe(observed, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  }, "看我的火球魔法.");
  const frames = await recordCanvasFrames(page, MAP_COMBAT_FRAME_KEYS);
  await page.getByTestId("unit-command-rest").click();

  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "fire-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "19,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  // 快转模式下对白可能在 Playwright 连续读取四个属性时已经收起；先挂观察器，才能证明
  // 玩家确实看见过这句，而不是把「隐藏节点仍留着文字」误当成通过。
  await expect.poll(() => dialogue.evaluate((layer) =>
    Boolean((layer as HTMLElement & { __expectedLineWasVisible?: boolean })
      .__expectedLineWasVisible))).toBe(true);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "fireEffect",
    mapCombatFrame: "8",
  }, { path: `${ARTIFACT_DIR}/arena-fire-2-ai-column.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "fireEffect", mapCombatFrame: "8" })
    .mapCombatEffectTileCount).toBe("2");
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
  const frames = await recordCanvasFrames(page, [
    ...MAP_COMBAT_FRAME_KEYS,
    "mapCombatEffectAtlasFrames",
  ]);
  await clickArenaWorldCell(page, 23, 30);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "fireEffect",
    mapCombatFrame: "10",
  }, { path: `${ARTIFACT_DIR}/arena-fire-3-wave.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-3"
      && current.specialActionPresentation === undefined;
  });
  expect(drawnFrame(await frames.stop(), { mapCombatPhase: "fireEffect", mapCombatFrame: "10" }))
    .toMatchObject({
      mapCombatEffectTileCount: "6",
      mapCombatEffectAtlasFrames: [39, 40, 41, 42, 43, 44]
        .map((frame) => `fire-3__effect__${frame}`).join(","),
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
  const frames = await recordCanvasFrames(page, [
    ...MAP_COMBAT_FRAME_KEYS,
    "mapCombatAnchorOffset",
    "mapCombatEffectTextureKeys",
  ], arenaUnitsProbe);
  await clickArenaWorldCell(page, 23, 33);
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "fireEffect",
    mapCombatFrame: "20",
  }, { path: `${ARTIFACT_DIR}/arena-fire-4-rising-column.png` });
  await frames.captureVisualAudit(page.getByTestId("game-screen"), {
    mapCombatPhase: "fireEffect",
    mapCombatFrame: "24",
  }, { path: `${ARTIFACT_DIR}/arena-fire-4-finish.png` });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "fire-4"
      && current.specialActionPresentation === undefined;
  });
  const drawn = await frames.stop();
  const risingColumn = drawnFrame(drawn, { mapCombatPhase: "fireEffect", mapCombatFrame: "20" });
  expect(risingColumn).toMatchObject({
    mapCombatAnchorOffset: "0,0",
    mapCombatEffectTileCount: "9",
    mapCombatEffectTextureKeys: Array.from(
      { length: 9 },
      (_, index) => `map-fire-4-finish-${index}`,
    ).join(","),
  });
  expect(risingColumn.state?.["arena-2-0"]?.life).toBe(targetBefore?.life);
  expect(drawnFrame(drawn, { mapCombatPhase: "fireEffect", mapCombatFrame: "24" })).toMatchObject({
    mapCombatAnchorOffset: "0,0",
    mapCombatEffectTileCount: "4",
    mapCombatEffectTextureKeys: [18, 19, 19, 20]
      .map((frame) => `map-fire-4-finish-${frame}`).join(","),
  });
  expect(drawnFrame(drawn, { mapCombatPhase: "fireEffect", mapCombatFrame: "28" })).toMatchObject({
    mapCombatAnchorOffset: "0,-4",
    mapCombatEffectTileCount: "4",
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
