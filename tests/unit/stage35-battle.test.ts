import { describe, expect, it } from "vitest";
import { terrainDefensePercentFor } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE35_IRON_PLATE_TERRAIN_SLOT,
  STAGE35_OBSTACLE_TERRAIN_SLOT,
  stage35TerrainSlotAt,
} from "../../src/game/content/stage35";
import { Stage35Battle } from "../../src/game/simulation/stage35-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-35",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
    { slot: 18, classId: "archer", experience: 620, life: 130 },
    { slot: 22, classId: "great-axe-warrior", experience: 0, life: 220 },
    { slot: 23, classId: "empress", experience: 0, life: 380 },
  ]),
  rngState: 0x35_35_35_35,
  rngCalls: 35,
};

describe("stage 35 battle simulation", () => {
  it("builds the native fixed board while preserving campaign-only roster entries", () => {
    const battle = new Stage35Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 32, y: 10, life: 390,
    });
    expect(battle.unit("1:18")).toMatchObject({
      classId: "archer", name: "雷伊拉", portrait: 21, x: 19, y: 12,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-time-space-anomaly-force", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:39")).toMatchObject({
      id: "death-valley-fleeing-force", control: "independent-ai", tacticLabel: "原地待命",
    });
    expect(battle.campaignSnapshot().roster[22]).toMatchObject({ classId: "great-axe-warrior" });
    expect(battle.campaignSnapshot().roster[23]).toMatchObject({ classId: "empress" });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("wins only after all ten enemies leave and gives Nia defeat priority", () => {
    const battle = new Stage35Battle(campaign);
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps all behavior-12 enemies to a zero-distance wait", () => {
    const battle = new Stage35Battle(campaign);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies).toHaveLength(10);
    for (const enemy of enemies) {
      expect(battle.enemyBehaviorFor(enemy.id)).toBe(12);
      expect(battle.enemyMovementRange(enemy.id)).toEqual([{ x: enemy.x, y: enemy.y }]);
      expect(battle.planEnemyAiAction(enemy.id)).toEqual({
        unitId: enemy.id,
        kind: "wait",
        path: [{ x: enemy.x, y: enemy.y }],
      });
    }
  });

  it("never generates another enemy across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage35Battle({ ...campaign, difficulty });
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(10);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);
      battle.units = battle.units.filter(({ id }) => id !== initialEnemyIds[0]);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(9);
    }
  });

  it("refills every fixed ally to maximum life on entry but keeps a restored save damaged", () => {
    // 原版模块 29 新战初始化 `0000:536B` 按职业和累计经验重建 side 1 后把当前生命
    // 写为最大生命，所以上一关的残血不会跨关带入；编号存档恢复不重复这一步。
    const damaged: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => ({ ...entry, life: 7 })),
    };
    const battle = new Stage35Battle(damaged);
    for (const unit of battle.units.filter(({ side }) => side === 1)) {
      expect(unit.life, unit.id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:0")?.life).toBe(390);

    const wounded = new Stage35Battle(damaged);
    wounded.unit("1:0")!.life = 42;
    const restored = new Stage35Battle(damaged);
    restored.restore(wounded.serializableSnapshot(), wounded.campaignSnapshot().roster);
    expect(restored.unit("1:0")?.life).toBe(42);
  });

  it("uses the shared native construction terrain slot", () => {
    expect(STAGE35_IRON_PLATE_TERRAIN_SLOT).toBe(0);
    expect(STAGE35_OBSTACLE_TERRAIN_SLOT).toBe(0);
  });

  describe("REMAKE-170 wall-ledge enemies", () => {
    // B/0071 把槽 39/35/36 放在 (23,8)/(27,8)/(28,8) 的墙面格上，原版解析为槽 0：全职业移动
    // 规则 99、地形防御 99%。复刻把这三格按同排 (24..26,8) 碎牆台的槽 20 结算。
    const WALL_LEDGE_ENEMIES = [
      { id: "2:39", classId: "land-knight", x: 23, y: 8 },
      { id: "2:35", classId: "magic-armor-warrior", x: 27, y: 8 },
      { id: "2:36", classId: "half-dragon-warrior", x: 28, y: 8 },
    ] as const;

    const placeAt = (battle: Stage35Battle, id: string, x: number, y: number): void => {
      const unit = battle.unit(id);
      if (!unit) throw new Error(`missing ${id}`);
      unit.x = x;
      unit.y = y;
    };

    it("reads only the three enemy-occupied wall cells as the adjacent ledge slot", () => {
      const battle = new Stage35Battle(campaign);
      for (const { id, classId, x, y } of WALL_LEDGE_ENEMIES) {
        expect(stage35TerrainSlotAt({ x, y }), `native ${id}`).toBe(0);
        expect(battle.unit(id)).toMatchObject({ classId, x, y });
        expect(battle.terrainSlotAt({ x, y }), id).toBe(20);
      }
      for (let x = 24; x <= 26; x += 1) {
        expect(stage35TerrainSlotAt({ x, y: 8 })).toBe(20);
      }
      // 其余墙面、墙洞与异世界之门仍是原版槽 0。
      for (const position of [
        { x: 22, y: 8 }, { x: 29, y: 8 }, { x: 27, y: 7 }, { x: 28, y: 7 },
        { x: 23, y: 10 }, { x: 25, y: 12 },
      ]) {
        expect(battle.terrainSlotAt(position), `${position.x},${position.y}`).toBe(0);
      }
    });

    it("lets techniques and shots select the three enemies", () => {
      const battle = new Stage35Battle(campaign);
      placeAt(battle, "1:7", 25, 8);
      expect(battle.actionTargets("1:7", "fire-1").map(({ id }) => id))
        .toEqual(expect.arrayContaining(["2:39", "2:35"]));
      placeAt(battle, "1:7", 26, 8);
      expect(battle.actionTargets("1:7", "fire-1").map(({ id }) => id))
        .toEqual(expect.arrayContaining(["2:35", "2:36"]));

      placeAt(battle, "1:18", 25, 8);
      expect(battle.actionTargets("1:18", "archer-shot").map(({ id }) => id))
        .toEqual(expect.arrayContaining(["2:39", "2:35"]));
    });

    it("applies the ledge terrain defense to ordinary attacks", () => {
      // 困難重重的魔鎧防御 120：墙面格要破 120 + 118，碎牆台只需 120 + 12。
      const battle = new Stage35Battle({
        ...campaign,
        roster: completeCampaignRoster([
          ...campaign.roster,
          { slot: 2, classId: "great-axe-warrior", experience: 4000, life: 480 },
        ]),
      });
      placeAt(battle, "1:2", 26, 8);
      const attacker = battle.unit("1:2");
      const defender = battle.unit("2:35");
      if (!attacker || !defender) throw new Error("missing stage 35 duel");
      const attack = battle.effectiveStatsFor(attacker).attack;
      const defense = battle.effectiveStatsFor(defender).defense;
      expect(terrainDefensePercentFor("magic-armor-warrior", 0)).toBe(99);
      expect(terrainDefensePercentFor("magic-armor-warrior", 20)).toBe(10);
      const base = Math.max(0, attack - defense - Math.floor(defense * 10 / 100));
      const wallBase = Math.max(0, attack - defense - Math.floor(defense * 99 / 100));
      // 两段 8..14 区间不重叠，墙面格公式不可能打出下面的伤害。
      expect(base).toBeGreaterThan(wallBase + 14 - 8);
      // 满血时殘血減傷为 0%，所以伤害就是基础值加两次 4..7。
      const result = battle.attack("1:2", "2:35");
      expect(result.damage).toBeGreaterThanOrEqual(base + 8);
      expect(result.damage).toBeLessThanOrEqual(base + 14);
    });
  });
});
