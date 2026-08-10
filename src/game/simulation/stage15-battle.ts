import {
  activateStage15Content,
  STAGE15_DEFINITION,
  STAGE15_IRON_PLATE_TERRAIN_SLOT,
  STAGE15_OBSTACLE_TERRAIN_SLOT,
  STAGE15_SEMANTIC_ALLIED_UNITS,
  STAGE15_SEMANTIC_ENEMY_UNITS,
  stage15TerrainSlotAt,
} from "../content/stage15";
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

const STAGE15_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE15_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE15_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage15DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE15_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage15Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-two-team",
      label: "妮雅龍塔第二層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "lan-dragon-tower-floor-two-guard",
      label: "蘭龍塔第二層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE15_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:9",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage15Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage15Content();
    validateDeploymentResult(STAGE15_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE15_UNIT_CONFIG,
      stage: STAGE15_DEFINITION,
      terrainSlotAt: stage15TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE15_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE15_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        magician: 6,
        "great-axe-warrior": 7,
        "half-dragon-warrior": 8,
        archer: 20,
        "pegasus-warrior": 23,
        "steel-armor-warrior": 29,
      },
      forces: stage15Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
