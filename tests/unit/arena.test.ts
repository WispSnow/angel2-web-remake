import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARENA_CLASS_IDS,
  ARENA_MAP,
  ARENA_TERRAIN_SLOTS,
  ArenaSession,
  arenaAllyMapAsset,
  arenaClassCanStandAt,
  arenaEnemyMapAsset,
  arenaExperienceForLevel,
  arenaTerrainSlotAt,
} from "../../src/game/arena-session";
import { BATTLE_ACTION_DEFINITIONS } from "../../src/game/content/actions";
import { CLASS_IDS, classDefinition, classStatsFor } from "../../src/game/content/classes";
import { TECHNIQUE_LAB_CATALOG } from "../../src/game/content/technique-lab.generated";
import {
  ArenaBattle,
  createArenaRuntime,
} from "../../src/game/simulation/arena-battle";
import type { BattleActionId } from "../../src/game/simulation/actions/types";
import { DeterministicRng } from "../../src/game/simulation/rng";
import nativeTechniqueRules from "../../reverse/parsed/native/technique-rules.json";

describe("all-terrain arena", () => {
  it("keeps all 33 native menu techniques connected across evidence, rules, arena, and lab", () => {
    const placements = new ArenaSession().state.units;
    new ArenaBattle(placements, 0);
    const runtime = createArenaRuntime(placements);
    const nativeCodes = nativeTechniqueRules.techniqueMenu.uniqueVisibleActionCodes;

    expect(nativeCodes).toHaveLength(33);
    expect(TECHNIQUE_LAB_CATALOG.map(({ nativeCode }) => nativeCode)).toEqual(nativeCodes);
    expect(TECHNIQUE_LAB_CATALOG.every(({ implementationId }) => implementationId !== null))
      .toBe(true);

    for (const { nativeCode, implementationId } of TECHNIQUE_LAB_CATALOG) {
      expect(implementationId, `${nativeCode}: laboratory implementation`).not.toBeNull();
      const actionId = implementationId as BattleActionId;
      expect(BATTLE_ACTION_DEFINITIONS[actionId]?.nativeCode, `${nativeCode}: formal rule action`)
        .toBe(nativeCode);
      expect(runtime.mapPresentationActionIds, `${nativeCode}: formal Phaser presentation`)
        .toContain(actionId);
    }
  });

  it("exposes each integrated map class on both sides with real assets", () => {
    expect(ARENA_CLASS_IDS).toEqual(
      CLASS_IDS.filter((classId) => classDefinition(classId).recordKind === "ordinary_catalog"),
    );
    expect(ARENA_CLASS_IDS).toHaveLength(35);
    for (const classId of ARENA_CLASS_IDS) {
      const sources = [arenaAllyMapAsset(classId), arenaEnemyMapAsset(classId)];
      for (const source of sources) {
        const file = path.resolve("public", source.replace(/^\/assets\//, "assets/"));
        expect(fs.statSync(file).size, `${classId}: ${source}`).toBeGreaterThan(0);
      }
    }
  });

  it("covers the common outdoor terrain set inside the editable rectangle", () => {
    const slots = new Set<number>();
    for (let y = ARENA_MAP.bounds.min.y; y <= ARENA_MAP.bounds.max.y; y += 1) {
      for (let x = ARENA_MAP.bounds.min.x; x <= ARENA_MAP.bounds.max.x; x += 1) {
        slots.add(arenaTerrainSlotAt(x, y));
      }
    }
    expect([...ARENA_TERRAIN_SLOTS].every((slot) => slots.has(slot))).toBe(true);
  });

  it("uses class movement rules when placing, and replaces occupied cells deterministically", () => {
    const session = new ArenaSession();
    expect(arenaTerrainSlotAt(14, 14)).toBe(12);
    expect(arenaClassCanStandAt("soldier", 14, 14)).toBe(false);
    expect(session.interact(14, 14)).toEqual({
      ok: false,
      reason: "士兵不能站在這種地形上。",
    });

    session.setSide(2);
    session.setClass("magician");
    session.setLevel(2);
    expect(session.interact(14, 13)).toEqual({ ok: true });
    expect(session.state.units.find(({ x, y }) => x === 14 && y === 13)).toMatchObject({
      side: 2,
      classId: "magician",
      level: 2,
    });

    session.setSide(1);
    session.setClass("warrior");
    session.setLevel(3);
    expect(session.interact(14, 13)).toEqual({ ok: true });
    expect(session.state.units.filter(({ x, y }) => x === 14 && y === 13)).toEqual([
      expect.objectContaining({ side: 1, classId: "warrior", level: 3 }),
    ]);
  });

  it("requires both sides before starting", () => {
    const session = new ArenaSession();
    expect(session.validationMessage()).toBeUndefined();
    session.clear();
    expect(session.validationMessage()).toBe("至少放置一名我方單位。");
    session.setSide(1);
    expect(session.interact(14, 13).ok).toBe(true);
    expect(session.validationMessage()).toBe("至少放置一名敵方單位。");
  });

  it("builds a deterministic formal-rule battle from the editor state", () => {
    const session = new ArenaSession();
    const placements = session.state.units;
    const battle = new ArenaBattle(placements, 2);
    expect(battle.stage).toMatchObject({
      name: "全地形競技場",
      contentIdentity: "arena-lab/common-terrain-1",
    });
    expect(battle.outcome()).toBe("ongoing");
    expect(battle.units).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 1)
      .every(({ id }) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.groupCommander?.id).toBe("arena-1-0");
    for (const unit of battle.units) {
      expect(unit.life).toBe(battle.statsFor(unit).maxLife);
    }
    const archer = battle.unit("arena-1-1");
    expect(archer?.experience).toBe(arenaExperienceForLevel("archer", 3));
    expect(archer && classStatsFor(archer).level).toBe(3);

    battle.units = battle.units.filter(({ side }) => side === 1);
    expect(battle.outcome()).toBe("victory");
  });

  it("resolves omitted portraits from each unit's class and side", () => {
    const battle = new ArenaBattle([
      { id: "arena-1-0", side: 1, slot: 0, classId: "archer", level: 1, x: 20, y: 30 },
      { id: "arena-2-0", side: 2, slot: 0, classId: "archer", level: 1, x: 21, y: 30 },
      { id: "arena-1-1", side: 1, slot: 1, classId: "water-warrior", level: 1, x: 20, y: 31 },
      { id: "arena-2-1", side: 2, slot: 1, classId: "half-dragon-warrior", level: 1, x: 21, y: 31 },
      { id: "arena-1-2", side: 1, slot: 2, classId: "warrior", level: 1, portrait: 46, x: 20, y: 32 },
    ], 0);

    expect(Object.fromEntries(battle.units.map(({ id, portrait }) => [id, portrait]))).toEqual({
      "arena-1-0": 59,
      "arena-2-0": 60,
      "arena-1-1": 51,
      "arena-2-1": 64,
      "arena-1-2": 46,
    });
  });

  it("applies an evil sword warrior's ordinary confusion hit in the arena", () => {
    const battle = new ArenaBattle([
      { id: "arena-1-0", side: 1, slot: 0, classId: "evil-sword-warrior", level: 1, x: 20, y: 30 },
      { id: "arena-2-0", side: 2, slot: 0, classId: "soldier", level: 1, x: 21, y: 30 },
    ], 0);

    const result = battle.attack("arena-1-0", "arena-2-0");

    expect(result.defenderDied).toBe(false);
    expect(battle.unit("arena-2-0")?.statuses.confusion).toBe(3);
    expect(battle.unit("arena-1-0")?.name).toBe(battle.unit("arena-1-0")?.className);
  });

  it("provides a memory-only runtime with enemy sprites for the chosen roster", () => {
    const session = new ArenaSession();
    const runtime = createArenaRuntime(session.state.units);
    expect(runtime.entry.phase).toBe("player");
    expect(runtime.assets?.map).toBe(ARENA_MAP.source);
    expect(runtime.assets?.unitSprites).toMatchObject({
      "enemy-soldier": arenaEnemyMapAsset("soldier"),
      "enemy-archer": arenaEnemyMapAsset("archer"),
      "enemy-cavalry": arenaEnemyMapAsset("cavalry"),
      "enemy-sister": arenaEnemyMapAsset("sister"),
    });
    expect(runtime.mapPresentationActionIds).toContain("dispel");
    expect(runtime.mapPresentationActionIds).toContain("stomp-1");
    expect(runtime.mapPresentationActionIds).toContain("stomp-2");
    expect(runtime.mapPresentationActionIds).toContain("stomp-3");
    expect(runtime.mapPresentationActionIds).toContain("iron-plate");
    expect(runtime.mapPresentationActionIds).toContain("obstacle");
    expect(runtime.mapPresentationActionIds).toContain("ice-2");
    expect(runtime.mapPresentationActionIds).toContain("ice-3");
    expect(runtime.mapPresentationActionIds).toContain("ice-4");
    expect(runtime.mapPresentationActionIds).toContain("fire-2");
    expect(runtime.mapPresentationActionIds).toContain("fire-3");
    expect(runtime.mapPresentationActionIds).toContain("fire-4");
    expect(runtime.mapPresentationActionIds).toContain("heal-2");
    expect(runtime.mapPresentationActionIds).toContain("heal-3");
    expect(runtime.mapPresentationActionIds).toContain("recovery-2");
    expect(runtime.mapPresentationActionIds).toContain("recovery-3");
    expect(runtime.mapPresentationActionIds).toContain("attack-up");
    expect(runtime.mapPresentationActionIds).toContain("attack-down");
    expect(runtime.mapPresentationActionIds).toContain("defense-down");
    expect(runtime.mapPresentationActionIds).toContain("spell-seal");
    expect(runtime.mapPresentationActionIds).toContain("magic-guard");
    expect(runtime.mapPresentationActionIds).toContain("lightning-2");
    expect(runtime.mapPresentationActionIds).toContain("lightning-3");
    expect(runtime.mapPresentationActionIds).toContain("lightning-4");
  });

  it("covers native 1C, 1L, and TR entry points for players and enemy AI", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magician" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "magic-priest" as const, level: 3 as const, x: 20, y: 32 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 21, y: 32 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "magician" as const, level: 1 as const, x: 22, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "magic-priest" as const, level: 3 as const, x: 24, y: 32 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 23, y: 32 },
    ];
    const battle = new ArenaBattle(placements, 0);
    battle.unit("arena-1-2")!.actionDisabled = true;
    battle.unit("arena-2-2")!.actionDisabled = true;

    expect(battle.actionTargetCells("arena-1-0", "ice-1")).toEqual([{ x: 20, y: 30 }]);
    expect(battle.actionTargetCells("arena-1-0", "lightning-1"))
      .toContainEqual({ x: 22, y: 30 });
    expect(battle.actionTargetCells("arena-1-1", "dispel"))
      .toContainEqual({ x: 21, y: 32 });

    expect(battle.planSpecialAiAction("arena-2-0", "ice-1")).toMatchObject({
      kind: "special",
      actionId: "ice-1",
      unitId: "arena-2-0",
    });
    expect(battle.planSpecialAiAction("arena-2-0", "lightning-1")).toMatchObject({
      kind: "special",
      actionId: "lightning-1",
      unitId: "arena-2-0",
    });
    expect(battle.planSpecialAiAction("arena-2-1", "dispel")).toMatchObject({
      kind: "special",
      actionId: "dispel",
      unitId: "arena-2-1",
      targetId: "arena-2-2",
    });
  });

  it("offers 2L only to tier-one magic masters and unifies both sides to selection radius five", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-master" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "magic-master" as const, level: 1 as const, x: 30, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 25, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "lightning-2"))
      .toContainEqual({ x: 25, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "lightning-2",
      targetId: "arena-1-1",
    });

    for (const level of [2, 3] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-master" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "lightning-2")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("lightning-2");
    }

    const frozen = new ArenaBattle(placements, 0);
    frozen.unit("arena-2-0")!.actionDisabled = true;
    const rngBefore = { state: frozen.rng.state, calls: frozen.rng.calls };
    expect(frozen.actionTargetCells("arena-1-0", "lightning-2"))
      .not.toContainEqual({ x: 25, y: 30 });
    expect(() => frozen.prepareSpecialAction({
      actionId: "lightning-2",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect({ state: frozen.rng.state, calls: frozen.rng.calls }).toEqual(rngBefore);
  });

  it("offers 3L only to tier-two magic masters and unifies both sides to selection radius six", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-master" as const, level: 2 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "magic-master" as const, level: 2 as const, x: 32, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "lightning-3"))
      .toContainEqual({ x: 26, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "lightning-3",
      targetId: "arena-1-1",
    });

    for (const level of [1, 3] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-master" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "lightning-3")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("lightning-3");
    }

    const frozen = new ArenaBattle(placements, 0);
    frozen.unit("arena-2-0")!.actionDisabled = true;
    const rngBefore = { state: frozen.rng.state, calls: frozen.rng.calls };
    expect(frozen.actionTargetCells("arena-1-0", "lightning-3"))
      .not.toContainEqual({ x: 26, y: 30 });
    expect(() => frozen.prepareSpecialAction({
      actionId: "lightning-3",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect({ state: frozen.rng.state, calls: frozen.rng.calls }).toEqual(rngBefore);
  });

  it("offers 4L only to tier-three magic masters and unifies both sides to selection radius seven", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-master" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "magic-master" as const, level: 3 as const, x: 34, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 27, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "lightning-4"))
      .toContainEqual({ x: 27, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "lightning-4",
      targetId: "arena-1-1",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-master" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "lightning-4")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("lightning-4");
    }

    const frozen = new ArenaBattle(placements, 0);
    frozen.unit("arena-2-0")!.actionDisabled = true;
    const rngBefore = { state: frozen.rng.state, calls: frozen.rng.calls };
    expect(frozen.actionTargetCells("arena-1-0", "lightning-4"))
      .not.toContainEqual({ x: 27, y: 30 });
    expect(() => frozen.prepareSpecialAction({
      actionId: "lightning-4",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect({ state: frozen.rng.state, calls: frozen.rng.calls }).toEqual(rngBefore);
  });

  it("offers 2I only at prayer-guide tier two and keeps full-life AI centers legal", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "prayer-guide" as const, level: 2 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 2 as const, x: 26, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 28, y: 30 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 27, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "recovery-2"))
      .toContainEqual({ x: 22, y: 30 });
    expect(battle.planSpecialAiAction("arena-2-0", "recovery-2")).toMatchObject({
      kind: "special",
      actionId: "recovery-2",
      targetId: "arena-2-2",
    });

    for (const level of [1, 3] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.id === "arena-1-0" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "recovery-2")).toEqual([]);
    }

    const frozen = new ArenaBattle(placements, 0);
    frozen.unit("arena-1-1")!.actionDisabled = true;
    const rngBefore = { state: frozen.rng.state, calls: frozen.rng.calls };
    expect(frozen.actionTargetCells("arena-1-0", "recovery-2"))
      .not.toContainEqual({ x: 22, y: 30 });
    expect(() => frozen.prepareSpecialAction({
      actionId: "recovery-2",
      actorId: "arena-1-0",
      targetId: "arena-1-1",
    })).toThrow("illegal special action");
    expect({ state: frozen.rng.state, calls: frozen.rng.calls }).toEqual(rngBefore);
  });

  it("offers 3I only at prayer-guide tier three with radius-six full-life centers", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 27, y: 31 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 28, y: 31 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 29, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "recovery-3"))
      .toContainEqual({ x: 26, y: 30 });
    expect(battle.planSpecialAiAction("arena-2-0", "recovery-3")).toMatchObject({
      kind: "special",
      actionId: "recovery-3",
      targetId: "arena-2-2",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.id === "arena-1-0" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "recovery-3")).toEqual([]);
    }

    const frozen = new ArenaBattle(placements, 0);
    frozen.unit("arena-1-1")!.actionDisabled = true;
    const rngBefore = { state: frozen.rng.state, calls: frozen.rng.calls };
    expect(frozen.actionTargetCells("arena-1-0", "recovery-3"))
      .not.toContainEqual({ x: 26, y: 30 });
    expect(() => frozen.prepareSpecialAction({
      actionId: "recovery-3",
      actorId: "arena-1-0",
      targetId: "arena-1-1",
    })).toThrow("illegal special action");
    expect({ state: frozen.rng.state, calls: frozen.rng.calls }).toEqual(rngBefore);
  });

  it("keeps OJ player-only while expert enemy prayer-guides choose deterministic useful support", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 20, y: 21 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 18, y: 18 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 20, y: 20 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 22, y: 22 },
    ];
    const playerBattle = new ArenaBattle(placements, 0, new DeterministicRng(0x0b1e55ed));
    expect(playerBattle.actionTargetCells("arena-1-0", "prayer"))
      .toEqual([{ x: 20, y: 21 }]);
    expect(playerBattle.actionTargets("arena-1-0", "prayer")).toEqual([]);
    const prepared = playerBattle.prepareSpecialAction({
      actionId: "prayer",
      actorId: "arena-1-0",
    });
    expect(prepared.result.prayerEligibleUnitIds).toEqual(["arena-1-1", "arena-1-0"]);
    expect(prepared.result.prayerEligibleUnitIds).not.toContain("arena-2-0");

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.id === "arena-1-0" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "prayer")).toEqual([]);
    }

    // REMAKE-033 no longer rolls the native SM miss. OJ remains player-only,
    // while the expert planner selects a useful legal action without PRNG.
    const enemyBattle = new ArenaBattle(placements, 0, new DeterministicRng(3));
    expect(enemyBattle.planEnemyAiAction("arena-2-0")).toMatchObject({
      kind: "special",
      actionId: "defense-up",
      targetId: "arena-2-0",
    });
    expect(enemyBattle.rng.calls).toBe(0);
  });

  it("offers 2H only at prayer-guide tier three with full-life targets", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 3 as const, x: 26, y: 31 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "heal-2")).toContainEqual({ x: 26, y: 30 });
    expect(battle.planSpecialAiAction("arena-2-0", "heal-2")).toMatchObject({
      kind: "special",
      actionId: "heal-2",
    });

    for (const level of [1, 2] as const) {
      const wrongPlayerTier = new ArenaBattle(placements.map((placement) =>
        placement.id === "arena-1-0" ? { ...placement, level } : placement), 0);
      expect(wrongPlayerTier.actionTargetCells("arena-1-0", "heal-2")).toEqual([]);
    }
    for (const level of [1, 2] as const) {
      const wrongPrayerTier = new ArenaBattle(placements.map((placement) =>
        placement.id === "arena-2-0" ? { ...placement, level } : placement), 0);
      expect(wrongPrayerTier.planSpecialAiAction("arena-2-0", "heal-2")).toBeUndefined();
    }
  });

  it("offers 3H only at magic-guide tier three with radius-seven full-life targeting", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-guide" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "magic-guide" as const, level: 3 as const, x: 27, y: 31 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "heal-3")).toContainEqual({ x: 27, y: 30 });
    expect(battle.planSpecialAiAction("arena-2-0", "heal-3")).toMatchObject({
      kind: "special",
      actionId: "heal-3",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-guide" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "heal-3")).toEqual([]);
      expect(wrongTier.planSpecialAiAction("arena-2-0", "heal-3")).toBeUndefined();
    }
  });

  it("offers AA at every magic-guide tier and lets AI prefer the later full-life frozen ally", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-guide" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "magic-guide" as const, level: 1 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 28, y: 30 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 29, y: 31 },
    ];

    for (const level of [1, 2, 3] as const) {
      const battle = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-guide" ? { ...placement, level } : placement), 0);
      battle.unit("arena-1-1")!.actionDisabled = true;
      expect(battle.actionTargetCells("arena-1-0", "attack-up"))
        .toContainEqual({ x: 24, y: 30 });
      expect(battle.actionTargetCells("arena-1-0", "attack-up"))
        .not.toContainEqual({ x: 25, y: 30 });

      battle.unit("arena-2-2")!.actionDisabled = true;
      expect(battle.planSpecialAiAction("arena-2-0", "attack-up")).toMatchObject({
        kind: "special",
        actionId: "attack-up",
        targetId: "arena-2-2",
      });
    }

    const wrongClass = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-0"
        ? { ...placement, classId: "soldier" as const }
        : placement), 0);
    expect(wrongClass.actionTargetCells("arena-1-0", "attack-up")).toEqual([]);
  });

  it("offers FM only at magic-guide tier three with radius seven and the repaired ally AI selector", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-guide" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 28, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "magic-guide" as const, level: 3 as const, x: 30, y: 32 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 32 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 24, y: 33 },
    ];
    const battle = new ArenaBattle(placements, 0);
    battle.unit("arena-1-1")!.actionDisabled = true;
    expect(battle.actionTargetCells("arena-1-0", "magic-guard"))
      .toContainEqual({ x: 27, y: 30 });
    expect(battle.actionTargetCells("arena-1-0", "magic-guard"))
      .not.toContainEqual({ x: 28, y: 30 });

    battle.unit("arena-2-2")!.actionDisabled = true;
    battle.unit("arena-2-2")!.statuses.magicGuard = 1;
    expect(battle.planSpecialAiAction("arena-2-0", "magic-guard")).toMatchObject({
      kind: "special",
      actionId: "magic-guard",
      targetId: "arena-2-2",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-guide" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "magic-guard")).toEqual([]);
      expect(wrongTier.planSpecialAiAction("arena-2-0", "magic-guard")).toBeUndefined();
    }

    const wrongClass = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-0"
        ? { ...placement, classId: "soldier" as const }
        : placement), 0);
    expect(wrongClass.actionTargetCells("arena-1-0", "magic-guard")).toEqual([]);
  });

  it("offers IP to tier-two and tier-three curse-masters, including frozen enemies", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "curse-master" as const, level: 2 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    battle.unit("arena-2-1")!.actionDisabled = true;
    expect(battle.actionTargetCells("arena-1-0", "poison"))
      .toContainEqual({ x: 26, y: 30 });
    expect(battle.prepareSpecialAction({
      actionId: "poison",
      actorId: "arena-1-0",
      targetId: "arena-2-1",
    }).result).toMatchObject({
      blocked: false,
      affectedUnits: [expect.objectContaining({
        statusesAfter: expect.objectContaining({ poison: 3 }),
      })],
    });
    expect(battle.planSpecialAiAction("arena-2-0", "poison")).toMatchObject({
      kind: "special",
      actionId: "poison",
      targetId: "arena-1-1",
    });

    const tierOne = new ArenaBattle(placements.map((placement) =>
      placement.classId === "curse-master" ? { ...placement, level: 1 as const } : placement), 0);
    expect(tierOne.actionTargetCells("arena-1-0", "poison")).toEqual([]);
    expect(tierOne.planSpecialAiAction("arena-2-0", "poison")).toBeUndefined();
  });

  it("offers LA at every curse-master tier and applies native FF confusion only to automatic planning", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "curse-master" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "curse-master" as const, level: 2 as const, x: 30, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0, new DeterministicRng(0x1234));
    battle.unit("arena-2-0")!.actionDisabled = true;
    expect(battle.actionTargetCells("arena-1-0", "confusion"))
      .toContainEqual({ x: 25, y: 30 });
    battle.unit("arena-1-0")!.statuses.confusion = 3;
    expect(battle.actionTargetCells("arena-1-0", "confusion"))
      .toContainEqual({ x: 25, y: 30 });

    battle.unit("arena-2-0")!.actionDisabled = false;
    battle.unit("arena-2-0")!.statuses.confusion = 3;
    const ordinary = battle.planEnemyAiAction("arena-2-0");
    expect(ordinary?.kind).toBe("move");
    expect(ordinary?.targetId).toBeUndefined();
    const ordinaryDestination = ordinary?.path.at(-1);
    expect(ordinaryDestination).toBeDefined();
    expect(Math.abs(ordinaryDestination!.x - 24) + Math.abs(ordinaryDestination!.y - 30))
      .toBeGreaterThan(1);

    battle.unit("arena-2-1")!.statuses.confusion = 3;
    const callsBefore = battle.rng.calls;
    const technique = battle.planEnemyAiAction("arena-2-1");
    expect(["move", "wait"]).toContain(technique?.kind);
    expect(technique?.actionId).toBeUndefined();
    expect(battle.rng.calls).toBeGreaterThan(callsBefore);

    const firstReplay = new ArenaBattle(placements, 0, new DeterministicRng(0x4567));
    const secondReplay = new ArenaBattle(placements, 0, new DeterministicRng(0x4567));
    firstReplay.unit("arena-2-1")!.statuses.confusion = 3;
    secondReplay.unit("arena-2-1")!.statuses.confusion = 3;
    expect(firstReplay.planEnemyAiAction("arena-2-1"))
      .toEqual(secondReplay.planEnemyAiAction("arena-2-1"));
  });

  it("offers SA at every curse-master tier, accepts frozen enemies, and ranks lowest defense then life", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "curse-master" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];

    for (const level of [1, 2, 3] as const) {
      const battle = new ArenaBattle(placements.map((placement) =>
        placement.classId === "curse-master" ? { ...placement, level } : placement), 0);
      battle.unit("arena-2-1")!.actionDisabled = true;
      expect(battle.actionTargetCells("arena-1-0", "attack-down"))
        .toContainEqual({ x: 24, y: 30 });
      expect(battle.prepareSpecialAction({
        actionId: "attack-down",
        actorId: "arena-1-0",
        targetId: "arena-2-1",
      }).result).toMatchObject({
        blocked: false,
        affectedUnits: [expect.objectContaining({
          statusesAfter: expect.objectContaining({ attackDown: 3 }),
        })],
      });
    }

    const defenseRank = new ArenaBattle(placements, 0);
    defenseRank.unit("arena-1-1")!.statuses.defenseUp = 3;
    defenseRank.unit("arena-1-1")!.life = 1;
    expect(defenseRank.planSpecialAiAction("arena-2-0", "attack-down")).toMatchObject({
      kind: "special",
      actionId: "attack-down",
      targetId: "arena-1-2",
    });

    const lifeRank = new ArenaBattle(placements, 0);
    lifeRank.unit("arena-1-1")!.life = 1;
    expect(lifeRank.planSpecialAiAction("arena-2-0", "attack-down")).toMatchObject({
      kind: "special",
      actionId: "attack-down",
      targetId: "arena-1-1",
    });
  });

  it("offers SD at every magic-priest tier, accepts frozen enemies, and ranks lowest defense then life", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "magic-priest" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "magic-priest" as const, level: 3 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];

    for (const level of [1, 2, 3] as const) {
      const battle = new ArenaBattle(placements.map((placement) =>
        placement.classId === "magic-priest" ? { ...placement, level } : placement), 0);
      battle.unit("arena-2-1")!.actionDisabled = true;
      expect(battle.actionTargetCells("arena-1-0", "defense-down"))
        .toContainEqual({ x: 24, y: 30 });
      expect(battle.prepareSpecialAction({
        actionId: "defense-down",
        actorId: "arena-1-0",
        targetId: "arena-2-1",
      }).result).toMatchObject({
        blocked: false,
        affectedUnits: [expect.objectContaining({
          statusesAfter: expect.objectContaining({ defenseDown: 3 }),
        })],
      });
    }

    const defenseRank = new ArenaBattle(placements, 0);
    defenseRank.unit("arena-1-1")!.statuses.defenseUp = 3;
    defenseRank.unit("arena-1-1")!.life = 1;
    expect(defenseRank.planSpecialAiAction("arena-2-0", "defense-down")).toMatchObject({
      kind: "special",
      actionId: "defense-down",
      targetId: "arena-1-2",
    });

    const lifeRank = new ArenaBattle(placements, 0);
    lifeRank.unit("arena-1-1")!.life = 1;
    expect(lifeRank.planSpecialAiAction("arena-2-0", "defense-down")).toMatchObject({
      kind: "special",
      actionId: "defense-down",
      targetId: "arena-1-1",
    });
  });

  it("offers SN only to tier-three curse masters, accepts frozen targets, and ranks defense then life", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];

    for (const level of [1, 2] as const) {
      const battle = new ArenaBattle(placements.map((placement) =>
        placement.classId === "curse-master" ? { ...placement, level } : placement), 0);
      expect(battle.actionTargetCells("arena-1-0", "spell-seal")).toEqual([]);
    }
    const tierThree = new ArenaBattle(placements, 0);
    tierThree.unit("arena-2-1")!.actionDisabled = true;
    expect(tierThree.actionTargetCells("arena-1-0", "spell-seal"))
      .toContainEqual({ x: 24, y: 30 });
    expect(tierThree.prepareSpecialAction({
      actionId: "spell-seal",
      actorId: "arena-1-0",
      targetId: "arena-2-1",
    }).result).toMatchObject({
      blocked: false,
      affectedUnits: [expect.objectContaining({
        statusesAfter: expect.objectContaining({ techniqueSeal: 3 }),
      })],
    });

    const defenseRank = new ArenaBattle(placements, 0);
    defenseRank.unit("arena-1-1")!.statuses.defenseUp = 3;
    defenseRank.unit("arena-1-1")!.life = 1;
    expect(defenseRank.planSpecialAiAction("arena-2-0", "spell-seal")).toMatchObject({
      kind: "special",
      actionId: "spell-seal",
      targetId: "arena-1-2",
    });

    const lifeRank = new ArenaBattle(placements, 0);
    lifeRank.unit("arena-1-1")!.life = 1;
    expect(lifeRank.planSpecialAiAction("arena-2-0", "spell-seal")).toMatchObject({
      kind: "special",
      actionId: "spell-seal",
      targetId: "arena-1-1",
    });
  });

  it("offers AD at every prayer-guide tier and lets AI prefer the later full-life frozen ally", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "prayer-guide" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "arena-1-2", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 1 as const, x: 30, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 28, y: 30 },
      { id: "arena-2-2", side: 2 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 29, y: 31 },
    ];

    for (const level of [1, 2, 3] as const) {
      const battle = new ArenaBattle(placements.map((placement) =>
        placement.classId === "prayer-guide" ? { ...placement, level } : placement), 0);
      battle.unit("arena-1-1")!.actionDisabled = true;
      expect(battle.actionTargetCells("arena-1-0", "defense-up"))
        .toContainEqual({ x: 24, y: 30 });
      expect(battle.actionTargetCells("arena-1-0", "defense-up"))
        .not.toContainEqual({ x: 25, y: 30 });

      battle.unit("arena-2-2")!.actionDisabled = true;
      expect(battle.planSpecialAiAction("arena-2-0", "defense-up")).toMatchObject({
        kind: "special",
        actionId: "defense-up",
        targetId: "arena-2-2",
      });
    }

    const wrongClass = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-0"
        ? { ...placement, classId: "soldier" as const }
        : placement), 0);
    expect(wrongClass.actionTargetCells("arena-1-0", "defense-up")).toEqual([]);
  });

  it("offers 2F at the native class tiers and unifies both AI sides to selection radius six", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "evil-mage" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "evil-mage" as const, level: 1 as const, x: 26, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "fire-2")).toContainEqual({ x: 26, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "fire-2",
      targetId: "arena-1-1",
    });

    const tierTwo = new ArenaBattle(placements.map((placement) =>
      placement.classId === "evil-mage" ? { ...placement, level: 2 as const } : placement), 0);
    expect(tierTwo.actionTargetCells("arena-1-0", "fire-2")).toEqual([]);
    expect(tierTwo.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("fire-2");

    const magicPriestPlacements = placements.map((placement) =>
      placement.classId === "evil-mage"
        ? { ...placement, classId: "magic-priest" as const, level: 3 as const }
        : placement);
    const magicPriest = new ArenaBattle(magicPriestPlacements, 0);
    expect(magicPriest.actionTargetCells("arena-1-0", "fire-2"))
      .toContainEqual({ x: 26, y: 30 });
    expect(magicPriest.planSpecialAiAction("arena-2-1", "fire-2")).toMatchObject({
      kind: "special",
      actionId: "fire-2",
      targetId: "arena-1-1",
    });
  });

  it("offers 3F only to tier-two evil mages and unifies both AI sides to selection radius seven", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "evil-mage" as const, level: 2 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "evil-mage" as const, level: 2 as const, x: 27, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "fire-3"))
      .toContainEqual({ x: 27, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "fire-3",
      targetId: "arena-1-1",
    });

    for (const level of [1, 3] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "evil-mage" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "fire-3")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("fire-3");
    }
  });

  it("offers 4F only to tier-three evil mages and unifies both AI sides to selection radius seven", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "evil-mage" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 27, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "evil-mage" as const, level: 3 as const, x: 27, y: 31 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "fire-4"))
      .toContainEqual({ x: 27, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "fire-4",
      targetId: "arena-1-1",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "evil-mage" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "fire-4")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("fire-4");
    }
  });

  it("offers exactly one native stomp tier per great dragon tier while expert AI may prefer a stronger adjacent attack", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "great-dragon-knight" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "great-dragon-knight" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "stomp-1")).toContainEqual({ x: 23, y: 30 });
    expect(battle.actionTargetCells("arena-1-0", "stomp-2")).toEqual([]);
    expect(battle.actionTargetCells("arena-1-0", "stomp-3")).toEqual([]);
    expect(battle.planSpecialAiAction("arena-2-1", "stomp-1")).toMatchObject({
      kind: "special",
      actionId: "stomp-1",
      targetId: "arena-1-1",
    });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "attack",
      targetId: "arena-1-1",
    });

    const tierTwo = new ArenaBattle(placements.map((placement) =>
      placement.classId === "great-dragon-knight" ? { ...placement, level: 2 as const } : placement), 0);
    expect(tierTwo.actionTargetCells("arena-1-0", "stomp-1")).toEqual([]);
    expect(tierTwo.actionTargetCells("arena-1-0", "stomp-2")).toContainEqual({ x: 23, y: 30 });
    expect(tierTwo.actionTargetCells("arena-1-0", "stomp-3")).toEqual([]);
    expect(tierTwo.planSpecialAiAction("arena-2-1", "stomp-2")).toMatchObject({
      kind: "special",
      actionId: "stomp-2",
      targetId: "arena-1-1",
    });

    const tierThree = new ArenaBattle(placements.map((placement) =>
      placement.classId === "great-dragon-knight" ? { ...placement, level: 3 as const } : placement), 0);
    expect(tierThree.actionTargetCells("arena-1-0", "stomp-1")).toEqual([]);
    expect(tierThree.actionTargetCells("arena-1-0", "stomp-2")).toEqual([]);
    expect(tierThree.actionTargetCells("arena-1-0", "stomp-3")).toContainEqual({ x: 23, y: 30 });
    expect(tierThree.planSpecialAiAction("arena-2-1", "stomp-3")).toMatchObject({
      kind: "special",
      actionId: "stomp-3",
      targetId: "arena-1-1",
    });
  });

  it("offers self-centered 2C only to tier-one wizards and uses distance three only as the AI candidate gate", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "ice-2")).toEqual([{ x: 20, y: 30 }]);
    expect(() => battle.prepareSpecialAction({
      actionId: "ice-2",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect(battle.prepareSpecialAction({
      actionId: "ice-2",
      actorId: "arena-1-0",
    }).result.target).toEqual({ x: 20, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "ice-2",
      targetId: "arena-1-1",
    });

    const tierTwo = new ArenaBattle(placements.map((placement) =>
      placement.classId === "wizard" ? { ...placement, level: 2 as const } : placement), 0);
    expect(tierTwo.actionTargetCells("arena-1-0", "ice-2")).toEqual([]);
    expect(tierTwo.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-2");

    const outsideGate = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-1" ? { ...placement, x: 21, y: 30 } : placement), 0);
    expect(outsideGate.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-2");
  });

  it("offers self-centered 3C only to tier-two wizards and keeps its raw player radius out of the AI gate", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "wizard" as const, level: 2 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "wizard" as const, level: 2 as const, x: 30, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "ice-3")).toEqual([{ x: 20, y: 30 }]);
    expect(() => battle.prepareSpecialAction({
      actionId: "ice-3",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect(battle.prepareSpecialAction({
      actionId: "ice-3",
      actorId: "arena-1-0",
    }).result.target).toEqual({ x: 20, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "ice-3",
      targetId: "arena-1-1",
    });

    const tierOne = new ArenaBattle(placements.map((placement) => {
      if (placement.classId === "wizard") return { ...placement, level: 1 as const };
      return placement.id === "arena-1-1" ? { ...placement, x: 27, y: 30 } : placement;
    }), 0);
    expect(tierOne.actionTargetCells("arena-1-0", "ice-3")).toEqual([]);
    expect(tierOne.actionTargetCells("arena-1-0", "ice-2")).toEqual([{ x: 20, y: 30 }]);
    expect(tierOne.planEnemyAiAction("arena-2-1")).toMatchObject({ actionId: "ice-2" });

    const tierThree = new ArenaBattle(placements.map((placement) =>
      placement.classId === "wizard" ? { ...placement, level: 3 as const } : placement), 0);
    expect(tierThree.actionTargetCells("arena-1-0", "ice-3")).toEqual([]);
    expect(tierThree.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-3");

    const outsideGate = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-1" ? { ...placement, x: 25, y: 30 } : placement), 0);
    expect(outsideGate.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-3");
  });

  it("offers self-centered 4C only to tier-three wizards with an independent distance-five AI gate", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "wizard" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "arena-2-1", side: 2 as const, slot: 1, classId: "wizard" as const, level: 3 as const, x: 30, y: 30 },
      { id: "arena-1-1", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.actionTargetCells("arena-1-0", "ice-4")).toEqual([{ x: 20, y: 30 }]);
    expect(() => battle.prepareSpecialAction({
      actionId: "ice-4",
      actorId: "arena-1-0",
      targetId: "arena-2-0",
    })).toThrow("illegal special action");
    expect(battle.prepareSpecialAction({
      actionId: "ice-4",
      actorId: "arena-1-0",
    }).result.target).toEqual({ x: 20, y: 30 });
    expect(battle.planEnemyAiAction("arena-2-1")).toMatchObject({
      kind: "special",
      actionId: "ice-4",
      targetId: "arena-1-1",
    });

    for (const level of [1, 2] as const) {
      const wrongTier = new ArenaBattle(placements.map((placement) =>
        placement.classId === "wizard" ? { ...placement, level } : placement), 0);
      expect(wrongTier.actionTargetCells("arena-1-0", "ice-4")).toEqual([]);
      expect(wrongTier.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-4");
    }

    const outsideGate = new ArenaBattle(placements.map((placement) =>
      placement.id === "arena-1-1" ? { ...placement, x: 24, y: 30 } : placement), 0);
    expect(outsideGate.planEnemyAiAction("arena-2-1")?.actionId).not.toBe("ice-4");
  });

  it("moves an engineer with native seed 5 and atomically lays stage-1 iron plate on valid neighbors", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "engineer" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "engineer" as const, level: 1 as const, x: 30, y: 30 },
    ];
    for (const level of [1, 2, 3] as const) {
      const tierBattle = new ArenaBattle(placements.map((placement) =>
        placement.side === 1 ? { ...placement, level } : placement), 0);
      expect(tierBattle.actionTargetCells("arena-1-0", "iron-plate"))
        .toContainEqual({ x: 21, y: 30 });
    }
    const battle = new ArenaBattle(placements, 0);
    const actor = battle.unit("arena-1-0")!;
    const target = { x: 21, y: 30 };
    expect(battle.actionTargetCells(actor.id, "iron-plate")).toContainEqual(target);
    const before = {
      actor: { x: actor.x, y: actor.y, acted: actor.acted, experience: actor.experience },
      rng: { state: battle.rng.state, calls: battle.rng.calls },
      overrides: battle.terrainOverrides,
    };
    const prepared = battle.prepareIronPlateConstruction(actor.id, target);
    expect(prepared.path).toEqual([{ x: 20, y: 30 }, target]);
    expect(prepared.terrainMutations.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 21, y: 31 },
      { x: 21, y: 29 },
      { x: 22, y: 30 },
      { x: 20, y: 30 },
    ]);
    expect({ x: actor.x, y: actor.y, acted: actor.acted, experience: actor.experience })
      .toEqual(before.actor);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);
    expect(battle.terrainOverrides).toEqual(before.overrides);

    const result = battle.commitIronPlateConstruction(prepared);
    expect({ x: actor.x, y: actor.y, acted: actor.acted }).toEqual({ x: 21, y: 30, acted: true });
    expect(actor.experience).toBe(before.actor.experience);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);
    expect(result.terrainMutations).toHaveLength(4);
    expect(battle.terrainOverrides).toEqual([
      { x: 21, y: 29, kind: "iron-plate" },
      { x: 20, y: 30, kind: "iron-plate" },
      { x: 22, y: 30, kind: "iron-plate" },
      { x: 21, y: 31, kind: "iron-plate" },
    ]);
    for (const override of battle.terrainOverrides) expect(battle.terrainSlotAt(override)).toBe(3);
    expect(battle.terrainKindAt(target)).toBeUndefined();

    const restored = new ArenaBattle(placements, 0);
    restored.restore(battle.serializableSnapshot());
    expect(restored.terrainOverrides).toEqual(battle.terrainOverrides);
    for (const override of restored.terrainOverrides) expect(restored.terrainSlotAt(override)).toBe(3);
  });

  it("offers 2K at every engineer tier and atomically replaces neighboring terrain with stage-1 obstacle", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "engineer" as const, level: 3 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "engineer" as const, level: 1 as const, x: 30, y: 30 },
    ];
    for (const level of [1, 2, 3] as const) {
      const tierBattle = new ArenaBattle(placements.map((placement) =>
        placement.side === 1 ? { ...placement, level } : placement), 0);
      expect(tierBattle.actionTargetCells("arena-1-0", "obstacle"))
        .toContainEqual({ x: 21, y: 30 });
    }
    const battle = new ArenaBattle(placements, 0);
    const actor = battle.unit("arena-1-0")!;
    const before = {
      experience: actor.experience,
      rng: { state: battle.rng.state, calls: battle.rng.calls },
    };
    const prepared = battle.prepareObstacleConstruction(actor.id, { x: 21, y: 30 });
    expect(prepared.actionId).toBe("obstacle");
    expect(battle.terrainOverrides).toEqual([]);
    const result = battle.commitObstacleConstruction(prepared);
    expect(result.terrainMutations.every(({ kind, slotAfter }) =>
      kind === "obstacle" && slotAfter === 3)).toBe(true);
    expect(battle.terrainOverrides).toEqual([
      { x: 21, y: 29, kind: "obstacle" },
      { x: 20, y: 30, kind: "obstacle" },
      { x: 22, y: 30, kind: "obstacle" },
      { x: 21, y: 31, kind: "obstacle" },
    ]);
    expect({ x: actor.x, y: actor.y, acted: actor.acted, experience: actor.experience })
      .toEqual({ x: 21, y: 30, acted: true, experience: before.experience });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);

    const restored = new ArenaBattle(placements, 0);
    restored.restore(battle.serializableSnapshot());
    expect(restored.terrainOverrides).toEqual(battle.terrainOverrides);
  });

  it("keeps engineer AI in the ordinary category instead of inventing construction decisions", () => {
    const placements = [
      { id: "arena-1-0", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
      { id: "arena-2-0", side: 2 as const, slot: 0, classId: "engineer" as const, level: 1 as const, x: 26, y: 30 },
    ];
    const battle = new ArenaBattle(placements, 0);
    expect(battle.planEnemyAiAction("arena-2-0")?.actionId).not.toBe("iron-plate");
    expect(battle.planEnemyAiAction("arena-2-0")?.actionId).not.toBe("obstacle");
  });
});
