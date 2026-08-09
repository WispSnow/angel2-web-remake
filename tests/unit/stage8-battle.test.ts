import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { Stage8Battle, createStage8Units } from "../../src/game/simulation/stage8-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-08",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 8, classId: "magician", experience: 500, life: 180 },
    { slot: 17, classId: "land-knight", experience: 620, life: 220 },
    { slot: 18, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

describe("stage 8 battle simulation", () => {
  it("builds the fixed eight-versus-eleven battle and preserves its control split", () => {
    expect(createStage8Units(campaign.difficulty, campaign.roster)).toHaveLength(19);
    const battle = new Stage8Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(11);
    expect(battle.unit("1:8")).toMatchObject({
      classId: "cavalry", name: "蘇蘭達", portrait: 10, x: 23, y: 30,
    });
    expect(battle.unit("1:17")).toMatchObject({ classId: "land-knight", name: "阿曼妮" });
    expect(battle.unit("1:18")).toMatchObject({ classId: "priest", name: "雷伊拉" });
    expect(["1:8", "1:17", "1:18"].map((id) => battle.isPlayerControllableAlly(id)))
      .toEqual([true, true, true]);
    expect(battle.alliedActionOrder(false)).toEqual([
      "1:40", "1:43", "1:41", "1:42", "1:44",
    ]);
    expect(battle.forceForUnit("1:8")).toMatchObject({
      id: "sulanda-ranger-command", control: "player",
    });
    expect(battle.forceForUnit("1:40")).toMatchObject({
      id: "ranger-screening-force", control: "independent-ai",
    });
    expect(battle.forceForUnit("2:30")).toMatchObject({
      id: "dragon-tower-camp-raiders", control: "independent-ai",
    });
  });

  it("wins only after all enemies leave and loses when Sulanda leaves", () => {
    const ongoing = new Stage8Battle(campaign);
    ongoing.units = ongoing.units.filter(({ side, id }) => side === 1 || id === "2:39");
    expect(ongoing.outcome()).toBe("ongoing");

    const victorious = new Stage8Battle(campaign);
    victorious.units = victorious.units.filter(({ side }) => side === 1);
    expect(victorious.outcome()).toBe("victory");

    const defeated = new Stage8Battle(campaign);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:8");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("uses ordinary terrain and round transitions without inherited force-field damage", () => {
    const battle = new Stage8Battle(campaign);
    const lifeBefore = battle.units.map(({ id, life }) => [id, life] as const);
    expect(battle.routePulseSafeAreaForUnit("1:8")).toEqual([]);
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.map(({ id, life }) => [id, life] as const)).toEqual(lifeBefore);
  });
});
