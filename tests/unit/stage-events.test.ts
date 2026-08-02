import { describe, expect, it } from "vitest";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  createStageEventState,
  dispatchStageEvents,
  stageEventTriggerMatches,
} from "../../src/game/simulation/stage-events";

describe("stage event simulation", () => {
  it("matches semantic triggers without relying on controller phases", () => {
    expect(stageEventTriggerMatches(
      { type: "round-started", round: 2 },
      { type: "round-started", round: 2 },
    )).toBe(true);
    expect(stageEventTriggerMatches(
      { type: "round-started", round: 2 },
      { type: "round-started", round: 3 },
    )).toBe(false);
    expect(stageEventTriggerMatches(
      { type: "story-completed", storyId: "stage-00-prebattle-story" },
      { type: "story-completed", storyId: "stage-00-opening-story" },
    )).toBe(false);
  });

  it("consumes each stage event once and preserves definition order", () => {
    const initial = createStageEventState(STAGE0_DEFINITION);
    const entered = dispatchStageEvents(
      STAGE0_DEFINITION,
      initial,
      { type: "campaign-entered" },
    );
    expect(entered.events.map(({ id }) => id)).toEqual(["stage-00-prebattle-story"]);
    expect(entered.state.consumedEventIds).toEqual(["stage-00-prebattle-story"]);
    const repeated = dispatchStageEvents(
      STAGE0_DEFINITION,
      entered.state,
      { type: "campaign-entered" },
    );
    expect(repeated.events).toEqual([]);
    expect(repeated.state).toBe(entered.state);
  });

  it("rejects event state that belongs to another stage or repeats IDs", () => {
    expect(() => createStageEventState(STAGE0_DEFINITION, [
      "stage-00-prebattle-story",
      "stage-00-prebattle-story",
    ])).toThrow("must not contain duplicates");
    expect(() => createStageEventState(
      STAGE0_DEFINITION,
      ["stage-01-prebattle-story"],
    )).toThrow("does not belong to this stage");
  });
});
