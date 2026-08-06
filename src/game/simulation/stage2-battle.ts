import {
  activateStage2Content,
  STAGE2_DEFINITION,
  STAGE2_IRON_PLATE_TERRAIN_SLOT,
  STAGE2_OBSTACLE_TERRAIN_SLOT,
  STAGE2_SEMANTIC_ALLIED_UNITS,
  STAGE2_SEMANTIC_ENEMY_UNITS,
  stage2TerrainSlotAt,
} from "../content/stage2";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  SaveRosterEntry,
} from "../types";
import { Stage0Battle } from "./battle";
import type { ForceDefinition } from "./forces";
import {
  createFixedStageScenario,
  createFixedStageUnits,
  type FixedStageScenarioConfig,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import { DeterministicRng } from "./rng";

const STAGE2_AI_CLASS_PRIORITY = {
  cavalry: 16,
  soldier: 36,
} as const;

const STAGE2_FORCE_DEFINITIONS = [
  {
    id: "stage2-player-force",
    label: "第一軍團",
    side: 1,
    control: "player",
    unitIds: ["1:0", "1:2", "1:24"],
    doctrine: { strategy: "native" },
  },
  {
    id: "stage2-allied-corps",
    label: "友軍軍團",
    side: 1,
    control: "independent-ai",
    unitIds: ["1:40", "1:41", "1:42", "1:43", "1:44", "1:45"],
    doctrine: { strategy: "native" },
  },
  {
    id: "stage2-enemy-force",
    label: "騎士團守軍",
    side: 2,
    control: "independent-ai",
    unitIds: STAGE2_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
    doctrine: { strategy: "native" },
  },
] as const satisfies readonly ForceDefinition[];

const STAGE2_UNIT_CONFIG = {
  alliedUnits: STAGE2_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE2_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
} as const satisfies FixedStageUnitConfig;

const STAGE2_SCENARIO_CONFIG = {
  ...STAGE2_UNIT_CONFIG,
  stage: STAGE2_DEFINITION,
  terrainSlotAt: stage2TerrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE2_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE2_OBSTACLE_TERRAIN_SLOT,
  },
  enemyClassPriority: STAGE2_AI_CLASS_PRIORITY,
  forces: STAGE2_FORCE_DEFINITIONS,
} as const satisfies FixedStageScenarioConfig;

export function createStage2Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  return createFixedStageUnits(STAGE2_UNIT_CONFIG, difficulty, campaignRoster);
}

export class Stage2Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage2Content();
    super(
      campaign.difficulty,
      rng,
      createFixedStageScenario(STAGE2_SCENARIO_CONFIG, campaign.roster),
    );
  }
}
