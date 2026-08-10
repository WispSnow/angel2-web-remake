import {
  activateStage9Content,
  STAGE9_DEFINITION,
  STAGE9_ESCORT_ROUTE_DEFINITION,
  STAGE9_IRON_PLATE_TERRAIN_SLOT,
  STAGE9_OBSTACLE_TERRAIN_SLOT,
  STAGE9_SEMANTIC_ALLIED_UNITS,
  STAGE9_SEMANTIC_ENEMY_UNITS,
  stage9TerrainSlotAt,
} from "../content/stage9";
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

const STAGE9_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE9_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE9_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage9DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE9_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage9Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-death-valley-escort",
      label: "妮雅死亡之谷護衛隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements
        .filter(({ slot }) => slot !== 9)
        .map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "dori-flightship-guide",
      label: "多莉飛船引路隊",
      tacticLabel: "飛船引路",
      side: 1,
      control: "independent-ai",
      unitIds: ["1:9"],
      commanderId: "1:9",
      doctrine: { strategy: "expert" },
    },
    {
      id: "xielei-death-valley-blockade",
      label: "西艾蕾死亡之谷封鎖隊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE9_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage9Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage9Content();
    validateDeploymentResult(STAGE9_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE9_UNIT_CONFIG,
      stage: STAGE9_DEFINITION,
      terrainSlotAt: stage9TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE9_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE9_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "land-knight": 13,
        cavalry: 22,
        sister: 24,
        monk: 25,
        "steel-armor-warrior": 29,
        soldier: 36,
      },
      forces: stage9Forces(deployment),
      escortRoutes: [STAGE9_ESCORT_ROUTE_DEFINITION],
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }
}
