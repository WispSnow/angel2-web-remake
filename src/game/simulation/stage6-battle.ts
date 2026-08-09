import {
  activateStage6Content,
  STAGE6_DEFINITION,
  STAGE6_IRON_PLATE_TERRAIN_SLOT,
  STAGE6_OBSTACLE_TERRAIN_SLOT,
  STAGE6_SEMANTIC_ALLIED_UNITS,
  STAGE6_SEMANTIC_ENEMY_UNITS,
  stage6TerrainSlotAt,
} from "../content/stage6";
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

const STAGE6_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE6_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE6_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage6DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE6_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage6Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-otherworld-vanguard",
      label: "妮雅異世界先鋒",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "xielei-pursuit-force",
      label: "西艾蕾追擊隊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE6_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage6Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage6Content();
    validateDeploymentResult(STAGE6_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE6_UNIT_CONFIG,
      stage: STAGE6_DEFINITION,
      terrainSlotAt: stage6TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE6_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE6_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: { "land-knight": 5, archer: 19, cavalry: 22, soldier: 36 },
      forces: stage6Forces(deployment),
    }, campaign.roster, deployment));
  }
}
