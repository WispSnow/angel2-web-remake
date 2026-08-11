import {
  activateStage17Content,
  STAGE17_DEFINITION,
  STAGE17_EVENT_PROGRAM,
  STAGE17_IRON_PLATE_TERRAIN_SLOT,
  STAGE17_OBSTACLE_TERRAIN_SLOT,
  STAGE17_SEMANTIC_ALLIED_UNITS,
  STAGE17_SEMANTIC_ENEMY_UNITS,
  stage17TerrainSlotAt,
} from "../content/stage17";
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

const STAGE17_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE17_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE17_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage17DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE17_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage17Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-dragon-tower-floor-four-team",
      label: "妮雅龍塔第四層攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "qian-dragon-tower-floor-four-guard",
      label: "倩龍塔第四層守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE17_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      commanderId: "2:11",
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage17Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage17Content();
    validateDeploymentResult(STAGE17_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE17_UNIT_CONFIG,
      stage: STAGE17_DEFINITION,
      terrainSlotAt: stage17TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE17_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE17_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        magician: 6,
        "great-axe-warrior": 7,
        "half-dragon-warrior": 8,
        monk: 25,
        "divine-sword-warrior": 27,
        "steel-armor-warrior": 29,
        priest: 30,
      },
      forces: stage17Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyBehaviorFor(id: string): number {
    return this.round >= STAGE17_EVENT_PROGRAM.nativeDelayedAiReset.firstRound
      ? STAGE17_EVENT_PROGRAM.nativeDelayedAiReset.value
      : super.enemyBehaviorFor(id);
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
