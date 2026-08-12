import { describe, expect, it } from "vitest";
import { STAGE1_DEFINITION } from "../../src/game/content/stage1";
import { STAGE22_DEFINITION } from "../../src/game/content/stage22";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  consumedEventIdsForBattleResume,
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

  it("derives deterministic v6 battle-resume consumption from the round", () => {
    expect(consumedEventIdsForBattleResume(STAGE0_DEFINITION, 1)).toEqual([
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
    ]);
    expect(consumedEventIdsForBattleResume(STAGE0_DEFINITION, 2)).toEqual([
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
      "stage-00-round-2-story",
    ]);
  });

  it("chains stage 1 deployment, opening, messenger, and route by stable IDs", () => {
    let state = createStageEventState(STAGE1_DEFINITION);
    let dispatched = dispatchStageEvents(
      STAGE1_DEFINITION,
      state,
      { type: "campaign-entered" },
    );
    expect(dispatched.events.map(({ id }) => id)).toEqual(["stage-01-prebattle-story"]);
    state = dispatched.state;

    dispatched = dispatchStageEvents(STAGE1_DEFINITION, state, {
      type: "story-completed",
      storyId: "stage-01-prebattle-story",
    });
    expect(dispatched.events.map(({ id }) => id)).toEqual(["stage-01-enter-deployment"]);
    state = dispatched.state;

    dispatched = dispatchStageEvents(STAGE1_DEFINITION, state, { type: "battle-started" });
    expect(dispatched.events.map(({ id }) => id)).toEqual(["stage-01-opening-story"]);
    state = dispatched.state;

    dispatched = dispatchStageEvents(STAGE1_DEFINITION, state, { type: "objective-satisfied" });
    expect(dispatched.events.map(({ id, simulationEffect }) => ({ id, simulationEffect }))).toEqual([
      { id: "stage-01-boss-defeated", simulationEffect: "stage-01-set-victory-999" },
    ]);
    state = dispatched.state;

    dispatched = dispatchStageEvents(STAGE1_DEFINITION, state, {
      type: "effect-completed",
      effectId: "stage-01-set-victory-999",
    });
    expect(dispatched.events.map(({ id, presentation }) => ({ id, presentation }))).toEqual([
      { id: "stage-01-messenger-arrival", presentation: "stage-01-victory-story" },
    ]);
    state = dispatched.state;

    dispatched = dispatchStageEvents(STAGE1_DEFINITION, state, { type: "victory-flow-completed" });
    expect(dispatched.events.map(({ id, simulationEffect }) => ({ id, simulationEffect }))).toEqual([
      { id: "stage-01-completed-route", simulationEffect: "stage-01-route-to-stage-02" },
    ]);
  });

  it("chains the stage 22 entrance, betrayal, six-enemy ambush, and player handoff", () => {
    let state = createStageEventState(STAGE22_DEFINITION);
    const expectEvent = (
      trigger: Parameters<typeof dispatchStageEvents>[2],
      id: string,
      effect: string,
    ) => {
      const dispatched = dispatchStageEvents(STAGE22_DEFINITION, state, trigger);
      expect(dispatched.events.map((event) => ({ id: event.id, effect: event.simulationEffect })))
        .toEqual([{ id, effect }]);
      state = dispatched.state;
    };
    expectEvent({ type: "campaign-entered" }, "stage-22-enter-deployment", "stage-22-enter-deployment");
    expectEvent({ type: "battle-started" }, "stage-22-empress-arrival", "stage-22-empress-arrival");
    expectEvent({ type: "effect-completed", effectId: "stage-22-empress-arrival" }, "stage-22-empress-move", "stage-22-empress-move");
    expectEvent({ type: "effect-completed", effectId: "stage-22-empress-move" }, "stage-22-kins-arrival", "stage-22-kins-arrival");
    expectEvent({ type: "effect-completed", effectId: "stage-22-kins-arrival" }, "stage-22-kins-move", "stage-22-kins-move");
    expectEvent({ type: "effect-completed", effectId: "stage-22-kins-move" }, "stage-22-search-story", "none");
    expectEvent({ type: "story-completed", storyId: "stage-22-search-story" }, "stage-22-focus-nia", "stage-22-focus-nia");
    expectEvent({ type: "effect-completed", effectId: "stage-22-focus-nia" }, "stage-22-reunion-story", "none");
    expectEvent({ type: "story-completed", storyId: "stage-22-reunion-story" }, "stage-22-gadirath-arrival", "stage-22-gadirath-arrival");
    expectEvent({ type: "effect-completed", effectId: "stage-22-gadirath-arrival" }, "stage-22-betrayal-story", "none");
    expectEvent({ type: "story-completed", storyId: "stage-22-betrayal-story" }, "stage-22-dragon-arrival", "stage-22-dragon-arrival");
    expectEvent({ type: "effect-completed", effectId: "stage-22-dragon-arrival" }, "stage-22-dragon-story", "none");
    expectEvent({ type: "story-completed", storyId: "stage-22-dragon-story" }, "stage-22-story-departures", "stage-22-story-departures");
    expectEvent({ type: "effect-completed", effectId: "stage-22-story-departures" }, "stage-22-ambush-arrivals", "stage-22-ambush-arrivals");
    expectEvent({ type: "effect-completed", effectId: "stage-22-ambush-arrivals" }, "stage-22-player-ready", "stage-22-player-ready");
    expectEvent({ type: "objective-satisfied" }, "stage-22-objective-reached", "stage-22-set-victory-999");
    expectEvent({ type: "victory-flow-completed" }, "stage-22-completed-route", "stage-22-route-to-stage-23");
  });
});
