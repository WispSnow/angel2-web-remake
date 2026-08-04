import { BATTLE_ACTION_DEFINITIONS } from "../../content/actions";
import { killRewardFor, movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position, UnitStats } from "../../types";
import type { DeterministicRng } from "../rng";
import { cloneUnitStatuses } from "../status";
import { techniqueEffectRange, type ActionBattlefield } from "./range-map";
import type {
  ActionBlockReason,
  BattleActionIntent,
  PreparedBattleAction,
  SpecialActionAffectedUnit,
} from "./types";

export interface SpecialActionResolutionContext {
  units: readonly BattleUnit[];
  battlefield: ActionBattlefield;
  statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => UnitStats;
}

const positionKey = ({ x, y }: Position): string => `${x},${y}`;
const copyPosition = ({ x, y }: Position): Position => ({ x, y });

function affectedUnit(
  unit: BattleUnit,
  patch: Partial<Pick<SpecialActionAffectedUnit,
    "positionAfter" | "lifeAfter" | "actionDisabledAfter" | "statusesAfter" | "damage" | "healing" | "blocked" | "blockReason">>,
): SpecialActionAffectedUnit {
  const positionBefore = copyPosition(unit);
  const positionAfter = patch.positionAfter ? copyPosition(patch.positionAfter) : copyPosition(unit);
  const lifeAfter = patch.lifeAfter ?? unit.life;
  return {
    unitId: unit.id,
    positionBefore,
    positionAfter,
    lifeBefore: unit.life,
    lifeAfter,
    actionDisabledBefore: unit.actionDisabled,
    actionDisabledAfter: patch.actionDisabledAfter ?? unit.actionDisabled,
    statusesBefore: cloneUnitStatuses(unit.statuses),
    statusesAfter: patch.statusesAfter
      ? cloneUnitStatuses(patch.statusesAfter)
      : cloneUnitStatuses(unit.statuses),
    damage: patch.damage ?? 0,
    healing: patch.healing ?? 0,
    blocked: patch.blocked ?? false,
    blockReason: patch.blockReason,
    died: lifeAfter === 0,
    moved: positionKey(positionBefore) !== positionKey(positionAfter),
  };
}

