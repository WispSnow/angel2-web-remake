import { movementRulesFor } from "../content/classes";
import type { BattleUnit, Position, Side } from "../types";
import { neighbors, positionKey, routePath, type GridBattlefield } from "./grid";

export interface RoutePulseDefinition {
  kind: "route-pulse";
  actorId: string;
  route: {
    goal: Position;
    movement: number;
    accept: "lower-cell-index";
  };
  safeArea: {
    mode: "uniform";
    seed: number;
    impassableMovementRule: number;
  };
  effect: {
    side: Side;
    numerator: number;
    denominator: number;
    rounding: "floor";
  };
  presentationId: string;
}

export interface RoutePulseAffectedUnit {
  unitId: string;
  position: Position;
  lifeBefore: number;
  lifeAfter: number;
  died: boolean;
}

export interface PreparedRoutePulse {
  definition: RoutePulseDefinition;
  actorId: string;
  actorStart: Position;
  actorDestination: Position;
  path: readonly Position[];
  safeCells: readonly Position[];
  affectedUnits: readonly RoutePulseAffectedUnit[];
}

export function assertRoutePulseDefinition(
  definition: RoutePulseDefinition,
  units: readonly BattleUnit[],
): void {
  const actor = units.find(({ id }) => id === definition.actorId);
  if (!actor) throw new Error(`Route pulse references missing actor ${definition.actorId}`);
  if (actor.side !== definition.effect.side) {
    throw new Error(`Route pulse actor ${definition.actorId} is outside its target side`);
  }
  if (!Number.isInteger(definition.route.movement) || definition.route.movement < 1) {
    throw new Error("Route pulse movement must be a positive integer");
  }
  if (!Number.isInteger(definition.safeArea.seed) || definition.safeArea.seed < 1) {
    throw new Error("Route pulse safe-area seed must be a positive integer");
  }
  if (!Number.isInteger(definition.effect.numerator) || definition.effect.numerator < 0
    || !Number.isInteger(definition.effect.denominator) || definition.effect.denominator < 1) {
    throw new Error("Route pulse life ratio must contain non-negative integers and a non-zero denominator");
  }
  if (definition.presentationId.length === 0) {
    throw new Error("Route pulse requires a presentation id");
  }
}

export function planRoutePulsePath(
  definition: RoutePulseDefinition,
  actor: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield,
): Position[] {
  const origin = { x: actor.x, y: actor.y };
  const candidate = routePath(
    actor,
    [definition.route.goal],
    units,
    definition.route.movement,
    battlefield,
  );
  const destination = candidate.at(-1) ?? origin;
  const originCell = origin.y * battlefield.width + origin.x;
  const destinationCell = destination.y * battlefield.width + destination.x;
  return destinationCell < originCell ? candidate : [origin];
}

export function routePulseSafeCells(
  definition: RoutePulseDefinition,
  actor: Pick<BattleUnit, "x" | "y" | "classId">,
  battlefield: GridBattlefield,
): Position[] {
  const movementRules = movementRulesFor(actor.classId);
  const valueByPosition = new Map<string, number>();
  const pending: Position[] = [{ x: actor.x, y: actor.y }];
  valueByPosition.set(positionKey(actor), definition.safeArea.seed);
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;
    const nextValue = (valueByPosition.get(positionKey(current)) ?? 0) - 1;
    if (nextValue <= 0) continue;
    for (const next of neighbors(current, battlefield)) {
      const movementRule = movementRules[battlefield.terrainSlotAt(next)] ?? 99;
      const key = positionKey(next);
      if (movementRule === definition.safeArea.impassableMovementRule
        || (valueByPosition.get(key) ?? 0) >= nextValue) continue;
      valueByPosition.set(key, nextValue);
      pending.push(next);
    }
  }
  return [...valueByPosition.keys()]
    .map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    })
    .sort((left, right) => left.y * battlefield.width + left.x
      - (right.y * battlefield.width + right.x));
}

export function prepareRoutePulse(
  definition: RoutePulseDefinition,
  actor: BattleUnit,
  units: readonly BattleUnit[],
  battlefield: GridBattlefield,
  path: readonly Position[],
): PreparedRoutePulse {
  const safeCells = routePulseSafeCells(definition, actor, battlefield);
  const safeKeys = new Set(safeCells.map(positionKey));
  const affectedUnits = units
    .filter((unit) => unit.side === definition.effect.side && !safeKeys.has(positionKey(unit)))
    .sort((left, right) => left.y * battlefield.width + left.x
      - (right.y * battlefield.width + right.x))
    .map((unit): RoutePulseAffectedUnit => {
      const lifeAfter = Math.floor(
        unit.life * definition.effect.numerator / definition.effect.denominator,
      );
      return {
        unitId: unit.id,
        position: { x: unit.x, y: unit.y },
        lifeBefore: unit.life,
        lifeAfter,
        died: lifeAfter === 0,
      };
    });
  return {
    definition,
    actorId: actor.id,
    actorStart: { ...(path[0] ?? actor) },
    actorDestination: { x: actor.x, y: actor.y },
    path: path.map((position) => ({ ...position })),
    safeCells,
    affectedUnits,
  };
}
