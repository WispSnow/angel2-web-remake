import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { className } from "../../src/game/content/classes";
import { DEBUG_EDITABLE_CLASS_IDS } from "../../src/game/content/debug-mode-rules";
import { allyMapUnitAsset } from "../../src/game/content/map-unit-assets";
import { initialEnemyExperience } from "../../src/game/content/stage0";
import type { GameController } from "../../src/game/controller";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { DebugScenarioId } from "../../src/game/debug-scenario-catalog";
import { debugMenuItems } from "../../src/game/original-debug-menus";
import { ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS, setOriginalDebugModeEnabled } from "../../src/game/original-debug-mode";
import { parseSaveData } from "../../src/game/save";
import { activateStagedRenderAssets, extendStagedRenderAssets } from "../../src/game/staged-render-asset-cache";
import type { Position } from "../../src/game/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();

beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", {
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  setOriginalDebugModeEnabled(false);
  storage.clear();
});

async function open(id: DebugScenarioId): Promise<GameController> {
  setOriginalDebugModeEnabled(true);
  return createDebugScenarioController(id, {
    difficulty: 0,
    rosterSource: { kind: "profile", id: "template-baseline" },
    storage,
  });
}

function openEditor(controller: GameController, side: 1 | 2): void {
  expect(controller.runOriginalDebugHotkey("editMenu")).toBe(true);
  controller.selectDebugMenuItem(side === 1 ? 0 : 1);
  controller.activateDebugMenuSelection();
  expect(controller.debugUnitEditor?.side).toBe(side);
}

function slotOf(controller: GameController, unitId: string): number {
  const slot = controller.debugUnitEditorSlots.findIndex((entry) => entry.unitId === unitId);
  expect(slot).toBeGreaterThanOrEqual(0);
  return slot;
}

/** 妮雅走得到的空格：地形對一般職業可站，也沒有單位。 */
function freeCellNearNia(controller: GameController): Position {
  const cell = controller.battle.reachableCells("1:0").find((candidate) => !controller.battle.unitAt(candidate));
  if (!cell) throw new Error("no free cell near Nia");
  return cell;
}

describe("REMAKE-174 full EDIT: bench allies", () => {
  it("puts an undeployed deployment candidate on the board past the deployment limit and keeps the save valid", async () => {
    const controller = await open("stage-05-player");
    const battle = controller.battle;
    expect(battle.debugBenchSlots).toEqual(expect.arrayContaining([21, 24]));
    expect(battle.unit("1:21")).toBeUndefined();

    openEditor(controller, 1);
    const entry = controller.debugUnitEditorSlots[21];
    expect(entry).toMatchObject({ state: "absent", placeable: true, name: "愛歐里雅" });
    // 不是本關候選的具名角色照樣列名字，但不能放。
    expect(controller.debugUnitEditorSlots[5]).toMatchObject({ state: "absent", placeable: false });
    controller.toggleDebugUnitPresence(5);
    expect(controller.debugPlacement).toBeUndefined();
    expect(controller.statusMessage).toMatch(/不是這一關的出戰候選，不能放置。$/u);

    controller.toggleDebugUnitPresence(21);
    expect(controller.debugPlacement).toEqual({ unitId: "1:21" });
    const cell = freeCellNearNia(controller);
    controller.selectCell(cell);
    const placed = battle.unit("1:21");
    expect(placed).toMatchObject({ ...cell, debugPlaced: true, acted: false, name: "愛歐里雅" });
    expect(placed?.life).toBe(placed ? battle.statsFor(placed).maxLife : -1);
    expect(controller.statusMessage).toContain("已放上戰場");
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 21)).toMatchObject({
      classId: placed?.classId,
      experience: placed?.experience,
      life: placed?.life,
    });

    // 七人超過本關六人的部署上限；EDIT 放上場的不算進去，存檔仍然有效並能讀回。
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(7);
    const save = controller.createBattleSaveData();
    expect(parseSaveData(JSON.stringify(save))?.kind).toBe("battle");
    const tampered = structuredClone(save);
    const savedPlaced = tampered.battle.units.find(({ id }) => id === "1:21");
    if (!savedPlaced) throw new Error("placed unit not saved");
    delete savedPlaced.debugPlaced;
    expect(parseSaveData(JSON.stringify(tampered))).toBeUndefined();
    battle.restore(save.battle, save.roster);
    expect(battle.unit("1:21")?.debugPlaced).toBe(true);
  });
});

