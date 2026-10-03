import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BATTLE_ACTION_DEFINITIONS, type VirtActionId } from "../../src/game/content/actions";
import { NATIVE_DEBUG_VIRT } from "../../src/game/content/debug-mode.generated";
import type { GameController } from "../../src/game/controller";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
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

async function openStage5(): Promise<GameController> {
  setOriginalDebugModeEnabled(true);
  return createDebugScenarioController("stage-05-player", {
    difficulty: 0,
    rosterSource: { kind: "profile", id: "template-baseline" },
    storage,
  });
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

/**
 * 施法者妮雅在 (25,33)，往上一條直線：(25,32) 敵兵 B、(25,31) 我方 1:4、(25,30) 目標敵兵。
 * 只有一條最短路線，所以不必選路線。
 */
function straightLine(battle: Stage0Battle): { caster: BattleUnit; middle: BattleUnit; ally: BattleUnit; target: BattleUnit } {
  const caster = unitOf(battle, "1:0");
  const middle = unitOf(battle, "2:49");
  const ally = unitOf(battle, "1:4");
  const target = unitOf(battle, "2:48");
  place(battle, ally, { x: 22, y: 36 });
  place(battle, middle, { x: 25, y: 32 });
  place(battle, ally, { x: 25, y: 31 });
  place(battle, target, { x: 25, y: 30 });
  return { caster, middle, ally, target };
}

/** 把其他單位排到地圖下緣，空出對角的路線。 */
function moveOthersAway(battle: Stage0Battle, keep: readonly string[]): void {
  battle.units
    .filter(({ id }) => !keep.includes(id))
    .forEach((unit, index) => {
      unit.x = index;
      unit.y = battle.stage.height - 1;
    });
}

function cast(battle: Stage0Battle, actionId: VirtActionId, caster: BattleUnit, target: BattleUnit, linePath?: Position[]) {
  const prepared = battle.prepareDebugTechnique({
    actionId,
    actorId: caster.id,
    targetId: target.id,
    target: { x: target.x, y: target.y },
    ...(linePath ? { linePath } : {}),
  });
  return battle.commitPreparedDebugTechnique(prepared);
}

describe("REMAKE-174 VIRT content", () => {
  it("takes every number from module 29: seed 5, inputs 40/40/9 and kills + 13 + 0..4", () => {
    expect(NATIVE_DEBUG_VIRT.actions.map(({ code, selectionSeed, damageInput }) => [code, selectionSeed, damageInput]))
      .toEqual([["1V", 5, 40], ["2V", 5, 40], ["3V", 5, 9]]);
    expect(NATIVE_DEBUG_VIRT.experience).toEqual({ base: 13, randomMinimum: 0, randomMaximum: 4, addKillReward: true });
    expect(BATTLE_ACTION_DEFINITIONS["virt-a"]).toMatchObject({
      nativeCode: "1V",
      label: "VIRT A",
      range: { mode: 0, selectionRadius: 5 },
      damage: { type: "virt-line", input: 40 },
      presentationId: "shoot-line",
    });
    expect(BATTLE_ACTION_DEFINITIONS["virt-c"].damage.input).toBe(9);
  });
});

describe("REMAKE-174 VIRT on a real battle", () => {
  it("lets the caster pick any unit of either side in reach, but never itself", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const { caster, middle, ally, target } = straightLine(battle);
    const cells = battle.debugTechniqueTargetCells(caster.id, "virt-a");
    expect(cells).toEqual(expect.arrayContaining([
      { x: middle.x, y: middle.y },
      { x: ally.x, y: ally.y },
      { x: target.x, y: target.y },
    ]));
    expect(cells).not.toContainEqual({ x: caster.x, y: caster.y });
    expect(() => cast(battle, "virt-a", caster, caster)).toThrow("illegal debug technique");
  });

  it("deals 40 to the target and 20 to its side along the line; guard blocks a half, the other side keeps its guard", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const { caster, middle, ally, target } = straightLine(battle);
    middle.statuses.magicGuard = 3;
    ally.statuses.magicGuard = 3;
    caster.statuses.magicGuard = 3;
    const lives = { caster: caster.life, middle: middle.life, ally: ally.life, target: target.life };
    const experience = caster.experience;
    const rng = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.debugVirtLineOptions(caster.id, target.id, "virt-a").map(({ path }) => path)).toEqual([[
      { x: 25, y: 33 }, { x: 25, y: 32 }, { x: 25, y: 31 }, { x: 25, y: 30 },
    ]]);
    const result = cast(battle, "virt-a", caster, target);
    expect(target.life).toBe(lives.target - 40);
    // 防魔擋下線上的那一次並用掉；我方與施法者不在挨打那一方，生命與防魔都不動。
    expect(middle.life).toBe(lives.middle);
    expect(middle.statuses.magicGuard).toBe(0);
    expect(ally.life).toBe(lives.ally);
    expect(ally.statuses.magicGuard).toBe(3);
    expect(caster.life).toBe(lives.caster);
    expect(caster.statuses.magicGuard).toBe(3);
    expect(result.damage).toBe(40);
    expect(caster.acted).toBe(true);
    expect(caster.experience - experience).toBeGreaterThanOrEqual(13);
    expect(caster.experience - experience).toBeLessThanOrEqual(17);
    // 經驗的 0..4 是唯一一次隨機。
    expect(battle.rng.calls).toBe(rng.calls + 1);
  });

  it("deals 8 and 4 with VIRT C, the 9 the native cursor step leaves behind", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const { caster, middle, target } = straightLine(battle);
    const lives = { middle: middle.life, target: target.life };
    cast(battle, "virt-c", caster, target);
    expect(target.life).toBe(lives.target - 8);
    expect(middle.life).toBe(lives.middle - 4);
  });

  it("hits the caster's own side when the target is an ally, but spares the caster", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const caster = unitOf(battle, "1:0");
    const near = unitOf(battle, "1:4");
    const far = unitOf(battle, "1:2");
    place(battle, near, { x: 22, y: 36 });
    place(battle, far, { x: 22, y: 37 });
    place(battle, near, { x: 25, y: 32 });
    place(battle, far, { x: 25, y: 31 });
    const lives = { caster: caster.life, near: near.life, far: far.life };
    cast(battle, "virt-b", caster, far);
    expect(far.life).toBe(lives.far - 40);
    expect(near.life).toBe(lives.near - 20);
    expect(caster.life).toBe(lives.caster);
  });

  it("lists every tied route and refuses one that is not among them", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const caster = unitOf(battle, "1:0");
    const target = unitOf(battle, "2:49");
    moveOthersAway(battle, [caster.id, target.id]);
    place(battle, target, { x: caster.x + 2, y: caster.y - 2 });
    const options = battle.debugVirtLineOptions(caster.id, target.id, "virt-a");
    // 2×2 的對角：六條最短走法，全部從施法者出發、在目標結束。
    expect(options).toHaveLength(6);
    for (const { path } of options) {
      expect(path).toHaveLength(5);
      expect(path[0]).toEqual({ x: caster.x, y: caster.y });
      expect(path.at(-1)).toEqual({ x: target.x, y: target.y });
    }
    expect(() => cast(battle, "virt-a", caster, target, [
      { x: caster.x, y: caster.y },
      { x: target.x, y: target.y },
    ])).toThrow("illegal VIRT line path");
  });

  it("walks F5 → VIRT → route choice in the controller and casts the chosen route", async () => {
    const controller = await openStage5();
    const battle = controller.battle;
    const caster = unitOf(battle, "1:0");
    const target = unitOf(battle, "2:49");
    moveOthersAway(battle, [caster.id, target.id]);
    place(battle, target, { x: caster.x + 2, y: caster.y - 2 });
    // 模板基線的妮雅是 299 經驗，這一擊的 13 起跳就會轉職；這裡只看施放本身。
    caster.experience = 100;
    const life = target.life;

    controller.cursor = { x: caster.x, y: caster.y };
    expect(controller.runOriginalDebugHotkey("techniqueAttack")).toBe(true);
    controller.selectDebugMenuItem(2);
    expect(controller.debugMenuItems[2]).toMatchObject({ code: "3?", enabled: true });
    controller.activateDebugMenuSelection();
    expect(controller.debugMenuItems.map(({ label }) => label)).toEqual(["VIRT  A ", "VIRT  B ", "VIRT  C "]);
    controller.activateDebugMenuSelection();
    expect(controller.actionMode).toBe("specialTarget");
    expect(controller.statusMessage).toBe("原版Debug：選擇「VIRT A」的目標（任一方，施法者除外）。");

    controller.selectCell({ x: target.x, y: target.y });
    expect(controller.actionMode).toBe("shotRoute");
    expect(controller.magicArcherRouteOptions).toHaveLength(6);
    controller.cycleMagicArcherRoute(1);
    const chosen = controller.selectedMagicArcherRoute?.path;
    expect(controller.statusMessage).toMatch(/^原版Debug：路線 2\/6/u);
    controller.confirmMagicArcherRoute();
    // 確認後先回到待機、播完表現才提交。
    await vi.waitFor(() => expect(controller.lastSpecialAction?.actionId).toBe("virt-a"), { timeout: 30_000 });
    await vi.waitFor(() => expect(controller.originalDebugHost).toBe("idle"), { timeout: 30_000 });
    expect(target.life).toBe(life - 40);
    expect(caster.acted).toBe(true);
    expect(controller.lastSpecialAction?.effectCells.map(({ position }) => position)).toEqual(chosen);
    expect(controller.statusMessage).toBe("VIRT A對 1 名單位造成共 40 點傷害。");
  }, 30_000);
});
