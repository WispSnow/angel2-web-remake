import {
  activateStage4Content,
  STAGE4_DEFINITION,
  STAGE4_IRON_PLATE_TERRAIN_SLOT,
  STAGE4_OBSTACLE_TERRAIN_SLOT,
  STAGE4_ROUTE_PULSE_DEFINITION,
  STAGE4_SEMANTIC_ALLIED_UNITS,
  STAGE4_SEMANTIC_ENEMY_UNITS,
  STAGE4_SEMANTIC_REINFORCEMENTS,
  stage4TerrainSlotAt,
} from "../content/stage4";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { BattleUnit, CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import type { EnemyPhaseUpdate } from "./ai-contracts";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { createFixedStageEnemy } from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE4_AI_CLASS_PRIORITY = { soldier: 36 } as const;

const STAGE4_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE4_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE4_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage4DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(
    STAGE4_UNIT_CONFIG,
    campaign.difficulty,
    campaign.roster,
  );
}

function stage4Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  const playerUnitIds = deployment.placements
    .filter(({ slot }) => slot !== 24)
    .map(({ slot }) => `1:${slot}`);
  return [
    {
      id: "nia-escort",
      label: "妮雅護衛隊",
      side: 1,
      control: "player",
      unitIds: playerUnitIds,
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "barrier-guide",
      label: "結界引導",
      tacticLabel: "引導結界",
      side: 1,
      control: "independent-ai",
      unitIds: ["1:24"],
      commanderId: "1:24",
      doctrine: { strategy: "expert" },
    },
    {
      id: "castle-sentries",
      label: "城堡守軍",
      tacticLabel: "阻擊護衛隊",
      side: 2,
      control: "independent-ai",
      unitIds: ["2:40", "2:41"],
      doctrine: { strategy: "expert" },
      targeting: { preferredForceIds: ["nia-escort"], fallback: "all-opponents" },
    },
  ];
}

export class Stage4Battle extends Stage0Battle {
  private lastReinforcementRound = 0;

  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage4Content();
    validateDeploymentResult(STAGE4_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE4_UNIT_CONFIG,
      stage: STAGE4_DEFINITION,
      terrainSlotAt: stage4TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE4_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE4_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: STAGE4_AI_CLASS_PRIORITY,
      forces: stage4Forces(deployment),
      routePulses: [STAGE4_ROUTE_PULSE_DEFINITION],
    }, campaign.roster, deployment));
  }

  private spawnReinforcements(): BattleUnit[] {
    if (!STAGE4_SEMANTIC_REINFORCEMENTS.spawnRounds
      .some((round) => round === this.round)) return [];

    const spawned: BattleUnit[] = [];
    const occupiedCells = new Set(
      this.units.map(({ x, y }) => y * this.stage.width + x),
    );
    for (const spawnCell of STAGE4_SEMANTIC_REINFORCEMENTS.spawnCells) {
      if (occupiedCells.has(spawnCell.cell)) continue;
      const candidate = STAGE4_SEMANTIC_REINFORCEMENTS.candidates.find(({ slot }) =>
        !this.units.some((unit) => unit.side === 2 && unit.slot === slot));
      if (!candidate) break;

      const unit = createFixedStageEnemy({
        slot: candidate.slot,
        position: { x: spawnCell.x, y: spawnCell.y },
        classId: candidate.classId,
        name: candidate.name,
        aiBehavior: candidate.aiBehavior,
      }, this.difficulty);
      this.forces.inheritUnit("2:40", unit.id);
      this.units.push(unit);
      spawned.push(unit);
      occupiedCells.add(spawnCell.cell);
    }
    return spawned;
  }

  override beginEnemyPhase(): EnemyPhaseUpdate {
    if (this.lastReinforcementRound !== this.round) {
      this.lastReinforcementRound = this.round;
      this.spawnReinforcements();
    }
    return super.beginEnemyPhase();
  }

  override enemyBehaviorFor(id: string): number {
    const unit = this.unit(id);
    if (unit?.side === 2) {
      const candidate = STAGE4_SEMANTIC_REINFORCEMENTS.candidates
        .find(({ slot }) => slot === unit.slot);
      if (candidate) return candidate.aiBehavior;
    }
    return super.enemyBehaviorFor(id);
  }

  protected override restoreDerivedForceMemberships(): void {
    this.lastReinforcementRound = 0;
    for (const unit of this.units) {
      if (unit.side === 2 && STAGE4_SEMANTIC_REINFORCEMENTS.candidates
        .some(({ slot }) => slot === unit.slot)) {
        this.forces.inheritUnit("2:40", unit.id);
      }
    }
  }
}
