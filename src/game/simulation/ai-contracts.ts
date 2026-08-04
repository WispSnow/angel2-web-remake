import type { BattleActionId } from "./actions/types";
import type { BattleUnit, Position } from "../types";

export interface AlliedAiAction {
  unitId: string;
  kind: "attack" | "special" | "move" | "rest" | "wait";
  path: Position[];
  targetId?: string;
  actionId?: BattleActionId;
}

export interface OrdinaryAiPlanningOptions {
  targetFilter?: (target: BattleUnit) => boolean;
  destinationFilter?: (position: Position) => boolean;
  pathFilter?: (path: readonly Position[]) => boolean;
  restThresholdPercent?: number;
}

export interface ClassActionPlanningOptions {
  modernRanking?: boolean;
  targetFilter?: (target: BattleUnit) => boolean;
  positionFilter?: (position: Position) => boolean;
  pathFilter?: (path: readonly Position[]) => boolean;
}

export type EnemyAiIntent = "route" | "sentry" | "alert" | "pursuit";

export interface EnemyPhaseUpdate {
  activatedGroupIds: readonly string[];
}
