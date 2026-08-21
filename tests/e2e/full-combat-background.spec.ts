import { expect, test, type Page } from "@playwright/test";
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
