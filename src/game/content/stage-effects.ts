import type { Position, Side } from "../types";
import type { StageSimulationEffectId } from "./stages";
import { STAGE0 } from "./stage0";

export type CampaignRouteId = "stage-01" | "stage-02";

export type StageSimulationEffectDefinition =
  | {
    type: "scripted-unit-move";
    actor: { side: Side; slot: number };
    destination: Position;
    movementBudget: number;
    statusText: string;
  }
  | {
    type: "campaign-route";
    destination: CampaignRouteId;
  };

export const STAGE_SIMULATION_EFFECTS = {
  "stage-00-opening-move": {
    type: "scripted-unit-move",
    actor: { side: 1, slot: 0 },
    destination: STAGE0.opening.to,
    movementBudget: STAGE0.opening.budget,
    statusText: "妮雅趕往大殿……",
  },
  "stage-00-route-to-stage-01": {
    type: "campaign-route",
    destination: "stage-01",
  },
} as const satisfies Partial<Record<StageSimulationEffectId, StageSimulationEffectDefinition>>;

const STAGE_SIMULATION_EFFECT_REGISTRY:
Partial<Record<StageSimulationEffectId, StageSimulationEffectDefinition>> =
  STAGE_SIMULATION_EFFECTS;

export function stageSimulationEffectFor(
  id: Exclude<StageSimulationEffectId, "none">,
): StageSimulationEffectDefinition | undefined {
  return STAGE_SIMULATION_EFFECT_REGISTRY[id];
}
