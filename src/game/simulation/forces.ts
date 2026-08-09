import type { ClassId } from "../content/classes";
import type { BattleActionId } from "./actions/types";
import type { BattleUnit, Side } from "../types";

export type ForceControl = "player" | "independent-ai";

export interface ExpertForceAiDoctrine {
  strategy: "expert";
}

export interface TerrainHoldForceAiDoctrine {
  strategy: "terrain-hold";
  allowedTerrainSlots: readonly number[];
  entryTerrainSlots: readonly number[];
  restThresholdPercent: number;
  criticalHealThresholdPercent: number;
  priorityHealingActionsByClass?: Readonly<
    Partial<Record<ClassId, readonly BattleActionId[]>>
  >;
  preserveNativeFormation: boolean;
}

export type ForceAiDoctrine = ExpertForceAiDoctrine | TerrainHoldForceAiDoctrine;

export interface ForceTargetingPolicy {
  preferredForceIds: readonly string[];
  fallback: "all-opponents" | "wait";
}

/**
 * Stable, content-authored ownership and AI policy for one battlefield force.
 * Native behavior numbers remain inputs to a doctrine; they do not decide who
 * the player controls or which force a unit belongs to.
 */
export interface ForceDefinition {
  id: string;
  /** Optional player-facing name; the stable id remains the simulation identity. */
  label?: string;
  /** Optional high-level tactic for the compact unit HUD; never an internal AI identifier. */
  tacticLabel?: string;
  side: Side;
  control: ForceControl;
  unitIds: readonly string[];
  commanderId?: string;
  doctrine: ForceAiDoctrine;
  targeting?: ForceTargetingPolicy;
}

