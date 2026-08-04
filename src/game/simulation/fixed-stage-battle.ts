import type { ClassId } from "../content/classes";
import { className, classStatsFor } from "../content/classes";
import { completeCampaignRoster, initialEnemyExperience, statsFor } from "../content/stage0";
import type { StageDefinition } from "../content/stages";
import type {
  BattleUnit,
  Difficulty,
  PortraitRecord,
  Position,
  SaveRosterEntry,
  UnitClassId,
} from "../types";
import { emptyUnitStatuses } from "./status";
import type { BattleScenario } from "./battle";
import type { ForceDefinition } from "./forces";

export interface FixedStageAlliedUnitDefinition {
  slot: number;
  position: Position;
  classOverride?: UnitClassId;
  name: string;
  portrait: PortraitRecord;
  aiBehavior: number;
  untouchedExperience?: number;
}

export interface FixedStageEnemyUnitDefinition {
  slot: number;
  position: Position;
  classId: UnitClassId;
  name: string;
  portrait: PortraitRecord;
  aiBehavior: number;
}

export interface FixedStageUnitConfig {
  alliedUnits: readonly FixedStageAlliedUnitDefinition[];
  enemyUnits: readonly FixedStageEnemyUnitDefinition[];
  inheritance: {
    genericPortrait: PortraitRecord;
    defaultClassId: UnitClassId;
    untouchedNamedExperience: number;
  };
}

export interface FixedStageScenarioConfig extends FixedStageUnitConfig {
  stage: StageDefinition;
  terrainSlotAt: (position: Position) => number;
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  forces: readonly ForceDefinition[];
}

function createInheritedAlly(
  definition: FixedStageAlliedUnitDefinition,
  campaignRoster: readonly SaveRosterEntry[],
  inheritance: FixedStageUnitConfig["inheritance"],
): BattleUnit {
  const inherited = campaignRoster.find(({ slot }) => slot === definition.slot);
  const classId = definition.classOverride ?? inherited?.classId ?? inheritance.defaultClassId;
  const namedBaseline = definition.portrait !== inheritance.genericPortrait
    && inherited?.classId === inheritance.defaultClassId
    && inherited.experience === 0;
  const experience = namedBaseline
    ? definition.untouchedExperience ?? inheritance.untouchedNamedExperience
    : inherited?.experience ?? 0;
  const maximumLife = classStatsFor({ classId, experience }).maxLife;
  return {
    id: `1:${definition.slot}`,
    side: 1,
    slot: definition.slot,
    classId,
    className: className(classId),
    name: definition.name,
    portrait: definition.portrait,
    x: definition.position.x,
    y: definition.position.y,
    life: namedBaseline ? maximumLife : Math.min(inherited?.life ?? maximumLife, maximumLife),
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
}

function createEnemy(
  definition: FixedStageEnemyUnitDefinition,
  difficulty: Difficulty,
): BattleUnit {
  const experience = initialEnemyExperience(definition.classId, difficulty);
  const unit: BattleUnit = {
    id: `2:${definition.slot}`,
    side: 2,
    slot: definition.slot,
    classId: definition.classId,
    className: className(definition.classId),
    name: definition.name,
    portrait: definition.portrait,
    x: definition.position.x,
    y: definition.position.y,
    life: 0,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
  unit.life = statsFor(unit, difficulty).maxLife;
  return unit;
}

export function createFixedStageUnits(
  config: FixedStageUnitConfig,
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  return [
    ...config.alliedUnits.map((definition) =>
      createInheritedAlly(definition, campaignRoster, config.inheritance)),
    ...config.enemyUnits.map((definition) => createEnemy(definition, difficulty)),
  ];
}

export function createFixedStageCampaignRoster(
  config: FixedStageUnitConfig,
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): SaveRosterEntry[] {
  const bySlot = new Map(
    completeCampaignRoster(campaignRoster).map((entry) => [entry.slot, entry]),
  );
  for (const unit of createFixedStageUnits(config, difficulty, campaignRoster)
    .filter(({ side }) => side === 1)) {
    bySlot.set(unit.slot, {
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    });
  }
  return [...bySlot.values()].sort((left, right) => left.slot - right.slot);
}

export function createFixedStageScenario(
  config: FixedStageScenarioConfig,
  campaignRoster: readonly SaveRosterEntry[],
): BattleScenario {
  return {
    stage: config.stage,
    width: config.stage.width,
    height: config.stage.height,
    terrainSlotAt: config.terrainSlotAt,
    createUnits: (difficulty) => createFixedStageUnits(config, difficulty, campaignRoster),
    createCampaignRoster: (difficulty) =>
      createFixedStageCampaignRoster(config, difficulty, campaignRoster),
    enemyClassPriority: config.enemyClassPriority,
    alliedBehaviorById: new Map(
      config.alliedUnits.map(({ slot, aiBehavior }) => [`1:${slot}`, aiBehavior]),
    ),
    enemyBehaviorById: new Map(
      config.enemyUnits.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
    ),
    forces: config.forces,
  };
}
