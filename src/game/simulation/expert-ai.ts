import {
  BATTLE_ACTION_DEFINITIONS,
  techniqueActionIdsFor,
} from "../content/actions";
import {
  classDefinition,
  suppressesOrdinaryCounterFor,
  terrainDefensePercentFor,
} from "../content/classes";
import type { BattleUnit, Position, UnitStats } from "../types";
import type { AlliedAiAction } from "./ai-contracts";
import type { BattleActionId } from "./actions/types";
import {
  techniqueEffectRange,
} from "./actions/range-map";
import { manhattan } from "./grid";

export interface ExpertAiEvaluationContext {
  width: number;
  height: number;
  units: readonly BattleUnit[];
  terrainSlotAt: (position: Position) => number;
  statsFor: (unit: Pick<BattleUnit, "classId" | "experience" | "side">) => UnitStats;
  effectiveStatsFor: (unit: BattleUnit) => UnitStats;
}

/**
 * Deterministic, player-state-only estimate used by REMAKE-033. Values are
 * deliberately semantic rather than tied to a class or a particular stage so
 * every enemy action family can enter the same comparison.
 */
export interface ExpertAiUtility {
  guaranteedKills: number;
  wizardHits: number;
  criticalSaves: number;
  effectiveDamage: number;
  effectiveHealing: number;
  control: number;
  support: number;
  targetThreat: number;
  counterRisk: number;
  exposure: number;
  firingDistance: number;
  terrainDefense: number;
  objectiveProgress: number;
  pathLength: number;
  waste: number;
}

export interface ExpertAiCandidateTrace {
  action: AlliedAiAction;
  score: number;
  reasons: readonly string[];
}

export interface ExpertAiDecisionTrace {
  unitId: string;
  policy: "stable-remake-expert";
  chosen?: ExpertAiCandidateTrace;
  candidates: readonly ExpertAiCandidateTrace[];
}

export function emptyExpertAiUtility(): ExpertAiUtility {
  return {
    guaranteedKills: 0,
    wizardHits: 0,
    criticalSaves: 0,
    effectiveDamage: 0,
    effectiveHealing: 0,
    control: 0,
    support: 0,
    targetThreat: 0,
    counterRisk: 0,
    exposure: 0,
    firingDistance: 0,
    terrainDefense: 0,
    objectiveProgress: 0,
    pathLength: 0,
    waste: 0,
  };
}

function expertPriorityBand(utility: ExpertAiUtility): number {
  if (utility.guaranteedKills > 0) return 2_000_000_000;
  if (utility.wizardHits > 0) return 1_000_000_000;
  return 0;
}

function countEffectiveWizardHit(
  utility: ExpertAiUtility,
  target: BattleUnit,
  effective: boolean,
): void {
  if (effective && target.classId === "wizard") utility.wizardHits += 1;
}

/**
 * Kills and effective pressure on a Wizard are strict priority bands. The
 * remaining weights compare real HP swing, saves, control and positioning
 * without allowing additive tie-break value to cross either tactical band.
 */
export function expertAiScore(utility: ExpertAiUtility): number {
  return expertPriorityBand(utility)
    + utility.guaranteedKills * 1_000_000
    + utility.criticalSaves * 600_000
    + utility.effectiveDamage * 100
    + utility.effectiveHealing * 80
    + utility.control * 100
    + utility.support * 60
    + utility.targetThreat * 10
    - utility.counterRisk * 90
    - utility.exposure * 1_200
    + utility.firingDistance * 100
    + utility.terrainDefense * 15
    + utility.objectiveProgress * 300
    - utility.pathLength * 3
    - utility.waste * 50_000;
}

export function compareExpertAiUtility(
  left: ExpertAiUtility,
  right: ExpertAiUtility,
): number {
  return expertAiScore(right) - expertAiScore(left);
}

