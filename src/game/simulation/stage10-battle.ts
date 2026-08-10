import {
  activateStage10Content,
  STAGE10_DEFINITION,
  STAGE10_IRON_PLATE_TERRAIN_SLOT,
  STAGE10_OBSTACLE_TERRAIN_SLOT,
  STAGE10_SEMANTIC_ALLIED_UNITS,
  STAGE10_SEMANTIC_ENEMY_UNITS,
  stage10TerrainSlotAt,
} from "../content/stage10";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE10_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE10_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE10_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage10DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE10_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage10Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-airship-defense",
      label: "妮雅飛船防衛隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "kenosi-airship-pursuers",
      label: "克諾絲飛船追擊隊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE10_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:20",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage10Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage10Content();
    validateDeploymentResult(STAGE10_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE10_UNIT_CONFIG,
      stage: STAGE10_DEFINITION,
      terrainSlotAt: stage10TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE10_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE10_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        "pegasus-warrior": 23,
      },
      forces: stage10Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
