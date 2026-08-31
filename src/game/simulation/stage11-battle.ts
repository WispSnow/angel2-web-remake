import {
  activateStage11Content,
  STAGE11_DEFINITION,
  STAGE11_IRON_PLATE_TERRAIN_SLOT,
  STAGE11_OBSTACLE_TERRAIN_SLOT,
  STAGE11_SEMANTIC_ALLIED_UNITS,
  STAGE11_SEMANTIC_ENEMY_UNITS,
  STAGE11_SEMANTIC_REINFORCEMENTS,
  stage11TerrainSlotAt,
} from "../content/stage11";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  SaveRosterEntry,
} from "../types";
import { Stage0Battle } from "./battle";
import {
  createFixedStageScenario,
  createFixedStageEnemy,
  createFixedStageUnits,
  type FixedStageScenarioConfig,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import type { EnemyPhaseUpdate } from "./ai-contracts";
import { DeterministicRng } from "./rng";

const sideUnitIds = (side: BattleUnit["side"], slots: readonly number[]): string[] =>
  slots.map((slot) => `${side}:${slot}`);

const STAGE11_FORCE_DEFINITIONS = [
  {
    id: "sulanda-ranger-evacuation",
    label: "蘇蘭達游騎兵撤離隊",
    side: 1,
    control: "player",
    unitIds: sideUnitIds(1, [9, 18, 17, 19, 16, 42, 8, 41, 40]),
    commanderId: "1:8",
    doctrine: { strategy: "expert" },
  },
  {
    id: "pegasus-pursuer",
    label: "追擊增援隊",
    side: 2,
    control: "independent-ai",
    unitIds: ["2:21"],
    doctrine: { strategy: "expert" },
  },
] as const satisfies readonly ForceDefinition[];

const STAGE11_UNIT_CONFIG = {
  alliedUnits: STAGE11_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE11_SEMANTIC_ENEMY_UNITS,
  // REMAKE-127 applies to the opening pursuer and every later reinforcement.
  enemyExperienceSeeding: "difficulty",
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
} as const satisfies FixedStageUnitConfig;

const STAGE11_SCENARIO_CONFIG = {
  ...STAGE11_UNIT_CONFIG,
  stage: STAGE11_DEFINITION,
  terrainSlotAt: stage11TerrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE11_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE11_OBSTACLE_TERRAIN_SLOT,
  },
  enemyClassPriority: {
    soldier: 0,
    "half-dragon-warrior": 8,
    cavalry: 22,
    "pegasus-warrior": 23,
  },
  forces: STAGE11_FORCE_DEFINITIONS,
} as const satisfies FixedStageScenarioConfig;

export function createStage11Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  return createFixedStageUnits(STAGE11_UNIT_CONFIG, difficulty, campaignRoster);
}

export class Stage11Battle extends Stage0Battle {
  private lastReinforcementRound = 0;

  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage11Content();
    super(
      campaign.difficulty,
      rng,
      createFixedStageScenario(STAGE11_SCENARIO_CONFIG, campaign.roster),
    );
    this.focusId = "1:8";
  }

  private spawnReinforcement(): BattleUnit | undefined {
    const candidate = STAGE11_SEMANTIC_REINFORCEMENTS.candidates.find(({ slot }) =>
      !this.units.some((unit) => unit.side === 2 && unit.slot === slot));
    if (!candidate) return undefined;

    const occupied = new Set(this.units.map(({ x, y }) => y * this.stage.width + x));
    let cell = STAGE11_SEMANTIC_REINFORCEMENTS.spawnStart.cell;
    while (cell >= 0 && occupied.has(cell)) {
      cell += STAGE11_SEMANTIC_REINFORCEMENTS.spawnScanDirection;
    }
    if (cell < 0) return undefined;

    const unit = createFixedStageEnemy({
      slot: candidate.slot,
      position: { x: cell % this.stage.width, y: Math.floor(cell / this.stage.width) },
      classId: candidate.classId,
      name: candidate.name,
      aiBehavior: candidate.aiBehavior,
    }, this.difficulty, "difficulty");
    this.forces.inheritUnit("2:21", unit.id);
    this.units.push(unit);
    return unit;
  }

  override beginEnemyPhase(): EnemyPhaseUpdate {
    if (this.lastReinforcementRound !== this.round) {
      this.lastReinforcementRound = this.round;
      this.spawnReinforcement();
    }
    return super.beginEnemyPhase();
  }

  override enemyBehaviorFor(id: string): number {
    const unit = this.unit(id);
    if (unit?.side === 2) {
      const candidate = STAGE11_SEMANTIC_REINFORCEMENTS.candidates
        .find(({ slot }) => slot === unit.slot);
      if (candidate) return candidate.aiBehavior;
    }
    return super.enemyBehaviorFor(id);
  }

  protected override restoreDerivedForceMemberships(): void {
    this.lastReinforcementRound = 0;
    for (const unit of this.units) {
      if (unit.side === 2 && STAGE11_SEMANTIC_REINFORCEMENTS.candidates
        .some(({ slot }) => slot === unit.slot)) {
        this.forces.inheritUnit("2:21", unit.id);
      }
    }
  }
}
