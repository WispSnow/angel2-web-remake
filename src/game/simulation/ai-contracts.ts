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
  /**
   * The DS:84BB contextual line the native planner speaks for this branch.
   * Informational: the native code emits it from the planner itself, so the
   * plan records which branch it took and the presentation layer reads it.
   */
  nativeLine?: AiPlannerLineKey;
}

/**
 * The planner-emitted subset of the contextual battle lines. Each one is spoken
 * from inside the native AI decision, before the chosen action runs.
 * `restingToRecover` is native `1000:2291`'s line 05h: the rest a unit takes
 * because its class action found nothing to do (REMAKE-143 extends that rest
 * to every idle dead end). The presentation layer also reads it to keep such
 * idle rests from dragging the camera around.
 */
export type AiPlannerLineKey =
  | "restingLowLife"
  | "restingToRecover"
  | "breakingContact"
  | "surrounded";

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
   * REMAKE-118 keeps a named side-2 leader on its own line. It fights exactly
   * like the rank and file — REMAKE-012 move-then-attack included — but every
   * cell it may land on has to stay within reach of a surviving squadmate, and
   * a pursuit landing still ranks exact next-phase melee contact before raw
   * progress. Together those stop the lone charge REMAKE-090 was aimed at
   * without taking the leader's attack away.
   */
  namedLeaderLineHold?: boolean;
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
