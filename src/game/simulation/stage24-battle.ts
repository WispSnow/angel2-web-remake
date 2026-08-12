import {
  activateStage24Content,
  STAGE24_DEFINITION,
  STAGE24_IRON_PLATE_TERRAIN_SLOT,
  STAGE24_OBSTACLE_TERRAIN_SLOT,
  STAGE24_SEMANTIC_ALLIED_UNITS,
  STAGE24_SEMANTIC_ENEMY_UNITS,
  stage24TerrainSlotAt,
} from "../content/stage24";
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

const STAGE24_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE24_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE24_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage24DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE24_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage24Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-death-valley-castle-team",
      label: "妮雅死亡之谷攻城隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "death-valley-castle-guard",
      label: "死亡之谷城堡守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE24_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage24Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage24Content();
    validateDeploymentResult(STAGE24_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE24_UNIT_CONFIG,
      stage: STAGE24_DEFINITION,
      terrainSlotAt: stage24TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE24_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE24_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "jungle-warrior": 2,
        "half-dragon-warrior": 8,
        "demon-dragon-knight": 14,
        "bone-knight": 17,
        crossbow: 21,
        "steel-armor-warrior": 29,
      },
      forces: stage24Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
