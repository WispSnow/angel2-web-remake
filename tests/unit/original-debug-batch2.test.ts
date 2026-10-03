import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BATTLE_ACTION_DEFINITIONS } from "../../src/game/content/actions";
import { classIdFromNativeRecord, className } from "../../src/game/content/classes";
import {
  DEBUG_AI_BEHAVIOUR_VALUES,
  DEBUG_EDITABLE_CLASS_IDS,
  DEBUG_TECHNIQUE_ACTION_IDS,
} from "../../src/game/content/debug-mode-rules";
import {
  NATIVE_DEBUG_BEHAVIOUR_EDITOR,
  NATIVE_DEBUG_EDIT_MENU,
  NATIVE_DEBUG_TECHNIQUE_MENUS,
  NATIVE_DEBUG_UNIT_EDITOR,
} from "../../src/game/content/debug-mode.generated";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { DebugScenarioId } from "../../src/game/debug-scenario-catalog";
import { debugMenuItems } from "../../src/game/original-debug-menus";
import {
  debugEditorSlotAt,
  steppedDebugBehaviour,
  steppedDebugClass,
} from "../../src/game/original-debug-editor";
import { setOriginalDebugModeEnabled } from "../../src/game/original-debug-mode";
import { parseSaveData } from "../../src/game/save";
import type { Stage0Battle } from "../../src/game/simulation/battle";
import type { BattleUnit, Position } from "../../src/game/types";

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

const openScenario = (id: DebugScenarioId) => createDebugScenarioController(id, {
  difficulty: 0,
  rosterSource: { kind: "profile", id: "representative-growth" },
  storage,
});

const rngOf = (battle: Stage0Battle) => ({ state: battle.rng.state, calls: battle.rng.calls });

/** 把單位搬到指定格；先把佔著格子的其他單位挪到地圖角落外的空位。 */
function place(battle: Stage0Battle, unit: BattleUnit, position: Position): void {
  const occupant = battle.unitAt(position);
  if (occupant && occupant.id !== unit.id) throw new Error(`cell ${position.x},${position.y} is taken`);
  unit.x = position.x;
  unit.y = position.y;
}

