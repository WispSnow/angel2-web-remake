import {
  activateStage12Content,
  STAGE12_DEFINITION,
  STAGE12_IRON_PLATE_TERRAIN_SLOT,
  STAGE12_OBSTACLE_TERRAIN_SLOT,
  STAGE12_SEMANTIC_ALLIED_UNITS,
  STAGE12_SEMANTIC_ENEMY_UNITS,
  stage12TerrainSlotAt,
} from "../content/stage12";
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

const STAGE12_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE12_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE12_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage12DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE12_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage12Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-swamp-party",
      label: "妮雅沼澤隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "swamp-water-warriors",
      label: "沼澤水戰士",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE12_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:40",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage12Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage12Content();
    validateDeploymentResult(STAGE12_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE12_UNIT_CONFIG,
      stage: STAGE12_DEFINITION,
      terrainSlotAt: stage12TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE12_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE12_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: { "water-warrior": 26 },
      forces: stage12Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
