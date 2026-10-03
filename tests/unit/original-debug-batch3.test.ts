import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  setBattleDataEditsSource,
  steppedDataDigit,
  withClassDataValue,
  withNativeBattleData,
  withTerrainDataValue,
  type BattleDataEdits,
} from "../../src/game/content/battle-data-edits";
import {
  classDefinition,
  classStatsFor,
  movementRulesFor,
  nextExperienceThresholdFor,
  terrainDefensePercentFor,
} from "../../src/game/content/classes";
import { NATIVE_DEBUG_CLASS_EDITOR, NATIVE_DEBUG_TERRAIN_EDITOR } from "../../src/game/content/debug-mode.generated";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { DebugScenarioId } from "../../src/game/debug-scenario-catalog";
import {
  debugClassEditorHitAt,
  debugTerrainEditorHitAt,
  hoveredDebugClassEditor,
  initialDebugClassEditor,
  isSelectableDebugTerrainSlot,
  movedDebugTerrainEditor,
  toggledDebugTerrainEditorFocus,
  initialDebugTerrainEditor,
} from "../../src/game/original-debug-data-editors";
import { originalDebugEditorAssetUrls, setOriginalDebugModeEnabled } from "../../src/game/original-debug-mode";
import { parseSaveData, savedBattleUnitMaximumLife } from "../../src/game/save";

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
  setBattleDataEditsSource(undefined);
  storage.clear();
});

// 模板基線：具名友軍停在入場經驗，關閉編輯器時的轉職掃描不會先跳出轉職選擇。
const openScenario = (id: DebugScenarioId) => createDebugScenarioController(id, {
  difficulty: 0,
  rosterSource: { kind: "profile", id: "template-baseline" },
  storage,
});

/** 只在這個測試裡生效的覆寫表；`afterEach` 撤掉來源。 */
function activate(edits: BattleDataEdits): void {
  setBattleDataEditsSource(() => edits);
}

describe("REMAKE-174 batch 3 content", () => {
  it("draws the native class editor header over the seven DATA fields", () => {
    expect(NATIVE_DEBUG_CLASS_EDITOR.header).toBe(" 經驗   攻擊   防禦   生命 移動力   魔防   經驗");
    expect(NATIVE_DEBUG_CLASS_EDITOR.fields.map(({ field }) => field)).toEqual([
      "experienceThreshold", "attack", "defense", "maxLife", "movement", "reservedField5", "level",
    ]);
    expect(NATIVE_DEBUG_CLASS_EDITOR.layout.table.columns).toEqual([120, 176, 232, 288, 344, 400, 456]);
    expect(NATIVE_DEBUG_CLASS_EDITOR.layout.table.rows).toEqual([220, 245, 270, 295, 320]);
  });

  it("names 24 strip cells, of which only the first 23 are terrain slots", () => {
    expect(NATIVE_DEBUG_TERRAIN_EDITOR.labels.map(({ label }) => label).slice(0, 4)).toEqual(["不可", "沙地", "草地", "樹林"]);
    expect(NATIVE_DEBUG_TERRAIN_EDITOR.labels[23]).toMatchObject({ label: "障礙", logicalSlot: false });
    expect(isSelectableDebugTerrainSlot(22)).toBe(true);
    expect(isSelectableDebugTerrainSlot(23)).toBe(false);
  });

  it("prepares every side-2 figure the editors list only while the switch is on", () => {
    expect(originalDebugEditorAssetUrls()).toEqual([]);
    setOriginalDebugModeEnabled(true);
    const urls = originalDebugEditorAssetUrls();
    expect(urls).toHaveLength(37);
    expect(urls).toContain("/assets/original/technique-lab/units/enemy-hand.png");
  });
});

