import {
  activateStage7Content,
  STAGE7_DEFINITION,
  STAGE7_IRON_PLATE_TERRAIN_SLOT,
  STAGE7_OBSTACLE_TERRAIN_SLOT,
  STAGE7_SEMANTIC_ALLIED_UNITS,
  STAGE7_SEMANTIC_ENEMY_UNITS,
  stage7TerrainSlotAt,
} from "../content/stage7";
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

const STAGE7_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE7_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE7_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage7DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE7_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage7Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-ranger-camp-defense",
      label: "妮雅營地守備隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "native" },
    },
    {
      id: "death-valley-camp-raiders",
      label: "死亡之谷奇襲隊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE7_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "native" },
    },
  ];
}

export class Stage7Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage7Content();
    validateDeploymentResult(STAGE7_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE7_UNIT_CONFIG,
      stage: STAGE7_DEFINITION,
      terrainSlotAt: stage7TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE7_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE7_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: { "land-knight": 14, priest: 33, magician: 34, soldier: 36 },
      forces: stage7Forces(deployment),
    }, campaign.roster, deployment));
  }
}
