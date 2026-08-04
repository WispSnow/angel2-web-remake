import {
  activateStage1Content,
  STAGE1_DEFINITION,
  STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
  STAGE1_SEMANTIC_CLASS_OVERRIDES,
  STAGE1_SEMANTIC_ENEMY_UNITS,
  STAGE1_STABLE_AI,
  stage1TerrainSlotAt,
} from "../content/stage1";
import { completeCampaignRoster } from "../content/stage0";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  Position,
  SaveRosterEntry,
  SavedBattleState,
  SavedEnemyAiState,
} from "../types";
import type { DeploymentRosterUnit } from "../deployment-session";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { DeterministicRng } from "./rng";
import {
  createDeployedStageRoster,
  createDeployedStageUnits,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import {
  Stage0Battle,
  type BattleScenario,
} from "./battle";
import type {
  AlliedAiAction,
  EnemyAiIntent,
  EnemyPhaseUpdate,
} from "./ai-contracts";

export const STAGE1_CASTLE_GUARD_GROUP_ID = STAGE1_STABLE_AI.alertGroup.id;
const enemyId = (slot: number): string => `2:${slot}`;
const STAGE1_CASTLE_GUARD_IDS = new Set(STAGE1_STABLE_AI.alertGroup.slots.map(enemyId));
const STAGE1_OPENING_PURSUIT_IDS = new Set(STAGE1_STABLE_AI.pursuitGroup.slots.map(enemyId));
const STAGE1_FANG_ID = enemyId(STAGE1_STABLE_AI.commander.slot);

const STAGE1_AI_CLASS_PRIORITY = {
  cavalry: 16,
  sister: 35,
  soldier: 36,
} as const;

const STAGE1_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE1_DEPLOYMENT_PREVIEW_ROSTER.map((preview) => ({
    slot: preview.slot,
    classOverride: STAGE1_SEMANTIC_CLASS_OVERRIDES
      .find(({ slot }) => slot === preview.slot)?.classId,
    name: preview.name,
    portrait: preview.portrait,
    aiBehavior: 0,
    baselineExperience: preview.experience,
  })),
  enemyUnits: STAGE1_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage1DeploymentRoster(
  campaignRoster: readonly SaveRosterEntry[],
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE1_UNIT_CONFIG, 0, campaignRoster);
}

export function createStage1Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
  deployment: DeploymentResult,
): BattleUnit[] {
  return createDeployedStageUnits(
    STAGE1_UNIT_CONFIG,
    difficulty,
    campaignRoster,
    deployment,
  );
}

export class Stage1Battle extends Stage0Battle {
  private readonly activeGroupIds = new Set<string>();
  private readonly pendingNoticeGroupIds = new Set<string>();
  private fangPursuitRound: number | null = null;

  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage1Content();
    validateDeploymentResult(STAGE1_DEFINITION.deployment, deployment);
    const scenario: BattleScenario = {
      stage: STAGE1_DEFINITION,
      width: STAGE1_DEFINITION.width,
      height: STAGE1_DEFINITION.height,
      terrainSlotAt: stage1TerrainSlotAt,
      createUnits: (difficulty) => createStage1Units(difficulty, campaign.roster, deployment),
      createCampaignRoster: () => completeCampaignRoster(campaign.roster),
      enemyClassPriority: STAGE1_AI_CLASS_PRIORITY,
      enemyBehaviorById: new Map(
        STAGE1_SEMANTIC_ENEMY_UNITS.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
      ),
    };
    super(campaign.difficulty, rng, scenario);
  }

  override restore(
    snapshot: Pick<SavedBattleState, "round" | "focusId" | "units" | "enemyAi">,
    campaignRoster?: readonly SaveRosterEntry[],
  ): void {
    super.restore(snapshot, campaignRoster);
    this.activeGroupIds.clear();
    this.pendingNoticeGroupIds.clear();
    this.fangPursuitRound = null;
    const state = snapshot.enemyAi;
    if (!state) return;
    for (const groupId of state.activeGroupIds) this.activeGroupIds.add(groupId);
    for (const groupId of state.pendingNoticeGroupIds) this.pendingNoticeGroupIds.add(groupId);
    this.fangPursuitRound = state.fangPursuitRound;
  }

  override beginEnemyPhase(): EnemyPhaseUpdate {
    if (!this.activeGroupIds.has(STAGE1_CASTLE_GUARD_GROUP_ID)) {
      const threatened = [...STAGE1_CASTLE_GUARD_IDS]
        .some((id) => this.hasDamageActionThisTurn(id));
      if (threatened) this.activateCastleGuard();
    }
    const activatedGroupIds = [...this.pendingNoticeGroupIds];
    this.pendingNoticeGroupIds.clear();
    return { activatedGroupIds };
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    if (STAGE1_OPENING_PURSUIT_IDS.has(id)) return "pursuit";
    if (STAGE1_CASTLE_GUARD_IDS.has(id)) {
      return this.activeGroupIds.has(STAGE1_CASTLE_GUARD_GROUP_ID) ? "pursuit" : "alert";
    }
    if (id === STAGE1_FANG_ID) {
      return this.fangPursuitRound !== null && this.round >= this.fangPursuitRound
        ? "pursuit"
        : "sentry";
    }
    return "pursuit";
  }

  override enemyMovementRange(id: string): Position[] {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.actionDisabled) return [];
    if (this.enemyAiIntentFor(id) === "sentry") return [{ x: unit.x, y: unit.y }];
    return this.reachableCells(id);
  }

  override planEnemyAiAction(id: string, _behavior?: number): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    const intent = this.enemyAiIntentFor(id);
    if (intent === "alert") {
      if (unit.life * 100 < this.statsFor(unit).maxLife * 40) {
        return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
      }
      return { unitId: id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }
    return this.planModernEnemyAiAction(id, intent === "sentry" ? "sentry" : "pursuit");
  }

  override serializableSnapshot(): Pick<
    SavedBattleState,
    "round" | "focusId" | "units" | "enemyAi"
  > {
    return {
      ...super.serializableSnapshot(),
      enemyAi: this.enemyAiSnapshot(),
    };
  }

  override snapshot(): object {
    return {
      ...super.snapshot(),
      enemyAi: this.enemyAiSnapshot(),
      enemyIntents: Object.fromEntries(
        this.units
          .filter(({ side }) => side === 2)
          .map(({ id }) => [id, this.enemyAiIntentFor(id)]),
      ),
    };
  }

  protected override onHostileTargeted(actor: BattleUnit, target: BattleUnit): void {
    if (actor.side === 1 && STAGE1_CASTLE_GUARD_IDS.has(target.id)) {
      this.activateCastleGuard();
    }
  }

  private activateCastleGuard(): void {
    if (this.activeGroupIds.has(STAGE1_CASTLE_GUARD_GROUP_ID)) return;
    this.activeGroupIds.add(STAGE1_CASTLE_GUARD_GROUP_ID);
    this.pendingNoticeGroupIds.add(STAGE1_CASTLE_GUARD_GROUP_ID);
    this.fangPursuitRound = this.round + STAGE1_STABLE_AI.commander.pursuitDelayRounds;
  }

  private enemyAiSnapshot(): SavedEnemyAiState {
    return {
      activeGroupIds: [...this.activeGroupIds].sort(),
      pendingNoticeGroupIds: [...this.pendingNoticeGroupIds].sort(),
      fangPursuitRound: this.fangPursuitRound,
    };
  }
}
