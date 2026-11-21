import { expect, test, type Page } from "@playwright/test";
import { MAP_COMBAT_FRAME_KEYS, recordCanvasFrames } from "./canvas-frame-recorder";
import { captureVisualAudit } from "./visual-audit";

type ClassActionId = "archer-shot" | "fire-1" | "heal-1" | "lightning-1" | "recovery-1";
type PromotedClassId = "archer" | "cavalry" | "magician" | "monk" | "sister" | "warrior";

interface ActionDebugState {
  phase: string;
  statusMessage: string;
  round: number;
  actionMode: string;
  battlePresentation: "map" | "full";
  rngState: number;
  commandMenuKind: string;
  commands: Array<{ id: string; label: string }>;
  reachable: Array<{ x: number; y: number }>;
  actionRange: Array<{ x: number; y: number }>;
  lastSpecialAction?: {
    actionId: ClassActionId;
    damage: number;
    healing: number;
    blocked: boolean;
    targetDied: boolean;
  };
  specialActionPresentation?: {
    phase: string;
    frame: number;
    target: { id: string; life: number };
    displayedLifeByUnitId: Record<string, number>;
    lifeChangeUnitId?: string;
  };
  specialActionPresentationTrace: Array<{
    phase: string;
    frame: number;
    displayedLifeByUnitId: Record<string, number>;
    lifeChangeUnitId?: string;
  }>;
  restPresentation?: {
    unit: { id: string; side: 1 | 2; life: number };
    phase: "restEffect" | "restBlank";
    frame: number;
    nativeTicks: number;
  };
  restPresentationTrace: Array<{
    unit: { id: string; side: 1 | 2; life: number };
    phase: "restEffect" | "restBlank";
    frame: number;
    nativeTicks: number;
  }>;
  audioCueLog: Array<{
    group: "e" | "magic";
    record: number;
    reason: string;
  }>;
  combatPresentation?: {
    phase: string;
    fullScene?: {
      t: number;
      sprites: Array<{
        classId: number;
        set: "direct" | "plus50";
        frame: number;
        x: number;
        lift: number;
        mirror: boolean;
      }>;
      projectile?: { classId: number; frame: number; x: number; y: number };
    };
  };
  units: Array<{
    id: string;
    side: 1 | 2;
    classId: string;
    x: number;
    y: number;
    life: number;
    experience: number;
    acted: boolean;
  }>;
}

const state = (page: Page) =>
  page.evaluate(() => window.__ANGEL2__?.getState() as ActionDebugState);

const waitForGameReady = (page: Page) => page.waitForFunction(
  () => window.__ANGEL2__?.getState() !== undefined,
);

const forceSetup = async (
  page: Page,
  classId: PromotedClassId,
  ordinaryCombat = false,
): Promise<void> => {
  await waitForGameReady(page);
  await page.evaluate(
    ({ selectedClass, ordinary }) =>
      window.__ANGEL2__?.forceClassActionSetup(selectedClass, ordinary),
    { selectedClass: classId, ordinary: ordinaryCombat },
  );
};

const clickMapCell = (
  page: Page,
  x: number,
  y: number,
) => page.getByTestId("battle-canvas").click({ position: { x, y } });

const openActorMenu = async (page: Page) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickMapCell(page, 220, 177);
    if ((await state(page)).actionMode === "actionMenu") return;
    await page.waitForTimeout(50);
  }
  expect((await state(page)).actionMode).toBe("actionMenu");
};

test("individual player rest reuses the silent MAGIC/0 healing finish", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await waitForGameReady(page);
  await page.evaluate(() => window.__ANGEL2__?.forceRestSetup());
  const before = await state(page);
  const allyBefore = before.units.find(({ id }) => id === "1:0")!;

  await openActorMenu(page);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState | undefined;
    return current?.restPresentation?.phase === "restEffect"
      && current.restPresentation.unit.side === 1;
  });
  const playerRest = await state(page);
  expect(playerRest.units.find(({ id }) => id === allyBefore.id)?.life).toBe(allyBefore.life);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-map-combat-phase", "restEffect");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-map-combat-target", allyBefore.id);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-map-combat-effect-tile-count", "1");
  // `DS:60E0`'s one-tile descriptors start at the resting unit's cell top-left.
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-map-combat-effect-top-lefts", `${allyBefore.x * 40},${allyBefore.y * 44}`);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-player-rest-effect.png",
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState | undefined;
    return current?.round === 2 && !current.restPresentation;
  });
  const after = await state(page);
  expect(after.units.find(({ id }) => id === allyBefore.id)?.life).toBeGreaterThan(allyBefore.life);
  expect(after.restPresentationTrace.map(({ phase, frame, nativeTicks }) => ({
    phase,
    frame,
    nativeTicks,
  }))).toEqual([
    ...Array.from({ length: 5 }, (_, frame) => ({
      phase: "restEffect",
      frame,
      nativeTicks: 15,
    })),
    { phase: "restBlank", frame: -1, nativeTicks: 15 },
  ]);
  expect(after.audioCueLog).not.toContainEqual(expect.objectContaining({
    group: "e",
    record: 36,
  }));
});

