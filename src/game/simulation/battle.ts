import {
  classTierFor,
  classDefinition,
  className,
  killRewardFor,
  ordinaryHitStatusFor,
  suppressesOrdinaryCounterFor,
  terrainDefensePercentFor,
} from "../content/classes";
import { BATTLE_ACTION_DEFINITIONS, techniqueActionIdsFor } from "../content/actions";
import { STAGE0, STAGE0_AI_CLASS_PRIORITY, STAGE0_IRON_PLATE_TERRAIN_SLOT, STAGE0_OBSTACLE_TERRAIN_SLOT, completeCampaignRoster, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import { STAGE0_DEFINITION, type StageDefinition } from "../content/stages";
import type { AttackResult, BattleOutcome, BattleUnit, CampaignState, Difficulty, DynamicTerrainKind, DynamicTerrainOverride, Position, SaveRosterEntry, SavedBattleState, UnitStats, UnitStatuses } from "../types";
import { DeterministicRng } from "./rng";
import { constructionPath, constructionReachableCells, manhattan, movementCost, movementPath as findMovementPath, neighbors, positionKey, reachableCells, routePath, shortestPath, type GridBattlefield } from "./grid";
import {
  promoteUnit,
  promotionQueue,
  type PromotionCommitResult,
} from "./promotion";
import type { ClassId } from "../content/classes";
import {
  shootingRange,
  NumericRangeMap,
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
import { effectiveAttack, effectiveDefense, tickTimedStatus, UNIT_STATUS_KEYS } from "./status";
import { battleOutcomeForObjective } from "./objectives";
import {
  hasModernDamageActionThisTurn,
  planModernEnemyAction,
  type ModernEnemyAiContext,
} from "./enemy-ai";
import {
  ForceRegistry,
  type ForceDefinition,
} from "./forces";
import { planTerrainHoldForceAiAction } from "./force-ai";
import type {
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

export type {
  AlliedAiAction,
  ClassActionPlanningOptions,
  EnemyAiIntent,
  EnemyPhaseUpdate,
  OrdinaryAiPlanningOptions,
} from "./ai-contracts";

const ACTION_CLASSES: Readonly<Record<BattleActionId, readonly ClassId[]>> = {
  "archer-shot": ["archer"],
  "crossbow-shot": ["crossbow"],
  "magic-archer-shot": ["magic-archer"],
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

function applyActiveOrdinaryHitStatus(attacker: BattleUnit, defender: BattleUnit): void {
  const status = ordinaryHitStatusFor(attacker.classId);
  if (status) defender.statuses[status.key] = status.counter;
}

function canUseSpecialAction(actor: BattleUnit, actionId: BattleActionId): boolean {
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
  return !actor.acted
    && !actor.actionDisabled
    && (nativeTechniqueAction || ACTION_CLASSES[actionId].includes(actor.classId))
    && (actionId === "archer-shot" || actionId === "crossbow-shot"
      || actionId === "magic-archer-shot" || actor.statuses.techniqueSeal === 0);
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
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  alliedBehaviorById?: ReadonlyMap<string, number>;
  enemyBehaviorById?: ReadonlyMap<string, number>;
  forces?: readonly ForceDefinition[];
  routePulses?: readonly RoutePulseDefinition[];
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
  private readonly campaignUnitSlots: ReadonlySet<number>;
  protected readonly forces: ForceRegistry;
  private readonly routePulseByActorId: ReadonlyMap<string, RoutePulseDefinition>;
  private readonly terrainOverrideByPosition = new Map<string, DynamicTerrainKind>();

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
    this.campaignRoster = scenario.createCampaignRoster(difficulty);
    this.campaignUnitSlots = new Set(
      this.units.filter(({ side }) => side === 1).map(({ slot }) => slot),
    );
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
      unit.classId = entry.classId;
      unit.className = className(entry.classId);
      unit.experience = entry.experience;
      unit.life = entry.life;
    }
    battle.campaignRoster.splice(
      0,
      battle.campaignRoster.length,
      ...completeCampaignRoster(campaign.roster),
    );
    return battle;
  }

  restore(
    snapshot: RestorableBattleSnapshot,
    campaignRoster?: readonly SaveRosterEntry[],
  ): void {
    this.round = snapshot.round;
    this.focusId = snapshot.focusId;
    this.units = snapshot.units.map((unit) => ({
      ...unit,
      statuses: { ...unit.statuses },
    }));
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
    this.forces.assertKnownUnits(this.units);
    if (campaignRoster) {
      this.campaignRoster.splice(
        0,
        this.campaignRoster.length,
        ...completeCampaignRoster(campaignRoster),
      );
    }
  }

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
    return findMovementPath(unit, destination, this.units, this.dynamicBattlefield);
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
    return movementBudget === undefined
      ? reachableCells(unit, this.units, undefined, this.dynamicBattlefield)
      : reachableCells(unit, this.units, movementBudget, this.dynamicBattlefield);
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

    const attackerStats = this.effectiveStatsFor(attacker);
    const defenderStats = this.effectiveStatsFor(defender);
    const terrainDefense = Math.floor(
      defenderStats.defense
      * terrainDefensePercentFor(defender.classId, this.terrainSlotAt(defender))
      / 100,
    );
    const damage = Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense)
      + this.rng.between(4, 7)
      + this.rng.between(4, 7);
    defender.life = Math.max(0, defender.life - damage);

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
      const primaryCounterCandidate = defender.classId === "bone-knight"
        && (this.rng.nextUint() & 1) === 1;
      counterDamage = primaryCounterCandidate
        ? damage
        : Math.floor(Math.max(0, defenderStats.attack - attackerStats.defense - attackerTerrainDefense) / 2);
      attacker.life = Math.max(0, attacker.life - counterDamage);
    }
    // Native 0000:92DC applies the class status once from the original
    // attacker/defender pair; the counter branch only resolves damage.
    applyActiveOrdinaryHitStatus(attacker, defender);

    const defenderDied = defender.life === 0;
    const attackerDied = attacker.life === 0;
    const reward = killRewardFor(defender.classId, defender.side);
    const experienceGained = defenderDied ? reward + this.rng.between(4, 7) : defenderStats.level + this.rng.between(4, 7);
    attacker.experience += experienceGained;
    attacker.acted = true;
    this.recordCampaignUnit(attacker);
    this.recordCampaignUnit(defender);

    if (defenderDied) this.units = this.units.filter((unit) => unit.id !== defender.id);
    if (attackerDied) this.units = this.units.filter((unit) => unit.id !== attacker.id);
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
    };
  }

  actionRange(actorId: string, actionId: BattleActionId): NumericRangeMap {
    const actor = this.unit(actorId);
    if (!actor || !canUseSpecialAction(actor, actionId)) {
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
    if (actionId === "archer-shot" || actionId === "crossbow-shot" || actionId === "magic-archer-shot") {
      return shootingRange(actor, battlefield, BATTLE_ACTION_DEFINITIONS[actionId].range.nativeSeed);
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

  actionTargetCells(actorId: string, actionId: BattleActionId): Position[] {
    const actor = this.unit(actorId);
    if (!actor || !canUseSpecialAction(actor, actionId)) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const range = this.actionRange(actorId, actionId);
    if (isConstructionAction(actionId)) return range.cells();
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
    if (!actor || !canUseSpecialAction(actor, actionId)) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    if (isConstructionAction(actionId)) return [];
    if (definition.target === "self-area") return [];
    const range = this.actionRange(actorId, actionId);
    return this.units.filter((target) =>
      range.valueAt(target) > 0
      && (definition.target === "ally"
        ? target.side === actor.side
        : target.side !== actor.side)
      && (canTargetFrozenUnit(actionId) || !target.actionDisabled));
  }

  prepareSpecialAction(intent: BattleActionIntent): PreparedBattleAction {
    if (isConstructionAction(intent.actionId)) throw new Error("construction uses its own prepare path");
    const actor = this.unit(intent.actorId);
    const target = intent.targetId ? this.unit(intent.targetId) : undefined;
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    const requestedCenter = intent.target ?? (target ? { x: target.x, y: target.y } : undefined);
    const selfCentered = definition.target === "self-area";
    const center = selfCentered && actor
      ? { x: actor.x, y: actor.y }
      : requestedCenter;
    const legalCell = selfCentered
      ? Boolean(actor
        && !intent.targetId
        && (!intent.target || (intent.target.x === actor.x && intent.target.y === actor.y)))
      : Boolean(center && this.actionTargetCells(intent.actorId, intent.actionId)
        .some(({ x, y }) => x === center.x && y === center.y));
    if (
      !actor
      || !center
      || !canUseSpecialAction(actor, intent.actionId)
      || !legalCell
      || (definition.target !== "self-area" && !target)
    ) {
      throw new Error("illegal special action");
    }
    const requestedViewportOrigin = intent.viewportOrigin ?? this.stage.viewport.initialOrigin;
    const originBounds = this.stage.viewport.originBounds;
    const viewportOrigin = {
      x: Math.max(originBounds.min.x, Math.min(originBounds.max.x, requestedViewportOrigin.x)),
      y: Math.max(originBounds.min.y, Math.min(originBounds.max.y, requestedViewportOrigin.y)),
    };
    const resolvedIntent = intent.actionId === "stomp-1"
      || intent.actionId === "stomp-2"
      || intent.actionId === "stomp-3"
      ? { ...intent, viewportOrigin }
      : intent;
    return resolveSpecialAction(
      resolvedIntent,
      actor,
      target,
      this.rng,
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
      || !canUseSpecialAction(actor, prepared.intent.actionId)
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
    actor.acted = true;
    for (const affected of prepared.affectedUnits) {
      const unit = this.unit(affected.unitId);
      if (!unit) throw new Error("stale prepared special action");
      unit.x = affected.positionAfter.x;
      unit.y = affected.positionAfter.y;
      unit.life = affected.lifeAfter;
      if (affected.prayerOutcome) unit.experience = affected.experienceAfter;
      unit.actionDisabled = affected.actionDisabledAfter;
      unit.statuses = { ...affected.statusesAfter };
      this.recordCampaignUnit(unit);
    }
    this.recordCampaignUnit(actor);
    const deadIds = new Set(
      prepared.affectedUnits.filter(({ died }) => died).map(({ unitId }) => unitId),
    );
    if (deadIds.size > 0) this.units = this.units.filter(({ id }) => !deadIds.has(id));
    this.focusId = this.unit(actor.id)?.id
      ?? prepared.result.targetId
      ?? this.units[0]?.id
      ?? actor.id;
    return prepared.result;
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
    unit.life = affected.lifeAfter;
    unit.experience = affected.experienceAfter;
    unit.statuses = { ...affected.statusesAfter };
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
    if (!actor || !canUseSpecialAction(actor, actionId)) {
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
      || !canUseSpecialAction(actor, prepared.actionId)
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
    unit.life += recovered;
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
    if (unit.statuses.confusion > 0) return this.planConfusedAiAction(unit);

    const routePulse = this.routePulseByActorId.get(id);
    if (routePulse) {
      return {
        unitId: id,
        kind: "route-pulse",
        path: planRoutePulsePath(routePulse, unit, this.units, this.dynamicBattlefield),
      };
    }

    const doctrine = this.forces.definitionForUnit(id)?.doctrine;
    if (doctrine?.strategy === "terrain-hold") {
      return this.planTerrainHoldAiAction(unit, doctrine);
    }

    const behavior = this.alliedBehaviorFor(id);
    const forceMembers = this.forces.membersForUnit(id, this.units);
    const automaticLeader = behavior >= 4 && behavior % 2 === 0
      ? (forceMembers.length > 0 ? forceMembers : this.units).find((candidate) =>
        candidate.side === unit.side
        && this.alliedBehaviorFor(candidate.id) === behavior - 1)
      : undefined;
    if (automaticLeader && automaticLeader.id !== unit.id) {
      const leaderPath = shortestPath(
        unit,
        automaticLeader,
        unit.classId,
        this.statsFor(unit).movement,
        this.units.filter((candidate) => candidate.id !== unit.id),
        this.dynamicBattlefield,
      );
      if (leaderPath.length === 0) {
        const path = routePath(
          unit,
          neighbors(automaticLeader, this.dynamicBattlefield),
          this.units,
          this.statsFor(unit).movement,
          this.dynamicBattlefield,
        );
        if (path.length > 1) return { unitId: id, kind: "move", path };
      }
    }

    const classAction = this.planClassAction(unit);
    if (classAction) return classAction;

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

    return this.planOrdinaryAiAction(unit, 2, behavior);
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
      unit.life = affected.lifeAfter;
      this.recordCampaignUnit(unit);
    }
    this.recordCampaignUnit(actor);
    const deadIds = new Set(
      prepared.affectedUnits.filter(({ died }) => died).map(({ unitId }) => unitId),
    );
    if (deadIds.size > 0) this.units = this.units.filter(({ id }) => !deadIds.has(id));
    this.focusId = this.unit(actor.id)?.id ?? this.units[0]?.id ?? actor.id;
    return prepared;
  }

  planEnemyAiAction(id: string, behavior = this.enemyBehaviorFor(id)): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    if (unit.statuses.confusion > 0) return this.planConfusedAiAction(unit);
    const doctrine = this.forces.definitionForUnit(id)?.doctrine;
    if (doctrine?.strategy === "terrain-hold") {
      return this.planTerrainHoldAiAction(unit, doctrine);
    }
    const stats = this.statsFor(unit);
    const tier = classTierFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < 20) {
      return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }
    const targetFilter = this.forces.targetFilterFor(id, this.units);
    if (unit.classId === "sister" && unit.statuses.techniqueSeal === 0) {
      const actionId: BattleActionId = this.rng.between(0, 1) === 0 ? "fire-1" : "heal-1";
      const special = this.planClassAction(
        unit,
        [actionId],
        actionId === "fire-1" ? { targetFilter } : undefined,
      );
      if (special) return special;
    }
    if (unit.classId === "priest" && unit.statuses.techniqueSeal === 0) {
      const actionId: BattleActionId = this.rng.between(0, 1) === 0 ? "fire-1" : "recovery-1";
      const special = this.planClassAction(
        unit,
        [actionId],
        actionId === "fire-1" ? { targetFilter } : undefined,
      );
      if (special) return special;
    }
    if (unit.classId === "monk" && unit.statuses.techniqueSeal === 0) {
      const actionId: BattleActionId = this.rng.between(0, 1) === 0 ? "heal-1" : "recovery-1";
      const special = this.planSpecialAiAction(id, actionId);
      if (special) return special;
    }
    if ((unit.classId === "prayer-guide" || unit.classId === "magic-guide")
      && unit.statuses.techniqueSeal === 0) {
      const available: readonly (BattleActionId | undefined)[] = unit.classId === "prayer-guide"
        ? tier >= 3
          // Native slot 4 is SM, not OJ. SM has no action row; keep the slot
          // so its draw falls through instead of inflating the other odds.
          ? ["heal-2", "recovery-3", "defense-up", undefined]
          : tier === 2
            ? ["heal-1", "recovery-2", "defense-up"]
            : ["heal-1", "recovery-1", "defense-up"]
        : tier === 2
          ? ["heal-2", "recovery-1", "attack-up"]
          : tier === 1
            ? ["heal-1", "recovery-1", "attack-up"]
            : ["heal-3", "recovery-2", "attack-up", "magic-guard"];
      if (available.length > 0) {
        const actionId = available[this.rng.between(0, available.length - 1)];
        const special = actionId
          ? this.planClassAction(unit, [actionId])
          : undefined;
        if (special) return special;
      }
    }
    if (unit.classId === "curse-master" && unit.statuses.techniqueSeal === 0) {
      const available: readonly BattleActionId[] = tier >= 3
        ? ["heal-1", "attack-down", "confusion", "poison", "spell-seal"]
        : tier === 2
          ? ["heal-1", "attack-down", "confusion", "poison"]
          : ["heal-1", "attack-down", "confusion"];
      const actionId = available[this.rng.between(0, available.length - 1)];
      const special = actionId ? this.planClassAction(unit, [actionId]) : undefined;
      if (special) return special;
    }
    if (unit.classId === "magic-priest" && unit.statuses.techniqueSeal === 0) {
      const available: readonly BattleActionId[] = tier >= 3
        ? ["fire-2", "lightning-1", "recovery-1", "defense-down", "dispel"]
        : tier === 2
          ? ["fire-1", "lightning-1", "recovery-1", "defense-down"]
          : ["fire-1", "recovery-1", "defense-down"];
      const actionId = available[this.rng.between(0, available.length - 1)];
      const special = actionId ? this.planClassAction(unit, [actionId]) : undefined;
      if (special) return special;
    }
    if (unit.classId === "great-dragon-knight" && unit.statuses.techniqueSeal === 0) {
      const actionId = tier === 1
        ? "stomp-1"
        : tier === 2
          ? "stomp-2"
          : "stomp-3";
      const special = actionId
        ? this.planClassAction(unit, [actionId], { targetFilter })
        : undefined;
      if (special) return special;
    }
    if (unit.classId === "wizard" && unit.statuses.techniqueSeal === 0) {
      const actionId = tier === 1
        ? "ice-2"
        : tier === 2
          ? "ice-3"
          : "ice-4";
      const special = actionId
        ? this.planClassAction(unit, [actionId], { targetFilter })
        : undefined;
      if (special) return special;
    }
    if (unit.classId === "magic-master" && unit.statuses.techniqueSeal === 0) {
      const actionId = tier === 1
        ? "lightning-2"
        : tier === 2
          ? "lightning-3"
          : "lightning-4";
      const special = actionId
        ? this.planClassAction(unit, [actionId], { targetFilter })
        : undefined;
      if (special) return special;
    }
    if ((unit.classId === "magic-priest" || unit.classId === "evil-mage")
      && unit.statuses.techniqueSeal === 0) {
      const available = unit.classId === "evil-mage"
        ? tier === 1
          ? ["fire-2"] as const
          : tier === 2
            ? ["fire-3"] as const
            : ["fire-4"] as const
        : tier >= 3
          ? ["fire-2", "lightning-1", "recovery-1", "dispel"] as const
          : tier === 2
            ? ["fire-1", "lightning-1", "recovery-1"] as const
            : ["fire-1", "recovery-1"] as const;
      if (available.length > 0) {
        const actionId = available[this.rng.between(0, available.length - 1)];
        const special = actionId
          ? this.planClassAction(unit, [actionId], { targetFilter })
          : undefined;
        if (special) return special;
      }
    }
    return this.planOrdinaryAiAction(unit, 1, behavior, { targetFilter });
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
        this.planClassAction(candidate, requestedActionIds, options),
      planOrdinaryAction: (candidate, opponentSide, behavior, options) =>
        this.planOrdinaryAiAction(candidate, opponentSide, behavior, options),
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
    return planModernEnemyAction(this.modernEnemyAiContext(), id, intent);
  }

  protected planConfusedAiAction(unit: BattleUnit): AlliedAiAction {
    const reachable = reachableCells(unit, this.units, undefined, this.dynamicBattlefield)
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
    return hasModernDamageActionThisTurn(this.modernEnemyAiContext(), id);
  }

  protected onHostileTargeted(_actor: BattleUnit, _target: BattleUnit): void {}

  private modernEnemyAiContext(): ModernEnemyAiContext {
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

  protected planOrdinaryAiAction(
    unit: BattleUnit,
    opponentSide: BattleUnit["side"],
    behavior: number,
    options: OrdinaryAiPlanningOptions = {},
  ): AlliedAiAction {
    const stats = this.statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < (options.restThresholdPercent ?? 20)) {
      return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }

    const reachable = reachableCells(unit, this.units, undefined, this.dynamicBattlefield)
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

    for (const enemy of enemies) {
      for (const offset of nativeCandidateOffsets) {
        const candidate = { x: enemy.x + offset.x, y: enemy.y + offset.y };
        const candidateKey = positionKey(candidate);
        if (!reachableKeys.has(candidateKey) || occupied.has(candidateKey)) continue;
        const path = candidateKey === positionKey(unit)
          ? [{ x: unit.x, y: unit.y }]
          : this.movementPath(unit.id, candidate);
        if (path.length === 0 || !(options.pathFilter?.(path) ?? true)) continue;
        const defense = terrainDefensePercentFor(unit.classId, this.terrainSlotAt(candidate));
        if (defense >= attackPositionDefense) {
          attackTarget = enemy;
          attackPosition = candidate;
          attackPath = path;
          attackPositionDefense = defense;
        }
      }
    }

    if (attackTarget && attackPosition && attackPath) {
      if (behavior === 1 && positionKey(attackPosition) !== positionKey(unit)) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      return { unitId: unit.id, kind: "attack", path: attackPath, targetId: attackTarget.id };
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
    return this.planClassAction(unit, [actionId]);
  }

  protected planClassAction(
    unit: BattleUnit,
    requestedActionIds?: readonly BattleActionId[],
    options: ClassActionPlanningOptions = {},
  ): AlliedAiAction | undefined {
    if (unit.classId !== "archer" && unit.classId !== "crossbow"
      && unit.classId !== "magic-archer" && unit.statuses.techniqueSeal > 0) return undefined;
    const tier = classTierFor(unit);
    const actionIds: readonly BattleActionId[] = requestedActionIds
      ?? (unit.classId === "archer"
        ? ["archer-shot"]
        : unit.classId === "crossbow"
          ? ["crossbow-shot"]
          : unit.classId === "magic-archer"
            ? ["magic-archer-shot"]
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
          : []);
    if (actionIds.length === 0) return undefined;

    const occupied = new Set(
      this.units.filter(({ id }) => id !== unit.id).map(positionKey),
    );
    const battlefield: GridBattlefield = {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt: (position) => this.terrainSlotAt(position),
    };

    for (const actionId of actionIds) {
      if (!canUseSpecialAction(unit, actionId)) continue;
      const definition = BATTLE_ACTION_DEFINITIONS[actionId];
      const positions = (actionId === "archer-shot" || actionId === "crossbow-shot"
        || actionId === "magic-archer-shot"
        ? reachableCells(unit, this.units, undefined, this.dynamicBattlefield)
        : [{ x: unit.x, y: unit.y }])
        .filter((position) => !occupied.has(positionKey(position))
          && (options.positionFilter?.(position) ?? true));
      const candidates: Array<{
        position: Position;
        target: BattleUnit;
        path: Position[];
        missingLife: number;
        effectiveDefense: number;
        positionDefense: number;
        lethal: boolean;
        critical: boolean;
      }> = [];

      for (const position of positions) {
        const rangeActor = { ...unit, x: position.x, y: position.y };
        const shootingActionId = actionId === "archer-shot" || actionId === "crossbow-shot"
          || actionId === "magic-archer-shot" ? actionId : undefined;
        const range = shootingActionId
          ? shootingRange(
            rangeActor,
            battlefield,
            BATTLE_ACTION_DEFINITIONS[shootingActionId].range.nativeSeed,
          )
          : techniqueSelectionRange(rangeActor, battlefield,
            "aiCandidateSelectionRadius" in definition.range
              ? definition.range.aiCandidateSelectionRadius
              : "selectionRadius" in definition.range
                ? definition.range.selectionRadius
                : 0);
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
          candidates.push({
            position,
            target,
            path,
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
          });
        }
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
        };
      }
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

  planRouteEnemy(id: string): RouteMoveResult | undefined {
    const unit = this.unit(id);
    const definition = this.scenario.routeEnemy;
    if (!unit || unit.side !== 2 || unit.actionDisabled || !definition) return undefined;
    const route = routePath(unit, [definition.target], this.units, definition.movement, this.dynamicBattlefield);
    const exitIndex = route.findIndex((position, index) => index > 0 && definition.isExit(position));
    const path = exitIndex >= 0 ? route.slice(0, exitIndex + 1) : route;
    const destination = path.at(-1) ?? { x: unit.x, y: unit.y };
    return {
      path,
      destination,
      reachedExit: definition.isExit(destination),
    };
  }

  hasRouteEnemy(): boolean {
    return this.scenario.routeEnemy !== undefined;
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
        if (!unit.actionDisabled) unit.life = Math.max(1, Math.floor(unit.life / 2));
        unit.statuses.poison = tickTimedStatus(unit.statuses.poison);
        this.recordCampaignUnit(unit);
      }
      unit.statuses.attackUp = tickTimedStatus(unit.statuses.attackUp);
      unit.statuses.defenseUp = tickTimedStatus(unit.statuses.defenseUp);
      unit.statuses.magicGuard = tickTimedStatus(unit.statuses.magicGuard);
      unit.statuses.confusion = tickTimedStatus(unit.statuses.confusion);
      unit.statuses.attackDown = tickTimedStatus(unit.statuses.attackDown);
      unit.statuses.defenseDown = tickTimedStatus(unit.statuses.defenseDown);
      unit.statuses.techniqueSeal = tickTimedStatus(unit.statuses.techniqueSeal);
      if (unit.side === 2) unit.actionDisabled = false;
    }
    if (this.unit("1:0")) this.focusId = "1:0";
  }

  outcome(): BattleOutcome {
    return battleOutcomeForObjective(this.units, this.stage.objective);
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
