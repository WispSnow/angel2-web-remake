import type { BattleActionId } from "../content/actions";
import {
  activateStage37Content,
  STAGE37_DEFINITION,
  STAGE37_IRON_PLATE_TERRAIN_SLOT,
  STAGE37_OBSTACLE_TERRAIN_SLOT,
  STAGE37_SEMANTIC_ALLIED_UNITS,
  STAGE37_SEMANTIC_ENEMY_UNITS,
  stage37TerrainSlotAt,
} from "../content/stage37";
import type { DeploymentRosterUnit } from "../deployment-session";
import type {
  BattleUnit,
  CampaignState,
  SaveRosterEntry,
  SavedBattleState,
  UnitStats,
} from "../types";
import type { AiActionSelection, AlliedAiAction } from "./ai-contracts";
import type { BattleActionIntent, PreparedBattleAction, SpecialActionResult } from "./actions/types";
import { Stage0Battle, type RestorableBattleSnapshot } from "./battle";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE37_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE37_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE37_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const isBossPart = (unit: Pick<BattleUnit, "side" | "classId">): boolean =>
  unit.side === 2 && (unit.classId === "head" || unit.classId === "hand");

export function createStage37DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE37_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage37Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-ultimate-goddess-force",
      label: "妮雅決戰隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "ultimate-goddess-parts",
      label: "究極女神",
      tacticLabel: "多部位交替術法",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE37_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:56",
      doctrine: { strategy: "expert" },
    },
  ];
}

type Stage37Snapshot = RestorableBattleSnapshot & Partial<Pick<SavedBattleState, "stage37Boss">>;

export class Stage37Battle extends Stage0Battle {
  private headActionToggle: 0 | 1 = 0;
  private handActionToggle: 0 | 1 = 0;

  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage37Content();
    validateDeploymentResult(STAGE37_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE37_UNIT_CONFIG,
      stage: STAGE37_DEFINITION,
      terrainSlotAt: stage37TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE37_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE37_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: { head: 37, hand: 38 },
      forces: stage37Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
    for (const unit of this.units) {
      if (isBossPart(unit)) unit.life = this.statsFor(unit).maxLife;
    }
  }

  override statsFor(unit: Pick<BattleUnit, "classId" | "experience" | "side">): UnitStats {
    const base = super.statsFor(unit);
    if (!isBossPart(unit)) return base;
    const highestDifficulty = this.difficulty === 3;
    return {
      ...base,
      attack: highestDifficulty ? 150 : 100,
      defense: highestDifficulty ? 15 : 10,
      maxLife: highestDifficulty ? 15_000 : 10_000,
      movement: 1,
    };
  }

  override movementPath(id: string, destination: { x: number; y: number }): { x: number; y: number }[] {
    const unit = this.unit(id);
    if (unit && isBossPart(unit)) {
      return destination.x === unit.x && destination.y === unit.y && !unit.acted && !unit.actionDisabled
        ? [{ x: unit.x, y: unit.y }]
        : [];
    }
    return super.movementPath(id, destination);
  }

  protected override canUseSpecialAction(actor: BattleUnit, actionId: BattleActionId): boolean {
    if (!isBossPart(actor)) return super.canUseSpecialAction(actor, actionId);
    const classAction = actor.classId === "head"
      ? actionId === "recovery-3" || actionId === "ice-3"
      : actionId === "lightning-4" || actionId === "fire-4";
    return classAction
      && !actor.acted
      && !actor.actionDisabled;
  }

  protected override allowsUnboundedSpecialTarget(
    actor: BattleUnit,
    target: BattleUnit | undefined,
    actionId: BattleActionId,
  ): boolean {
    if (actor.classId === "head" && actor.side === 2 && actionId === "recovery-3") {
      return target?.id === actor.id;
    }
    return actor.classId === "hand"
      && actor.side === 2
      && (actionId === "lightning-4" || actionId === "fire-4")
      && target?.side === 1
      && !target.actionDisabled;
  }