test("M00.6 archer shooting keeps simulation frozen through UN/60, then commits", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await forceSetup(page, "archer");
  const before = await state(page);
  const targetBefore = before.units.find(({ id }) => id === "2:48")!;

  await openActorMenu(page);
  expect((await state(page)).commands).toContainEqual({ id: "shoot", label: "射擊" });
  await page.getByTestId("unit-command-shoot").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("specialTarget");
  expect((await state(page)).actionRange.length).toBeGreaterThan(0);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-range-mode", "specialTarget");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-archer-shoot-range.png",
  });

  await clickMapCell(page, 380, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "shootHit";
  });
  const during = await state(page);
  expect(during.rngState).toBe(before.rngState);
  expect(during.units.find(({ id }) => id === targetBefore.id)?.life).toBe(targetBefore.life);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-map-combat-effect-tile-count", "1");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-archer-shoot-effect.png",
  });

  await page.waitForFunction((targetId) => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "lifeDrain"
      && current.specialActionPresentation.lifeChangeUnitId === targetId;
  }, targetBefore.id);
  const archerDrain = await state(page);
  const archerDisplayedLife = archerDrain.specialActionPresentation!
    .displayedLifeByUnitId[targetBefore.id];
  expect(archerDrain.units.find(({ id }) => id === targetBefore.id)?.life)
    .toBe(targetBefore.life);
  expect(archerDisplayedLife).toBeLessThan(targetBefore.life);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-archer-shoot-life-drain.png",
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "archer-shot"
      && current.specialActionPresentation === undefined;
  });
  const after = await state(page);
  expect(after.lastSpecialAction?.damage).toBeGreaterThanOrEqual(30);
  expect(after.lastSpecialAction?.damage).toBeLessThanOrEqual(49);
  expect(after.units.find(({ id }) => id === "1:0")?.acted).toBe(true);
  expect(after.units.find(({ id }) => id === targetBefore.id)?.life)
    .toBe(targetBefore.life - after.lastSpecialAction!.damage);
  expect(after.rngState).not.toBe(before.rngState);
  expect(after.specialActionPresentationTrace.filter(({ phase }) => phase === "shootHit"))
    .toHaveLength(8);
  const archerDrainTrace = after.specialActionPresentationTrace
    .filter(({ phase }) => phase === "lifeDrain");
  expect(archerDrainTrace).toHaveLength(after.lastSpecialAction!.damage);
  expect(archerDrainTrace[0].displayedLifeByUnitId[targetBefore.id])
    .toBe(targetBefore.life - 1);
  expect(archerDrainTrace.at(-1)?.displayedLifeByUnitId[targetBefore.id])
    .toBe(targetBefore.life - after.lastSpecialAction!.damage);
});

const MOVE_CONFIRM_COMMANDS = [
  { id: "confirm", label: "確定" },
  { id: "cancel", label: "取消" },
];

/**
 * The menu kind follows the pending path, which is set as the walk starts, so wait
 * for the menu itself before reading which commands a landing produced.
 */
const waitForMenu = (page: Page, kind: string) => expect.poll(async () => {
  const current = await state(page);
  return current.actionMode === "actionMenu" ? current.commandMenuKind : undefined;
}).toBe(kind);

/** The class-action fixtures centre the camera on (29,26), putting the view origin at (25,23). */
const clickFixtureCell = (page: Page, x: number, y: number) =>
  clickMapCell(page, 40 + (x - 25) * 40 + 20, 23 + (y - 23) * 44 + 22);

test("M00.6 post-move menus keep shooting but never offer techniques", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await forceSetup(page, "sister");
  await openActorMenu(page);
  await page.getByTestId("unit-command-move").click();
  // (32,26) is next to the enemy at (33,26), so the landing has an attack target.
  expect((await state(page)).reachable).toContainEqual({ x: 32, y: 26 });
  await clickFixtureCell(page, 32, 26);
  await expect.poll(async () => (await state(page)).actionMode).toBe("actionMenu");
  expect((await state(page)).commands).toEqual([
    { id: "attack", label: "攻擊" },
    { id: "end", label: "結束" },
    { id: "undo", label: "返悔" },
  ]);
  await expect(page.getByTestId("unit-command-technique")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-sister-post-move-no-technique.png",
  });

  await forceSetup(page, "archer");
  await openActorMenu(page);
  await page.getByTestId("unit-command-move").click();
  // Five cells from the enemy is past the bow's reach and nobody is adjacent, so
  // `7428` counts no shot target either and `734C` asks 確定／取消.
  await clickFixtureCell(page, 28, 26);
  await waitForMenu(page, "moveConfirm");
  expect((await state(page)).commands).toEqual(MOVE_CONFIRM_COMMANDS);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await state(page)).actionMode).toBe("move");
  // Three cells away is inside the bow range without being adjacent: `6AF9` opens
  // `DS:3E1E`, which has no 攻擊 at all.
  expect((await state(page)).reachable).toContainEqual({ x: 30, y: 26 });
  await clickFixtureCell(page, 30, 26);
  await waitForMenu(page, "postMove");
  expect((await state(page)).commands).toEqual([
    { id: "shoot", label: "射擊" },
    { id: "end", label: "結束" },
    { id: "undo", label: "返悔" },
  ]);
  await expect(page.getByTestId("unit-command-attack")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-archer-post-move-shoot-only.png",
  });
  // REMAKE-163: cancelling the shot's target pick returns to this menu with the
  // archer still on its landing cell, instead of undoing the move as `6B3F` does.
  await page.getByTestId("unit-command-shoot").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("specialTarget");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await state(page)).actionMode).toBe("actionMenu");
  const cancelledShot = await state(page);
  expect(cancelledShot.commandMenuKind).toBe("postMove");
  expect(cancelledShot.units.find(({ id }) => id === "1:0"))
    .toMatchObject({ x: 30, y: 26, acted: false });

  // REMAKE-163: an adjacent enemy with nothing in bow range keeps the four-item
  // menu, instead of `6A55` striking the only neighbour at once.
  await forceSetup(page, "archer", true);
  await openActorMenu(page);
  await page.getByTestId("unit-command-move").click();
  const reachable = (await state(page)).reachable;
  const besideEnemy = [{ x: 30, y: 25 }, { x: 30, y: 27 }, { x: 31, y: 26 }]
    .find((cell) => reachable.some(({ x, y }) => x === cell.x && y === cell.y));
  if (!besideEnemy) throw new Error("the archer fixture has no reachable cell beside its enemy");
  await clickFixtureCell(page, besideEnemy.x, besideEnemy.y);
  await waitForMenu(page, "postMove");
  const beside = await state(page);
  expect(beside.commands).toEqual([
    { id: "attack", label: "攻擊" },
    { id: "shoot", label: "射擊" },
    { id: "end", label: "結束" },
    { id: "undo", label: "返悔" },
  ]);
  expect(beside.units.find(({ id }) => id === "1:0")).toMatchObject({ ...besideEnemy, acted: false });
});

