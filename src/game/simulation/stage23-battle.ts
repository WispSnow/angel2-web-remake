import {
  activateStage23Content,
  STAGE23_DEFINITION,
  STAGE23_IRON_PLATE_TERRAIN_SLOT,
  STAGE23_OBSTACLE_TERRAIN_SLOT,
  STAGE23_SEMANTIC_ALLIED_UNITS,
  STAGE23_SEMANTIC_ENEMY_UNITS,
  stage23TerrainSlotAt,
} from "../content/stage23";
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

const STAGE23_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE23_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE23_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage23DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE23_UNIT_CONFIG, campaign.difficulty, campaign.roster);
}

function stage23Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-death-valley-breakthrough-team",
      label: "妮雅死亡之谷突圍隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "death-valley-guard",
      label: "死亡之谷守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE23_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage23Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage23Content();
    validateDeploymentResult(STAGE23_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE23_UNIT_CONFIG,
      stage: STAGE23_DEFINITION,
      terrainSlotAt: stage23TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE23_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE23_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "half-dragon-warrior": 8,
        "magic-archer": 12,
        "flying-dragon-knight": 15,
        "swift-dragon-knight": 18,
        crossbow: 21,
        "divine-sword-warrior": 27,
        "steel-armor-warrior": 29,
      },
      forces: stage23Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
