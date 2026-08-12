import type { BattleActionId } from "./actions/types";
import type { BattleUnit, Position } from "../types";

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "special" | "route-pulse" | "move" | "rest" | "wait";
  path: Position[];
  /** Traversable movement-cost reduction toward the selected engagement cell. */
  pursuitProgress?: number;
  /** The pursuit goal is a same-side occupied melee frontage, never a legal landing. */
  queueAdvance?: true;
  /** Net number of unacted squadmates given a vacant engagement route by this attack move. */
  trafficRelease?: number;
  /** Net traversable route-cost reduction for squadmates that already had a route. */
  trafficProgress?: number;
  targetId?: string;
  actionId?: BattleActionId;
  /** Rules-significant magic-archer effect path, separate from movement path. */
  linePath?: Position[];
}

export interface OrdinaryAiPlanningOptions {
  /** Uses REMAKE-033 utility ranking and its 40% rest boundary. */
  expertRanking?: boolean;
  targetFilter?: (target: BattleUnit) => boolean;
  destinationFilter?: (position: Position) => boolean;
  pathFilter?: (path: readonly Position[]) => boolean;
  restThresholdPercent?: number;
}

export interface ClassActionPlanningOptions {
  modernRanking?: boolean;
  /** Compares every legal action/target pair with the shared expert utility. */
  expertRanking?: boolean;
  /**
   * Plans a non-shooting action as if the actor already stood here. Only the
   * native `0P/1P` retreat-then-cast branch needs it; every other technique
   * entry keeps casting from the actor's current cell.
   */
  casterPosition?: Position;
  actionFilter?: (actionId: BattleActionId) => boolean;
  targetFilter?: (target: BattleUnit) => boolean;
  positionFilter?: (position: Position) => boolean;
  pathFilter?: (path: readonly Position[]) => boolean;
}

export type EnemyAiIntent = "route" | "sentry" | "alert" | "pursuit";

export interface EnemyPhaseUpdate {
  activatedGroupIds: readonly string[];
}