export function expertAiReasons(utility: ExpertAiUtility): string[] {
  const reasons: string[] = [];
  if (utility.guaranteedKills > 0) reasons.push(`確定擊殺×${utility.guaranteedKills}`);
  if (utility.wizardHits > 0) reasons.push(`巫師仇恨×${utility.wizardHits}`);
  if (utility.criticalSaves > 0) reasons.push(`緊急救援×${utility.criticalSaves}`);
  if (utility.effectiveDamage > 0) reasons.push(`有效傷害 ${utility.effectiveDamage}`);
  if (utility.effectiveHealing > 0) reasons.push(`有效治療 ${utility.effectiveHealing}`);
  if (utility.control > 0) reasons.push(`控制 ${utility.control}`);
  if (utility.support > 0) reasons.push(`支援 ${utility.support}`);
  if (utility.targetThreat > 0) reasons.push(`目標威脅 ${utility.targetThreat}`);
  if (utility.counterRisk > 0) reasons.push(`反擊風險 ${utility.counterRisk}`);
  if (utility.exposure > 0) reasons.push(`暴露 ${utility.exposure}`);
  if (utility.firingDistance > 0) reasons.push(`射距 ${utility.firingDistance}`);
  if (utility.terrainDefense > 0) reasons.push(`地形防禦 ${utility.terrainDefense}%`);
  if (utility.objectiveProgress > 0) reasons.push(`目標推進 ${utility.objectiveProgress}`);
  if (utility.waste > 0) reasons.push(`無效／重複 ${utility.waste}`);
  if (reasons.length === 0) reasons.push("穩定待命");
  return reasons;
}

export function expertAiCandidateTrace(
  action: AlliedAiAction,
  utility: ExpertAiUtility,
): ExpertAiCandidateTrace {
  return {
    action: {
      ...action,
      path: action.path.map((position) => ({ ...position })),
      ...(action.linePath ? {
        linePath: action.linePath.map((position) => ({ ...position })),
      } : {}),
    },
    score: expertAiScore(utility),
    reasons: expertAiReasons(utility),
  };
}

function targetThreat(context: ExpertAiEvaluationContext, unit: BattleUnit): number {
  const stats = context.effectiveStatsFor(unit);
  const actionBonus = classDefinition(unit.classId).actionCategory === "technique" ? 30 : 0;
  return stats.attack + stats.level * 8 + Math.floor(unit.life / 10) + actionBonus;
}

export function expertExposureAt(
  context: ExpertAiEvaluationContext,
  actor: BattleUnit,
  position: Position,
  ignoredTargetId?: string,
): number {
  return context.units.filter((candidate) => {
    if (candidate.side === actor.side
      || candidate.id === ignoredTargetId
      || candidate.actionDisabled) return false;
    const stats = context.statsFor(candidate);
    let maximumReach = stats.movement + 1;
    const shootingActionId = candidate.classId === "archer"
      ? "archer-shot"
      : candidate.classId === "crossbow"
        ? "crossbow-shot"
        : candidate.classId === "magic-archer"
          ? "magic-archer-shot"
          : undefined;
    if (shootingActionId) {
      maximumReach = Math.max(
        maximumReach,
        stats.movement + BATTLE_ACTION_DEFINITIONS[shootingActionId].range.maximumDistance,
      );
    }
    if (candidate.statuses.techniqueSeal === 0) {
      for (const actionId of techniqueActionIdsFor(candidate)) {
        const definition = BATTLE_ACTION_DEFINITIONS[actionId];
        if (definition.target !== "enemy" && definition.target !== "self-area") continue;
        if (actionId === "archer-shot" || actionId === "crossbow-shot"
          || actionId === "magic-archer-shot") continue;
        const selectionRadius = "aiCandidateSelectionRadius" in definition.range
          ? definition.range.aiCandidateSelectionRadius
          : "selectionRadius" in definition.range
            ? definition.range.selectionRadius
            : 0;
        const effectExtension = "effectRadius" in definition.range
          ? Math.max(0, definition.range.effectRadius - 1)
          : 0;
        maximumReach = Math.max(
          maximumReach,
          definition.target === "self-area"
            ? effectExtension
            : selectionRadius + effectExtension,
        );
      }
    }
    return manhattan(position, candidate) <= maximumReach;
  }).length;
}

export function expertTacticalScore(utility: ExpertAiUtility): number {
  return expertPriorityBand(utility)
    + utility.guaranteedKills * 1_000_000
    + utility.criticalSaves * 600_000
    + utility.effectiveDamage * 100
    + utility.effectiveHealing * 80
    + utility.control * 100
    + utility.support * 60
    + utility.targetThreat * 10
    - utility.counterRisk * 90
    - utility.waste * 50_000;
}

