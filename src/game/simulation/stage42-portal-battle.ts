import { completeCampaignRoster } from "../content/stage0";
import {
  activateStage5Content,
  STAGE42_IRON_PLATE_TERRAIN_SLOT,
  STAGE42_OBSTACLE_TERRAIN_SLOT,
  STAGE42_PORTAL_DEFINITION,
  STAGE42_SEMANTIC_ALLIED_UNITS,
  stage42TerrainSlotAt,
} from "../content/stage5";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import {
  createFixedStageScenario,
  type FixedStageScenarioConfig,
} from "./fixed-stage-battle";
import { DeterministicRng } from "./rng";

const PERSISTED_PORTAL_SLOTS = [0, 1, 2, 3, 4, 5, 6, 24] as const;

export class Stage42PortalBattle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage5Content();
    const base = createFixedStageScenario({
      stage: STAGE42_PORTAL_DEFINITION,
      alliedUnits: STAGE42_SEMANTIC_ALLIED_UNITS,
      enemyUnits: [],
      inheritance: {
        genericPortrait: 47,
        defaultClassId: "soldier",
        untouchedNamedExperience: 299,
      },
      terrainSlotAt: stage42TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE42_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE42_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {},
      forces: [{
        id: "portal-tableau",
        label: "傳送門台陣",
        side: 1,
        control: "independent-ai",
        unitIds: STAGE42_SEMANTIC_ALLIED_UNITS.map(({ slot }) => `1:${slot}`),
        doctrine: { strategy: "native" },
      }],
    } satisfies FixedStageScenarioConfig, campaign.roster);
    super(campaign.difficulty, rng, {
      ...base,
      createCampaignRoster: () => completeCampaignRoster(campaign.roster),
      campaignUnitSlots: PERSISTED_PORTAL_SLOTS,
    });
    this.focusId = "1:0";
  }
}