test("a move with nothing to attack asks 確定／取消 and 取消 returns to picking a cell", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await forceSetup(page, "warrior");
  await openActorMenu(page);
  await page.getByTestId("unit-command-move").click();
  const range = (await state(page)).reachable;
  // The fixture enemy stands at (30,26); from (28,26) it is two cells away.
  await clickFixtureCell(page, 28, 26);
  await waitForMenu(page, "moveConfirm");
  const landed = await state(page);
  expect(landed.actionMode).toBe("actionMenu");
  expect(landed.commands).toEqual(MOVE_CONFIRM_COMMANDS);
  expect(landed.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 28, y: 26, acted: false });
  await expect(page.getByTestId("action-menu")).toHaveAttribute("data-kind", "moveConfirm");
  await expect(page.getByTestId("unit-command-confirm")).toBeVisible();
  await expect(page.getByTestId("unit-command-attack")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-move-without-target-confirm.png",
  });

  // `73ED` puts the unit back and reopens the same destination loop with the full
  // range; a cancel from there is what reaches the command menu again.
  await page.getByTestId("unit-command-cancel").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("move");
  const reselecting = await state(page);
  expect(reselecting.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 29, y: 26, acted: false });
  expect(reselecting.reachable).toEqual(range);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await state(page)).commandMenuKind).toBe("initial");
  expect((await state(page)).actionMode).toBe("actionMenu");

  await page.getByTestId("unit-command-move").click();
  await clickFixtureCell(page, 28, 26);
  await waitForMenu(page, "moveConfirm");
  await page.getByTestId("unit-command-confirm").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("idle");
  expect((await state(page)).units.find(({ id }) => id === "1:0"))
    .toMatchObject({ x: 28, y: 26, acted: true });
});

