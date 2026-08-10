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
  | "stage-01-victory-story"
  | "stage-02-opening-story"
  | "stage-02-victory-story"
  | "stage-03-opening-story"
  | "stage-03-victory-story"
  | "stage-04-prebattle-story"
  | "stage-04-opening-story"
  | "stage-04-victory-story"
  | "stage-05-opening-story"
  | "stage-05-victory-story"
  | "stage-42-portal-arrival-story"
  | "stage-42-portal-confrontation-story"
  | "stage-42-portal-intervention-story"
  | "stage-42-portal-departure-story"
  | "stage-06-prebattle-story"
  | "stage-06-opening-story"
  | "stage-06-retreat-story"
  | "stage-06-alliance-story"
  | "stage-07-prebattle-story"
  | "stage-08-prebattle-story"
  | "stage-08-opening-story"
  | "stage-08-victory-story"
  | "stage-09-opening-story"
  | "stage-09-victory-story"
  | "stage-11-opening-story"
  | "stage-11-victory-story"
  | "stage-10-prebattle-story"
  | "stage-12-prebattle-story"
  | "stage-12-opening-story"
  | "stage-12-victory-story";

export type StageMusicId =
  | "stage-00-story-music"
  | "stage-00-player-phase-music"
  | "stage-00-enemy-phase-music"
  | "stage-01-story-music"
  | "stage-01-player-phase-music"
  | "stage-01-enemy-phase-music"
  | "stage-02-player-phase-music"
  | "stage-02-enemy-phase-music"
  | "stage-03-player-phase-music"
  | "stage-03-enemy-phase-music"
  | "stage-04-story-music"
  | "stage-04-player-phase-music"
  | "stage-04-enemy-phase-music"
  | "stage-05-player-phase-music"
  | "stage-05-enemy-phase-music"
  | "stage-42-player-phase-music"
  | "stage-42-enemy-phase-music"
  | "stage-06-story-music"
  | "stage-06-player-phase-music"
  | "stage-06-enemy-phase-music"
  | "stage-07-story-music"
  | "stage-07-player-phase-music"
  | "stage-07-enemy-phase-music"
  | "stage-08-story-music"
  | "stage-08-player-phase-music"
  | "stage-08-enemy-phase-music"
  | "stage-09-player-phase-music"
  | "stage-09-enemy-phase-music"
  | "stage-11-player-phase-music"
  | "stage-11-enemy-phase-music"
  | "stage-10-story-music"
  | "stage-10-player-phase-music"
  | "stage-10-enemy-phase-music"
  | "stage-12-story-music"
  | "stage-12-player-phase-music"
  | "stage-12-enemy-phase-music";

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
  | "stage-01-completed-route"
  | "stage-02-opening-story"
  | "stage-02-boss-defeated"
  | "stage-02-victory-story"
  | "stage-02-completed-route"
  | "stage-03-opening-story"
  | "stage-03-boss-defeated"
  | "stage-03-victory-story"
  | "stage-03-completed-route"
  | "stage-04-prebattle-story"
  | "stage-04-enter-deployment"
  | "stage-04-opening-story"
  | "stage-04-objective-reached"
  | "stage-04-victory-story"
  | "stage-04-completed-route"
  | "stage-05-enter-deployment"
  | "stage-05-opening-story"
  | "stage-05-objective-reached"
  | "stage-05-victory-story"
  | "stage-05-completed-route"
  | "stage-42-nia-move"
  | "stage-42-arrival-story"
  | "stage-42-confrontation-story"
  | "stage-42-gadirath-move"
  | "stage-42-intervention-story"
  | "stage-42-lightning"
  | "stage-42-departures"
  | "stage-42-departure-story"
  | "stage-42-completed-route"
  | "stage-06-enter-deployment"
  | "stage-06-prebattle-story"
  | "stage-06-opening-story"
  | "stage-06-objective-reached"
  | "stage-06-retreat-story"
  | "stage-06-reinforcements"
  | "stage-06-ranger-leader-move"
  | "stage-06-alliance-story"
  | "stage-06-completed-route"
  | "stage-07-prebattle-story"
  | "stage-07-enter-deployment"
  | "stage-07-objective-reached"
  | "stage-07-completed-route"
  | "stage-08-prebattle-story"
  | "stage-08-opening-story"
  | "stage-08-objective-reached"
  | "stage-08-victory-story"
  | "stage-08-completed-route"
  | "stage-09-enter-deployment"
  | "stage-09-opening-story"
  | "stage-09-objective-reached"
  | "stage-09-victory-story"
  | "stage-09-completed-route"
  | "stage-11-opening-story"
  | "stage-11-dori-departure"
  | "stage-11-objective-reached"
  | "stage-11-victory-story"
  | "stage-11-completed-route"
  | "stage-10-prebattle-story"
  | "stage-10-enter-deployment"
  | "stage-10-objective-reached"
  | "stage-10-completed-route"
  | "stage-12-prebattle-story"
  | "stage-12-enter-deployment"
  | "stage-12-opening-story"
  | "stage-12-objective-reached"
  | "stage-12-victory-story"
  | "stage-12-completed-route";

export type StageSimulationEffectId =
  | "none"
  | "stage-00-opening-move"
  | "stage-00-route-to-stage-01"
  | "stage-01-enter-deployment"
  | "stage-01-create-battle"
  | "stage-01-set-victory-999"
  | "stage-01-messenger-arrival"
  | "stage-01-route-to-stage-02"
  | "stage-02-set-victory-999"
  | "stage-02-route-to-stage-03"
  | "stage-03-set-victory-999"
  | "stage-03-route-to-stage-04"
  | "stage-04-enter-deployment"
  | "stage-04-set-victory-999"
  | "stage-04-route-to-stage-05"
  | "stage-05-enter-deployment"
  | "stage-05-set-victory-999"
  | "stage-05-route-to-stage-42"
  | "stage-42-nia-move"
  | "stage-42-gadirath-move"
  | "stage-42-lightning-4"
  | "stage-42-story-departures"
  | "stage-42-route-to-stage-06"
  | "stage-06-enter-deployment"
  | "stage-06-set-victory-999"
  | "stage-06-reinforcement-tableau"
  | "stage-06-ranger-leader-move"
  | "stage-06-route-to-stage-07"
  | "stage-07-enter-deployment"
  | "stage-07-set-victory-999"
  | "stage-07-route-to-stage-08"
  | "stage-08-set-victory-999"
  | "stage-08-route-to-stage-09"
  | "stage-09-enter-deployment"
  | "stage-09-set-victory-999"
  | "stage-09-route-to-stage-11"
  | "stage-11-dori-departure"
  | "stage-11-set-victory-999"
  | "stage-11-route-to-stage-10"
  | "stage-10-enter-deployment"
  | "stage-10-set-victory-999"
  | "stage-10-route-to-stage-12"
  | "stage-12-enter-deployment"
  | "stage-12-set-victory-999"
  | "stage-12-route-to-stage-13";

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
  | { type: "any-of"; conditions: readonly StageObjectiveCondition[] }
  | { type: "eliminate-side"; side: Side }
  | { type: "unit-removed"; side: Side; slot: number }
  | { type: "any-unit-removed"; side: Side; slots: readonly number[] }
  | {
    type: "unit-in-cell-range";
    side: Side;
    slot: number;
    width: number;
    minimum: number;
    maximum: number;
  };

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
  /** Ordered battle-map stories used by non-interactive campaign interstitials. */
  scripted?: readonly StageStoryId[];
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