export function expertOrdinaryUtility(
  context: ExpertAiEvaluationContext,
  actor: BattleUnit,
  target: BattleUnit,
  path: readonly Position[],
): ExpertAiUtility {
  const utility = emptyExpertAiUtility();
  const position = path.at(-1) ?? actor;
  const attackerStats = context.effectiveStatsFor(actor);
  const defenderStats = context.effectiveStatsFor(target);
  const terrainDefense = Math.floor(
    defenderStats.defense
    * terrainDefensePercentFor(target.classId, context.terrainSlotAt(target))
    / 100,
  );
  const baseDamage = Math.max(0, attackerStats.attack - defenderStats.defense - terrainDefense);
  const minimumDamage = baseDamage + 8;
  const expectedDamage = baseDamage + 11;
  const guaranteedKill = minimumDamage >= target.life;
  utility.guaranteedKills = guaranteedKill ? 1 : 0;
  utility.effectiveDamage = Math.min(target.life, expectedDamage);
  countEffectiveWizardHit(utility, target, utility.effectiveDamage > 0);
  utility.targetThreat = targetThreat(context, target);
  utility.terrainDefense = terrainDefensePercentFor(actor.classId, context.terrainSlotAt(position));
  utility.pathLength = Math.max(0, path.length - 1);
  utility.exposure = expertExposureAt(
    context,
    actor,
    position,
    guaranteedKill ? target.id : undefined,
  );
  if (!guaranteedKill && !suppressesOrdinaryCounterFor(actor.classId)) {
    const attackerTerrainDefense = Math.floor(
      attackerStats.defense * utility.terrainDefense / 100,
    );
    const normalCounter = Math.floor(Math.max(
      0,
      defenderStats.attack - attackerStats.defense - attackerTerrainDefense,
    ) / 2);
    utility.counterRisk = target.classId === "bone-knight"
      ? Math.max(expectedDamage, normalCounter)
      : normalCounter;
  }
  return utility;
}

