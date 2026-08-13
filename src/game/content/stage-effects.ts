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
    type: "enter-player-phase";
    statusText: string;
  }
  | {
    type: "focus-actor";
    actor: { side: Side; slot: number };
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
      /** Native focus may intentionally differ from the cell subsequently written. */
      focusPosition?: Position;
      name: string;
      portrait: PortraitRecord;
      forcedClassId?: UnitClassId;
      forcedExperience?: number;
      /** Dynamic actors inherit ownership/control from this existing force member. */
      forceSourceId?: string;
    }[];
    statusText: string;
    revealTiming?:
      | "native-before-write"
      | "native-before-write-deferred-refresh"
      | "after-write"
      | "deferred-refresh";
    /**
     * Native cell writes carry the `80h` action bit of the unit-slot map. Scenes
     * that hand the board back to a side phase leave it set (the default);
     * a noninteractive interlude that never reaches one must not paint every
     * actor with the 已行動 badge.
     */
    actionSpent?: boolean;
    /** Native `focusPortraitResource`; defaults to the last actor written. */
    focusPortrait?: PortraitRecord;
    /**
     * Native stage 22 selects Nia before the first memory-only board write.
     * Other reinforcement sequences keep the existing post-write default.
     */
    focusPortraitTiming?: "before-write" | "after-write";
  }
  | {
    type: "scripted-unit-arrival";
    actorId: string;
    target: { side: Side; portrait: PortraitRecord };
    movementBudget: number;
    statusText: string;
  }
  | {
    type: "unit-form-transition";
    actorId: string;
    targetClassId: UnitClassId;
    targetName: string;
    targetDisplayIdentity?: "named-class-portrait";
    targetPortrait?: PortraitRecord;
    targetExperience: number;
    context: {
      selector: number;
      address: string;
      text: string;
    };
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
