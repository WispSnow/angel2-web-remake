import {
  activateStage4Content,
  STAGE4_DEFINITION,
  STAGE4_ROUTE_PULSE_DEFINITION,
  STAGE4_SEMANTIC_ALLIED_UNITS,
  STAGE4_SEMANTIC_ENEMY_UNITS,
  stage4TerrainSlotAt,
} from "../content/stage4";
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
import { DeterministicRng } from "./rng";

const STAGE4_AI_CLASS_PRIORITY = { soldier: 36 } as const;

const STAGE4_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE4_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE4_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

export function createStage4DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(
    STAGE4_UNIT_CONFIG,
    campaign.difficulty,
    campaign.roster,
  );
}

function stage4Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  const playerUnitIds = deployment.placements
    .filter(({ slot }) => slot !== 24)
    .map(({ slot }) => `1:${slot}`);
  return [
    {
      id: "nia-escort",
      label: "妮雅護衛隊",
      side: 1,
      control: "player",
      unitIds: playerUnitIds,
      commanderId: "1:0",
      doctrine: { strategy: "native" },
    },
    {
      id: "barrier-guide",
      label: "結界引導",
      side: 1,
      control: "independent-ai",
      unitIds: ["1:24"],
      commanderId: "1:24",
      doctrine: { strategy: "native" },
    },
    {
      id: "castle-sentries",
      label: "城堡守軍",
      side: 2,
      control: "independent-ai",
      unitIds: ["2:40", "2:41"],
      doctrine: { strategy: "native" },
      targeting: { preferredForceIds: ["nia-escort"], fallback: "all-opponents" },
    },
  ];
}

export class Stage4Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage4Content();
    validateDeploymentResult(STAGE4_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE4_UNIT_CONFIG,
      stage: STAGE4_DEFINITION,
      terrainSlotAt: stage4TerrainSlotAt,
      enemyClassPriority: STAGE4_AI_CLASS_PRIORITY,
      forces: stage4Forces(deployment),
      routePulses: [STAGE4_ROUTE_PULSE_DEFINITION],
    }, campaign.roster, deployment));
  }
}
