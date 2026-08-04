import {
  activateStage2Content,
  STAGE2_DEFINITION,
  STAGE2_SEMANTIC_ALLIED_UNITS,
  STAGE2_SEMANTIC_ENEMY_UNITS,
  stage2TerrainSlotAt,
} from "../content/stage2";
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

const STAGE2_AI_CLASS_PRIORITY = {
  cavalry: 16,
  soldier: 36,
} as const;

const STAGE2_FORCE_DEFINITIONS = [
  {
    id: "stage2-player-force",
    side: 1,
    control: "player",
    unitIds: ["1:0", "1:2", "1:24"],
    doctrine: { strategy: "native" },
  },
  {
    id: "stage2-allied-corps",
    side: 1,
    control: "independent-ai",
    unitIds: ["1:40", "1:41", "1:42", "1:43", "1:44", "1:45"],
    doctrine: { strategy: "native" },
  },
  {
    id: "stage2-enemy-force",
    side: 2,
    control: "independent-ai",
    unitIds: STAGE2_SEMANTIC_ENEMY_UNITS.map(({ slot }) => `2:${slot}`),
    doctrine: { strategy: "native" },
  },
] as const satisfies readonly ForceDefinition[];

function stage2Ally(
  definition: typeof STAGE2_SEMANTIC_ALLIED_UNITS[number],
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

export function createStage2Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit[] {
  const allies = STAGE2_SEMANTIC_ALLIED_UNITS.map((definition) =>
    stage2Ally(definition, campaignRoster));
  const enemies = STAGE2_SEMANTIC_ENEMY_UNITS.map((definition): BattleUnit => {
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

function stage2CampaignRoster(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
): SaveRosterEntry[] {
  const roster = completeCampaignRoster(campaignRoster);
  const bySlot = new Map(roster.map((entry) => [entry.slot, entry]));
  for (const unit of createStage2Units(difficulty, campaignRoster).filter(({ side }) => side === 1)) {
    bySlot.set(unit.slot, {
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    });
  }
  return [...bySlot.values()].sort((left, right) => left.slot - right.slot);
}

export class Stage2Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage2Content();
    const scenario: BattleScenario = {
      stage: STAGE2_DEFINITION,
      width: STAGE2_DEFINITION.width,
      height: STAGE2_DEFINITION.height,
      terrainSlotAt: stage2TerrainSlotAt,
      createUnits: (difficulty) => createStage2Units(difficulty, campaign.roster),
      createCampaignRoster: (difficulty) => stage2CampaignRoster(difficulty, campaign.roster),
      enemyClassPriority: STAGE2_AI_CLASS_PRIORITY,
      alliedBehaviorById: new Map(
        STAGE2_SEMANTIC_ALLIED_UNITS.map(({ slot, aiBehavior }) => [`1:${slot}`, aiBehavior]),
      ),
      enemyBehaviorById: new Map(
        STAGE2_SEMANTIC_ENEMY_UNITS.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
      ),
      forces: STAGE2_FORCE_DEFINITIONS,
    };
    super(campaign.difficulty, rng, scenario);
  }
}
