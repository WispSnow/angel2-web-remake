import {
  activateStage38Content,
  STAGE38_DEFINITION,
  STAGE38_IRON_PLATE_TERRAIN_SLOT,
  STAGE38_OBSTACLE_TERRAIN_SLOT,
  STAGE38_SEMANTIC_ALLIED_UNITS,
  STAGE38_SEMANTIC_ENEMY_UNITS,
  stage38TerrainSlotAt,
} from "../content/stage38";
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

const STAGE38_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE38_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE38_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage38DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE38_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage38Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-otherworld-rematch-force",
      label: "妮雅異世界決戰隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "otherworld-rematch-enemy-force",
      label: "異世界殘軍",
      tacticLabel: "全員追擊",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE38_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:30",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage38Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage38Content();
    validateDeploymentResult(STAGE38_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE38_UNIT_CONFIG,
      stage: STAGE38_DEFINITION,
      terrainSlotAt: stage38TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE38_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE38_OBSTACLE_TERRAIN_SLOT,
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
        "beast-knight": 16,
        "bone-knight": 17,
        "swift-dragon-knight": 18,
        "great-dragon-knight": 19,
        "crossbow": 21,
        "divine-sword-warrior": 27,
        warrior: 28,
        "steel-armor-warrior": 29,
        wizard: 31,
        "magic-master": 32,
        "evil-sword-warrior": 33,
        cavalry: 13,
        "pegasus-warrior": 23,
        engineer: 5,
      },
      forces: stage38Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
