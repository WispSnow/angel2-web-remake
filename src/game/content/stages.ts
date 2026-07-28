import { STAGE0 } from "./stage0";
import type { Position, StageId } from "../types";

export interface StageDefinition {
  id: StageId;
  nativeStage: number;
  name: string;
  width: number;
  height: number;
  viewport: {
    width: number;
    height: number;
    initialOrigin: Position;
  };
  objective: string;
  defeat: string;
}

export const STAGE0_DEFINITION = STAGE0 satisfies StageDefinition;

/**
 * Only runnable content belongs in this registry. `stage-01` is a campaign
 * destination in completed saves, but remains absent until its implementation
 * receives separate authorization.
 */
export const RUNTIME_STAGE_DEFINITIONS = {
  "stage-00": STAGE0_DEFINITION,
} as const;

export type RuntimeStageId = keyof typeof RUNTIME_STAGE_DEFINITIONS;

export function isRuntimeStageId(value: unknown): value is RuntimeStageId {
  return typeof value === "string"
    && Object.hasOwn(RUNTIME_STAGE_DEFINITIONS, value);
}
