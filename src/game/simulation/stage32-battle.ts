import {
  activateStage32Content,
  STAGE32_DEFINITION,
  STAGE32_IRON_PLATE_TERRAIN_SLOT,
  STAGE32_OBSTACLE_TERRAIN_SLOT,
  STAGE32_SEMANTIC_ALLIED_UNITS,
  STAGE32_SEMANTIC_ENEMY_UNITS,
  stage32TerrainSlotAt,
} from "../content/stage32";
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

const STAGE32_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE32_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE32_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage32DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE32_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage32Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-sterling-strait-main-force",
      label: "妮雅斯德林海峽主隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "feiluyin-fumaroni-alliance",
      label: "菲伊魯茵與芙瑪羅妮聯軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE32_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage32Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage32Content();
    validateDeploymentResult(STAGE32_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE32_UNIT_CONFIG,
      stage: STAGE32_DEFINITION,
      terrainSlotAt: stage32TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE32_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE32_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "magic-priest": 3,
        "prayer-guide": 4,
        "curse-master": 5,
        "great-axe-warrior": 7,
        "magic-armor-warrior": 9,
        "magic-guide": 10,
        "evil-mage": 11,
        "demon-dragon-knight": 14,
        "flying-dragon-knight": 15,
        "beast-knight": 16,
        "bone-knight": 17,
        "swift-dragon-knight": 18,
        wizard: 31,
        "magic-master": 32,
        "evil-sword-warrior": 33,
      },
      forces: stage32Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
