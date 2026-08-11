import {
  activateStage16Content,
  STAGE16_DEFINITION,
  STAGE16_EVENT_PROGRAM,
  STAGE16_IRON_PLATE_TERRAIN_SLOT,
  STAGE16_OBSTACLE_TERRAIN_SLOT,
  STAGE16_SEMANTIC_ALLIED_UNITS,
  STAGE16_SEMANTIC_ENEMY_UNITS,
  stage16TerrainSlotAt,
} from "../content/stage16";
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
import type { EnemyAiIntent } from "./ai-contracts";
import { DeterministicRng } from "./rng";

const STAGE16_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE16_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE16_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage16DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE16_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage16Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-three-team",
      label: "妮雅龍塔第三層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "sha-dragon-tower-floor-three-guard",
      label: "莎龍塔第三層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE16_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:10",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage16Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage16Content();
    validateDeploymentResult(STAGE16_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE16_UNIT_CONFIG,
      stage: STAGE16_DEFINITION,
      terrainSlotAt: stage16TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE16_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE16_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        magician: 6,
        "half-dragon-warrior": 8,
        archer: 20,
        "divine-sword-warrior": 27,
        "steel-armor-warrior": 29,
      },
      forces: stage16Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyBehaviorFor(id: string): number {
    return this.round >= STAGE16_EVENT_PROGRAM.nativeDelayedAiReset.firstRound
      ? STAGE16_EVENT_PROGRAM.nativeDelayedAiReset.value
      : super.enemyBehaviorFor(id);
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
