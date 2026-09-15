import {
  activateStage27Content,
  STAGE27_DEFINITION,
  STAGE27_EVENT_PROGRAM,
  STAGE27_IRON_PLATE_TERRAIN_SLOT,
  STAGE27_OBSTACLE_TERRAIN_SLOT,
  STAGE27_SEMANTIC_ALLIED_UNITS,
  STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS,
  STAGE27_SEMANTIC_ENEMY_UNITS,
  STAGE27_SEMANTIC_REINFORCEMENTS,
  stage27TerrainSlotAt,
} from "../content/stage27";
import type { DeploymentRosterUnit } from "../deployment-session";
import type { BattleUnit, CampaignState } from "../types";
import { Stage0Battle } from "./battle";
import type { EnemyAiIntent, EnemyPhaseUpdate } from "./ai-contracts";
import {
  createDeployedStageRoster,
  createDeployedStageScenario,
  type DeployedStageUnitConfig,
} from "./deployed-stage-battle";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { createFixedStageEnemy } from "./fixed-stage-battle";
import type { ForceDefinition } from "./forces";
import { nearestStandableFreeCell, positionKey, type GridBattlefield } from "./grid";
import { DeterministicRng } from "./rng";

const STAGE27_UNIT_CONFIG: DeployedStageUnitConfig = {
  alliedUnits: STAGE27_SEMANTIC_ALLIED_UNITS,
  enemyUnits: STAGE27_SEMANTIC_ENEMY_UNITS,
  inheritance: {
    genericPortrait: 47,
    defaultClassId: "soldier",
    untouchedNamedExperience: 299,
  },
};

const STAGE27_DEPLOYMENT_ROSTER_CONFIG: DeployedStageUnitConfig = {
  ...STAGE27_UNIT_CONFIG,
  alliedUnits: STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS,
};

/** Static rebel whose force every spawned pursuer joins; force membership outlives removal. */
const STAGE27_REBEL_FORCE_SOURCE_ID = "2:40";

export function createStage27DeploymentRoster(
  campaign: Pick<CampaignState, "difficulty" | "roster">,
): DeploymentRosterUnit[] {
  return createDeployedStageRoster(
    STAGE27_DEPLOYMENT_ROSTER_CONFIG,
    campaign.difficulty,
    campaign.roster,
  );
}

function stage27Forces(deployment: DeploymentResult): readonly ForceDefinition[] {
  const behaviorBySlot = new Map<number, number>(
    STAGE27_SEMANTIC_ALLIED_UNITS.map(({ slot, aiBehavior }) => [slot, aiBehavior]),
  );
  const playerIds = deployment.placements
    .filter(({ slot }) => behaviorBySlot.get(slot) === 0)
    .map(({ slot }) => `1:${slot}`);
  const automaticIds = deployment.placements
    .filter(({ slot }) => behaviorBySlot.get(slot) === 2)
    .map(({ slot }) => `1:${slot}`);
  return [
    {
      id: "nia-valkyrie-return-team",
      label: "妮雅回城隊",
      side: 1,
      control: "player",
      unitIds: playerIds,
      commanderId: "1:0",
      doctrine: { strategy: "expert" },
    },
    {
      id: "valkyrie-city-defense",
      label: "瓦爾克麗城防軍",
      side: 1,
      control: "independent-ai",
      unitIds: automaticIds,
      doctrine: { strategy: "expert" },
    },
    {
      id: "valkyrie-rebels",
      label: "瓦爾克麗叛軍",
      side: 2,
      control: "independent-ai",
      unitIds: STAGE27_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
      doctrine: { strategy: "expert" },
    },
  ];
}