test("M00.6 sister technique menu preserves nested cancel and both native timelines", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await forceSetup(page, "sister");
  const beforeHeal = await state(page);
  const allyBefore = beforeHeal.units.find(({ id }) => id === "1:1")!;

  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-1")).toHaveText("初級炎暴");
  await expect(page.getByTestId("technique-heal-1")).toHaveText("初級治療");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-sister-technique-menu.png",
  });
  await page.getByTestId("technique-heal-1").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("specialTarget");
  await page.keyboard.press("Alt");
  await expect.poll(async () => (await state(page)).actionMode).toBe("techniqueMenu");
  await page.getByTestId("technique-heal-1").click();
  const healFrames = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "mapCombatEffectTopLefts"]);
  await clickMapCell(page, 300, 177);

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "healPrimary"
      && current.specialActionPresentation.frame >= 20;
  });
  const duringHeal = await state(page);
  expect(duringHeal.units.find(({ id }) => id === allyBefore.id)?.life).toBe(allyBefore.life);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-sister-heal-effect.png",
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "heal-1"
      && current.specialActionPresentation === undefined;
  });
  const afterHeal = await state(page);
  // `UN/61` and the shared `MAGIC/0` finish are one-tile descriptors at (0,0): every tile starts at the
  // target cell's top-left. Bottom-centring dragged the finish's smaller early sparkles down and right.
  const healTiles = (await healFrames.stop()).filter(({ mapCombatPhase }) =>
    mapCombatPhase === "healPrimary" || mapCombatPhase === "healTail");
  expect(healTiles.filter(({ mapCombatPhase }) => mapCombatPhase === "healTail")
    .map(({ mapCombatFrame }) => mapCombatFrame)).toEqual(["0", "1", "2", "3", "4"]);
  for (const tile of healTiles) {
    expect(tile.mapCombatEffectTopLefts, `${tile.mapCombatPhase} ${tile.mapCombatFrame}`)
      .toBe(`${allyBefore.x * 40},${allyBefore.y * 44}`);
  }
  expect(afterHeal.specialActionPresentationTrace.filter(({ phase }) => phase === "healPrimary"))
    .toHaveLength(39);
  expect(afterHeal.specialActionPresentationTrace.filter(({ phase }) => phase === "healTail"))
    .toHaveLength(5);
  expect(afterHeal.specialActionPresentationTrace.at(-1)).toMatchObject({
    phase: "healTail",
    frame: 4,
    nativeTicks: 15,
  });
  expect(afterHeal.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 36,
    reason: "heal-1-start",
  }));
  expect(afterHeal.units.find(({ id }) => id === allyBefore.id)?.life)
    .toBe(allyBefore.life + afterHeal.lastSpecialAction!.healing);

  await forceSetup(page, "sister");
  const beforeFire = await state(page);
  const enemyBefore = beforeFire.units.find(({ id }) => id === "2:48")!;
  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-fire-1").click();
  const fireFrames = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "mapCombatEffectTopLefts", "mapActionHd"]);
  await clickMapCell(page, 380, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "fireEffect";
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-sister-fire-effect.png",
  });
  await page.waitForFunction((targetId) => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "lifeDrain"
      && current.specialActionPresentation.lifeChangeUnitId === targetId;
  }, enemyBefore.id);
  const fireDrain = await state(page);
  expect(fireDrain.units.find(({ id }) => id === enemyBefore.id)?.life)
    .toBe(enemyBefore.life);
  expect(fireDrain.specialActionPresentation!.displayedLifeByUnitId[enemyBefore.id])
    .toBeLessThan(enemyBefore.life);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-sister-fire-life-drain.png",
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "fire-1"
      && current.specialActionPresentation === undefined;
  });
  const afterFire = await state(page);
  // `MAGIC/22` is a one-tile descriptor drawn from the target cell's top-left, like every other
  // descriptor; bottom-centring shifted the narrower last frame (32x42) right and down.
  const fireTiles = (await fireFrames.stop()).filter(({ mapCombatPhase }) => mapCombatPhase === "fireEffect");
  expect(fireTiles.map(({ mapCombatFrame }) => mapCombatFrame)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  for (const tile of fireTiles) {
    expect(tile.mapCombatEffectTopLefts, `frame ${tile.mapCombatFrame}`)
      .toBe(`${enemyBefore.x * 40},${enemyBefore.y * 44}`);
    // `REMAKE-203`: the default 原版 art style keeps the original frames.
    expect(tile.mapActionHd, `frame ${tile.mapCombatFrame}`).toBe("original:style");
  }
  expect(afterFire.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(7);
  expect(afterFire.specialActionPresentationTrace.findLast(
    ({ phase }) => phase === "fireEffect",
  )).toMatchObject({
    phase: "fireEffect",
    frame: 6,
  });
  const fireDrainTrace = afterFire.specialActionPresentationTrace
    .filter(({ phase }) => phase === "lifeDrain");
  expect(fireDrainTrace).toHaveLength(afterFire.lastSpecialAction!.damage);
  expect(fireDrainTrace.at(-1)?.displayedLifeByUnitId[enemyBefore.id])
    .toBe(enemyBefore.life - afterFire.lastSpecialAction!.damage);
  expect(afterFire.audioCueLog).toContainEqual(expect.objectContaining({
    group: "magic",
    record: 83,
    reason: "fire-1-start",
  }));
  expect(afterFire.units.find(({ id }) => id === enemyBefore.id)?.life)
    .toBe(enemyBefore.life - afterFire.lastSpecialAction!.damage);
});

