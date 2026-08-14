import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE35_IRON_PLATE_TERRAIN_SLOT,
  STAGE35_OBSTACLE_TERRAIN_SLOT,
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
      classId: "land-knight", name: "妮雅", portrait: 46, x: 32, y: 10, life: 270,
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

  it("uses the shared native construction terrain slot", () => {
    expect(STAGE35_IRON_PLATE_TERRAIN_SLOT).toBe(0);
    expect(STAGE35_OBSTACLE_TERRAIN_SLOT).toBe(0);
  });
});
