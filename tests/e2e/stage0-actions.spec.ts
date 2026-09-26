import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

type ClassActionId = "archer-shot" | "fire-1" | "heal-1";
type PromotedClassId = "archer" | "cavalry" | "sister" | "warrior";

interface ActionDebugState {
  phase: string;
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
