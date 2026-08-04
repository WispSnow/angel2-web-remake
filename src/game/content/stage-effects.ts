import type { Position, Side } from "../types";
import type { StageSimulationEffectId } from "./stages";
import { STAGE0 } from "./stage0";

export type CampaignRouteId = "stage-01" | "stage-02" | "stage-03";

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
  }
  | {
    type: "enter-deployment";
  }
  | {
    type: "victory-state";
    value: 999;
  }
  | {
    type: "messenger-arrival";
    actor: { side: 1; slot: 48 };
    from: Position;
    targetPortrait: number;
    movementBudget: number;
  };

export const STAGE_SIMULATION_EFFECTS:
  Partial<Record<StageSimulationEffectId, StageSimulationEffectDefinition>> = {
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
};

const STAGE_SIMULATION_EFFECT_REGISTRY:
  Partial<Record<StageSimulationEffectId, StageSimulationEffectDefinition>> =
  STAGE_SIMULATION_EFFECTS;

export function registerStageSimulationEffects(
  definitions: Partial<Record<StageSimulationEffectId, StageSimulationEffectDefinition>>,
): void {
  for (const [id, definition] of Object.entries(definitions)) {
    const effectId = id as StageSimulationEffectId;
    const existing = STAGE_SIMULATION_EFFECT_REGISTRY[effectId];
    if (existing && existing !== definition) {
      if (JSON.stringify(existing) === JSON.stringify(definition)) continue;
      throw new Error(`stage simulation effect ${id} is already registered`);
    }
    STAGE_SIMULATION_EFFECT_REGISTRY[effectId] = definition;
  }
}

export function stageSimulationEffectFor(
  id: Exclude<StageSimulationEffectId, "none">,
): StageSimulationEffectDefinition | undefined {
  return STAGE_SIMULATION_EFFECT_REGISTRY[id];
}