  private handTarget(trial: DeterministicRng): BattleUnit | undefined {
    const candidates = this.units
      .filter((unit) => unit.side === 1 && !unit.actionDisabled)
      .sort((left, right) => left.y * this.stage.width + left.x
        - (right.y * this.stage.width + right.x));
    if (candidates.length === 0) return undefined;
    for (;;) {
      for (const candidate of candidates) {
        if (trial.between(0, 4) === 0) return candidate;
      }
    }
  }

  protected override specialActionResolutionRng(
    actor: BattleUnit,
    target: BattleUnit | undefined,
    intent: BattleActionIntent,
  ): DeterministicRng {
    if (actor.classId !== "hand"
      || (intent.actionId !== "lightning-4" && intent.actionId !== "fire-4")) {
      return super.specialActionResolutionRng(actor, target, intent);
    }
    const trial = this.rng.clone();
    if (this.handTarget(trial)?.id !== target?.id) throw new Error("stale stage 37 hand target");
    return trial;
  }

  override planEnemyAiAction(id: string): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    if (unit.classId === "head") {
      const actionId = this.headActionToggle === 0 ? "recovery-3" : "ice-3";
      return {
        unitId: unit.id,
        kind: "special",
        path: [{ x: unit.x, y: unit.y }],
        actionId,
        targetId: unit.id,
      };
    }
    if (unit.classId === "hand") {
      const target = this.handTarget(this.rng.clone());
      if (!target) return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      return {
        unitId: unit.id,
        kind: "special",
        path: [{ x: unit.x, y: unit.y }],
        targetId: target.id,
        actionId: this.handActionToggle === 0 ? "lightning-4" : "fire-4",
      };
    }
    return super.planEnemyAiAction(id);
  }

  override enemyActionOrder(): string[] {
    const nativeOrder = super.enemyActionOrder();
    if (this.headActionToggle === 0) return nativeOrder;
    // REMAKE-085: frozen units cannot be damaged in stableRemake, so the
    // head's ice turn resolves after both hands have spent their actions.
    return [
      ...nativeOrder.filter((id) => this.unit(id)?.classId !== "head"),
      ...nativeOrder.filter((id) => this.unit(id)?.classId === "head"),
    ];
  }

  override selectNextEnemyAiAction(candidateIds: readonly string[]): AiActionSelection | undefined {
    const candidates = new Set(candidateIds);
    const unitId = this.enemyActionOrder().find((id) => candidates.has(id));
    if (!unitId) return undefined;
    const action = this.planEnemyAiAction(unitId);
    return { unitId, ...(action ? { action } : {}) };
  }

  override commitPreparedAction(prepared: PreparedBattleAction): SpecialActionResult {
    const actor = this.unit(prepared.intent.actorId);
    const experienceBefore = actor?.experience;
    const result = super.commitPreparedAction(prepared);
    if (actor && experienceBefore !== undefined && isBossPart(actor)) actor.experience = experienceBefore;
    if (actor?.classId === "head") this.headActionToggle = this.headActionToggle === 0 ? 1 : 0;
    if (actor?.classId === "hand") this.handActionToggle = this.handActionToggle === 0 ? 1 : 0;
    return result;
  }

  override serializableSnapshot(): ReturnType<Stage0Battle["serializableSnapshot"]> & {
    stage37Boss: NonNullable<SavedBattleState["stage37Boss"]>;
  } {
    return {
      ...super.serializableSnapshot(),
      stage37Boss: {
        headActionToggle: this.headActionToggle,
        handActionToggle: this.handActionToggle,
      },
    };
  }

  override restore(snapshot: Stage37Snapshot, campaignRoster?: readonly SaveRosterEntry[]): void {
    super.restore(snapshot, campaignRoster);
    if (!snapshot.stage37Boss) throw new Error("stage 37 save is missing boss action state");
    this.headActionToggle = snapshot.stage37Boss.headActionToggle;
    this.handActionToggle = snapshot.stage37Boss.handActionToggle;
  }
}
