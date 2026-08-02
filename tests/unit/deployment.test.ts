import { describe, expect, it } from "vitest";
import type { InteractiveDeploymentDefinition } from "../../src/game/content/stages";
import {
  DEPLOYMENT_FEEDBACK_TEXT,
  createDeploymentState,
  finishDeployment,
  reduceDeployment,
  validateDeploymentResult,
} from "../../src/game/simulation/deployment";
import { DeterministicRng } from "../../src/game/simulation/rng";

const definition = {
  kind: "interactive",
  eligibleSlots: [42, 40, 43, 41, 0, 1, 2, 4, 24],
  fixedPlacements: [
    { slot: 42, position: { x: 19, y: 33 } },
    { slot: 40, position: { x: 27, y: 33 } },
    { slot: 43, position: { x: 19, y: 34 } },
    { slot: 41, position: { x: 27, y: 34 } },
    { slot: 0, position: { x: 22, y: 36 } },
  ],
  optionalSlots: [1, 2, 4, 24],
  openCells: [
    { x: 21, y: 33 },
    { x: 23, y: 33 },
    { x: 25, y: 33 },
  ],
  maximumUnits: 8,
} as const satisfies InteractiveDeploymentDefinition;

const roster = definition.eligibleSlots;

describe("stage 1 deployment simulation", () => {
  it("starts with five fixed units and permits an immediate five-unit finish", () => {
    const state = createDeploymentState(definition, roster);
    expect(state.placements).toHaveLength(5);
    expect(state.currentOpenCell).toEqual({ x: 21, y: 33 });
    expect(finishDeployment(state).placements).toEqual(
      definition.fixedPlacements.map((placement) => ({ ...placement, fixed: true })),
    );
    expect(reduceDeployment(state, { type: "finish" })).toMatchObject({
      submitted: true,
      currentOpenCell: undefined,
      focus: { kind: "finish" },
    });
  });

  it("fills three open cells in selected order and rejects a ninth unit", () => {
    let state = createDeploymentState(definition, roster);
    for (const slot of [1, 2, 4]) {
      state = reduceDeployment(state, { type: "toggle-roster-slot", slot });
    }
    expect(state.placements.filter(({ fixed }) => !fixed)).toEqual([
      { slot: 1, position: { x: 21, y: 33 }, fixed: false },
      { slot: 2, position: { x: 23, y: 33 }, fixed: false },
      { slot: 4, position: { x: 25, y: 33 }, fixed: false },
    ]);
    const full = reduceDeployment(state, { type: "toggle-roster-slot", slot: 24 });
    expect(full.feedback).toBe("full");
    expect(full.placements).toBe(state.placements);
    expect(DEPLOYMENT_FEEDBACK_TEXT.full).toBe("出場人數已滿.");
  });

  it("restores a removed optional cell for another roster unit", () => {
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "cycle-open-cell", direction: "next" });
    state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 1 });
    expect(state.placements.find(({ slot }) => slot === 1)?.position).toEqual({ x: 23, y: 33 });
    state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 1 });
    expect(state.currentOpenCell).toEqual({ x: 23, y: 33 });
    state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 24 });
    expect(state.placements.find(({ slot }) => slot === 24)?.position).toEqual({ x: 23, y: 33 });
  });

  it("blocks every action except a new primary while native feedback is visible", () => {
    const initial = createDeploymentState(definition, roster);
    const fixed = reduceDeployment(initial, { type: "toggle-roster-slot", slot: 0 });
    expect(fixed.feedback).toBe("fixed-unit");
    expect(DEPLOYMENT_FEEDBACK_TEXT["fixed-unit"]).toBe("此人必須出場戰鬥,不可放棄.");
    expect(reduceDeployment(fixed, { type: "move-focus", direction: "right" })).toBe(fixed);
    expect(reduceDeployment(fixed, { type: "cycle-open-cell", direction: "next" })).toBe(fixed);
    expect(reduceDeployment(fixed, { type: "finish" })).toBe(fixed);
    const dismissed = reduceDeployment(fixed, { type: "dismiss-feedback" });
    expect(dismissed.feedback).toBeUndefined();
    expect(dismissed.placements).toEqual(initial.placements);

    const empty = reduceDeployment(initial, { type: "toggle-roster-slot" });
    expect(empty.feedback).toBe("empty-slot");
    expect(DEPLOYMENT_FEEDBACK_TEXT["empty-slot"]).toBe("此處沒有人.");
  });

  it("keeps roster, page, finish, and contextual map focus deterministic", () => {
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "move-focus", direction: "right" });
    state = reduceDeployment(state, { type: "move-focus", direction: "right" });
    state = reduceDeployment(state, { type: "move-focus", direction: "right" });
    expect(state.focus).toEqual({ kind: "page", page: 0 });
    state = reduceDeployment(state, { type: "move-focus", direction: "down" });
    expect(state).toMatchObject({ rosterPage: 1, focus: { kind: "page", page: 1 } });
    state = reduceDeployment(state, { type: "move-focus", direction: "right" });
    expect(state.focus).toEqual({ kind: "finish" });
    state = reduceDeployment(state, { type: "focus-map" });
    expect(state.focus).toEqual({ kind: "map" });
    state = reduceDeployment(state, { type: "move-focus", direction: "left" });
    expect(state.focus).toEqual({ kind: "roster", index: 10 });
  });

  it("does not consume PRNG and validates normalized deployment results", () => {
    const rng = new DeterministicRng(0x1234);
    const before = rng.state;
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "select-open-cell", position: { x: 25, y: 33 } });
    state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 24 });
    const result = finishDeployment(state);
    expect(rng.state).toBe(before);
    expect(result.placements.at(-1)).toEqual({
      slot: 24,
      position: { x: 25, y: 33 },
      fixed: false,
    });
    expect(() => validateDeploymentResult(definition, result)).not.toThrow();
    expect(() => validateDeploymentResult(definition, {
      placements: result.placements.filter(({ slot }) => slot !== 0),
    })).toThrow("fixed slot 0 is missing or moved");
  });
});
