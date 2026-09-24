import { describe, expect, it } from "vitest";
import { STAGE1_DEFINITION, STAGE1_DEPLOYMENT_PREVIEW_ROSTER } from "../../src/game/content/stage1";
import { STAGE29_DEFINITION } from "../../src/game/content/stage29";
import { debugRosterForProfile } from "../../src/game/debug-roster-profiles";
import { DeploymentSession } from "../../src/game/deployment-session";
import { finishDeployment, rankAutoFillSlots } from "../../src/game/simulation/deployment";
import { createStage29DeploymentRoster } from "../../src/game/simulation/stage29-battle";

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

describe("deployment auto-fill session (自動配置)", () => {
  it("ranks the prepared roster and keeps the pointer and keyboard paths equal", () => {
    const pointer = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    pointer.activateAutoFill();
    // 葛蒂拉斯 is only a level-1 magician, but her career enters the native scale at
    // level 7, so she outranks the three level-3 soldiers, who then keep roster order.
    expect(pointer.state.placements.filter(({ fixed }) => !fixed)).toEqual([
      { slot: 24, position: { x: 21, y: 33 }, fixed: false },
      { slot: 1, position: { x: 23, y: 33 }, fixed: false },
      { slot: 2, position: { x: 25, y: 33 }, fixed: false },
    ]);
    expect(pointer.state.focus).toEqual({ kind: "auto-fill" });

    const keyboard = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    for (const direction of ["right", "right", "right", "right", "down"] as const) {
      keyboard.moveFocus(direction);
    }
    expect(keyboard.state.focus).toEqual({ kind: "auto-fill" });
    keyboard.primary();
    expect(keyboard.state.placements).toEqual(pointer.state.placements);
  });

  it("shows the native capacity text when full and consumes the dismissing press", () => {
    const session = new DeploymentSession(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
    );
    session.activateAutoFill();
    const filled = session.state.placements;
    session.activateAutoFill();
    expect(session.state.feedback).toBe("full");
    session.activateAutoFill();
    expect(session.state.feedback).toBeUndefined();
    expect(session.state.placements).toBe(filled);
  });

  it("fills a late 1–15 deployment with the top-ranked candidates around a manual pick", () => {
    const roster = createStage29DeploymentRoster({
      difficulty: 2,
      roster: debugRosterForProfile("representative-growth", "stage-29"),
    });
    const { deployment } = STAGE29_DEFINITION;
    const optional = new Set<number>(deployment.optionalSlots);
    const ranking = rankAutoFillSlots(roster).filter((slot) => optional.has(slot));
    const capacity = deployment.maximumUnits - deployment.fixedPlacements.length;
    expect(ranking.length).toBeGreaterThan(capacity);

    const session = new DeploymentSession(deployment, roster);
    session.activateAutoFill();
    expect(session.state.placements.filter(({ fixed }) => !fixed)).toEqual(
      ranking.slice(0, capacity).map((slot, index) => ({
        slot,
        position: deployment.openCells[index],
        fixed: false,
      })),
    );
    expect(() => finishDeployment(session.state)).not.toThrow();

    // The player's own pick is outside the candidate pool: the lowest-ranked unit
    // keeps its cell and the rest of the cap goes to the best of everyone else.
    const lowest = ranking.at(-1);
    if (lowest === undefined) throw new Error("stage 29 must offer optional units");
    const picked = new DeploymentSession(deployment, roster);
    const rosterIndex = picked.state.rosterSlots.indexOf(lowest);
    picked.activatePage(Math.floor(rosterIndex / 15) as 0 | 1 | 2);
    picked.activateRoster(rosterIndex % 15);
    picked.activateAutoFill();
    expect(picked.state.placements.filter(({ fixed }) => !fixed).map(({ slot }) => slot))
      .toEqual([lowest, ...ranking.slice(0, capacity - 1)]);
    expect(picked.state.placements.find(({ slot }) => slot === lowest)?.position)
      .toEqual(deployment.openCells[0]);
  });
});
