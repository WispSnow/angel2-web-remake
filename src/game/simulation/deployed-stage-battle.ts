import type { ClassId } from "../content/classes";
import { completeCampaignRoster } from "../content/stage0";
import type { StageDefinition } from "../content/stages";
import type { DeploymentRosterUnit } from "../deployment-session";
import type {
  BattleUnit,
  Difficulty,
  DynamicTerrainKind,
  PortraitRecord,
  Position,
  SaveRosterEntry,
  UnitClassId,
} from "../types";
import type { DeploymentResult } from "./deployment";
import {
  createFixedStageCampaignRoster,
  createFixedStageUnits,
  type FixedStageEnemyUnitDefinition,
  type FixedStageUnitConfig,
} from "./fixed-stage-battle";
import type { BattleScenario } from "./battle";
import type { ForceDefinition } from "./forces";
import type { RoutePulseDefinition } from "./route-pulse";
import type { EscortRouteDefinition } from "./escort-route";
import type { EnemyPhaseTailDefinition } from "./enemy-phase-tail";

export interface DeployedStageAllyDefinition {
  slot: number;
  initialClassId?: UnitClassId;
  /** Native sparse class override applied even when the campaign slot has prior growth. */
  forcedClassId?: UnitClassId;
  name: string;
  /** Omit for a generic class identity; named actors must provide their record. */
  portrait?: PortraitRecord;
  /** Preserve the actor name while resolving the portrait from the current class. */
  displayIdentity?: "named-class-portrait";
  aiBehavior: number;
  untouchedExperience?: number;
}

export interface DeployedStageUnitConfig {
  alliedUnits: readonly DeployedStageAllyDefinition[];
  enemyUnits: readonly FixedStageEnemyUnitDefinition[];
  inheritance: FixedStageUnitConfig["inheritance"];
}

export interface DeployedStageScenarioConfig extends DeployedStageUnitConfig {
  stage: StageDefinition;
  terrainSlotAt: (position: Position) => number;
  dynamicTerrainSlots?: Readonly<Partial<Record<DynamicTerrainKind, number>>>;
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  forces: readonly ForceDefinition[];
  /** Side-1 stage-only guests remain controllable but never write to the campaign roster. */
  campaignUnitSlots?: readonly number[];
  routePulses?: readonly RoutePulseDefinition[];
  escortRoutes?: readonly EscortRouteDefinition[];
  enemyPhaseTail?: EnemyPhaseTailDefinition;
}

function alliedUnitConfig(
  config: DeployedStageUnitConfig,
  deployment: DeploymentResult,
): FixedStageUnitConfig {
  return {
    alliedUnits: deployment.placements.map(({ slot, position }) => {
      const definition = config.alliedUnits.find((candidate) => candidate.slot === slot);
      if (!definition) throw new Error(`Deployment references missing allied slot ${slot}`);
      return { ...definition, position };
    }),
    enemyUnits: config.enemyUnits,
    inheritance: config.inheritance,
  };
}

export function createDeployedStageUnits(
  config: DeployedStageUnitConfig,
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
  deployment: DeploymentResult,
): BattleUnit[] {
  return createFixedStageUnits(
    alliedUnitConfig(config, deployment),
    difficulty,
    campaignRoster,
  );
}

export function createDeployedStageRoster(
  config: DeployedStageUnitConfig,
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): DeploymentRosterUnit[] {
  return config.alliedUnits.map((definition) => {
    const unit = createFixedStageUnits({
      alliedUnits: [{ ...definition, position: { x: 0, y: 0 } }],
      enemyUnits: [],
      inheritance: config.inheritance,
    }, difficulty, campaignRoster)[0];
    if (!unit) throw new Error(`Cannot create deployment roster slot ${definition.slot}`);
    return {
      slot: unit.slot,
      name: unit.name,
      portrait: unit.portrait,
      classId: unit.classId,
      className: unit.className,
      experience: unit.experience,
      life: unit.life,
    };
  });
}

function campaignRosterWithEligibleBaselines(
  config: DeployedStageUnitConfig & { campaignUnitSlots?: readonly number[] },
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): SaveRosterEntry[] {
  const campaignSlots = config.campaignUnitSlots
    ? new Set(config.campaignUnitSlots)
    : undefined;
  const eligibleRoster = createDeployedStageRoster(config, difficulty, campaignRoster)
    .filter((unit) => !campaignSlots || campaignSlots.has(unit.slot))
    .map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }));
  return completeCampaignRoster([...campaignRoster, ...eligibleRoster]);
}

export function createDeployedStageScenario(
  config: DeployedStageScenarioConfig,
  campaignRoster: readonly SaveRosterEntry[],
  deployment: DeploymentResult,
): BattleScenario {
  return {
    stage: config.stage,
    width: config.stage.width,
    height: config.stage.height,
    terrainSlotAt: config.terrainSlotAt,
    dynamicTerrainSlots: config.dynamicTerrainSlots,
    createUnits: (difficulty) => createDeployedStageUnits(
      config,
      difficulty,
      campaignRoster,
      deployment,
    ),
    createCampaignRoster: (difficulty) => {
      // Native template class baselines belong to the campaign roster when a character becomes
      // deployable, even if the player leaves that character on the bench for this battle.
      const roster = campaignRosterWithEligibleBaselines(config, difficulty, campaignRoster);
      const projected = createFixedStageCampaignRoster(
        alliedUnitConfig(config, deployment),
        difficulty,
        roster,
      );
      if (!config.campaignUnitSlots) return projected;
      const campaignSlots = new Set(config.campaignUnitSlots);
      const baselineBySlot = new Map(
        completeCampaignRoster(campaignRoster).map((entry) => [entry.slot, entry]),
      );
      return projected.map((entry) => campaignSlots.has(entry.slot)
        ? entry
        : { ...(baselineBySlot.get(entry.slot) ?? entry) });
    },
    enemyClassPriority: config.enemyClassPriority,
    alliedBehaviorById: new Map(
      config.alliedUnits.map(({ slot, aiBehavior }) => [`1:${slot}`, aiBehavior]),
    ),
    enemyBehaviorById: new Map(
      config.enemyUnits.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
    ),
    forces: config.forces,
    campaignUnitSlots: config.campaignUnitSlots,
    routePulses: config.routePulses,
    escortRoutes: config.escortRoutes,
    enemyPhaseTail: config.enemyPhaseTail,
  };
}
