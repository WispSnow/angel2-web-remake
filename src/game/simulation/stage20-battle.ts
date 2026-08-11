import {
  activateStage20Content,
  STAGE20_DEFINITION,
  STAGE20_IRON_PLATE_TERRAIN_SLOT,
  STAGE20_OBSTACLE_TERRAIN_SLOT,
  STAGE20_SEMANTIC_ALLIED_UNITS,
  STAGE20_SEMANTIC_ENEMY_UNITS,
  stage20TerrainSlotAt,
} from "../content/stage20";
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

const STAGE20_CAMPAIGN_SLOTS = [
  0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24,
] as const;

const STAGE20_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE20_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE20_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage20DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE20_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage20Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-rooftop-team",
      label: "妮雅龍塔頂部攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "dragon-tower-rooftop-tableau",
      label: "龍塔頂部守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE20_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:55",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage20Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage20Content();
    validateDeploymentResult(STAGE20_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE20_UNIT_CONFIG,
      stage: STAGE20_DEFINITION,
      terrainSlotAt: stage20TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE20_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE20_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        dragon: 36,
      },
      forces: stage20Forces(deployment),
      campaignUnitSlots: STAGE20_CAMPAIGN_SLOTS,
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  protected override restoreDerivedForceMemberships(): void {
    if (this.unit("2:28")) this.forces.inheritUnit("2:55", "2:28");
    if (this.unit("1:7")) this.forces.inheritUnit("1:0", "1:7");
  }
}