describe("REMAKE-174 batch 2 content", () => {
  it("names the 13 behaviours and lets the pointer reach only 0..11, like 0000:23D7", () => {
    expect(NATIVE_DEBUG_BEHAVIOUR_EDITOR.labels.map(({ label }) => label)).toEqual([
      "正常", "原地", "可視", "帶 1", "跟 1", "帶 2", "跟 2", "帶 3", "跟 3", "帶 4", "跟 4", "正 1", "目地",
    ]);
    expect(DEBUG_AI_BEHAVIOUR_VALUES).toEqual(Array.from({ length: 12 }, (_, value) => value));
    expect(NATIVE_DEBUG_BEHAVIOUR_EDITOR.layout.panel).toMatchObject({ x: 80, y: 50, width: 120, height: 270 });
    expect(NATIVE_DEBUG_BEHAVIOUR_EDITOR.layout.labels).toEqual({ x: 137, y: 57, pitch: 20, ink: 15, currentInk: 11 });
  });

  it("keeps the F2/F5/F6 menus and the 治療／生命全 swap, and opens all 31 technique codes", () => {
    expect(NATIVE_DEBUG_EDIT_MENU.items.map(({ code, label, target }) => [code, label, target])).toEqual([
      ["1D", "我  EDIT", "allyUnitEditor"],
      ["2D", "敵  EDIT", "enemyUnitEditor"],
      ["3D", "兵    種", "classDataEditor"],
      ["4D", "地    型", "terrainDataEditor"],
    ]);
    expect(NATIVE_DEBUG_TECHNIQUE_MENUS.attack.items.map(({ label }) => label))
      .toEqual(["落 雷", "炎 暴", "VIRT ", "冰 雪"]);
    expect(NATIVE_DEBUG_TECHNIQUE_MENUS.support.items[0]).toMatchObject({ code: "5?", label: "治 療" });
    expect(NATIVE_DEBUG_TECHNIQUE_MENUS.support.items[0].ranks.map(({ code }) => code)).toEqual(["1I", "2I", "3I"]);
    expect(NATIVE_DEBUG_TECHNIQUE_MENUS.support.items[1].ranks.map(({ code }) => code)).toEqual(["1H", "2H", "3H"]);
    // VIRT（`1V/2V/3V`）自 2026-10-03 起也有複刻動作（`original-debug-virt.test.ts`）。
    expect(DEBUG_TECHNIQUE_ACTION_IDS).toHaveLength(31);
    expect(debugMenuItems({ kind: "technique", group: "attack", casterId: "x", index: 0 })
      .map(({ enabled }) => enabled)).toEqual([true, true, true, true]);
    expect(debugMenuItems({ kind: "techniqueRank", group: "attack", category: "3?", casterId: "x", index: 0 })
      .map(({ code, enabled }) => [code, enabled])).toEqual([["1V", true], ["2V", true], ["3V", true]]);
    // 第三批起兵種／地型也開放（`original-debug-batch3.test.ts`）。
    expect(debugMenuItems({ kind: "edit", index: 0 }).map(({ enabled }) => enabled))
      .toEqual([true, true, true, true]);
    // 本關沒預載演出的技術列出但不可選。
    expect(debugMenuItems(
      { kind: "techniqueRank", group: "attack", category: "1?", casterId: "x", index: 0 },
      { techniqueAvailable: (actionId) => actionId === "lightning-4" },
    ).map(({ enabled }) => enabled)).toEqual([false, false, false, true]);
  });

  it("lays the EDIT page out column-major from the native rectangles", () => {
    expect(NATIVE_DEBUG_UNIT_EDITOR.layout.grid).toMatchObject({ x: 8, xStep: 184, columns: 3, y: 10, yStep: 60, rows: 5 });
    expect(NATIVE_DEBUG_UNIT_EDITOR.layout.background).toMatchObject({ width: 640, height: 350, colour: 8 });
    expect(NATIVE_DEBUG_UNIT_EDITOR.layout.name).toMatchObject({
      dx: 72, dy: 27, present: { ink: 0, outline: 8 }, absent: { ink: 15, outline: 0 },
    });
    expect(NATIVE_DEBUG_UNIT_EDITOR.exitLabel).toBe("EXIT");
    expect(debugEditorSlotAt(0, 0, 4)).toBe(4);
    expect(debugEditorSlotAt(0, 1, 0)).toBe(5);
    expect(debugEditorSlotAt(3, 2, 4)).toBe(59);
  });

  it("opens only the 35 ordinary class records to EDIT and steps them without wrapping", () => {
    expect(DEBUG_EDITABLE_CLASS_IDS).toEqual(Array.from({ length: 35 }, (_, record) => classIdFromNativeRecord(record)));
    for (const special of ["empress", "dragon", "head", "hand"] as const) {
      expect(DEBUG_EDITABLE_CLASS_IDS).not.toContain(special);
    }
    expect(steppedDebugClass("soldier", -1, () => true)).toBe("soldier");
    expect(steppedDebugClass("soldier", 1, () => true)).toBe("magic-sword-warrior");
    expect(steppedDebugClass("soldier", 1, (classId) => classId === "archer")).toBe("archer");
    expect(steppedDebugClass("engineer", 1, () => true)).toBe("engineer");
    expect(steppedDebugBehaviour(0, -1)).toBe(0);
    expect(steppedDebugBehaviour(11, 1)).toBe(11);
    expect(steppedDebugBehaviour(3, 1)).toBe(4);
  });
});

