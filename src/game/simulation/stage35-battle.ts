import {
  activateStage35Content,
  STAGE35_DEFINITION,
  STAGE35_IRON_PLATE_TERRAIN_SLOT,
  STAGE35_OBSTACLE_TERRAIN_SLOT,
  STAGE35_SEMANTIC_ALLIED_UNITS,
  STAGE35_SEMANTIC_ENEMY_UNITS,
  stage35TerrainSlotAt,
} from "../content/stage35";
import { classDefinition } from "../content/classes";
import type { CampaignState, Position } from "../types";
import { Stage0Battle } from "./battle";
import type { AlliedAiAction } from "./ai-contracts";
import {
  createFixedStageScenario,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";

// REMAKE-170: B/0071 stands slots 39/35/36 on wall-face tokens at row 8 that
// resolve to logical slot 0: movement rule 99 and terrain defense 99% for every
// class. Mode `0`/`2` ranges stop at rule 99, so the original leaves the three
// out of reach of every technique and shot while nearly doubling their defense
// against melee. stableRemake reads those cells as the slot-20 broken ledge they
// line up with at (24..26,8); content keeps the native slot as evidence.
const STAGE35_WALL_TERRAIN_SLOT = 0;
const STAGE35_WALL_LEDGE_TERRAIN_SLOT = 20;
const STAGE35_WALL_LEDGE_CELLS: ReadonlySet<string> = new Set(
  STAGE35_SEMANTIC_ENEMY_UNITS
    .filter(({ position }) => stage35TerrainSlotAt(position) === STAGE35_WALL_TERRAIN_SLOT)
    .map(({ position }) => `${position.x},${position.y}`),
);

const stage35RemakeTerrainSlotAt = (position: Position): number =>
  STAGE35_WALL_LEDGE_CELLS.has(`${position.x},${position.y}`)
    ? STAGE35_WALL_LEDGE_TERRAIN_SLOT
    : stage35TerrainSlotAt(position);

const STAGE35_UNIT_CONFIG: FixedStageUnitConfig = {
  alliedUnits: STAGE35_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE35_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const STAGE35_FORCES: readonly ForceDefinition[] = [
  {
    id: "nia-time-space-anomaly-force",
    label: "妮雅時空異變調查隊",
    side: 1,
    control: "player",
    unitIds: STAGE35_SEMANTIC_ALLIED_UNITS.map(({ slot }) => `1:${slot}`),
    commanderId: "1:0",
    doctrine: { strategy: "expert" },
  },
  {
    id: "death-valley-fleeing-force",
    label: "死亡之谷逃難部隊",
    tacticLabel: "原地待命",
    side: 2,
    control: "independent-ai",
    unitIds: STAGE35_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
    doctrine: { strategy: "expert" },
  },
];

export class Stage35Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage35Content();
    super(campaign.difficulty, rng, createFixedStageScenario({
      ...STAGE35_UNIT_CONFIG,
      stage: STAGE35_DEFINITION,
      terrainSlotAt: stage35RemakeTerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE35_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE35_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: Object.fromEntries(
        STAGE35_SEMANTIC_ENEMY_UNITS.map(({ classId }) => [
          classId,
          classDefinition(classId).nativeRecord,
        ]),
      ),
      forces: STAGE35_FORCES,
    }, campaign.roster));
    this.focusId = "1:0";
  }

  override enemyMovementRange(id: string): Position[] {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.actionDisabled) return [];
    return [{ x: unit.x, y: unit.y }];
  }

  override planEnemyAiAction(id: string, behavior = this.enemyBehaviorFor(id)): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    if (unit.statuses.confusion > 0) return super.planEnemyAiAction(id, behavior);
    if (behavior !== 12) return super.planEnemyAiAction(id, behavior);
    return { unitId: id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }
}
