import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { Stage2Battle } from "../../src/game/simulation/stage2-battle";
import { createFixedStageUnits } from "../../src/game/simulation/fixed-stage-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-02",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "cavalry", experience: 450, life: 100 },
    { slot: 2, classId: "archer", experience: 360, life: 90 },
    { slot: 53, classId: "warrior", experience: 100, life: 110 },
    { slot: 24, classId: "soldier", experience: 0, life: 160 },
  ]),
  rngState: 0x12345678,
  rngCalls: 7,
};

describe("stage 2 battle construction and allied automation", () => {
  it("fills omitted generic portraits for both fixed-stage sides", () => {
    const units = createFixedStageUnits({
      alliedUnits: [{
        slot: 40,
        position: { x: 20, y: 20 },
        name: "戰士",
        aiBehavior: 0,
      }],
      enemyUnits: [{
        slot: 40,
        position: { x: 21, y: 20 },
        classId: "archer",
        name: "弓兵",
        aiBehavior: 0,
      }],
      inheritance: {
        genericPortrait: 47,
        defaultClassId: "soldier",
        untouchedNamedExperience: 299,
      },
    }, 0, [{ slot: 40, classId: "warrior", experience: 480, life: 180 }]);

    expect(units).toEqual([
      expect.objectContaining({ side: 1, classId: "warrior", portrait: 57 }),
      expect.objectContaining({ side: 2, classId: "archer", portrait: 60 }),
    ]);
  });

  it("builds the fixed 9 vs 5 roster with inherited classes and the untouched magician baseline", () => {
    const battle = new Stage2Battle(campaign);
    expect(battle.stage.id).toBe("stage-02");
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "cavalry",
      portrait: 46,
      x: 21,
      y: 35,
    });
    expect(battle.unit("1:2")).toMatchObject({ classId: "archer", x: 28, y: 35 });
    // REMAKE-108: the (27,33) post now belongs to campaign slot 53, not 40.
    expect(battle.unit("1:53")).toMatchObject({
      classId: "warrior",
      portrait: 57,
      x: 27,
      y: 33,
    });
    expect(battle.unit("1:40")).toBeUndefined();
    expect(battle.unit("1:24")).toMatchObject({
      classId: "magician",
      name: "葛蒂拉斯",
      x: 25,
      y: 35,
    });
    expect(battle.unit("2:18")).toMatchObject({
      classId: "cavalry",
      name: "萊莉",
      portrait: 19,
      x: 25,
      y: 21,
    });
  });

  it("preserves Gadirath's promoted campaign class", () => {
    const promotedCampaign: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => entry.slot === 24
        ? { ...entry, classId: "magic-master", experience: 1_050, life: 300 }
        : entry),
    };
    const battle = new Stage2Battle(promotedCampaign);
    expect(battle.unit("1:24")).toMatchObject({
      classId: "magic-master",
      experience: 1_050,
      life: 310,
    });
  });

  it("only exposes behavior-0 allies to player commands", () => {
    const battle = new Stage2Battle(campaign);
    expect(["1:0", "1:2", "1:24"].map((id) => battle.isPlayerControllableAlly(id)))
      .toEqual([true, true, true]);
    expect(["1:44", "1:45", "1:51", "1:52", "1:53", "1:54"]
      .map((id) => battle.isPlayerControllableAlly(id)))
      .toEqual([false, false, false, false, false, false]);
    expect(battle.alliedActionOrder(false)).toEqual([
      "1:44", "1:45", "1:51", "1:52", "1:53", "1:54",
    ]);
  });

  it("keeps automatic allies for the allied phase when all manual units rest", () => {
    const battle = new Stage2Battle(campaign);
    for (const id of ["1:0", "1:2", "1:24"]) battle.unit(id)!.life -= 10;
    const result = battle.restAllUnspentAllies();
    expect(result.count).toBe(3);
    expect(battle.playerManualPhaseComplete()).toBe(true);
    expect(battle.alliedActionOrder(false)).toHaveLength(6);
    expect(battle.unit("1:44")?.acted).toBe(false);
  });

  it("plans automatic allied and ordinary enemy actions without consuming PRNG during planning", () => {
    const battle = new Stage2Battle(campaign);
    const before = { state: battle.rng.state, calls: battle.rng.calls };
    expect(battle.planAlliedAiAction("1:44")).toMatchObject({ unitId: "1:44" });
    expect(battle.planEnemyAiAction("2:47")).toMatchObject({ unitId: "2:47" });
    expect(battle.enemyMovementRange("2:47").length).toBeGreaterThan(1);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before);
  });

  it("uses the leader slot objective and preserves remaining enemies", () => {
    const battle = new Stage2Battle(campaign);
    battle.units = battle.units.filter(({ id }) => id !== "2:47");
    expect(battle.outcome()).toBe("ongoing");
    battle.units = battle.units.filter(({ id }) => id !== "2:18");
    expect(battle.outcome()).toBe("victory");
    expect(battle.units.some(({ side }) => side === 2)).toBe(true);
  });

  it("serializes a campaign roster that matches every fixed ally", () => {
    const battle = new Stage2Battle(campaign);
    const roster = new Map(battle.campaignSnapshot().roster.map((entry) => [entry.slot, entry]));
    for (const unit of battle.units.filter(({ side }) => side === 1)) {
      expect(roster.get(unit.slot)).toMatchObject({
        classId: unit.classId,
        experience: unit.experience,
        life: unit.life,
      });
    }
  });
});