describe("REMAKE-174 F1 behaviour override", () => {
  it("overrides an enemy's behaviour without touching the PRNG and wins over the stage's own rule", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-14-player");
    const battle = controller.battle;
    const enemy = battle.units.find((unit) => unit.side === 2 && !battle.debugAiBehaviorLock(unit.id));
    if (!enemy) throw new Error("stage 14 has no editable enemy");
    const rng = rngOf(battle);
    controller.cursor = { x: enemy.x, y: enemy.y };
    expect(controller.runOriginalDebugHotkey("behaviourEditor")).toBe(true);
    expect(controller.debugBehaviourEditor?.unitId).toBe(enemy.id);
    controller.selectDebugBehaviourRow(1);
    controller.applyDebugBehaviourSelection();
    expect(battle.enemyBehaviorFor(enemy.id)).toBe(1);
    // 第 14 關自第 6 回合起把敵方行為讀成 0；除錯覆寫照樣優先。
    battle.round = 6;
    expect(battle.enemyBehaviorFor(enemy.id)).toBe(1);
    expect(rngOf(battle)).toEqual(rng);
    controller.closeDebugBehaviourEditor();
    expect(controller.debugBehaviourEditor).toBeUndefined();
  });

  it("hands a player unit to the automatic phase and back, as the native per-slot word does", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const ally = battle.units.find((unit) => battle.isPlayerControllableAlly(unit.id));
    if (!ally) throw new Error("stage 5 has no controllable ally");
    expect(battle.debugSetAiBehavior(ally.id, 2)).toBe(true);
    expect(battle.isPlayerControllableAlly(ally.id)).toBe(false);
    expect(battle.isNpcAlly(ally.id)).toBe(true);
    expect(battle.alliedBehaviorFor(ally.id)).toBe(2);
    expect(battle.debugSetAiBehavior(ally.id, 0)).toBe(true);
    expect(battle.isPlayerControllableAlly(ally.id)).toBe(true);
    expect(battle.isNpcAlly(ally.id)).toBe(false);
    // 原版指標點不到「目地」（12）。
    expect(battle.debugSetAiBehavior(ally.id, 12)).toBe(false);
  });

  it("takes an independent force member under player command when set to 正常", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-03-player");
    const battle = controller.battle;
    const npc = battle.units.find((unit) => battle.isNpcAlly(unit.id) && !battle.debugAiBehaviorLock(unit.id));
    if (!npc) throw new Error("stage 3 has no automatic ally");
    expect(battle.isPlayerControllableAlly(npc.id)).toBe(false);
    battle.debugSetAiBehavior(npc.id, 0);
    expect(battle.isPlayerControllableAlly(npc.id)).toBe(true);
  });

  it("locks scripted actors: stage 0's route enemies cannot be edited", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!enemy) throw new Error("stage 0 has no enemy");
    expect(controller.battle.debugAiBehaviorLock(enemy.id)).toBe("scripted");
    controller.cursor = { x: enemy.x, y: enemy.y };
    controller.runOriginalDebugHotkey("behaviourEditor");
    expect(controller.debugBehaviourEditor).toBeUndefined();
    expect(controller.statusMessage).toContain("依劇情行動");
  });
});

