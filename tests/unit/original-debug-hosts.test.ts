import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameController } from "../../src/game/controller";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import { originalDebugHotkeyRefusal, refreshedPromotionQueue } from "../../src/game/original-debug-hosts";
import { setOriginalDebugModeEnabled } from "../../src/game/original-debug-mode";
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

/** 第 5 關的模板基線：六名我方士兵都是 299 經驗，再 +50 就達到轉職條件；開場沒有人在轉職佇列裡。 */
async function openStage5(): Promise<GameController> {
  setOriginalDebugModeEnabled(true);
  const controller = await createDebugScenarioController("stage-05-player", {
    difficulty: 0,
    rosterSource: { kind: "profile", id: "template-baseline" },
    storage,
  });
  expect(controller.battle.promotionQueue()).toEqual([]);
  return controller;
}

function unitOf(battle: Stage0Battle, id: string): BattleUnit {
  const unit = battle.unit(id);
  if (!unit) throw new Error(`missing unit ${id}`);
  return unit;
}

function place(battle: Stage0Battle, unit: BattleUnit, position: Position): void {
  const occupant = battle.unitAt(position);
  if (occupant && occupant.id !== unit.id) throw new Error(`cell ${position.x},${position.y} is taken`);
  unit.x = position.x;
  unit.y = position.y;
}

function select(controller: GameController, unit: BattleUnit): void {
  controller.selectCell({ x: unit.x, y: unit.y });
  expect(controller.actionMode).toBe("actionMenu");
}

/** 1:0 站在 (25,33)；把兩名敵兵搬到它的兩個鄰格，攻擊就停在選目標，不會自動鎖定唯一目標。 */
function enterAttackSelection(controller: GameController): [BattleUnit, BattleUnit, BattleUnit] {
  const battle = controller.battle;
  const actor = unitOf(battle, "1:0");
  const left = unitOf(battle, "2:49");
  const above = unitOf(battle, "2:48");
  place(battle, left, { x: 24, y: 33 });
  place(battle, above, { x: 25, y: 32 });
  select(controller, actor);
  controller.chooseAttack();
  expect(controller.actionMode).toBe("target");
  expect(controller.targets).toHaveLength(2);
  return [actor, left, above];
}

function chooseLifeMenu(controller: GameController, hotkey: "enemyLifeMenu" | "allyLifeMenu", index: number): void {
  expect(controller.runOriginalDebugHotkey(hotkey)).toBe(true);
  controller.selectDebugMenuItem(index);
  controller.activateDebugMenuSelection();
}

/** F2 → 我／敵 EDIT，點掉在場的單位，再按 EXIT。 */
function removeWithEdit(controller: GameController, side: 1 | 2, unitIds: readonly string[]): void {
  expect(controller.runOriginalDebugHotkey("editMenu")).toBe(true);
  controller.selectDebugMenuItem(side === 1 ? 0 : 1);
  controller.activateDebugMenuSelection();
  for (const unitId of unitIds) {
    const slot = controller.debugUnitEditorSlots.findIndex(
      (entry) => entry.state === "present" && entry.unitId === unitId,
    );
    expect(slot).toBeGreaterThanOrEqual(0);
    controller.toggleDebugUnitPresence(slot);
  }
  controller.closeDebugUnitEditor();
}

function setBehaviour(controller: GameController, value: number): void {
  expect(controller.runOriginalDebugHotkey("behaviourEditor")).toBe(true);
  controller.selectDebugBehaviourRow(value);
  controller.applyDebugBehaviourSelection();
  controller.closeDebugBehaviourEditor();
}

describe("REMAKE-174 hotkey hosts", () => {
  it("keeps keypad -, J and * on the idle battlefield and keeps the technique test off the promotion screen", () => {
    expect(originalDebugHotkeyRefusal("instantVictory", { host: "idle", inTechniqueTest: false })).toBeUndefined();
    for (const hotkey of ["lifeDown", "instantVictory", "skipToEnding"] as const) {
      expect(originalDebugHotkeyRefusal(hotkey, { host: "selection", inTechniqueTest: false }))
        .toBe("原版Debug：這個熱鍵只在我方待機時有效。");
      expect(originalDebugHotkeyRefusal(hotkey, { host: "promotion", inTechniqueTest: false })).toBeDefined();
    }
    expect(originalDebugHotkeyRefusal("techniqueAttack", { host: "selection", inTechniqueTest: false })).toBeUndefined();
    expect(originalDebugHotkeyRefusal("techniqueSupport", { host: "selection", inTechniqueTest: true }))
      .toBe("原版Debug：技術測試的選格中不能再開一次技術測試。");
    expect(originalDebugHotkeyRefusal("techniqueAttack", { host: "promotion", inTechniqueTest: false }))
      .toBe("原版Debug：轉職選擇中不能做技術測試。");
    for (const hotkey of ["behaviourEditor", "editMenu", "enemyLifeMenu", "refreshAllies", "experienceUp",
      "headacheLine", "cellReadout", "musicBox"] as const) {
      expect(originalDebugHotkeyRefusal(hotkey, { host: "promotion", inTechniqueTest: false })).toBeUndefined();
    }
  });

  it("drops units that stopped qualifying and queues newcomers last", () => {
    expect(refreshedPromotionQueue(["a", "b", "c"], ["c", "d", "a"])).toEqual(["a", "c", "d"]);
    expect(refreshedPromotionQueue(["a"], [])).toEqual([]);
  });
});

