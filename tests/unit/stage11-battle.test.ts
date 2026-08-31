import { describe, expect, it } from "vitest";
import { completeCampaignRoster, initialEnemyExperience } from "../../src/game/content/stage0";
import { Stage11Battle, createStage11Units } from "../../src/game/simulation/stage11-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-11",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 8, classId: "land-knight", experience: 680, life: 220 },
    { slot: 9, classId: "curse-master", experience: 620, life: 180 },
    { slot: 17, classId: "pegasus-warrior", experience: 620, life: 210 },
    { slot: 18, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

describe("stage 11 battle simulation", () => {
  it("builds the fixed nine-versus-one battle with all allies player-controlled", () => {
    expect(createStage11Units(campaign.difficulty, campaign.roster)).toHaveLength(10);
    const battle = new Stage11Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(1);
    expect(battle.unit("1:9")).toMatchObject({
      classId: "curse-master", name: "多莉", portrait: 13, x: 26, y: 2,
    });
    expect(battle.unit("1:8")).toMatchObject({
      classId: "land-knight", name: "蘇蘭達", portrait: 10, x: 26, y: 35, life: 340,
    });
    for (const id of ["1:40", "1:41", "1:42"]) {
      const unit = battle.unit(id)!;
      expect(unit.life, id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:42")).toMatchObject({
      classId: "cavalry", experience: 0, life: 200, x: 22, y: 35,
    });
    expect(battle.unit("2:21")).toMatchObject({
      classId: "pegasus-warrior", x: 36, y: 48,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:8")).toMatchObject({
      id: "sulanda-ranger-evacuation", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:21")).toMatchObject({
      id: "pegasus-pursuer", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("retains Web difficulty levels for the opening pursuer and reinforcements", () => {
    const levels = [2, 4, 6, 5] as const;
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage11Battle({ ...campaign, difficulty });
      battle.beginEnemyPhase();
      for (const id of ["2:21", "2:40"]) {
        const enemy = battle.unit(id)!;
        expect(enemy.experience, `${difficulty}:${id}`)
          .toBe(initialEnemyExperience(enemy.classId, difficulty));
        expect(battle.statsFor(enemy).level, `${difficulty}:${id}`).toBe(levels[difficulty]);
      }
    }
  });

  it("wins only when Sulanda reaches cells 0..279 and loses if she leaves", () => {
    const battle = new Stage11Battle(campaign);
    battle.units = battle.units.filter(({ side }) => side === 1);
    expect(battle.outcome()).toBe("ongoing");

    const sulanda = battle.unit("1:8")!;
    Object.assign(sulanda, { x: 30, y: 5 });
    expect(battle.outcome()).toBe("ongoing");
    Object.assign(sulanda, { x: 29, y: 5 });
    expect(battle.outcome()).toBe("victory");

    const defeated = new Stage11Battle(campaign);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:8");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("removes Dori only as a story departure without changing the campaign roster", () => {
    const battle = new Stage11Battle(campaign);
    const rosterBefore = battle.campaignSnapshot().roster;
    expect(battle.removeStoryUnits([{ side: 1, slot: 9 }])).toEqual(["1:9"]);
    expect(battle.unit("1:9")).toBeUndefined();
    expect(battle.outcome()).toBe("ongoing");
    expect(battle.campaignSnapshot().roster).toEqual(rosterBefore);
  });

  it("gives the lone Pegasus pursuer a legal expert action", () => {
    const battle = new Stage11Battle(campaign);
    expect(battle.planEnemyAiAction("2:21")).toMatchObject({ unitId: "2:21" });
  });

  it("spawns one reinforcement at the lower edge before each enemy phase", () => {
    const battle = new Stage11Battle(campaign);
    const callsBefore = battle.rng.calls;

    battle.beginEnemyPhase();
    expect(battle.unit("2:40")).toMatchObject({
      classId: "cavalry",
      x: 32,
      y: 48,
      acted: false,
      actionDisabled: false,
    });
    expect(battle.enemyActionOrder()).toContain("2:40");
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "pegasus-pursuer",
      label: "追擊增援隊",
      doctrine: { strategy: "expert" },
    });
    expect(battle.rng.calls).toBe(callsBefore);

    battle.beginEnemyPhase();
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(2);
    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.unit("2:41")).toMatchObject({
      classId: "pegasus-warrior",
      x: 31,
      y: 48,
    });
  });

  it("reuses a defeated slot and preserves generated units across restore", () => {
    const battle = new Stage11Battle(campaign);
    battle.beginEnemyPhase();
    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.enemyBehaviorFor("2:41")).toBe(0);

    const restored = new Stage11Battle(campaign);
    restored.restore(battle.serializableSnapshot(), battle.campaignSnapshot().roster);
    expect(restored.forceForUnit("2:40")?.id).toBe("pegasus-pursuer");
    expect(restored.forceForUnit("2:41")?.id).toBe("pegasus-pursuer");
    expect(restored.unit("2:40")).toMatchObject({ classId: "cavalry", x: 32, y: 48 });

    restored.removeStoryUnits([{ side: 2, slot: 40 }]);
    restored.startNextRound();
    restored.beginEnemyPhase();
    expect(restored.unit("2:40")).toMatchObject({ classId: "cavalry", x: 32, y: 48 });
    expect(restored.unit("2:42")).toBeUndefined();
  });

  it("uses all 40 simultaneous native slots and then stops until one is removed", () => {
    const battle = new Stage11Battle(campaign);
    for (let index = 0; index < 40; index += 1) {
      battle.beginEnemyPhase();
      if (index < 39) battle.startNextRound();
    }
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(41);
    expect(battle.unit("2:79")).toMatchObject({ classId: "soldier" });

    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(41);
  });
});
