import { STAGE0, TERRAIN_DEFENSE_PERCENT, createStage0Units, isStage0Exit, statsFor, terrainSlotAt } from "../content/stage0";
import type { AttackResult, BattleOutcome, BattleUnit, Position } from "../types";
import { DeterministicRng } from "./rng";
import { manhattan, movementCost, movementPath as findMovementPath, reachableCells, routePath } from "./grid";

export interface RouteMoveResult {
  path: Position[];
  destination: Position;
  reachedExit: boolean;
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
