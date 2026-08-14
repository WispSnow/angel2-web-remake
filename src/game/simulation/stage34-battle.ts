import {
  activateStage34Content,
  STAGE34_DEFINITION,
  STAGE34_IRON_PLATE_TERRAIN_SLOT,
  STAGE34_OBSTACLE_TERRAIN_SLOT,
  STAGE34_SEMANTIC_ALLIED_UNITS,
  STAGE34_SEMANTIC_ENEMY_UNITS,
  stage34TerrainSlotAt,
} from "../content/stage34";
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

const STAGE34_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE34_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE34_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage34DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE34_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage34Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-lannal-interior-assault-force",
      label: "妮雅拉那洛城內攻堅隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "renagiv-lannal-interior-force",
      label: "蕾娜吉芙拉那洛城內守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE34_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage34Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage34Content();
    validateDeploymentResult(STAGE34_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE34_UNIT_CONFIG,
      stage: STAGE34_DEFINITION,
      terrainSlotAt: stage34TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE34_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE34_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "prayer-guide": 4,
        "magic-armor-warrior": 9,
        "evil-mage": 11,
        "great-dragon-knight": 19,
        "divine-sword-warrior": 27,
        "magic-master": 32,
        "evil-sword-warrior": 33,
      },
      forces: stage34Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
