import {
  killRewardFor,
  terrainDefensePercentFor,
} from "../content/classes";
import { STAGE0, STAGE0_AI_CLASS_PRIORITY, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import { STAGE0_ACTION_DEFINITIONS } from "../content/stage0-actions.generated";
import { STAGE0_DEFINITION } from "../content/stages";
import type { AttackResult, BattleOutcome, BattleUnit, CampaignState, Difficulty, Position, UnitStats, UnitStatuses } from "../types";
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

const ACTION_CLASS: Readonly<Record<BattleActionId, ClassId>> = {
  "archer-shot": "archer",
  "fire-1": "sister",
  "heal-1": "sister",
};

function statusesEqual(left: UnitStatuses, right: UnitStatuses): boolean {
  return UNIT_STATUS_KEYS.every((key) => left[key] === right[key]);
}

function canUseSpecialAction(actor: BattleUnit, actionId: BattleActionId): boolean {
  return !actor.acted
    && actor.classId === ACTION_CLASS[actionId]
    && (actionId === "archer-shot" || actor.statuses.techniqueSeal === 0);
}

export interface RouteMoveResult {
  path: Position[];
  destination: Position;
  reachedExit: boolean;
}

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "special" | "move" | "rest" | "wait";
  path: Position[];
  targetId?: string;
  actionId?: BattleActionId;
}

export class Stage0Battle {
  readonly stage = STAGE0_DEFINITION;
  units: BattleUnit[];
  round = 1;
  focusId = "1:0";

  constructor(
    public readonly difficulty: Difficulty = 0,
    public readonly rng = new DeterministicRng(),
  ) {
    this.units = createStage0Units(difficulty);
  }

  restore(snapshot: Pick<ReturnType<Stage0Battle["serializableSnapshot"]>, "round" | "focusId" | "units">): void {
    this.round = snapshot.round;
    this.focusId = snapshot.focusId;
    this.units = snapshot.units.map((unit) => ({
      ...unit,
      statuses: { ...unit.statuses },
    }));
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
    return findMovementPath(unit, destination, this.units);
  }

