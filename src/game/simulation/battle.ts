import {
  killRewardFor,
  terrainDefensePercentFor,
} from "../content/classes";
import { BATTLE_ACTION_DEFINITIONS } from "../content/actions";
import { STAGE0, STAGE0_AI_CLASS_PRIORITY, completeCampaignRoster, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import { STAGE0_DEFINITION, type StageDefinition } from "../content/stages";
import type { AttackResult, BattleOutcome, BattleUnit, CampaignState, Difficulty, Position, SaveRosterEntry, UnitStats, UnitStatuses } from "../types";
import { DeterministicRng } from "./rng";
import { manhattan, movementCost, movementPath as findMovementPath, neighbors, positionKey, reachableCells, routePath, shortestPath } from "./grid";
import {
  promoteUnit,
  promotionQueue,
  type PromotionCommitResult,
} from "./promotion";
import type { ClassId } from "../content/classes";
import {
  archerShootingRange,
  NumericRangeMap,
  techniqueSelectionRange,
} from "./actions/range-map";
import { prepareSpecialAction as resolveSpecialAction } from "./actions/resolve";
import type {
  BattleActionId,
  BattleActionIntent,
  PreparedBattleAction,
  SpecialActionResult,
} from "./actions/types";
import { UNIT_STATUS_KEYS } from "./status";
import { battleOutcomeForObjective } from "./objectives";

const ACTION_CLASSES: Readonly<Record<BattleActionId, readonly ClassId[]>> = {
  "archer-shot": ["archer"],
  "fire-1": ["sister", "magician"],
  "heal-1": ["sister"],
  "lightning-1": ["magician"],
  "ice-1": ["magician"],
};

function statusesEqual(left: UnitStatuses, right: UnitStatuses): boolean {
  return UNIT_STATUS_KEYS.every((key) => left[key] === right[key]);
}

function canUseSpecialAction(actor: BattleUnit, actionId: BattleActionId): boolean {
  return !actor.acted
    && ACTION_CLASSES[actionId].includes(actor.classId)
    && (actionId === "archer-shot" || actor.statuses.techniqueSeal === 0);
}

export interface RouteMoveResult {
  path: Position[];
  destination: Position;
  reachedExit: boolean;
}

export interface BattleScenario {
  stage: StageDefinition;
  width: number;
  height: number;
  terrainSlotAt: (position: Position) => number;
  createUnits: (difficulty: Difficulty) => BattleUnit[];
  createCampaignRoster: (difficulty: Difficulty) => SaveRosterEntry[];
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  enemyBehaviorById?: ReadonlyMap<string, number>;
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

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "special" | "move" | "rest" | "wait";
  path: Position[];
  targetId?: string;
  actionId?: BattleActionId;
}

export class Stage0Battle {
  readonly stage: StageDefinition;
  units: BattleUnit[];
  round = 1;
  focusId = "1:0";
  private readonly campaignRoster: SaveRosterEntry[];
  private readonly campaignUnitSlots: ReadonlySet<number>;

  constructor(
    public readonly difficulty: Difficulty = 0,
    public readonly rng = new DeterministicRng(),
    protected readonly scenario: BattleScenario = STAGE0_BATTLE_SCENARIO,
  ) {
    this.stage = scenario.stage;
    this.units = scenario.createUnits(difficulty);
    this.campaignRoster = scenario.createCampaignRoster(difficulty);
    this.campaignUnitSlots = new Set(
      this.units.filter(({ side }) => side === 1).map(({ slot }) => slot),
    );
  }

  restore(
    snapshot: Pick<ReturnType<Stage0Battle["serializableSnapshot"]>, "round" | "focusId" | "units">,
    campaignRoster?: readonly SaveRosterEntry[],
  ): void {
    this.round = snapshot.round;
    this.focusId = snapshot.focusId;
    this.units = snapshot.units.map((unit) => ({
      ...unit,
      statuses: { ...unit.statuses },
    }));
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

  unit(id: string): BattleUnit | undefined {
    return this.units.find((unit) => unit.id === id);
  }

  unitAt(position: Position): BattleUnit | undefined {
    return this.units.find((unit) => unit.x === position.x && unit.y === position.y);
  }

  enemyBehaviorFor(id: string): number {
    return this.scenario.enemyBehaviorById?.get(id) ?? 0;
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
    if (!unit || unit.acted || (occupant && occupant.id !== unit.id)) return [];
    return findMovementPath(unit, destination, this.units, this.scenario);
  }

  moveUnitStep(id: string, destination: Position, allowFriendlyTransit = false): boolean {
    const unit = this.unit(id);
    const occupant = this.unitAt(destination);
    if (
      !unit
      || manhattan(unit, destination) !== 1
      || (occupant && (!allowFriendlyTransit || occupant.side !== unit.side))
      || movementCost(unit.classId, destination, this.scenario) >= 98
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
      ? reachableCells(unit, this.units, undefined, this.scenario)
      : reachableCells(unit, this.units, movementBudget, this.scenario);
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
      this.scenario,
    );
  }

  attack(attackerId: string, defenderId: string): AttackResult {
    const attacker = this.unit(attackerId);
    const defender = this.unit(defenderId);
    if (!attacker || !defender || attacker.side === defender.side || attacker.acted || manhattan(attacker, defender) !== 1) {
      throw new Error("illegal ordinary attack");
    }

    const attackerStats = this.statsFor(attacker);
    const defenderStats = this.statsFor(defender);
    const terrainDefense = Math.floor(
      defenderStats.defense
      * terrainDefensePercentFor(defender.classId, this.scenario.terrainSlotAt(defender))
      / 100,
    );
    const damage = Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense) + this.rng.between(4, 7) + this.rng.between(4, 7);
    defender.life = Math.max(0, defender.life - damage);

    const counterOccurred = defender.life > 0;
    let counterDamage = 0;
    if (counterOccurred) {
      const attackerTerrainDefense = Math.floor(
        attackerStats.defense
        * terrainDefensePercentFor(attacker.classId, this.scenario.terrainSlotAt(attacker))
        / 100,
      );
      counterDamage = Math.floor(Math.max(0, defenderStats.attack - attackerStats.defense - attackerTerrainDefense) / 2);
      attacker.life = Math.max(0, attacker.life - counterDamage);
    }

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

    return { attackerId, defenderId, damage, counterDamage, counterOccurred, defenderDied, attackerDied, experienceGained };
  }

  actionRange(actorId: string, actionId: BattleActionId): NumericRangeMap {
    const actor = this.unit(actorId);
    if (!actor || !canUseSpecialAction(actor, actionId)) {
      return new NumericRangeMap(this.stage.width, this.stage.height);
    }
    const battlefield = {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt: this.scenario.terrainSlotAt,
    };
    if (actionId === "archer-shot") return archerShootingRange(actor, battlefield);
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
    if (definition.target === "area") return range.cells();
    return this.units
      .filter((target) => range.valueAt(target) > 0
        && (definition.target === "ally"
          ? target.side === actor.side
          : target.side !== actor.side))
      .map(({ x, y }) => ({ x, y }));
  }

  actionTargets(actorId: string, actionId: BattleActionId): BattleUnit[] {
    const actor = this.unit(actorId);
    if (!actor || !canUseSpecialAction(actor, actionId)) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    if (definition.target === "area") return [];
    const range = this.actionRange(actorId, actionId);
    return this.units.filter((target) =>
      range.valueAt(target) > 0
      && (definition.target === "ally"
        ? target.side === actor.side
        : target.side !== actor.side));
  }

  prepareSpecialAction(intent: BattleActionIntent): PreparedBattleAction {
    const actor = this.unit(intent.actorId);
    const target = intent.targetId ? this.unit(intent.targetId) : undefined;
    const center = intent.target ?? (target ? { x: target.x, y: target.y } : undefined);
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    const legalCell = center
      ? this.actionTargetCells(intent.actorId, intent.actionId)
        .some(({ x, y }) => x === center.x && y === center.y)
      : false;
    if (
      !actor
      || !center
      || !canUseSpecialAction(actor, intent.actionId)
      || !legalCell
      || (definition.target !== "area" && !target)
    ) {
      throw new Error("illegal special action");
    }
    return resolveSpecialAction(
      intent,
      actor,
      target,
      this.rng,
      {
        units: this.units,
        battlefield: {
          width: this.stage.width,
          height: this.stage.height,
          terrainSlotAt: this.scenario.terrainSlotAt,
        },
        statsFor: (unit) => this.statsFor(unit),
      },
      center,
    );
  }

  commitPreparedAction(prepared: PreparedBattleAction): SpecialActionResult {
    const actor = this.unit(prepared.intent.actorId);
    const affectedAreCurrent = prepared.affectedUnits.every((affected) => {
      const unit = this.unit(affected.unitId);
      return unit
        && unit.life === affected.lifeBefore
        && unit.x === affected.positionBefore.x
        && unit.y === affected.positionBefore.y
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

  wait(id: string): boolean {
    const unit = this.unit(id);
    if (!unit || unit.side !== 1 || unit.acted) return false;
    unit.acted = true;
    this.focusId = id;
    return true;
  }

  rest(id: string): number {
    const unit = this.unit(id);
    if (!unit || unit.acted) return 0;
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
      if (unit.side !== 1 || unit.acted) continue;
      recovered += this.rest(unit.id);
      count += 1;
    }
    return { count, recovered };
  }

  planAlliedAiAction(id: string, leaderId?: string): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 1 || unit.acted) return undefined;

    const classAction = this.planClassAction(unit);
    if (classAction) return classAction;

    const leader = leaderId ? this.unit(leaderId) : undefined;
    if (leader && leader.id !== unit.id && leader.side === unit.side) {
      const leaderPath = shortestPath(
        unit,
        leader,
        unit.classId,
        this.statsFor(unit).movement,
        this.units.filter((candidate) => candidate.id !== unit.id),
        this.scenario,
      );
      if (leaderPath.length === 0) {
        const path = routePath(
          unit,
          neighbors(leader, this.scenario),
          this.units,
          this.statsFor(unit).movement,
          this.scenario,
        );
        if (path.length > 1) return { unitId: id, kind: "move", path };
      }
    }

    return this.planOrdinaryAiAction(unit, 2, 0);
  }

  planEnemyAiAction(id: string, behavior: number): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted) return undefined;
    const stats = this.statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < 20) {
      return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }
    if (unit.classId === "sister" && unit.statuses.techniqueSeal === 0) {
      const actionId: BattleActionId = this.rng.between(0, 1) === 0 ? "fire-1" : "heal-1";
      const special = this.planSpecialAiAction(id, actionId);
      if (special) return special;
    }
    return this.planOrdinaryAiAction(unit, 1, behavior);
  }

  private planOrdinaryAiAction(
    unit: BattleUnit,
    opponentSide: BattleUnit["side"],
    behavior: number,
  ): AlliedAiAction {
    const stats = this.statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < 20) return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };

    const reachable = reachableCells(unit, this.units, undefined, this.scenario);
    const reachableKeys = new Set(reachable.map(positionKey));
    const occupied = new Set(this.units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
    const enemies = this.units
      .filter((candidate) => candidate.side === opponentSide)
      .sort((left, right) => left.y * this.stage.width + left.x - (right.y * this.stage.width + right.x));
    const nativeCandidateOffsets = [
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
    ];
    let attackTarget: BattleUnit | undefined;
    let attackPosition: Position | undefined;
    let attackPositionDefense = -1;

    for (const enemy of enemies) {
      for (const offset of nativeCandidateOffsets) {
        const candidate = { x: enemy.x + offset.x, y: enemy.y + offset.y };
        const candidateKey = positionKey(candidate);
        if (!reachableKeys.has(candidateKey) || occupied.has(candidateKey)) continue;
        const defense = terrainDefensePercentFor(unit.classId, this.scenario.terrainSlotAt(candidate));
        if (defense >= attackPositionDefense) {
          attackTarget = enemy;
          attackPosition = candidate;
          attackPositionDefense = defense;
        }
      }
    }

    if (attackTarget && attackPosition) {
      if (behavior === 1 && positionKey(attackPosition) !== positionKey(unit)) {
        return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
      }
      const path = positionKey(attackPosition) === positionKey(unit)
        ? [{ x: unit.x, y: unit.y }]
        : this.movementPath(unit.id, attackPosition);
      if (path.length > 0) return { unitId: unit.id, kind: "attack", path, targetId: attackTarget.id };
    }

    if (unit.life < stats.maxLife) return { unitId: unit.id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    if (behavior === 1) {
      return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
    }

    const pursuitTargets = enemies
      .map((enemy) => ({ x: enemy.x, y: enemy.y + 1 }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < this.stage.width && y < this.stage.height);
    const pursuitPath = routePath(unit, pursuitTargets, this.units, stats.movement, this.scenario);
    if (pursuitPath.length > 1) return { unitId: unit.id, kind: "move", path: pursuitPath };
    return { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  planSpecialAiAction(id: string, actionId: BattleActionId): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.acted) return undefined;
    return this.planClassAction(unit, [actionId]);
  }

  private planClassAction(
    unit: BattleUnit,
    requestedActionIds?: readonly BattleActionId[],
  ): AlliedAiAction | undefined {
    if (unit.classId === "sister" && unit.statuses.techniqueSeal > 0) return undefined;
    const actionIds: readonly BattleActionId[] = requestedActionIds
      ?? (unit.classId === "archer"
        ? ["archer-shot"]
        : unit.classId === "sister"
          ? ["heal-1", "fire-1"]
          : []);
    if (actionIds.length === 0) return undefined;

    const occupied = new Set(
      this.units.filter(({ id }) => id !== unit.id).map(positionKey),
    );
    const positions = reachableCells(unit, this.units, undefined, this.scenario)
      .filter((position) => !occupied.has(positionKey(position)));
    const battlefield = {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt: this.scenario.terrainSlotAt,
    };

    for (const actionId of actionIds) {
      const definition = BATTLE_ACTION_DEFINITIONS[actionId];
      const candidates: Array<{
        position: Position;
        target: BattleUnit;
        path: Position[];
        missingLife: number;
        effectiveDefense: number;
        positionDefense: number;
      }> = [];

      for (const position of positions) {
        const rangeActor = { ...unit, x: position.x, y: position.y };
        const range = actionId === "archer-shot"
          ? archerShootingRange(rangeActor, battlefield)
          : techniqueSelectionRange(
            rangeActor,
            battlefield,
            actionId === "fire-1"
              ? BATTLE_ACTION_DEFINITIONS["fire-1"].range.selectionRadius
              : BATTLE_ACTION_DEFINITIONS["heal-1"].range.selectionRadius,
          );
        const path = positionKey(position) === positionKey(unit)
          ? [{ x: unit.x, y: unit.y }]
          : this.movementPath(unit.id, position);
        if (path.length === 0) continue;

        for (const target of this.units) {
          const correctSide = definition.target === "ally"
            ? target.side === unit.side
            : target.side !== unit.side;
          if (!correctSide || range.valueAt(target) === 0) continue;
          const targetStats = this.statsFor(target);
          const missingLife = targetStats.maxLife - target.life;
          if (actionId === "heal-1" && missingLife <= 0) continue;
          const effectiveDefense = targetStats.defense + Math.floor(
            targetStats.defense
            * terrainDefensePercentFor(target.classId, this.scenario.terrainSlotAt(target))
            / 100,
          );
          candidates.push({
            position,
            target,
            path,
            missingLife,
            effectiveDefense,
            positionDefense: terrainDefensePercentFor(unit.classId, this.scenario.terrainSlotAt(position)),
          });
        }
      }

      candidates.sort((left, right) => {
        if (actionId === "heal-1" && left.missingLife !== right.missingLife) {
          return right.missingLife - left.missingLife;
        }
        if (actionId !== "heal-1" && left.effectiveDefense !== right.effectiveDefense) {
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
    if (!unit || unit.acted) return false;
    unit.acted = true;
    this.focusId = id;
    return true;
  }

  clearActionState(side: BattleUnit["side"]): void {
    for (const unit of this.units) {
      if (unit.side === side) unit.acted = false;
    }
  }

  enemyMovementRange(id: string): Position[] {
    const unit = this.unit(id);
    const route = this.scenario.routeEnemy;
    if (!unit || unit.side !== 2 || !route) return [];
    return reachableCells(unit, this.units, route.movement, this.scenario);
  }

  enemyActionOrder(): string[] {
    return this.units
      .filter((unit) => unit.side === 2 && !unit.acted)
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
    if (!unit || unit.side !== 2 || !definition) return undefined;
    const route = routePath(unit, [definition.target], this.units, definition.movement, this.scenario);
    const exitIndex = route.findIndex((position, index) => index > 0 && definition.isExit(position));
    const path = exitIndex >= 0 ? route.slice(0, exitIndex + 1) : route;
    const destination = path.at(-1) ?? { x: unit.x, y: unit.y };
    return {
      path,
      destination,
      reachedExit: definition.isExit(destination),
    };
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
    for (const unit of this.units) unit.acted = false;
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
      outcome: this.outcome(),
    };
  }

  serializableSnapshot(): { round: number; focusId: string; units: BattleUnit[] } {
    return {
      round: this.round,
      focusId: this.focusId,
      units: this.units.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
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
