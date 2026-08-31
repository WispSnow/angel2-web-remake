import {
  activateStage8Content,
  STAGE8_DEFINITION,
  STAGE8_IRON_PLATE_TERRAIN_SLOT,
  STAGE8_OBSTACLE_TERRAIN_SLOT,
  STAGE8_SEMANTIC_ALLIED_UNITS,
  STAGE8_SEMANTIC_ENEMY_UNITS,
  stage8TerrainSlotAt,
} from "../content/stage8";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  SaveRosterEntry,
} from "../types";
import { Stage0Battle } from "./battle";
import {
  createFixedStageScenario,
  createFixedStageUnits,
  type FixedStageScenarioConfig,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const sideUnitIds = (side: BattleUnit["side"], slots: readonly number[]): string[] =>
  slots.map((slot) => `${side}:${slot}`);

const STAGE8_FORCE_DEFINITIONS = [
  {
    id: "sulanda-ranger-command",
    label: "蘇蘭達游騎兵指揮隊",
    side: 1,
    control: "player",
    unitIds: sideUnitIds(1, [8, 17, 18, 40, 41, 42, 43, 44]),
    commanderId: "1:8",
    doctrine: { strategy: "expert" },
  },
  {
    id: "dragon-tower-camp-raiders",
    label: "龍塔營地襲擊隊",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [30, 35, 36, 38, 39, 40, 41, 42, 44, 45, 46]),
    doctrine: { strategy: "expert" },
  },
] as const satisfies readonly ForceDefinition[];

const STAGE8_UNIT_CONFIG = {
  alliedUnits: STAGE8_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE8_SEMANTIC_ENEMY_UNITS,
  // REMAKE-127 deliberately keeps Web difficulty scaling for this native exception.
  enemyExperienceSeeding: "difficulty",
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
} as const satisfies FixedStageUnitConfig;

const STAGE8_SCENARIO_CONFIG = {
  ...STAGE8_UNIT_CONFIG,
  stage: STAGE8_DEFINITION,
  terrainSlotAt: stage8TerrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE8_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE8_OBSTACLE_TERRAIN_SLOT,
  },
  enemyClassPriority: { cavalry: 16, magician: 34, soldier: 36 },
  forces: STAGE8_FORCE_DEFINITIONS,
} as const satisfies FixedStageScenarioConfig;

export function createStage8Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  return createFixedStageUnits(STAGE8_UNIT_CONFIG, difficulty, campaignRoster);
}

export class Stage8Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage8Content();
    super(
      campaign.difficulty,
      rng,
      createFixedStageScenario(STAGE8_SCENARIO_CONFIG, campaign.roster),
    );
    this.focusId = "1:8";
  }
}