describe("REMAKE-174 batch 3 digit editing", () => {
  it("wraps one digit without carry and recomposes the five digits in 16 bits, like 0000:1A6F..1AB5", () => {
    expect(steppedDataDigit(39, 3, 1)).toBe(49);
    expect(steppedDataDigit(39, 4, -1)).toBe(38);
    expect(steppedDataDigit(9, 4, 1)).toBe(0);
    expect(steppedDataDigit(0, 0, -1)).toBe(90_000 % 65_536);
    expect(steppedDataDigit(65_535, 0, 1)).toBe(75_535 % 65_536);
  });

  it("follows the native pointer bands and drops the edges that pick past the table", () => {
    expect(debugClassEditorHitAt({ x: 623, y: 149 })).toEqual({ record: 38 });
    expect(debugClassEditorHitAt({ x: 624, y: 10 })).toEqual({});
    expect(debugClassEditorHitAt({ x: 10, y: 150 })).toEqual({});
    // 攻擊欄：x 必須嚴格大於欄起點 176，欄內第 6 個 8 px（x = 216）原版沿用殘留的位。
    expect(debugClassEditorHitAt({ x: 177, y: 225 })).toEqual({ row: 0, column: 1, digit: 0 });
    expect(debugClassEditorHitAt({ x: 215, y: 225 })).toEqual({ row: 0, column: 1, digit: 4 });
    expect(debugClassEditorHitAt({ x: 216, y: 225 })).toEqual({ row: 0, column: 1 });
    expect(debugClassEditorHitAt({ x: 100, y: 344 })).toEqual({ row: 4 });
    expect(debugClassEditorHitAt({ x: 300, y: 345 })).toEqual({});

    expect(debugTerrainEditorHitAt({ x: 575, y: 46 })).toEqual({ slot: 23 });
    expect(debugTerrainEditorHitAt({ x: 576, y: 10 })).toEqual({});
    expect(debugTerrainEditorHitAt({ x: 10, y: 47 })).toEqual({});
    expect(debugTerrainEditorHitAt({ x: 44, y: 115 })).toEqual({ record: 0, table: "movement", digit: 0 });
    expect(debugTerrainEditorHitAt({ x: 108, y: 135 })).toEqual({ record: 1, table: "defense", digit: 1 });
    // 37..39 是空框；原版會改上一次指到的職業，複刻不選。
    expect(debugTerrainEditorHitAt({ x: 7 * 56 + 44, y: 250 + 15 })).toEqual({});
  });

  it("keeps the old marks when the pointer leaves a digit and clears them on a row change", () => {
    const onDigit = hoveredDebugClassEditor(initialDebugClassEditor(), debugClassEditorHitAt({ x: 204, y: 225 }));
    expect(onDigit).toMatchObject({ focus: "table", row: 0, column: 1, digit: 3 });
    expect(hoveredDebugClassEditor(onDigit, debugClassEditorHitAt({ x: 60, y: 225 })))
      .toMatchObject({ row: 0, column: 1, digit: 3 });
    expect(hoveredDebugClassEditor(onDigit, debugClassEditorHitAt({ x: 60, y: 250 })))
      .toMatchObject({ row: 1, column: undefined, digit: undefined });
  });

  it("walks the terrain grid digit by digit and never into the empty cells", () => {
    const grid = toggledDebugTerrainEditorFocus(initialDebugTerrainEditor());
    expect(grid).toMatchObject({ focus: "grid", highlightedRecord: 0, table: "movement", digit: 1 });
    expect(movedDebugTerrainEditor(grid, { x: 1, y: 0 })).toMatchObject({ highlightedRecord: 1, digit: 0 });
    expect(movedDebugTerrainEditor(grid, { x: 0, y: 1 })).toMatchObject({ highlightedRecord: 0, table: "defense" });
    const last = { ...grid, highlightedRecord: 36, table: "defense" as const, digit: 1 };
    expect(movedDebugTerrainEditor(last, { x: 1, y: 0 })).toBe(last);
  });
});

describe("REMAKE-174 battle data edits", () => {
  it("routes class rows through the overlay and leaves native reads untouched", () => {
    const soldier = { classId: "soldier" as const, experience: 0 };
    expect(classStatsFor(soldier).attack).toBe(39);
    activate(withClassDataValue(undefined, "soldier", 0, "attack", 49));
    expect(classStatsFor(soldier).attack).toBe(49);
    expect(withNativeBattleData(() => classStatsFor(soldier).attack)).toBe(39);
  });

  it("selects the data row in native order, stopping at the first threshold not reached", () => {
    let edits = withClassDataValue(undefined, "soldier", 1, "experienceThreshold", 500);
    edits = withClassDataValue(edits, "soldier", 2, "experienceThreshold", 200);
    activate(edits);
    const unit = { classId: "soldier" as const, experience: 300 };
    expect(classStatsFor(unit).level).toBe(1);
    expect(nextExperienceThresholdFor(unit)).toBe(500);
  });

  it("keeps derived stats legal however the rows are edited", () => {
    activate(withClassDataValue(undefined, "soldier", 0, "maxLife", 0));
    expect(classStatsFor({ classId: "soldier", experience: 0 }).maxLife).toBe(1);
    // `linear` 延續前兩行的差值：門檻相等時沒有步長可延續，生命差為負時也不低於 1。
    let edits = withClassDataValue(undefined, "soldier", 1, "experienceThreshold", 0);
    edits = withClassDataValue(edits, "soldier", 1, "maxLife", 1);
    activate(edits);
    const flat = classStatsFor({ classId: "soldier", experience: 5_000, side: 2 }, "linear");
    expect(Number.isFinite(flat.attack) && Number.isFinite(flat.maxLife)).toBe(true);
    activate(withClassDataValue(undefined, "soldier", 1, "maxLife", 1));
    expect(classStatsFor({ classId: "soldier", experience: 9_000, side: 2 }, "linear").maxLife).toBe(1);
  });

  it("reads terrain costs and defense percents through the overlay", () => {
    expect(movementRulesFor("soldier")[2]).toBe(1);
    expect(terrainDefensePercentFor("soldier", 2)).toBe(5);
    let edits = withTerrainDataValue(undefined, "soldier", "movement", 2, 99);
    edits = withTerrainDataValue(edits, "soldier", "defense", 2, 45);
    activate(edits);
    expect(movementRulesFor("soldier")[2]).toBe(99);
    expect(terrainDefensePercentFor("soldier", 2)).toBe(45);
    expect(movementRulesFor("cavalry")[2]).toBe(withNativeBattleData(() => movementRulesFor("cavalry")[2]));
    expect(() => withTerrainDataValue(undefined, "soldier", "movement", 23, 1)).toThrow();
  });
});

