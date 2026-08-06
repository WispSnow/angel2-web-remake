import type {
  BattleUnit,
  DynamicTerrainKind,
  DynamicTerrainOverride,
  Position,
} from "../../types";
import { constructionPath, positionKey, type GridBattlefield } from "../grid";

export interface ConstructionTerrainMutation extends DynamicTerrainOverride {
  kindBefore?: DynamicTerrainKind;
  slotBefore: number;
  slotAfter: number;
  changed: boolean;
}

export type ConstructionActionId = "iron-plate" | "obstacle";

export interface ConstructionResult<ActionId extends ConstructionActionId = ConstructionActionId> {
  actionId: ActionId;
  actorId: string;
  actorPositionBefore: Position;
  actorPositionAfter: Position;
  path: readonly Position[];
  terrainMutations: readonly ConstructionTerrainMutation[];
}

export interface PreparedConstruction<ActionId extends ConstructionActionId = ConstructionActionId>
  extends ConstructionResult<ActionId> {
  actorActedBefore: boolean;
}

export type IronPlateConstructionResult = ConstructionResult<"iron-plate">;
export type PreparedIronPlateConstruction = PreparedConstruction<"iron-plate">;
export type ObstacleConstructionResult = ConstructionResult<"obstacle">;
export type PreparedObstacleConstruction = PreparedConstruction<"obstacle">;

export interface ConstructionContext {
  battlefield: GridBattlefield;
  units: readonly BattleUnit[];
  terrainKindAt: (position: Position) => DynamicTerrainKind | undefined;
  dynamicTerrainSlot: (kind: DynamicTerrainKind) => number | undefined;
}

const copyPosition = ({ x, y }: Position): Position => ({ x, y });

export function prepareConstruction<ActionId extends ConstructionActionId>(
  actor: BattleUnit,
  target: Position,
  actionId: ActionId,
  context: ConstructionContext,
): PreparedConstruction<ActionId> {
  const terrainKind: DynamicTerrainKind = actionId;
  const slotAfter = context.dynamicTerrainSlot(terrainKind);
  const path = constructionPath(actor, target, context.units, context.battlefield);
  if (
    actor.classId !== "engineer"
    || actor.acted
    || actor.actionDisabled
    || actor.statuses.techniqueSeal > 0
    || slotAfter === undefined
    || path.length === 0
    || context.units.some((unit) => unit.x === target.x && unit.y === target.y)
  ) throw new Error(`illegal ${actionId} construction`);

  const offsets = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ] as const;
  const terrainMutations = offsets
    .map(({ x, y }) => ({ x: target.x + x, y: target.y + y }))
    .filter(({ x, y }) => x >= 0 && y >= 0
      && x < context.battlefield.width && y < context.battlefield.height)
    .filter((position) => context.battlefield.terrainSlotAt(position) !== 0)
    .map((position): ConstructionTerrainMutation => {
      const kindBefore = context.terrainKindAt(position);
      return {
        ...copyPosition(position),
        kind: terrainKind,
        kindBefore,
        slotBefore: context.battlefield.terrainSlotAt(position),
        slotAfter,
        changed: kindBefore !== terrainKind,
      };
    });

  return {
    actionId,
    actorId: actor.id,
    actorPositionBefore: copyPosition(actor),
    actorPositionAfter: copyPosition(target),
    path: path.map(copyPosition),
    terrainMutations,
    actorActedBefore: actor.acted,
  };
}

export function prepareIronPlateConstruction(
  actor: BattleUnit,
  target: Position,
  context: ConstructionContext,
): PreparedIronPlateConstruction {
  return prepareConstruction(actor, target, "iron-plate", context);
}

export function prepareObstacleConstruction(
  actor: BattleUnit,
  target: Position,
  context: ConstructionContext,
): PreparedObstacleConstruction {
  return prepareConstruction(actor, target, "obstacle", context);
}

export function terrainMutationFingerprint(
  mutations: readonly ConstructionTerrainMutation[],
  terrainKindAt: (position: Position) => DynamicTerrainKind | undefined,
  terrainSlotAt: (position: Position) => number,
): string {
  return mutations.map((mutation) => [
    positionKey(mutation),
    terrainKindAt(mutation) ?? "base",
    terrainSlotAt(mutation),
  ].join(":"))
    .join("|");
}
