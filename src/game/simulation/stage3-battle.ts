import {
  activateStage3Content,
  STAGE3_DEFINITION,
  STAGE3_IRON_PLATE_TERRAIN_SLOT,
  STAGE3_FOURTH_CORPS_FORCE_ID,
  STAGE3_OBSTACLE_TERRAIN_SLOT,
  STAGE3_SECOND_CORPS_FORCE_ID,
  STAGE3_SECOND_CORPS_UNIT_IDS,
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

/**
 * 两支我方军团按原版逐槽行为划分：行为 0 归希蜜救援队，行为 2/3/4 归第四军团。
 * `REMAKE-108` 换掉四个玩家槽后不需要在这里再抄一遍槽号。
 */
const alliedSlotsByBehavior = (playerControlled: boolean): number[] =>
  STAGE3_SEMANTIC_ALLIED_UNITS
    .filter(({ aiBehavior }) => (aiBehavior === 0) === playerControlled)
    .map(({ slot }) => slot);

const alliedUnitIdsByBehavior = (playerControlled: boolean): string[] =>
  sideUnitIds(1, alliedSlotsByBehavior(playerControlled));

/**
 * `REMAKE-111` 的集结点同样不手抄槽号：第四军团里唯一同时写进关卡失败条件的成员
 * 就是被救援的黛西。她倒下直接判负，所以这一队休整时该围住的正是这个人。
 */
const STAGE3_RALLY_UNIT_ID = ((): string => {
  const protectedSlots: readonly number[] = STAGE3_DEFINITION.objective.defeat.slots;
  const rallySlots = alliedSlotsByBehavior(false)
    .filter((slot) => protectedSlots.includes(slot));
  if (rallySlots.length !== 1) {
    throw new Error(`Stage 3 needs exactly one protected fourth-corps member, got ${rallySlots.length}`);
  }
  return `1:${rallySlots[0]}`;
})();

const STAGE3_FORCE_DEFINITIONS = [
  {
    id: "himi-rescue-force",
    label: "希蜜救援隊",
    side: 1,
    control: "player",
    unitIds: alliedUnitIdsByBehavior(true),
    commanderId: "1:1",
    doctrine: { strategy: "expert" },
  },
  {
    id: STAGE3_FOURTH_CORPS_FORCE_ID,
    label: "第四軍團",
    tacticLabel: "固守防區",
    side: 1,
    control: "independent-ai",
    unitIds: alliedUnitIdsByBehavior(false),
    doctrine: {
      strategy: "terrain-hold",
      allowedTerrainSlots: [3, 5],
      entryTerrainSlots: [3],
      restThresholdPercent: 50,
      criticalHealThresholdPercent: 50,
      priorityHealingActionsByClass: { sister: ["heal-1"] },
      preserveNativeFormation: true,
      // REMAKE-111：被救援的第四军团只求活下来，近战交出主动权，全队向黛西收拢。
      rally: { unitId: STAGE3_RALLY_UNIT_ID, meleeHoldsFire: true },
      // REMAKE-172：拦截救援队的莎第二军团全灭后，救援队已能会合，第四军团不再死守，
      // 改走与其他自动友军相同的专家作战，免得只剩第一军团时战斗无限拖长。
      release: {
        whenForcesEliminated: [STAGE3_SECOND_CORPS_FORCE_ID],
        tacticLabel: "轉守為攻",
      },
    },
  },
  {
    id: "sha-first-corps",
    label: "莎第一軍團",
    tacticLabel: "壓制第四軍團",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [42, 41, 40, 43, 17]),
    doctrine: { strategy: "expert" },
    targeting: {
      preferredForceIds: [STAGE3_FOURTH_CORPS_FORCE_ID],
      fallback: "all-opponents",
    },
  },
  {
    id: STAGE3_SECOND_CORPS_FORCE_ID,
    label: "莎第二軍團",
    tacticLabel: "阻擊救援隊",
    side: 2,
    control: "independent-ai",
    unitIds: STAGE3_SECOND_CORPS_UNIT_IDS,
    doctrine: { strategy: "expert" },
    targeting: {
      preferredForceIds: ["himi-rescue-force"],
      fallback: "all-opponents",
    },
  },
] as const satisfies readonly ForceDefinition[];

const STAGE3_UNIT_CONFIG = {
  alliedUnits: STAGE3_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE3_SEMANTIC_ENEMY_UNITS,
  // REMAKE-129 keeps normal Web levels on the first three settings; only
  // lawless uses the native level-one exception before its later 150% stats.
  enemyExperienceSeeding: "difficulty-unless-lawless",
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
