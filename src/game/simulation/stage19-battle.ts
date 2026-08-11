import {
  activateStage19Content,
  STAGE19_DEFINITION,
  STAGE19_EVENT_PROGRAM,
  STAGE19_IRON_PLATE_TERRAIN_SLOT,
  STAGE19_OBSTACLE_TERRAIN_SLOT,
  STAGE19_SEMANTIC_ALLIED_UNITS,
  STAGE19_SEMANTIC_ENEMY_UNITS,
  stage19TerrainSlotAt,
} from "../content/stage19";
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

const STAGE19_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE19_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE19_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage19DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE19_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage19Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-six-team",
      label: "妮雅龍塔第六層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "ai-dragon-tower-floor-six-guard",
      label: "愛龍塔第六層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE19_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:13",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage19Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage19Content();
    validateDeploymentResult(STAGE19_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE19_UNIT_CONFIG,
      stage: STAGE19_DEFINITION,
      terrainSlotAt: stage19TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE19_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE19_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        magician: 6,
        "great-axe-warrior": 7,
        "half-dragon-warrior": 8,
        monk: 25,
        "divine-sword-warrior": 27,
        warrior: 28,
        "steel-armor-warrior": 29,
        priest: 30,
      },
      forces: stage19Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyBehaviorFor(id: string): number {
    return this.round >= STAGE19_EVENT_PROGRAM.nativeDelayedAiReset.firstRound
      ? STAGE19_EVENT_PROGRAM.nativeDelayedAiReset.value
      : super.enemyBehaviorFor(id);
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
