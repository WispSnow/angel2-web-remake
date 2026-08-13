import {
  activateStage27Content,
  STAGE27_DEFINITION,
  STAGE27_EVENT_PROGRAM,
  STAGE27_IRON_PLATE_TERRAIN_SLOT,
  STAGE27_OBSTACLE_TERRAIN_SLOT,
  STAGE27_SEMANTIC_ALLIED_UNITS,
  STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS,
  STAGE27_SEMANTIC_ENEMY_UNITS,
  stage27TerrainSlotAt,
} from "../content/stage27";
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

const STAGE27_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE27_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE27_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const STAGE27_DEPLOYMENT_ROSTER_CONFIG: DeployedStageUnitConfig = {
  ...STAGE27_UNIT_CONFIG,
  alliedUnits: STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS,
};

export function createStage27DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(
    STAGE27_DEPLOYMENT_ROSTER_CONFIG,
    campaign.difficulty,
    campaign.roster,
  );
}

function stage27Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  const behaviorBySlot = new Map<number, number>(
    STAGE27_SEMANTIC_ALLIED_UNITS.map(({ slot, aiBehavior }) => [slot, aiBehavior]),
  );
  const playerIds = deployment.placements
    .filter(({ slot }) => behaviorBySlot.get(slot) === 0)
    .map(({ slot }) => `1:${slot}`);
  const automaticIds = deployment.placements
    .filter(({ slot }) => behaviorBySlot.get(slot) === 2)
    .map(({ slot }) => `1:${slot}`);
  return [
    {
      id: "nia-valkyrie-return-team",
      label: "妮雅回城隊",
      side: 1,
      control: "player",
      unitIds: playerIds,
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "valkyrie-city-defense",
      label: "瓦爾克麗城防軍",
      side: 1,
      control: "independent-ai",
      unitIds: automaticIds,
      doctrine: { strategy: "expert" },
    },
    {
      id: "valkyrie-rebels",
      label: "瓦爾克麗叛軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE27_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage27Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage27Content();
    validateDeploymentResult(STAGE27_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE27_UNIT_CONFIG,
      stage: STAGE27_DEFINITION,
      terrainSlotAt: stage27TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE27_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE27_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "magic-priest": 3,
        "curse-master": 5,
        "magic-armor-warrior": 9,
        "magic-archer": 12,
      },
      forces: stage27Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  /** REMAKE-067 keeps the city defenders stationary only during round 1. */
  override alliedBehaviorFor(id: string): number {
    const behavior = super.alliedBehaviorFor(id);
    const unit = this.unit(id);
    const control = STAGE27_EVENT_PROGRAM.alliedControl;
    if (control.firstRoundAutomaticPosture === "sentry"
      && this.round < control.normalPostureFromRound
      && behavior === 2
      && unit?.side === 1
      && control.automaticBehavior2Slots.some((slot) => slot === unit.slot)) {
      return 1;
    }
    return behavior;
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }
}
