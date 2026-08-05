import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARENA_CLASS_IDS,
  ARENA_MAP,
  ARENA_TERRAIN_SLOTS,
  ArenaSession,
  arenaClassCanStandAt,
  arenaEnemyMapAsset,
  arenaExperienceForLevel,
  arenaTerrainSlotAt,
} from "../../src/game/arena-session";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { classStatsFor } from "../../src/game/content/classes";
import {
  ArenaBattle,
  createArenaRuntime,
} from "../../src/game/simulation/arena-battle";

describe("all-terrain arena", () => {
  it("exposes each integrated map class on both sides with real assets", () => {
    expect(ARENA_CLASS_IDS).toEqual(Object.keys(ALLY_MAP_UNIT_ASSETS));
    expect(ARENA_CLASS_IDS.length).toBeGreaterThanOrEqual(20);
    for (const classId of ARENA_CLASS_IDS) {
      const sources = [ALLY_MAP_UNIT_ASSETS[classId], arenaEnemyMapAsset(classId)];
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
  });
});