describe("REMAKE-174 F5/F6 technique test", () => {
  it("lets any unit cast with absolute sides: an enemy's lightning hits its own side but never itself", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const ally = battle.units.find(({ side }) => side === 1);
    const [caster, victim] = battle.units.filter(({ side }) => side === 2);
    if (!ally || !caster || !victim) throw new Error("stage 5 lacks units");
    place(battle, caster, { x: ally.x, y: ally.y - 2 });
    place(battle, victim, { x: ally.x, y: ally.y - 3 });
    caster.acted = true;
    caster.statuses.techniqueSeal = 3;

    const targets = battle.debugTechniqueTargetCells(caster.id, "lightning-1");
    expect(targets).toContainEqual({ x: victim.x, y: victim.y });
    expect(targets).not.toContainEqual({ x: caster.x, y: caster.y });
    expect(targets.every((cell) => battle.unitAt(cell)?.side === 2)).toBe(true);
    // 一般施法仍然擋下沒有這項技術的職業。
    expect(() => battle.prepareSpecialAction({
      actionId: "lightning-1",
      actorId: caster.id,
      targetId: victim.id,
      target: { x: victim.x, y: victim.y },
    })).toThrow("illegal special action");

    const rng = rngOf(battle);
    const prepared = battle.prepareDebugTechnique({
      actionId: "lightning-1",
      actorId: caster.id,
      targetId: victim.id,
      target: { x: victim.x, y: victim.y },
    });
    const affected = prepared.affectedUnits.map(({ unitId }) => battle.unit(unitId));
    expect(affected.every((unit) => unit?.side === 2)).toBe(true);
    expect(prepared.affectedUnits.map(({ unitId }) => unitId)).not.toContain(caster.id);
    expect(prepared.affectedUnits.map(({ unitId }) => unitId)).toContain(victim.id);
    // 除錯準備的物件不能走一般提交。
    expect(() => battle.commitPreparedAction(prepared)).toThrow("stale prepared special action");
    battle.commitPreparedDebugTechnique(prepared);
    expect(rngOf(battle)).not.toEqual(rng);
    expect(caster.acted).toBe(true);
  });

  it("heals the player's side even when an enemy casts recovery", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const ally = battle.units.find(({ side }) => side === 1);
    const caster = battle.units.find(({ side }) => side === 2);
    if (!ally || !caster) throw new Error("stage 5 lacks units");
    place(battle, caster, { x: ally.x, y: ally.y - 2 });
    ally.life = 10;
    const targets = battle.debugTechniqueTargetCells(caster.id, "recovery-1");
    expect(targets).toContainEqual({ x: ally.x, y: ally.y });
    expect(targets.every((cell) => battle.unitAt(cell)?.side === 1)).toBe(true);
    const prepared = battle.prepareDebugTechnique({
      actionId: "recovery-1",
      actorId: caster.id,
      targetId: ally.id,
      target: { x: ally.x, y: ally.y },
    });
    expect(prepared.affectedUnits.every(({ unitId }) => battle.unit(unitId)?.side === 1)).toBe(true);
    battle.commitPreparedDebugTechnique(prepared);
    expect(ally.life).toBeGreaterThan(10);
  });

  it("walks F5 → 落 雷 → rank into target selection and cancels straight back to the battlefield", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const ally = battle.units.find(({ side }) => side === 1);
    const enemy = battle.units.find(({ side }) => side === 2);
    if (!ally || !enemy) throw new Error("stage 5 lacks units");
    place(battle, enemy, { x: ally.x, y: ally.y - 2 });
    controller.cursor = { x: ally.x, y: ally.y };
    expect(controller.runOriginalDebugHotkey("techniqueAttack")).toBe(true);
    expect(controller.debugMenu).toMatchObject({ kind: "technique", casterId: ally.id, index: 0 });
    controller.activateDebugMenuSelection();
    expect(controller.debugMenu).toMatchObject({ kind: "techniqueRank", category: "1?" });
    controller.activateDebugMenuSelection();
    expect(controller.actionMode).toBe("specialTarget");
    expect(controller.selectedActionId).toBe("lightning-1");
    expect(controller.targets).toContainEqual({ x: enemy.x, y: enemy.y });
    controller.cancelAction();
    expect(controller.actionMode).toBe("idle");
    expect(controller.debugTechniqueCasterId).toBeUndefined();
    expect(controller.statusMessage).toBe("原版Debug：已取消技術測試。");
  });

  it("casts prayer from a unit that is not a prayer guide", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const soldier = battle.units.find((unit) => unit.side === 1 && unit.classId !== "prayer-guide");
    if (!soldier) throw new Error("stage 5 lacks a soldier");
    const prepared = battle.prepareDebugTechnique({ actionId: "prayer", actorId: soldier.id });
    prepared.affectedUnits.forEach((_, index) => battle.commitPreparedPrayerOutcome(prepared, index));
    battle.completePreparedPrayer(prepared);
    expect(soldier.acted).toBe(true);
    expect(BATTLE_ACTION_DEFINITIONS.prayer.target).toBe("self-area");
  });
});

