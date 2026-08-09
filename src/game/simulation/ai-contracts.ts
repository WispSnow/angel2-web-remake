import type { BattleActionId } from "./actions/types";
import type { BattleUnit, Position } from "../types";

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "special" | "route-pulse" | "move" | "rest" | "wait";
  path: Position[];
  targetId?: string;
  actionId?: BattleActionId;
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
  targetFilter?: (target: BattleUnit) => boolean;
  positionFilter?: (position: Position) => boolean;
  pathFilter?: (path: readonly Position[]) => boolean;
}

export type EnemyAiIntent = "route" | "sentry" | "alert" | "pursuit";

export interface EnemyPhaseUpdate {
  activatedGroupIds: readonly string[];
}
