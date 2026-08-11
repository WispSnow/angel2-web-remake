import {
  activateStage18Content,
  STAGE18_DEFINITION,
  STAGE18_EVENT_PROGRAM,
  STAGE18_IRON_PLATE_TERRAIN_SLOT,
  STAGE18_OBSTACLE_TERRAIN_SLOT,
  STAGE18_SEMANTIC_ALLIED_UNITS,
  STAGE18_SEMANTIC_ENEMY_UNITS,
  stage18TerrainSlotAt,
} from "../content/stage18";
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

const STAGE18_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE18_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE18_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage18DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE18_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage18Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-five-team",
      label: "妮雅龍塔第五層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "li-dragon-tower-floor-five-guard",
      label: "麗龍塔第五層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE18_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:12",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage18Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage18Content();
    validateDeploymentResult(STAGE18_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE18_UNIT_CONFIG,
      stage: STAGE18_DEFINITION,
      terrainSlotAt: stage18TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE18_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE18_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        "magic-archer": 12,
        archer: 20,
        crossbow: 21,
        monk: 25,
        "divine-sword-warrior": 27,
        "steel-armor-warrior": 29,
      },
      forces: stage18Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyBehaviorFor(id: string): number {
    return this.round >= STAGE18_EVENT_PROGRAM.nativeDelayedAiReset.firstRound
      ? STAGE18_EVENT_PROGRAM.nativeDelayedAiReset.value
      : super.enemyBehaviorFor(id);
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