describe("REMAKE-174 full EDIT: template enemies", () => {
  it("places a reinforcement that has not arrived yet with the stage's seeding, and a later story write skips it", async () => {
    const controller = await open("stage-04-player");
    const battle = controller.battle;
    expect(battle.unit("2:30")).toBeUndefined();
    openEditor(controller, 2);
    const slot = slotOf(controller, "2:30");
    expect(controller.debugUnitEditorSlots[slot]).toMatchObject({ state: "absent", placeable: true, classId: "soldier" });
    controller.toggleDebugUnitPresence(slot);
    controller.selectCell(freeCellNearNia(controller));
    const placed = battle.unit("2:30");
    expect(placed).toMatchObject({ side: 2, classId: "soldier", debugPlaced: true });
    expect(placed?.experience).toBe(initialEnemyExperience("soldier", 0));
    expect(parseSaveData(JSON.stringify(controller.createBattleSaveData()))?.kind).toBe("battle");

    // 劇情登場輪到同一槽時跳過它，不再丟出重複單位的錯誤。
    if (!placed) throw new Error("placement failed");
    expect(battle.appendStoryUnits([{ ...placed, x: 0, y: 0 }])).toEqual([]);
    expect(battle.units.filter(({ id }) => id === "2:30")).toHaveLength(1);
  });

  it("keeps the four special classes out of template placement", async () => {
    const controller = await open("stage-05-player");
    const template = controller.battle.debugTemplateEnemy({ slot: 70, classId: "dragon", name: "龍" });
    expect(controller.battle.debugPlaceUnit("2:70", { x: 25, y: 25 }, template)).toBe(false);
  });
});

describe("REMAKE-174 full EDIT: classes", () => {
  it("opens every map presentation when the switch was on at stage entry", async () => {
    const controller = await open("stage-00-player");
    const ids = new Set(controller.currentMapPresentationActionIds);
    for (const actionId of ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS) expect(ids.has(actionId)).toBe(true);
    // 技術測試因此不再受本關原有技術限制：第 0 關也能選究級落雷。
    const ranks = debugMenuItems(
      { kind: "techniqueRank", group: "attack", category: "1?", casterId: "1:0", index: 0 },
      { techniqueAvailable: (actionId) => ids.has(actionId) },
    );
    expect(ranks.every(({ enabled }) => enabled)).toBe(true);
  });

  it("downloads a class that this stage did not prepare before changing to it", async () => {
    const controller = await open("stage-00-player");
    const battle = controller.battle;
    const lease = activateStagedRenderAssets(new Map());
    try {
      const requested: string[][] = [];
      let finish: () => void = () => undefined;
      controller.setOriginalDebugAssetLoader((urls) => {
        requested.push([...urls]);
        return new Promise<void>((resolve) => {
          finish = () => {
            extendStagedRenderAssets(new Map(urls.map((url) => [url, new Uint8Array([0])])));
            resolve();
          };
        });
      });
      // 原版記錄順序裡士兵的下一個；第 0 關只備妥了士兵的升職路線，沒有它。
      const next = DEBUG_EDITABLE_CLASS_IDS[1];
      if (!next) throw new Error("missing class record 1");
      openEditor(controller, 1);
      const slot = slotOf(controller, "1:1");
      controller.stepDebugUnitClass(1, slot);
      expect(controller.debugClassLoading).toEqual({ unitId: "1:1", classId: next });
      expect(battle.unit("1:1")?.classId).toBe("soldier");
      expect(controller.statusMessage).toBe(`原版Debug：正在讀取${className(next)}的圖像……`);
      expect(requested[0]).toContain(allyMapUnitAsset(next));
      controller.stepDebugUnitClass(1, slot);
      expect(requested).toHaveLength(1);

      finish();
      await vi.waitFor(() => expect(battle.unit("1:1")?.classId).toBe(next));
      expect(controller.debugClassLoading).toBeUndefined();
      expect(controller.debugClassAvailable(1, next)).toBe(true);
    } finally {
      lease.release();
    }
  });
});
