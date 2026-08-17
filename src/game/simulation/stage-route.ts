import type { BattleUnit, Position } from "../types";
import {
  movementCost,
  movementMap,
  neighbors,
  positionKey,
  type GridBattlefield,
  type MovementMap,
} from "./grid";

/**
 * 行为 12 的固定关卡路线（`1000:1AF8/1B56/1BBE`）。
 *
 * 原版分两步决定落点，而不是直接对可达格评分：
 *
 * 1. `1000:1B00..1B0C` 先以模式 `0`、seed `50` 从行动者建一张**忽略占格**的距离图；
 * 2. `1000:1B1D → 1000:7E09` 从关卡锚点沿这张图爬回行动者，得到一条与我方位置无关的
 *    理想路线；
 * 3. `1000:1B29..1B2C` 再用本阶段基础模式（side 2 的 `Y`）和行为 12 覆写后的移动值
 *    重建真正的移动图；
 * 4. `1000:828F` 从锚点一端扫描该路线，取第一个落在移动图内的格，然后按
 *    「本格 → 下 → 上 → 右 → 左」找第一个既在图内又空置的格作为落点。
 *
 * 因此原版不会绕开挡路的我方棋子：它只沿理想路线前进，被挡住时就停在挡路者旁边。
 * 复刻此前用「可达格中曼哈顿距离最小者」代替，才会出现横移两格再下两格的绕行。
 */
export interface StageRoutePlan {
  /** 从行动者当前格开始的逐格路径；不移动时只含起点。 */
  readonly path: readonly Position[];
  readonly destination: Position;
}

/** `1000:1B09` 写入范围 seed `0x32`。 */
const PROBE_SEED = 50;

/** 路径表 `CS:028B` 只有 100 个 word；原版越界即破坏相邻数据，这里改为安全截断。 */
const PROBE_PATH_LIMIT = 100;

/**
 * `1000:7E5C` 每步读 PIT 通道 0 并按 `mod 3` 轮换三张方向表。`stableRemake` 固定取
 * residue 0 的 `-50,-1,+50,+1`，让等距路线保持确定；`1000:7EFB` 用
 * `neighbour >= best` 接受候选，所以同值由后扫描方向覆盖，实际优先级是
 * 右 → 下 → 左 → 上。
 */
const PROBE_DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

/** `1000:82C4..82F5` 依次检查路线格本身、`+50`、`-50`、`+1`、`-1`。 */
const DESTINATION_OFFSETS: readonly Position[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

const insideBoard = (position: Position, battlefield: GridBattlefield): boolean =>
  position.x >= 0
  && position.y >= 0
  && position.x < battlefield.width
  && position.y < battlefield.height;

/**
 * 模式 `0`、seed 50 的探路图：每格统一扣 1、不读阵营/占格图，只拒绝移动规则 99。
 * 存储值仍是「含当前格的剩余范围」，所以覆盖条件是 `seed - 步数 > 0`。
 */
function probeRangeMap(
  actor: BattleUnit,
  battlefield: GridBattlefield,
): ReadonlyMap<string, number> {
  const values = new Map<string, number>([[positionKey(actor), PROBE_SEED]]);
  let frontier: Position[] = [{ x: actor.x, y: actor.y }];
  for (let remaining = PROBE_SEED - 1; remaining > 0 && frontier.length > 0; remaining -= 1) {
    const next: Position[] = [];
    for (const cell of frontier) {
      for (const candidate of neighbors(cell, battlefield)) {
        const key = positionKey(candidate);
        if (values.has(key)) continue;
        if (movementCost(actor.classId, candidate, battlefield) >= 99) continue;
        values.set(key, remaining);
        next.push(candidate);
      }
    }
    frontier = next;
  }
  return values;
}

/**
 * `1000:7E09/7E3B`：从锚点开始，每轮取四邻中范围值最大者（同值取后扫描方向），
 * 直到没有候选不小于当前值——在探路图上就是爬回行动者。返回顺序是「锚点 → 行动者」。
 *
 * 锚点不在探路图内时原版会沿陈旧指针在相邻内存里乱走（见 `behavior12-stage-effects.md`
 * 的场景 9）。这里按既定安全默认直接放弃移动。
 */
function probeRoutePath(
  actor: BattleUnit,
  goal: Position,
  probe: ReadonlyMap<string, number>,
  battlefield: GridBattlefield,
): readonly Position[] {
  const valueAt = (position: Position): number | undefined => insideBoard(position, battlefield)
    ? probe.get(positionKey(position)) ?? 0
    : undefined;
  if (positionKey(actor) === positionKey(goal)) return [];
  if ((valueAt(goal) ?? 0) === 0) return [];

  const path: Position[] = [];
  let cursor: Position = { x: goal.x, y: goal.y };
  while (path.length < PROBE_PATH_LIMIT) {
    path.push(cursor);
    let best = valueAt(cursor) ?? 0;
    let next: Position | undefined;
    for (const direction of PROBE_DIRECTIONS) {
      const candidate = { x: cursor.x + direction.x, y: cursor.y + direction.y };
      const value = valueAt(candidate);
      if (value === undefined || value < best) continue;
      best = value;
      next = candidate;
    }
    if (!next) break;
    cursor = next;
  }
  return path;
}

/**
 * `1000:8329` 的落点判据分两部分。这里的「图内」要复现 `Y` 图收尾标记：
 * 传播到的格（含友军中转格与攻击邻格）为非零，敌方占格在四邻存在非零值时也被写成 1，
 * 所以挡路的我方棋子会终止扫描，再由五个候选偏移决定绕不绕。
 */
function nativeRangeCoverage(
  actor: BattleUnit,
  units: readonly BattleUnit[],
  map: MovementMap,
  battlefield: GridBattlefield,
): (position: Position) => boolean {
  const opposing = new Set(units
    .filter((candidate) => candidate.side !== actor.side)
    .map(positionKey));
  return (position) => {
    if (!insideBoard(position, battlefield)) return false;
    if (map.reaches(position)) return true;
    return opposing.has(positionKey(position))
      && neighbors(position, battlefield).some((neighbor) => map.reaches(neighbor));
  };
}

export function planNativeStageRoute(
  actor: BattleUnit,
  units: readonly BattleUnit[],
  goal: Position,
  movement: number,
  battlefield: GridBattlefield,
): StageRoutePlan {
  const origin: Position = { x: actor.x, y: actor.y };
  const stay: StageRoutePlan = { path: [origin], destination: origin };
  const routeCells = probeRoutePath(
    actor,
    goal,
    probeRangeMap(actor, battlefield),
    battlefield,
  );
  if (routeCells.length === 0) return stay;

  const map = movementMap(actor, units, battlefield, movement);
  const covered = nativeRangeCoverage(actor, units, map, battlefield);
  // 原版的空置判据读阵营图，行动者自己仍在图上，所以本格永远不是合法落点。
  const occupied = new Set(units.map(positionKey));
  const first = routeCells.findIndex(covered);
  if (first < 0) return stay;

  for (let index = first; index < routeCells.length; index += 1) {
    const anchor = routeCells[index];
    for (const offset of DESTINATION_OFFSETS) {
      const candidate = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      if (!covered(candidate) || occupied.has(positionKey(candidate))) continue;
      const path = map.pathTo(candidate);
      if (path.length > 1) return { path, destination: candidate };
    }
  }
  return stay;
}
