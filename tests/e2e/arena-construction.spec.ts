import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("engineer performs reachable native 1K construction in the integrated arena", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("engineer");
    arena.setLevel(3);
    const engineer = arena.interact(20, 30);
    arena.setClass("soldier");
    arena.setLevel(1);
    const ally = arena.interact(18, 30);
    arena.setSide(2);
    const enemy = arena.interact(30, 30);
    return [engineer, ally, enemy];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  expect(before?.terrainOverrides).toEqual([]);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-0");
  expect(actorBefore).toMatchObject({
    classId: "engineer",
    x: 20,
    y: 30,
    acted: false,
  });

  await clickArenaWorldCell(page, 20, 30);
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-iron-plate")).toContainText("鐵板");
  await page.getByTestId("technique-iron-plate").click();
  await clickArenaWorldCell(page, 21, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-terrain-override-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "21,29:iron-plate|20,30:iron-plate|22,30:iron-plate|21,31:iron-plate",
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-iron-plate.png`,
  });

  const after = await arenaBattleState(page);
  expect(after?.lastConstruction).toMatchObject({
    actionId: "iron-plate",
    actorId: "arena-1-0",
    actorPositionBefore: { x: 20, y: 30 },
    actorPositionAfter: { x: 21, y: 30 },
    path: [{ x: 20, y: 30 }, { x: 21, y: 30 }],
  });
  expect(after?.lastConstruction?.terrainMutations.map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 21, y: 31 },
    { x: 21, y: 29 },
    { x: 22, y: 30 },
    { x: 20, y: 30 },
  ]);
  expect(after?.lastConstruction?.terrainMutations.every(({ slotAfter }) => slotAfter === 3))
    .toBe(true);
  expect(after?.terrainOverrides).toEqual([
    { x: 21, y: 29, kind: "iron-plate" },
    { x: 20, y: 30, kind: "iron-plate" },
    { x: 22, y: 30, kind: "iron-plate" },
    { x: 21, y: 31, kind: "iron-plate" },
  ]);
  expect(after?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    x: 21,
    y: 30,
    acted: true,
    experience: actorBefore?.experience,
  });
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});

test("engineer performs reachable native 2K obstacle construction in the integrated arena", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("engineer");
    arena.setLevel(2);
    const engineer = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const enemy = arena.interact(30, 30);
    return [engineer, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const before = await arenaBattleState(page);
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-iron-plate")).toContainText("鐵板");
  await expect(page.getByTestId("technique-obstacle")).toContainText("障礙");
  await page.getByTestId("technique-obstacle").click();
  await clickArenaWorldCell(page, 21, 30);

  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-terrain-override-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "21,29:obstacle|20,30:obstacle|22,30:obstacle|21,31:obstacle",
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-obstacle.png`,
  });

  const after = await arenaBattleState(page);
  expect(after?.lastConstruction).toMatchObject({
    actionId: "obstacle",
    actorId: "arena-1-0",
    actorPositionBefore: { x: 20, y: 30 },
    actorPositionAfter: { x: 21, y: 30 },
    path: [{ x: 20, y: 30 }, { x: 21, y: 30 }],
  });
  expect(after?.lastConstruction?.terrainMutations.every(({ kind, slotAfter }) =>
    kind === "obstacle" && slotAfter === 3)).toBe(true);
  expect(after?.units.find(({ id }) => id === "arena-1-0")).toMatchObject({
    x: 21,
    y: 30,
    acted: true,
  });
  expect({ state: after?.rngState, calls: after?.rngCalls })
    .toEqual({ state: before?.rngState, calls: before?.rngCalls });
  expect(pageErrors).toEqual([]);
});
