import {
  activateStage36Content,
  STAGE36_DEFINITION,
  STAGE36_IRON_PLATE_TERRAIN_SLOT,
  STAGE36_OBSTACLE_TERRAIN_SLOT,
  STAGE36_SEMANTIC_ALLIED_UNITS,
  STAGE36_SEMANTIC_ENEMY_UNITS,
  stage36TerrainSlotAt,
} from "../content/stage36";
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

const STAGE36_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE36_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE36_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage36DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE36_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage36Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-otherworld-assault-force",
      label: "妮雅異世界追擊隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "bina-vige-otherworld-force",
      label: "碧娜維姬異世界軍",
      tacticLabel: "守位／追擊混合",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE36_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:1",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage36Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage36Content();
    validateDeploymentResult(STAGE36_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE36_UNIT_CONFIG,
      stage: STAGE36_DEFINITION,
      terrainSlotAt: stage36TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE36_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE36_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "magic-priest": 3,
        "prayer-guide": 4,
        "curse-master": 5,
        magician: 6,
        "great-axe-warrior": 7,
        "magic-armor-warrior": 9,
        "magic-guide": 10,
        "evil-mage": 11,
        "demon-dragon-knight": 14,
        "flying-dragon-knight": 15,
        "bone-knight": 17,
        wizard: 31,
        "magic-master": 32,
        "evil-sword-warrior": 33,
      },
      forces: stage36Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
