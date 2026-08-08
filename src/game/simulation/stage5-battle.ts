import {
  activateStage5Content,
  STAGE5_DEFINITION,
  STAGE5_IRON_PLATE_TERRAIN_SLOT,
  STAGE5_OBSTACLE_TERRAIN_SLOT,
  STAGE5_SEMANTIC_ALLIED_UNITS,
  STAGE5_SEMANTIC_ENEMY_UNITS,
  stage5TerrainSlotAt,
} from "../content/stage5";
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

const STAGE5_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE5_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE5_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage5DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE5_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage5Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-inner-hall",
      label: "妮雅內殿隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "native" },
    },
    {
      id: "knight-elite",
      label: "騎士團精銳",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE5_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "native" },
    },
  ];
}

export class Stage5Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage5Content();
    validateDeploymentResult(STAGE5_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE5_UNIT_CONFIG,
      stage: STAGE5_DEFINITION,
      terrainSlotAt: stage5TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE5_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE5_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: { warrior: 7, cavalry: 16, archer: 19, soldier: 36 },
      forces: stage5Forces(deployment),
    }, campaign.roster, deployment));
  }
}
