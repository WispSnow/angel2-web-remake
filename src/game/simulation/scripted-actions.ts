import { BATTLE_ACTION_DEFINITIONS } from "../content/actions";
import type { BattleUnit, Position, Side } from "../types";
import { techniqueEffectRange } from "./actions/range-map";
import type {
  SpecialActionAffectedUnit,
  SpecialActionResult,
} from "./actions/types";

const cloneStatuses = (unit: BattleUnit): BattleUnit["statuses"] => ({ ...unit.statuses });

/**
 * Resolves the native scene-42 4L call without inventing a board actor.
 * The five-ring damage, frozen/magic-guard blocking, and saturation are the
 * same deterministic rules used by ordinary 4L; story actions award no EXP.
 */
export function prepareScriptedLightning4(
  units: readonly BattleUnit[],
  battlefield: { width: number; height: number },
  center: Position,
  targetSide: Side,
  actorId: string,
): SpecialActionResult {
  const definition = BATTLE_ACTION_DEFINITIONS["lightning-4"];
  const effect = techniqueEffectRange(
    center,
    battlefield.width,
    battlefield.height,
    definition.range.effectRadius,
  );
  const damageByRangeValue: Readonly<Record<number, number>> = definition.damage.byRangeValue;
  const affectedUnits: SpecialActionAffectedUnit[] = units
    .filter((unit) => unit.side === targetSide && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * battlefield.width + left.x
      - (right.y * battlefield.width + right.x))
    .map((unit) => {
      const statusesAfter = cloneStatuses(unit);
      const frozen = unit.actionDisabled;
      const guarded = unit.statuses.magicGuard > 0;
      const blocked = frozen || guarded;
      if (!frozen) statusesAfter.magicGuard = 0;
      const damage = blocked
        ? 0
        : Math.min(unit.life, damageByRangeValue[effect.valueAt(unit)] ?? 0);
      const lifeAfter = unit.life - damage;
      return {
        unitId: unit.id,
        positionBefore: { x: unit.x, y: unit.y },
        positionAfter: { x: unit.x, y: unit.y },
        lifeBefore: unit.life,
        lifeAfter,
        experienceBefore: unit.experience,
        experienceAfter: unit.experience,
        actionDisabledBefore: unit.actionDisabled,
        actionDisabledAfter: unit.actionDisabled,
        statusesBefore: cloneStatuses(unit),
        statusesAfter,
        damage,
        healing: 0,
        blocked,
        blockReason: frozen ? "frozen" : guarded ? "magicGuard" : undefined,
        died: lifeAfter === 0,
        moved: false,
      };
    });
  return {
    actionId: "lightning-4",
    actorId,
    target: { ...center },
    damage: affectedUnits.reduce((total, affected) => total + affected.damage, 0),
    healing: 0,
    blocked: affectedUnits.length > 0 && affectedUnits.every(({ blocked }) => blocked),
    targetDied: affectedUnits.some(({ died }) => died),
    experienceGained: 0,
    affectedUnits,
    effectCells: effect.cells().map((position) => ({
      position,
      value: effect.valueAt(position),
    })),
  };
}
