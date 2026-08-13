import {
  activateStage28Content,
  STAGE28_DEFINITION,
  STAGE28_IRON_PLATE_TERRAIN_SLOT,
  STAGE28_OBSTACLE_TERRAIN_SLOT,
  STAGE28_SEMANTIC_ALLIED_UNITS,
  STAGE28_SEMANTIC_ENEMY_UNITS,
  stage28TerrainSlotAt,
} from "../content/stage28";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import type { EnemyAiIntent } from "./ai-contracts";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE28_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE28_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE28_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage28DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE28_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage28Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-valkyrie-defense-team",
      label: "妮雅瓦爾克麗守城隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "valkyrie-siege-force",
      label: "瓦爾克麗攻城軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE28_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage28Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage28Content();
    validateDeploymentResult(STAGE28_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE28_UNIT_CONFIG,
      stage: STAGE28_DEFINITION,
      terrainSlotAt: stage28TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE28_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE28_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "demon-dragon-knight": 14,
        crossbow: 21,
        "pegasus-warrior": 23,
        "magic-master": 32,
        "evil-sword-warrior": 33,
      },
      forces: stage28Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
