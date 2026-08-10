import {
  activateStage13Content,
  STAGE13_DEFINITION,
  STAGE13_IRON_PLATE_TERRAIN_SLOT,
  STAGE13_OBSTACLE_TERRAIN_SLOT,
  STAGE13_SEMANTIC_ALLIED_UNITS,
  STAGE13_SEMANTIC_ENEMY_UNITS,
  stage13TerrainSlotAt,
} from "../content/stage13";
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

const STAGE13_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE13_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE13_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage13DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE13_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage13Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-strike-team",
      label: "妮雅龍塔突擊隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "marsiel-dragon-tower-guard",
      label: "瑪西爾龍塔守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE13_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:24",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage13Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage13Content();
    validateDeploymentResult(STAGE13_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE13_UNIT_CONFIG,
      stage: STAGE13_DEFINITION,
      terrainSlotAt: stage13TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE13_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE13_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        magician: 6,
        "magic-guide": 10,
        "land-knight": 13,
        archer: 20,
        cavalry: 22,
        "pegasus-warrior": 23,
        monk: 25,
        "divine-sword-warrior": 27,
        "steel-armor-warrior": 29,
      },
      forces: stage13Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