describe("REMAKE-174 hotkeys in target selection", () => {
  it("runs F3 during a move selection and keeps choosing, with the range rebuilt", async () => {
    const controller = await openStage5();
    const actor = unitOf(controller.battle, "1:0");
    select(controller, actor);
    controller.chooseMove();
    expect(controller.originalDebugHost).toBe("selection");
    chooseLifeMenu(controller, "enemyLifeMenu", 2);
    expect(controller.battle.units.filter(({ side }) => side === 2).every(({ life }) => life === 1)).toBe(true);
    expect(controller.actionMode).toBe("move");
    expect(controller.selectedUnit?.id).toBe(actor.id);
    expect(controller.reachable).toEqual(controller.battle.reachableCells(actor.id));
    expect(controller.statusMessage).toMatch(/^原版Debug：敵方 \d+ 人生命設為 1。$/u);
  });

  it("keeps the attack targets after 敵 1 and returns to the command menu once EDIT removes them", async () => {
    const controller = await openStage5();
    const [, left, above] = enterAttackSelection(controller);
    chooseLifeMenu(controller, "enemyLifeMenu", 2);
    expect(controller.actionMode).toBe("target");
    expect(controller.targets).toEqual(expect.arrayContaining([{ x: 24, y: 33 }, { x: 25, y: 32 }]));
    expect(left.life).toBe(1);

    removeWithEdit(controller, 2, [left.id, above.id]);
    expect(controller.battle.outcome()).toBe("ongoing");
    expect(controller.actionMode).toBe("actionMenu");
    expect(controller.targets).toEqual([]);
    expect(controller.statusMessage).toContain("這項行動已沒有合法目標，回到行動選單。");
  });

  it("cancels the action when EDIT takes the acting unit off the board", async () => {
    const controller = await openStage5();
    // 1:0 是妮雅，移走她就是本關的敗北條件；換一名士兵。
    const actor = unitOf(controller.battle, "1:2");
    select(controller, actor);
    controller.chooseMove();
    removeWithEdit(controller, 1, [actor.id]);
    expect(controller.actionMode).toBe("idle");
    expect(controller.selectedUnit).toBeUndefined();
    expect(controller.statusMessage).toContain("行動的單位已不在戰場，這次行動取消。");
  });

  it("refuses the departed-unit placement outside the idle battlefield", async () => {
    const controller = await openStage5();
    const actor = unitOf(controller.battle, "1:0");
    const other = unitOf(controller.battle, "1:4");
    removeWithEdit(controller, 1, [other.id]);
    select(controller, actor);
    controller.chooseMove();
    controller.runOriginalDebugHotkey("editMenu");
    controller.activateDebugMenuSelection();
    const slot = controller.debugUnitEditorSlots.findIndex(
      (entry) => entry.state === "departed" && entry.unitId === other.id,
    );
    controller.toggleDebugUnitPresence(slot);
    expect(controller.debugPlacement).toBeUndefined();
    expect(controller.debugUnitEditor).toBeDefined();
    expect(controller.statusMessage).toBe("原版Debug：放置單位要在我方待機時進行。");
    controller.closeDebugUnitEditor();
    expect(controller.actionMode).toBe("move");
    expect(controller.statusMessage).toBe("已返回選格。");
  });

  it("ends the battle at once when EDIT removes a unit the stage cannot lose", async () => {
    const controller = await openStage5();
    const nia = unitOf(controller.battle, "1:0");
    select(controller, nia);
    controller.chooseMove();
    removeWithEdit(controller, 1, [nia.id]);
    expect(controller.phase).toBe("defeat");
    expect(controller.actionMode).toBe("idle");
  });

  it("cancels an unmoved action when F1 hands the actor to the AI", async () => {
    const controller = await openStage5();
    const actor = unitOf(controller.battle, "1:0");
    select(controller, actor);
    controller.chooseMove();
    setBehaviour(controller, 1);
    expect(controller.actionMode).toBe("idle");
    expect(actor.acted).toBe(false);
    expect(controller.statusMessage).toContain("不能再由玩家指揮，這次行動取消。");
  });

  it("keeps a landed actor where it stands and ends its action when F1 takes it away mid-attack", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const actor = unitOf(battle, "1:0");
    place(battle, unitOf(battle, "2:49"), { x: 24, y: 31 });
    place(battle, unitOf(battle, "2:48"), { x: 25, y: 30 });
    select(controller, actor);
    controller.chooseMove();
    expect(controller.reachable).toContainEqual({ x: 25, y: 31 });
    controller.selectCell({ x: 25, y: 31 });
    await vi.waitFor(() => expect(controller.actionMode).toBe("actionMenu"), { timeout: 10_000 });
    expect(controller.commandMenuKind).toBe("postMove");
    controller.chooseAttack();
    expect(controller.actionMode).toBe("target");

    setBehaviour(controller, 1);
    expect(actor).toMatchObject({ x: 25, y: 31, acted: true });
    expect(controller.actionMode).toBe("idle");
    expect(controller.statusMessage).toContain("停在目前位置結束行動。");
  });

  it("holds the promotion until the selection is backed out to the idle battlefield", async () => {
    const controller = await openStage5();
    const [actor] = enterAttackSelection(controller);
    controller.cursor = { x: actor.x, y: actor.y };
    controller.runOriginalDebugHotkey("experienceUp");
    expect(actor.experience).toBe(349);
    expect(controller.battle.promotionQueue()).toEqual([actor.id]);
    expect(controller.promotionUnitIds).toEqual([]);
    expect(controller.actionMode).toBe("target");

    controller.cancelAction();
    expect(controller.actionMode).toBe("actionMenu");
    expect(controller.promotionUnitIds).toEqual([]);
    controller.cancelAction();
    expect(controller.actionMode).toBe("idle");
    expect(controller.promotionUnitIds).toEqual([actor.id]);
  });

  it("answers J with a hint in selection instead of winning", async () => {
    const controller = await openStage5();
    select(controller, unitOf(controller.battle, "1:0"));
    controller.chooseMove();
    expect(controller.runOriginalDebugHotkey("instantVictory")).toBe(true);
    expect(controller.battle.outcome()).toBe("ongoing");
    expect(controller.actionMode).toBe("move");
    expect(controller.statusMessage).toBe("原版Debug：這個熱鍵只在我方待機時有效。");
  });

  it("returns to the interrupted move selection after a nested technique test", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const actor = unitOf(battle, "1:0");
    const caster = unitOf(battle, "2:49");
    place(battle, unitOf(battle, "2:47"), { x: 20, y: 31 });
    select(controller, actor);
    controller.chooseMove();

    controller.cursor = { x: caster.x, y: caster.y };
    expect(controller.runOriginalDebugHotkey("techniqueAttack")).toBe(true);
    controller.activateDebugMenuSelection();
    controller.activateDebugMenuSelection();
    expect(controller.actionMode).toBe("specialTarget");
    expect(controller.debugTechniqueCasterId).toBe(caster.id);
    expect(controller.runOriginalDebugHotkey("techniqueSupport")).toBe(true);
    expect(controller.statusMessage).toBe("原版Debug：技術測試的選格中不能再開一次技術測試。");

    controller.cancelAction();
    expect(controller.debugTechniqueCasterId).toBeUndefined();
    expect(controller.actionMode).toBe("move");
    expect(controller.selectedUnit?.id).toBe(actor.id);
    // 游標回到按 F5 時的位置。
    expect(controller.cursor).toEqual({ x: caster.x, y: caster.y });
    expect(controller.reachable).toEqual(battle.reachableCells(actor.id));
    expect(controller.statusMessage).toBe("原版Debug：已取消技術測試。");
  });

  it("casts the nested technique test for real, then resumes the interrupted selection", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const actor = unitOf(battle, "1:0");
    const caster = unitOf(battle, "2:49");
    const victim = unitOf(battle, "2:47");
    place(battle, victim, { x: 20, y: 31 });
    select(controller, actor);
    controller.chooseMove();

    controller.cursor = { x: caster.x, y: caster.y };
    controller.runOriginalDebugHotkey("techniqueAttack");
    controller.activateDebugMenuSelection();
    controller.activateDebugMenuSelection();
    expect(controller.targets).toContainEqual({ x: victim.x, y: victim.y });
    const life = victim.life;
    controller.selectCell({ x: victim.x, y: victim.y });
    await vi.waitFor(() => expect(controller.actionMode).toBe("move"), { timeout: 30_000 });
    expect(victim.life).toBeLessThan(life);
    expect(caster.acted).toBe(true);
    expect(controller.selectedUnit?.id).toBe(actor.id);
    expect(controller.debugTechniqueCasterId).toBeUndefined();
    expect(controller.promotionUnitIds).toEqual([]);
    expect(controller.originalDebugHost).toBe("selection");
  }, 30_000);

  it("clears an enemy range preview and runs the hotkey as if idle", async () => {
    const controller = await openStage5();
    const enemy = unitOf(controller.battle, "2:49");
    controller.selectCell({ x: enemy.x, y: enemy.y });
    expect(controller.actionMode).toBe("enemyPreview");
    expect(controller.originalDebugHost).toBe("idle");
    expect(controller.runOriginalDebugHotkey("enemyLifeMenu")).toBe(true);
    expect(controller.actionMode).toBe("idle");
    expect(controller.debugMenu).toMatchObject({ kind: "life", side: 2 });
  });

  it("still refuses hotkeys inside command menus", async () => {
    const controller = await openStage5();
    select(controller, unitOf(controller.battle, "1:0"));
    expect(controller.originalDebugHost).toBeUndefined();
    expect(controller.runOriginalDebugHotkey("enemyLifeMenu")).toBe(false);
    expect(controller.debugMenu).toBeUndefined();
  });
});

