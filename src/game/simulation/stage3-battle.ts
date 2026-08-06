import {
  activateStage3Content,
  STAGE3_DEFINITION,
  STAGE3_IRON_PLATE_TERRAIN_SLOT,
  STAGE3_OBSTACLE_TERRAIN_SLOT,
  STAGE3_SEMANTIC_ALLIED_UNITS,
  STAGE3_SEMANTIC_ENEMY_UNITS,
  stage3TerrainSlotAt,
} from "../content/stage3";
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

const STAGE3_AI_CLASS_PRIORITY = {
  cavalry: 16,
  monk: 32,
  sister: 35,
  soldier: 36,
} as const;

const sideUnitIds = (side: BattleUnit["side"], slots: readonly number[]): string[] =>
  slots.map((slot) => `${side}:${slot}`);

const STAGE3_FORCE_DEFINITIONS = [
  {
    id: "himi-rescue-force",
    label: "希蜜救援隊",
    side: 1,
    control: "player",
    unitIds: sideUnitIds(1, [54, 53, 52, 51, 1, 4]),
    commanderId: "1:1",
    doctrine: { strategy: "native" },
  },
  {
    id: "fourth-corps",
    label: "第四軍團",
    side: 1,
    control: "independent-ai",
    unitIds: sideUnitIds(1, [21, 46, 45, 47, 3, 20, 50]),
    doctrine: {
      strategy: "terrain-hold",
      allowedTerrainSlots: [3, 5],
      entryTerrainSlots: [3],
      restThresholdPercent: 50,
      criticalHealThresholdPercent: 50,
      priorityHealingActionsByClass: { sister: ["heal-1"] },
      preserveNativeFormation: true,
    },
  },
  {
    id: "sha-first-corps",
    label: "莎第一軍團",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [42, 41, 40, 43, 17]),
    doctrine: { strategy: "native" },
    targeting: {
      preferredForceIds: ["fourth-corps"],
      fallback: "all-opponents",
    },
  },
  {
    id: "sha-second-corps",
    label: "莎第二軍團",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [44, 45, 47, 46, 50, 48, 49]),
    doctrine: { strategy: "native" },
    targeting: {
      preferredForceIds: ["himi-rescue-force"],
      fallback: "all-opponents",
    },
  },
] as const satisfies readonly ForceDefinition[];

const STAGE3_UNIT_CONFIG = {
  alliedUnits: STAGE3_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE3_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
} as const satisfies FixedStageUnitConfig;

const STAGE3_SCENARIO_CONFIG = {
  ...STAGE3_UNIT_CONFIG,
  stage: STAGE3_DEFINITION,
  terrainSlotAt: stage3TerrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE3_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE3_OBSTACLE_TERRAIN_SLOT,
  },
  enemyClassPriority: STAGE3_AI_CLASS_PRIORITY,
  forces: STAGE3_FORCE_DEFINITIONS,
} as const satisfies FixedStageScenarioConfig;

export function createStage3Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  return createFixedStageUnits(STAGE3_UNIT_CONFIG, difficulty, campaignRoster);
}

export class Stage3Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage3Content();
    super(
      campaign.difficulty,
      rng,
      createFixedStageScenario(STAGE3_SCENARIO_CONFIG, campaign.roster),
    );
    this.focusId = "1:1";
  }
}
