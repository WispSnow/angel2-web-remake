import { STAGE0, TERRAIN_DEFENSE_PERCENT, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import type { AttackResult, BattleOutcome, BattleUnit, Position } from "../types";
import { DeterministicRng } from "./rng";
import { manhattan, movementCost, movementPath as findMovementPath, neighbors, positionKey, reachableCells, routePath, shortestPath } from "./grid";

export interface RouteMoveResult {
  path: Position[];
  destination: Position;
  reachedExit: boolean;
}

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "move" | "rest" | "wait";
  path: Position[];
  targetId?: string;
}

export class Stage0Battle {
  units: BattleUnit[];
  round = 1;
  focusId = "1:0";

  constructor(public readonly rng = new DeterministicRng()) {
    this.units = createStage0Units();
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

    const attackerStats = statsFor(attacker);
    const defenderStats = statsFor(defender);
    const terrainDefense = Math.floor(defenderStats.defense * TERRAIN_DEFENSE_PERCENT[terrainSlotAt(defender)] / 100);
    const damage = Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense) + this.rng.between(4, 7) + this.rng.between(4, 7);
    defender.life = Math.max(0, defender.life - damage);

    let counterDamage = 0;
    if (defender.life > 0) {
      const attackerTerrainDefense = Math.floor(attackerStats.defense * TERRAIN_DEFENSE_PERCENT[terrainSlotAt(attacker)] / 100);
      counterDamage = Math.floor(Math.max(0, defenderStats.attack - attackerStats.defense - attackerTerrainDefense) / 2);
      attacker.life = Math.max(0, attacker.life - counterDamage);
    }

    const defenderDied = defender.life === 0;
    const attackerDied = attacker.life === 0;
    const reward = defender.classId === 22 ? 20 : 10;
    const experienceGained = defenderDied ? reward + this.rng.between(4, 7) : defenderStats.level + this.rng.between(4, 7);
    attacker.experience += experienceGained;
    attacker.acted = true;

    if (defenderDied) this.units = this.units.filter((unit) => unit.id !== defender.id);
    if (attackerDied) this.units = this.units.filter((unit) => unit.id !== attacker.id);
    this.focusId = this.unit(attackerId) ? attackerId : defenderId;

    return { attackerId, defenderId, damage, counterDamage, defenderDied, attackerDied, experienceGained };
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
    const maximumLife = statsFor(unit).maxLife;
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

    const leader = leaderId ? this.unit(leaderId) : undefined;
    if (leader && leader.id !== unit.id && leader.side === unit.side) {
      const leaderPath = shortestPath(
        unit,
        leader,
        unit.classId,
        statsFor(unit).movement,
        this.units.filter((candidate) => candidate.id !== unit.id),
      );
      if (leaderPath.length === 0) {
        const path = routePath(unit, neighbors(leader), this.units, statsFor(unit).movement);
        if (path.length > 1) return { unitId: id, kind: "move", path };
      }
    }

    const stats = statsFor(unit);
    const lifePercent = Math.floor(unit.life * 100 / stats.maxLife);
    if (lifePercent < 20) return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };

    const reachable = reachableCells(unit, this.units);
    const reachableKeys = new Set(reachable.map(positionKey));
    const occupied = new Set(this.units.filter((candidate) => candidate.id !== unit.id).map(positionKey));
    const enemies = this.units
      .filter((candidate) => candidate.side === 2)
      .sort((left, right) => left.y * STAGE0.width + left.x - (right.y * STAGE0.width + right.x));
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
        const defense = TERRAIN_DEFENSE_PERCENT[terrainSlotAt(candidate)] ?? 0;
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
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < STAGE0.width && y < STAGE0.height);
    const pursuitPath = routePath(unit, pursuitTargets, this.units, stats.movement);
    if (pursuitPath.length > 1) return { unitId: id, kind: "move", path: pursuitPath };
    return { unitId: id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
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

  planRouteEnemy(id: string): RouteMoveResult | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2) return undefined;
    const path = routePath(unit, STAGE0.enemyExitCells, this.units, STAGE0.enemyRouteMovement);
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
    if (!this.unit("1:0")) return "defeat";
    if (!this.units.some((unit) => unit.side === 2)) return "victory";
    return "ongoing";
  }

  snapshot(): object {
    return {
      round: this.round,
      focusId: this.focusId,
      rngState: this.rng.state,
      units: this.units.map((unit) => ({ ...unit })),
      outcome: this.outcome(),
    };
  }
}
