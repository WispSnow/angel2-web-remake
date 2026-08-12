import {
  activateStage22Content,
  STAGE22_DEFINITION,
  STAGE22_IRON_PLATE_TERRAIN_SLOT,
  STAGE22_OBSTACLE_TERRAIN_SLOT,
  STAGE22_SEMANTIC_ALLIED_UNITS,
  stage22TerrainSlotAt,
} from "../content/stage22";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { DeterministicRng } from "./rng";

const STAGE22_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE22_SEMANTIC_ALLIED_UNITS,
  // The native B/0045 template has no side-2 board cells. All six enemies are
  // inserted by the round-one event, after the player's deployment is fixed.
  enemyUnits: [],
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage22DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE22_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

export class Stage22Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage22Content();
    validateDeploymentResult(STAGE22_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE22_UNIT_CONFIG,
      stage: STAGE22_DEFINITION,
      terrainSlotAt: stage22TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE22_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE22_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-priest": 3,
        dragon: 36,
      },
      // No side-2 unit exists when the registry is created. Legacy side-based
      // control correctly makes deployed side 1 player-controlled and all
      // event-inserted side 2 units independent AI.
      forces: [],
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
