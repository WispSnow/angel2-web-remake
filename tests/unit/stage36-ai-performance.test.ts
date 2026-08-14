import { describe, expect, it } from "vitest";
import { debugRosterForProfile } from "../../src/game/debug-roster-profiles";
import { STAGE36_DEFINITION } from "../../src/game/content/stage36";
import type { AiActionSelection } from "../../src/game/simulation/battle";
import { Stage36Battle } from "../../src/game/simulation/stage36-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-36",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: debugRosterForProfile("representative-growth", "stage-36"),
  rngState: 0x36_36_36_36,
  rngCalls: 0,
};

const fullDeployment = {
  placements: [
    ...STAGE36_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot,
      position: { ...position },
      fixed: true,
    })),
    ...STAGE36_DEFINITION.deployment.optionalSlots.slice(0, 27).map((slot, index) => ({
      slot,
      position: { ...STAGE36_DEFINITION.deployment.openCells[index] },
      fixed: false,
    })),
  ],
};

const planWithinBudget = (
  plan: () => unknown,
  budgetMs: number,
): { elapsedMs: number } => {
  const startedAt = performance.now();
  plan();
  const elapsedMs = performance.now() - startedAt;
  expect(elapsedMs).toBeLessThan(budgetMs);
  return { elapsedMs };
};

describe("stage 36 shared expert AI performance budget", () => {
  it("plans the first full-force actor without repeating movement propagation per destination", () => {
    const enemyBattle = new Stage36Battle(campaign, fullDeployment);
    let enemySelection: AiActionSelection | undefined;
    planWithinBudget(() => {
      enemySelection = enemyBattle.selectNextEnemyAiAction(enemyBattle.enemyActionOrder());
    }, 1_500);
    expect(enemySelection).toMatchObject({ unitId: "2:31", action: { unitId: "2:31" } });
    if (!enemySelection?.action) throw new Error("enemy selection is missing its planned action");
    const enemyDiagnostics = enemyBattle.aiPlanningDiagnostics();
    expect(enemyDiagnostics.movementMapBuilds).toBeLessThanOrEqual(30);
    expect(enemyDiagnostics.movementMapHits).toBeGreaterThan(1_000);
    expect(enemyDiagnostics.actionRangeHits).toBeGreaterThan(enemyDiagnostics.actionRangeBuilds);
    expect(enemyDiagnostics.utilityHits).toBeGreaterThan(0);

    const diagnosticsBeforeCommit = enemyBattle.aiPlanningDiagnostics();
    expect(enemyBattle.planEnemyAiAction(enemySelection.unitId)).toEqual(enemySelection.action);
    expect(enemyBattle.aiPlanningDiagnostics()).toEqual(diagnosticsBeforeCommit);

    const alliedBattle = new Stage36Battle(campaign, fullDeployment);
    let alliedSelection: AiActionSelection | undefined;
    planWithinBudget(() => {
      alliedSelection = alliedBattle.selectNextAlliedAiAction(
        alliedBattle.alliedActionOrder(true),
      );
    }, 1_500);
    expect(alliedSelection).toMatchObject({ unitId: "1:2", action: { unitId: "1:2" } });
    const alliedDiagnostics = alliedBattle.aiPlanningDiagnostics();
    expect(alliedDiagnostics.movementMapBuilds).toBeLessThanOrEqual(28);
    expect(alliedDiagnostics.movementMapHits).toBeGreaterThan(1_000);
    expect(alliedDiagnostics.actionRangeHits).toBeGreaterThan(alliedDiagnostics.actionRangeBuilds);
  });
});