  moveUnitStep(id: string, destination: Position, allowFriendlyTransit = false): boolean {
    const unit = this.unit(id);
    const occupant = this.unitAt(destination);
    if (
      !unit
      || manhattan(unit, destination) !== 1
      || (occupant && (!allowFriendlyTransit || occupant.side !== unit.side))
      || movementCost(unit.classId, destination) >= 98
    ) return false;
    unit.x = destination.x;
    unit.y = destination.y;
    this.focusId = id;
    return true;
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
      * terrainDefensePercentFor(defender.classId, terrainSlotAt(defender))
      / 100,
    );
    const damage = Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense) + this.rng.between(4, 7) + this.rng.between(4, 7);
    defender.life = Math.max(0, defender.life - damage);

    const counterOccurred = defender.life > 0;
    let counterDamage = 0;
    if (counterOccurred) {
      const attackerTerrainDefense = Math.floor(
        attackerStats.defense
        * terrainDefensePercentFor(attacker.classId, terrainSlotAt(attacker))
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
      terrainSlotAt,
    };
    if (actionId === "archer-shot") return archerShootingRange(actor, battlefield);
    return techniqueSelectionRange(
      actor,
      battlefield,
      STAGE0_ACTION_DEFINITIONS[actionId].range.selectionRadius,
    );
  }

  actionTargets(actorId: string, actionId: BattleActionId): BattleUnit[] {
    const actor = this.unit(actorId);
    if (!actor || !canUseSpecialAction(actor, actionId)) return [];
    const definition = STAGE0_ACTION_DEFINITIONS[actionId];
    const range = this.actionRange(actorId, actionId);
    return this.units.filter((target) =>
      range.valueAt(target) > 0
      && (definition.target === "ally"
        ? target.side === actor.side
        : target.side !== actor.side));
  }

  prepareSpecialAction(intent: BattleActionIntent): PreparedBattleAction {
    const actor = this.unit(intent.actorId);
    const target = this.unit(intent.targetId);
    if (
      !actor
      || !target
      || !canUseSpecialAction(actor, intent.actionId)
      || !this.actionTargets(actor.id, intent.actionId).some(({ id }) => id === target.id)
    ) {
      throw new Error("illegal special action");
    }
    return resolveSpecialAction(
      intent,
      actor,
      target,
      this.rng,
      this.statsFor(target).maxLife,
    );
  }

  commitPreparedAction(prepared: PreparedBattleAction): SpecialActionResult {
    const actor = this.unit(prepared.intent.actorId);
    const target = this.unit(prepared.intent.targetId);
    if (
      !actor
      || !target
      || !canUseSpecialAction(actor, prepared.intent.actionId)
      || this.rng.state !== prepared.rngBefore
      || actor.experience !== prepared.actorExperienceBefore
      || target.life !== prepared.targetLifeBefore
      || target.x !== prepared.result.target.x
      || target.y !== prepared.result.target.y
      || !statusesEqual(target.statuses, prepared.targetStatusesBefore)
    ) {
      throw new Error("stale prepared special action");
    }

    this.rng.state = prepared.rngAfter;
    actor.experience = prepared.actorExperienceAfter;
    actor.acted = true;
    target.life = prepared.targetLifeAfter;
    target.statuses = { ...prepared.targetStatusesAfter };
    if (prepared.result.targetDied) {
      this.units = this.units.filter(({ id }) => id !== target.id);
    }
    this.focusId = this.unit(actor.id) ? actor.id : target.id;
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
    if (!unit || unit.side !== 1 || unit.acted) return 0;
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

    const classAction = this.planAlliedClassAction(unit);
    if (classAction) return classAction;

    const leader = leaderId ? this.unit(leaderId) : undefined;
    if (leader && leader.id !== unit.id && leader.side === unit.side) {
      const leaderPath = shortestPath(
        unit,
        leader,
        unit.classId,
        this.statsFor(unit).movement,
        this.units.filter((candidate) => candidate.id !== unit.id),
      );
      if (leaderPath.length === 0) {
        const path = routePath(unit, neighbors(leader), this.units, this.statsFor(unit).movement);
        if (path.length > 1) return { unitId: id, kind: "move", path };
      }
    }

    const stats = this.statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < 20) return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };

    const reachable = reachableCells(unit, this.units);
    const reachableKeys = new Set(reachable.map(positionKey));
    const occupied = new Set(this.units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
    const enemies = this.units
      .filter((candidate) => candidate.side === 2)
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
        const defense = terrainDefensePercentFor(unit.classId, terrainSlotAt(candidate));
        if (defense >= attackPositionDefense) {
          attackTarget = enemy;
          attackPosition = candidate;
          attackPositionDefense = defense;
        }
      }
    }

    if (attackTarget && attackPosition) {
      const path = positionKey(attackPosition) === positionKey(unit)
        ? [{ x: unit.x, y: unit.y }]
        : this.movementPath(unit.id, attackPosition);
      if (path.length > 0) return { unitId: id, kind: "attack", path, targetId: attackTarget.id };
    }

    if (unit.life < stats.maxLife) return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };

    const pursuitTargets = enemies
      .map((enemy) => ({ x: enemy.x, y: enemy.y + 1 }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < this.stage.width && y < this.stage.height);
    const pursuitPath = routePath(unit, pursuitTargets, this.units, stats.movement);
    if (pursuitPath.length > 1) return { unitId: id, kind: "move", path: pursuitPath };
    return { unitId: id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  private planAlliedClassAction(unit: BattleUnit): AlliedAiAction | undefined {
    if (unit.classId === "sister" && unit.statuses.techniqueSeal > 0) return undefined;
    const actionIds: readonly BattleActionId[] = unit.classId === "archer"
      ? ["archer-shot"]
      : unit.classId === "sister"
        ? ["heal-1", "fire-1"]
        : [];
    if (actionIds.length === 0) return undefined;

    const occupied = new Set(
      this.units.filter(({ id }) => id !== unit.id).map(positionKey),
    );
    const positions = reachableCells(unit, this.units)
      .filter((position) => !occupied.has(positionKey(position)));
    const battlefield = {
      width: this.stage.width,
      height: this.stage.height,
      terrainSlotAt,
    };

    for (const actionId of actionIds) {
      const definition = STAGE0_ACTION_DEFINITIONS[actionId];
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
              ? STAGE0_ACTION_DEFINITIONS["fire-1"].range.selectionRadius
              : STAGE0_ACTION_DEFINITIONS["heal-1"].range.selectionRadius,
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
            * terrainDefensePercentFor(target.classId, terrainSlotAt(target))
            / 100,
          );
          candidates.push({
            position,
            target,
            path,
            missingLife,
            effectiveDefense,
            positionDefense: terrainDefensePercentFor(unit.classId, terrainSlotAt(position)),
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
    if (!unit || unit.side !== 2) return [];
    return reachableCells(unit, this.units, STAGE0.enemyRouteMovement);
  }

  enemyActionOrder(): string[] {
    return this.units
      .filter((unit) => unit.side === 2 && !unit.acted)
      .sort((left, right) => {
        const priority = (STAGE0_AI_CLASS_PRIORITY[left.classId] ?? Number.MAX_SAFE_INTEGER)
          - (STAGE0_AI_CLASS_PRIORITY[right.classId] ?? Number.MAX_SAFE_INTEGER);
        if (priority !== 0) return priority;
        return (left.y * this.stage.width + left.x) - (right.y * this.stage.width + right.x);
      })
      .map((unit) => unit.id);
  }

  planRouteEnemy(id: string): RouteMoveResult | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    const route = routePath(unit, [STAGE0.enemyRouteTarget], this.units, STAGE0.enemyRouteMovement);
    const exitIndex = route.findIndex((position, index) => index > 0 && isStage0Exit(position));
    const path = exitIndex >= 0 ? route.slice(0, exitIndex + 1) : route;
    const destination = path.at(-1) ?? { x: unit.x, y: unit.y };
    return {
      path,
      destination,
      reachedExit: isStage0Exit(destination),
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
    if (!unit || unit.side !== 2 || !isStage0Exit(unit)) return false;
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
    return {
      stageId: this.stage.id,
      ruleset: "stableRemake",
      difficulty: this.difficulty,
      roster: this.units
        .filter((unit) => unit.side === 1)
        .map(({ slot, classId, experience, life }) => ({ slot, classId, experience, life })),
      rngState: this.rng.state,
    };
  }
}
