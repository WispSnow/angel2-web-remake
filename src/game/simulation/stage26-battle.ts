import {
  activateStage26Content,
  STAGE26_DEFINITION,
  STAGE26_IRON_PLATE_TERRAIN_SLOT,
  STAGE26_OBSTACLE_TERRAIN_SLOT,
  STAGE26_SEMANTIC_ALLIED_UNITS,
  STAGE26_SEMANTIC_ENEMY_UNITS,
  stage26TerrainSlotAt,
} from "../content/stage26";
import { STAGE26_COLUMN_PUSH } from "../content/stage26-runtime.generated";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import type { EnemyAiIntent } from "./ai-contracts";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { prepareColumnPush, type EnemyPhaseTailDefinition } from "./enemy-phase-tail";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE26_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE26_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE26_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const STAGE26_ENEMY_PHASE_TAIL: EnemyPhaseTailDefinition = {
  id: STAGE26_COLUMN_PUSH.definitionId,
  presentationId: STAGE26_COLUMN_PUSH.presentationId,
  executions: STAGE26_COLUMN_PUSH.executions,
  prepare: (units, width, height) => prepareColumnPush(
    STAGE26_COLUMN_PUSH.definitionId,
    STAGE26_COLUMN_PUSH.presentationId,
    {
      originCellUpperBoundExclusive: STAGE26_COLUMN_PUSH.originCellUpperBoundExclusive,
      scannedRows: STAGE26_COLUMN_PUSH.scannedRows,
      destinationRowDeltas: STAGE26_COLUMN_PUSH.destinationRowDeltas,
    },
    units,
    width,
    height,
  ),
};

export function createStage26DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE26_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage26Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-binaweiji-team",
      label: "妮雅討伐隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "binaweiji-guard",
      label: "碧娜維姬守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE26_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:1",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage26Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage26Content();
    validateDeploymentResult(STAGE26_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE26_UNIT_CONFIG,
      stage: STAGE26_DEFINITION,
      terrainSlotAt: stage26TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE26_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE26_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-priest": 3,
        "magic-master": 32,
      },
      forces: stage26Forces(deployment),
      enemyPhaseTail: STAGE26_ENEMY_PHASE_TAIL,
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
