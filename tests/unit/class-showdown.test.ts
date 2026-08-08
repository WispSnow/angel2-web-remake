import { createHash } from "node:crypto";
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
import { classDefinition, classStatsFor, killRewardFor } from "../../src/game/content/classes";
import { CLASS_SHOWDOWN_TELEPORT_ACTION_ID } from "../../src/game/content/actions";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "../../src/game/content/technique-lab.generated";
import {
  ALL_TERRAIN_ARENA_ENVIRONMENT,
  ArenaBattle,
  createArenaRuntime,
} from "../../src/game/simulation/arena-battle";

const assetFile = (source: string): string =>
  path.resolve("public", source.replace(/^\/assets\//, "assets/"));

const pngDimensions = (source: string): readonly [number, number] => {
  const bytes = fs.readFileSync(assetFile(source));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

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
        expect(fs.statSync(assetFile(source!)).size, `${classId}: ${source}`).toBeGreaterThan(0);
      }
      expect(pngDimensions(assets.enemy), `${classId}: side-two alpha canvas`)
        .toEqual(pngDimensions(assets.ally!));
    }
  });

  it("keeps the side-two curse-master silhouette and black shadow intact", () => {
    const source = TECHNIQUE_LAB_UNIT_ASSETS["curse-master"].enemy;
    const bytes = fs.readFileSync(assetFile(source));

    // PNG IHDR width/height. A/0003/05 has only 41 color rows, while the
    // horizontally mirrored A/0002/05 alpha restores the native 43-row frame.
    expect(pngDimensions(source)).toEqual([32, 43]);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("d9d45216ef1cc4f7092591729f292b7af2ad907887a1bb29504b83df07c4b783");
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
      expect(classStatsFor(unit).level, unit.classId).toBe(3);
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

  it("uses native class-branch portraits, including shared 0N/1N records", () => {
    const placements = createClassShowdownPlacements(1);
    const battle = new ArenaBattle(placements, 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    const expectedSide1 = [
      47, 57, 57, 50, 50, 50, 50, 57, 64, 57, 50, 50, 59, 52, 52, 52, 52, 52,
      52, 52, 59, 59, 52, 52, 50, 50, 51, 57, 57, 57, 50, 50, 50, 57, 61,
    ];
    const expectedSide2 = [
      48, 58, 58, 49, 49, 49, 49, 58, 64, 58, 49, 49, 60, 53, 53, 53, 53, 53,
      53, 53, 60, 60, 53, 53, 49, 49, 51, 58, 58, 58, 49, 49, 49, 58, 62,
    ];

    expect(battle.units.filter(({ side }) => side === 1).map(({ portrait }) => portrait))
      .toEqual(expectedSide1);
    expect(battle.units.filter(({ side }) => side === 2).map(({ portrait }) => portrait))
      .toEqual(expectedSide2);

    expect(battle.units.filter(({ classId }) => classId === "water-warrior")
      .map(({ side, portrait }) => [side, portrait]))
      .toEqual([[1, 51], [2, 51]]);
    expect(battle.units.filter(({ classId }) => classId === "half-dragon-warrior")
      .map(({ side, portrait }) => [side, portrait]))
      .toEqual([[1, 64], [2, 64]]);
  });

  it("gives only the half-dragon showdown mirror a full-map empty-cell teleport", () => {
    const placements = createClassShowdownPlacements(1);
    const battle = new ArenaBattle(placements, 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    const actor = battle.unit("arena-1-8")!;
    const destination = { x: 0, y: 0 };
    const targetCells = battle.actionTargetCells(actor.id, CLASS_SHOWDOWN_TELEPORT_ACTION_ID);

    expect(actor.classId).toBe("half-dragon-warrior");
    expect(battle.additionalActionIdsFor(actor.id)).toEqual([CLASS_SHOWDOWN_TELEPORT_ACTION_ID]);
    expect(battle.actionRange(actor.id, CLASS_SHOWDOWN_TELEPORT_ACTION_ID).cells())
      .toHaveLength(50 * 50);
    expect(targetCells).toHaveLength(50 * 50 - placements.length);
    expect(targetCells).toContainEqual(destination);
    for (const placement of placements) {
      expect(targetCells).not.toContainEqual({ x: placement.x, y: placement.y });
    }
    expect(() => battle.prepareSpecialAction({
      actionId: CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
      actorId: actor.id,
      target: { x: 18, y: 23 },
    })).toThrow("illegal special action");
    expect(battle.additionalActionIdsFor("arena-2-8"))
      .toEqual([CLASS_SHOWDOWN_TELEPORT_ACTION_ID]);
    expect(battle.planEnemyAiAction("arena-2-8")?.actionId)
      .not.toBe(CLASS_SHOWDOWN_TELEPORT_ACTION_ID);

    const before = {
      position: { x: actor.x, y: actor.y },
      acted: actor.acted,
      experience: actor.experience,
      rng: { state: battle.rng.state, calls: battle.rng.calls },
    };
    const prepared = battle.prepareSpecialAction({
      actionId: CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
      actorId: actor.id,
      target: destination,
    });
    expect(prepared.result.experienceGained).toBe(0);
    expect(prepared.result.affectedUnits).toMatchObject([
      {
        unitId: actor.id,
        positionBefore: before.position,
        positionAfter: destination,
        moved: true,
      },
    ]);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);
    expect({ x: actor.x, y: actor.y, acted: actor.acted, experience: actor.experience })
      .toEqual({ ...before.position, acted: before.acted, experience: before.experience });

    battle.commitPreparedAction(prepared);
    expect({ x: actor.x, y: actor.y, acted: actor.acted, experience: actor.experience })
      .toEqual({ x: destination.x, y: destination.y, acted: true, experience: before.experience });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);
    expect(battle.actionTargetCells(actor.id, CLASS_SHOWDOWN_TELEPORT_ACTION_ID)).toEqual([]);

    const ordinaryArena = new ArenaBattle(placements, 0, undefined, ALL_TERRAIN_ARENA_ENVIRONMENT);
    expect(ordinaryArena.additionalActionIdsFor("arena-1-8")).toEqual([]);
    expect(ordinaryArena.actionTargetCells("arena-1-8", CLASS_SHOWDOWN_TELEPORT_ACTION_ID))
      .toEqual([]);
  });

  it("multiplies a water-warrior kill award by every shared board body", () => {
    const battle = new ArenaBattle([
      {
        id: "arena-1-attacker",
        side: 1,
        slot: 0,
        classId: "great-axe-warrior",
        level: 3,
        x: 24,
        y: 30,
      },
      {
        id: "arena-2-water",
        side: 2,
        slot: 26,
        classId: "water-warrior",
        level: 3,
        x: 25,
        y: 30,
      },
    ], 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    const attacker = battle.unit("arena-1-attacker")!;
    const root = battle.unit("arena-2-water")!;

    for (let splitCount = 2; splitCount <= 4; splitCount += 1) {
      attacker.acted = false;
      attacker.life = battle.statsFor(attacker).maxLife;
      for (const unit of battle.units.filter(({ side, slot }) => side === 2 && slot === 26)) {
        unit.life = battle.statsFor(unit).maxLife;
      }
      expect(battle.attack(attacker.id, root.id)).toMatchObject({
        defenderDied: false,
        splitCount,
      });
    }

    const group = battle.units.filter(({ side, slot }) => side === 2 && slot === 26);
    expect(group.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: "arena-2-water", x: 25, y: 30 },
      { id: "arena-2-water:split-1", x: 25, y: 29 },
      { id: "arena-2-water:split-2", x: 25, y: 31 },
      { id: "arena-2-water:split-3", x: 26, y: 30 },
    ]);
    for (const unit of group) unit.life = 1;
    attacker.acted = false;
    const experienceBefore = attacker.experience;
    const rngCallsBefore = battle.rng.calls;

    const result = battle.attack(attacker.id, root.id);
    const singleBodyAward = result.experienceGained / group.length;

    expect(result.defenderDied).toBe(true);
    expect(result.defenderDeathTargets).toEqual(group.map(({ id, x, y }) => ({ id, x, y })));
    expect(singleBodyAward).toBeGreaterThanOrEqual(killRewardFor(root.classId, root.side) + 4);
    expect(singleBodyAward).toBeLessThanOrEqual(killRewardFor(root.classId, root.side) + 7);
    expect(attacker.experience).toBe(experienceBefore + result.experienceGained);
    expect(battle.rng.calls).toBe(rngCallsBefore + 3);
    expect(battle.units.some(({ side, slot }) => side === 2 && slot === 26)).toBe(false);
  });
});
