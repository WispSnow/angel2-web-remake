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

// GitHub 的共享 runner 单核性能明显低于开发机（实测同一次规划本机约 1.1 s、CI 约 2.0 s），
// 而 CPU 时间预算是机器相关的次要代理——这个用例真正的算法护栏是下面
// `movementMapBuilds` / `movementMapHits` 两个计数器，它们与机器速度无关。
// 因此在 CI 上放宽倍数，保留「数量级回归」的拦截能力，而不是删掉时间断言。
const BUDGET_SCALE = process.env.CI ? 3 : 1;

// 每次规划的 CPU 预算，两处调用共用，避免与下面的墙钟上限各自漂移。
const PLANNING_BUDGET_MS = 1_500;
const PLANNING_PASSES = 2;

// Vitest 的默认用例超时是 5 s 墙钟，而本用例跑两次规划、在 CI 上允许合计 9 s CPU——
// 两个数字互相矛盾，且墙钟还额外包含本 worker 被调度出去的时间（覆盖率门禁并发 137 个
// 测试文件）。结果是 CPU 断言尚未触发，用例先被判超时：run 34559871825 实测 5,752 ms，
// 而同一提交本机隔离跑只要约 1.7 s。这里按同一组常数推出墙钟上限，让它永远宽于用例
// 自己允许的 CPU 时间；真正的算法护栏仍是下面的 movementMap* 计数器，未放宽。
const TEST_TIMEOUT_MS = PLANNING_PASSES * PLANNING_BUDGET_MS * BUDGET_SCALE + 5_000;

const planWithinBudget = (
  plan: () => unknown,
  budgetMs: number,
): { elapsedMs: number } => {
  // The full coverage gate runs many files concurrently. Wall time there also
  // counts periods when this worker is descheduled by unrelated tests, which
  // made the unchanged 1.5 s planning budget fail while isolated runs stayed
  // near 1.1 s. AI planning is synchronous, so current-thread CPU time measures
  // the work this regression owns without weakening the production budget.
  const startedAt = process.threadCpuUsage();
  plan();
  const elapsed = process.threadCpuUsage(startedAt);
  const elapsedMs = (elapsed.user + elapsed.system) / 1_000;
  expect(elapsedMs).toBeLessThan(budgetMs * BUDGET_SCALE);
  return { elapsedMs };
};

describe("stage 36 shared expert AI performance budget", () => {
  it("plans the first full-force actor without repeating movement propagation per destination", () => {
    const enemyBattle = new Stage36Battle(campaign, fullDeployment);
    let enemySelection: AiActionSelection | undefined;
    planWithinBudget(() => {
      enemySelection = enemyBattle.selectNextEnemyAiAction(enemyBattle.enemyActionOrder());
    }, PLANNING_BUDGET_MS);
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
    }, PLANNING_BUDGET_MS);
    expect(alliedSelection).toMatchObject({ unitId: "1:2", action: { unitId: "1:2" } });
    const alliedDiagnostics = alliedBattle.aiPlanningDiagnostics();
    expect(alliedDiagnostics.movementMapBuilds).toBeLessThanOrEqual(28);
    expect(alliedDiagnostics.movementMapHits).toBeGreaterThan(1_000);
    expect(alliedDiagnostics.actionRangeHits).toBeGreaterThan(alliedDiagnostics.actionRangeBuilds);
  }, TEST_TIMEOUT_MS);
});
