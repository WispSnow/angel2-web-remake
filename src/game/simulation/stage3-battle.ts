import {
  activateStage3Content,
  STAGE3_DEFINITION,
  STAGE3_SEMANTIC_ALLIED_UNITS,
  STAGE3_SEMANTIC_ENEMY_UNITS,
  stage3TerrainSlotAt,
} from "../content/stage3";
import { className, classStatsFor } from "../content/classes";
import { completeCampaignRoster, initialEnemyExperience, statsFor } from "../content/stage0";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  SaveRosterEntry,
} from "../types";
import { Stage0Battle, type BattleScenario } from "./battle";
import type { ForceDefinition } from "./forces";
import { DeterministicRng } from "./rng";
import { emptyUnitStatuses } from "./status";

const STAGE3_AI_CLASS_PRIORITY = {
  cavalry: 16,
  monk: 32,
  sister: 35,
  soldier: 36,
} as const;

const sideUnitIds = (side: BattleUnit["side"], slots: readonly number[]): string[] =>
  slots.map((slot) => `${side}:${slot}`);

const STAGE3_FORCE_DEFINITIONS = [
  {
    id: "himi-rescue-force",
    side: 1,
    control: "player",
    unitIds: sideUnitIds(1, [54, 53, 52, 51, 1, 4]),
    commanderId: "1:1",
    doctrine: { strategy: "native" },
  },
  {
    id: "fourth-corps",
    side: 1,
    control: "independent-ai",
    unitIds: sideUnitIds(1, [21, 46, 45, 47, 3, 20, 50]),
    doctrine: {
      strategy: "terrain-hold",
      allowedTerrainSlots: [3, 5],
      entryTerrainSlots: [3],
      restThresholdPercent: 50,
      criticalHealThresholdPercent: 50,
      priorityHealingActionsByClass: { sister: ["heal-1"] },
      preserveNativeFormation: true,
    },
  },
  {
    id: "sha-first-corps",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [42, 41, 40, 43, 17]),
    doctrine: { strategy: "native" },
    targeting: {
      preferredForceIds: ["fourth-corps"],
      fallback: "all-opponents",
    },
  },
  {
    id: "sha-second-corps",
    side: 2,
    control: "independent-ai",
    unitIds: sideUnitIds(2, [44, 45, 47, 46, 50, 48, 49]),
    doctrine: { strategy: "native" },
    targeting: {
      preferredForceIds: ["himi-rescue-force"],
      fallback: "all-opponents",
    },
  },
] as const satisfies readonly ForceDefinition[];

function stage3Ally(
  definition: typeof STAGE3_SEMANTIC_ALLIED_UNITS[number],
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit {
  const inherited = campaignRoster.find(({ slot }) => slot === definition.slot);
  const classId = definition.classOverride ?? inherited?.classId ?? "soldier";
  const namedBaseline = definition.portrait !== 47
    && inherited?.classId === "soldier"
    && inherited.experience === 0;
  const experience = namedBaseline ? 299 : inherited?.experience ?? 0;
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

export function createStage3Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  const allies = STAGE3_SEMANTIC_ALLIED_UNITS.map((definition) =>
    stage3Ally(definition, campaignRoster));
  const enemies = STAGE3_SEMANTIC_ENEMY_UNITS.map((definition): BattleUnit => {
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
  });
  return [...allies, ...enemies];
}

function stage3CampaignRoster(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): SaveRosterEntry[] {
  const roster = completeCampaignRoster(campaignRoster);
  const bySlot = new Map(roster.map((entry) => [entry.slot, entry]));
  for (const unit of createStage3Units(difficulty, campaignRoster).filter(({ side }) => side === 1)) {
    bySlot.set(unit.slot, {
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    });
  }
  return [...bySlot.values()].sort((left, right) => left.slot - right.slot);
}

export class Stage3Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage3Content();
    const scenario: BattleScenario = {
      stage: STAGE3_DEFINITION,
      width: STAGE3_DEFINITION.width,
      height: STAGE3_DEFINITION.height,
      terrainSlotAt: stage3TerrainSlotAt,
      createUnits: (difficulty) => createStage3Units(difficulty, campaign.roster),
      createCampaignRoster: (difficulty) => stage3CampaignRoster(difficulty, campaign.roster),
      enemyClassPriority: STAGE3_AI_CLASS_PRIORITY,
      alliedBehaviorById: new Map(
        STAGE3_SEMANTIC_ALLIED_UNITS.map(({ slot, aiBehavior }) => [`1:${slot}`, aiBehavior]),
      ),
      enemyBehaviorById: new Map(
        STAGE3_SEMANTIC_ENEMY_UNITS.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
      ),
      forces: STAGE3_FORCE_DEFINITIONS,
    };
    super(campaign.difficulty, rng, scenario);
    this.focusId = "1:1";
  }
}
