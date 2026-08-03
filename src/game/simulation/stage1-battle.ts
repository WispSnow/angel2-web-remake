import {
  activateStage1Content,
  STAGE1_DEFINITION,
  STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
  STAGE1_SEMANTIC_CLASS_OVERRIDES,
  STAGE1_SEMANTIC_ENEMY_UNITS,
  STAGE1_STABLE_AI,
  stage1TerrainSlotAt,
} from "../content/stage1";
import { className } from "../content/classes";
import { completeCampaignRoster, initialEnemyExperience, statsFor } from "../content/stage0";
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
import { emptyUnitStatuses } from "./status";
import {
  Stage0Battle,
  type AlliedAiAction,
  type BattleScenario,
  type EnemyAiIntent,
  type EnemyPhaseUpdate,
} from "./battle";

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

function preparedRosterEntry(
  slot: number,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit | undefined {
  const preview = STAGE1_DEPLOYMENT_PREVIEW_ROSTER.find((unit) => unit.slot === slot);
  if (!preview) return undefined;
  const inherited = campaignRoster.find((unit) => unit.slot === slot);
  const override = STAGE1_SEMANTIC_CLASS_OVERRIDES.find((unit) => unit.slot === slot);
  const classId = override?.classId ?? inherited?.classId ?? preview.classId;
  const untouchedNamedBaseline = inherited?.classId === "soldier"
    && inherited.experience === 0
    && preview.experience > 0;
  const experience = untouchedNamedBaseline
    ? preview.experience
    : inherited?.experience ?? preview.experience;
  return {
    id: `1:${slot}`,
    side: 1,
    slot,
    classId,
    className: className(classId),
    name: preview.name,
    portrait: preview.portrait,
    x: 0,
    y: 0,
    life: untouchedNamedBaseline ? preview.life : inherited?.life ?? preview.life,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
}

export function createStage1DeploymentRoster(
  campaignRoster: readonly SaveRosterEntry[],
): DeploymentRosterUnit[] {
  return STAGE1_DEFINITION.deployment.eligibleSlots.map((slot) => {
    const unit = preparedRosterEntry(slot, campaignRoster);
    if (!unit) throw new Error(`stage 1 roster is missing eligible slot ${slot}`);
    return {
      slot: unit.slot,
      name: unit.name,
      portrait: unit.portrait,
      classId: unit.classId,
      className: unit.className,
      experience: unit.experience,
      life: unit.life,
    };
  });
}

export function createStage1Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
  deployment: DeploymentResult,
): BattleUnit[] {
  const allies = deployment.placements.map(({ slot, position }) => {
    const unit = preparedRosterEntry(slot, campaignRoster);
    if (!unit) throw new Error(`stage 1 deployment references missing roster slot ${slot}`);
    return { ...unit, x: position.x, y: position.y };
  });
  const enemies = STAGE1_SEMANTIC_ENEMY_UNITS.map((definition): BattleUnit => {
    const experience = initialEnemyExperience(definition.classId, difficulty);
    const unit: BattleUnit = {
      id: `2:${definition.slot}`,
      side: 2,
      slot: definition.slot,
      classId: definition.classId,
      className: className(definition.classId),
      name: definition.name,
      portrait: definition.portrait,
      x: definition.position.x,
      y: definition.position.y,
      life: 0,
      experience,
      acted: false,
      actionDisabled: false,
      statuses: emptyUnitStatuses(),
    };
    unit.life = statsFor(unit, difficulty).maxLife;
    return unit;
  });
  return [...allies, ...enemies];
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
