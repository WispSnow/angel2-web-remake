import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("player chooses an exact magic-arrow line before firing", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-archer");
    const shooter = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    const target = arena.interact(23, 31);
    arena.setClass("warrior");
    const rightBranch = arena.interact(21, 30);
    arena.setClass("soldier");
    const downBranch = arena.interact(20, 31);
    return [shooter, target, rightBranch, downBranch];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-shoot").click();
  await clickArenaWorldCell(page, 23, 31);
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-action-mode", "shotRoute");
  await expect(page.getByTestId("shot-route-summary")).toBeVisible();

  const firstSelection = await arenaBattleState(page);
  expect(firstSelection?.magicArcherRoutes.length).toBeGreaterThan(1);
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-shot-route-count", String(firstSelection!.magicArcherRoutes.length));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("status-strip")).toHaveAttribute("data-route-index", "1");
  await page.keyboard.press("Q");
  await expect(page.getByTestId("status-strip")).toHaveAttribute("data-route-index", "0");
  // The strip is a plain readout now, so the wheel is taken anywhere over the
  // game surface rather than only while hovering the picker.
  await page.getByTestId("battle-canvas").hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId("status-strip")).toHaveAttribute("data-route-index", "1");
  await page.mouse.wheel(0, -100);
  await expect(page.getByTestId("status-strip")).toHaveAttribute("data-route-index", "0");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-action-mode", "specialTarget");
  await expect(page.getByTestId("shot-route-summary")).toHaveCount(0);

  await clickArenaWorldCell(page, 23, 31);
  const routes = (await arenaBattleState(page))?.magicArcherRoutes ?? [];
  const selectedIndex = routes.findIndex((route) =>
    route.affectedUnitIds.includes("arena-2-2")
    && !route.affectedUnitIds.includes("arena-2-1"));
  expect(selectedIndex).toBeGreaterThanOrEqual(0);
  for (let index = 0; index < selectedIndex; index += 1) {
    await page.mouse.wheel(0, 100);
  }

  await expect(page.getByTestId("status-strip"))
    .toHaveAttribute("data-route-index", String(selectedIndex));
  await expect(page.getByTestId("battle-canvas"))
    .toHaveAttribute("data-shot-route-affected-unit-ids", /arena-2-2/u);
  await expect(page.getByTestId("battle-canvas"))
    .not.toHaveAttribute("data-shot-route-affected-unit-ids", /arena-2-1/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-magic-archer-route-picker.png`,
  });

  // Clicking the chosen target fires the selected line; the picker no longer
  // carries its own button.
  await clickArenaWorldCell(page, 23, 31);
  await page.waitForFunction(() => {
    const battle = window.__ANGEL2_ARENA__?.getState().battle;
    return battle?.lastSpecialAction?.actionId === "magic-archer-shot"
      && battle.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  const affectedIds = after?.lastSpecialAction?.affectedUnits.map(({ unitId }) => unitId) ?? [];
  expect(affectedIds).toContain("arena-2-0");
  expect(affectedIds).toContain("arena-2-2");
  expect(affectedIds).not.toContain("arena-2-1");
  expect(pageErrors).toEqual([]);
});

test("a single legal magic-arrow line skips the route picker", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magic-archer");
    const shooter = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    const target = arena.interact(23, 30);
    return [shooter, target];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-shoot").click();
  await clickArenaWorldCell(page, 23, 30);
  await expect(page.getByTestId("shot-route-summary")).toHaveCount(0);
  await page.waitForFunction(() => {
    const battle = window.__ANGEL2_ARENA__?.getState().battle;
    return battle?.lastSpecialAction?.actionId === "magic-archer-shot"
      && battle.specialActionPresentation === undefined;
  });
  expect((await arenaBattleState(page))?.lastSpecialAction?.affectedUnits)
    .toEqual([expect.objectContaining({ unitId: "arena-2-0" })]);
});
