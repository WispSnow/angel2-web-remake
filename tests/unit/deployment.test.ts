import { describe, expect, it } from "vitest";
import type { InteractiveDeploymentDefinition } from "../../src/game/content/stages";
import {
  DEPLOYMENT_FEEDBACK_TEXT,
  createDeploymentState,
  finishDeployment,
  rankAutoFillSlots,
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
  it("keeps fixed board-only allies out of the prepared roster", () => {
    const boardOnlyDefinition = {
      kind: "interactive",
      eligibleSlots: [42, 0, 1],
      fixedPlacements: [
        { slot: 42, position: { x: 10, y: 10 } },
        { slot: 0, position: { x: 11, y: 10 } },
      ],
      optionalSlots: [1],
      openCells: [{ x: 12, y: 10 }],
      maximumUnits: 3,
    } as const satisfies InteractiveDeploymentDefinition;
    const state = createDeploymentState(boardOnlyDefinition, [0, 1]);

    expect(state.rosterSlots).toEqual([0, 1]);
    expect(state.placements).toEqual([
      { slot: 42, position: { x: 10, y: 10 }, fixed: true },
      { slot: 0, position: { x: 11, y: 10 }, fixed: true },
    ]);
  });

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
    expect(reduceDeployment(fixed, { type: "auto-fill", ranking: [1, 2, 4, 24] })).toBe(fixed);
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

    state = reduceDeployment(state, { type: "focus-roster", index: 8 });
    expect(state).toMatchObject({ focus: { kind: "roster", index: 8 }, lastRosterIndex: 8 });
    state = reduceDeployment(state, { type: "focus-finish" });
    expect(state.focus).toEqual({ kind: "finish" });
    state = reduceDeployment(state, { type: "select-open-cell", position: { x: 25, y: 33 } });
    expect(state).toMatchObject({
      currentOpenCell: { x: 25, y: 33 },
      focus: { kind: "map" },
    });
  });

  it("puts 自動配置 under 結束 in a wrapping two-control column", () => {
    let state = reduceDeployment(createDeploymentState(definition, roster), { type: "select-page", page: 1 });
    state = reduceDeployment(state, { type: "focus-finish" });
    expect(reduceDeployment(state, { type: "move-focus", direction: "up" }).focus)
      .toEqual({ kind: "auto-fill" });
    state = reduceDeployment(state, { type: "move-focus", direction: "down" });
    expect(state.focus).toEqual({ kind: "auto-fill" });
    expect(reduceDeployment(state, { type: "move-focus", direction: "right" })).toBe(state);
    expect(reduceDeployment(state, { type: "move-focus", direction: "down" }).focus)
      .toEqual({ kind: "finish" });
    expect(reduceDeployment(state, { type: "move-focus", direction: "up" }).focus)
      .toEqual({ kind: "finish" });
    expect(reduceDeployment(state, { type: "move-focus", direction: "left" }).focus)
      .toEqual({ kind: "page", page: 1 });
    expect(reduceDeployment(createDeploymentState(definition, roster), { type: "focus-auto-fill" }).focus)
      .toEqual({ kind: "auto-fill" });
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

describe("deployment auto-fill (自動配置)", () => {
  it("ranks career entry level, then profession level, then experience, then roster order", () => {
    expect(rankAutoFillSlots([
      { slot: 1, classId: "soldier", experience: 299 },
      { slot: 2, classId: "magician", experience: 0 },
      { slot: 3, classId: "crossbow", experience: 900 },
      { slot: 4, classId: "magic-master", experience: 0 },
      { slot: 5, classId: "magic-master", experience: 599 },
      { slot: 6, classId: "evil-mage", experience: 600 },
      { slot: 7, classId: "soldier", experience: 299 },
    ])).toEqual([6, 5, 4, 3, 2, 1, 7]);
    // Experience scales differ between careers, so the profession level decides first:
    // a level-3 water warrior outranks a level-2 crossbow holding more raw experience.
    expect(rankAutoFillSlots([
      { slot: 12, classId: "crossbow", experience: 899 },
      { slot: 10, classId: "water-warrior", experience: 720 },
    ])).toEqual([10, 12]);
  });

  it("fills from the current cell in ranking order and skips slots it may not place", () => {
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "select-open-cell", position: { x: 25, y: 33 } });
    state = reduceDeployment(state, { type: "auto-fill", ranking: [0, 99, 24, 24, 1, 2, 4] });
    expect(state.feedback).toBeUndefined();
    expect(state.placements.filter(({ fixed }) => !fixed)).toEqual([
      { slot: 24, position: { x: 25, y: 33 }, fixed: false },
      { slot: 1, position: { x: 21, y: 33 }, fixed: false },
      { slot: 2, position: { x: 23, y: 33 }, fixed: false },
    ]);
    expect(state.currentOpenCell).toBeUndefined();
    expect(() => finishDeployment(state)).not.toThrow();
  });

  it("keeps a manual pick in its cell even when it ranks last", () => {
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 4 });
    const manual = state.placements.find(({ slot }) => slot === 4);
    state = reduceDeployment(state, { type: "auto-fill", ranking: [24, 1, 2, 4] });
    expect(state.placements.find(({ slot }) => slot === 4)).toEqual(manual);
    expect(state.placements.filter(({ fixed }) => !fixed)
      .map(({ slot, position }) => `${slot}@${position.x},${position.y}`))
      .toEqual(["4@21,33", "24@23,33", "1@25,33"]);
  });

  it("answers a full screen with the native capacity text and changes nothing", () => {
    let state = createDeploymentState(definition, roster);
    state = reduceDeployment(state, { type: "auto-fill", ranking: [24, 1, 2, 4] });
    expect(state.placements).toHaveLength(definition.maximumUnits);
    const full = reduceDeployment(state, { type: "auto-fill", ranking: [24, 1, 2, 4] });
    expect(full.feedback).toBe("full");
    expect(full.placements).toBe(state.placements);
    expect(DEPLOYMENT_FEEDBACK_TEXT[full.feedback ?? "empty-slot"]).toBe("出場人數已滿.");
  });

  it("ignores a ranking that names no undeployed optional roster slot", () => {
    const state = createDeploymentState(definition, roster);
    expect(reduceDeployment(state, { type: "auto-fill", ranking: [0, 42, 99] })).toBe(state);
  });
});