describe("REMAKE-174 兵種／地型 in a battle", () => {
  it("edits the current battle only: a new battle and a restored record both read native data", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 5 lacks Nia");
    const native = battle.statsFor(nia);

    controller.runOriginalDebugHotkey("editMenu");
    controller.selectDebugMenuItem(2);
    controller.activateDebugMenuSelection();
    expect(controller.debugClassEditor).toMatchObject({ shown: 0, focus: "grid" });
    // 指到妮雅的職業格再在表外按左鍵，面板換成那個職業（13 × 3 格，每格 48 × 50）。
    const record = classDefinition(nia.classId).nativeRecord;
    controller.pressDebugDataEditor({ x: (record % 13) * 48 + 20, y: Math.floor(record / 13) * 50 + 25 }, 1);
    expect(controller.debugClassEditor?.shown).toBe(record);
    const row = Math.min(native.level, 3) - 1;
    // 生命欄（第 4 欄）百位：欄起點 288，第 3 位在 +16..+23。
    controller.pressDebugDataEditor({ x: 288 + 2 * 8 + 4, y: 220 + row * 25 + 5 }, 1);
    expect(battle.statsFor(nia).maxLife).toBe(native.maxLife + 100);
    nia.life = native.maxLife + 100;
    controller.closeDebugDataEditor();
    expect(controller.debugClassEditor).toBeUndefined();
    expect(nia.life).toBe(native.maxLife + 100);

    // 存檔不帶覆寫：寫出時壓回原版上限，讀取校驗也按原版數值。
    const save = controller.createBattleSaveData();
    const saved = save.battle.units.find(({ id }) => id === nia.id);
    expect(saved?.life).toBe(native.maxLife);
    expect(saved && withNativeBattleData(() => savedBattleUnitMaximumLife(saved, battle.stage.id, 0)))
      .toBe(native.maxLife);
    expect(parseSaveData(JSON.stringify(save))?.kind).toBe("battle");
    expect(battle.statsFor(nia).maxLife).toBe(native.maxLife + 100);

    battle.restore(save.battle, save.roster);
    expect(battle.debugDataEdits).toBeUndefined();
    expect(battle.statsFor(nia).maxLife).toBe(native.maxLife);
  });

  it("clamps life to the new maximum on exit and never raises it", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const enemy = battle.units.find(({ side, classId }) => side === 2 && classId === "soldier");
    if (!enemy) throw new Error("stage 5 lacks an enemy soldier");
    const before = battle.statsFor(enemy);
    const rows = [0, 1, 2] as const;
    for (const row of rows) battle.debugEditClassData("soldier", row, "maxLife", 10);
    enemy.life = before.maxLife;
    const hurt = battle.units.find(({ side, classId, id }) => side === 2 && classId === "soldier" && id !== enemy.id);
    if (hurt) hurt.life = 5;
    expect(battle.debugClampLifeToMaximum()).toBeGreaterThan(0);
    expect(enemy.life).toBe(battle.statsFor(enemy).maxLife);
    if (hurt) expect(hurt.life).toBe(5);
  });

  it("changes the movement map at once when a terrain cost is edited", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 5 lacks Nia");
    const reach = () => battle.reachableCells(nia.id).length;
    const before = reach();
    for (let slot = 0; slot < 23; slot += 1) battle.debugEditTerrainData(nia.classId, "movement", slot, 99);
    expect(reach()).toBe(1);
    battle.debugDataEdits = undefined;
    expect(reach()).toBe(before);
  });

  it("remembers the terrain slot for the next opening in the same battle only", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    controller.runOriginalDebugHotkey("editMenu");
    controller.selectDebugMenuItem(3);
    controller.activateDebugMenuSelection();
    expect(controller.debugTerrainEditor?.terrainSlot).toBe(0);
    controller.pressDebugDataEditor({ x: 2 * 48 + 20, y: 10 }, 1);
    expect(controller.debugTerrainEditor?.terrainSlot).toBe(2);
    controller.pressDebugDataEditor({ x: 44, y: 115 }, 1);
    expect(movementRulesFor("soldier")[2]).toBe(11);
    controller.closeDebugDataEditor();

    controller.runOriginalDebugHotkey("editMenu");
    controller.selectDebugMenuItem(3);
    controller.activateDebugMenuSelection();
    expect(controller.debugTerrainEditor?.terrainSlot).toBe(2);
  });
});
