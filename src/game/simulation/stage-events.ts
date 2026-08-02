import type {
  StageDefinition,
  StageEventDefinition,
  StageEventId,
  StageEventTrigger,
} from "../content/stages";

export interface StageEventState {
  consumedEventIds: readonly StageEventId[];
}

export interface StageEventDispatch {
  state: StageEventState;
  events: readonly StageEventDefinition[];
}

export function stageEventTriggerMatches(
  expected: StageEventTrigger,
  received: StageEventTrigger,
): boolean {
  if (expected.type !== received.type) return false;
  switch (expected.type) {
    case "campaign-entered":
    case "objective-satisfied":
    case "victory-flow-completed":
      return true;
    case "story-completed":
      return received.type === expected.type && received.storyId === expected.storyId;
    case "effect-completed":
      return received.type === expected.type && received.effectId === expected.effectId;
    case "round-started":
      return received.type === expected.type && received.round === expected.round;
  }
}

export function createStageEventState(
  stage: StageDefinition,
  consumedEventIds: readonly StageEventId[] = [],
): StageEventState {
  const stageIds = new Set(stage.events.map(({ id }) => id));
  if (new Set(consumedEventIds).size !== consumedEventIds.length) {
    throw new Error("consumed stage event IDs must not contain duplicates");
  }
  if (consumedEventIds.some((id) => !stageIds.has(id))) {
    throw new Error("consumed stage event ID does not belong to this stage");
  }
  return { consumedEventIds: [...consumedEventIds] };
}

export function dispatchStageEvents(
  stage: StageDefinition,
  state: StageEventState,
  trigger: StageEventTrigger,
): StageEventDispatch {
  const consumed = new Set(state.consumedEventIds);
  const events = stage.events.filter(
    (event) => !consumed.has(event.id) && stageEventTriggerMatches(event.trigger, trigger),
  );
  if (events.length === 0) return { state, events };
  return {
    state: {
      consumedEventIds: [...state.consumedEventIds, ...events.map(({ id }) => id)],
    },
    events,
  };
}