describe("REMAKE-174 我／敵 EDIT", () => {
  it("removes a unit without a death, lists it as departed and puts it back only on a free cell", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const ally = battle.units.find(({ side, slot }) => side === 1 && slot === 1);
    const blocker = battle.units.find(({ side, id }) => side === 1 && id !== "1:1");
    if (!ally || !blocker) throw new Error("stage 5 lacks allies");
    const origin = { x: ally.x, y: ally.y };
    const rng = rngOf(battle);

    controller.runOriginalDebugHotkey("editMenu");
    controller.activateDebugMenuSelection();
    expect(controller.debugUnitEditor).toEqual({ side: 1, page: 0, slotIndex: 0 });
    expect(controller.debugUnitEditorSlots[1]).toMatchObject({ state: "present", unitId: "1:1" });
    controller.toggleDebugUnitPresence(1);
    expect(battle.unit("1:1")).toBeUndefined();
    expect(controller.debugUnitEditorSlots[1]).toMatchObject({ state: "departed" });
    expect(battle.debugDepartedUnitIds).toContain("1:1");

    controller.toggleDebugUnitPresence(1);
    expect(controller.debugUnitEditor).toBeUndefined();
    expect(controller.debugPlacement).toEqual({ unitId: "1:1" });
    controller.selectCell({ x: blocker.x, y: blocker.y });
    expect(battle.unit("1:1")).toBeUndefined();
    controller.selectCell(origin);
    const placed = battle.unit("1:1");
    expect(placed).toMatchObject({ x: origin.x, y: origin.y, acted: false, actionDisabled: false });
    expect(placed?.life).toBe(placed ? battle.statsFor(placed).maxLife : -1);
    expect(controller.debugPlacement).toBeUndefined();
    expect(rngOf(battle)).toEqual(rng);
  });

  it("changes a class, caps life, marks the unit and keeps the save loadable", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    const enemy = battle.units.find(({ side, classId }) => side === 2 && classId === "soldier");
    if (!enemy) throw new Error("stage 5 lacks an enemy soldier");
    enemy.life = 9999;
    expect(battle.debugSetUnitClass(enemy.id, "magician")).toBe(true);
    expect(enemy).toMatchObject({ classId: "magician", className: className("magician"), debugClassEdit: true });
    expect(enemy.life).toBe(battle.statsFor(enemy).maxLife);
    expect(battle.debugSetUnitClass(enemy.id, "dragon")).toBe(false);

    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 5 lacks Nia");
    battle.debugSetUnitClass(nia.id, "archer");
    nia.experience = 0;
    battle.debugSetUnitClass(nia.id, "soldier");
    // 第 0／1 槽的士兵要守住模組 27 的 299 入場下限，否則之後每一份存檔都讀不回來。
    expect(nia.experience).toBe(299);
    battle.debugSetAiBehavior(enemy.id, 1);

    const save = controller.createBattleSaveData();
    const parsed = parseSaveData(JSON.stringify(save));
    expect(parsed?.kind).toBe("battle");
    const restoredEnemy = parsed?.kind === "battle"
      ? parsed.battle.units.find(({ id }) => id === enemy.id)
      : undefined;
    expect(restoredEnemy).toMatchObject({ classId: "magician", debugClassEdit: true, debugAiBehavior: 1 });

    const tampered = structuredClone(save);
    const tamperedEnemy = tampered.battle.units.find(({ id }) => id === enemy.id);
    if (!tamperedEnemy) throw new Error("save lost the edited enemy");
    tamperedEnemy.debugAiBehavior = 12;
    expect(parseSaveData(JSON.stringify(tampered))).toBeUndefined();
    tamperedEnemy.debugAiBehavior = 1;
    delete tamperedEnemy.debugClassEdit;
    expect(parseSaveData(JSON.stringify(tampered))).toBeUndefined();
  });

  it("refuses class edits that would break a stage script", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-30-player");
    expect(controller.battle.debugClassEditLock("2:27")).toBe("scripted");
  });

  it("migrates v127 saves by identity", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const current = controller.createBattleSaveData();
    expect(parseSaveData(JSON.stringify({
      ...current,
      version: 127,
      contentVersion: "approach-reach-keep-out-1",
    }))).toEqual(current);
  });
});

describe("REMAKE-174 Caps Lock+1 range readout", () => {
  it("shows the neutral all-1 map while idle and the movement remainder while choosing a move", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-05-player");
    const battle = controller.battle;
    controller.setDebugRangeReadoutHeld(true);
    const idle = controller.visibleDebugRangeReadout;
    expect(idle?.values).toHaveLength(70);
    expect(new Set(idle?.values)).toEqual(new Set([1]));

    const unit = battle.units.find((candidate) => battle.isPlayerControllableAlly(candidate.id));
    if (!unit) throw new Error("stage 5 lacks a controllable ally");
    const values = battle.movementRangeValues(unit.id);
    expect(values?.valueAt(unit)).toBe(battle.statsFor(unit).movement);
    controller.setDebugRangeReadoutHeld(false);
    expect(controller.visibleDebugRangeReadout).toBeUndefined();
  });
});
