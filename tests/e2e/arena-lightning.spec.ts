import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("tier-one magic master performs native 2L with its two-stage lightning column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(1);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(22, 30);
    const inner = arena.interact(22, 31);
    const outside = arena.interact(27, 30);
    return [actor, center, inner, outside];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-2")).toContainText("中級落雷");
  await page.getByTestId("technique-lightning-2").click();
  await clickArenaWorldCell(page, 22, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "15");
  const during = await arenaBattleState(page);
  expect(during?.specialActionPresentation?.phase).toBe("lightningMain");
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-2-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.specialActionPresentation?.phase === "lightningCleanup";
  });
  // Only the two enemies inside the effect diamond receive MAGIC/6; the one
  // five cells out has range value 0 and is skipped by `1000:6DE8`.
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "2");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-2-cleanup.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-2"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-2",
    actorId: "arena-1-0",
    target: { x: 22, y: 30 },
    damage: 105,
    experienceGained: 0,
  });
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 60);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 45);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outsideBefore);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("enemy tier-one magic master uses 2L and the native group-11 dialogue", async ({ page }) => {
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
    const ally = arena.interact(25, 30);
    arena.setSide(2);
    arena.setClass("magic-master");
    arena.setLevel(1);
    const enemy = arena.interact(29, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 25, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "ai-technique");
  await expect(dialogue).toHaveAttribute("data-action-id", "lightning-2");
  await expect(dialogue).toHaveAttribute("data-effect-center", "25,30");
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  await expect(page.getByText("看我的雷電魔法.", { exact: true })).toBeVisible();

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-2"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-2",
    actorId: "arena-2-0",
    target: { x: 25, y: 30 },
    damage: 60,
  });
  expect(pageErrors).toEqual([]);
});

test("tier-two magic master raises the native 3L cloud before landing its inherited-anchor column", async ({ page }) => {
  const pageErrors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".wav")) audioRequests.push(pathname);
  });
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(2);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(24, 30);
    const inner = arena.interact(24, 31);
    const outside = arena.interact(29, 30);
    return [actor, center, inner, outside];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-3")).toContainText("高級落雷");
  await expect(page.getByTestId("technique-lightning-2")).toHaveCount(0);
  await page.getByTestId("technique-lightning-3").click();
  await clickArenaWorldCell(page, 24, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-map-combat-phase", "lightningMain");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "3"
      && dataset.mapCombatAnchorOffset === "0,-1";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-3-cloud.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "9"
      && dataset.mapCombatAnchorOffset === "0,-3";
  }, undefined, { polling: "raf" });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "12"
      && dataset.mapCombatAnchorOffset === "0,-4";
  }, undefined, { polling: "raf" });
  const during = await arenaBattleState(page);
  expect(during?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-3-column.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-3"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-3",
    actorId: "arena-1-0",
    target: { x: 24, y: 30 },
    damage: 165,
    experienceGained: 0,
  });
  expect(audioRequests).toContain("/assets/original/audio/e/41.wav");
  expect(audioRequests).toContain("/assets/original/audio/e/9.wav");
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 90);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 75);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outsideBefore);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("tier-three magic master descends native 4L before planting its inherited-anchor column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-master");
    arena.setLevel(3);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(23, 33);
    const inner = arena.interact(24, 33);
    const outer = arena.interact(23, 37);
    const outside = arena.interact(29, 33);
    return [actor, center, inner, outer, outside];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const innerBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;
  const outerBefore = before?.units.find(({ id }) => id === "arena-2-2")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-3")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-lightning-4")).toContainText("究級落雷");
  await expect(page.getByTestId("technique-lightning-2")).toHaveCount(0);
  await expect(page.getByTestId("technique-lightning-3")).toHaveCount(0);
  await page.getByTestId("technique-lightning-4").click();
  await clickArenaWorldCell(page, 23, 33);
  if (process.env.VISUAL_AUDIT === "1") {
    await page.waitForFunction(() => {
      const dataset = document.querySelector<HTMLCanvasElement>(
        "[data-testid='battle-canvas']",
      )?.dataset;
      return dataset?.mapCombatPhase === "lightningMain"
        && dataset.mapCombatFrame === "16"
        && dataset.mapCombatAnchorOffset === "0,0";
    }, undefined, { polling: "raf" });
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `${ARTIFACT_DIR}/arena-lightning-4-descending.png`,
    });

    await page.waitForFunction(() => {
      const dataset = document.querySelector<HTMLCanvasElement>(
        "[data-testid='battle-canvas']",
      )?.dataset;
      return dataset?.mapCombatPhase === "lightningMain"
        && dataset.mapCombatFrame === "21"
        && dataset.mapCombatAnchorOffset === "0,1";
    }, undefined, { polling: "raf" });
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `${ARTIFACT_DIR}/arena-lightning-4-column.png`,
    });
  }

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "arena-1-0",
    target: { x: 23, y: 33 },
    damage: 230,
    experienceGained: 0,
  });
  expect(after?.specialActionPresentationTrace).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: "lightningMain", frame: 16 }),
    expect.objectContaining({
      phase: "lightningMain",
      frame: 21,
      displayedLifeByUnitId: expect.objectContaining({ "arena-2-0": centerBefore }),
    }),
  ]));
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 110);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(innerBefore! - 90);
  expect(after?.units.find(({ id }) => id === "arena-2-2")?.life).toBe(outerBefore! - 30);
  expect(after?.units.find(({ id }) => id === "arena-2-3")?.life).toBe(outsideBefore);
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("reduced motion keeps every native 1L draw and the in-range cleanup", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magician");
    arena.setLevel(1);
    const actor = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const center = arena.interact(22, 30);
    const outside = arena.interact(27, 30);
    return [actor, center, outside];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const centerBefore = before?.units.find(({ id }) => id === "arena-2-0")?.life;
  const outsideBefore = before?.units.find(({ id }) => id === "arena-2-1")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-lightning-1").click();
  await clickArenaWorldCell(page, 22, 30);

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain" && dataset.mapCombatFrame === "12";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-1-reduced-motion-main.png`,
  });

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningCleanup";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-1-reduced-motion-cleanup.png`,
  });
  // Native `1000:6DE8` requires a non-zero effect-range value, so the enemy
  // seven cells away never receives the MAGIC/6 cleanup sprite.
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "1");

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-1"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const drawsFor = (phase: string) =>
    after?.specialActionPresentationTrace.filter((entry) => entry.phase === phase).length;
  expect({
    main: drawsFor("lightningMain"),
    hit: drawsFor("lightningHit"),
    cleanup: drawsFor("lightningCleanup"),
  }).toEqual({ main: 32, hit: 22, cleanup: 5 });
  expect(after?.specialActionPresentationTrace
    .filter(({ phase }) => phase.startsWith("lightning"))
    .reduce((total, entry) => total + entry.nativeTicks, 0)).toBe(414);
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.life).toBe(centerBefore! - 50);
  expect(after?.units.find(({ id }) => id === "arena-2-1")?.life).toBe(outsideBefore);
  expect(pageErrors).toEqual([]);
});

