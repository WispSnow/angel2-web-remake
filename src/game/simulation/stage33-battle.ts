import {
  activateStage33Content,
  STAGE33_DEFINITION,
  STAGE33_IRON_PLATE_TERRAIN_SLOT,
  STAGE33_OBSTACLE_TERRAIN_SLOT,
  STAGE33_SEMANTIC_ALLIED_UNITS,
  STAGE33_SEMANTIC_ENEMY_UNITS,
  stage33TerrainSlotAt,
} from "../content/stage33";
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

const STAGE33_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE33_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE33_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage33DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE33_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage33Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-lannal-outskirts-assault-force",
      label: "妮雅拉那洛城外攻城隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "lannal-outskirts-garrison",
      label: "拉那洛城外守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE33_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage33Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage33Content();
    validateDeploymentResult(STAGE33_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE33_UNIT_CONFIG,
      stage: STAGE33_DEFINITION,
      terrainSlotAt: stage33TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE33_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE33_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "prayer-guide": 4,
        "great-axe-warrior": 7,
        "magic-armor-warrior": 9,
        "evil-mage": 11,
        "demon-dragon-knight": 14,
        "beast-knight": 16,
        "swift-dragon-knight": 18,
        wizard: 31,
        "magic-master": 32,
      },
      forces: stage33Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
