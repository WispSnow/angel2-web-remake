import { expect, test, type Page } from "@playwright/test";
import { clickArenaWorldCell } from "./arena-test-support";
import { attackOnlyAdjacentEnemy } from "./command-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface BackgroundDebugState {
  phase: string;
  focusId?: string;
  battlePresentation: string;
  combatPresentation?: { fullScene?: { showScene: boolean; backgroundRecord: number } };
  units: Array<{ id: string; side: number; x: number; y: number; life: number }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2_DEBUG__?.getState() as unknown as BackgroundDebugState,
);

/**
 * Module 29 re-selects the `C.SWF` battlefield for every ordinary attack, so a
 * stage's DS:78DC entry is only the starting point: unless the stage is exempt,
 * 962E replaces it from the logical terrain slot under the defender. Stage 0's
 * indoor slots never reach that chain, which is why the stage-0 acceptance sees
 * one fixed backdrop; this covers the branch that actually swaps it.
 */
test("stage-1 full-screen battles use the defender's terrain backdrop, not the stage record", async ({ page }) => {
  await page.goto(
    "/?debugScenario=stage-01-near-victory&difficulty=0&roster=representative-growth&growth=100",
  );
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect.poll(async () => (await state(page)).phase).toBe("player");

  const prepared = await state(page);
  expect(prepared.battlePresentation).toBe("full");
  // The forced victory setup leaves the player cavalry at (29,26) next to Nami
  // at (30,26); both cells carry raw token 49/50, logical terrain slot 3.
  expect(prepared.units).toContainEqual(expect.objectContaining({ id: "1:0", x: 29, y: 26 }));
  expect(prepared.units).toContainEqual(expect.objectContaining({ id: "2:16", x: 30, y: 26 }));
  expect(prepared.focusId).toBe("1:0");

  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2_DEBUG__?.getState() as unknown as BackgroundDebugState | undefined;
    return current?.combatPresentation?.fullScene?.showScene === true;
  });

  // Stage 1's table record is C/8; slot 3 replaces it with the C/17 woodland.
  expect((await state(page)).combatPresentation?.fullScene?.backgroundRecord).toBe(17);
  const backdrop = page.getByTestId("full-combat-background");
  await expect(backdrop).toHaveAttribute("data-record", "17");
  await expect(backdrop).toHaveAttribute(
    "data-source-url",
    "/assets/original/full-combat/backgrounds/17.png",
  );
  await expect(backdrop).toHaveAttribute("src", /^blob:/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage1-full-combat-terrain-background.png`,
  });
});

interface BackdropCarryState {
  fullCombatBackdropPhases: number[];
  combatPresentation?: { phase: string };
  combatPresentationTrace: Array<{ phase: string; fullScene?: { backdropPhases: number[] } }>;
  lastCombat?: { attackerId: string; defenderId: string; defenderDied: boolean; attackerDied: boolean };
  units: Array<{ id: string; x: number; y: number }>;
}

const arenaBackdropState = (page: Page) => page.evaluate(() =>
  (window.__ANGEL2_ARENA__?.getState() as { battle?: BackdropCarryState }).battle);

/**
 * Module 29 keeps its five backdrop phase words in its code segment and never
 * clears them, so a full-screen battle starts where the previous one stopped
 * (REMAKE-169). Two ordinary attacks in one arena session show the hand-over.
 */
test("REMAKE-169: the next full-screen battle starts from the backdrop phases the last one left", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    const place = (side: 1 | 2, x: number, y: number) => {
      arena.setSide(side);
      arena.setClass("soldier");
      arena.setLevel(1);
      return arena.interact(x, y);
    };
    return [place(1, 20, 30), place(2, 21, 30), place(1, 20, 33), place(2, 21, 33)];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect.poll(async () => (await arenaBackdropState(page))?.fullCombatBackdropPhases)
    .toEqual([0, 0, 0, 0, 0]);

  const fight = async (x: number, y: number) => {
    const attackerId = (await arenaBackdropState(page))?.units
      .find((unit) => unit.x === x && unit.y === y)?.id;
    if (!attackerId) throw new Error(`no arena unit at (${x},${y})`);
    await clickArenaWorldCell(page, x, y);
    await attackOnlyAdjacentEnemy(page);
    await expect.poll(async () => {
      const state = await arenaBackdropState(page);
      return state?.lastCombat?.attackerId === attackerId && state.combatPresentation === undefined;
    }).toBe(true);
    return (await arenaBackdropState(page))!;
  };

  const first = await fight(20, 30);
  expect(first.lastCombat).toMatchObject({ defenderDied: false, attackerDied: false });
  expect(first.combatPresentationTrace[0].fullScene?.backdropPhases).toEqual([0, 0, 0, 0, 0]);
  // A nonfatal exchange ends on its hold, which is where the phases rest.
  const carried = first.combatPresentationTrace.at(-1)?.fullScene?.backdropPhases;
  expect(first.fullCombatBackdropPhases).toEqual(carried);
  expect(carried).not.toEqual([0, 0, 0, 0, 0]);

  const second = await fight(20, 33);
  expect(second.combatPresentationTrace[0]).toMatchObject({ phase: "fullOpen" });
  expect(second.combatPresentationTrace[0].fullScene?.backdropPhases).toEqual(carried);
});