test("formal 4L skips an ice-frozen covered enemy and keeps its shell above the full column", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("wizard");
    arena.setLevel(1);
    const wizard = arena.interact(20, 30);
    arena.setClass("magic-master");
    arena.setLevel(3);
    const caster = arena.interact(20, 32);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    // REMAKE-094 only freezes targets that land back inside the ice effect, so
    // this one starts on 2C's value-2 ring and is pushed to the value-1 cell
    // (22,31) — still inside the 4L column the 魔導師 is about to drop.
    const frozen = arena.interact(22, 30);
    const center = arena.interact(23, 32);
    return [wizard, caster, frozen, center];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  const before = await arenaBattleState(page);
  const frozenLife = before?.units.find(({ id }) => id === "arena-2-0")?.life;

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-2").click();
  // Self-centred ice previews its footprint first; the cast needs a confirmation.
  await page.keyboard.press(" ");
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "ice-2"
      && current.specialActionPresentation === undefined;
  });

  await clickArenaWorldCell(page, 20, 32);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-lightning-4").click();
  await clickArenaWorldCell(page, 23, 32);
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "lightningMain"
      && dataset.mapCombatFrame === "21"
      && dataset.mapCombatAnchorOffset === "0,1"
      && dataset.iceDisabledCount === "1"
      && dataset.iceDisabledUnitIds === "arena-2-0";
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-lightning-4-frozen-exception.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "lightning-4"
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastSpecialAction).toMatchObject({
    actionId: "lightning-4",
    actorId: "arena-1-1",
    target: { x: 23, y: 32 },
    affectedUnits: expect.arrayContaining([
      expect.objectContaining({
        unitId: "arena-2-0",
        damage: 0,
        lifeAfter: frozenLife,
        actionDisabledAfter: true,
      }),
      expect.objectContaining({ unitId: "arena-2-1", damage: 110 }),
    ]),
  });
  expect(pageErrors).toEqual([]);
});