export class Stage27Battle extends Stage0Battle {
  private lastReinforcementRound = 0;

  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage27Content();
    validateDeploymentResult(STAGE27_DEFINITION.deployment, deployment);
    super(campaign.difficulty, rng, createDeployedStageScenario({
      ...STAGE27_UNIT_CONFIG,
      stage: STAGE27_DEFINITION,
      terrainSlotAt: stage27TerrainSlotAt,
      dynamicTerrainSlots: {
        "iron-plate": STAGE27_IRON_PLATE_TERRAIN_SLOT,
        obstacle: STAGE27_OBSTACLE_TERRAIN_SLOT,
      },
      enemyClassPriority: {
        "magic-sword-warrior": 1,
        "magic-priest": 3,
        "curse-master": 5,
        "great-axe-warrior": 7,
        "half-dragon-warrior": 8,
        "magic-armor-warrior": 9,
        "magic-archer": 12,
        "demon-dragon-knight": 14,
        "flying-dragon-knight": 15,
        "pegasus-warrior": 23,
      },
      forces: stage27Forces(deployment),
    }, campaign.roster, deployment));
    this.focusId = "1:0";
  }

  /**
   * REMAKE-153: native `1000:525F` runs once per full round, after every side-1
   * manual and automatic action and before side-2 AI. From round 5 the lowest
   * side-2 slot 30..39 not on the board spawns at (33,41) and acts this same
   * enemy phase. Removed slots come back into the pool, and no PRNG is read.
   *
   * REMAKE-154: the native chain skips the whole round while any unit stands on
   * (33,41), so a parked unit shuts the reinforcements off. stableRemake lands the
   * pursuer on the nearest free cell its own class may enter instead.
   */
  private spawnReinforcement(): BattleUnit | undefined {
    const program = STAGE27_SEMANTIC_REINFORCEMENTS;
    if (this.round < program.firstRound) return undefined;
    const candidate = program.candidates.find(({ slot }) =>
      !this.units.some((unit) => unit.side === 2 && unit.slot === slot));
    if (!candidate) return undefined;

    const [spawnCell] = program.spawnCells;
    const occupiedKeys = new Set(this.units.map(positionKey));
    const battlefield: GridBattlefield = {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt: (cell) => this.terrainSlotAt(cell),
    };
    const position = occupiedKeys.has(positionKey(spawnCell))
      ? nearestStandableFreeCell(candidate.classId, spawnCell, occupiedKeys, battlefield)
      : { x: spawnCell.x, y: spawnCell.y };
    if (!position) return undefined;

    const unit = createFixedStageEnemy({
      slot: candidate.slot,
      position,
      classId: candidate.classId,
      name: candidate.name,
      aiBehavior: candidate.aiBehavior,
    }, this.difficulty);
    this.forces.inheritUnit(STAGE27_REBEL_FORCE_SOURCE_ID, unit.id);
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

  /** REMAKE-067 keeps the city defenders stationary only during round 1. */
  override alliedBehaviorFor(id: string): number {
    const behavior = super.alliedBehaviorFor(id);
    const unit = this.unit(id);
    const control = STAGE27_EVENT_PROGRAM.alliedControl;
    if (control.firstRoundAutomaticPosture === "sentry"
      && this.round < control.normalPostureFromRound
      && behavior === 2
      && unit?.side === 1
      && control.automaticBehavior2Slots.some((slot) => slot === unit.slot)) {
      return 1;
    }
    return behavior;
  }

  override enemyBehaviorFor(id: string): number {
    const unit = this.unit(id);
    const candidate = unit?.side === 2
      ? STAGE27_SEMANTIC_REINFORCEMENTS.candidates.find(({ slot }) => slot === unit.slot)
      : undefined;
    return candidate?.aiBehavior ?? super.enemyBehaviorFor(id);
  }

  override enemyAiIntentFor(id: string): EnemyAiIntent | undefined {
    const unit = this.unit(id);
    return unit?.side === 2 ? "pursuit" : undefined;
  }

  /** Saves happen in the player phase, so the next enemy phase may spawn again after a load. */
  protected override restoreDerivedForceMemberships(): void {
    this.lastReinforcementRound = 0;
    for (const unit of this.units) {
      if (unit.side === 2 && STAGE27_SEMANTIC_REINFORCEMENTS.candidates
        .some(({ slot }) => slot === unit.slot)) {
        this.forces.inheritUnit(STAGE27_REBEL_FORCE_SOURCE_ID, unit.id);
      }
    }
  }
}
