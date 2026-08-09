import {
  BATTLE_ACTION_DEFINITIONS,
  CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
} from "../../content/actions";
import { killRewardFor, movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position, UnitStats } from "../../types";
import type { DeterministicRng } from "../rng";
import { cloneUnitStatuses } from "../status";
import {
  stompEffectRange,
  techniqueEffectRange,
  type ActionBattlefield,
  type ActionViewport,
} from "./range-map";
import type {
  ActionBlockReason,
  BattleActionId,
  BattleActionIntent,
  PreparedBattleAction,
  PrayerOutcomeKind,
  SpecialActionAffectedUnit,
} from "./types";

export interface SpecialActionResolutionContext {
  units: readonly BattleUnit[];
  battlefield: ActionBattlefield;
  statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => UnitStats;
  viewport?: ActionViewport;
}

const positionKey = ({ x, y }: Position): string => `${x},${y}`;
const copyPosition = ({ x, y }: Position): Position => ({ x, y });
const isFireAction = (actionId: BattleActionId): actionId is "fire-1" | "fire-2" | "fire-3" | "fire-4" =>
  actionId === "fire-1" || actionId === "fire-2" || actionId === "fire-3" || actionId === "fire-4";
const isHealAction = (actionId: BattleActionId): actionId is "heal-1" | "heal-2" | "heal-3" =>
  actionId === "heal-1" || actionId === "heal-2" || actionId === "heal-3";
const isShootingAction = (actionId: BattleActionId): actionId is "archer-shot" | "crossbow-shot" =>
  actionId === "archer-shot" || actionId === "crossbow-shot";

function shootingEvaded(target: BattleUnit, trial: DeterministicRng): boolean {
  return target.classId === "swift-dragon-knight" && (trial.nextUint() & 1) === 1;
}

function affectedUnit(
  unit: BattleUnit,
  patch: Partial<Pick<SpecialActionAffectedUnit,
    "positionAfter" | "lifeAfter" | "experienceAfter" | "actionDisabledAfter" | "statusesAfter"
    | "damage" | "healing" | "blocked" | "blockReason" | "prayerOutcome" | "prayerRolledAmount">>,
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
    experienceBefore: unit.experience,
    experienceAfter: patch.experienceAfter ?? unit.experience,
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
    prayerOutcome: patch.prayerOutcome,
    prayerRolledAmount: patch.prayerRolledAmount,
  };
}

