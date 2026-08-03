import { STAGE0 } from "./stage0";
import type { Position, Side, StageId } from "../types";
import type { CellBounds } from "./terrain";

export type StageStoryId =
  | "stage-00-prebattle-story"
  | "stage-00-opening-story"
  | "stage-00-round-2-story"
  | "stage-00-victory-story"
  | "stage-01-prebattle-story"
  | "stage-01-opening-story"
  | "stage-01-victory-story";

export type StageMusicId =
  | "stage-00-story-music"
  | "stage-00-player-phase-music"
  | "stage-00-enemy-phase-music"
  | "stage-01-story-music"
  | "stage-01-player-phase-music"
  | "stage-01-enemy-phase-music";

export type StageEventId =
  | "stage-00-prebattle-story"
  | "stage-00-opening-move"
  | "stage-00-opening-story"
  | "stage-00-round-2-story"
  | "stage-00-victory-story"
  | "stage-00-completed-route"
  | "stage-01-prebattle-story"
  | "stage-01-enter-deployment"
  | "stage-01-opening-story"
  | "stage-01-boss-defeated"
  | "stage-01-messenger-arrival"
  | "stage-01-completed-route";

export type StageSimulationEffectId =
  | "none"
  | "stage-00-opening-move"
  | "stage-00-route-to-stage-01"
  | "stage-01-enter-deployment"
  | "stage-01-create-battle"
  | "stage-01-set-victory-999"
  | "stage-01-messenger-arrival"
  | "stage-01-route-to-stage-02";

export type StagePresentationId =
  | "none"
  | StageStoryId
  | "stage-00-opening-move"
  | "stage-01-messenger-arrival";

export type StageEventTrigger =
  | { type: "campaign-entered" }
  | { type: "battle-started" }
  | { type: "story-completed"; storyId: StageStoryId }
  | { type: "effect-completed"; effectId: StageSimulationEffectId }
  | { type: "round-started"; round: number }
  | { type: "objective-satisfied" }
  | { type: "victory-flow-completed" };

export interface StageEventDefinition {
  id: StageEventId;
  trigger: StageEventTrigger;
  simulationEffect: StageSimulationEffectId;
  presentation: StagePresentationId;
}

export type StageObjectiveCondition =
  | { type: "eliminate-side"; side: Side }
  | { type: "unit-removed"; side: Side; slot: number };

export interface StageObjectiveDefinition {
  victory: StageObjectiveCondition;
  defeat: StageObjectiveCondition;
  victoryText: string;
  defeatText: string;
  victoryStatusText: string;
}

export interface FixedDeploymentDefinition {
  kind: "fixed";
}

export interface InteractiveDeploymentDefinition {
  kind: "interactive";
  eligibleSlots: readonly number[];
  fixedPlacements: readonly { slot: number; position: Position }[];
  optionalSlots: readonly number[];
  openCells: readonly Position[];
  maximumUnits: number;
}

export type StageDeploymentDefinition =
  | FixedDeploymentDefinition
  | InteractiveDeploymentDefinition;

export interface StageStoryDefinition {
  prebattle?: StageStoryId;
  opening?: StageStoryId;
  roundStarts: readonly { round: number; storyId: StageStoryId }[];
  victory?: StageStoryId;
}

export interface StageMusicDefinition {
  story?: StageMusicId;
  playerPhase: StageMusicId;
  enemyPhase: StageMusicId;
}

export interface StageDefinition<Id extends StageId = StageId> {
  id: Id;
  nativeStage: number;
  name: string;
  width: number;
  height: number;
  viewport: {
    width: number;
    height: number;
    initialOrigin: Position;
    originBounds: CellBounds;
  };
  contentIdentity: string;
  objective: StageObjectiveDefinition;
  deployment: StageDeploymentDefinition;
  stories: StageStoryDefinition;
  music: StageMusicDefinition;
  events: readonly StageEventDefinition[];
}

export const STAGE0_DEFINITION = {
  id: STAGE0.id,
  nativeStage: STAGE0.nativeStage,
  name: STAGE0.name,
  width: STAGE0.width,
  height: STAGE0.height,
  viewport: STAGE0.viewport,
  contentIdentity: "stage-00/native-actions-1",
  objective: {
    victory: { type: "eliminate-side", side: 2 },
    defeat: { type: "unit-removed", side: 1, slot: 0 },
    victoryText: STAGE0.objective,
    defeatText: STAGE0.defeat,
    victoryStatusText: "瓦爾克麗宮內的敵人均已被擊倒或撤離。",
  },
  deployment: { kind: "fixed" },
  stories: {
    prebattle: "stage-00-prebattle-story",
    opening: "stage-00-opening-story",
    roundStarts: [{ round: 2, storyId: "stage-00-round-2-story" }],
    victory: "stage-00-victory-story",
  },
  music: {
    story: "stage-00-story-music",
    playerPhase: "stage-00-player-phase-music",
    enemyPhase: "stage-00-enemy-phase-music",
  },
  events: [
    {
      id: "stage-00-prebattle-story",
      trigger: { type: "campaign-entered" },
      simulationEffect: "none",
      presentation: "stage-00-prebattle-story",
    },
    {
      id: "stage-00-opening-move",
      trigger: { type: "story-completed", storyId: "stage-00-prebattle-story" },
      simulationEffect: "stage-00-opening-move",
      presentation: "stage-00-opening-move",
    },
    {
      id: "stage-00-opening-story",
      trigger: { type: "effect-completed", effectId: "stage-00-opening-move" },
      simulationEffect: "none",
      presentation: "stage-00-opening-story",
    },
    {
      id: "stage-00-round-2-story",
      trigger: { type: "round-started", round: 2 },
      simulationEffect: "none",
      presentation: "stage-00-round-2-story",
    },
    {
      id: "stage-00-victory-story",
      trigger: { type: "objective-satisfied" },
      simulationEffect: "none",
      presentation: "stage-00-victory-story",
    },
    {
      id: "stage-00-completed-route",
      trigger: { type: "victory-flow-completed" },
      simulationEffect: "stage-00-route-to-stage-01",
      presentation: "none",
    },
  ],
} as const satisfies StageDefinition<"stage-00">;

/** Runnable definitions; later stage chunks register themselves when loaded. */
export const RUNTIME_STAGE_DEFINITIONS: Partial<Record<StageId, StageDefinition>> = {
  "stage-00": STAGE0_DEFINITION,
};

export type RuntimeStageId = StageId;

export function registerRuntimeStageDefinition(definition: StageDefinition): void {
  const existing = RUNTIME_STAGE_DEFINITIONS[definition.id];
  if (existing && existing !== definition) {
    throw new Error(`runtime stage ${definition.id} is already registered`);
  }
  RUNTIME_STAGE_DEFINITIONS[definition.id] = definition;
}

export function isRuntimeStageId(value: unknown): value is RuntimeStageId {
  return typeof value === "string"
    && Object.hasOwn(RUNTIME_STAGE_DEFINITIONS, value);
}
