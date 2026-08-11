import { test } from "@playwright/test";
import { arenaBattleState, clickArenaWorldCell } from "./arena-test-support";

test("diagnose magician ice", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return;
    arena.setSide(1);
    arena.setClass("magician");
    arena.setLevel(1);
    arena.interact(20, 30);
    arena.setClass("great-axe-warrior");
    arena.interact(24, 31);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    arena.interact(23, 30);
    arena.setClass("prayer-guide");
    arena.setLevel(3);
    arena.interact(25, 29);
    arena.setClass("soldier");
    arena.setLevel(1);
    arena.interact(25, 31);
  });
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 24, 31);
  await page.getByTestId("unit-command-attack").click();
  await clickArenaWorldCell(page, 25, 31);
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: { lastCombat?: { attackerId: string }; combatPresentation?: unknown };
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-1"
      && current.combatPresentation === undefined;
  });

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  const ids = await page.locator("[data-testid^='technique-']").evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-testid")}=${node.textContent?.trim()}`));
  console.log("TECHNIQUES:", JSON.stringify(ids));
  await page.getByTestId("technique-ice-1").click();
  await page.waitForTimeout(1500);
  const state = await arenaBattleState(page);
  console.log("mode:", state?.actionMode);
  console.log("lastSpecial:", JSON.stringify(state?.lastSpecialAction));
  for (const unit of state?.units ?? []) {
    console.log(`  ${unit.id} ${unit.classId} @${unit.x},${unit.y} life=${unit.life} disabled=${unit.actionDisabled}`);
  }
  const canvas = await page.getByTestId("battle-canvas").evaluate((element) =>
    (element as HTMLCanvasElement).dataset.rangeMode);
  console.log("rangeMode:", canvas);
});
