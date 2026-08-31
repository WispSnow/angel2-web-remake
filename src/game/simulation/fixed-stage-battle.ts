import type { ClassId } from "../content/classes";
import {
  classFallbackPortraitFor,
  className,
  classStatsFor,
  genericUnitName,
} from "../content/classes";
import { completeCampaignRoster, initialEnemyExperience, statsFor } from "../content/stage0";
import type { StageDefinition } from "../content/stages";
import type {
  BattleUnit,
  Difficulty,
  DynamicTerrainKind,
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
  /** Initial class supplied by the native template for an untouched campaign slot. */
  initialClassId?: UnitClassId;
  /** Scene-only class override; unlike initialClassId this ignores campaign growth. */
  forcedClassId?: UnitClassId;
  name: string;
  /** Omit for a generic class identity; named actors must provide their record. */
  portrait?: PortraitRecord;
  /** Preserve the actor name while resolving the portrait from the current class. */
  displayIdentity?: "named-class-portrait";
  aiBehavior: number;
  untouchedExperience?: number;
}

export interface FixedStageEnemyUnitDefinition {
  slot: number;
  position: Position;
  classId: UnitClassId;
  name: string;
  /** Omit for a generic class identity; named actors must provide their record. */
  portrait?: PortraitRecord;
  aiBehavior: number;
}

export interface FixedStageUnitConfig {
  alliedUnits: readonly FixedStageAlliedUnitDefinition[];
  enemyUnits: readonly FixedStageEnemyUnitDefinition[];
  /** Whether this ruleset applies the shared enemy difficulty experience loop. */
  enemyExperienceSeeding?: "difficulty" | "none" | "difficulty-unless-lawless";
  inheritance: {
    genericPortrait: PortraitRecord;
    defaultClassId: UnitClassId;
    untouchedNamedExperience: number;
  };
}

export interface FixedStageScenarioConfig extends FixedStageUnitConfig {
  stage: StageDefinition;
  terrainSlotAt: (position: Position) => number;
  dynamicTerrainSlots?: Readonly<Partial<Record<DynamicTerrainKind, number>>>;
  enemyClassPriority: Readonly<Partial<Record<ClassId, number>>>;
  forces: readonly ForceDefinition[];
  campaignUnitSlots?: readonly number[];
}

function createInheritedAlly(
  definition: FixedStageAlliedUnitDefinition,
  campaignRoster: readonly SaveRosterEntry[],
  inheritance: FixedStageUnitConfig["inheritance"],
): BattleUnit {
  const inherited = campaignRoster.find(({ slot }) => slot === definition.slot);
  const untouchedCampaignSlot = inherited === undefined
    || (inherited.classId === inheritance.defaultClassId && inherited.experience === 0);
  const classId = definition.forcedClassId ?? (untouchedCampaignSlot
    ? definition.initialClassId ?? inherited?.classId ?? inheritance.defaultClassId
    : inherited.classId);
  const usesClassPortrait = definition.portrait === undefined
    || definition.portrait === inheritance.genericPortrait;
  const genericIdentity = usesClassPortrait
    && definition.displayIdentity !== "named-class-portrait";
  const namedBaseline = !genericIdentity && untouchedCampaignSlot;
  const portrait = usesClassPortrait
    ? classFallbackPortraitFor(classId, 1) ?? inheritance.genericPortrait
    : definition.portrait ?? inheritance.genericPortrait;
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
    name: genericIdentity
      ? genericUnitName({ classId, side: 1, slot: definition.slot })
      : definition.name,
    portrait,
    ...(definition.displayIdentity ? { displayIdentity: definition.displayIdentity } : {}),
    x: definition.position.x,
    y: definition.position.y,
    // 新战入场按原版模块 29 的 `0000:536B`：先由职业和累计经验重建属性，再把当前
    // 生命写为重建后的最大生命。战役状态只携带职业与经验，不携带上一关的残血。
    // 编号存档恢复走 `Stage0Battle.restore`，那里直接覆盖单位，不重复本次回满。
    life: maximumLife,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
}

export function createFixedStageEnemy(
  definition: FixedStageEnemyUnitDefinition,
  difficulty: Difficulty,
  experienceSeeding: FixedStageUnitConfig["enemyExperienceSeeding"] = "difficulty",
): BattleUnit {
  const experience = experienceSeeding === "none"
    || (experienceSeeding === "difficulty-unless-lawless" && difficulty === 3)
    ? 0
    : initialEnemyExperience(definition.classId, difficulty);
  const unit: BattleUnit = {
    id: `2:${definition.slot}`,
    side: 2,
    slot: definition.slot,
    classId: definition.classId,
    className: className(definition.classId),
    name: definition.name,
    portrait: definition.portrait
      ?? classFallbackPortraitFor(definition.classId, 2)
      ?? 48 as PortraitRecord,
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
    ...config.enemyUnits.map((definition) =>
      createFixedStageEnemy(definition, difficulty, config.enemyExperienceSeeding)),
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
    dynamicTerrainSlots: config.dynamicTerrainSlots,
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
    campaignUnitSlots: config.campaignUnitSlots,
  };
}
