import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cameraFocusForOrigin, cameraOriginForFocus } from "../../src/game/camera";
import { HALF_DRAGON_TELEPORT_ACTION_ID } from "../../src/game/content/actions";
import type { GameController } from "../../src/game/controller";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { Position } from "../../src/game/types";

/**
 * The tactical minimap relocates the viewport on the neutral battlefield [OF] and,
 * since the player asked for it on 2026-09-22, while a 移動／攻擊／技術 range is being
 * picked as well [DD] — the half-dragon teleport was the case that hurt most. The
 * press-and-drag pan is the remake's own addition. Neither may touch the board.
 */

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();

// `GameController` reads its presentation preferences and URL flags as it is built.
beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const controllerFor = (id: "stage-00-player" | "stage-28-player") =>
  createDebugScenarioController(id, {
    difficulty: 0,
    rosterSource: { kind: "profile", id: "representative-growth" },
    storage,
  });

const boardSnapshot = (controller: GameController) => ({
  units: JSON.stringify(controller.battle.units),
  rng: controller.battle.rng.state,
  reachable: JSON.stringify(controller.reachable),
  targets: JSON.stringify(controller.targets),
  selectedId: controller.selectedId,
  selectedActionId: controller.selectedActionId,
  actionMode: controller.actionMode,
  focusId: controller.battle.focusId,
});

/** Runs preview → drag → commit at `cell` and checks that only camera/cursor moved. */
function relocateThroughMinimap(controller: GameController, cell: Position): void {
  const stage = controller.battle.stage;
  const expectedOrigin = cameraOriginForFocus(stage, cell);
  const before = boardSnapshot(controller);
  const cursorBefore = { ...controller.cursor };

  expect(controller.minimapAvailable).toBe(true);
  expect(controller.previewMinimapCell(cell)).toEqual(expectedOrigin);
  expect(controller.minimapPreviewOrigin).toEqual(expectedOrigin);

  // The held pointer only pans: the cursor waits for the release.
  expect(controller.dragMinimapViewport(cell)).toEqual(expectedOrigin);
  expect(controller.cameraOrigin).toEqual(expectedOrigin);
  expect(controller.cursor).toEqual(cursorBefore);
  expect(boardSnapshot(controller)).toEqual(before);

  // Releasing is the native click: focus cell = preview origin + (4,3), same clamp.
  controller.commitMinimapPreview();
  expect(controller.cameraOrigin).toEqual(expectedOrigin);
  expect(controller.cursor).toEqual(cameraFocusForOrigin(stage, expectedOrigin));
  expect(controller.minimapPreviewOrigin).toBeUndefined();
  const after = boardSnapshot(controller);
  expect({ ...after, focusId: before.focusId }).toEqual(before);
}