// 第 0 关的修女靠反复治疗就能在回合上限内再转职（用户回报：第 43 回合转成魔術士／僧侶）。
// 二转后的技術選單曾读不到第 1 关才登记的技术定义，渲染中途抛错而停在命令选单，
// 存档也因第 0 关职业白名单只收一转职业而校验失败。
test("second-promotion casters open their 技術 menu, cast and save in stage 0", async ({ page }) => {
  await page.goto("/?test=1&skipStartup=1");
  await waitForGameReady(page);
  await page.evaluate(() => window.__ANGEL2__?.clearSaves());

  await forceSetup(page, "monk");
  const beforeRecovery = await state(page);
  const woundedAlly = beforeRecovery.units.find(({ id }) => id === "1:1")!;
  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("techniqueMenu");
  await expect(page.getByTestId("action-menu")).toHaveAttribute("data-kind", "technique");
  await expect(page.getByTestId("technique-heal-1")).toHaveText("初級治療");
  await expect(page.getByTestId("technique-recovery-1")).toHaveText("初級回復");
  await expect(page.getByTestId("unit-command-technique")).toHaveCount(0);
  await page.getByTestId("technique-recovery-1").click();
  await clickMapCell(page, 300, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "recovery-1"
      && current.specialActionPresentation === undefined;
  });
  const afterRecovery = await state(page);
  expect(afterRecovery.lastSpecialAction!.healing).toBeGreaterThan(0);
  expect(afterRecovery.units.find(({ id }) => id === woundedAlly.id)?.life)
    .toBe(woundedAlly.life + afterRecovery.lastSpecialAction!.healing);

  await forceSetup(page, "magician");
  const beforeLightning = await state(page);
  const enemyBefore = beforeLightning.units.find(({ side, x, y }) =>
    side === 2 && x === 30 && y === 26)!;
  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("action-menu")).toHaveAttribute("data-kind", "technique");
  await expect(page.getByTestId("technique-fire-1")).toHaveText("初級炎暴");
  await expect(page.getByTestId("technique-lightning-1")).toHaveText("初級落雷");
  await expect(page.getByTestId("technique-ice-1")).toHaveText("初級冰雪");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-magician-technique-menu.png",
  });
  await page.getByTestId("technique-lightning-1").click();
  await expect.poll(async () => (await state(page)).actionMode).toBe("specialTarget");
  await clickMapCell(page, 260, 177);
  // 地图技能图集只按 `mapPresentationActionIds` 预载；漏列时这里画不出落雷。
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.specialActionPresentation?.phase === "lightningMain"
      && current.specialActionPresentation.frame >= 8;
  });
  await expect(page.getByTestId("battle-canvas"))
    .not.toHaveAttribute("data-map-combat-effect-tile-count", "0");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/stage0-magician-lightning.png",
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "lightning-1"
      && current.specialActionPresentation === undefined;
  });
  const afterLightning = await state(page);
  expect(afterLightning.specialActionPresentationTrace.length).toBeGreaterThan(0);
  expect(afterLightning.units.find(({ id }) => id === enemyBefore.id)?.life ?? 0)
    .toBe(Math.max(0, enemyBefore.life - afterLightning.lastSpecialAction!.damage));

  await page.keyboard.press("Escape");
  await page.getByTestId("system-command-save").click();
  await page.getByTestId("record-slot-1").click();
  await expect.poll(async () => (await state(page)).statusMessage).toBe("已儲存至記錄 1。");
  const saved = JSON.parse(
    await page.evaluate(() => localStorage.getItem("angel2.save.1")) ?? "null",
  ) as { battle: { units: Array<{ id: string; classId: string }> } };
  expect(saved.battle.units.find(({ id }) => id === "1:0")?.classId).toBe("magician");
});

for (const [classId, nativeRecord, voiceRecord] of [
  ["archer", 20, 50],
  ["sister", 24, 52],
  ["warrior", 28, 15],
] as const) {
  test(`M00.6 ${classId} ordinary combat uses native full-screen record ${nativeRecord}`, async ({ page }) => {
    await page.goto("/?test=1&slowFull=1&skipStartup=1");
    await forceSetup(page, classId, true);
    expect((await state(page)).battlePresentation).toBe("full");
    await openActorMenu(page);
    await page.getByTestId("unit-command-attack").click();
    await page.waitForFunction((expectedRecord) => {
      const current = window.__ANGEL2__?.getState() as ActionDebugState;
      return current.combatPresentation?.fullScene?.sprites
        .some(({ classId: record, set }) => record === expectedRecord && set === "plus50");
    }, nativeRecord);
    const actorSprite = page.getByTestId("full-actor-sprite");
    await expect(actorSprite).toHaveAttribute("data-atlas", `left-${classId}`);
    await expect(actorSprite).toHaveAttribute(
      "data-frame-source",
      new RegExp(`left/${classId}/plus50/\\d\\d$`),
    );
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `artifacts/playwright/stage0-full-combat-${classId}.png`,
    });
    if (classId === "archer") {
      await page.waitForFunction(() => {
        const current = window.__ANGEL2__?.getState() as ActionDebugState;
        const scene = current.combatPresentation?.fullScene;
        return scene?.sprites.some(({ classId: record, frame }) =>
          record === 20 && frame === 3) === true
          && scene.projectile?.classId === 20
          && scene.projectile.frame === 5
          && scene.projectile.y === 110;
      });
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: "artifacts/playwright/stage0-full-combat-archer-release.png",
      });
      await expect(page.getByTestId("full-combat-projectile"))
        .toHaveAttribute("data-top", "91");
      await page.waitForFunction(() => {
        const projectile = (window.__ANGEL2__?.getState() as ActionDebugState)
          .combatPresentation?.fullScene?.projectile;
        return projectile !== undefined && projectile.frame >= 6;
      });
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: "artifacts/playwright/stage0-full-combat-archer-impact.png",
      });
    }
    if (classId === "warrior") {
      await page.waitForFunction(() => {
        const actor = (window.__ANGEL2__?.getState() as ActionDebugState)
          .combatPresentation?.fullScene?.sprites
          .find(({ classId: record, set }) => record === 28 && set === "plus50");
        return actor?.frame === 2 && actor.lift >= 40;
      });
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: "artifacts/playwright/stage0-full-combat-warrior-leap.png",
      });
      await page.waitForFunction(() => {
        const actor = (window.__ANGEL2__?.getState() as ActionDebugState)
          .combatPresentation?.fullScene?.sprites
          .find(({ classId: record, set }) => record === 28 && set === "plus50");
        return actor?.frame === 4 && actor.mirror === false;
      });
      const contactScene = (await state(page)).combatPresentation!.fullScene!;
      const contactActor = contactScene.sprites.find(({ classId: record, set }) =>
        record === 28 && set === "plus50")!;
      await page.waitForFunction((after) => {
        const scene = (window.__ANGEL2__?.getState() as ActionDebugState)
          .combatPresentation?.fullScene;
        return scene !== undefined && scene.t >= after;
      }, contactScene.t + 150);
      const exitingActor = (await state(page)).combatPresentation?.fullScene?.sprites
        .find(({ classId: record, set }) => record === 28 && set === "plus50");
      expect(exitingActor).toMatchObject({ frame: 4, mirror: false });
      expect(exitingActor?.x).toBeLessThan(contactActor.x);
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: "artifacts/playwright/stage0-full-combat-warrior-contact-hold.png",
      });
    }
    await page.waitForFunction(() => {
      const current = window.__ANGEL2__?.getState() as ActionDebugState;
      return current.combatPresentation === undefined;
    });
    expect((await state(page)).audioCueLog).toContainEqual(expect.objectContaining({
      group: "e",
      record: voiceRecord,
    }));
  });
}

