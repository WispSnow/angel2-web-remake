import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASS_SHOWDOWN_CLASS_IDS,
  CLASS_SHOWDOWN_ENVIRONMENT,
  CLASS_SHOWDOWN_EXCLUDED_CLASS_IDS,
  CLASS_SHOWDOWN_MAP,
  CLASS_SHOWDOWN_ROWS_PER_COLUMN,
  classShowdownPair,
  classShowdownTerrainSlotAt,
  createClassShowdownPlacements,
} from "../../src/game/class-showdown-session";
import { classDefinition, classStatsFor } from "../../src/game/content/classes";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "../../src/game/content/technique-lab.generated";
import { ArenaBattle, createArenaRuntime } from "../../src/game/simulation/arena-battle";

describe("all-class showdown lab", () => {
  it("pairs every ordinary catalog class and preserves special-runtime evidence boundaries", () => {
    expect(CLASS_SHOWDOWN_CLASS_IDS).toHaveLength(35);
    expect(CLASS_SHOWDOWN_CLASS_IDS.map((classId) => classDefinition(classId).nativeRecord))
      .toEqual(Array.from({ length: 35 }, (_, index) => index));
    expect(CLASS_SHOWDOWN_EXCLUDED_CLASS_IDS).toEqual(["empress", "dragon", "head", "hand"]);

    for (const classId of CLASS_SHOWDOWN_CLASS_IDS) {
      const assets = TECHNIQUE_LAB_UNIT_ASSETS[classId];
      expect(assets.ally, `${classId}: ally figure`).toBeTruthy();
      for (const source of [assets.ally, assets.enemy]) {
        const file = path.resolve("public", source!.replace(/^\/assets\//, "assets/"));
        expect(fs.statSync(file).size, `${classId}: ${source}`).toBeGreaterThan(0);
      }
    }
  });

  it("deploys 35 adjacent mirrors in two vertical columns at one selected level", () => {
    const placements = createClassShowdownPlacements(2);
    expect(placements).toHaveLength(70);
    expect(CLASS_SHOWDOWN_ROWS_PER_COLUMN).toBe(18);
    expect(new Set(placements.map(({ id }) => id)).size).toBe(70);
    expect(placements.every(({ level }) => level === 2)).toBe(true);

    for (const classId of CLASS_SHOWDOWN_CLASS_IDS) {
      const pair = classShowdownPair(placements, classId);
      expect(pair, classId).toBeDefined();
      expect(pair?.map(({ side }) => side)).toEqual([1, 2]);
      expect(pair?.[0].y).toBe(pair?.[1].y);
      expect((pair?.[1].x ?? 0) - (pair?.[0].x ?? 0)).toBe(1);
    }

    expect(new Set(placements.filter(({ side }) => side === 1).map(({ x }) => x)))
      .toEqual(new Set([17, 29]));
    expect(new Set(placements.filter(({ side }) => side === 2).map(({ x }) => x)))
      .toEqual(new Set([18, 30]));
    expect(placements.every(({ x, y }) => classShowdownTerrainSlotAt({ x, y }) === 2)).toBe(true);
  });

  it("starts a 70-unit formal battle on the plain-field environment", () => {
    const placements = createClassShowdownPlacements(3);
    const battle = new ArenaBattle(placements, 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    const runtime = createArenaRuntime(placements, CLASS_SHOWDOWN_ENVIRONMENT);

    expect(battle.stage).toMatchObject({
      name: "全職業對陣場",
      contentIdentity: "class-showdown-lab/plain-field-1",
    });
    expect(battle.units).toHaveLength(70);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(35);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(35);
    expect(battle.units.filter(({ side }) => side === 1)
      .every(({ id }) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.outcome()).toBe("ongoing");

    for (const unit of battle.units) {
      const expected = classDefinition(unit.classId).dataRows[2];
      expect(unit.experience, unit.classId).toBe(expected.experienceThreshold);
      expect(classStatsFor(unit).level, unit.classId).toBe(expected.level);
      expect(unit.life, unit.classId).toBe(battle.statsFor(unit).maxLife);
    }

    expect(runtime.assets?.map).toBe(CLASS_SHOWDOWN_MAP.source);
    expect(runtime.assets?.minimap).toBe(CLASS_SHOWDOWN_MAP.minimap);
    expect(runtime.assets?.unitSprites).toMatchObject({
      "ally-magic-sword-warrior": TECHNIQUE_LAB_UNIT_ASSETS["magic-sword-warrior"].ally,
      "enemy-magic-sword-warrior": TECHNIQUE_LAB_UNIT_ASSETS["magic-sword-warrior"].enemy,
      "enemy-engineer": TECHNIQUE_LAB_UNIT_ASSETS.engineer.enemy,
    });
  });
});