describe("REMAKE-174 hotkeys on the promotion screen", () => {
  async function openPromotionChoice(): Promise<[GameController, BattleUnit]> {
    const controller = await openStage5();
    const nia = unitOf(controller.battle, "1:0");
    controller.cursor = { x: nia.x, y: nia.y };
    controller.runOriginalDebugHotkey("experienceUp");
    expect(controller.promotionUnitIds).toEqual([nia.id]);
    // 授職對白中不收。
    expect(controller.promotionDialogueActive).toBe(true);
    expect(controller.originalDebugHost).toBeUndefined();
    for (let page = 0; page < 20 && controller.promotionDialogueActive; page += 1) controller.advanceDialogue();
    expect(controller.promotionChoiceVisible).toBe(true);
    expect(controller.originalDebugHost).toBe("promotion");
    return [controller, nia];
  }

  it("layers a debug menu over the class choice and routes keys to it first", async () => {
    const [controller] = await openPromotionChoice();
    expect(controller.runOriginalDebugHotkey("enemyLifeMenu")).toBe(true);
    expect(controller.originalDebugHost).toBeUndefined();
    controller.moveCursor({ x: 0, y: 1 });
    expect(controller.debugMenu?.index).toBe(1);
    expect(controller.promotionSelectionIndex).toBe(0);
    expect(controller.secondaryAction()).toBe(true);
    expect(controller.debugMenu).toBeUndefined();
    expect(controller.promotionChoiceVisible).toBe(true);
    expect(controller.statusMessage).toBe("已返回轉職選擇。");

    expect(controller.runOriginalDebugHotkey("techniqueAttack")).toBe(true);
    expect(controller.debugMenu).toBeUndefined();
    expect(controller.statusMessage).toBe("原版Debug：轉職選擇中不能做技術測試。");
  });

  it("re-reads the queue: newcomers go last and a unit that no longer qualifies leaves it", async () => {
    const [controller, nia] = await openPromotionChoice();
    const second = unitOf(controller.battle, "1:4");
    controller.cursor = { x: second.x, y: second.y };
    controller.runOriginalDebugHotkey("experienceUp");
    expect(controller.promotionUnitIds).toEqual([nia.id, second.id]);
    expect(controller.promotionChoiceVisible).toBe(true);

    controller.cursor = { x: nia.x, y: nia.y };
    controller.runOriginalDebugHotkey("experienceDown");
    expect(nia.experience).toBe(299);
    expect(controller.promotionUnitIds).toEqual([second.id]);
    expect(controller.promotionDialogueActive).toBe(true);
    expect(nia.classId).toBe("soldier");
  });

  it("closes the promotion wait and resumes play when the last candidate drops out", async () => {
    const [controller, nia] = await openPromotionChoice();
    controller.runOriginalDebugHotkey("experienceDown");
    expect(controller.promotionUnitIds).toEqual([]);
    expect(controller.promotionChoiceVisible).toBe(false);
    await vi.waitFor(() => expect(controller.originalDebugHost).toBe("idle"));
    expect(nia.classId).toBe("soldier");
    expect(controller.phase).toBe("player");
  });

  it("defers the outcome until the class is chosen", async () => {
    const [controller, nia] = await openPromotionChoice();
    chooseLifeMenu(controller, "enemyLifeMenu", 1);
    expect(controller.battle.units.some(({ side }) => side === 2)).toBe(false);
    expect(controller.phase).toBe("player");
    expect(controller.promotionChoiceVisible).toBe(true);

    controller.confirmPromotion();
    await vi.waitFor(() => expect(controller.phase).not.toBe("player"));
    expect(nia.classId).not.toBe("soldier");
  });
});
