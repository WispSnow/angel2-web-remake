import type {
  CampaignRouteId,
  PortraitRecord,
  Position,
  Side,
  UnitClassId,
} from "../types";
import type { StageSimulationEffectId } from "./stages";
import { STAGE0 } from "./stage0";

export type { CampaignRouteId } from "../types";

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
  }
  | {
    type: "scripted-special-action";
    actionId: "lightning-4";
    actor: {
      id: string;
      side: Side;
      slot: number;
      classId: UnitClassId;
      name: string;
      portrait: PortraitRecord;
    };
    target: Position;
    targetSide: Side;
    preserveUnitIds: readonly string[];
    statusText: string;
  }
  | {
    type: "story-departures";
    actors: readonly { side: Side; slot: number }[];
    statusText: string;
  }
  | {
    type: "story-reinforcements";
    actors: readonly {
      id: string;
      source: { side: Side; slot: number };
      position: Position;
      name: string;
      portrait: PortraitRecord;
      forcedClassId?: UnitClassId;
      forcedExperience?: number;
      /** Dynamic actors inherit ownership/control from this existing force member. */
      forceSourceId?: string;
    }[];
    statusText: string;
    revealTiming?: "native-before-write" | "after-write";
  }
  | {
    type: "scripted-unit-arrival";
    actorId: string;
    target: { side: Side; portrait: PortraitRecord };
    movementBudget: number;
    statusText: string;
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
