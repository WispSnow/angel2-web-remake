import { describe, expect, it } from "vitest";
import { STAGE1_DEFINITION, STAGE1_DEPLOYMENT_PREVIEW_ROSTER } from "../../src/game/content/stage1";
import { DeploymentSession } from "../../src/game/deployment-session";

describe("deployment semantic input session", () => {
  it("uses the compact native eligible list across 15-entry pages", () => {
    const session = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    expect(Array.from({ length: 9 }, (_, index) => session.rosterSlotAt(index)))
      .toEqual([0, 1, 2, 4, 24, 40, 41, 42, 43]);
    expect(session.rosterSlotAt(9)).toBeUndefined();
    session.activatePage(1);
    expect(session.rosterSlotAt(0)).toBeUndefined();
  });

  it("pages the prepared roster rather than hidden fixed board occupants", () => {
    const definition = {
      ...STAGE1_DEFINITION.deployment,
      eligibleSlots: [99, ...STAGE1_DEFINITION.deployment.eligibleSlots],
      fixedPlacements: [
        { slot: 99, position: { x: 20, y: 20 } },
        ...STAGE1_DEFINITION.deployment.fixedPlacements,
      ],
      maximumUnits: STAGE1_DEFINITION.deployment.maximumUnits + 1,
    } as const;
    const session = new DeploymentSession(definition, STAGE1_DEPLOYMENT_PREVIEW_ROSTER);

    expect(session.rosterSlotAt(0)).toBe(0);
    expect(session.rosterSlotAt(8)).toBe(43);
    expect(session.rosterSlotAt(9)).toBeUndefined();
    expect(session.state.placements.some(({ slot }) => slot === 99)).toBe(true);
  });

  it("maps keyboard-style and pointer-style primaries through the same reducer", () => {
    const keyboard = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    keyboard.moveFocus("down");
    keyboard.primary();

    const pointer = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    pointer.activateRoster(1);

    expect(pointer.state.placements).toEqual(keyboard.state.placements);
    expect(pointer.state.focus).toEqual(keyboard.state.focus);
  });

  it("consumes the primary that dismisses feedback without action penetration", () => {
    const session = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    session.activateRoster(0);
    expect(session.state.feedback).toBe("fixed-unit");
    session.activateRoster(1);
    expect(session.state.feedback).toBeUndefined();
    expect(session.state.placements).toHaveLength(5);
    session.activateRoster(1);
    expect(session.state.placements).toHaveLength(6);
  });

  it("keeps secondary contextual to the map focus", () => {
    const session = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    session.secondary();
    expect(session.state.currentOpenCell).toEqual({ x: 21, y: 33 });
    session.focusMap();
    session.secondary();
    expect(session.state.currentOpenCell).toEqual({ x: 23, y: 33 });
    session.primary();
    expect(session.state.currentOpenCell).toEqual({ x: 21, y: 33 });
  });
});
