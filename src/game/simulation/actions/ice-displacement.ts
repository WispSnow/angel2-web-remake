import { BATTLE_ACTION_DEFINITIONS, type IceActionId } from "../../content/actions";
import { movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position } from "../../types";
import {
  techniqueEffectRange,
  type ActionBattlefield,
  type NumericRangeMap,
} from "./range-map";
import type { ActionBlockReason } from "./types";

/**
 * `REMAKE-095` replaced the native "down, up, left, right" scan with a radial
 * one; `REMAKE-096` then took the direction set back to these four. The list
 * order survives as the tie-break below, so it stays in native order.
 */
const DISPLACEMENT_OFFSETS = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;

type DisplacementOffset = (typeof DISPLACEMENT_OFFSETS)[number];

/**
 * `REMAKE-095`/`REMAKE-096`: the four directions ordered by how closely each
 * matches the caster→target line. They share a length, so the plain integer dot
 * product already is the angle order — no `atan2`, no floating point that could
 * drift between platforms. A target on an exact 45° diagonal ties two
 * directions; `REMAKE-096` breaks that with the native order, which lands it
 * vertically.
 */
function radialOffsetOrder(dx: number, dy: number): readonly DisplacementOffset[] {
  return DISPLACEMENT_OFFSETS
    .map((offset, index) => ({ offset, index, dot: dx * offset.x + dy * offset.y }))
    .sort((left, right) => (right.dot - left.dot) || (left.index - right.index))
    .map(({ offset }) => offset);
}

export interface IcePlannedTarget {
  readonly unit: BattleUnit;
  readonly positionAfter: Position;
  readonly moved: boolean;
  /**
   * `REMAKE-094`: the ice bit follows the settled landing cell, not the cell the
   * target occupied when the range map was built. A target pushed onto a value-0
   * cell leaves the effect and keeps acting; one that cannot be pushed stays on a
   * positive-value cell and freezes as before.
   */
  readonly freezes: boolean;
  readonly blocked: boolean;
  readonly blockReason?: ActionBlockReason;
}

export interface IceDisplacementPlan {
  readonly effect: NumericRangeMap;
  readonly targets: readonly IcePlannedTarget[];
  /** Native experience keys off displacement, so the resolver needs this count. */
  readonly movedCount: number;
}

const positionKey = ({ x, y }: Position): string => `${x},${y}`;

/**
 * Shared by the authoritative resolver and the expert AI scorer so a wizard can
 * never value a cast that its own resolution would turn into a pure shove.
 * Pure: it reads public simulation state only and never touches the gameplay RNG.
 */
export function planIceDisplacement(
  actionId: IceActionId,
  actor: Pick<BattleUnit, "side">,
  center: Position,
  units: readonly BattleUnit[],
  battlefield: ActionBattlefield,
  /** Callers that already hold the range map for this centre may pass it in;
   *  building one walks the whole board and the AI scores many candidates. */
  cachedEffect?: NumericRangeMap,
): IceDisplacementPlan {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
  const effect = cachedEffect ?? techniqueEffectRange(
    center,
    battlefield.width,
    battlefield.height,
    definition.range.effectRadius,
  );
  const occupied = new Set(units.map(positionKey));
  let movedCount = 0;

  const targets = units
    .filter((unit) => unit.side !== actor.side && effect.valueAt(unit) > 0)
    .sort((left, right) => left.y * battlefield.width + left.x
      - (right.y * battlefield.width + right.x))
    .map<IcePlannedTarget>((unit) => {
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
      if (blocked) {
        return {
          unit,
          positionAfter: { x: unit.x, y: unit.y },
          moved: false,
          freezes: false,
          blocked,
          blockReason,
        };
      }

      const currentValue = effect.valueAt(unit);
      const movementRules = movementRulesFor(unit.classId);
      // REMAKE-096: every orthogonal push gains exactly one range value, so the
      // candidates are all equidistant and the angle order is the whole ordering
      // — the closest direction first, then the rest as its fallback.
      const destination = radialOffsetOrder(unit.x - center.x, unit.y - center.y)
        .map((offset) => ({ x: unit.x + offset.x, y: unit.y + offset.y }))
        .find((position) => effect.contains(position)
          && effect.valueAt(position) < currentValue
          && !occupied.has(positionKey(position))
          && (movementRules[battlefield.terrainSlotAt(position)] ?? 99) < 99);

      let positionAfter: Position = { x: unit.x, y: unit.y };
      if (destination) {
        occupied.delete(positionKey(unit));
        occupied.add(positionKey(destination));
        positionAfter = destination;
        movedCount += 1;
      }
      return {
        unit,
        positionAfter,
        moved: Boolean(destination),
        freezes: effect.valueAt(positionAfter) > 0,
        blocked,
        blockReason,
      };
    });

  return { effect, targets, movedCount };
}