describe("minimap viewport relocation across action modes", () => {
  it("relocates from the neutral battlefield and refocuses the unit under the centre", async () => {
    const controller = await controllerFor("stage-00-player");
    expect(controller.actionMode).toBe("idle");

    // 妮雅 waits at (29,26): parking the viewport centre on her hands her the focus.
    relocateThroughMinimap(controller, { x: 29, y: 26 });
    expect(controller.cursor).toEqual({ x: 29, y: 26 });
    expect(controller.battle.focusId).toBe("1:0");

    // Corners clamp to the authored pan range instead of scrolling into black.
    const { originBounds } = controller.battle.stage.viewport;
    relocateThroughMinimap(controller, { x: 0, y: 0 });
    expect(controller.cameraOrigin).toEqual(originBounds.min);
    relocateThroughMinimap(controller, { x: 49, y: 49 });
    expect(controller.cameraOrigin).toEqual(originBounds.max);
  });

  it("stays live while a 移動 range is picked and leaves the selection alone", async () => {
    const controller = await controllerFor("stage-00-player");
    controller.selectCell({ x: 29, y: 26 });
    expect(controller.actionMode).toBe("actionMenu");
    // The command menu pins the cursor to the actor, so the minimap is inert there.
    expect(controller.minimapAvailable).toBe(false);
    expect(controller.previewMinimapCell({ x: 5, y: 5 })).toBeUndefined();
    expect(controller.dragMinimapViewport({ x: 5, y: 5 })).toBeUndefined();

    controller.chooseMove();
    expect(controller.actionMode).toBe("move");
    expect(controller.reachable.length).toBeGreaterThan(1);
    // `0000:8492`: the detail belongs to the unit under the focus cell, not to the
    // selection — an empty candidate cell hands the panel back to the minimap.
    expect(controller.focusedUnit?.id).toBe("1:0");
    controller.focusCell({ x: 28, y: 26 });
    expect(controller.focusedUnit).toBeUndefined();

    relocateThroughMinimap(controller, { x: 5, y: 5 });
    expect(controller.actionMode).toBe("move");
    expect(controller.selectedId).toBe("1:0");
    // The roaming cursor relocates; the story/HUD focus stays with the actor.
    expect(controller.battle.focusId).toBe("1:0");
    expect(controller.battle.unit("1:0")).toMatchObject({ x: 29, y: 26, acted: false });
  });

  it("follows the cursor onto attack targets and still answers the minimap", async () => {
    const controller = await controllerFor("stage-00-player");
    const nia = controller.battle.unit("1:0")!;
    const [left, right] = controller.battle.units.filter((unit) => unit.side === 2);
    expect(left && right).toBeTruthy();
    Object.assign(left!, { x: 28, y: 26 });
    Object.assign(right!, { x: 30, y: 26 });
    for (const unit of controller.battle.units) {
      if (unit.side === 1 && unit.id !== nia.id) unit.acted = true;
    }

    controller.selectCell({ x: 29, y: 26 });
    controller.chooseAttack();
    expect(controller.actionMode).toBe("target");
    expect(controller.targets).toHaveLength(2);
    controller.focusCell({ x: 28, y: 26 });
    expect(controller.focusedUnit?.id).toBe(left!.id);

    relocateThroughMinimap(controller, { x: 10, y: 10 });
    expect(controller.actionMode).toBe("target");
    expect(controller.targets).toHaveLength(2);
    expect(controller.battle.unit(left!.id)).toMatchObject({ life: left!.life });
  });

  it("answers the minimap while the half-dragon teleport picks its landing cell", async () => {
    // 芳／蘭／莎／倩／麗 join as half-dragon warriors and stand ready in stage 28's fixture.
    const controller = await controllerFor("stage-28-player");
    const dragon = controller.battle.units.find((unit) =>
      unit.side === 1 && unit.classId === "half-dragon-warrior" && !unit.acted);
    expect(dragon, "stage 28 fields a ready half-dragon warrior").toBeDefined();

    controller.selectCell({ x: dragon!.x, y: dragon!.y });
    expect(controller.actionMode).toBe("actionMenu");
    controller.chooseTechnique();
    expect(controller.actionMode).toBe("techniqueMenu");
    expect(controller.minimapAvailable).toBe(false);
    const teleportIndex = controller.techniqueActions.indexOf(HALF_DRAGON_TELEPORT_ACTION_ID);
    expect(teleportIndex).toBeGreaterThanOrEqual(0);
    controller.selectTechnique(teleportIndex);
    controller.activateTechniqueSelection();
    expect(controller.actionMode).toBe("specialTarget");
    expect(controller.selectedActionId).toBe(HALF_DRAGON_TELEPORT_ACTION_ID);
    expect(controller.targets.length).toBeGreaterThan(0);

    const far = controller.targets.reduce((best, cell) =>
      Math.abs(cell.x - dragon!.x) + Math.abs(cell.y - dragon!.y)
        > Math.abs(best.x - dragon!.x) + Math.abs(best.y - dragon!.y)
        ? cell
        : best);
    relocateThroughMinimap(controller, far);
    expect(controller.actionMode).toBe("specialTarget");
    expect(controller.selectedActionId).toBe(HALF_DRAGON_TELEPORT_ACTION_ID);
    expect(controller.battle.unit(dragon!.id)).toMatchObject({ x: dragon!.x, y: dragon!.y });
  });

  it("drops a stale preview instead of relocating once the minimap is gated off", async () => {
    const controller = await controllerFor("stage-00-player");
    expect(controller.previewMinimapCell({ x: 5, y: 5 })).toBeDefined();
    const cameraBefore = { ...controller.cameraOrigin };
    const cursorBefore = { ...controller.cursor };
    controller.openSystemMenu();
    expect(controller.hasBlockingOverlay).toBe(true);
    controller.minimapPreviewOrigin = { x: 1, y: 2 };
    controller.commitMinimapPreview();
    expect(controller.cameraOrigin).toEqual(cameraBefore);
    expect(controller.cursor).toEqual(cursorBefore);
    expect(controller.minimapPreviewOrigin).toBeUndefined();
  });
});