const DISPLAY_KEY = "angel2.preferences.display.v1";
const FIRE_1_HD = "/assets/original/map-actions/hd/fire-1/hd.mp4";
const HEAL_1_HD = "/assets/original/map-actions/hd/heal-1/hd.mp4";
const HEAL_TAIL_HD = "/assets/original/map-actions/hd/heal-tail/hd.mp4";
const useHdArtStyle = (page: Page) => page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
  DISPLAY_KEY,
  JSON.stringify({ imageScaling: "sharp", interfaceZoom: 100, portraitStyle: "hd" }),
] as const);

declare global {
  interface Window {
    __mapActionHdTicks?: number[];
    __mapActionHdShows?: string[];
  }
}

/** Every tick the HD canvas draws, in order (it updates on its own animation frames, not on controller emits). */
const recordHdTicks = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=map-action-hd-canvas]");
  if (!canvas) throw new Error("the HD map-action canvas is not mounted");
  const ticks: number[] = [];
  window.__mapActionHdTicks = ticks;
  new MutationObserver(() => {
    const tick = canvas.dataset.mapActionHdTick;
    if (tick !== undefined) ticks.push(Number(tick));
  }).observe(canvas, { attributes: true, attributeFilter: ["data-map-action-hd-tick"] });
});

/** Every set of clips the HD canvas draws (`clip:tick;clip:tick`), in order, including afterglows after the cast. */
const recordHdShows = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=map-action-hd-canvas]");
  if (!canvas) throw new Error("the HD map-action canvas is not mounted");
  const shows: string[] = [];
  window.__mapActionHdShows = shows;
  new MutationObserver(() => {
    const value = canvas.dataset.mapActionHdShows;
    if (value) shows.push(value);
  }).observe(canvas, { attributes: true, attributeFilter: ["data-map-action-hd-shows"] });
});

const hdVideosReady = (page: Page, sources: readonly string[]) => page.evaluate((wanted) => wanted.every((source) =>
  [...document.querySelectorAll("video")].some((video) => video.dataset.sourceUrl === source && video.readyState >= 2)), sources);

/** Ticks the HD canvas drew for one clip, from the recorded show sets. */
const recordedClipTicks = async (page: Page, clipId: string): Promise<number[]> => (await page.evaluate(() => window.__mapActionHdShows ?? []))
  .flatMap((set) => set.split(";").filter((entry) => entry.startsWith(`${clipId}:`)).map((entry) => Number(entry.split(":")[1])));

const castSisterFire = async (page: Page) => {
  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-fire-1").click();
  const frames = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "mapActionHd", "mapActionHdFrameTicks"]);
  await clickMapCell(page, 380, 177);
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "fire-1" && current.specialActionPresentation === undefined;
  });
  return (await frames.stop()).filter(({ mapCombatPhase }) => mapCombatPhase === "fireEffect");
};

