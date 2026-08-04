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
  Position,
  SaveRosterEntry,
} from "../types";
import {
  Stage0Battle,
  type AlliedAiAction,
  type BattleScenario,
} from "./battle";
import { manhattan, positionKey, shortestPath } from "./grid";
import { DeterministicRng } from "./rng";
import { emptyUnitStatuses } from "./status";

const STAGE3_AI_CLASS_PRIORITY = {
  cavalry: 16,
  monk: 32,
  sister: 35,
  soldier: 36,
} as const;

const STAGE3_DEFENSIVE_TERRAIN_SLOTS = new Set([3, 5]);
const STAGE3_FIRST_CORPS_IDS = new Set(["2:42", "2:41", "2:40", "2:43", "2:17"]);

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
    };
    super(campaign.difficulty, rng, scenario);
    this.focusId = "1:1";
  }

  override planAlliedAiAction(id: string, leaderId?: string): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit
      || unit.side !== 1
      || this.isPlayerControllableAlly(id)
      || unit.acted
      || unit.actionDisabled) return undefined;

    if (!this.isDefensivePosition(unit)) return this.planForestEntry(unit);

    if (unit.classId === "sister" && unit.statuses.techniqueSeal === 0) {
      const criticalHeal = this.planClassAction(unit, ["heal-1"], {
        modernRanking: true,
        targetFilter: (target) => this.isAutomaticAlly(target)
          && target.life * 2 < this.statsFor(target).maxLife,
      });
      if (criticalHeal) return criticalHeal;
      const recoveryHeal = this.planClassAction(unit, ["heal-1"], {
        modernRanking: true,
        targetFilter: (target) => this.isAutomaticAlly(target),
      });
      if (recoveryHeal) return recoveryHeal;
    }

    if (unit.life * 2 < this.statsFor(unit).maxLife) {
      return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }

    const behavior = this.alliedBehaviorFor(id);
    const automaticLeader = behavior >= 4 && behavior % 2 === 0
      ? this.units.find((candidate) => candidate.side === unit.side
        && this.alliedBehaviorFor(candidate.id) === behavior - 1)
      : undefined;
    const formationMove = automaticLeader
      ? this.planDefensiveFormationMove(unit, automaticLeader)
      : undefined;
    if (formationMove) return formationMove;

    const requestedLeader = leaderId ? this.unit(leaderId) : undefined;
    const requestedMove = requestedLeader?.side === unit.side
      ? this.planDefensiveFormationMove(unit, requestedLeader)
      : undefined;
    if (requestedMove) return requestedMove;

    const defensiveActionOptions = {
      positionFilter: (position: Position) => this.isDefensivePosition(position),
      pathFilter: (path: readonly Position[]) => path.every((position) =>
        this.isDefensivePosition(position)),
    };
    const classAction = unit.classId === "sister"
      ? this.planClassAction(unit, ["fire-1"], {
        ...defensiveActionOptions,
        targetFilter: (target) => target.side === 2,
      })
      : this.planClassAction(unit, undefined, {
        ...defensiveActionOptions,
        targetFilter: (target) => unit.classId === "monk"
          ? this.isAutomaticAlly(target)
          : target.side === 2,
      });
    if (classAction) return classAction;

    return this.planOrdinaryAiAction(unit, 2, behavior, {
      destinationFilter: defensiveActionOptions.positionFilter,
      pathFilter: defensiveActionOptions.pathFilter,
      restThresholdPercent: 50,
    });
  }

  override planEnemyAiAction(
    id: string,
    behavior = this.enemyBehaviorFor(id),
  ): AlliedAiAction | undefined {
    const unit = this.unit(id);
    if (!unit || unit.side !== 2 || unit.acted || unit.actionDisabled) return undefined;
    const stats = this.statsFor(unit);
    if (Math.floor(unit.life * 100 / stats.maxLife) < 20) {
      return { unitId: id, kind: "rest", path: [{ x: unit.x, y: unit.y }] };
    }

    const targetFilter = this.enemyCorpsTargetFilter(id);
    if (unit.classId === "sister" && unit.statuses.techniqueSeal === 0) {
      const actionId = this.rng.between(0, 1) === 0 ? "fire-1" : "heal-1";
      const special = this.planClassAction(unit, [actionId], actionId === "fire-1"
        ? { targetFilter }
        : undefined);
      if (special) return special;
    }
    if (unit.classId === "monk" && unit.statuses.techniqueSeal === 0) {
      const actionId = this.rng.between(0, 1) === 0 ? "heal-1" : "recovery-1";
      const special = this.planClassAction(unit, [actionId]);
      if (special) return special;
    }
    return this.planOrdinaryAiAction(unit, 1, behavior, { targetFilter });
  }

  private isAutomaticAlly(unit: BattleUnit): boolean {
    return unit.side === 1 && !this.isPlayerControllableAlly(unit.id);
  }

  private isDefensivePosition(position: Position): boolean {
    return STAGE3_DEFENSIVE_TERRAIN_SLOTS.has(stage3TerrainSlotAt(position));
  }

  private planForestEntry(unit: BattleUnit): AlliedAiAction {
    const candidates = this.reachableCells(unit.id)
      .filter((position) => stage3TerrainSlotAt(position) === 3)
      .map((position) => ({ position, path: this.movementPath(unit.id, position) }))
      .filter(({ path }) => path.length > 1)
      .sort((left, right) => left.path.length - right.path.length
        || left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x));
    const selected = candidates[0];
    return selected
      ? { unitId: unit.id, kind: "move", path: selected.path }
      : { unitId: unit.id, kind: "wait", path: [{ x: unit.x, y: unit.y }] };
  }

  private planDefensiveFormationMove(
    unit: BattleUnit,
    leader: BattleUnit,
  ): AlliedAiAction | undefined {
    if (leader.id === unit.id) return undefined;
    const directPath = shortestPath(
      unit,
      leader,
      unit.classId,
      this.statsFor(unit).movement,
      this.units.filter((candidate) => candidate.id !== unit.id),
      this.scenario,
    );
    if (directPath.length > 0) return undefined;

    const distanceBefore = manhattan(unit, leader);
    const candidates = this.reachableCells(unit.id)
      .filter((position) => this.isDefensivePosition(position))
      .map((position) => ({
        position,
        path: positionKey(position) === positionKey(unit)
          ? [{ x: unit.x, y: unit.y }]
          : this.movementPath(unit.id, position),
        distance: manhattan(position, leader),
      }))
      .filter(({ path, distance }) => path.length > 1
        && distance < distanceBefore
        && path.every((position) => this.isDefensivePosition(position)))
      .sort((left, right) => left.distance - right.distance
        || right.path.length - left.path.length
        || left.position.y * this.stage.width + left.position.x
          - (right.position.y * this.stage.width + right.position.x));
    const selected = candidates[0];
    return selected ? { unitId: unit.id, kind: "move", path: selected.path } : undefined;
  }

  private enemyCorpsTargetFilter(id: string): (target: BattleUnit) => boolean {
    const prefersAutomatic = STAGE3_FIRST_CORPS_IDS.has(id);
    const matchesPreferredGroup = (target: BattleUnit) => this.isAutomaticAlly(target)
      === prefersAutomatic;
    const preferredGroupAlive = this.units.some((target) =>
      target.side === 1 && matchesPreferredGroup(target));
    return preferredGroupAlive
      ? (target) => target.side === 1 && matchesPreferredGroup(target)
      : (target) => target.side === 1;
  }
}
