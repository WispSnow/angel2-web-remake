import type { BattleUnit, Position } from "../types";
import { positionKey } from "./grid";

export interface EnemyPhaseTailMove {
  unitId: string;
  from: Position;
  to: Position;
}

export interface PreparedEnemyPhaseTail {
  definitionId: string;
  presentationId: string;
  selectedUnitId: string;
  origin: Position;
  moves: readonly EnemyPhaseTailMove[];
}

export interface EnemyPhaseTailDefinition {
  id: string;
  presentationId: string;
  executions: number;
  prepare: (
    units: readonly BattleUnit[],
    width: number,
    height: number,
  ) => PreparedEnemyPhaseTail | undefined;
}

export interface ColumnPushRule {
  originCellUpperBoundExclusive: number;
  scannedRows: number;
  destinationRowDeltas: readonly number[];
}

const cellFor = (position: Position, width: number): number =>
  position.y * width + position.x;

/**
 * Native `1000:24B4/2508` selects one column from the first side-1 cell, then
 * scans its 17-cell band from bottom to top. The temporary occupancy map is
 * advanced while planning so a later source observes every earlier move,
 * exactly like the two board-byte maps do in the original loop.
 */
export function prepareColumnPush(
  definitionId: string,
  presentationId: string,
  rule: ColumnPushRule,
  units: readonly BattleUnit[],
  width: number,
  height: number,
): PreparedEnemyPhaseTail | undefined {
  const selected = units
    .filter(({ side }) => side === 1)
    .sort((left, right) => cellFor(left, width) - cellFor(right, width))[0];
  if (!selected) return undefined;

  let originCell = cellFor(selected, width) - width;
  while (originCell >= rule.originCellUpperBoundExclusive) originCell -= width;
  const origin = { x: selected.x, y: Math.floor(originCell / width) };
  const unitByCell = new Map<number, BattleUnit>();
  for (const unit of units) unitByCell.set(cellFor(unit, width), unit);
  const moves: EnemyPhaseTailMove[] = [];

  for (let rowOffset = rule.scannedRows; rowOffset >= 1; rowOffset -= 1) {
    const sourceCell = originCell + rowOffset * width;
    const unit = unitByCell.get(sourceCell);
    if (!unit || unit.side !== 1) continue;
    const destinationCell = rule.destinationRowDeltas
      .map((delta) => sourceCell + delta * width)
      .find((candidate) => candidate >= 0
        && candidate < width * height
        && !unitByCell.has(candidate));
    if (destinationCell === undefined) continue;
    const from = { x: sourceCell % width, y: Math.floor(sourceCell / width) };
    const to = { x: destinationCell % width, y: Math.floor(destinationCell / width) };
    moves.push({ unitId: unit.id, from, to });
    unitByCell.delete(sourceCell);
    unitByCell.set(destinationCell, unit);
  }

  return {
    definitionId,
    presentationId,
    selectedUnitId: selected.id,
    origin,
    moves,
  };
}

export function commitEnemyPhaseTail(
  prepared: PreparedEnemyPhaseTail,
  units: readonly BattleUnit[],
): void {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const unitIdByCell = new Map(units.map((unit) => [positionKey(unit), unit.id]));
  for (const move of prepared.moves) {
    const unit = unitById.get(move.unitId);
    if (!unit || positionKey(unit) !== positionKey(move.from)) {
      throw new Error(`Enemy phase tail source changed for ${move.unitId}`);
    }
    if (unitIdByCell.get(positionKey(move.from)) !== move.unitId) {
      throw new Error(`Enemy phase tail source became occupied at ${positionKey(move.from)}`);
    }
    if (unitIdByCell.has(positionKey(move.to))) {
      throw new Error(`Enemy phase tail destination became occupied at ${positionKey(move.to)}`);
    }
    unitIdByCell.delete(positionKey(move.from));
    unitIdByCell.set(positionKey(move.to), move.unitId);
  }

  for (const move of prepared.moves) {
    const unit = unitById.get(move.unitId);
    if (!unit) throw new Error(`Enemy phase tail unit disappeared for ${move.unitId}`);
    unit.x = move.to.x;
    unit.y = move.to.y;
  }
}
