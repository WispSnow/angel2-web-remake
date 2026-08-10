import {
  activateStage14Content,
  STAGE14_DEFINITION,
  STAGE14_IRON_PLATE_TERRAIN_SLOT,
  STAGE14_OBSTACLE_TERRAIN_SLOT,
  STAGE14_SEMANTIC_ALLIED_UNITS,
  STAGE14_SEMANTIC_ENEMY_UNITS,
  stage14TerrainSlotAt,
} from "../content/stage14";
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

const STAGE14_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE14_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE14_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage14DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE14_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage14Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-one-team",
      label: "妮雅龍塔第一層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "fang-dragon-tower-floor-one-guard",
      label: "芳龍塔第一層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE14_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:8",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage14Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage14Content();
    validateDeploymentResult(STAGE14_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE14_UNIT_CONFIG,
      stage: STAGE14_DEFINITION,
      terrainSlotAt: stage14TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE14_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE14_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        "magic-guide": 10,
        "land-knight": 13,
        "pegasus-warrior": 23,
        "divine-sword-warrior": 27,
      },
      forces: stage14Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
