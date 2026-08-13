import {
  activateStage30Content,
  STAGE30_ALL_FORM_CLASS_IDS,
  STAGE30_DEFINITION,
  STAGE30_EVENT_PROGRAM,
  STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY,
  STAGE30_IRON_PLATE_TERRAIN_SLOT,
  STAGE30_OBSTACLE_TERRAIN_SLOT,
  STAGE30_SEMANTIC_ALLIED_UNITS,
  STAGE30_SEMANTIC_INITIAL_ENEMY,
  stage30TerrainSlotAt,
} from "../content/stage30";
import { classDefinition } from "../content/classes";
import type { BattleUnit, CampaignState } from "../types";
import {
  Stage0Battle,
  type PendingUnitTransformation,
} from "./battle";
import type { EnemyAiIntent } from "./ai-contracts";
import {
  createFixedStageScenario,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

const STAGE30_UNIT_CONFIG: FixedStageUnitConfig = {
  alliedUnits: STAGE30_SEMANTIC_ALLIED_UNITS,
  enemyUnits: [STAGE30_SEMANTIC_INITIAL_ENEMY],
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const STAGE30_FORCES: readonly ForceDefinition[] = [
  {
    id: "nia-empress-rescue-team",
    label: "妮雅女帝救援隊",
    side: 1,
    control: "player",
    unitIds: ["1:40", "1:7", "1:0"],
    commanderId: "1:0",
    doctrine: { strategy: "expert" },
  },
  {
    id: "bewitched-empress",
    label: "失控的維絲塔女帝",
    side: 2,
    control: "independent-ai",
    unitIds: ["2:27"],
    doctrine: { strategy: "expert" },
  },
];

export class Stage30Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage30Content();
    super(campaign.difficulty, rng, createFixedStageScenario({
      ...STAGE30_UNIT_CONFIG,
      stage: STAGE30_DEFINITION,
      terrainSlotAt: stage30TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE30_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE30_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: Object.fromEntries(
        STAGE30_ALL_FORM_CLASS_IDS.map((classId) => [classId, classDefinition(classId).nativeRecord]),
      ),
      forces: STAGE30_FORCES,
      campaignUnitSlots: [0, 7, 23, 40],
    }, campaign.roster));
    this.focusId = "1:0";
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }

  protected override replacementForDefeatedUnit(
    unit: BattleUnit,
  ): Omit<PendingUnitTransformation, "before" | "reason" | "retainsBeforeUntilCommit"> | undefined {
    if (unit.id !== "2:27") return undefined;
    const currentRecord = classDefinition(unit.classId).nativeRecord;
    const sequence = STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY[this.difficulty];
    const currentIndex = sequence.indexOf(unit.classId);
    if (currentIndex < 0 || currentRecord !== currentIndex) {
      throw new Error(`invalid stage 30 Vesta form ${unit.classId}`);
    }
    const nextClassId = sequence[currentIndex + 1];
    const target = nextClassId
      ? {
          classId: nextClassId,
          name: "維絲塔",
          portrait: 41 as const,
          experience: 0,
        }
      : {
          classId: "empress" as const,
          name: "維絲塔",
          portrait: 41 as const,
          experience: 0,
          side: 1 as const,
          slot: 23,
          forceSourceId: "1:0",
        };
    return {
      after: this.transformedUnit(unit, target),
      context: STAGE30_EVENT_PROGRAM.contextualLine,
      ...(target.forceSourceId ? { forceSourceId: target.forceSourceId } : {}),
    };
  }
}