test("REMAKE-203: in 高清 the sister's 1F plays the HD clip on its own canvas through the original frames", async ({ page }) => {
  await useHdArtStyle(page);
  // `slowMap` keeps the native 10 ms per tick under ?test=1, so the HD clip plays at its real speed.
  await page.goto("/?test=1&skipStartup=1&slowMap=1");
  await forceSetup(page, "sister");
  const before = await state(page);
  const enemyBefore = before.units.find(({ id }) => id === "2:48")!;
  await expect.poll(() => page.evaluate((source) => [...document.querySelectorAll("video")]
    .some((video) => video.dataset.sourceUrl === source && video.readyState >= 2), FIRE_1_HD), { timeout: 15_000 }).toBe(true);
  await recordHdTicks(page);
  const hdCanvas = page.getByTestId("map-action-hd-canvas");
  const audit = process.env.VISUAL_AUDIT === "1";
  if (audit) {
    // The mushroom cloud lasts ~200 ms: hold the program clock once the HD tick passes 35. The HD layer keeps drawing
    // its current frame while the program is paused, and the clock resumes where it stopped.
    await page.evaluate(async () => {
      const clock = await import("/src/game/program-clock.ts");
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=map-action-hd-canvas]")!;
      const observer = new MutationObserver(() => {
        if (Number(canvas.dataset.mapActionHdTick ?? -1) < 35) return;
        observer.disconnect();
        clock.setProgramPaused(true);
        document.documentElement.dataset.hdHeld = "true";
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ["data-map-action-hd-tick"] });
    });
  }
  const capture = audit ? (async () => {
    await page.waitForFunction(() => document.documentElement.dataset.hdHeld === "true", null, { timeout: 15_000 });
    // the pause overlay would dim the picture; hide it for the capture only
    const overlay = await page.addStyleTag({ content: ".program-pause-overlay { display: none !important; }" });
    await page.waitForTimeout(200);
    await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-sister-fire-hd.png" });
    await overlay.evaluate((element) => element.remove());
    await page.evaluate(async () => (await import("/src/game/program-clock.ts")).setProgramPaused(false));
  })() : Promise.resolve();
  const fire = await castSisterFire(page);
  await capture;

  // the controller still emits and waits the seven original frames; the HD layer draws them all, no original tile
  expect(fire.map(({ mapCombatFrame }) => mapCombatFrame)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  expect(fire.map(({ mapActionHdFrameTicks }) => mapActionHdFrameTicks))
    .toEqual(["0,10", "10,20", "20,30", "30,40", "40,50", "50,60", "60,70"]);
  for (const frame of fire) {
    expect(frame.mapActionHd, `frame ${frame.mapCombatFrame}`).toBe("hd");
    expect(frame.mapCombatEffectTileCount, `frame ${frame.mapCombatFrame}`).toBe("0");
  }
  const ticks = await page.evaluate(() => window.__mapActionHdTicks ?? []);
  expect(ticks.length).toBeGreaterThan(10);
  expect(Math.min(...ticks)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...ticks)).toBeLessThan(70);
  expect(Math.max(...ticks)).toBeGreaterThan(55);
  expect(ticks.every((tick, index) => index === 0 || tick >= ticks[index - 1])).toBe(true);
  await expect(hdCanvas).not.toHaveAttribute("data-map-action-hd-action", /./u);

  // the result, the life drain and the sound request are those of the original presentation
  const after = await state(page);
  expect(after.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect")).toHaveLength(7);
  expect(after.audioCueLog).toContainEqual(expect.objectContaining({ group: "magic", record: 83, reason: "fire-1-start" }));
  expect(after.units.find(({ id }) => id === enemyBefore.id)?.life).toBe(enemyBefore.life - after.lastSpecialAction!.damage);
});

test("REMAKE-204: in 高清 the sister's 1H plays the heart and the shared finish as HD clips; the finish fades out after the controller moves on", async ({ page }) => {
  await useHdArtStyle(page);
  // `slowMap` keeps the native 10 ms per tick under ?test=1, so the clips play at their real speed.
  await page.goto("/?test=1&skipStartup=1&slowMap=1");
  await forceSetup(page, "sister");
  const before = await state(page);
  const allyBefore = before.units.find(({ id }) => id === "1:1")!;
  await expect.poll(() => hdVideosReady(page, [HEAL_1_HD, HEAL_TAIL_HD]), { timeout: 15_000 }).toBe(true);
  await recordHdShows(page);
  const hdCanvas = page.getByTestId("map-action-hd-canvas");
  const audit = process.env.VISUAL_AUDIT === "1";
  if (audit) {
    // hold the program clock while the blue ring pulses out of the heart (HD tick 130), as the 1F audit does
    await page.evaluate(async () => {
      const clock = await import("/src/game/program-clock.ts");
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=map-action-hd-canvas]")!;
      const observer = new MutationObserver(() => {
        if (canvas.dataset.mapActionHdAction !== "heal-1" || Number(canvas.dataset.mapActionHdTick ?? -1) < 130) return;
        observer.disconnect();
        clock.setProgramPaused(true);
        document.documentElement.dataset.hdHeld = "true";
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ["data-map-action-hd-tick"] });
    });
  }
  const capture = audit ? (async () => {
    await page.waitForFunction(() => document.documentElement.dataset.hdHeld === "true", null, { timeout: 15_000 });
    const overlay = await page.addStyleTag({ content: ".program-pause-overlay { display: none !important; }" });
    await page.waitForTimeout(200);
    await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/stage0-sister-heal-hd.png" });
    await overlay.evaluate((element) => element.remove());
    await page.evaluate(async () => (await import("/src/game/program-clock.ts")).setProgramPaused(false));
  })() : Promise.resolve();

  await openActorMenu(page);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-heal-1").click();
  const recorded = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "mapActionHd", "mapActionHdFrameTicks"]);
  await clickMapCell(page, 300, 177);
  await capture;
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "heal-1" && current.specialActionPresentation === undefined;
  });
  // the controller has moved on: the finish's afterglow is still on the HD canvas, past the original 75 ticks
  await expect(hdCanvas).toHaveAttribute("data-map-action-hd-action", "heal-tail");
  await expect(hdCanvas).not.toHaveAttribute("data-map-action-hd-action", /./u, { timeout: 5_000 });

  const frames = (await recorded.stop()).filter(({ mapCombatPhase }) =>
    mapCombatPhase === "healPrimary" || mapCombatPhase === "healBlank" || mapCombatPhase === "healTail");
  // 39 heart frames, the blank cleanup and the five finish frames, all drawn by the HD layer, no original tile
  expect(frames.map(({ mapCombatPhase }) => mapCombatPhase)).toEqual([
    ...Array<string>(39).fill("healPrimary"), "healBlank", ...Array<string>(5).fill("healTail"),
  ]);
  for (const frame of frames) {
    expect(frame.mapActionHd, `${frame.mapCombatPhase} ${frame.mapCombatFrame}`).toBe("hd");
    expect(frame.mapCombatEffectTileCount, `${frame.mapCombatPhase} ${frame.mapCombatFrame}`).toBe("0");
  }
  expect(frames[39]?.mapActionHdFrameTicks).toBe("195,200");
  expect(frames.slice(40).map(({ mapActionHdFrameTicks }) => mapActionHdFrameTicks))
    .toEqual(["0,15", "15,30", "30,45", "45,60", "60,75"]);
  const heart = await recordedClipTicks(page, "heal-1");
  const finish = await recordedClipTicks(page, "heal-tail");
  expect(Math.max(...heart)).toBeLessThan(200);
  expect(finish.every((tick, index) => index === 0 || tick >= finish[index - 1])).toBe(true);
  expect(Math.max(...finish)).toBeGreaterThan(90);
  expect(Math.max(...finish)).toBeLessThan(120);

  // the afterglow never held the controller: the original timeline, sound and healing are unchanged
  const after = await state(page);
  expect(after.specialActionPresentationTrace.filter(({ phase }) => phase === "healTail").map(({ nativeTicks }) => nativeTicks))
    .toEqual([15, 15, 15, 15, 15]);
  expect(after.audioCueLog).toContainEqual(expect.objectContaining({ group: "e", record: 36, reason: "heal-1-start" }));
  expect(after.units.find(({ id }) => id === allyBefore.id)?.life).toBe(allyBefore.life + after.lastSpecialAction!.healing);
});

