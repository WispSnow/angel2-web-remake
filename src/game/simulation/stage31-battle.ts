import {
  activateStage31Content,
  STAGE31_DEFINITION,
  STAGE31_IRON_PLATE_TERRAIN_SLOT,
  STAGE31_OBSTACLE_TERRAIN_SLOT,
  STAGE31_SEMANTIC_ALLIED_UNITS,
  STAGE31_SEMANTIC_ENEMY_UNITS,
  stage31TerrainSlotAt,
} from "../content/stage31";
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
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE31_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE31_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE31_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage31DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE31_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage31Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-sterling-strait-crossing-team",
      label: "妮雅斯德林海峽攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "feiluyin-ambush-force",
      label: "菲伊魯茵伏擊隊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE31_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage31Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage31Content();
    validateDeploymentResult(STAGE31_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE31_UNIT_CONFIG,
      stage: STAGE31_DEFINITION,
      terrainSlotAt: stage31TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE31_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE31_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        "demon-dragon-knight": 14,
        "beast-knight": 16,
        "bone-knight": 17,
        "swift-dragon-knight": 18,
      },
      forces: stage31Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
