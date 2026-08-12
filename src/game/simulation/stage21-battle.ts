import {
  activateStage21Content,
  STAGE21_DEFINITION,
  STAGE21_IRON_PLATE_TERRAIN_SLOT,
  STAGE21_OBSTACLE_TERRAIN_SLOT,
  stage21TerrainSlotAt,
} from "../content/stage21";
import type { CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import { createFixedStageScenario, type FixedStageScenarioConfig } from "./fixed-stage-battle";
import { DeterministicRng } from "./rng";

const STAGE21_SCENARIO_CONFIG = {
  stage: STAGE21_DEFINITION,
  alliedUnits: [],
  enemyUnits: [],
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
  terrainSlotAt: stage21TerrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE21_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE21_OBSTACLE_TERRAIN_SLOT,
  },
  enemyClassPriority: {},
  forces: [],
} as const satisfies FixedStageScenarioConfig;

export class Stage21Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage21Content();
    super(
      campaign.difficulty,
      rng,
      createFixedStageScenario(STAGE21_SCENARIO_CONFIG, campaign.roster),
    );
  }
}