test("REMAKE-204: in 高清 resting plays the shared finish clip and lets its afterglow fade after the rest", async ({ page }) => {
  await useHdArtStyle(page);
  await page.goto("/?test=1&skipStartup=1");
  await waitForGameReady(page);
  await page.evaluate(() => window.__ANGEL2__?.forceRestSetup());
  await expect.poll(() => hdVideosReady(page, [HEAL_TAIL_HD]), { timeout: 15_000 }).toBe(true);
  await recordHdShows(page);
  const recorded = await recordCanvasFrames(page, [...MAP_COMBAT_FRAME_KEYS, "mapActionHd", "mapActionHdFrameTicks"]);
  await openActorMenu(page);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState | undefined;
    return current?.round === 2 && !current.restPresentation;
  });
  const frames = (await recorded.stop()).filter(({ mapCombatPhase }) => mapCombatPhase === "restEffect");
  expect(frames.map(({ mapCombatFrame }) => mapCombatFrame)).toEqual(["0", "1", "2", "3", "4"]);
  for (const frame of frames) {
    expect(frame.mapActionHd, `restEffect ${frame.mapCombatFrame}`).toBe("hd");
    expect(frame.mapCombatEffectTileCount, `restEffect ${frame.mapCombatFrame}`).toBe("0");
  }
  expect(frames.map(({ mapActionHdFrameTicks }) => mapActionHdFrameTicks)).toEqual(["0,15", "15,30", "30,45", "45,60", "60,75"]);
  await expect.poll(async () => Math.max(...await recordedClipTicks(page, "heal-tail")), { timeout: 5_000 }).toBeGreaterThan(90);
  await expect(page.getByTestId("map-action-hd-canvas")).not.toHaveAttribute("data-map-action-hd-action", /./u, { timeout: 5_000 });
  // resting stays silent and keeps its original timing
  const after = await state(page);
  expect(after.restPresentationTrace.map(({ phase, nativeTicks }) => `${phase}:${nativeTicks}`))
    .toEqual([...Array<string>(5).fill("restEffect:15"), "restBlank:15"]);
  expect(after.audioCueLog).not.toContainEqual(expect.objectContaining({ group: "e", record: 36 }));
});

test("REMAKE-203: a 1F HD clip that cannot be decoded falls back to the original frames for the whole cast", async ({ page }) => {
  await useHdArtStyle(page);
  // the clip's bytes arrive, but the video element is handed something it cannot decode
  await page.addInitScript((source) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src")!;
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      ...descriptor,
      set(this: HTMLMediaElement, value: string) {
        descriptor.set!.call(this, this.dataset.sourceUrl === source ? "data:video/mp4;base64,AAAAAAAA" : value);
      },
    });
  }, FIRE_1_HD);
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/?test=1&skipStartup=1");
  await forceSetup(page, "sister");
  await expect.poll(() => warnings.some((text) => text.includes("HD map action clip fire-1 falls back to the original"))).toBe(true);
  const fire = await castSisterFire(page);
  expect(fire.map(({ mapCombatFrame }) => mapCombatFrame)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  for (const frame of fire) {
    expect(frame.mapActionHd, `frame ${frame.mapCombatFrame}`).toBe("original:failed");
    expect(Number(frame.mapCombatEffectTileCount), `frame ${frame.mapCombatFrame}`).toBeGreaterThan(0);
  }
});