export function expertSpecialUtility(
  context: ExpertAiEvaluationContext,
  actor: BattleUnit,
  actionId: BattleActionId,
  target: BattleUnit,
  path: readonly Position[],
  linePath?: readonly Position[],
): ExpertAiUtility {
  const utility = emptyExpertAiUtility();
  const position = path.at(-1) ?? actor;
  utility.terrainDefense = terrainDefensePercentFor(actor.classId, context.terrainSlotAt(position));
  utility.pathLength = Math.max(0, path.length - 1);
  utility.exposure = expertExposureAt(context, actor, position);

  if (actionId === "fire-1" || actionId === "fire-2"
    || actionId === "fire-3" || actionId === "fire-4") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const damage = target.actionDisabled || target.statuses.magicGuard > 0
      ? 0
      : Math.min(
        target.life,
        definition.damage.cap,
        Math.floor(context.statsFor(target).maxLife * definition.damage.maxLifePercent / 100),
      );
    utility.guaranteedKills = damage >= target.life && damage > 0 ? 1 : 0;
    utility.effectiveDamage = damage;
    utility.support = target.statuses.magicGuard > 0 && !target.actionDisabled ? 20 : 0;
    countEffectiveWizardHit(utility, target, damage > 0 || utility.support > 0);
    utility.targetThreat = targetThreat(context, target);
    if (damage === 0 && utility.support === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "archer-shot" || actionId === "crossbow-shot"
    || actionId === "magic-archer-shot") {
    if (actionId === "magic-archer-shot" && !linePath) {
      utility.waste = 1;
      return utility;
    }
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const swiftEvasion = target.classId === "swift-dragon-knight";
    const expectedRoll = Math.floor((definition.damage.minimum + definition.damage.maximum) / 2);
    const guardedMagicShot = actionId === "magic-archer-shot" && target.statuses.magicGuard > 0;
    const selectedDamage = actionId === "magic-archer-shot"
      ? guardedMagicShot
        ? Math.floor(expectedRoll / 2)
        : expectedRoll
      : expectedRoll;
    const minimumDamage = actionId === "magic-archer-shot"
      ? guardedMagicShot
        ? Math.floor(definition.damage.minimum / 2)
        : definition.damage.minimum
      : definition.damage.minimum;
    utility.effectiveDamage = Math.min(
      target.life,
      swiftEvasion ? Math.floor(selectedDamage / 2) : selectedDamage,
    );
    countEffectiveWizardHit(utility, target, utility.effectiveDamage > 0);
    utility.guaranteedKills = !swiftEvasion && minimumDamage >= target.life ? 1 : 0;
    if (utility.guaranteedKills > 0) {
      utility.exposure = expertExposureAt(context, actor, position, target.id);
    }
    utility.targetThreat = targetThreat(context, target);
    utility.firingDistance = manhattan(position, target);
    if (actionId === "magic-archer-shot") {
      const lineCells = new Set(linePath?.map((cell) => `${cell.x},${cell.y}`) ?? []);
      const expectedHalfDamage = Math.floor(expectedRoll / 2);
      const minimumHalfDamage = Math.floor(definition.damage.minimum / 2);
      for (const affected of context.units) {
        if (affected.side === actor.side || affected.id === target.id || affected.actionDisabled) continue;
        if (!lineCells.has(`${affected.x},${affected.y}`)) continue;
        if (affected.statuses.magicGuard > 0) {
          utility.support += 20;
          countEffectiveWizardHit(utility, affected, true);
          continue;
        }
        const expectedDamage = Math.min(affected.life, expectedHalfDamage);
        utility.effectiveDamage += expectedDamage;
        countEffectiveWizardHit(utility, affected, expectedDamage > 0);
        utility.targetThreat += targetThreat(context, affected);
        if (minimumHalfDamage >= affected.life) {
          utility.guaranteedKills += 1;
        }
      }
    }
    return utility;
  }

  if (actionId === "lightning-1" || actionId === "lightning-2"
    || actionId === "lightning-3" || actionId === "lightning-4") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const effect = techniqueEffectRange(
      target,
      context.width,
      context.height,
      definition.range.effectRadius,
    );
    const damageByRangeValue: Readonly<Record<number, number>> = definition.damage.byRangeValue;
    for (const affected of context.units.filter((candidate) =>
      candidate.side !== actor.side && effect.valueAt(candidate) > 0)) {
      const rangeValue = effect.valueAt(affected);
      const damage = affected.actionDisabled || affected.statuses.magicGuard > 0
        ? 0
        : Math.min(affected.life, damageByRangeValue[rangeValue] ?? 0);
      utility.effectiveDamage += damage;
      countEffectiveWizardHit(
        utility,
        affected,
        damage > 0 || (affected.statuses.magicGuard > 0 && !affected.actionDisabled),
      );
      if (damage >= affected.life && damage > 0) utility.guaranteedKills += 1;
      utility.targetThreat += targetThreat(context, affected);
      if (affected.statuses.magicGuard > 0 && !affected.actionDisabled) utility.support += 20;
    }
    if (utility.effectiveDamage === 0 && utility.support === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "ice-1" || actionId === "ice-2"
    || actionId === "ice-3" || actionId === "ice-4") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const effect = techniqueEffectRange(
      actor,
      context.width,
      context.height,
      definition.range.effectRadius,
    );
    for (const affected of context.units.filter((candidate) =>
      candidate.side !== actor.side && effect.valueAt(candidate) > 0)) {
      const immune = affected.classId === "dragon"
        || affected.classId === "head"
        || affected.classId === "hand";
      if (affected.actionDisabled || immune) continue;
      const threat = targetThreat(context, affected);
      if (affected.statuses.magicGuard > 0) {
        utility.support += 20;
        utility.targetThreat += threat;
        countEffectiveWizardHit(utility, affected, true);
        continue;
      }
      utility.control += 120 + threat;
      countEffectiveWizardHit(utility, affected, true);
      utility.targetThreat += threat;
    }
    if (utility.control === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "heal-1" || actionId === "heal-2" || actionId === "heal-3") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const maximumLife = context.statsFor(target).maxLife;
    const healing = target.actionDisabled
      ? 0
      : Math.min(
        maximumLife - target.life,
        Math.floor(maximumLife * definition.healing.maxLifePercent / 100),
      );
    utility.effectiveHealing = healing;
    utility.criticalSaves = healing > 0 && target.life * 100 < maximumLife * 40 ? 1 : 0;
    utility.targetThreat = targetThreat(context, target);
    if (healing === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "recovery-1" || actionId === "recovery-2" || actionId === "recovery-3") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const effect = techniqueEffectRange(
      target,
      context.width,
      context.height,
      definition.range.effectRadius,
    );
    const healingByRangeValue: Readonly<Record<number, number>> = definition.healing.byRangeValue;
    for (const affected of context.units.filter((candidate) =>
      candidate.side === actor.side && effect.valueAt(candidate) > 0 && !candidate.actionDisabled)) {
      const maximumLife = context.statsFor(affected).maxLife;
      const rangeValue = effect.valueAt(affected);
      const healing = Math.min(maximumLife - affected.life, healingByRangeValue[rangeValue] ?? 0);
      utility.effectiveHealing += healing;
      utility.targetThreat += targetThreat(context, affected);
      if (healing > 0 && affected.life * 100 < maximumLife * 40) utility.criticalSaves += 1;
    }
    if (utility.effectiveHealing === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "stomp-1" || actionId === "stomp-2" || actionId === "stomp-3") {
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const expectedDamage = definition.damage.base
      + Math.floor((definition.damage.randomBelow - 1) / 2);
    const conservativeEffect = techniqueEffectRange(target, context.width, context.height, 4);
    for (const affected of context.units.filter((candidate) =>
      candidate.side !== actor.side
      && !candidate.actionDisabled
      && conservativeEffect.valueAt(candidate) > 0)) {
      utility.effectiveDamage += Math.min(affected.life, expectedDamage);
      countEffectiveWizardHit(utility, affected, expectedDamage > 0);
      if (definition.damage.base >= affected.life) utility.guaranteedKills += 1;
      utility.targetThreat += targetThreat(context, affected);
    }
    if (utility.effectiveDamage === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "dispel") {
    const harmfulStatuses = target.statuses.confusion
      + target.statuses.attackDown
      + target.statuses.defenseDown
      + target.statuses.poison
      + target.statuses.techniqueSeal;
    utility.support = harmfulStatuses * 60 + (target.actionDisabled ? 500 : 0);
    utility.criticalSaves = target.actionDisabled ? 1 : 0;
    utility.targetThreat = targetThreat(context, target);
    if (utility.support === 0) utility.waste = 1;
    return utility;
  }

  if (actionId === "attack-up" || actionId === "defense-up" || actionId === "magic-guard") {
    const statusValue = actionId === "attack-up"
      ? target.statuses.attackUp
      : actionId === "defense-up"
        ? target.statuses.defenseUp
        : target.statuses.magicGuard;
    if (statusValue > 0) {
      utility.waste = 1;
    } else {
      const stats = context.effectiveStatsFor(target);
      utility.support = actionId === "attack-up"
        ? stats.attack + 40
        : actionId === "defense-up"
          ? stats.defense + 30
          : 120;
      utility.targetThreat = targetThreat(context, target);
    }
    return utility;
  }

  if (actionId === "poison" || actionId === "confusion"
    || actionId === "attack-down" || actionId === "defense-down"
    || actionId === "spell-seal") {
    const statusKey = actionId === "poison"
      ? "poison"
      : actionId === "confusion"
        ? "confusion"
        : actionId === "attack-down"
          ? "attackDown"
          : actionId === "defense-down"
            ? "defenseDown"
            : "techniqueSeal";
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    const immune = "immuneClasses" in definition.status
      && definition.status.immuneClasses.some((classId) => classId === target.classId);
    if (immune || target.statuses[statusKey] > 0) {
      utility.waste = 1;
      return utility;
    }
    const threat = targetThreat(context, target);
    utility.control = actionId === "confusion"
      ? 100 + Math.floor(threat / 2)
      : actionId === "poison"
        ? 80 + Math.floor(target.life / 4)
        : actionId === "spell-seal"
          ? classDefinition(target.classId).actionCategory === "technique"
            ? 120 + Math.floor(threat / 2)
            : 20
          : 40 + Math.floor(threat / 4);
    utility.targetThreat = threat;
    countEffectiveWizardHit(utility, target, true);
    return utility;
  }

  utility.waste = 1;
  return utility;
}

export function expertUtilityForAction(
  context: ExpertAiEvaluationContext,
  unit: BattleUnit,
  action: AlliedAiAction,
): ExpertAiUtility {
  const target = action.targetId
    ? context.units.find((candidate) => candidate.id === action.targetId)
    : undefined;
  if (action.kind === "attack" && target) {
    return expertOrdinaryUtility(context, unit, target, action.path);
  }
  if (action.kind === "special" && action.actionId && target) {
    return expertSpecialUtility(
      context,
      unit,
      action.actionId,
      target,
      action.path,
      action.linePath,
    );
  }
  const utility = emptyExpertAiUtility();
  const destination = action.path.at(-1) ?? unit;
  utility.terrainDefense = terrainDefensePercentFor(unit.classId, context.terrainSlotAt(destination));
  utility.pathLength = Math.max(0, action.path.length - 1);
  utility.exposure = expertExposureAt(context, unit, destination);
  if (action.kind === "rest") {
    const maximumLife = context.statsFor(unit).maxLife;
    utility.effectiveHealing = Math.min(
      maximumLife - unit.life,
      Math.floor(maximumLife * 15 / 100),
    );
    utility.criticalSaves = unit.life * 100 < maximumLife * 40 ? 1 : 0;
  } else if (action.kind === "move") {
    const opponents = context.units.filter((candidate) => candidate.side !== unit.side);
    if (opponents.length > 0) {
      const before = Math.min(...opponents.map((candidate) => manhattan(unit, candidate)));
      const after = Math.min(...opponents.map((candidate) => manhattan(destination, candidate)));
      utility.objectiveProgress = Math.max(0, before - after);
    }
  } else if (action.kind === "route-pulse") {
    utility.objectiveProgress = Math.max(1, action.path.length - 1);
    utility.support = 100;
  }
  return utility;
}
