import { BATTLE_ACTION_DEFINITIONS, type IceActionId } from "../../content/actions";
import { movementRulesFor } from "../../content/classes";
import type { BattleUnit, Position } from "../../types";
import { manhattan } from "../grid";
import {
  techniqueEffectRange,
  type ActionBattlefield,
  type NumericRangeMap,
} from "./range-map";
import type { ActionBlockReason } from "./types";

/**
 * `REMAKE-095` replaces the native "down, up, left, right" scan with a radial
 * one. The list order is only the last tie-break, so it keeps the native four
 * first and appends the diagonals.
 */
const DISPLACEMENT_OFFSETS = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
] as const;

type DisplacementOffset = (typeof DISPLACEMENT_OFFSETS)[number];

const isDiagonal = ({ x, y }: DisplacementOffset): boolean => x !== 0 && y !== 0;

/**
 * `REMAKE-095`: the offset whose direction is closest to the caster→target line,
 * decided by exact integers rather than `atan2` so the result cannot drift with
 * a platform's floating point. Maximising `dot(v, d) / |d|` is the same as
 * minimising the angle; comparing `dot² / |d|²` by cross-multiplication keeps it
 * in integers. The 22.5° boundary this produces is never hit exactly, because a
 * tie would need `(ax + ay) / max(ax, ay)` to equal √2.
 */
function radialOffsetOrder(dx: number, dy: number): readonly DisplacementOffset[] {
  return DISPLACEMENT_OFFSETS
    .map((offset, index) => {
      const dot = dx * offset.x + dy * offset.y;
      return {
        offset,
        index,
        // A direction pointing away from the target never wins on angle.
        numerator: dot > 0 ? dot * dot : -1,
        denominator: offset.x * offset.x + offset.y * offset.y,
      };
    })
    .sort((left, right) =>
      (right.numerator * left.denominator - left.numerator * right.denominator)
      || (left.index - right.index))
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
      const passable = (position: Position): boolean => effect.contains(position)
        && (movementRules[battlefield.terrainSlotAt(position)] ?? 99) < 99;
      const destination = radialOffsetOrder(unit.x - center.x, unit.y - center.y)
        .map((offset, rank) => ({
          offset,
          rank,
          position: { x: unit.x + offset.x, y: unit.y + offset.y },
        }))
        .filter(({ position }) => effect.valueAt(position) < currentValue)
        // REMAKE-095: the radial direction is the choice; everything else is the
        // fallback for a blocked one, ordered farthest-from-the-caster first and
        // then by the angular rank the map above already carries.
        .sort((left, right) => (left.rank === 0 || right.rank === 0
          ? left.rank - right.rank
          : manhattan(right.position, center) - manhattan(left.position, center)))
        .find(({ offset, position }) => passable(position)
          && !occupied.has(positionKey(position))
          // A diagonal may not squeeze through a corner sealed by terrain on both
          // sides. Occupancy does not block it: ice blows units past each other.
          && (!isDiagonal(offset)
            || passable({ x: unit.x + offset.x, y: unit.y })
            || passable({ x: unit.x, y: unit.y + offset.y })))
        ?.position;

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