function preparePrayer(
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; eligibleUnitIds: string[] } {
  const definition = BATTLE_ACTION_DEFINITIONS.prayer;
  const eligible = context.units
    .filter((unit) => unit.side === definition.scan.eligibleSide)
    .sort((left, right) => left.y * context.battlefield.width + left.x
      - (right.y * context.battlefield.width + right.x));
  const affectedUnits: SpecialActionAffectedUnit[] = [];

  for (const unit of eligible) {
    if ((trial.nextUint() & (1 << definition.scan.gateBit)) === 0) continue;
    const outcomeRoll = trial.between(0, 3);
    const outcome: PrayerOutcomeKind = outcomeRoll === definition.outcomes.healing.roll
      ? "healing"
      : outcomeRoll === definition.outcomes.experience.roll
        ? "experience"
        : outcomeRoll === definition.outcomes.attackUp.roll
          ? "attackUp"
          : "defenseUp";
    const statusesAfter = cloneUnitStatuses(unit.statuses);
    let lifeAfter = unit.life;
    let experienceAfter = unit.experience;
    let healing = 0;
    let blocked = false;
    let blockReason: ActionBlockReason | undefined;
    let prayerRolledAmount: number | undefined;

    if (outcome === "healing") {
      prayerRolledAmount = trial.between(
        definition.outcomes.healing.minimum,
        definition.outcomes.healing.maximum,
      );
      if (unit.actionDisabled) {
        blocked = true;
        blockReason = "frozen";
      } else {
        const maximumLife = context.statsFor(unit).maxLife;
        healing = Math.min(maximumLife - unit.life, prayerRolledAmount);
        lifeAfter += healing;
      }
    } else if (outcome === "experience") {
      prayerRolledAmount = trial.between(
        definition.outcomes.experience.minimum,
        definition.outcomes.experience.maximum,
      );
      experienceAfter += prayerRolledAmount;
    } else if (outcome === "attackUp") {
      statusesAfter.attackUp = definition.outcomes.attackUp.counter;
    } else {
      statusesAfter.defenseUp = definition.outcomes.defenseUp.counter;
    }

    affectedUnits.push(affectedUnit(unit, {
      lifeAfter,
      experienceAfter,
      statusesAfter,
      healing,
      blocked,
      blockReason,
      prayerOutcome: outcome,
      prayerRolledAmount,
    }));
  }

  return {
    affectedUnits,
    eligibleUnitIds: eligible.map(({ id }) => id),
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

  if (isShootingAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else if (shootingEvaded(target, trial)) {
      damage = 0;
    } else {
      // REMAKE-009 uses the player-visible action definition for both sides;
      // legacyStrict owns the native side-2 50..89 crossbow range.
      damage = trial.between(definition.damage.minimum, definition.damage.maximum);
    }
  } else if (isFireAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else {
      // REMAKE-005 classifies fire as magic damage: the native path pierced
      // the guard and then cleared it, while stableRemake blocks first and
      // still consumes the one-cast guard at the atomic settlement boundary.
      const guarded = target.statuses.magicGuard > 0;
      targetStatusesAfter.magicGuard = 0;
      if (guarded) {
        blocked = true;
        blockReason = "magicGuard";
      } else {
        damage = Math.min(
          target.life,
          definition.damage.cap,
          Math.floor(targetMaximumLife * definition.damage.maxLifePercent / 100),
        );
      }
    }
  } else if (isHealAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    if (target.actionDisabled) {
      blocked = true;
      blockReason = "frozen";
    } else {
      healing = Math.min(
        targetMaximumLife - target.life,
        Math.floor(targetMaximumLife * definition.healing.maxLifePercent / 100),
      );
    }
  } else if (intent.actionId === "attack-up") {
    const definition = BATTLE_ACTION_DEFINITIONS["attack-up"];
    targetStatusesAfter.attackUp = definition.status.counter;
    return {
      affected: affectedUnit(target, { statusesAfter: targetStatusesAfter }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "defense-up") {
    const definition = BATTLE_ACTION_DEFINITIONS["defense-up"];
    targetStatusesAfter.defenseUp = definition.status.counter;
    return {
      affected: affectedUnit(target, { statusesAfter: targetStatusesAfter }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "magic-guard") {
    const definition = BATTLE_ACTION_DEFINITIONS["magic-guard"];
    targetStatusesAfter.magicGuard = definition.status.counter;
    return {
      affected: affectedUnit(target, { statusesAfter: targetStatusesAfter }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "poison") {
    const definition = BATTLE_ACTION_DEFINITIONS.poison;
    if (definition.status.immuneClasses.some((classId) => classId === target.classId)) {
      blocked = true;
      blockReason = "classImmune";
    } else {
      targetStatusesAfter.poison = definition.status.counter;
    }
    return {
      affected: affectedUnit(target, {
        statusesAfter: targetStatusesAfter,
        blocked,
        blockReason,
      }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "confusion") {
    const definition = BATTLE_ACTION_DEFINITIONS.confusion;
    if (definition.status.immuneClasses.some((classId) => classId === target.classId)) {
      blocked = true;
      blockReason = "classImmune";
    } else {
      targetStatusesAfter.confusion = definition.status.counter;
    }
    return {
      affected: affectedUnit(target, {
        statusesAfter: targetStatusesAfter,
        blocked,
        blockReason,
      }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "attack-down") {
    const definition = BATTLE_ACTION_DEFINITIONS["attack-down"];
    targetStatusesAfter.attackDown = definition.status.counter;
    return {
      affected: affectedUnit(target, { statusesAfter: targetStatusesAfter }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "defense-down") {
    const definition = BATTLE_ACTION_DEFINITIONS["defense-down"];
    targetStatusesAfter.defenseDown = definition.status.counter;
    return {
      affected: affectedUnit(target, { statusesAfter: targetStatusesAfter }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "spell-seal") {
    const definition = BATTLE_ACTION_DEFINITIONS["spell-seal"];
    if (definition.status.immuneClasses.some((classId) => classId === target.classId)) {
      blocked = true;
      blockReason = "classImmune";
    } else {
      targetStatusesAfter.techniqueSeal = definition.status.counter;
    }
    return {
      affected: affectedUnit(target, {
        statusesAfter: targetStatusesAfter,
        blocked,
        blockReason,
      }),
      experienceGained: definition.experience.base + trial.between(
        definition.experience.randomMinimum,
        definition.experience.randomMaximum,
      ),
    };
  } else if (intent.actionId === "dispel") {
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
  } else {
    throw new Error(`unsupported single-target action ${intent.actionId}`);
  }

  const lifeAfter = Math.max(0, Math.min(targetMaximumLife, target.life - damage + healing));
  const targetDied = lifeAfter === 0;
  let experienceGained = 0;
  if (isShootingAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    experienceGained = trial.between(
      definition.experience.minimum,
      definition.experience.maximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else if (isFireAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
    experienceGained = definition.experience.base + trial.between(
      definition.experience.randomMinimum,
      definition.experience.randomMaximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else if (isHealAction(intent.actionId)) {
    const definition = BATTLE_ACTION_DEFINITIONS[intent.actionId];
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

function prepareMagicArcher(
  actor: BattleUnit,
  target: BattleUnit,
  linePath: readonly Position[] | undefined,
  trial: DeterministicRng,
  context: SpecialActionResolutionContext,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS["magic-archer-shot"];
  if (!linePath) throw new Error("magic archer action requires an explicit line path");
  const path = linePath.map(copyPosition);
  // REMAKE-009 likewise excludes the native side-2 50..59 upper bound.
  const roll = trial.between(
    definition.damage.minimum,
    definition.damage.maximum,
  );
  const halfDamage = Math.floor(roll / 2);
  const lineUnits = path
    .slice(1)
    .map((position) => context.units.find((unit) => unit.x === position.x && unit.y === position.y
      && unit.side !== actor.side && !unit.actionDisabled))
    .filter((unit): unit is BattleUnit => Boolean(unit));
  const affectedUnits = lineUnits.map((unit) => {
    const statusesAfter = cloneUnitStatuses(unit.statuses);
    const guarded = unit.statuses.magicGuard > 0;
    const evaded = unit.id === target.id && shootingEvaded(unit, trial);
    if (!evaded) statusesAfter.magicGuard = 0;
    const damage = evaded
      ? 0
      : unit.id === target.id
        ? (guarded ? halfDamage : halfDamage * 2)
        : (guarded ? 0 : halfDamage);
    const lifeAfter = Math.max(0, unit.life - damage);
    return affectedUnit(unit, {
      lifeAfter,
      damage,
      blocked: guarded && damage === 0,
      blockReason: guarded && damage === 0 ? "magicGuard" : undefined,
      statusesAfter,
    });
  });
  const experienceGained = trial.between(
    definition.experience.minimum,
    definition.experience.maximum,
  ) + affectedUnits
    .filter(({ died }) => died)
    .reduce((total, affected) => {
      const victim = context.units.find(({ id }) => id === affected.unitId);
      return total + (victim ? killRewardFor(victim.classId, victim.side) : 0);
    }, 0);
  return {
    affectedUnits,
    experienceGained,
    effectCells: path.map((position) => ({ position, value: 1 })),
  };
}

function prepareLightning(
  actionId: Extract<BattleActionId, "lightning-1" | "lightning-2" | "lightning-3" | "lightning-4">,
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
  const damageByRangeValue: Readonly<Record<number, number>> = definition.damage.byRangeValue;
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
      const rangeValue = effect.valueAt(unit);
      const damage = blocked
        ? 0
        : Math.min(unit.life, damageByRangeValue[rangeValue] ?? 0);
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
  actionId: Extract<BattleActionId, "ice-1" | "ice-2" | "ice-3" | "ice-4">,
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
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
  actionId: Extract<BattleActionId, "recovery-1" | "recovery-2" | "recovery-3">,
  actor: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
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
      const rangeValue = effect.valueAt(unit);
      const healingForRangeValue = Object.entries(definition.healing.byRangeValue)
        .find(([value]) => Number(value) === rangeValue)?.[1];
      if (healingForRangeValue === undefined) {
        throw new Error(`${actionId} has no recovery value for range ${rangeValue}`);
      }
      const maximumLife = context.statsFor(unit).maxLife;
      const healing = frozen
        ? 0
        : Math.min(maximumLife - unit.life, healingForRangeValue);
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

function prepareStomp(
  actionId: Extract<BattleActionId, "stomp-1" | "stomp-2" | "stomp-3">,
  actor: BattleUnit,
  target: BattleUnit,
  center: Position,
  context: SpecialActionResolutionContext,
  trial: DeterministicRng,
): { affectedUnits: SpecialActionAffectedUnit[]; experienceGained: number; effectCells: PreparedBattleAction["result"]["effectCells"] } {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
  const viewport = context.viewport ?? {
    origin: { x: 0, y: 0 },
    width: definition.range.viewportWidth,
    height: definition.range.viewportHeight,
  };
  const effect = stompEffectRange(actor, center, context.battlefield, viewport);
  const affectedUnits = context.units
    .filter((unit) => unit.side === target.side && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * context.battlefield.width + left.x
      - (right.y * context.battlefield.width + right.x))
    .map((unit) => {
      const frozen = unit.actionDisabled;
      const rolledDamage = frozen
        ? 0
        : trial.between(
          definition.damage.base,
          definition.damage.base + definition.damage.randomBelow - 1,
        );
      const damage = Math.min(unit.life, rolledDamage);
      return affectedUnit(unit, {
        lifeAfter: unit.life - damage,
        damage,
        blocked: frozen,
        blockReason: frozen ? "frozen" : undefined,
      });
    });
  return {
    affectedUnits,
    experienceGained: definition.experience.fixed,
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
  let prayerEligibleUnitIds: readonly string[] | undefined;

  if (intent.actionId === "prayer") {
    const prayer = preparePrayer(context, trial);
    affectedUnits = prayer.affectedUnits;
    prayerEligibleUnitIds = prayer.eligibleUnitIds;
    experienceGained = 0;
  } else if (intent.actionId === "magic-archer-shot") {
    if (!target) throw new Error("magic archer action requires a target unit");
    ({ affectedUnits, experienceGained, effectCells } = prepareMagicArcher(
      actor,
      target,
      intent.linePath,
      trial,
      context,
    ));
  } else if (intent.actionId === "lightning-1"
    || intent.actionId === "lightning-2"
    || intent.actionId === "lightning-3"
    || intent.actionId === "lightning-4") {
    ({ affectedUnits, experienceGained, effectCells } = prepareLightning(
      intent.actionId,
      actor,
      center,
      context,
    ));
  } else if (intent.actionId === "ice-1"
    || intent.actionId === "ice-2"
    || intent.actionId === "ice-3"
    || intent.actionId === "ice-4") {
    ({ affectedUnits, experienceGained, effectCells } = prepareIce(
      intent.actionId,
      actor,
      center,
      context,
      trial,
    ));
  } else if (intent.actionId === "recovery-1"
    || intent.actionId === "recovery-2"
    || intent.actionId === "recovery-3") {
    ({ affectedUnits, experienceGained, effectCells } = prepareRecovery(
      intent.actionId,
      actor,
      center,
      context,
      trial,
    ));
  } else if (intent.actionId === "stomp-1"
    || intent.actionId === "stomp-2"
    || intent.actionId === "stomp-3") {
    if (!target) throw new Error("stomp action requires a target unit");
    ({ affectedUnits, experienceGained, effectCells } = prepareStomp(
      intent.actionId,
      actor,
      target,
      center,
      context,
      trial,
    ));
  } else if (intent.actionId === CLASS_SHOWDOWN_TELEPORT_ACTION_ID) {
    affectedUnits = [affectedUnit(actor, { positionAfter: center })];
    experienceGained = 0;
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
      prayerEligibleUnitIds,
    },
    rngBefore: rng.state,
    rngAfter: trial.state,
    rngCallsBefore: rng.calls,
    rngCallsAfter: trial.calls,
    actorExperienceBefore: actor.experience,
    actorExperienceAfter: intent.actionId === "prayer"
      ? affectedUnits.find(({ unitId }) => unitId === actor.id)?.experienceAfter ?? actor.experience
      : actor.experience + experienceGained,
    targetLifeBefore: primary?.lifeBefore ?? 0,
    targetLifeAfter: primary?.lifeAfter ?? 0,
    targetStatusesBefore: primary?.statusesBefore ?? emptyStatuses,
    targetStatusesAfter: primary?.statusesAfter ?? emptyStatuses,
    affectedUnits,
  };
}