function assertPercent(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${label} must be an integer from 1 through 100`);
  }
}

export class ForceRegistry {
  private readonly definitionsById = new Map<string, ForceDefinition>();
  private readonly forceIdByUnitId = new Map<string, string>();
  private readonly playerCommanderId: string | undefined;

  constructor(
    definitions: readonly ForceDefinition[],
    initialUnits: readonly BattleUnit[],
  ) {
    const initialUnitsById = new Map(initialUnits.map((unit) => [unit.id, unit]));
    let playerCommanderId: string | undefined;

    for (const definition of definitions) {
      if (this.definitionsById.has(definition.id)) {
        throw new Error(`Duplicate force id: ${definition.id}`);
      }
      if (definition.label !== undefined && definition.label.trim().length === 0) {
        throw new Error(`Force ${definition.id} has an empty player-facing label`);
      }
      if (definition.tacticLabel !== undefined && definition.tacticLabel.trim().length === 0) {
        throw new Error(`Force ${definition.id} has an empty player-facing tactic`);
      }
      if (definition.unitIds.length === 0) {
        throw new Error(`Force ${definition.id} must contain at least one unit`);
      }
      if (definition.control === "player" && definition.side !== 1) {
        throw new Error(`Player-controlled force ${definition.id} must be on side 1`);
      }
      if (definition.doctrine.strategy === "terrain-hold") {
        const doctrine = definition.doctrine;
        if (doctrine.allowedTerrainSlots.length === 0) {
          throw new Error(`Terrain-hold force ${definition.id} needs allowed terrain slots`);
        }
        if (doctrine.entryTerrainSlots.length === 0) {
          throw new Error(`Terrain-hold force ${definition.id} needs entry terrain slots`);
        }
        const allowed = new Set(doctrine.allowedTerrainSlots);
        if (doctrine.entryTerrainSlots.some((slot) => !allowed.has(slot))) {
          throw new Error(`Terrain-hold force ${definition.id} has an entry slot outside its allowed terrain`);
        }
        assertPercent(`${definition.id} rest threshold`, doctrine.restThresholdPercent);
        assertPercent(
          `${definition.id} critical-heal threshold`,
          doctrine.criticalHealThresholdPercent,
        );
      }

      this.definitionsById.set(definition.id, definition);
      for (const unitId of definition.unitIds) {
        const unit = initialUnitsById.get(unitId);
        if (!unit) throw new Error(`Force ${definition.id} references missing unit ${unitId}`);
        if (unit.side !== definition.side) {
          throw new Error(`Force ${definition.id} assigns ${unitId} to the wrong side`);
        }
        const existingForceId = this.forceIdByUnitId.get(unitId);
        if (existingForceId) {
          throw new Error(`Unit ${unitId} belongs to both ${existingForceId} and ${definition.id}`);
        }
        this.forceIdByUnitId.set(unitId, definition.id);
      }

      if (definition.commanderId) {
        if (!definition.unitIds.includes(definition.commanderId)) {
          throw new Error(`Commander ${definition.commanderId} is not a member of ${definition.id}`);
        }
        if (definition.control === "player") {
          if (playerCommanderId) {
            throw new Error("Only one player-controlled force commander may issue group commands");
          }
          playerCommanderId = definition.commanderId;
        }
      }
    }

    if (definitions.length > 0) {
      for (const unit of initialUnits) {
        if (!this.forceIdByUnitId.has(unit.id)) {
          throw new Error(`Unit ${unit.id} is missing an explicit force assignment`);
        }
      }
    }

    for (const definition of definitions) {
      for (const preferredForceId of definition.targeting?.preferredForceIds ?? []) {
        const preferred = this.definitionsById.get(preferredForceId);
        if (!preferred) {
          throw new Error(`Force ${definition.id} targets missing force ${preferredForceId}`);
        }
        if (preferred.side === definition.side) {
          throw new Error(`Force ${definition.id} cannot target friendly force ${preferredForceId}`);
        }
      }
    }
    this.playerCommanderId = playerCommanderId;
  }

  definition(id: string): ForceDefinition | undefined {
    return this.definitionsById.get(id);
  }

  definitionForUnit(unitId: string): ForceDefinition | undefined {
    const forceId = this.forceIdByUnitId.get(unitId);
    return forceId ? this.definition(forceId) : undefined;
  }

  controlForUnit(unitId: string): ForceControl | undefined {
    return this.definitionForUnit(unitId)?.control;
  }

  hasExplicitDefinitions(): boolean {
    return this.definitionsById.size > 0;
  }

  inheritUnit(sourceUnitId: string, derivedUnitId: string): void {
    if (!this.hasExplicitDefinitions()) return;
    const sourceForceId = this.forceIdByUnitId.get(sourceUnitId);
    if (!sourceForceId) throw new Error(`Cannot inherit force from unassigned unit ${sourceUnitId}`);
    const existingForceId = this.forceIdByUnitId.get(derivedUnitId);
    if (existingForceId && existingForceId !== sourceForceId) {
      throw new Error(`Unit ${derivedUnitId} already belongs to ${existingForceId}`);
    }
    this.forceIdByUnitId.set(derivedUnitId, sourceForceId);
  }

  assertKnownUnits(units: readonly BattleUnit[]): void {
    if (!this.hasExplicitDefinitions()) return;
    const seenIds = new Set<string>();
    for (const unit of units) {
      if (seenIds.has(unit.id)) throw new Error(`Battle state repeats unit ${unit.id}`);
      seenIds.add(unit.id);
      const force = this.definitionForUnit(unit.id);
      if (!force) throw new Error(`Battle state contains unassigned unit ${unit.id}`);
      if (force.side !== unit.side) {
        throw new Error(`Battle state moved ${unit.id} to a side outside its force`);
      }
    }
  }

  commanderId(): string | undefined {
    return this.playerCommanderId;
  }

  membersForUnit(unitId: string, units: readonly BattleUnit[]): BattleUnit[] {
    const force = this.definitionForUnit(unitId);
    if (!force) return [];
    return units.filter((unit) => this.definitionForUnit(unit.id)?.id === force.id);
  }

  targetFilterFor(
    unitId: string,
    units: readonly BattleUnit[],
  ): ((target: BattleUnit) => boolean) | undefined {
    const sourceForce = this.definitionForUnit(unitId);
    const targeting = sourceForce?.targeting;
    if (!sourceForce || !targeting) return undefined;

    const preferredIds = new Set(targeting.preferredForceIds);
    const isPreferredUnit = (unit: BattleUnit): boolean => {
      const forceId = this.forceIdByUnitId.get(unit.id);
      return forceId !== undefined && preferredIds.has(forceId);
    };
    const hasPreferredSurvivor = units.some(isPreferredUnit);
    if (hasPreferredSurvivor) {
      return isPreferredUnit;
    }
    return targeting.fallback === "all-opponents"
      ? (target) => target.side !== sourceForce.side
      : () => false;
  }
}
