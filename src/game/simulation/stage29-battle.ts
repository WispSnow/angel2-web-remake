import {
  activateStage29Content,
  STAGE29_DEFINITION,
  STAGE29_DEPLOYMENT_ACTORS,
  STAGE29_IRON_PLATE_TERRAIN_SLOT,
  STAGE29_OBSTACLE_TERRAIN_SLOT,
  STAGE29_SEMANTIC_ALLIED_UNITS,
  STAGE29_SEMANTIC_ENEMY_UNITS,
  stage29TerrainSlotAt,
} from "../content/stage29";
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

const STAGE29_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE29_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE29_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage29DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(STAGE29_UNIT_CONFIG, campaign.difficulty, campaign.roster)
    .map((unit) => {
      const rawActor = STAGE29_DEPLOYMENT_ACTORS.find(({ slot }) => slot === unit.slot);
      // Module 27 draws the deployment-list name directly from the actor
      // descriptor. REMAKE-070 also preserves it after deployment, while the
      // missing portrait remains the current class fallback.
      return rawActor?.portraitRecord === 0xff
        ? { ...unit, name: rawActor.normalizedName }
        : unit;
    });
}

function stage29Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  return [
    {
      id: "nia-knight-castle-assault-team",
      label: "妮雅騎士團堡攻略隊",
      side: 1,
      control: "player",
      unitIds: deployment.placements.map(({ slot }) => `1:${slot}`),
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "knight-castle-defense-force",
      label: "騎士團堡守軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE29_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage29Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage29Content();
    validateDeploymentResult(STAGE29_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE29_UNIT_CONFIG,
      stage: STAGE29_DEFINITION,
      terrainSlotAt: stage29TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE29_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE29_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "evil-mage": 11,
        "magic-archer": 12,
        "demon-dragon-knight": 14,
        "swift-dragon-knight": 18,
      },
      forces: stage29Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    return this.enemyBehaviorFor(id) === 1 ? "sentry" : "pursuit";
  }
}
