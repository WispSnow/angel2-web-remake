import {
  classCombatRole,
  classTierFor,
  classDefinition,
  classFallbackPortraitFor,
  className,
  genericUnitName,
  immuneToPhysicalShootingFor,
  isClassImmuneToOrdinaryHitStatus,
  killRewardFor,
  mitigateOrdinaryDamage,
  ordinaryHitStatusFor,
  STRIPPABLE_BUFF_KEYS,
  stripsTargetBuffsOnActiveHit,
  suppressesOrdinaryCounterFor,
  terrainDefensePercentFor,
  usesClassIdentity,
  usesEmpressOrDragonAi,
  usesTechniqueAi,
} from "../content/classes";
import {
  BATTLE_ACTION_DEFINITIONS,
  HALF_DRAGON_TELEPORT_ACTION_ID,
  WATER_WARRIOR_SHOT_ACTION_ID,
  hasIceTechnique,
  isIceActionId,
  isShootingActionId,
  shootingActionIdFor,
  techniqueActionIdsFor,
} from "../content/actions";
import { STAGE0, STAGE0_AI_CLASS_PRIORITY, STAGE0_IRON_PLATE_TERRAIN_SLOT, STAGE0_OBSTACLE_TERRAIN_SLOT, completeCampaignRoster, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import { STAGE0_DEFINITION, type StageDefinition } from "../content/stages";
import type { AttackResult, BattleOutcome, BattleUnit, CampaignState, Difficulty, DynamicTerrainKind, DynamicTerrainOverride, PortraitRecord, Position, SaveRosterEntry, SavedBattleState, Side, UnitClassId, UnitStats, UnitStatuses } from "../types";
import { DeterministicRng } from "./rng";
import { constructionPath, constructionReachableCells, manhattan, movementCost, movementCostsToNearestTarget, movementMap, movementPath as findMovementPath, neighbors, positionKey, reachableCells, routePath, shortestPath, type GridBattlefield, type MovementMap } from "./grid";
import {
  promoteUnit,
  promotionQueue,
  type PromotionCommitResult,
} from "./promotion";
import type { ClassId } from "../content/classes";
import {
  shootingRange,
  shootingLinePaths,
  NumericRangeMap,
  techniqueSelectionPath,
  techniqueSelectionRange,
} from "./actions/range-map";
import { prepareSpecialAction as resolveSpecialAction } from "./actions/resolve";
import {
  prepareConstruction as resolveConstruction,
  terrainMutationFingerprint,
  type ConstructionActionId,
  type ConstructionResult,
  type IronPlateConstructionResult,
  type ObstacleConstructionResult,
  type PreparedConstruction,
  type PreparedIronPlateConstruction,
  type PreparedObstacleConstruction,
} from "./actions/construction";
import type {
  BattleActionId,
  BattleActionIntent,
  PreparedBattleAction,
  SpecialActionResult,
} from "./actions/types";
import { effectiveAttack, effectiveDefense, emptyUnitStatuses, tickTimedStatus, UNIT_STATUS_KEYS } from "./status";
import {
  battleOutcomeForObjective,
  slotsNamedByCondition,
  STAGE_ROUND_LIMIT,
  STAGE_ROUND_LIMIT_WARNING_ROUNDS,
} from "./objectives";
import {
  hasEnemyDamageActionThisTurn,
  type EnemyThreatContext,
} from "./enemy-ai";
import {
  ForceRegistry,
  type ForceDefinition,
} from "./forces";
import { planTerrainHoldForceAiAction } from "./force-ai";
import { planNativeStageRoute } from "./stage-route";
import type {
  AiActionSelection,
  AlliedAiAction,
  ClassActionPlanningOptions,
  EnemyAiIntent,
  EnemyPhaseUpdate,
  OrdinaryAiPlanningOptions,
} from "./ai-contracts";
import {
  assertRoutePulseDefinition,
  planRoutePulsePath,
  prepareRoutePulse as resolveRoutePulse,
  routePulseSafeCells,
  type PreparedRoutePulse,
  type RoutePulseDefinition,
} from "./route-pulse";
import {
  assertEscortRouteDefinition,
  planEscortRoutePath,
  type EscortRouteDefinition,
} from "./escort-route";
import {
  commitEnemyPhaseTail,
  type EnemyPhaseTailDefinition,
  type PreparedEnemyPhaseTail,
} from "./enemy-phase-tail";
import {
  compareExpertAiPriorityBand,
  compareExpertAiUtility,
  expertAiCandidateTrace,
  expertExposureAt,
  expertOrdinaryUtility,
  expertSpecialUtility,
  expertTacticalScore,
  expertUtilityForAction,
  type ExpertAiDecisionTrace,
  type ExpertAiEvaluationCache,
  type ExpertAiEvaluationContext,
  type ExpertAiUtility,
} from "./expert-ai";

export type {
  AiActionSelection,
  AlliedAiAction,
  ClassActionPlanningOptions,
  EnemyAiIntent,
  EnemyPhaseUpdate,
  OrdinaryAiPlanningOptions,
} from "./ai-contracts";

export interface MagicArcherLineOption {
  path: Position[];
  affectedUnitIds: string[];
  guaranteedKills: number;
  expectedDamage: number;
  targetThreat: number;
}

export interface AiPlanningDiagnostics extends AiPlanningMetrics {
  movementMapEntries: number;
  actionRangeEntries: number;
  utilityEntries: number;
}

export interface UnitTransformationContext {
  selector: number;
  address: string;
  text: string;
}

export interface UnitTransformationTarget {
  classId: UnitClassId;
  name: string;
  displayIdentity?: "named-class-portrait";
  portrait?: PortraitRecord;
  experience: number;
  side?: Side;
  slot?: number;
  forceSourceId?: string;
}

export interface PendingUnitTransformation {
  before: BattleUnit;
  after: BattleUnit;
  context: UnitTransformationContext;
  reason: "scripted" | "defeat";
  retainsBeforeUntilCommit: boolean;
  forceSourceId?: string;
}

const cloneBattleUnit = (unit: BattleUnit): BattleUnit => ({
  ...unit,
  statuses: { ...unit.statuses },
});

const clonePendingUnitTransformation = (
  pending: PendingUnitTransformation,
): PendingUnitTransformation => ({
  ...pending,
  before: cloneBattleUnit(pending.before),
  after: cloneBattleUnit(pending.after),
  context: { ...pending.context },
});

interface RangedPositionRisk {
  adjacentEnemyCount: number;
  meleeContactCount: number;
  meleeExpectedDamage: number;
}

const linePathKey = (path: readonly Position[]): string =>
  path.map(positionKey).join(";");

const compareFocusFireLife = (
  left: number | undefined,
  right: number | undefined,
): number => left !== undefined && right !== undefined ? left - right : 0;

const isDamagingActionId = (actionId: BattleActionId): boolean =>
  "damage" in BATTLE_ACTION_DEFINITIONS[actionId];

const isDirectFocusDamageActionId = (actionId: BattleActionId): boolean =>
  actionId === "archer-shot"
  || actionId === "crossbow-shot"
  || actionId === WATER_WARRIOR_SHOT_ACTION_ID
  || actionId === "fire-1"
  || actionId === "fire-2"
  || actionId === "fire-3"
  || actionId === "fire-4";

const compareExpertFocusRanking = (
  leftUtility: ExpertAiUtility,
  leftExpectedRemainingLife: number | undefined,
  rightUtility: ExpertAiUtility,
  rightExpectedRemainingLife: number | undefined,
): number => compareExpertAiPriorityBand(leftUtility, rightUtility)
  || compareFocusFireLife(leftExpectedRemainingLife, rightExpectedRemainingLife)
  || compareExpertAiUtility(leftUtility, rightUtility);

const cloneAiAction = (action: AlliedAiAction): AlliedAiAction => ({
  ...action,
  path: action.path.map((position) => ({ ...position })),
  ...(action.linePath ? {
    linePath: action.linePath.map((position) => ({ ...position })),
  } : {}),
});

const cloneExpertUtility = (utility: ExpertAiUtility): ExpertAiUtility => ({ ...utility });

export interface AiPlanningMetrics {
  movementMapBuilds: number;
  movementMapHits: number;
  actionRangeBuilds: number;
  actionRangeHits: number;
  utilityBuilds: number;
  utilityHits: number;
}

interface AiPlanningCache {
  signature: string;
  movementMaps: Map<string, MovementMap>;
  actionRanges: Map<string, NumericRangeMap>;
  shootingLinePaths: Map<string, readonly Position[][]>;
  utilities: Map<string, ExpertAiUtility>;
  plannedActions: Map<string, AlliedAiAction | undefined>;
  expert: ExpertAiEvaluationCache;
  metrics: AiPlanningMetrics;
}

const sameLinePath = (left: readonly Position[], right: readonly Position[]): boolean =>
  left.length === right.length
  && left.every((position, index) => {
    const other = right[index];
    return other !== undefined && positionKey(position) === positionKey(other);
  });

const ACTION_CLASSES: Readonly<Record<BattleActionId, readonly ClassId[]>> = {
  "archer-shot": ["archer"],
  "crossbow-shot": ["crossbow"],
  "magic-archer-shot": ["magic-archer"],
  [WATER_WARRIOR_SHOT_ACTION_ID]: ["water-warrior"],
  "fire-1": ["sister", "magician", "magic-priest", "priest"],
  "fire-2": ["magic-priest", "evil-mage"],
  "fire-3": ["evil-mage"],
  "fire-4": ["evil-mage"],
  "heal-1": ["sister", "monk", "prayer-guide", "magic-guide", "curse-master"],
  "heal-2": ["prayer-guide", "magic-guide"],
  "heal-3": ["magic-guide"],
  "lightning-1": ["magician", "magic-priest"],
  "lightning-2": ["magic-master"],
  "lightning-3": ["magic-master"],
  "lightning-4": ["magic-master"],
  "ice-1": ["magician"],
  "ice-2": ["wizard"],
  "ice-3": ["wizard"],
  "ice-4": ["wizard"],
  "recovery-1": ["monk", "magic-priest", "prayer-guide", "magic-guide", "priest"],
  "recovery-2": ["prayer-guide", "magic-guide"],
  "recovery-3": ["prayer-guide"],
  "attack-up": ["magic-guide"],
  "defense-up": ["prayer-guide"],
  "magic-guard": ["magic-guide"],
  "poison": ["curse-master"],
  "confusion": ["curse-master"],
  "attack-down": ["curse-master"],
  "defense-down": ["magic-priest"],
  "spell-seal": ["curse-master"],
  "prayer": ["prayer-guide"],
  "dispel": ["magic-priest"],
  "stomp-1": ["great-dragon-knight"],
  "stomp-2": ["great-dragon-knight"],
  "stomp-3": ["great-dragon-knight"],
  "iron-plate": ["engineer"],
  "obstacle": ["engineer"],
  wd: ["dragon", "empress"],
  [HALF_DRAGON_TELEPORT_ACTION_ID]: ["half-dragon-warrior"],
};

const isConstructionAction = (actionId: BattleActionId): actionId is ConstructionActionId =>
  actionId === "iron-plate" || actionId === "obstacle";

const canTargetFrozenUnit = (actionId: BattleActionId): boolean =>
  actionId === "attack-up" || actionId === "defense-up" || actionId === "magic-guard"
  || actionId === "poison" || actionId === "confusion" || actionId === "attack-down"
  || actionId === "defense-down"
  || actionId === "spell-seal"
  || actionId === "dispel";

function statusesEqual(left: UnitStatuses, right: UnitStatuses): boolean {
  return UNIT_STATUS_KEYS.every((key) => left[key] === right[key]);
}

const WATER_WARRIOR_SPLIT_ID = /:split-[1-3]$/u;

function waterWarriorRootId(unit: Pick<BattleUnit, "id" | "classId">): string | undefined {
  return unit.classId === "water-warrior"
    ? unit.id.replace(WATER_WARRIOR_SPLIT_ID, "")
    : undefined;
}

function applyActiveOrdinaryHitStatus(attacker: BattleUnit, defender: BattleUnit): void {
  const status = ordinaryHitStatusFor(attacker.classId);
  if (status && !isClassImmuneToOrdinaryHitStatus(defender.classId, status.key)) {
    defender.statuses[status.key] = status.counter;
  }
}

/**
 * `REMAKE-097`. Runs on the same active-attack-only boundary as the native
 * status hook above, so a counter-attacking demon dragon knight strips nothing.
 */
function stripTargetBuffsOnActiveHit(attacker: BattleUnit, defender: BattleUnit): void {
  if (!stripsTargetBuffsOnActiveHit(attacker.classId)) return;
  for (const key of STRIPPABLE_BUFF_KEYS) defender.statuses[key] = 0;
}

function canUseSpecialAction(
  actor: BattleUnit,
  actionId: BattleActionId,
): boolean {
  const tier = classTierFor(actor);
  const nativeTechniqueAction = techniqueActionIdsFor(actor).includes(actionId);
  if (actor.classId === "magic-priest") {
    if (actionId === "fire-1" && tier >= 3) return false;
    if (actionId === "fire-2" && tier < 3) return false;
    if (actionId === "lightning-1" && tier < 2) return false;
    if (actionId === "dispel" && tier < 3) return false;
  }
  if (actor.classId === "evil-mage") {
    if (actionId === "fire-2" && tier !== 1) return false;
    if (actionId === "fire-3" && tier !== 2) return false;
    if (actionId === "fire-4" && tier !== 3) return false;
  }
  if (actor.classId === "magic-master") {
    if (actionId === "lightning-2" && tier !== 1) return false;
    if (actionId === "lightning-3" && tier !== 2) return false;
    if (actionId === "lightning-4" && tier !== 3) return false;
  }
  if (actor.classId === "prayer-guide") {
    if (actionId === "heal-1" && tier >= 3) return false;
    if (actionId === "heal-2" && tier !== 3) return false;
    if (actionId === "recovery-1" && tier !== 1) return false;
    if (actionId === "recovery-2" && tier !== 2) return false;
    if (actionId === "recovery-3" && tier !== 3) return false;
    if (actionId === "prayer" && tier !== 3) return false;
  }
  if (actor.classId === "magic-guide") {
    if (actionId === "heal-1" && tier !== 1) return false;
    if (actionId === "heal-2" && tier !== 2) return false;
    if (actionId === "heal-3" && tier !== 3) return false;
    if (actionId === "recovery-1" && tier >= 3) return false;
    if (actionId === "recovery-2" && tier !== 3) return false;
    if (actionId === "magic-guard" && tier !== 3) return false;
  }
  if (actor.classId === "curse-master") {
    if (actionId === "poison" && tier < 2) return false;
    if (actionId === "spell-seal" && tier < 3) return false;
  }
  if ((actionId === "stomp-1" || actionId === "ice-2") && tier !== 1) return false;
  if (actionId === "ice-3" && tier !== 2) return false;
  if (actionId === "ice-4" && tier !== 3) return false;
  if (actionId === "stomp-2" && tier !== 2) return false;
  if (actionId === "stomp-3" && tier !== 3) return false;
  // A shooting action additionally has to be the one this actor's class grants
  // on this side, so a side-2 water warrior cannot reach the side-1-only shot
  // that ACTION_CLASSES lists for its class.
  const classGrantsAction = isShootingActionId(actionId)
    ? shootingActionIdFor(actor.classId, actor.side) === actionId
    : ACTION_CLASSES[actionId].includes(actor.classId);
  return !actor.acted
    && !actor.actionDisabled
    && (nativeTechniqueAction || classGrantsAction)
    && (isShootingActionId(actionId) || actor.statuses.techniqueSeal === 0);
}

export interface RouteMoveResult {
  path: Position[];
  destination: Position;
  reachedExit: boolean;
}

export type RestorableBattleSnapshot = Pick<
  SavedBattleState,
  "round" | "focusId" | "units" | "enemyAi"
> & Partial<Pick<SavedBattleState, "terrainOverrides">>;

export interface BattleScenario {
  stage: StageDefinition;
  width: number;
  height: number;
  terrainSlotAt: (position: Position) => number;
  dynamicTerrainSlots?: Readonly<Partial<Record<DynamicTerrainKind, number>>>;
  createUnits: (difficulty: Difficulty) => BattleUnit[];
  createCampaignRoster: (difficulty: Difficulty) => SaveRosterEntry[];
  /** Restricts which projected side-1 units write back to the campaign roster. */
  campaignUnitSlots?: readonly number[];
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  alliedBehaviorById?: ReadonlyMap<string, number>;
  enemyBehaviorById?: ReadonlyMap<string, number>;
  forces?: readonly ForceDefinition[];
  routePulses?: readonly RoutePulseDefinition[];
  escortRoutes?: readonly EscortRouteDefinition[];
  enemyPhaseTail?: EnemyPhaseTailDefinition;
  routeEnemy?: {
    target: Position;
    movement: number;
    isExit: (position: Position) => boolean;
  };
}

const STAGE0_BATTLE_SCENARIO: BattleScenario = {
  stage: STAGE0_DEFINITION,
  width: STAGE0_DEFINITION.width,
  height: STAGE0_DEFINITION.height,
  terrainSlotAt,
  dynamicTerrainSlots: {
    "iron-plate": STAGE0_IRON_PLATE_TERRAIN_SLOT,
    obstacle: STAGE0_OBSTACLE_TERRAIN_SLOT,
  },
  createUnits: createStage0Units,
  createCampaignRoster: (difficulty) => completeCampaignRoster(
    createStage0Units(difficulty)
      .filter(({ side }) => side === 1)
      .map(({ slot, classId, experience, life }) => ({ slot, classId, experience, life })),
  ),
  enemyClassPriority: STAGE0_AI_CLASS_PRIORITY,
  routeEnemy: {
    target: STAGE0.enemyRouteTarget,
    movement: STAGE0.enemyRouteMovement,
    isExit: isStage0Exit,
  },
};

export class Stage0Battle {
  readonly stage: StageDefinition;
  units: BattleUnit[];
  round = 1;
  focusId = "1:0";
  private readonly campaignRoster: SaveRosterEntry[];
  private campaignRecordCounters = Array<number>(75).fill(0);
  private readonly campaignUnitSlots: ReadonlySet<number>;
  protected readonly forces: ForceRegistry;
  private readonly routePulseByActorId: ReadonlyMap<string, RoutePulseDefinition>;
  private readonly escortRouteByActorId: ReadonlyMap<string, EscortRouteDefinition>;
  private readonly terrainOverrideByPosition = new Map<string, DynamicTerrainKind>();
  private readonly expertAiTraceByUnitId = new Map<string, ExpertAiDecisionTrace>();
  private readonly pendingTransformations: PendingUnitTransformation[] = [];
  private aiPlanningCache?: AiPlanningCache;
  private activeAiPlanningCache?: AiPlanningCache;

  constructor(
    public readonly difficulty: Difficulty = 0,
    public readonly rng = new DeterministicRng(),
    protected readonly scenario: BattleScenario = STAGE0_BATTLE_SCENARIO,
  ) {
    this.stage = scenario.stage;
    this.units = scenario.createUnits(difficulty);
    this.forces = new ForceRegistry(scenario.forces ?? [], this.units);
    const routePulseByActorId = new Map<string, RoutePulseDefinition>();
    for (const definition of scenario.routePulses ?? []) {
      if (routePulseByActorId.has(definition.actorId)) {
        throw new Error(`Duplicate route pulse actor ${definition.actorId}`);
      }
      assertRoutePulseDefinition(definition, this.units);
      const force = this.forces.definitionForUnit(definition.actorId);
      if (force && force.control !== "independent-ai") {
        throw new Error(`Route pulse actor ${definition.actorId} must use independent AI control`);
      }
      routePulseByActorId.set(definition.actorId, definition);
    }
    this.routePulseByActorId = routePulseByActorId;
    const escortRouteByActorId = new Map<string, EscortRouteDefinition>();
    for (const definition of scenario.escortRoutes ?? []) {
      if (escortRouteByActorId.has(definition.actorId)) {
        throw new Error(`Duplicate escort route actor ${definition.actorId}`);
      }
      assertEscortRouteDefinition(definition, this.units, scenario);
      const force = this.forces.definitionForUnit(definition.actorId);
      if (!force || force.control !== "independent-ai") {
        throw new Error(`Escort route actor ${definition.actorId} must use independent AI control`);
      }
      escortRouteByActorId.set(definition.actorId, definition);
    }
    this.escortRouteByActorId = escortRouteByActorId;
    this.campaignRoster = scenario.createCampaignRoster(difficulty);
    this.campaignUnitSlots = new Set(
      scenario.campaignUnitSlots
        ?? this.units.filter(({ side }) => side === 1).map(({ slot }) => slot),
    );
  }

  /**
   * Cache identity deliberately derives from the public mutable simulation
   * state instead of relying on callers to announce mutations. Tests, stage
   * scripts and save restoration may replace or edit units directly; any
   * rules-significant change therefore invalidates the cache automatically.
   */
  private aiPlanningStateSignature(): string {
    const terrain = [...this.terrainOverrideByPosition]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, kind]) => `${key}:${kind}`)
      .join(";");
    const units = this.units.map((unit) => [
      unit.id,
      unit.side,
      unit.slot,
      unit.classId,
      unit.experience,
      unit.x,
      unit.y,
      unit.life,
      Number(unit.acted),
      Number(unit.actionDisabled),
      this.alliedBehaviorFor(unit.id),
      this.enemyBehaviorFor(unit.id),
      ...UNIT_STATUS_KEYS.map((key) => unit.statuses[key]),
    ].join(",")).join("|");
    return `${this.round}/${this.rng.state}/${this.rng.calls}/${terrain}/${units}`;
  }

  private createAiPlanningCache(signature: string): AiPlanningCache {
    return {
      signature,
      movementMaps: new Map(),
      actionRanges: new Map(),
      shootingLinePaths: new Map(),
      utilities: new Map(),
      plannedActions: new Map(),
      expert: {
        exposureByKey: new Map(),
        effectRangeByKey: new Map(),
        selectionPathByKey: new Map(),
        targetThreatByUnitId: new Map(),
      },
      metrics: {
        movementMapBuilds: 0,
        movementMapHits: 0,
        actionRangeBuilds: 0,
        actionRangeHits: 0,
        utilityBuilds: 0,
        utilityHits: 0,
      },
    };
  }

  private withAiPlanningCache<T>(operation: () => T): T {
    if (this.activeAiPlanningCache) return operation();
    const signature = this.aiPlanningStateSignature();
    const cache = this.aiPlanningCache?.signature === signature
      ? this.aiPlanningCache
      : this.createAiPlanningCache(signature);
    this.aiPlanningCache = cache;
    this.activeAiPlanningCache = cache;
    try {
      return operation();
    } finally {
      this.activeAiPlanningCache = undefined;
    }
  }

  aiPlanningDiagnostics(): AiPlanningDiagnostics {
    const cache = this.aiPlanningCache;
    return {
      movementMapBuilds: cache?.metrics.movementMapBuilds ?? 0,
      movementMapHits: cache?.metrics.movementMapHits ?? 0,
      actionRangeBuilds: cache?.metrics.actionRangeBuilds ?? 0,
      actionRangeHits: cache?.metrics.actionRangeHits ?? 0,
      utilityBuilds: cache?.metrics.utilityBuilds ?? 0,
      utilityHits: cache?.metrics.utilityHits ?? 0,
      movementMapEntries: cache?.movementMaps.size ?? 0,
      actionRangeEntries: cache?.actionRanges.size ?? 0,
      utilityEntries: cache?.utilities.size ?? 0,
    };
  }

  private movementMapFor(unit: BattleUnit, movementBudget: number): MovementMap {
    const cache = this.activeAiPlanningCache;
    if (!cache) return movementMap(unit, this.units, this.dynamicBattlefield, movementBudget);
    const key = `${unit.id}:${movementBudget}`;
    const cached = cache.movementMaps.get(key);
    if (cached) {
      cache.metrics.movementMapHits += 1;
      return cached;
    }
    const result = movementMap(unit, this.units, this.dynamicBattlefield, movementBudget);
    cache.movementMaps.set(key, result);
    cache.metrics.movementMapBuilds += 1;
    return result;
  }

  private planningActionRange(
    actor: Pick<BattleUnit, "x" | "y" | "classId">,
    seed: number,
    shooting: boolean,
  ): NumericRangeMap {
    const cache = this.activeAiPlanningCache;
    const key = `${shooting ? "shoot" : "technique"}:${actor.classId}:${actor.x},${actor.y}:${seed}`;
    const cached = cache?.actionRanges.get(key);
    if (cached && cache) {
      cache.metrics.actionRangeHits += 1;
      return cached;
    }
    const battlefield = this.dynamicBattlefield;
    const range = shooting
      ? shootingRange(actor, battlefield, seed)
      : techniqueSelectionRange(actor, battlefield, seed);
    if (cache) {
      cache.actionRanges.set(key, range);
      cache.metrics.actionRangeBuilds += 1;
    }
    return range;
  }

  private planningShootingLinePaths(
    actor: Pick<BattleUnit, "x" | "y" | "classId">,
    target: Position,
    actionId: Extract<BattleActionId, "magic-archer-shot">,
  ): readonly Position[][] {
    const seed = BATTLE_ACTION_DEFINITIONS[actionId].range.nativeSeed;
    const cache = this.activeAiPlanningCache;
    const key = `${actionId}:${actor.classId}:${actor.x},${actor.y}:${target.x},${target.y}:${seed}`;
    const cached = cache?.shootingLinePaths.get(key);
    if (cached) return cached;
    const paths = shootingLinePaths(actor, target, this.dynamicBattlefield, seed);
    cache?.shootingLinePaths.set(key, paths);
    return paths;
  }

  protected canUseSpecialAction(actor: BattleUnit, actionId: BattleActionId): boolean {
    return canUseSpecialAction(actor, actionId);
  }

  protected allowsUnboundedSpecialTarget(
    _actor: BattleUnit,
    _target: BattleUnit | undefined,
    _actionId: BattleActionId,
  ): boolean {
    return false;
  }

  protected specialActionResolutionRng(
    _actor: BattleUnit,
    _target: BattleUnit | undefined,
    _intent: BattleActionIntent,
  ): DeterministicRng {
    return this.rng;
  }

  static fromCampaignEntry(campaign: CampaignState): Stage0Battle {
    const battle = new Stage0Battle(
      campaign.difficulty,
      new DeterministicRng(campaign.rngState, campaign.rngCalls),
    );
    const rosterBySlot = new Map(campaign.roster.map((entry) => [entry.slot, entry]));
    for (const unit of battle.units) {
      if (unit.side !== 1) continue;
      const entry = rosterBySlot.get(unit.slot);
      if (!entry) continue;
      const followsClassPortrait = unit.portrait
        === classFallbackPortraitFor(unit.classId, unit.side);
      unit.classId = entry.classId;
      unit.className = className(entry.classId);
      if (followsClassPortrait) {
        unit.portrait = classFallbackPortraitFor(entry.classId, unit.side) ?? unit.portrait;
      }
      unit.experience = entry.experience;
      // 与 `createInheritedAlly` 同一条原版规则：新战入场重建属性后当前生命回满。
      unit.life = statsFor(unit, campaign.difficulty).maxLife;
    }
    battle.campaignRoster.splice(
      0,
      battle.campaignRoster.length,
      ...completeCampaignRoster(campaign.roster),
    );
    battle.setCampaignRecordCounters(campaign.recordCounters);
    return battle;
  }

  setCampaignRecordCounters(counters: readonly number[] | undefined): void {
    this.campaignRecordCounters = Array.from(
      { length: 75 },
      (_, slot) => Math.max(0, Math.trunc(counters?.[slot] ?? 0)),
    );
  }

  /**
   * Native 0000:9252 indexes KILL_ALL with `DS:31CB`, the acting unit's own
   * slot, and applies no campaign-membership test, so a side-1 unit that only
   * exists for one stage — stage 20's 守護者 in slot 32 is the campaign's one
   * controllable case — still records its kills.
   *
   * The same instruction has no side test either, so in DOS an enemy kill wrote
   * to the one shared 75-entry array under the enemy's own slot and inflated the
   * same-numbered ally's 戰績 card and the epilogue total. REMAKE-088 treats that
   * as an original bug and keeps the counters to side 1; `legacyStrict` is where
   * the native write belongs.
   */
  private isCampaignRecordSlot(unit: BattleUnit): boolean {
    return unit.side === 1
      && unit.slot >= 0
      && unit.slot < this.campaignRecordCounters.length;
  }

  restore(
    snapshot: RestorableBattleSnapshot,
    campaignRoster?: readonly SaveRosterEntry[],
  ): void {
    this.pendingTransformations.splice(0);
    this.round = snapshot.round;
    this.focusId = snapshot.focusId;
    this.units = snapshot.units.map((unit) => ({
      ...unit,
      // 通用单位的显示名由职业与槽位派生（`REMAKE-107`），所以旧存档里停在上一个
      // 职业、或还没有槽字母的 `name` 在这里重新写正，而不是当作真值恢复。
      ...(unit.side === 1 && usesClassIdentity(unit) ? { name: genericUnitName(unit) } : {}),
      statuses: { ...unit.statuses },
    }));
    this.restoreWaterWarriorGroups();
    this.terrainOverrideByPosition.clear();
    for (const override of snapshot.terrainOverrides ?? []) {
      if (
        override.x < 0
        || override.y < 0
        || override.x >= this.stage.width
        || override.y >= this.stage.height
        || this.scenario.dynamicTerrainSlots?.[override.kind] === undefined
        || this.scenario.terrainSlotAt(override) === 0
        || this.terrainOverrideByPosition.has(positionKey(override))
      ) throw new Error("invalid saved dynamic terrain override");
      this.terrainOverrideByPosition.set(positionKey(override), override.kind);
    }
    this.restoreDerivedForceMemberships();
    this.forces.assertKnownUnits(this.units);
    if (campaignRoster) {
      this.campaignRoster.splice(
        0,
        this.campaignRoster.length,
        ...completeCampaignRoster(campaignRoster),
      );
    }
  }

  /** Rebuild force membership for stage-owned units created after battle setup. */
  protected restoreDerivedForceMemberships(): void {}

  get focus(): BattleUnit | undefined {
    return this.unit(this.focusId);
  }

  get groupCommander(): BattleUnit | undefined {
    const commanderId = this.forces.commanderId();
    return commanderId ? this.unit(commanderId) : undefined;
  }

  unit(id: string): BattleUnit | undefined {
    return this.units.find((unit) => unit.id === id);
  }

  unitAt(position: Position): BattleUnit | undefined {
    return this.units.find((unit) => unit.x === position.x && unit.y === position.y);
  }

  private waterWarriorGroup(unit: BattleUnit): BattleUnit[] {
    const rootId = waterWarriorRootId(unit);
    if (!rootId) return [unit];
    return this.units.filter((candidate) =>
      candidate.side === unit.side
      && candidate.slot === unit.slot
      && waterWarriorRootId(candidate) === rootId);
  }

  private orderedSharedUnitGroup(unit: BattleUnit): BattleUnit[] {
    return [
      unit,
      ...this.waterWarriorGroup(unit).filter(({ id }) => id !== unit.id),
    ];
  }

  private synchronizeWaterWarriorState(source: BattleUnit): void {
    for (const unit of this.waterWarriorGroup(source)) {
      if (unit.id === source.id) continue;
      unit.life = source.life;
      unit.experience = source.experience;
      unit.actionDisabled = source.actionDisabled;
      unit.statuses = { ...source.statuses };
    }
  }

  private setSharedLife(unit: BattleUnit, life: number): void {
    unit.life = Math.max(0, Math.min(this.statsFor(unit).maxLife, life));
    this.synchronizeWaterWarriorState(unit);
  }

  private removeSharedUnit(unit: BattleUnit): void {
    const replacement = this.replacementForDefeatedUnit(unit);
    const ids = new Set(this.waterWarriorGroup(unit).map(({ id }) => id));
    this.units = this.units.filter((candidate) => !ids.has(candidate.id));
    if (replacement) {
      this.pendingTransformations.push({
        ...replacement,
        before: cloneBattleUnit(unit),
        reason: "defeat",
        retainsBeforeUntilCommit: false,
      });
    }
  }

  protected replacementForDefeatedUnit(
    _unit: BattleUnit,
  ): Omit<PendingUnitTransformation, "before" | "reason" | "retainsBeforeUntilCommit"> | undefined {
    return undefined;
  }

  protected transformedUnit(source: BattleUnit, target: UnitTransformationTarget): BattleUnit {
    const side = target.side ?? source.side;
    const slot = target.slot ?? source.slot;
    const portrait = target.portrait
      ?? classFallbackPortraitFor(target.classId, side)
      ?? source.portrait;
    const unit: BattleUnit = {
      id: `${side}:${slot}`,
      side,
      slot,
      classId: target.classId,
      className: className(target.classId),
      name: target.name,
      portrait,
      ...(target.displayIdentity ? { displayIdentity: target.displayIdentity } : {}),
      x: source.x,
      y: source.y,
      life: 0,
      experience: target.experience,
      acted: source.acted,
      actionDisabled: false,
      statuses: emptyUnitStatuses(),
    };
    unit.life = this.statsFor(unit).maxLife;
    return unit;
  }

  queueUnitFormTransition(
    actorId: string,
    target: UnitTransformationTarget,
    context: UnitTransformationContext,
  ): PendingUnitTransformation {
    if (this.pendingTransformations.length > 0) {
      throw new Error("another unit transformation is already pending");
    }
    const before = this.unit(actorId);
    if (!before) throw new Error(`missing unit transformation actor ${actorId}`);
    const pending: PendingUnitTransformation = {
      before: cloneBattleUnit(before),
      after: this.transformedUnit(before, target),
      context: { ...context },
      reason: "scripted",
      retainsBeforeUntilCommit: true,
      ...(target.forceSourceId ? { forceSourceId: target.forceSourceId } : {}),
    };
    this.pendingTransformations.push(pending);
    return clonePendingUnitTransformation(pending);
  }

  get pendingUnitTransformations(): readonly PendingUnitTransformation[] {
    return this.pendingTransformations.map(clonePendingUnitTransformation);
  }

  commitNextUnitTransformation(): PendingUnitTransformation {
    const pending = this.pendingTransformations.shift();
    if (!pending) throw new Error("no unit transformation is pending");
    if (pending.retainsBeforeUntilCommit) {
      const index = this.units.findIndex(({ id }) => id === pending.before.id);
      const current = index >= 0 ? this.units[index] : undefined;
      if (!current
        || current.classId !== pending.before.classId
        || current.x !== pending.before.x
        || current.y !== pending.before.y) {
        throw new Error("stale scripted unit transformation");
      }
      this.units.splice(index, 1);
    }
    if (this.unit(pending.after.id) || this.unitAt(pending.after)) {
      throw new Error("unit transformation destination is occupied");
    }
    if (pending.forceSourceId && pending.after.id !== pending.before.id) {
      this.forces.inheritUnit(pending.forceSourceId, pending.after.id);
    }
    this.units.push(cloneBattleUnit(pending.after));
    this.recordCampaignUnit(pending.after);
    this.focusId = pending.after.id;
    return clonePendingUnitTransformation(pending);
  }

  private restoreWaterWarriorGroups(): void {
    const groups = new Map<string, BattleUnit[]>();
    for (const unit of this.units) {
      const rootId = waterWarriorRootId(unit);
      if (!rootId) continue;
      const group = groups.get(rootId) ?? [];
      group.push(unit);
      groups.set(rootId, group);
      if (unit.id !== rootId) this.forces.inheritUnit(rootId, unit.id);
    }
    for (const [rootId, group] of groups) {
      const root = group.find(({ id }) => id === rootId);
      if (!root || group.length > 4 || group.some((unit) =>
        unit.side !== root.side
        || unit.slot !== root.slot
        || unit.life !== root.life
        || unit.experience !== root.experience
        || unit.actionDisabled !== root.actionDisabled
        || !statusesEqual(unit.statuses, root.statuses))) {
        throw new Error(`invalid restored water-warrior group ${rootId}`);
      }
    }
  }

  private splitWaterWarrior(defender: BattleUnit): BattleUnit | undefined {
    const rootId = waterWarriorRootId(defender);
    if (!rootId || this.waterWarriorGroup(defender).length >= 4) return undefined;
    const candidates = [
      { x: defender.x, y: defender.y - 1 },
      { x: defender.x, y: defender.y + 1 },
      { x: defender.x - 1, y: defender.y },
      { x: defender.x + 1, y: defender.y },
    ];
    const destination = candidates.find((position) =>
      position.x >= 0
      && position.y >= 0
      && position.x < this.stage.width
      && position.y < this.stage.height
      && !this.unitAt(position)
      && movementCost(defender.classId, position, this.dynamicBattlefield) < 98);
    if (!destination) return undefined;
    const splitIndex = [1, 2, 3].find((index) => !this.unit(`${rootId}:split-${index}`));
    if (!splitIndex) return undefined;
    const split: BattleUnit = {
      ...defender,
      id: `${rootId}:split-${splitIndex}`,
      x: destination.x,
      y: destination.y,
      statuses: { ...defender.statuses },
    };
    this.units.push(split);
    this.forces.inheritUnit(defender.id, split.id);
    return split;
  }

  terrainSlotAt(position: Position): number {
    const kind = this.terrainOverrideByPosition.get(positionKey(position));
    return kind === undefined
      ? this.scenario.terrainSlotAt(position)
      : this.scenario.dynamicTerrainSlots?.[kind] ?? 0;
  }

  terrainKindAt(position: Position): DynamicTerrainKind | undefined {
    return this.terrainOverrideByPosition.get(positionKey(position));
  }

  get terrainOverrides(): readonly DynamicTerrainOverride[] {
    return [...this.terrainOverrideByPosition]
      .map(([key, kind]) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y, kind };
      })
      .sort((left, right) => left.y * this.stage.width + left.x
        - (right.y * this.stage.width + right.x));
  }

  private get dynamicBattlefield(): GridBattlefield {
    return {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt: (position) => this.terrainSlotAt(position),
    };
  }

  enemyBehaviorFor(id: string): number {
    return this.scenario.enemyBehaviorById?.get(id) ?? 0;
  }

  alliedBehaviorFor(id: string): number {
    return this.scenario.alliedBehaviorById?.get(id) ?? 0;
  }

  isPlayerControllableAlly(id: string): boolean {
    const unit = this.unit(id);
    if (unit?.side !== 1) return false;
    const forceControl = this.forces.controlForUnit(id);
    if (forceControl) return forceControl === "player";
    return !this.forces.hasExplicitDefinitions() && this.alliedBehaviorFor(id) === 0;
  }

  forceForUnit(id: string): ForceDefinition | undefined {
    return this.forces.definitionForUnit(id);
  }

  playerManualPhaseComplete(): boolean {
    return this.units
      .filter(({ id }) => this.isPlayerControllableAlly(id))
      .every(({ acted, actionDisabled }) => acted || actionDisabled);
  }

  allPlayerControllableAlliesFrozen(): boolean {
    const controllable = this.units.filter(({ id }) => this.isPlayerControllableAlly(id));
    return controllable.length > 0 && controllable.every(({ actionDisabled }) => actionDisabled);
  }

  enemyAiIntentFor(_id: string): EnemyAiIntent | undefined {
    const unit = this.unit(_id);
    if (!unit || unit.side !== 2) return undefined;
    return this.scenario.routeEnemy ? "route" : undefined;
  }

  beginEnemyPhase(): EnemyPhaseUpdate {
    return { activatedGroupIds: [] };
  }

  promotionQueue(): string[] {
    return promotionQueue(this.units, this.stage.width);
  }

  promote(id: string, targetClassId: ClassId): PromotionCommitResult {
    const unit = this.unit(id);
    if (!unit) throw new Error("轉職單位已不在戰場");
    this.focusId = id;
    return promoteUnit(unit, targetClassId);
  }

  statsFor(unit: Pick<BattleUnit, "classId" | "experience" | "side">): UnitStats {
    return statsFor(unit, this.difficulty);
  }

  effectiveStatsFor(unit: BattleUnit): UnitStats {
    const base = this.statsFor(unit);
    return {
      ...base,
      attack: effectiveAttack(base.attack, unit.statuses),
      defense: effectiveDefense(base.defense, unit.statuses),
    };
  }

  moveUnit(id: string, destination: Position): boolean {
    const unit = this.unit(id);
    const path = this.movementPath(id, destination);
    if (!unit || path.length === 0) return false;
    unit.x = destination.x;
    unit.y = destination.y;
    this.focusId = id;
    return true;
  }

  movementPath(id: string, destination: Position): Position[] {
    const unit = this.unit(id);
    const occupant = this.unitAt(destination);
    if (!unit || unit.acted || unit.actionDisabled || (occupant && occupant.id !== unit.id)) return [];
    return this.movementMapFor(unit, this.statsFor(unit).movement).pathTo(destination);
  }

  canUseFlyingDragonExtraMove(result: AttackResult): boolean {
    const unit = this.unit(result.attackerId);
    return unit?.classId === "flying-dragon-knight"
      && unit.acted
      && !unit.actionDisabled
      && !result.attackerDied;
  }

  /**
   * Native class 0F clears the spent-action bit while building this second
   * range map. Keep that exception explicit so ordinary movement still rejects
   * acted units everywhere else.
   */
  extraMovementPath(id: string, destination: Position): Position[] {
    const unit = this.unit(id);
    const occupant = this.unitAt(destination);
    if (
      !unit
      || unit.classId !== "flying-dragon-knight"
      || !unit.acted
      || unit.actionDisabled
      || (occupant && occupant.id !== unit.id)
    ) return [];
    const movementBudget = Math.floor(this.statsFor(unit).movement / 2);
    return findMovementPath(
      unit,
      destination,
      this.units,
      this.dynamicBattlefield,
      movementBudget,
    );
  }

  extraMovementRange(id: string): Position[] {
    const unit = this.unit(id);
    if (
      !unit
      || unit.classId !== "flying-dragon-knight"
      || !unit.acted
      || unit.actionDisabled
    ) return [];
    return this.reachableCells(id, Math.floor(this.statsFor(unit).movement / 2));
  }

  moveUnitStep(id: string, destination: Position, allowFriendlyTransit = false): boolean {
    const unit = this.unit(id);
    const occupant = this.unitAt(destination);
    if (
      !unit
      || manhattan(unit, destination) !== 1
      || (occupant && (!allowFriendlyTransit || occupant.side !== unit.side))
      || movementCost(unit.classId, destination, this.dynamicBattlefield) >= 98
    ) return false;
    unit.x = destination.x;
    unit.y = destination.y;
    this.focusId = id;
    return true;
  }

  reachableCells(id: string, movementBudget?: number): Position[] {
    const unit = this.unit(id);
    if (!unit) return [];
    const budget = movementBudget ?? this.statsFor(unit).movement;
    return this.movementMapFor(unit, budget).cells.map((position) => ({ ...position }));
  }

  scriptedPath(id: string, destination: Position, movementBudget: number): Position[] {
    const unit = this.unit(id);
    if (!unit) return [];
    return shortestPath(
      unit,
      destination,
      unit.classId,
      movementBudget,
      this.units.filter((candidate) => candidate.id !== unit.id),
      this.dynamicBattlefield,
    );
  }

  attack(attackerId: string, defenderId: string): AttackResult {
    const attacker = this.unit(attackerId);
    const defender = this.unit(defenderId);
    if (!attacker
      || !defender
      || attacker.side === defender.side
      || attacker.acted
      || attacker.actionDisabled
      || defender.actionDisabled
      || manhattan(attacker, defender) !== 1) {
      throw new Error("illegal ordinary attack");
    }
    this.onHostileTargeted(attacker, defender);

    const attackerGroup = this.orderedSharedUnitGroup(attacker);
    const defenderGroup = this.orderedSharedUnitGroup(defender);

    const attackerStats = this.effectiveStatsFor(attacker);
    const defenderStats = this.effectiveStatsFor(defender);
    const terrainDefense = Math.floor(
      defenderStats.defense
      * terrainDefensePercentFor(defender.classId, this.terrainSlotAt(defender))
      / 100,
    );
    // REMAKE-100 mitigates against the defender's life *before* this hit lands.
    const damage = mitigateOrdinaryDamage(
      defender,
      defenderStats.maxLife,
      Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense)
        + this.rng.between(4, 7)
        + this.rng.between(4, 7),
    );
    this.setSharedLife(defender, defender.life - damage);

    const counterOccurred = defender.life > 0
      && !defender.actionDisabled
      && !suppressesOrdinaryCounterFor(attacker.classId);
    let counterDamage = 0;
    if (counterOccurred) {
      const attackerTerrainDefense = Math.floor(
        attackerStats.defense
        * terrainDefensePercentFor(attacker.classId, this.terrainSlotAt(attacker))
        / 100,
      );
      const normalCounter = Math.floor(
        Math.max(0, defenderStats.attack - attackerStats.defense - attackerTerrainDefense) / 2,
      );
      // REMAKE-098: the bone knight's native reflect was a ~50% PIT coin flip
      // that *overwrote* the normal counter, so it could roll in below it. It is
      // now deterministic and takes the better of the two, which is also what
      // the expert AI has always assumed as worst case.
      const rawCounter = defender.classId === "bone-knight"
        ? Math.max(damage, normalCounter)
        : normalCounter;
      counterDamage = mitigateOrdinaryDamage(attacker, attackerStats.maxLife, rawCounter);
      this.setSharedLife(attacker, attacker.life - counterDamage);
    }
    // Native 0000:92DC applies the class status once from the original
    // attacker/defender pair; the counter branch only resolves damage.
    applyActiveOrdinaryHitStatus(attacker, defender);
    stripTargetBuffsOnActiveHit(attacker, defender);
    this.synchronizeWaterWarriorState(defender);

    const defenderDied = defender.life === 0;
    const attackerDied = attacker.life === 0;
    const reward = killRewardFor(defender.classId, defender.side);
    const baseExperience = defenderDied
      ? reward + this.rng.between(4, 7)
      : defenderStats.level + this.rng.between(4, 7);
    const experienceGained = baseExperience * (defenderDied ? defenderGroup.length : 1);
    attacker.experience += experienceGained;
    // Native module 29 applies the primary damage at 0000:91DE and then splits
    // the experience path at 0000:91FE on whether the defender's board cell is
    // still occupied: a surviving defender takes 0000:9200 and returns at
    // 0000:921B, while a killed one takes 0000:921C, which pays the kill reward
    // and ends with the only KILL_ALL write in the module
    // (0000:9252-9260, `KILL_ALL[DS:31CB] += 1`). So this is a kill count for
    // the initiating slot, not an attack count. The mirrored counter-attack
    // routine at 0000:9161 has the same kill split and no such tail, and shots
    // and techniques never reach this resolution at all.
    if (defenderDied && this.isCampaignRecordSlot(attacker)) {
      this.campaignRecordCounters[attacker.slot] += 1;
    }
    this.synchronizeWaterWarriorState(attacker);
    const counterExperienceBase = counterOccurred
      ? attackerDied
        ? killRewardFor(attacker.classId, attacker.side) + this.rng.between(4, 7)
        : Math.floor((attackerStats.level + this.rng.between(4, 7)) / 2)
      : 0;
    const counterExperienceGained = counterExperienceBase
      * (attackerDied ? attackerGroup.length : 1);
    defender.experience += counterExperienceGained;
    this.synchronizeWaterWarriorState(defender);
    attacker.acted = true;
    this.recordCampaignUnit(attacker);
    this.recordCampaignUnit(defender);

    if (defenderDied) this.removeSharedUnit(defender);
    if (attackerDied) this.removeSharedUnit(attacker);
    const splitUnit = defenderDied ? undefined : this.splitWaterWarrior(defender);
    this.focusId = this.unit(attackerId) ? attackerId : defenderId;

    return {
      attackerId,
      defenderId,
      damage,
      counterDamage,
      counterOccurred,
      defenderDied,
      attackerDied,
      experienceGained,
      counterExperienceGained,
      ...(defenderDied ? {
        defenderDeathTargets: defenderGroup.map(({ id, x, y }) => ({ id, x, y })),
      } : {}),
      ...(attackerDied ? {
        attackerDeathTargets: attackerGroup.map(({ id, x, y }) => ({ id, x, y })),
      } : {}),
      ...(splitUnit ? {
        splitUnitId: splitUnit.id,
        splitCount: this.waterWarriorGroup(defender).length,
      } : {}),
    };
  }

  actionRange(actorId: string, actionId: BattleActionId): NumericRangeMap {
    const actor = this.unit(actorId);
    if (!actor || !this.canUseSpecialAction(actor, actionId)) {
      return new NumericRangeMap(this.stage.width, this.stage.height);
    }
    const battlefield = this.dynamicBattlefield;
    if (isConstructionAction(actionId)) {
      const result = new NumericRangeMap(this.stage.width, this.stage.height);
      for (const position of constructionReachableCells(actor, this.units, battlefield)) {
        result.set(position, 1);
      }
      return result;
    }
    if (isShootingActionId(actionId)) {
      return shootingRange(actor, battlefield, BATTLE_ACTION_DEFINITIONS[actionId].range.nativeSeed);
    }
    // The native `1N` handler writes seed 200 into the same mode-`0` builder
    // the tiered techniques use, so it shares this propagation and only differs
    // in reach.
    if (actionId === HALF_DRAGON_TELEPORT_ACTION_ID) {
      return techniqueSelectionRange(
        actor,
        battlefield,
        BATTLE_ACTION_DEFINITIONS[actionId].range.nativeSeed,
      );
    }
    if (BATTLE_ACTION_DEFINITIONS[actionId].target === "self-area") {
      const result = new NumericRangeMap(this.stage.width, this.stage.height);
      result.set(actor, 1);
      return result;
    }
    return techniqueSelectionRange(
      actor,
      battlefield,
      BATTLE_ACTION_DEFINITIONS[actionId].range.selectionRadius,
    );
  }

  /**
   * The native handler hands the chosen cell to the ordinary movement
   * predecessor walk, so the actor flies a real path instead of blinking. The
   * walk follows the same mode-`0` gradient and may cross occupied cells.
   * `techniqueSelectionPath` builds it target-first the way the native buffer
   * does; the release replays that buffer backwards, so this returns the
   * actor-first order the movement presentation consumes.
   */
  directTechniquePath(actorId: string, destination: Position): Position[] {
    const actor = this.unit(actorId);
    if (!actor || !this.canUseSpecialAction(actor, HALF_DRAGON_TELEPORT_ACTION_ID)) return [];
    return techniqueSelectionPath(
      actor,
      destination,
      this.dynamicBattlefield,
      BATTLE_ACTION_DEFINITIONS[HALF_DRAGON_TELEPORT_ACTION_ID].range.nativeSeed,
    ).reverse();
  }

  actionTargetCells(actorId: string, actionId: BattleActionId): Position[] {
    const actor = this.unit(actorId);
    if (!actor || !this.canUseSpecialAction(actor, actionId)) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const range = this.actionRange(actorId, actionId);
    if (isConstructionAction(actionId)) return range.cells();
    if (definition.target === "empty-cell") {
      return range.cells().filter((position) => !this.unitAt(position));
    }
    if (definition.target === "self-area") return [{ x: actor.x, y: actor.y }];
    return this.units
      .filter((target) => range.valueAt(target) > 0
        && (definition.target === "ally"
          ? target.side === actor.side
          : target.side !== actor.side)
        && (canTargetFrozenUnit(actionId) || !target.actionDisabled))
      .map(({ x, y }) => ({ x, y }));
  }

  actionTargets(actorId: string, actionId: BattleActionId): BattleUnit[] {
    const actor = this.unit(actorId);
    if (!actor || !this.canUseSpecialAction(actor, actionId)) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    if (isConstructionAction(actionId) || definition.target === "empty-cell") return [];
    if (definition.target === "self-area") return [];
    const range = this.actionRange(actorId, actionId);
    return this.units.filter((target) =>
      range.valueAt(target) > 0
      && (definition.target === "ally"
        ? target.side === actor.side
        : target.side !== actor.side)
      && (canTargetFrozenUnit(actionId) || !target.actionDisabled));
  }

  magicArcherLineOptions(actorId: string, targetId: string): MagicArcherLineOption[] {
    const actor = this.unit(actorId);
    const target = this.unit(targetId);
    if (!actor || !target
      || actor.classId !== "magic-archer"
      || actor.side === target.side
      || target.actionDisabled
      || this.actionRange(actor.id, "magic-archer-shot").valueAt(target) === 0) return [];
    const context = this.expertAiEvaluationContext();
    const movementPath = [{ x: actor.x, y: actor.y }];
    const definition = BATTLE_ACTION_DEFINITIONS["magic-archer-shot"];
    return shootingLinePaths(
      actor,
      target,
      this.dynamicBattlefield,
      definition.range.nativeSeed,
    ).map((path) => {
      const utility = expertSpecialUtility(
        context,
        actor,
        "magic-archer-shot",
        target,
        movementPath,
        path,
      );
      const affectedUnitIds = path.slice(1).flatMap((position) => {
        const unit = this.unitAt(position);
        return unit && unit.side !== actor.side && !unit.actionDisabled ? [unit.id] : [];
      });
      return {
        path,
        affectedUnitIds,
        guaranteedKills: utility.guaranteedKills,
        expectedDamage: utility.effectiveDamage,
        targetThreat: utility.targetThreat,
        support: utility.support,
      };
    }).sort((left, right) => right.guaranteedKills - left.guaranteedKills
      || right.expectedDamage - left.expectedDamage
      || right.targetThreat - left.targetThreat
      || right.support - left.support
      || linePathKey(left.path).localeCompare(linePathKey(right.path)))
      .map(({ support: _support, ...option }) => option);
  }

  prepareSpecialAction(intent: BattleActionIntent): PreparedBattleAction {
    if (isConstructionAction(intent.actionId)) throw new Error("construction uses its own prepare path");
    const actor = this.unit(intent.actorId);
    const target = intent.targetId ? this.unit(intent.targetId) : undefined;
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    const requestedCenter = intent.target ?? (target ? { x: target.x, y: target.y } : undefined);
    const selfCentered = definition.target === "self-area";
    const requiresTargetUnit = definition.target === "ally" || definition.target === "enemy";
    const center = selfCentered && actor
      ? { x: actor.x, y: actor.y }
      : requestedCenter;
    const legalCell = selfCentered
      ? Boolean(actor
        && !intent.targetId
        && (!intent.target || (intent.target.x === actor.x && intent.target.y === actor.y)))
      : Boolean(center && actor && (this.allowsUnboundedSpecialTarget(actor, target, intent.actionId)
        || this.actionTargetCells(intent.actorId, intent.actionId)
          .some(({ x, y }) => x === center.x && y === center.y)));
    if (
      !actor
      || !center
      || !this.canUseSpecialAction(actor, intent.actionId)
      || !legalCell
      || (requiresTargetUnit && !target)
    ) {
      throw new Error("illegal special action");
    }
    const requestedViewportOrigin = intent.viewportOrigin ?? this.stage.viewport.initialOrigin;
    const originBounds = this.stage.viewport.originBounds;
    const viewportOrigin = {
      x: Math.max(originBounds.min.x, Math.min(originBounds.max.x, requestedViewportOrigin.x)),
      y: Math.max(originBounds.min.y, Math.min(originBounds.max.y, requestedViewportOrigin.y)),
    };
    let resolvedIntent: BattleActionIntent = intent.actionId === "stomp-1"
      || intent.actionId === "stomp-2"
      || intent.actionId === "stomp-3"
      ? { ...intent, viewportOrigin }
      : intent;
    if (intent.actionId === "magic-archer-shot") {
      if (!target) throw new Error("magic archer action requires a target unit");
      const options = this.magicArcherLineOptions(actor.id, target.id);
      const selected = intent.linePath
        ? options.find((option) => sameLinePath(option.path, intent.linePath ?? []))
        : options[0];
      if (!selected) throw new Error("illegal magic archer line path");
      resolvedIntent = {
        ...resolvedIntent,
        linePath: selected.path.map((position) => ({ ...position })),
      };
    }
    const resolutionRng = this.specialActionResolutionRng(actor, target, resolvedIntent);
    const prepared = resolveSpecialAction(
      resolvedIntent,
      actor,
      target,
      resolutionRng,
      {
        units: this.units,
        battlefield: {
          width: this.stage.width,
          height: this.stage.height,
          terrainSlotAt: (position) => this.terrainSlotAt(position),
        },
        statsFor: (unit) => this.statsFor(unit),
        viewport: {
          origin: viewportOrigin,
          width: this.stage.viewport.width,
          height: this.stage.viewport.height,
        },
      },
      center,
    );
    return resolutionRng === this.rng ? prepared : {
      ...prepared,
      rngBefore: this.rng.state,
      rngCallsBefore: this.rng.calls,
    };
  }

  commitPreparedAction(prepared: PreparedBattleAction): SpecialActionResult {
    if (prepared.intent.actionId === "prayer") {
      throw new Error("prayer uses progressive commit path");
    }
    const actor = this.unit(prepared.intent.actorId);
    const affectedAreCurrent = prepared.affectedUnits.every((affected) => {
      const unit = this.unit(affected.unitId);
      return unit
        && unit.life === affected.lifeBefore
        && unit.experience === affected.experienceBefore
        && unit.x === affected.positionBefore.x
        && unit.y === affected.positionBefore.y
        && unit.actionDisabled === affected.actionDisabledBefore
        && statusesEqual(unit.statuses, affected.statusesBefore);
    });
    if (
      !actor
      || !this.canUseSpecialAction(actor, prepared.intent.actionId)
      || this.rng.state !== prepared.rngBefore
      || this.rng.calls !== prepared.rngCallsBefore
      || actor.experience !== prepared.actorExperienceBefore
      || !affectedAreCurrent
    ) {
      throw new Error("stale prepared special action");
    }

    for (const affected of prepared.affectedUnits) {
      const target = this.unit(affected.unitId);
      if (target && target.side !== actor.side) this.onHostileTargeted(actor, target);
    }

    this.rng.state = prepared.rngAfter;
    this.rng.calls = prepared.rngCallsAfter;
    actor.experience = prepared.actorExperienceAfter;
    this.synchronizeWaterWarriorState(actor);
    actor.acted = true;
    for (const affected of prepared.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (!unit) throw new Error("stale prepared special action");
      unit.x = affected.positionAfter.x;
      unit.y = affected.positionAfter.y;
      this.setSharedLife(unit, unit.life + affected.lifeAfter - affected.lifeBefore);
      if (affected.prayerOutcome) unit.experience = affected.experienceAfter;
      unit.actionDisabled = affected.actionDisabledAfter;
      unit.statuses = { ...affected.statusesAfter };
      this.synchronizeWaterWarriorState(unit);
      this.recordCampaignUnit(unit);
    }
    this.recordCampaignUnit(actor);
    const deadIds = new Set<string>();
    for (const affected of prepared.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (unit?.life === 0) {
        for (const member of this.waterWarriorGroup(unit)) deadIds.add(member.id);
      }
    }
    for (const id of deadIds) {
      const dead = this.unit(id);
      if (dead) this.removeSharedUnit(dead);
    }
    this.focusId = this.unit(actor.id)?.id
      ?? prepared.result.targetId
      ?? this.units[0]?.id
      ?? actor.id;
    return prepared.result;
  }

  commitScriptedSpecialAction(
    result: SpecialActionResult,
    preserveUnitIds: readonly string[] = [],
  ): SpecialActionResult {
    const preserved = new Set(preserveUnitIds);
    const affectedAreCurrent = result.affectedUnits.every((affected) => {
      const unit = this.unit(affected.unitId);
      return unit
        && unit.life === affected.lifeBefore
        && unit.experience === affected.experienceBefore
        && unit.x === affected.positionBefore.x
        && unit.y === affected.positionBefore.y
        && unit.actionDisabled === affected.actionDisabledBefore
        && statusesEqual(unit.statuses, affected.statusesBefore);
    });
    if (!affectedAreCurrent) throw new Error("stale scripted special action");

    for (const affected of result.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (!unit) throw new Error("stale scripted special action");
      this.setSharedLife(unit, affected.lifeAfter);
      unit.actionDisabled = affected.actionDisabledAfter;
      unit.statuses = { ...affected.statusesAfter };
      this.recordCampaignUnit(unit);
    }
    const deadIds = new Set<string>();
    for (const affected of result.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (unit?.life === 0 && !preserved.has(unit.id)) {
        for (const member of this.waterWarriorGroup(unit)) deadIds.add(member.id);
      }
    }
    for (const id of deadIds) {
      const dead = this.unit(id);
      if (dead) this.removeSharedUnit(dead);
    }
    return result;
  }

  removeStoryUnits(actors: readonly { side: Side; slot: number }[]): readonly string[] {
    const ids = new Set(actors.map(({ side, slot }) => `${side}:${slot}`));
    const removed = this.units.filter(({ id }) => ids.has(id)).map(({ id }) => id);
    this.units = this.units.filter(({ id }) => !ids.has(id));
    if (ids.has(this.focusId)) this.focusId = this.units[0]?.id ?? this.focusId;
    return removed;
  }

  appendStoryUnits(
    units: readonly BattleUnit[],
    forceInheritance: readonly { sourceUnitId: string; derivedUnitId: string }[] = [],
  ): readonly string[] {
    const existingIds = new Set(this.units.map(({ id }) => id));
    const appendedIds = new Set<string>();
    for (const unit of units) {
      if (existingIds.has(unit.id) || appendedIds.has(unit.id)) {
        throw new Error(`duplicate story unit id ${unit.id}`);
      }
      appendedIds.add(unit.id);
    }
    for (const inheritance of forceInheritance) {
      this.forces.inheritUnit(inheritance.sourceUnitId, inheritance.derivedUnitId);
    }
    this.units.push(...units.map((unit) => ({
      ...unit,
      statuses: { ...unit.statuses },
    })));
    return [...appendedIds];
  }

  commitPreparedPrayerOutcome(
    prepared: PreparedBattleAction,
    index: number,
  ): PreparedBattleAction["affectedUnits"][number] {
    if (prepared.intent.actionId !== "prayer") throw new Error("prepared action is not prayer");
    const affected = prepared.affectedUnits[index];
    const actor = this.unit(prepared.intent.actorId);
    if (!affected || !actor || actor.acted || actor.actionDisabled
      || actor.classId !== "prayer-guide" || actor.statuses.techniqueSeal > 0) {
      throw new Error("stale prepared prayer action");
    }
    const sequenceIsCurrent = prepared.affectedUnits.every((candidate, candidateIndex) => {
      const unit = this.unit(candidate.unitId);
      if (!unit) return false;
      const committed = candidateIndex < index;
      return unit.life === (committed ? candidate.lifeAfter : candidate.lifeBefore)
        && unit.experience === (committed ? candidate.experienceAfter : candidate.experienceBefore)
        && unit.x === (committed ? candidate.positionAfter.x : candidate.positionBefore.x)
        && unit.y === (committed ? candidate.positionAfter.y : candidate.positionBefore.y)
        && unit.actionDisabled === (committed
          ? candidate.actionDisabledAfter
          : candidate.actionDisabledBefore)
        && statusesEqual(unit.statuses, committed ? candidate.statusesAfter : candidate.statusesBefore);
    });
    const expectedRngState = index === 0 ? prepared.rngBefore : prepared.rngAfter;
    const expectedRngCalls = index === 0 ? prepared.rngCallsBefore : prepared.rngCallsAfter;
    if (!sequenceIsCurrent
      || this.rng.state !== expectedRngState
      || this.rng.calls !== expectedRngCalls) {
      throw new Error("stale prepared prayer action");
    }

    if (index === 0) {
      this.rng.state = prepared.rngAfter;
      this.rng.calls = prepared.rngCallsAfter;
    }
    const unit = this.unit(affected.unitId);
    if (!unit) throw new Error("stale prepared prayer action");
    this.setSharedLife(unit, unit.life + affected.lifeAfter - affected.lifeBefore);
    unit.experience = affected.experienceAfter;
    unit.statuses = { ...affected.statusesAfter };
    this.synchronizeWaterWarriorState(unit);
    this.recordCampaignUnit(unit);
    this.focusId = unit.id;
    return affected;
  }

  completePreparedPrayer(prepared: PreparedBattleAction): SpecialActionResult {
    if (prepared.intent.actionId !== "prayer") throw new Error("prepared action is not prayer");
    const actor = this.unit(prepared.intent.actorId);
    const allOutcomesCommitted = prepared.affectedUnits.every((affected) => {
      const unit = this.unit(affected.unitId);
      return unit
        && unit.life === affected.lifeAfter
        && unit.experience === affected.experienceAfter
        && unit.x === affected.positionAfter.x
        && unit.y === affected.positionAfter.y
        && unit.actionDisabled === affected.actionDisabledAfter
        && statusesEqual(unit.statuses, affected.statusesAfter);
    });
    const rngStillUncommitted = prepared.affectedUnits.length === 0
      && this.rng.state === prepared.rngBefore
      && this.rng.calls === prepared.rngCallsBefore;
    const rngAlreadyCommitted = prepared.affectedUnits.length > 0
      && this.rng.state === prepared.rngAfter
      && this.rng.calls === prepared.rngCallsAfter;
    if (!actor || actor.acted || actor.actionDisabled || actor.classId !== "prayer-guide"
      || actor.statuses.techniqueSeal > 0 || !allOutcomesCommitted
      || (!rngStillUncommitted && !rngAlreadyCommitted)) {
      throw new Error("stale prepared prayer action");
    }

    if (rngStillUncommitted) {
      this.rng.state = prepared.rngAfter;
      this.rng.calls = prepared.rngCallsAfter;
    }
    actor.acted = true;
    this.recordCampaignUnit(actor);
    this.focusId = prepared.affectedUnits.at(-1)?.unitId ?? actor.id;
    return prepared.result;
  }

  prepareIronPlateConstruction(
    actorId: string,
    target: Position,
  ): PreparedIronPlateConstruction {
    return this.prepareConstruction(actorId, target, "iron-plate");
  }

  prepareObstacleConstruction(
    actorId: string,
    target: Position,
  ): PreparedObstacleConstruction {
    return this.prepareConstruction(actorId, target, "obstacle");
  }

  prepareConstruction<ActionId extends ConstructionActionId>(
    actorId: string,
    target: Position,
    actionId: ActionId,
  ): PreparedConstruction<ActionId> {
    const actor = this.unit(actorId);
    if (!actor || !this.canUseSpecialAction(actor, actionId)) {
      throw new Error(`illegal ${actionId} construction`);
    }
    return resolveConstruction(actor, target, actionId, {
      battlefield: this.dynamicBattlefield,
      units: this.units,
      terrainKindAt: (position) => this.terrainKindAt(position),
      dynamicTerrainSlot: (kind) => this.scenario.dynamicTerrainSlots?.[kind],
    });
  }

  commitIronPlateConstruction(
    prepared: PreparedIronPlateConstruction,
  ): IronPlateConstructionResult {
    return this.commitConstruction(prepared);
  }

  commitObstacleConstruction(
    prepared: PreparedObstacleConstruction,
  ): ObstacleConstructionResult {
    return this.commitConstruction(prepared);
  }

  commitConstruction<ActionId extends ConstructionActionId>(
    prepared: PreparedConstruction<ActionId>,
  ): ConstructionResult<ActionId> {
    const actor = this.unit(prepared.actorId);
    const currentFingerprint = terrainMutationFingerprint(
      prepared.terrainMutations,
      (position) => this.terrainKindAt(position),
      (position) => this.terrainSlotAt(position),
    );
    const beforeFingerprint = prepared.terrainMutations.map((mutation) => [
      positionKey(mutation),
      mutation.kindBefore ?? "base",
      mutation.slotBefore,
    ].join(":"))
      .join("|");
    if (
      !actor
      || !this.canUseSpecialAction(actor, prepared.actionId)
      || actor.x !== prepared.actorPositionBefore.x
      || actor.y !== prepared.actorPositionBefore.y
      || this.unitAt(prepared.actorPositionAfter)
      || currentFingerprint !== beforeFingerprint
      || constructionPath(
        actor,
        prepared.actorPositionAfter,
        this.units,
        this.dynamicBattlefield,
      ).map(positionKey).join("|") !== prepared.path.map(positionKey).join("|")
    ) throw new Error(`stale prepared ${prepared.actionId} construction`);

    actor.x = prepared.actorPositionAfter.x;
    actor.y = prepared.actorPositionAfter.y;
    actor.acted = true;
    for (const mutation of prepared.terrainMutations) {
      this.terrainOverrideByPosition.set(positionKey(mutation), mutation.kind);
    }
    this.focusId = actor.id;
    this.recordCampaignUnit(actor);
    return {
      actionId: prepared.actionId,
      actorId: prepared.actorId,
      actorPositionBefore: { ...prepared.actorPositionBefore },
      actorPositionAfter: { ...prepared.actorPositionAfter },
      path: prepared.path.map((position) => ({ ...position })),
      terrainMutations: prepared.terrainMutations.map((mutation) => ({ ...mutation })),
    };
  }

  wait(id: string): boolean {
    const unit = this.unit(id);
    if (!unit || unit.side !== 1 || unit.acted || unit.actionDisabled) return false;
    unit.acted = true;
    this.focusId = id;
    return true;
  }

  rest(id: string): number {
    const unit = this.unit(id);
    if (!unit || unit.acted || unit.actionDisabled) return 0;
    const maximumLife = this.statsFor(unit).maxLife;
    const recovered = Math.max(0, Math.min(Math.floor(maximumLife * 15 / 100), maximumLife - unit.life));
    this.setSharedLife(unit, unit.life + recovered);
    unit.acted = true;
    this.focusId = id;
    return recovered;
  }

  restAllUnspentAllies(): { count: number; recovered: number } {
    let count = 0;
    let recovered = 0;
    for (const unit of this.units) {
      if (!this.isPlayerControllableAlly(unit.id) || unit.acted || unit.actionDisabled) continue;
      recovered += this.rest(unit.id);
      count += 1;
    }
    return { count, recovered };
  }

  planAlliedAiAction(id: string, leaderId?: string): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 1 || unit.acted || unit.actionDisabled) return undefined;
    if (unit.statuses.confusion > 0) {
      return this.withAiPlanningCache(() => this.planConfusedAiAction(unit));
    }
    return this.withAiPlanningCache(() => {
      const cache = this.activeAiPlanningCache;
      const key = `ally:${id}:${leaderId ?? ""}`;
      if (cache?.plannedActions.has(key)) {
        const cached = cache.plannedActions.get(key);
        return cached ? cloneAiAction(cached) : undefined;
      }
      const action = this.planAlliedAiActionUncached(unit, leaderId);
      cache?.plannedActions.set(key, action ? cloneAiAction(action) : undefined);
      return action;
    });
  }

  private planAlliedAiActionUncached(
    unit: BattleUnit,
    leaderId?: string,
  ): AlliedAiAction | undefined {
    const id = unit.id;
    const routePulse = this.routePulseByActorId.get(id);
    if (routePulse) {
      return {
        unitId: id,
        kind: "route-pulse",
        path: planRoutePulsePath(routePulse, unit, this.units, this.dynamicBattlefield),
      };
    }

    const escortRoute = this.escortRouteByActorId.get(id);
    if (escortRoute) {
      const path = planEscortRoutePath(escortRoute, unit, this.units, this.dynamicBattlefield);
      return { unitId: id, kind: path.length > 1 ? "move" : "wait", path };
    }

    const doctrine = this.forces.definitionForUnit(id)?.doctrine;
    if (doctrine?.strategy === "terrain-hold") {
      return this.planTerrainHoldAiAction(unit, doctrine);
    }

    const behavior = this.alliedBehaviorFor(id);
    const leader = leaderId && this.isPlayerControllableAlly(id)
      ? this.unit(leaderId)
      : undefined;
    if (leader && leader.id !== unit.id && leader.side === unit.side) {
      const leaderPath = shortestPath(
        unit,
        leader,
        unit.classId,
        this.statsFor(unit).movement,
        this.units.filter((candidate) => candidate.id !== unit.id),
        this.dynamicBattlefield,
      );
      if (leaderPath.length === 0) {
        const path = routePath(
          unit,
          neighbors(leader, this.dynamicBattlefield),
          this.units,
          this.statsFor(unit).movement,
          this.dynamicBattlefield,
        );
        if (path.length > 1) return { unitId: id, kind: "move", path };
      }
    }

    const targetFilter = this.forces.targetFilterFor(id, this.units);
    return this.planExpertCombatAction(unit, behavior === 1 ? "sentry" : "pursuit", {
      targetFilter,
      behavior,
    });
  }

  routePulseSafeArea(id: string): Position[] {
    const unit = this.unit(id);
    const definition = this.routePulseByActorId.get(id);
    if (!unit || !definition) return [];
    return routePulseSafeCells(definition, unit, this.dynamicBattlefield);
  }

  routePulseSafeAreaForUnit(id: string): Position[] {
    const unit = this.unit(id);
    if (!unit) return [];
    for (const [actorId, definition] of this.routePulseByActorId) {
      if (definition.effect.side !== unit.side) continue;
      const actor = this.unit(actorId);
      if (actor) return routePulseSafeCells(definition, actor, this.dynamicBattlefield);
    }
    return [];
  }

  routePulseSafetyForUnit(id: string): "safe" | "danger" | undefined {
    const unit = this.unit(id);
    if (!unit) return undefined;
    const safeArea = this.routePulseSafeAreaForUnit(id);
    if (safeArea.length === 0) return undefined;
    return safeArea.some(({ x, y }) => x === unit.x && y === unit.y) ? "safe" : "danger";
  }

  prepareRoutePulse(id: string, path: readonly Position[]): PreparedRoutePulse {
    const actor = this.unit(id);
    const definition = this.routePulseByActorId.get(id);
    if (!actor || !definition || actor.acted || actor.actionDisabled) {
      throw new Error("illegal route pulse");
    }
    return resolveRoutePulse(definition, actor, this.units, this.dynamicBattlefield, path);
  }

  commitRoutePulse(prepared: PreparedRoutePulse): PreparedRoutePulse {
    const actor = this.unit(prepared.actorId);
    const affectedAreCurrent = prepared.affectedUnits.every((affected) => {
      const unit = this.unit(affected.unitId);
      return unit
        && unit.x === affected.position.x
        && unit.y === affected.position.y
        && unit.life === affected.lifeBefore;
    });
    if (!actor
      || actor.acted
      || actor.actionDisabled
      || actor.x !== prepared.actorDestination.x
      || actor.y !== prepared.actorDestination.y
      || this.routePulseByActorId.get(actor.id) !== prepared.definition
      || !affectedAreCurrent) {
      throw new Error("stale prepared route pulse");
    }
    actor.acted = true;
    for (const affected of prepared.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (!unit) throw new Error("stale prepared route pulse");
      this.setSharedLife(unit, unit.life + affected.lifeAfter - affected.lifeBefore);
      this.recordCampaignUnit(unit);
    }
    this.recordCampaignUnit(actor);
    const deadIds = new Set<string>();
    for (const affected of prepared.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (unit?.life === 0) {
        for (const member of this.waterWarriorGroup(unit)) deadIds.add(member.id);
      }
    }
    for (const id of deadIds) {
      const dead = this.unit(id);
      if (dead) this.removeSharedUnit(dead);
    }
    this.focusId = this.unit(actor.id)?.id ?? this.units[0]?.id ?? actor.id;
    return prepared;
  }

  planEnemyAiAction(id: string, behavior = this.enemyBehaviorFor(id)): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    if (unit.statuses.confusion > 0) {
      return this.withAiPlanningCache(() => this.planConfusedAiAction(unit));
    }
    return this.withAiPlanningCache(() => {
      const cache = this.activeAiPlanningCache;
      const key = `enemy:${id}:${behavior}`;
      if (cache?.plannedActions.has(key)) {
        const cached = cache.plannedActions.get(key);
        return cached ? cloneAiAction(cached) : undefined;
      }
      const action = this.planEnemyAiActionUncached(unit, behavior);
      cache?.plannedActions.set(key, action ? cloneAiAction(action) : undefined);
      return action;
    });
  }

  private planEnemyAiActionUncached(unit: BattleUnit, behavior: number): AlliedAiAction {
    const id = unit.id;
    const doctrine = this.forces.definitionForUnit(id)?.doctrine;
    if (doctrine?.strategy === "terrain-hold") {
      const action = this.planTerrainHoldAiAction(unit, doctrine);
      this.recordExpertDecision(unit, [action], action);
      return action;
    }
    const targetFilter = this.forces.targetFilterFor(id, this.units);
    return this.planExpertCombatAction(unit, behavior === 1 ? "sentry" : "pursuit", {
      targetFilter,
      behavior,
    });
  }

  private planTerrainHoldAiAction(
    unit: BattleUnit,
    doctrine: Extract<ForceDefinition["doctrine"], { strategy: "terrain-hold" }>,
  ): AlliedAiAction {
    return planTerrainHoldForceAiAction({
      width: this.stage.width,
      battlefield: this.dynamicBattlefield,
      units: this.units,
      forces: this.forces,
      statsFor: (candidate) => this.statsFor(candidate),
      reachableCells: (unitId) => this.reachableCells(unitId),
      movementPath: (unitId, destination) => this.movementPath(unitId, destination),
      alliedBehaviorFor: (unitId) => this.alliedBehaviorFor(unitId),
      enemyBehaviorFor: (unitId) => this.enemyBehaviorFor(unitId),
      planClassAction: (candidate, requestedActionIds, options) =>
        this.planClassAction(candidate, requestedActionIds, {
          ...options,
          expertRanking: true,
        }),
      planOrdinaryAction: (candidate, opponentSide, behavior, options) =>
        this.planOrdinaryAiAction(candidate, opponentSide, behavior, {
          ...options,
          expertRanking: true,
          namedLeaderCaution: this.isEnemyNamedLeader(candidate),
        }),
      compareExpertActions: (candidate, left, right) => {
        const leftUtility = this.expertUtilityForAction(candidate, left);
        const rightUtility = this.expertUtilityForAction(candidate, right);
        return compareExpertFocusRanking(
          leftUtility,
          this.expectedRemainingLifeForDirectFocusAction(candidate, left, leftUtility),
          rightUtility,
          this.expectedRemainingLifeForDirectFocusAction(candidate, right, rightUtility),
        ) || compareFocusFireLife(
          this.focusFireLifeForAction(candidate, left),
          this.focusFireLifeForAction(candidate, right),
        );
      },
    }, unit, doctrine);
  }

  protected planModernEnemyAiAction(
    id: string,
    intent: Extract<EnemyAiIntent, "sentry" | "pursuit">,
  ): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (unit?.statuses.confusion && !unit.acted && !unit.actionDisabled) {
      return this.planConfusedAiAction(unit);
    }
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    return this.planExpertCombatAction(unit, intent, {
      behavior: intent === "sentry" ? 1 : 2,
    });
  }

  protected planConfusedAiAction(unit: BattleUnit): AlliedAiAction {
    const reachable = this.reachableCells(unit.id)
      .sort((left, right) => left.y * this.stage.width + left.x
        - (right.y * this.stage.width + right.x));
    if (classDefinition(unit.classId).actionCategory === "ordinary") {
      let destination: Position | undefined;
      let bestDefense = -1;
      for (const candidate of reachable) {
        if (neighbors(candidate, this.dynamicBattlefield).some((adjacent) =>
          this.units.some((other) => other.side !== unit.side
            && other.x === adjacent.x && other.y === adjacent.y))) continue;
        const defense = terrainDefensePercentFor(unit.classId, this.terrainSlotAt(candidate));
        if (defense >= bestDefense) {
          destination = candidate;
          bestDefense = defense;
        }
      }
      if (!destination || positionKey(destination) === positionKey(unit)) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const path = this.movementPath(unit.id, destination);
      return path.length > 1
        ? { unitId: unit.id, kind: "move", path }
        : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }

    for (const candidate of reachable) {
      // Native behavior FFh samples PIT bit 0 for each ascending cell. Gameplay
      // randomness is mapped one-for-one to the serializable simulation PRNG.
      if (this.rng.between(0, 1) !== 0) continue;
      if (positionKey(candidate) === positionKey(unit)) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const path = this.movementPath(unit.id, candidate);
      if (path.length > 1) return { unitId: unit.id, kind: "move", path };
    }
    return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  protected hasDamageActionThisTurn(id: string): boolean {
    if ((this.unit(id)?.statuses.confusion ?? 0) > 0) return false;
    return hasEnemyDamageActionThisTurn(this.enemyThreatContext(), id);
  }

  protected onHostileTargeted(_actor: BattleUnit, _target: BattleUnit): void {}

  private enemyThreatContext(): EnemyThreatContext {
    return {
      width: this.stage.width,
      battlefield: this.dynamicBattlefield,
      units: this.units,
      unit: (id) => this.unit(id),
      statsFor: (unit) => this.statsFor(unit),
      movementPath: (id, destination) => this.movementPath(id, destination),
      planSisterAction: (unit, actionId) => this.planClassAction(
        unit,
        [actionId],
        { modernRanking: true },
      ),
    };
  }

  protected planExpertCombatAction(
    unit: BattleUnit,
    intent: Extract<EnemyAiIntent, "sentry" | "pursuit">,
    options: {
      behavior: number;
      targetFilter?: (target: BattleUnit) => boolean;
    },
  ): AlliedAiAction {
    const positionFilter = intent === "pursuit"
      ? undefined
      : (position: Position) => positionKey(position) === positionKey(unit);
    const iceIsForbidden = this.onlyIceCapableSideRemains(unit.side);
    const classAction = this.planClassAction(unit, undefined, {
      expertRanking: true,
      actionFilter: (actionId) => !iceIsForbidden || !isIceActionId(actionId),
      positionFilter,
      targetFilter: (target) => target.side === unit.side
        || (options.targetFilter?.(target) ?? true),
    });
    const opponentSide: BattleUnit["side"] = unit.side === 1 ? 2 : 1;
    let fallbackAction: AlliedAiAction | undefined;
    if (classCombatRole(unit.classId) === "ranged") {
      if (!classAction) {
        fallbackAction = intent === "pursuit"
          ? (usesTechniqueAi(unit.classId, unit.side)
              ? this.planExpertTechniquePositioningAction(unit, {
                  iceIsForbidden,
                  targetFilter: options.targetFilter,
                })
              : undefined)
            ?? this.planExpertRangedApproachAction(unit, {
              targetFilter: options.targetFilter,
            })
          : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
    } else {
      fallbackAction = this.planOrdinaryAiAction(unit, opponentSide, options.behavior, {
        expertRanking: true,
        namedLeaderCaution: this.isEnemyNamedLeader(unit),
        targetFilter: options.targetFilter,
      });
    }
    const candidates = [classAction, fallbackAction]
      .filter((action): action is AlliedAiAction => action !== undefined)
      .filter((action, index, actions) => actions.findIndex((candidate) =>
        candidate.kind === action.kind
        && candidate.actionId === action.actionId
        && candidate.targetId === action.targetId
        && positionKey(candidate.path.at(-1) ?? unit)
          === positionKey(action.path.at(-1) ?? unit)) === index)
      .sort((left, right) => {
        const leftUtility = this.expertUtilityForAction(unit, left);
        const rightUtility = this.expertUtilityForAction(unit, right);
        return compareExpertFocusRanking(
          leftUtility,
          this.expectedRemainingLifeForDirectFocusAction(unit, left, leftUtility),
          rightUtility,
          this.expectedRemainingLifeForDirectFocusAction(unit, right, rightUtility),
        ) || compareFocusFireLife(
          this.focusFireLifeForAction(unit, left),
          this.focusFireLifeForAction(unit, right),
        );
      });
    const selected = candidates[0]
      ?? { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    const selectedUtility = this.expertUtilityForAction(unit, selected);
    const maximumLife = this.statsFor(unit).maxLife;
    // A named victory target is the AI's own loss condition, so below 20% it
    // always breaks contact: trading itself for one player unit hands the
    // stage over. Everyone else keeps taking a guaranteed kill at any life,
    // because for them an even trade costs the player more than the AI.
    if (unit.life * 100 < maximumLife * 20 && this.isEnemyCommander(unit)) {
      const recovery = this.planSelfRecoveryAction(unit);
      this.recordExpertDecision(unit, [...candidates, recovery], recovery);
      return recovery;
    }
    if (selectedUtility.guaranteedKills === 0 && usesEmpressOrDragonAi(unit.classId)) {
      const banded = this.planEmpressOrDragonLifeBand(unit, options);
      if (banded) {
        this.recordExpertDecision(unit, [...candidates, banded], banded);
        return banded;
      }
    }
    if (unit.life * 100 < maximumLife * 40
      && selectedUtility.guaranteedKills === 0
      && selectedUtility.wizardHits === 0
      && selectedUtility.criticalSaves === 0) {
      const recovery = this.planSelfRecoveryAction(unit);
      this.recordExpertDecision(unit, [...candidates, recovery], recovery);
      return recovery;
    }
    this.recordExpertDecision(unit, candidates, selected);
    return selected;
  }

  /**
   * REMAKE-065/066 read-only forecast for non-guard caster movement. A move
   * never commits the forecasted action: after every intervening action the
   * next AI turn still replans from current state. The intent keeps one fixed
   * action/target pair while safety, terrain and target distance rank cells.
   */
  private planExpertTechniquePositioningAction(
    unit: BattleUnit,
    options: {
      iceIsForbidden: boolean;
      targetFilter?: (target: BattleUnit) => boolean;
    },
  ): AlliedAiAction | undefined {
    const candidates: Array<{
      position: Position;
      path: Position[];
      actionId: BattleActionId;
      actionOrder: number;
      target: BattleUnit;
      utility: ExpertAiUtility;
      tacticalScore: number;
      terrainDefense: number;
      targetDistance: number;
      exposure: number;
      risk: RangedPositionRisk;
    }> = [];
    const riskAt = this.rangedRiskEvaluator(unit);
    const actionIds = techniqueActionIdsFor(unit);
    for (const position of this.reachableCells(unit.id)) {
      if (positionKey(position) === positionKey(unit)) continue;
      for (const [actionOrder, actionId] of actionIds.entries()) {
        const definition = BATTLE_ACTION_DEFINITIONS[actionId];
        const preparesAttack = definition.target === "enemy" || isIceActionId(actionId);
        const preparesHealing = definition.target === "ally" && "healing" in definition;
        if ((options.iceIsForbidden && isIceActionId(actionId))
          || (!preparesAttack && !preparesHealing)) continue;
        for (const target of this.units) {
          const correctSide = definition.target === "ally"
            ? target.side === unit.side
            : target.side !== unit.side;
          if (!correctSide
            || (target.side !== unit.side && !(options.targetFilter?.(target) ?? true))) continue;
          const forecast = this.planClassAction(unit, [actionId], {
            expertRanking: true,
            casterPosition: position,
            targetFilter: (candidate) => candidate.id === target.id,
          });
          if (forecast?.actionId !== actionId
            || forecast.targetId !== target.id
            || forecast.path.length <= 1) continue;
          const utility = this.expertSpecialUtility(
            unit,
            actionId,
            target,
            forecast.path,
            forecast.linePath,
          );
          candidates.push({
            position,
            path: forecast.path,
            actionId,
            actionOrder,
            target,
            utility,
            tacticalScore: expertTacticalScore(utility),
            terrainDefense: terrainDefensePercentFor(unit.classId, this.terrainSlotAt(position)),
            targetDistance: manhattan(position, target),
            exposure: this.exposureAt(unit, position),
            risk: riskAt(position),
          });
        }
      }
    }
    if (candidates.length === 0) return undefined;

    const minimumContacts = Math.min(...candidates.map(({ risk }) => risk.meleeContactCount));
    let eligible = candidates.filter(({ risk }) => risk.meleeContactCount === minimumContacts);
    if (minimumContacts > 0) {
      const minimumDamage = Math.min(...eligible.map(({ risk }) => risk.meleeExpectedDamage));
      eligible = eligible.filter(({ risk }) => risk.meleeExpectedDamage === minimumDamage);
    }
    eligible.sort((left, right) => compareExpertAiPriorityBand(left.utility, right.utility)
      || compareFocusFireLife(
        isDirectFocusDamageActionId(left.actionId) && left.target.side !== unit.side
          ? Math.max(0, left.target.life - left.utility.effectiveDamage)
          : undefined,
        isDirectFocusDamageActionId(right.actionId) && right.target.side !== unit.side
          ? Math.max(0, right.target.life - right.utility.effectiveDamage)
          : undefined,
      )
      || right.tacticalScore - left.tacticalScore
      || compareFocusFireLife(
        isDamagingActionId(left.actionId) && left.target.side !== unit.side
          ? left.target.life
          : undefined,
        isDamagingActionId(right.actionId) && right.target.side !== unit.side
          ? right.target.life
          : undefined,
      )
      || left.actionOrder - right.actionOrder
      || left.target.y * this.stage.width + left.target.x
        - (right.target.y * this.stage.width + right.target.x));
    const selectedIntent = eligible[0];
    const selected = eligible
      .filter((candidate) => candidate.actionId === selectedIntent.actionId
        && candidate.target.id === selectedIntent.target.id)
      .sort((left, right) => right.terrainDefense - left.terrainDefense
        || right.targetDistance - left.targetDistance
        || left.exposure - right.exposure
        || left.path.length - right.path.length
        || left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x))[0];
    return selected
      ? {
          unitId: unit.id,
          kind: "move",
          path: selected.path,
          setupActionId: selected.actionId,
          setupTargetId: selected.target.id,
        }
      : undefined;
  }

  /**
   * REMAKE-066: ranged units without a current or forecasted action approach
   * an outer firing/support ring instead of borrowing melee frontage.
   */
  private planExpertRangedApproachAction(
    unit: BattleUnit,
    options: {
      targetFilter?: (target: BattleUnit) => boolean;
    },
  ): AlliedAiAction {
    const shootingActionId = shootingActionIdFor(unit.classId, unit.side);
    const actionIds: readonly BattleActionId[] = shootingActionId
      ? [shootingActionId]
      : techniqueActionIdsFor(unit);
    const hostileActionIds = actionIds.filter((actionId) =>
      BATTLE_ACTION_DEFINITIONS[actionId].target === "enemy" || isIceActionId(actionId));
    const pureSupport = hostileActionIds.length === 0;
    const opponents = this.units.filter((candidate) => candidate.side !== unit.side
      && !candidate.actionDisabled
      && (options.targetFilter?.(candidate) ?? true));
    let strategicTargets: BattleUnit[];
    if (pureSupport) {
      const allies = this.units.filter((candidate) => candidate.side === unit.side
        && candidate.id !== unit.id
        && !candidate.actionDisabled);
      if (allies.length === 0 || opponents.length === 0) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const frontDistance = Math.min(...allies.map((ally) =>
        Math.min(...opponents.map((opponent) => manhattan(ally, opponent)))));
      strategicTargets = allies.filter((ally) =>
        Math.min(...opponents.map((opponent) => manhattan(ally, opponent))) === frontDistance);
    } else {
      strategicTargets = opponents;
    }
    if (strategicTargets.length === 0) {
      return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }

    const relevantActionIds = pureSupport ? actionIds : hostileActionIds;
    const preferredRange = Math.max(1, ...relevantActionIds.map((actionId) => {
      const definition = BATTLE_ACTION_DEFINITIONS[actionId];
      if ("maximumDistance" in definition.range) return definition.range.maximumDistance;
      if (definition.target === "self-area" && "effectRadius" in definition.range) {
        return Math.max(1, definition.range.effectRadius - 1);
      }
      const selectionRadius = "aiCandidateSelectionRadius" in definition.range
        ? definition.range.aiCandidateSelectionRadius
        : "selectionRadius" in definition.range
          ? definition.range.selectionRadius
          : 1;
      return Math.max(1, selectionRadius - 1);
    }));
    const occupied = new Set(this.units
      .filter((candidate) => candidate.id !== unit.id)
      .map(positionKey));
    const ringCells: Position[] = [];
    for (let y = 0; y < this.stage.height; y += 1) {
      for (let x = 0; x < this.stage.width; x += 1) {
        const position = { x, y };
        if (occupied.has(positionKey(position))
          || movementCost(unit.classId, position, this.dynamicBattlefield) >= 98
          || !strategicTargets.some((target) => manhattan(position, target) === preferredRange)) continue;
        ringCells.push(position);
      }
    }
    const reachable = this.reachableCells(unit.id);
    const riskAt = this.rangedRiskEvaluator(unit);
    const candidateDetails = (position: Position) => {
      const key = positionKey(position);
      const path = key === positionKey(unit)
        ? [{ x: unit.x, y: unit.y }]
        : this.movementPath(unit.id, position);
      return {
        position,
        path,
        risk: riskAt(position),
        terrainDefense: terrainDefensePercentFor(unit.classId, this.terrainSlotAt(position)),
        targetDistance: Math.min(...strategicTargets.map((target) => manhattan(position, target))),
        exposure: this.exposureAt(unit, position),
      };
    };
    const magicArcherSafe = (risk: RangedPositionRisk): boolean =>
      unit.classId !== "magic-archer" || risk.adjacentEnemyCount === 0;
    const costs = movementCostsToNearestTarget(
      unit,
      ringCells,
      this.units,
      this.dynamicBattlefield,
    );
    const originCost = costs.get(positionKey(unit));
    if (originCost !== undefined) {
      const candidates = reachable
        .map((position) => ({
          ...candidateDetails(position),
          remainingCost: costs.get(positionKey(position)),
        }))
        .filter(({ path, remainingCost, risk }) => path.length > 1
          && remainingCost !== undefined
          && remainingCost < originCost
          && magicArcherSafe(risk))
        .sort((left, right) => left.risk.meleeContactCount - right.risk.meleeContactCount
          || left.risk.meleeExpectedDamage - right.risk.meleeExpectedDamage
          || left.remainingCost! - right.remainingCost!
          || right.terrainDefense - left.terrainDefense
          || right.targetDistance - left.targetDistance
          || left.exposure - right.exposure
          || left.path.length - right.path.length
          || left.position.y * this.stage.width + left.position.x
            - (right.position.y * this.stage.width + right.position.x));
      const selected = candidates[0];
      if (selected) {
        return {
          unitId: unit.id,
          kind: "move",
          path: selected.path,
          pursuitProgress: originCost - selected.remainingCost!,
        };
      }
    }

    const distanceToRing = (position: Position): number => Math.min(...strategicTargets.map((target) =>
      Math.abs(manhattan(position, target) - preferredRange)));
    const originDistance = distanceToRing(unit);
    const candidates = reachable
      .map((position) => ({
        ...candidateDetails(position),
        ringDistance: distanceToRing(position),
      }))
      .filter(({ path, ringDistance, risk }) => path.length > 1
        && ringDistance < originDistance
        && magicArcherSafe(risk))
      .sort((left, right) => left.risk.meleeContactCount - right.risk.meleeContactCount
        || left.risk.meleeExpectedDamage - right.risk.meleeExpectedDamage
        || left.ringDistance - right.ringDistance
        || right.terrainDefense - left.terrainDefense
        || right.targetDistance - left.targetDistance
        || left.exposure - right.exposure
        || left.path.length - right.path.length
        || left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x));
    const selected = candidates[0];
    return selected
      ? {
          unitId: unit.id,
          kind: "move",
          path: selected.path,
          pursuitProgress: originDistance - selected.ringDistance,
        }
      : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  /**
   * Rest restores `floor(maxLife * 15 / 100)`, which a healer's own pool often
   * beats — `1H` alone returns 24% of max life. Whenever the policy decides a
   * unit should spend its action recovering, it should therefore spend it on
   * the largest restore the unit can put on itself, not on rest by reflex.
   * Area recovery is measured by what lands on the caster; whatever it also
   * gives the squad is upside the ordinary utility path already ranks.
   */
  private planSelfRecoveryAction(unit: BattleUnit): AlliedAiAction {
    const path = [{ x: unit.x, y: unit.y }];
    const maximumLife = this.statsFor(unit).maxLife;
    const missingLife = maximumLife - unit.life;
    let best: AlliedAiAction = { unitId: unit.id, kind: "rest", path };
    let bestHealing = Math.min(missingLife, Math.floor(maximumLife * 15 / 100));
    if (missingLife <= 0 || unit.statuses.techniqueSeal > 0) return best;

    for (const actionId of techniqueActionIdsFor(unit)) {
      const definition = BATTLE_ACTION_DEFINITIONS[actionId];
      if (definition.target !== "ally" || !("healing" in definition)) continue;
      if (!this.canUseSpecialAction(unit, actionId)) continue;
      // The caster sits at the centre of its own area recovery, so it takes
      // the highest ring value the effect map can hold.
      const centreValue = "effectRadius" in definition.range ? definition.range.effectRadius : 0;
      const healing = Math.min(missingLife, "maxLifePercent" in definition.healing
        ? Math.floor(maximumLife * definition.healing.maxLifePercent / 100)
        : (definition.healing.byRangeValue as Readonly<Record<number, number>>)[centreValue] ?? 0);
      if (healing <= bestHealing) continue;
      best = { unitId: unit.id, kind: "special", actionId, targetId: unit.id, path };
      bestHealing = healing;
    }
    return best;
  }

  /** Side-2 slots the stage victory condition names outright. */
  private isEnemyCommander(unit: BattleUnit): boolean {
    return unit.side === 2
      && slotsNamedByCondition(this.stage.objective.victory, 2).includes(unit.slot);
  }

  /**
   * REMAKE-090's named side-2 leader. The content identity boundary already
   * separates them from rank and file: a generic unit carries its profession's
   * fallback portrait, a named general keeps a character portrait. Victory
   * slots are not a sufficient test on their own — the wipe-out stages name
   * nobody, yet that is exactly where a named general used to charge alone.
   */
  private isEnemyNamedLeader(unit: BattleUnit): boolean {
    return unit.side === 2 && !usesClassIdentity(unit);
  }

  /**
   * The 20..39% band of native `1000:2233` as reached from the `0P/1P`
   * dispatcher. It is the one native case where a class both moves and acts:
   * `1000:2233` answers a successful `1000:1D67` retreat with `M`, and
   * `1000:1A68` reacts to that code by running the technique chain again from
   * the cell just retreated to. Callers apply it only when no guaranteed kill
   * is on the table; the bands outside 20..39% belong to the shared flow.
   */
  private planEmpressOrDragonLifeBand(
    unit: BattleUnit,
    options: {
      behavior: number;
      targetFilter?: (target: BattleUnit) => boolean;
    },
  ): AlliedAiAction | undefined {
    const lifePercent = Math.floor(unit.life * 100 / this.statsFor(unit).maxLife);
    if (lifePercent >= 40 || lifePercent < 20) return undefined;
    const retreat = options.behavior !== 1 && this.hasAdjacentOpponent(unit)
      ? this.defensiveRetreatPath(unit)
      : undefined;
    if (!retreat) {
      const recovery = this.planSelfRecoveryAction(unit);
      this.recordExpertDecision(unit, [recovery], recovery);
      return recovery;
    }
    const selected = this.planClassAction(unit, undefined, {
      expertRanking: true,
      casterPosition: retreat.at(-1),
      targetFilter: (target) => target.side === unit.side
        || (options.targetFilter?.(target) ?? true),
    }) ?? { unitId: unit.id, kind: "move", path: retreat };
    this.recordExpertDecision(unit, [selected], selected);
    return selected;
  }

  /** Native `1070:0583`: an orthogonal neighbour holding an opposing unit. */
  private hasAdjacentOpponent(unit: BattleUnit): boolean {
    return neighbors(unit, this.dynamicBattlefield).some((cell) =>
      this.units.some((candidate) => candidate.side !== unit.side
        && candidate.x === cell.x && candidate.y === cell.y));
  }

  /**
   * Native `1000:1D67` with the `1000:0CF0` candidate rule: an empty cell in
   * the movement range with no orthogonal opponent, highest terrain defense,
   * later scan cell on a tie. The actor's own cell is never a candidate
   * because the native scan requires an empty side-map byte, so a successful
   * retreat always relocates.
   */
  private defensiveRetreatPath(unit: BattleUnit): Position[] | undefined {
    const occupied = new Set(this.units.filter(({ id }) => id !== unit.id).map(positionKey));
    let destination: Position | undefined;
    let bestDefense = -1;
    const candidates = this.reachableCells(unit.id)
      .filter((position) => positionKey(position) !== positionKey(unit)
        && !occupied.has(positionKey(position)))
      .sort((left, right) => left.y * this.stage.width + left.x
        - (right.y * this.stage.width + right.x));
    for (const candidate of candidates) {
      if (neighbors(candidate, this.dynamicBattlefield).some((cell) =>
        this.units.some((other) => other.side !== unit.side
          && other.x === cell.x && other.y === cell.y))) continue;
      const defense = terrainDefensePercentFor(unit.classId, this.terrainSlotAt(candidate));
      if (defense >= bestDefense) {
        destination = candidate;
        bestDefense = defense;
      }
    }
    if (!destination) return undefined;
    const path = this.movementPath(unit.id, destination);
    return path.length > 1 ? path : undefined;
  }

  private onlyIceCapableSideRemains(side: BattleUnit["side"]): boolean {
    const survivors = this.units.filter((candidate) => candidate.side === side);
    return survivors.length > 0 && survivors.every(hasIceTechnique);
  }

  private expertAiEvaluationContext(): ExpertAiEvaluationContext {
    return {
      width: this.stage.width,
      height: this.stage.height,
      units: this.units,
      terrainSlotAt: (position) => this.terrainSlotAt(position),
      statsFor: (unit) => this.statsFor(unit),
      effectiveStatsFor: (unit) => this.effectiveStatsFor(unit),
      ...(this.activeAiPlanningCache ? {
        cache: this.activeAiPlanningCache.expert,
      } : {}),
    };
  }

  private cachedExpertUtility(
    key: string,
    build: () => ExpertAiUtility,
  ): ExpertAiUtility {
    const cache = this.activeAiPlanningCache;
    const cached = cache?.utilities.get(key);
    if (cached && cache) {
      cache.metrics.utilityHits += 1;
      return cloneExpertUtility(cached);
    }
    const utility = build();
    if (cache) {
      cache.utilities.set(key, cloneExpertUtility(utility));
      cache.metrics.utilityBuilds += 1;
    }
    return utility;
  }

  private exposureAt(
    actor: BattleUnit,
    position: Position,
    ignoredTargetId?: string,
  ): number {
    return expertExposureAt(
      this.expertAiEvaluationContext(),
      actor,
      position,
      ignoredTargetId,
    );
  }

  /**
   * Exact one-enemy-phase melee reach, used by ranged positioning and by the
   * REMAKE-090 named-leader landing. Unlike the broad exposure estimate, this
   * projects the candidate occupant, honors terrain entry costs, blockers and
   * ZOC, and only counts front-line roles.
   */
  private rangedRiskEvaluator(actor: BattleUnit): (position: Position) => RangedPositionRisk {
    const opponents = this.units.filter((opponent) => opponent.side !== actor.side);
    const meleeOpponents = opponents.filter((opponent) =>
      !opponent.actionDisabled && classCombatRole(opponent.classId) === "melee");
    const unitsWithoutActor = this.units.filter((candidate) => candidate.id !== actor.id);
    const broadReachByOpponent = new Map(meleeOpponents.map((opponent) => [
      opponent.id,
      new Set(reachableCells(
        opponent,
        unitsWithoutActor,
        this.statsFor(opponent).movement,
        this.dynamicBattlefield,
      ).map(positionKey)),
    ]));
    const actorStats = this.effectiveStatsFor(actor);
    const cache = new Map<string, RangedPositionRisk>();
    return (position: Position): RangedPositionRisk => {
      const key = positionKey(position);
      const cached = cache.get(key);
      if (cached) return cached;
      const projectedUnits = this.units.map((candidate) => candidate.id === actor.id
        ? { ...candidate, x: position.x, y: position.y }
        : candidate);
      const actorTerrainDefense = Math.floor(
        actorStats.defense
        * terrainDefensePercentFor(actor.classId, this.terrainSlotAt(position))
        / 100,
      );
      let meleeContactCount = 0;
      let meleeExpectedDamage = 0;
      for (const opponent of meleeOpponents) {
        const broadReach = broadReachByOpponent.get(opponent.id);
        if (!neighbors(position, this.dynamicBattlefield).some((cell) =>
          broadReach?.has(positionKey(cell)))) continue;
        // The broad map removes the prospective actor and cheaply rejects
        // distant cells. This exact second pass restores its blocking and ZOC
        // only for cells the opponent might actually contact.
        const canContact = reachableCells(
          opponent,
          projectedUnits,
          this.statsFor(opponent).movement,
          this.dynamicBattlefield,
        ).some((attackPosition) => manhattan(attackPosition, position) === 1);
        if (!canContact) continue;
        meleeContactCount += 1;
        const opponentStats = this.effectiveStatsFor(opponent);
        meleeExpectedDamage += Math.max(
          0,
          opponentStats.attack - actorStats.defense - actorTerrainDefense,
        ) + 11;
      }
      const risk = {
        adjacentEnemyCount: opponents.filter((opponent) =>
          manhattan(position, opponent) === 1).length,
        meleeContactCount,
        meleeExpectedDamage,
      };
      cache.set(key, risk);
      return risk;
    };
  }

  private expertOrdinaryUtility(
    actor: BattleUnit,
    target: BattleUnit,
    path: readonly Position[],
  ): ExpertAiUtility {
    return this.cachedExpertUtility(
      `ordinary:${actor.id}:${target.id}:${linePathKey(path)}`,
      () => expertOrdinaryUtility(this.expertAiEvaluationContext(), actor, target, path),
    );
  }

  private expertSpecialUtility(
    actor: BattleUnit,
    actionId: BattleActionId,
    target: BattleUnit,
    path: readonly Position[],
    linePath?: readonly Position[],
  ): ExpertAiUtility {
    return this.cachedExpertUtility(
      `special:${actor.id}:${actionId}:${target.id}:${linePathKey(path)}:${linePathKey(linePath ?? [])}`,
      () => expertSpecialUtility(
        this.expertAiEvaluationContext(),
        actor,
        actionId,
        target,
        path,
        linePath,
      ),
    );
  }

  private expertUtilityForAction(
    unit: BattleUnit,
    action: AlliedAiAction,
  ): ExpertAiUtility {
    const key = [
      "action",
      unit.id,
      action.kind,
      action.actionId ?? "",
      action.targetId ?? "",
      linePathKey(action.path),
      linePathKey(action.linePath ?? []),
      action.pursuitProgress ?? "",
      action.queueAdvance ? 1 : 0,
      action.trafficRelease ?? "",
      action.trafficProgress ?? "",
    ].join(":");
    return this.cachedExpertUtility(
      key,
      () => expertUtilityForAction(this.expertAiEvaluationContext(), unit, action),
    );
  }

  /** REMAKE-081 focuses direct damage without changing range/line total-value ranking. */
  private expectedRemainingLifeForDirectFocusAction(
    unit: BattleUnit,
    action: AlliedAiAction,
    utility: ExpertAiUtility = this.expertUtilityForAction(unit, action),
  ): number | undefined {
    const target = action.targetId ? this.unit(action.targetId) : undefined;
    if (!target || target.side === unit.side) return undefined;
    const directDamage = action.kind === "attack"
      || (action.kind === "special"
        && action.actionId !== undefined
        && isDirectFocusDamageActionId(action.actionId));
    return directDamage ? Math.max(0, target.life - utility.effectiveDamage) : undefined;
  }

  /** REMAKE-079 still breaks exact full-score ties between hostile damage actions. */
  private focusFireLifeForAction(
    unit: BattleUnit,
    action: AlliedAiAction,
  ): number | undefined {
    const target = action.targetId ? this.unit(action.targetId) : undefined;
    if (!target || target.side === unit.side) return undefined;
    if (action.kind === "attack") return target.life;
    return action.kind === "special"
      && action.actionId !== undefined
      && isDamagingActionId(action.actionId)
      ? target.life
      : undefined;
  }

  private vacantEngagementRouteCost(
    unit: BattleUnit,
    units: readonly BattleUnit[],
  ): number | undefined {
    const targetFilter = this.forces.targetFilterFor(unit.id, units);
    const targets = units
      .filter((candidate) => candidate.side !== unit.side
        && !candidate.actionDisabled
        && (targetFilter?.(candidate) ?? true))
      .flatMap((candidate) => neighbors(candidate, this.dynamicBattlefield));
    return movementCostsToNearestTarget(
      unit,
      targets,
      units,
      this.dynamicBattlefield,
    ).get(positionKey(unit));
  }

  /**
   * Bounded one-action counterfactual for REMAKE-060. It does not reserve a
   * future squad script: it only measures whether vacating the actor's current
   * attack cell gives still-unspent ordinary members of the same expert force
   * a real engagement route. The phase controller replans after the attack.
   */
  private expertTrafficRelief(
    actor: BattleUnit,
    destination: Position,
  ): { release: number; progress: number } {
    const force = this.forces.definitionForUnit(actor.id);
    if (force?.doctrine.strategy !== "expert"
      || positionKey(destination) === positionKey(actor)) {
      return { release: 0, progress: 0 };
    }
    const followers = this.forces.membersForUnit(actor.id, this.units)
      .filter((candidate) => candidate.id !== actor.id
        && !candidate.acted
        && !candidate.actionDisabled
        && classDefinition(candidate.classId).actionCategory === "ordinary"
        && (candidate.side === 1
          ? this.alliedBehaviorFor(candidate.id)
          : this.enemyBehaviorFor(candidate.id)) !== 1
        && !this.routePulseByActorId.has(candidate.id)
        && !this.escortRouteByActorId.has(candidate.id));
    if (followers.length === 0) return { release: 0, progress: 0 };

    const projectedUnits = this.units.map((candidate) => candidate.id === actor.id
      ? { ...candidate, x: destination.x, y: destination.y }
      : candidate);
    let release = 0;
    let progress = 0;
    for (const follower of followers) {
      const before = this.vacantEngagementRouteCost(follower, this.units);
      const projectedFollower = projectedUnits.find((candidate) => candidate.id === follower.id);
      if (!projectedFollower) continue;
      const after = this.vacantEngagementRouteCost(projectedFollower, projectedUnits);
      if (before === undefined && after !== undefined) {
        release += 1;
      } else if (before !== undefined && after === undefined) {
        release -= 1;
      } else if (before !== undefined && after !== undefined) {
        progress += before - after;
      }
    }
    return { release, progress };
  }

  private recordExpertDecision(
    unit: BattleUnit,
    candidates: readonly AlliedAiAction[],
    chosen: AlliedAiAction,
  ): void {
    const traces = candidates.map((action) => expertAiCandidateTrace(
      action,
      this.expertUtilityForAction(unit, action),
    )).sort((left, right) => right.score - left.score);
    const selected = expertAiCandidateTrace(chosen, this.expertUtilityForAction(unit, chosen));
    this.expertAiTraceByUnitId.set(unit.id, {
      unitId: unit.id,
      policy: "stable-remake-expert",
      chosen: selected,
      candidates: traces,
    });
  }

  expertAiDecisionTrace(id: string): ExpertAiDecisionTrace | undefined {
    const trace = this.expertAiTraceByUnitId.get(id);
    return trace ? structuredClone(trace) : undefined;
  }

  protected planOrdinaryAiAction(
    unit: BattleUnit,
    opponentSide: BattleUnit["side"],
    behavior: number,
    options: OrdinaryAiPlanningOptions = {},
  ): AlliedAiAction {
    const stats = this.statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (!options.expertRanking && lifePercent < (options.restThresholdPercent ?? 20)) {
      return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }

    const reachable = this.reachableCells(unit.id)
      .filter((position) => options.destinationFilter?.(position) ?? true);
    const reachableKeys = new Set(reachable.map(positionKey));
    const occupied = new Set(this.units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
    const enemies = this.units
      .filter((candidate) => candidate.side === opponentSide
        && !candidate.actionDisabled
        && (options.targetFilter?.(candidate) ?? true))
      .sort((left, right) => left.y * this.stage.width + left.x - (right.y * this.stage.width + right.x));
    const nativeCandidateOffsets = [
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
    ];
    let attackTarget: BattleUnit | undefined;
    let attackPosition: Position | undefined;
    let attackPath: Position[] | undefined;
    let attackPositionDefense = -1;
    const expertAttackCandidates: Array<{
      target: BattleUnit;
      position: Position;
      path: Position[];
      utility: ExpertAiUtility;
      trafficRelease: number;
      trafficProgress: number;
    }> = [];

    for (const enemy of enemies) {
      for (const offset of nativeCandidateOffsets) {
        const candidate = { x: enemy.x + offset.x, y: enemy.y + offset.y };
        const candidateKey = positionKey(candidate);
        if (!reachableKeys.has(candidateKey) || occupied.has(candidateKey)) continue;
        // REMAKE-090: a named leader keeps the native pursuit boundary and
        // strikes only from the cell it already holds, exactly like a guard.
        if (options.expertRanking
          && (behavior === 1 || options.namedLeaderCaution)
          && candidateKey !== positionKey(unit)) continue;
        const path = candidateKey === positionKey(unit)
          ? [{ x: unit.x, y: unit.y }]
          : this.movementPath(unit.id, candidate);
        if (path.length === 0 || !(options.pathFilter?.(path) ?? true)) continue;
        if (options.expertRanking) {
          expertAttackCandidates.push({
            target: enemy,
            position: candidate,
            path,
            utility: this.expertOrdinaryUtility(unit, enemy, path),
            trafficRelease: 0,
            trafficProgress: 0,
          });
          continue;
        }
        const defense = terrainDefensePercentFor(unit.classId, this.terrainSlotAt(candidate));
        if (defense >= attackPositionDefense) {
          attackTarget = enemy;
          attackPosition = candidate;
          attackPath = path;
          attackPositionDefense = defense;
        }
      }
    }

    if (options.expertRanking && expertAttackCandidates.length > 0) {
      expertAttackCandidates.sort((left, right) =>
        compareExpertFocusRanking(
          left.utility,
          Math.max(0, left.target.life - left.utility.effectiveDamage),
          right.utility,
          Math.max(0, right.target.life - right.utility.effectiveDamage),
        )
        || left.target.life - right.target.life
        || left.target.y * this.stage.width + left.target.x
          - (right.target.y * this.stage.width + right.target.x)
        || left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x));
      const baseline = expertAttackCandidates[0];
      let selected = baseline;
      const stationary = expertAttackCandidates.find((candidate) =>
        candidate.target.id === baseline.target.id
        && positionKey(candidate.position) === positionKey(unit));
      if (stationary && stationary.utility.guaranteedKills === 0) {
        const stationaryTacticalScore = expertTacticalScore(stationary.utility);
        const comparable = expertAttackCandidates.filter((candidate) =>
          candidate.target.id === stationary.target.id
          && expertTacticalScore(candidate.utility) === stationaryTacticalScore
          && candidate.utility.exposure <= stationary.utility.exposure);
        for (const candidate of comparable) {
          const relief = this.expertTrafficRelief(unit, candidate.position);
          candidate.trafficRelease = relief.release;
          candidate.trafficProgress = relief.progress;
        }
        if (comparable.some((candidate) =>
          candidate.trafficRelease > 0 || candidate.trafficProgress > 0)) {
          comparable.sort((left, right) => left.utility.exposure - right.utility.exposure
            || right.trafficRelease - left.trafficRelease
            || right.trafficProgress - left.trafficProgress
            || right.utility.terrainDefense - left.utility.terrainDefense
            || left.utility.pathLength - right.utility.pathLength
            || left.position.y * this.stage.width + left.position.x
              - (right.position.y * this.stage.width + right.position.x));
          selected = comparable[0];
        }
      }
      return {
        unitId: unit.id,
        kind: "attack",
        path: selected.path,
        targetId: selected.target.id,
        ...(selected.trafficRelease > 0
          ? { trafficRelease: selected.trafficRelease }
          : {}),
        ...(selected.trafficProgress > 0
          ? { trafficProgress: selected.trafficProgress }
          : {}),
      };
    }

    if (attackTarget && attackPosition && attackPath) {
      if (behavior === 1 && positionKey(attackPosition) !== positionKey(unit)) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      return { unitId: unit.id, kind: "attack", path: attackPath, targetId: attackTarget.id };
    }

    if (options.expertRanking) {
      if (lifePercent < (options.restThresholdPercent ?? 40)) {
        return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
      }
      if (behavior === 1) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const targets = enemies.flatMap((enemy) => neighbors(enemy, this.dynamicBattlefield));
      // REMAKE-090: a named leader ranks its pursuit landing by the exact
      // next-phase melee threat first, so it advances behind its escort
      // instead of spending the whole movement budget on the deepest cell.
      // Progress still gates every candidate, so the advance never stalls.
      const cautiousRiskAt = options.namedLeaderCaution
        ? this.rangedRiskEvaluator(unit)
        : undefined;
      const compareCautiousLanding = (
        left: RangedPositionRisk | undefined,
        right: RangedPositionRisk | undefined,
      ): number => left && right
        ? left.meleeContactCount - right.meleeContactCount
          || left.meleeExpectedDamage - right.meleeExpectedDamage
        : 0;
      const pursuitPositionFilter = options.destinationFilter && options.pathFilter
        ? options.destinationFilter
        : undefined;
      let pursuitCosts = movementCostsToNearestTarget(
        unit,
        targets,
        this.units,
        this.dynamicBattlefield,
        { positionFilter: pursuitPositionFilter },
      );
      let originCost = pursuitCosts.get(positionKey(unit));
      let queueAdvance = false;
      if (originCost === undefined) {
        pursuitCosts = movementCostsToNearestTarget(
          unit,
          targets,
          this.units,
          this.dynamicBattlefield,
          {
            positionFilter: pursuitPositionFilter,
            allowFriendlyOccupiedTargets: true,
          },
        );
        originCost = pursuitCosts.get(positionKey(unit));
        queueAdvance = originCost !== undefined;
      }
      if (originCost === undefined) {
        const originDistance = enemies.length > 0
          ? Math.min(...enemies.map((enemy) => manhattan(unit, enemy)))
          : Number.POSITIVE_INFINITY;
        const geometricCandidates = reachable
          .filter((position) => positionKey(position) !== positionKey(unit))
          .map((position) => ({
            position,
            path: this.movementPath(unit.id, position),
            distance: Math.min(...enemies.map((enemy) => manhattan(position, enemy))),
            exposure: this.exposureAt(unit, position),
            defense: terrainDefensePercentFor(unit.classId, this.terrainSlotAt(position)),
            cautiousRisk: cautiousRiskAt?.(position),
          }))
          .filter(({ path, distance }) => enemies.length > 0
            && path.length > 1
            && distance < originDistance
            && (options.pathFilter?.(path) ?? true))
          .sort((left, right) => compareCautiousLanding(left.cautiousRisk, right.cautiousRisk)
            || left.distance - right.distance
            || left.exposure - right.exposure
            || right.defense - left.defense
            || left.path.length - right.path.length
            || left.position.y * this.stage.width + left.position.x
              - (right.position.y * this.stage.width + right.position.x));
        const geometric = geometricCandidates[0];
        return geometric
          ? { unitId: unit.id, kind: "move", path: geometric.path }
          : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const movementCandidates = reachable
        .filter((position) => positionKey(position) !== positionKey(unit))
        .map((position) => {
          const path = this.movementPath(unit.id, position);
          const traveledCost = path.slice(1).reduce(
            (total, step) => total + movementCost(unit.classId, step, this.dynamicBattlefield),
            0,
          );
          return {
            position,
            path,
            traveledCost,
            remainingCost: pursuitCosts.get(positionKey(position)),
            defense: terrainDefensePercentFor(unit.classId, this.terrainSlotAt(position)),
            exposure: this.exposureAt(unit, position),
            cautiousRisk: cautiousRiskAt?.(position),
          };
        })
        .filter((candidate): candidate is typeof candidate & { remainingCost: number } =>
          candidate.remainingCost !== undefined
          && candidate.path.length > 1
          && candidate.traveledCost + candidate.remainingCost === originCost
          && (options.pathFilter?.(candidate.path) ?? true))
        .sort((left, right) => compareCautiousLanding(left.cautiousRisk, right.cautiousRisk)
          || left.remainingCost - right.remainingCost
          || left.exposure - right.exposure
          || right.defense - left.defense
          || left.path.length - right.path.length
          || left.position.y * this.stage.width + left.position.x
            - (right.position.y * this.stage.width + right.position.x));
      const selected = movementCandidates[0];
      return selected
        ? {
            unitId: unit.id,
            kind: "move",
            path: selected.path,
            pursuitProgress: originCost - selected.remainingCost,
            ...(queueAdvance ? { queueAdvance: true } : {}),
          }
        : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }

    if (unit.life < stats.maxLife) return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    if (behavior === 1) {
      return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }

    const pursuitTargets = enemies
      .map((enemy) => ({ x: enemy.x, y: enemy.y + 1 }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < this.stage.width && y < this.stage.height);
    const pursuitPath = routePath(unit, pursuitTargets, this.units, stats.movement, this.dynamicBattlefield);
    if (pursuitPath.length > 1
      && (options.destinationFilter?.(pursuitPath.at(-1)!) ?? true)
      && (options.pathFilter?.(pursuitPath) ?? true)) {
      return { unitId: unit.id, kind: "move", path: pursuitPath };
    }

    if (pursuitTargets.length > 0 && (options.destinationFilter || options.pathFilter)) {
      const originDistance = Math.min(...pursuitTargets.map((target) => manhattan(unit, target)));
      const constrained = reachable
        .map((position) => ({
          position,
          path: positionKey(position) === positionKey(unit)
            ? [{ x: unit.x, y: unit.y }]
            : this.movementPath(unit.id, position),
          distance: Math.min(...pursuitTargets.map((target) => manhattan(position, target))),
        }))
        .filter(({ path }) => path.length > 1 && (options.pathFilter?.(path) ?? true))
        .sort((left, right) => left.distance - right.distance
          || right.path.length - left.path.length
          || left.position.y * this.stage.width + left.position.x
            - (right.position.y * this.stage.width + right.position.x));
      const selected = constrained[0];
      if (selected && selected.distance < originDistance) {
        return { unitId: unit.id, kind: "move", path: selected.path };
      }
    }
    return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  planSpecialAiAction(id: string, actionId: BattleActionId): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.acted || unit.actionDisabled) return undefined;
    return this.withAiPlanningCache(() => this.planClassAction(unit, [actionId]));
  }

  protected planClassAction(
    unit: BattleUnit,
    requestedActionIds?: readonly BattleActionId[],
    options: ClassActionPlanningOptions = {},
  ): AlliedAiAction | undefined {
    const shootingActionId = shootingActionIdFor(unit.classId, unit.side);
    if (!shootingActionId && unit.statuses.techniqueSeal > 0) return undefined;
    const tier = classTierFor(unit);
    const actionIds: readonly BattleActionId[] = requestedActionIds
      ?? (shootingActionId
        ? [shootingActionId]
          : unit.classId === "sister"
          ? ["heal-1", "fire-1"]
          : unit.classId === "priest"
            ? ["fire-1", "recovery-1"]
          : unit.classId === "monk"
            ? ["heal-1", "recovery-1"]
          : unit.classId === "great-dragon-knight"
            ? tier === 1
              ? ["stomp-1"]
              : tier === 2
                ? ["stomp-2"]
                : ["stomp-3"]
          : unit.classId === "wizard"
            ? tier === 1
              ? ["ice-2"]
              : tier === 2
                ? ["ice-3"]
                : ["ice-4"]
          : unit.classId === "magic-master"
            ? tier === 1
              ? ["lightning-2"]
              : tier === 2
                ? ["lightning-3"]
                : ["lightning-4"]
          : unit.classId === "evil-mage"
            ? tier === 1
              ? ["fire-2"]
              : tier === 2
                ? ["fire-3"]
                : ["fire-4"]
          : unit.classId === "magic-priest"
            ? tier >= 3
              ? ["fire-2", "lightning-1", "recovery-1", "defense-down", "dispel"]
              : tier === 2
                ? ["fire-1", "lightning-1", "recovery-1", "defense-down"]
                : ["fire-1", "recovery-1", "defense-down"]
          : unit.classId === "prayer-guide"
            ? tier >= 3
              ? ["heal-2", "recovery-3", "defense-up"]
              : tier === 2
                ? ["heal-1", "recovery-2", "defense-up"]
                : ["heal-1", "recovery-1", "defense-up"]
          : unit.classId === "magic-guide"
            ? tier === 2
              ? ["heal-2", "recovery-1", "attack-up"]
              : tier === 1
                ? ["heal-1", "recovery-1", "attack-up"]
                : ["heal-3", "recovery-2", "attack-up", "magic-guard"]
          : unit.classId === "curse-master"
            ? tier >= 3
              ? ["heal-1", "attack-down", "confusion", "poison", "spell-seal"]
              : tier === 2
                ? ["heal-1", "attack-down", "confusion", "poison"]
              : ["heal-1", "attack-down", "confusion"]
          : unit.classId === "dragon" || unit.classId === "empress"
            ? ["wd"]
          : unit.classId === "magician" && options.expertRanking
            ? techniqueActionIdsFor(unit)
          : []);
    if (actionIds.length === 0) return undefined;

    const occupied = new Set(
      this.units.filter(({ id }) => id !== unit.id).map(positionKey),
    );
    const expertCandidates: Array<{
      action: AlliedAiAction;
      utility: ExpertAiUtility;
      actionOrder: number;
      expectedRemainingLife?: number;
      focusFireLife?: number;
      targetOrder: number;
      positionOrder: number;
    }> = [];
    let evaluateRangedRisk: ((position: Position) => RangedPositionRisk) | undefined;
    const rangedRiskAt = (position: Position): RangedPositionRisk => {
      evaluateRangedRisk ??= this.rangedRiskEvaluator(unit);
      return evaluateRangedRisk(position);
    };

    for (const [actionOrder, actionId] of actionIds.entries()) {
      if (!(options.actionFilter?.(actionId) ?? true)) continue;
      if (!this.canUseSpecialAction(unit, actionId)) continue;
      const definition = BATTLE_ACTION_DEFINITIONS[actionId];
      const shootingAction = isShootingActionId(actionId);
      const positions = (shootingAction
        ? this.reachableCells(unit.id)
        : [options.casterPosition ?? { x: unit.x, y: unit.y }])
        .filter((position) => !occupied.has(positionKey(position))
          && (options.positionFilter?.(position) ?? true));
      const candidates: Array<{
        position: Position;
        target: BattleUnit;
        path: Position[];
        linePath?: readonly Position[];
        missingLife: number;
        effectiveDefense: number;
        positionDefense: number;
        lethal: boolean;
        critical: boolean;
        utility: ExpertAiUtility;
        rangedRisk: RangedPositionRisk;
      }> = [];

      for (const position of positions) {
        const rangedRisk = shootingAction
          ? rangedRiskAt(position)
          : { adjacentEnemyCount: 0, meleeContactCount: 0, meleeExpectedDamage: 0 };
        if ((options.expertRanking || options.modernRanking)
          && actionId === "magic-archer-shot"
          && rangedRisk.adjacentEnemyCount > 0) continue;
        const rangeActor = { ...unit, x: position.x, y: position.y };
        const shootingActionId = isShootingActionId(actionId) ? actionId : undefined;
        const rangeSeed = shootingActionId
          ? BATTLE_ACTION_DEFINITIONS[shootingActionId].range.nativeSeed
          : "aiCandidateSelectionRadius" in definition.range
            ? definition.range.aiCandidateSelectionRadius
            : "selectionRadius" in definition.range
              ? definition.range.selectionRadius
              : 0;
        const range = this.planningActionRange(
          rangeActor,
          rangeSeed,
          shootingActionId !== undefined,
        );
        const path = positionKey(position) === positionKey(unit)
          ? [{ x: unit.x, y: unit.y }]
          : this.movementPath(unit.id, position);
        if (path.length === 0 || !(options.pathFilter?.(path) ?? true)) continue;

        for (const target of this.units) {
          const correctSide = definition.target === "ally"
            ? target.side === unit.side
            : target.side !== unit.side;
          if (!correctSide
            || range.valueAt(target) === 0
            || (!canTargetFrozenUnit(actionId) && target.actionDisabled)
            || !(options.targetFilter?.(target) ?? true)) continue;
          // REMAKE-099: a physical shot at a swift dragon knight is a
          // guaranteed zero, so no ranking mode may spend a turn on it. The
          // expert path also drops it via `waste`, but the native-style
          // ranking below has no such gate.
          if (shootingAction
            && actionId !== "magic-archer-shot"
            && immuneToPhysicalShootingFor(target.classId)) continue;
          // REMAKE-102: AA is a front-line buff, so a caster or shooter — the
          // 魔導師 itself included — is never a candidate. The expert path also
          // drops it via `waste`; this guard covers the native-style ranking.
          if (actionId === "attack-up" && classCombatRole(target.classId) !== "melee") continue;
          const targetStats = this.statsFor(target);
          const missingLife = targetStats.maxLife - target.life;
          if (definition.target === "ally"
            && actionId !== "dispel"
            && actionId !== "heal-2"
            && actionId !== "heal-3"
            && actionId !== "recovery-2"
            && actionId !== "recovery-3"
            && actionId !== "attack-up"
            && actionId !== "defense-up"
            && actionId !== "magic-guard"
            && missingLife <= 0) continue;
          const targetEffectiveStats = this.effectiveStatsFor(target);
          const effectiveDefense = targetEffectiveStats.defense + Math.floor(
            targetEffectiveStats.defense
            * terrainDefensePercentFor(target.classId, this.terrainSlotAt(target))
            / 100,
          );
          const linePaths: readonly (readonly Position[] | undefined)[] = actionId === "magic-archer-shot"
            ? this.planningShootingLinePaths(rangeActor, target, actionId)
            : [undefined];
          for (const linePath of linePaths) {
            const utility = this.expertSpecialUtility(unit, actionId, target, path, linePath);
            if (options.expertRanking && utility.waste > 0) continue;
            candidates.push({
              position,
              target,
              path,
              linePath,
              missingLife,
              effectiveDefense,
              positionDefense: terrainDefensePercentFor(unit.classId, this.terrainSlotAt(position)),
              lethal: (actionId === "fire-1" || actionId === "fire-2" || actionId === "fire-3"
                || actionId === "fire-4")
                && target.life <= Math.min(
                  BATTLE_ACTION_DEFINITIONS[actionId].damage.cap,
                  Math.floor(
                    targetStats.maxLife
                    * BATTLE_ACTION_DEFINITIONS[actionId].damage.maxLifePercent
                    / 100,
                  ),
                ),
              critical: definition.target === "ally"
                && actionId !== "dispel"
                && actionId !== "attack-up"
                && actionId !== "defense-up"
                && actionId !== "magic-guard"
                && target.life * 100 < targetStats.maxLife * 40,
              utility,
              rangedRisk,
            });
          }
        }
      }

      if (options.expertRanking) {
        candidates.sort((left, right) => (shootingAction
          ? (actionId === "magic-archer-shot"
              ? right.utility.effectiveDamage - left.utility.effectiveDamage
              : compareExpertAiPriorityBand(left.utility, right.utility)
                || compareFocusFireLife(
                  Math.max(0, left.target.life - left.utility.effectiveDamage),
                  Math.max(0, right.target.life - right.utility.effectiveDamage),
                ))
            || expertTacticalScore(right.utility) - expertTacticalScore(left.utility)
            || left.rangedRisk.meleeContactCount - right.rangedRisk.meleeContactCount
            || left.rangedRisk.meleeExpectedDamage - right.rangedRisk.meleeExpectedDamage
            || left.utility.exposure - right.utility.exposure
            || right.utility.terrainDefense - left.utility.terrainDefense
            || right.utility.firingDistance - left.utility.firingDistance
            || left.utility.pathLength - right.utility.pathLength
          : isDirectFocusDamageActionId(actionId)
            ? compareExpertFocusRanking(
                left.utility,
                Math.max(0, left.target.life - left.utility.effectiveDamage),
                right.utility,
                Math.max(0, right.target.life - right.utility.effectiveDamage),
              )
            : compareExpertAiUtility(left.utility, right.utility))
          || (isDamagingActionId(actionId) ? left.target.life - right.target.life : 0)
          || left.target.y * this.stage.width + left.target.x
            - (right.target.y * this.stage.width + right.target.x)
          || left.position.y * this.stage.width + left.position.x
            - (right.position.y * this.stage.width + right.position.x)
          || linePathKey(left.linePath ?? []).localeCompare(linePathKey(right.linePath ?? [])));
        const selected = candidates[0];
        if (selected) {
          expertCandidates.push({
            action: {
              unitId: unit.id,
              kind: "special",
              path: selected.path,
              targetId: selected.target.id,
              actionId,
              linePath: selected.linePath?.map((position) => ({ ...position })),
            },
            utility: selected.utility,
            actionOrder,
            ...(isDirectFocusDamageActionId(actionId) ? {
              expectedRemainingLife: Math.max(
                0,
                selected.target.life - selected.utility.effectiveDamage,
              ),
            } : {}),
            ...(isDamagingActionId(actionId) ? { focusFireLife: selected.target.life } : {}),
            targetOrder: selected.target.y * this.stage.width + selected.target.x,
            positionOrder: selected.position.y * this.stage.width + selected.position.x,
          });
        }
        continue;
      }

      candidates.sort((left, right) => {
        if (options.modernRanking && left.lethal !== right.lethal) return left.lethal ? -1 : 1;
        if (options.modernRanking && left.critical !== right.critical) return left.critical ? -1 : 1;
        if (definition.target === "ally" && actionId !== "dispel"
          && left.missingLife !== right.missingLife) {
          return right.missingLife - left.missingLife;
        }
        if (actionId === "heal-2"
          || actionId === "heal-3"
          || actionId === "recovery-2"
          || actionId === "recovery-3"
          || actionId === "attack-up"
          || actionId === "defense-up"
          || actionId === "magic-guard") {
          const laterTargetFirst = right.target.y * this.stage.width + right.target.x
            - (left.target.y * this.stage.width + left.target.x);
          if (laterTargetFirst !== 0) return laterTargetFirst;
        }
        if ((definition.target !== "ally" || actionId === "dispel")
          && left.effectiveDefense !== right.effectiveDefense) {
          return left.effectiveDefense - right.effectiveDefense;
        }
        if (left.target.life !== right.target.life) return left.target.life - right.target.life;
        if (left.path.length !== right.path.length) return left.path.length - right.path.length;
        if (left.positionDefense !== right.positionDefense) {
          return right.positionDefense - left.positionDefense;
        }
        const targetOrder = left.target.y * this.stage.width + left.target.x
          - (right.target.y * this.stage.width + right.target.x);
        if (targetOrder !== 0) return targetOrder;
        return left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x);
      });
      const selected = candidates[0];
      if (selected) {
        return {
          unitId: unit.id,
          kind: "special",
          path: selected.path,
          targetId: selected.target.id,
          actionId,
          linePath: selected.linePath?.map((position) => ({ ...position })),
        };
      }
    }
    if (options.expertRanking) {
      expertCandidates.sort((left, right) => compareExpertFocusRanking(
        left.utility,
        left.expectedRemainingLife,
        right.utility,
        right.expectedRemainingLife,
      )
        || compareFocusFireLife(left.focusFireLife, right.focusFireLife)
        || left.actionOrder - right.actionOrder
        || left.targetOrder - right.targetOrder
        || left.positionOrder - right.positionOrder);
      return expertCandidates[0]?.action;
    }
    return undefined;
  }

  spendAction(id: string): boolean {
    const unit = this.unit(id);
    if (!unit || unit.acted || unit.actionDisabled) return false;
    unit.acted = true;
    this.focusId = id;
    return true;
  }

  clearActionState(side: BattleUnit["side"]): void {
    for (const unit of this.units) {
      if (unit.side === side) unit.acted = false;
    }
  }

  clearActionDisableState(side: BattleUnit["side"]): void {
    for (const unit of this.units) {
      if (unit.side === side) unit.actionDisabled = false;
    }
  }

  enemyMovementRange(id: string): Position[] {
    const unit = this.unit(id);
    const route = this.scenario.routeEnemy;
    if (!unit || unit.side !== 2 || unit.actionDisabled) return [];
    return route
      ? reachableCells(unit, this.units, route.movement, this.dynamicBattlefield)
      : this.reachableCells(id);
  }

  alliedActionOrder(includeManual: boolean): string[] {
    return this.units
      .filter((unit) => unit.side === 1
        && !unit.acted
        && !unit.actionDisabled
        && (includeManual || !this.isPlayerControllableAlly(unit.id)))
      .sort((left, right) =>
        (left.y * this.stage.width + left.x) - (right.y * this.stage.width + right.x))
      .map(({ id }) => id);
  }

  /**
   * REMAKE-037 gives default side-1 automatic actions the same squad-level
   * reservation boundary as side 2. Explicit route, terrain-hold and follow
   * strategies keep their authored row-major order.
   */
  selectNextAlliedAiAction(
    candidateIds: readonly string[],
    leaderId?: string,
  ): AiActionSelection | undefined {
    return this.withAiPlanningCache(() => {
      const candidates = new Set(candidateIds);
      const stableOrder = this.alliedActionOrder(true).filter((id) => candidates.has(id));
      if (stableOrder.length === 0) return undefined;
      const hasExplicitStrategy = leaderId !== undefined || stableOrder.some((id) =>
        this.routePulseByActorId.has(id)
        || this.escortRouteByActorId.has(id)
        || this.forces.definitionForUnit(id)?.doctrine.strategy === "terrain-hold");
      if (hasExplicitStrategy) {
        const unitId = stableOrder[0];
        const unit = this.unit(unitId);
        const action = !unit?.statuses.confusion
          ? this.planAlliedAiAction(unitId, leaderId)
          : undefined;
        return {
          unitId,
          ...(action ? { action } : {}),
        };
      }

      const planned = stableOrder.map((id, order) => {
        const unit = this.unit(id);
        const action = unit?.statuses.confusion
          ? undefined
          : this.planAlliedAiAction(id);
        const utility = unit && action
          ? this.expertUtilityForAction(unit, action)
          : undefined;
        const expectedRemainingLife = unit && action && utility
          ? this.expectedRemainingLifeForDirectFocusAction(unit, action, utility)
          : undefined;
        const focusFireLife = unit && action
          ? this.focusFireLifeForAction(unit, action)
          : undefined;
        return { id, utility, expectedRemainingLife, order, action, focusFireLife };
      });
      const nonIceCandidates = planned.filter(({ action }) => !isIceActionId(action?.actionId));
      const selected = (nonIceCandidates.length > 0 ? nonIceCandidates : planned)
        .sort((left, right) => {
          if (!left.utility || !right.utility) {
            if (left.utility) return -1;
            if (right.utility) return 1;
            return left.order - right.order;
          }
          return compareExpertFocusRanking(
            left.utility,
            left.expectedRemainingLife,
            right.utility,
            right.expectedRemainingLife,
          ) || compareFocusFireLife(left.focusFireLife, right.focusFireLife)
            || left.order - right.order;
        })[0];
      return selected ? {
        unitId: selected.id,
        ...(selected.action ? { action: selected.action } : {}),
      } : undefined;
    });
  }

  nextAlliedActionId(candidateIds: readonly string[], leaderId?: string): string | undefined {
    return this.selectNextAlliedAiAction(candidateIds, leaderId)?.unitId;
  }

  enemyActionOrder(): string[] {
    return this.units
      .filter((unit) => unit.side === 2 && !unit.acted && !unit.actionDisabled)
      .sort((left, right) => {
        const priority = (this.scenario.enemyClassPriority[left.classId] ?? Number.MAX_SAFE_INTEGER)
          - (this.scenario.enemyClassPriority[right.classId] ?? Number.MAX_SAFE_INTEGER);
        if (priority !== 0) return priority;
        return (left.y * this.stage.width + left.x) - (right.y * this.stage.width + right.x);
      })
      .map((unit) => unit.id);
  }

  /**
   * REMAKE-033 chooses one actor from the still-unspent phase queue, then the
   * controller asks again after that action commits. This is the squad-level
   * reservation boundary: later units see deaths, healing, statuses and newly
   * occupied cells instead of following a stale phase-start script.
   */
  selectNextEnemyAiAction(candidateIds: readonly string[]): AiActionSelection | undefined {
    return this.withAiPlanningCache(() => {
      const candidates = new Set(candidateIds);
      const nativeOrder = this.enemyActionOrder().filter((id) => candidates.has(id));
      if (nativeOrder.length === 0) return undefined;
      if (this.hasRouteEnemy()) return { unitId: nativeOrder[0] };
      const planned = nativeOrder
        .map((id, stableOrder) => {
          const unit = this.unit(id);
          const action = unit?.statuses.confusion
            ? undefined
            : this.planEnemyAiAction(id);
          const utility = unit && action
            ? this.expertUtilityForAction(unit, action)
            : undefined;
          const expectedRemainingLife = unit && action && utility
            ? this.expectedRemainingLifeForDirectFocusAction(unit, action, utility)
            : undefined;
          const focusFireLife = unit && action
            ? this.focusFireLifeForAction(unit, action)
            : undefined;
          return {
            id,
            utility,
            expectedRemainingLife,
            stableOrder,
            action,
            focusFireLife,
          };
        });
      const nonIceCandidates = planned.filter(({ action }) => !isIceActionId(action?.actionId));
      const selected = (nonIceCandidates.length > 0 ? nonIceCandidates : planned)
        .sort((left, right) => {
          if (!left.utility || !right.utility) {
            if (left.utility) return -1;
            if (right.utility) return 1;
            return left.stableOrder - right.stableOrder;
          }
          return compareExpertFocusRanking(
            left.utility,
            left.expectedRemainingLife,
            right.utility,
            right.expectedRemainingLife,
          ) || compareFocusFireLife(left.focusFireLife, right.focusFireLife)
            || left.stableOrder - right.stableOrder;
        })[0];
      return selected ? {
        unitId: selected.id,
        ...(selected.action ? { action: selected.action } : {}),
      } : undefined;
    });
  }

  nextEnemyActionId(candidateIds: readonly string[]): string | undefined {
    return this.selectNextEnemyAiAction(candidateIds)?.unitId;
  }

  planRouteEnemy(id: string): RouteMoveResult | undefined {
    const unit = this.unit(id);
    const definition = this.scenario.routeEnemy;
    if (!unit || unit.side !== 2 || unit.actionDisabled || !definition) return undefined;
    const plan = planNativeStageRoute(
      unit,
      this.units,
      definition.target,
      definition.movement,
      this.dynamicBattlefield,
    );
    // 1000:1876 只读行动结束后的格号，所以途经撤离区但停在区外的单位不会离场。
    return {
      path: plan.path.map((position) => ({ ...position })),
      destination: { ...plan.destination },
      reachedExit: definition.isExit(plan.destination),
    };
  }

  hasRouteEnemy(): boolean {
    return this.scenario.routeEnemy !== undefined;
  }

  enemyPhaseTailExecutionCount(): number {
    return this.scenario.enemyPhaseTail?.executions ?? 0;
  }

  prepareEnemyPhaseTail(): PreparedEnemyPhaseTail | undefined {
    return this.scenario.enemyPhaseTail?.prepare(
      this.units,
      this.scenario.width,
      this.scenario.height,
    );
  }

  commitEnemyPhaseTail(prepared: PreparedEnemyPhaseTail): void {
    const definition = this.scenario.enemyPhaseTail;
    if (!definition || definition.id !== prepared.definitionId) {
      throw new Error(`Unknown enemy phase tail ${prepared.definitionId}`);
    }
    commitEnemyPhaseTail(prepared, this.units);
  }

  moveRouteEnemy(id: string): RouteMoveResult | undefined {
    const movement = this.planRouteEnemy(id);
    if (!movement) return undefined;
    const steps = movement.path.slice(1);
    for (let index = 0; index < steps.length; index += 1) {
      if (!this.moveUnitStep(id, steps[index], index < steps.length - 1)) break;
    }
    if (movement.reachedExit) this.evacuateEnemy(id);
    return movement;
  }

  evacuateEnemy(id: string): boolean {
    const unit = this.unit(id);
    const route = this.scenario.routeEnemy;
    if (!unit || unit.side !== 2 || !route?.isExit(unit)) return false;
    this.units = this.units.filter((candidate) => candidate.id !== id);
    if (this.focusId === id && this.unit("1:0")) this.focusId = "1:0";
    return true;
  }

  startNextRound(): void {
    this.round += 1;
    for (const unit of this.units) {
      unit.acted = false;
      if (unit.statuses.poison > 0) {
        // REMAKE-004 keeps poisoned units alive. REMAKE-013 skips persistent
        // damage while the unit is still frozen, but the status duration is
        // consumed normally. This must precede side-2 thawing below.
        if (!unit.actionDisabled) this.setSharedLife(unit, Math.max(1, Math.floor(unit.life / 2)));
        this.recordCampaignUnit(unit);
      }
    }
    const updatedStateIds = new Set<string>();
    for (const unit of this.units) {
      const stateId = waterWarriorRootId(unit) ?? unit.id;
      if (updatedStateIds.has(stateId)) continue;
      updatedStateIds.add(stateId);
      unit.statuses.poison = tickTimedStatus(unit.statuses.poison);
      unit.statuses.attackUp = tickTimedStatus(unit.statuses.attackUp);
      unit.statuses.defenseUp = tickTimedStatus(unit.statuses.defenseUp);
      unit.statuses.magicGuard = tickTimedStatus(unit.statuses.magicGuard);
      unit.statuses.confusion = tickTimedStatus(unit.statuses.confusion);
      unit.statuses.attackDown = tickTimedStatus(unit.statuses.attackDown);
      unit.statuses.defenseDown = tickTimedStatus(unit.statuses.defenseDown);
      unit.statuses.techniqueSeal = tickTimedStatus(unit.statuses.techniqueSeal);
      if (unit.side === 2) unit.actionDisabled = false;
      this.synchronizeWaterWarriorState(unit);
    }
    if (this.unit("1:0")) this.focusId = "1:0";
  }

  /** `REMAKE-110` 的每关回合上限。目前是全局常量，逐关差异化需要新的规则身份。 */
  get roundLimit(): number {
    return STAGE_ROUND_LIMIT;
  }

  /** 含本回合在内还能打几个完整回合；越过上限后为 0。 */
  get roundsRemaining(): number {
    return Math.max(0, STAGE_ROUND_LIMIT - this.round + 1);
  }

  /**
   * 给玩家看的回合号。越过上限的那一档只是回合边界上的判负标记，玩家并没有打第
   * 100 个回合，所以回合框停在最后一个真的打过的回合。
   */
  get displayRound(): number {
    return Math.min(this.round, STAGE_ROUND_LIMIT);
  }

  get roundLimitExceeded(): boolean {
    return this.round > STAGE_ROUND_LIMIT;
  }

  /** 进入倒数警告区间；越过上限后战斗已结束，不再报警告。 */
  get roundLimitWarningActive(): boolean {
    return !this.roundLimitExceeded
      && this.roundsRemaining <= STAGE_ROUND_LIMIT_WARNING_ROUNDS;
  }

  outcome(): BattleOutcome {
    if (this.pendingTransformations.length > 0) return "ongoing";
    const objectiveOutcome = battleOutcomeForObjective(this.units, this.stage.objective);
    // REMAKE-110 的逾时判负只接管「目标还没分出结果」的局面：第 99 回合内打出的胜利
    // 照常成立。回合号越过上限时目标必定仍未达成——每次行动和敌方阶段结束都会结算一次
    // 胜负，真打赢了根本走不到这个回合边界——所以这里不需要再定义两者的优先级。
    if (objectiveOutcome !== "ongoing") return objectiveOutcome;
    return this.roundLimitExceeded ? "defeat" : "ongoing";
  }

  snapshot(): object {
    return {
      round: this.round,
      focusId: this.focusId,
      rngState: this.rng.state,
      rngCalls: this.rng.calls,
      units: this.units.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
      terrainOverrides: this.terrainOverrides.map((override) => ({ ...override })),
      outcome: this.outcome(),
    };
  }

  serializableSnapshot(): Pick<SavedBattleState, "round" | "focusId" | "units" | "enemyAi" | "terrainOverrides"> {
    if (this.pendingTransformations.length > 0) {
      throw new Error("cannot save while a unit transformation is pending");
    }
    return {
      round: this.round,
      focusId: this.focusId,
      units: this.units.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
      terrainOverrides: this.terrainOverrides.map((override) => ({ ...override })),
    };
  }

  campaignSnapshot(): CampaignState {
    const rosterBySlot = new Map(this.campaignRoster.map((entry) => [entry.slot, { ...entry }]));
    for (const unit of this.units) {
      if (unit.side !== 1 || !this.campaignUnitSlots.has(unit.slot)) continue;
      rosterBySlot.set(unit.slot, {
        slot: unit.slot,
        classId: unit.classId,
        experience: unit.experience,
        life: unit.life,
      });
    }
    return {
      stageId: this.stage.id,
      ruleset: "stableRemake",
      difficulty: this.difficulty,
      roster: [...rosterBySlot.values()].sort((left, right) => left.slot - right.slot),
      recordCounters: [...this.campaignRecordCounters],
      rngState: this.rng.state,
      rngCalls: this.rng.calls,
    };
  }

  private recordCampaignUnit(unit: BattleUnit): void {
    if (unit.side !== 1 || !this.campaignUnitSlots.has(unit.slot)) return;
    const index = this.campaignRoster.findIndex(({ slot }) => slot === unit.slot);
    const entry = {
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    };
    if (index >= 0) this.campaignRoster[index] = entry;
    else this.campaignRoster.push(entry);
  }
}
