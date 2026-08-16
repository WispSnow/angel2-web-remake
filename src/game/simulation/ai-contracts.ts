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
  /** Informational next-turn technique forecast for a positioning-only move. */
  setupActionId?: BattleActionId;
  /** Target paired with `setupActionId`; neither field commits a future action. */
  setupTargetId?: string;
  /** Rules-significant magic-archer effect path, separate from movement path. */
  linePath?: Position[];
}

/**
 * The phase scheduler ranks complete plans, not just actor ids. Returning the
 * winning plan lets the controller commit that exact deterministic result
 * without immediately running the same planner a second time.
 */
export interface AiActionSelection {
  unitId: string;
  action?: AlliedAiAction;
}

export interface OrdinaryAiPlanningOptions {
  /** Uses REMAKE-033 utility ranking and its 40% rest boundary. */
  expertRanking?: boolean;
  /**
   * REMAKE-090 restores the native pursuit boundary for named side-2 leaders:
   * `longPursuit`/`behaviorTwoPursuit` never attack in the action that moves,
   * so the actor only strikes from the cell it already holds, and a pursuit
   * action ranks landings by exact next-phase melee contact before progress.
   * Rank and file keep the REMAKE-012 move-then-attack pursuit.
   */
  namedLeaderCaution?: boolean;
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
   * Plans a non-shooting action as if the actor already stood here. The
   * native `0P/1P` branch uses it for a same-turn retreat-then-cast; expert
   * caster positioning also uses it read-only to forecast a next-turn action.
   * Every committed ordinary technique still casts from the actor's current
   * cell.
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
