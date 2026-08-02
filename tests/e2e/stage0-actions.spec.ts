import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type ClassActionId = "archer-shot" | "fire-1" | "heal-1";
type PromotedClassId = "archer" | "cavalry" | "sister" | "warrior";

interface ActionDebugState {
  actionMode: string;
  battlePresentation: "map" | "full";
  rngState: number;
  commands: Array<{ id: string; label: string }>;
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
  };
  specialActionPresentationTrace: Array<{ phase: string; frame: number }>;
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

const forceSetup = (
  page: Page,
  classId: PromotedClassId,
  ordinaryCombat = false,
) => page.evaluate(
  ({ selectedClass, ordinary }) =>
    window.__ANGEL2__?.forceClassActionSetup(selectedClass, ordinary),
  { selectedClass: classId, ordinary: ordinaryCombat },
);

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

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

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
  await page.getByTestId("game-screen").screenshot({
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
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-archer-shoot-effect.png",
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
  await page.getByTestId("game-screen").screenshot({
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
  await page.getByTestId("game-screen").screenshot({
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
  await page.getByTestId("game-screen").screenshot({
    path: "artifacts/playwright/stage0-sister-fire-effect.png",
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as ActionDebugState;
    return current.lastSpecialAction?.actionId === "fire-1"
      && current.specialActionPresentation === undefined;
  });
  const afterFire = await state(page);
  expect(afterFire.specialActionPresentationTrace.filter(({ phase }) => phase === "fireEffect"))
    .toHaveLength(7);
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
    await expect(page.getByTestId("full-actor-sprite")).toHaveAttribute(
      "src",
      new RegExp(`${classId}-plus50/\\d\\d\\.png$`),
    );
    await page.getByTestId("game-screen").screenshot({
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
      await page.getByTestId("game-screen").screenshot({
        path: "artifacts/playwright/stage0-full-combat-archer-release.png",
      });
      await expect(page.getByTestId("full-combat-projectile"))
        .toHaveAttribute("data-top", "91");
      await page.waitForFunction(() => {
        const projectile = (window.__ANGEL2__?.getState() as ActionDebugState)
          .combatPresentation?.fullScene?.projectile;
        return projectile !== undefined && projectile.frame >= 6;
      });
      await page.getByTestId("game-screen").screenshot({
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
      await page.getByTestId("game-screen").screenshot({
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
      await page.getByTestId("game-screen").screenshot({
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