function prepareSingleTarget(
  intent: BattleActionIntent,
  target: BattleUnit,
  trial: DeterministicRng,
  targetMaximumLife: number,
): { affected: SpecialActionAffectedUnit; experienceGained: number } {
  let damage = 0;
  let healing = 0;
  let blocked = false;
  let blockReason: ActionBlockReason | undefined;
  const targetStatusesAfter = cloneUnitStatuses(target.statuses);

  if (intent.actionId === "archer-shot") {
    const definition = BATTLE_ACTION_DEFINITIONS["archer-shot"];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else {
      damage = trial.between(definition.damage.minimum, definition.damage.maximum);
    }
  } else if (intent.actionId === "fire-1") {
    const definition = BATTLE_ACTION_DEFINITIONS["fire-1"];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else if (target.statuses.magicGuard > 0) {
      blocked = true;
      blockReason = "magicGuard";
      targetStatusesAfter.magicGuard = 0;
    } else {
      damage = Math.min(
        target.life,
        definition.damage.cap,
        Math.floor(targetMaximumLife * definition.damage.maxLifePercent / 100),
      );
    }
  } else if (intent.actionId === "heal-1") {
    const definition = BATTLE_ACTION_DEFINITIONS["heal-1"];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else {
      healing = Math.min(
        targetMaximumLife - target.life,
        Math.floor(targetMaximumLife * definition.healing.maxLifePercent / 100),
      );
    }
  } else {
    const definition = BATTLE_ACTION_DEFINITIONS.dispel;
    targetStatusesAfter.confusion = 0;
    targetStatusesAfter.attackDown = 0;
    targetStatusesAfter.defenseDown = 0;
    targetStatusesAfter.poison = 0;
    targetStatusesAfter.techniqueSeal = 0;
    return {
      affected: affectedUnit(target, {
        actionDisabledAfter: false,
        statusesAfter: targetStatusesAfter,
      }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  }

  const lifeAfter = Math.max(0, Math.min(targetMaximumLife, target.life - damage + healing));
  const targetDied = lifeAfter === 0;
  let experienceGained = 0;
  if (intent.actionId === "archer-shot") {
    const definition = BATTLE_ACTION_DEFINITIONS["archer-shot"];
    experienceGained = trial.between(
      definition.experience.minimum,
      definition.experience.maximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else if (intent.actionId === "fire-1") {
    const definition = BATTLE_ACTION_DEFINITIONS["fire-1"];
    experienceGained = definition.experience.base + trial.between(
      definition.experience.randomMinimum,
      definition.experience.randomMaximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else if (intent.actionId === "heal-1") {
    const definition = BATTLE_ACTION_DEFINITIONS["heal-1"];
    const q = Math.floor(healing * 10 / targetMaximumLife);
    experienceGained = trial.between(
      definition.experience.randomMinimum,
      definition.experience.randomMaximum,
    ) + (q === 0 ? 0 : q + definition.experience.base);
  }

  return {
    affected: affectedUnit(target, {
      lifeAfter,
      statusesAfter: targetStatusesAfter,
      damage,
      healing,
      blocked,
      blockReason,
    }),
    experienceGained,
  };
}

function prepareLightning(
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS["lightning-1"];
  const effect = techniqueEffectRange(
    center,
    context.battlefield.width,
    context.battlefield.height,
    definition.range.effectRadius,
  );
  let experienceGained = 0;
  const affectedUnits = context.units
    .filter((unit) => unit.side !== actor.side && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * context.battlefield.width + left.x
      - (right.y * context.battlefield.width + right.x))
    .map((unit) => {
      const statusesAfter = cloneUnitStatuses(unit.statuses);
      const frozen = unit.actionDisabled;
      const guarded = unit.statuses.magicGuard > 0;
      const blocked = frozen || guarded;
      const blockReason: ActionBlockReason | undefined = frozen
        ? "frozen"
        : guarded
          ? "magicGuard"
          : undefined;
      if (!frozen) statusesAfter.magicGuard = 0;
      const rangeValue = effect.valueAt(unit) as 1 | 2 | 3;
      const damage = blocked
        ? 0
        : Math.min(unit.life, definition.damage.byRangeValue[rangeValue]);
      const lifeAfter = unit.life - damage;
      if (lifeAfter === 0) experienceGained += killRewardFor(unit.classId, unit.side);
      return affectedUnit(unit, {
        statusesAfter,
        blocked,
        blockReason,
        damage,
        lifeAfter,
      });
    });
  return {
    affectedUnits,
    experienceGained,
    effectCells: effect.cells().map((position) => ({ position, value: effect.valueAt(position) })),
  };
}

function prepareIce(
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS["ice-1"];
  const effect = techniqueEffectRange(
    center,
    context.battlefield.width,
    context.battlefield.height,
    definition.range.effectRadius,
  );
  const occupied = new Set(context.units.map(positionKey));
  const offsets = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ] as const;
  let moved = 0;
  const affectedUnits = context.units
    .filter((unit) => unit.side !== actor.side && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * context.battlefield.width + left.x
      - (right.y * context.battlefield.width + right.x))
    .map((unit) => {
      const statusesAfter = cloneUnitStatuses(unit.statuses);
      const alreadyFrozen = unit.actionDisabled;
      const guarded = unit.statuses.magicGuard > 0;
      const classImmune = unit.classId === "dragon"
        || unit.classId === "head"
        || unit.classId === "hand";
      const blocked = alreadyFrozen || guarded || classImmune;
      const blockReason: ActionBlockReason | undefined = alreadyFrozen
        ? "frozen"
        : guarded
          ? "magicGuard"
          : classImmune
            ? "classImmune"
            : undefined;
      if (!alreadyFrozen && guarded) statusesAfter.magicGuard = 0;
      let positionAfter = copyPosition(unit);
      if (!blocked) {
        const currentValue = effect.valueAt(unit);
        const movementRules = movementRulesFor(unit.classId);
        const destination = offsets
          .map((offset) => ({ x: unit.x + offset.x, y: unit.y + offset.y }))
          .find((position) => effect.contains(position)
            && effect.valueAt(position) > 0
            && effect.valueAt(position) < currentValue
            && !occupied.has(positionKey(position))
            && (movementRules[context.battlefield.terrainSlotAt(position)] ?? 99) < 99);
        if (destination) {
          occupied.delete(positionKey(unit));
          occupied.add(positionKey(destination));
          positionAfter = destination;
          moved += 1;
        }
      }
      return affectedUnit(unit, {
        positionAfter,
        actionDisabledAfter: blocked ? unit.actionDisabled : true,
        statusesAfter,
        blocked,
        blockReason,
      });
    });
  const experienceGained = moved > 0
    ? trial.between(definition.experience.base + definition.experience.randomMinimum,
      definition.experience.base + definition.experience.randomMaximum)
    : 0;
  return {
    affectedUnits,
    experienceGained,
    effectCells: effect.cells().map((position) => ({ position, value: effect.valueAt(position) })),
  };
}

function prepareRecovery(
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS["recovery-1"];
  const effect = techniqueEffectRange(
    center,
    context.battlefield.width,
    context.battlefield.height,
    definition.range.effectRadius,
  );
  let totalActualHealing = 0;
  const affectedUnits = context.units
    .filter((unit) => unit.side === actor.side && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * context.battlefield.width + left.x
      - (right.y * context.battlefield.width + right.x))
    .map((unit) => {
      const frozen = unit.actionDisabled;
      const rangeValue = effect.valueAt(unit) as 1 | 2 | 3;
      const maximumLife = context.statsFor(unit).maxLife;
      const healing = frozen
        ? 0
        : Math.min(maximumLife - unit.life, definition.healing.byRangeValue[rangeValue]);
      totalActualHealing += healing;
      return affectedUnit(unit, {
        lifeAfter: unit.life + healing,
        healing,
        blocked: frozen,
        blockReason: frozen ? "frozen" : undefined,
      });
    });
  const quotient = Math.floor(totalActualHealing / definition.experience.divisor);
  const experienceGained = quotient === 0
    ? 0
    : Math.min(quotient, definition.experience.quotientCap)
      + definition.experience.base
      + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      );
  return {
    affectedUnits,
    experienceGained,
    effectCells: effect.cells().map((position) => ({ position, value: effect.valueAt(position) })),
  };
}

export function prepareSpecialAction(
  intent: BattleActionIntent,
  actor: BattleUnit,
  target: BattleUnit | undefined,
  rng: DeterministicRng,
  context: SpecialActionResolutionContext,
  center: Position,
): PreparedBattleAction {
  const trial = rng.clone();
  let affectedUnits: SpecialActionAffectedUnit[];
  let experienceGained: number;
  let effectCells: PreparedBattleAction["result"]["effectCells"] = [];

  if (intent.actionId === "lightning-1") {
    ({ affectedUnits, experienceGained, effectCells } = prepareLightning(actor, center, context));
  } else if (intent.actionId === "ice-1") {
    ({ affectedUnits, experienceGained, effectCells } = prepareIce(actor, center, context, trial));
  } else if (intent.actionId === "recovery-1") {
    ({ affectedUnits, experienceGained, effectCells } = prepareRecovery(actor, center, context, trial));
  } else {
    if (!target) throw new Error("single-target action requires a target unit");
    const single = prepareSingleTarget(intent, target, trial, context.statsFor(target).maxLife);
    affectedUnits = [single.affected];
    experienceGained = single.experienceGained;
  }

  const primary = target
    ? affectedUnits.find(({ unitId }) => unitId === target.id)
    : affectedUnits[0];
  const emptyStatuses = cloneUnitStatuses(target?.statuses ?? actor.statuses);
  return {
    intent,
    result: {
      actionId: intent.actionId,
      actorId: actor.id,
      targetId: target?.id,
      target: copyPosition(center),
      damage: affectedUnits.reduce((total, affected) => total + affected.damage, 0),
      healing: affectedUnits.reduce((total, affected) => total + affected.healing, 0),
      blocked: affectedUnits.length > 0 && affectedUnits.every(({ blocked }) => blocked),
      blockReason: primary?.blockReason,
      targetDied: primary?.died ?? false,
      experienceGained,
      affectedUnits,
      effectCells,
    },
    rngBefore: rng.state,
    rngAfter: trial.state,
    rngCallsBefore: rng.calls,
    rngCallsAfter: trial.calls,
    actorExperienceBefore: actor.experience,
    actorExperienceAfter: actor.experience + experienceGained,
    targetLifeBefore: primary?.lifeBefore ?? 0,
    targetLifeAfter: primary?.lifeAfter ?? 0,
    targetStatusesBefore: primary?.statusesBefore ?? emptyStatuses,
    targetStatusesAfter: primary?.statusesAfter ?? emptyStatuses,
    affectedUnits,
  };
}
