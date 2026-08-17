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
  it("builds the fixed eight-versus-eleven battle with all allies player-controlled", () => {
    expect(createStage8Units(campaign.difficulty, campaign.roster)).toHaveLength(19);
    const battle = new Stage8Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(11);
    expect(battle.unit("1:8")).toMatchObject({
      classId: "cavalry", name: "蘇蘭達", portrait: 10, x: 23, y: 30,
    });
    expect(battle.unit("1:17")).toMatchObject({
      classId: "land-knight", name: "阿曼妮", life: 340,
    });
    expect(battle.unit("1:18")).toMatchObject({
      classId: "priest", name: "雷伊拉", life: 265,
    });
    for (const id of ["1:8", "1:40", "1:41", "1:42", "1:43", "1:44"]) {
      const unit = battle.unit(id)!;
      expect(unit.life, id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:40")).toMatchObject({
      classId: "cavalry", experience: 0, life: 200,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:8")).toMatchObject({
      id: "sulanda-ranger-command", control: "player",
    });
    expect(battle.forceForUnit("1:40")).toMatchObject({
      id: "sulanda-ranger-command", control: "player",
    });
    expect(battle.forceForUnit("2:30")).toMatchObject({
      id: "dragon-tower-camp-raiders", control: "independent-ai",
    });
  });

  it("keeps campaign experience when the template overrides the class", () => {
    // 原版模块 27 只写非零 side-1 职业覆写，不碰 `ME_EXP`；模块 29 `0000:536B` 随后用
    // 同一份累计经验重走新职业的成长行。所以覆写是等价经验换算，不是重置——与转职
    // （`PROMO-006` 提交时经验清零）是两套语义。
    const promoted: CampaignState = {
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 40, classId: "warrior", experience: 400, life: 260 },
      ]),
    };
    const battle = new Stage8Battle(promoted);
    const overridden = battle.unit("1:40")!;
    expect(overridden).toMatchObject({ classId: "cavalry", experience: 400 });
    expect(battle.statsFor(overridden))
      .toMatchObject({ attack: 65, defense: 36, maxLife: 260, movement: 8, level: 3 });
    // 覆写后的职业与保留的经验一起写回战役档，玩家在第 2 关选的戰士不会回来。
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 40))
      .toMatchObject({ classId: "cavalry", experience: 400 });
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

  it("lets a player magician handed to free action select an expert technique", () => {
    const battle = new Stage8Battle({
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 8, classId: "cavalry", experience: 500, life: 180 },
        { slot: 17, classId: "magician", experience: 620, life: 180 },
        { slot: 18, classId: "priest", experience: 580, life: 180 },
      ]),
    });
    const magician = battle.unit("1:17")!;
    const targets = [battle.unit("2:30")!, battle.unit("2:35")!];
    battle.units = battle.units.filter((unit) =>
      unit.side === 1 || targets.some(({ id }) => id === unit.id));
    Object.assign(magician, { x: 24, y: 30 });
    Object.assign(targets[0], { x: 26, y: 30 });
    Object.assign(targets[1], { x: 26, y: 31 });

    expect(battle.planAlliedAiAction(magician.id)).toMatchObject({
      unitId: magician.id,
      kind: "special",
    });
  });

  it("lets a formerly automatic ranger use expert techniques after a free-action handoff", () => {
    const battle = new Stage8Battle(campaign);
    const magician = battle.unit("1:40")!;
    const targets = [battle.unit("2:30")!, battle.unit("2:35")!];
    Object.assign(magician, {
      classId: "magician",
      className: "魔術士",
      x: 24,
      y: 30,
    });
    battle.units = battle.units.filter((unit) =>
      unit.side === 1 || targets.some(({ id }) => id === unit.id));
    Object.assign(targets[0], { x: 26, y: 30 });
    Object.assign(targets[1], { x: 26, y: 31 });

    expect(battle.isPlayerControllableAlly(magician.id)).toBe(true);
    expect(battle.planAlliedAiAction(magician.id)).toMatchObject({
      unitId: magician.id,
      kind: "special",
    });
  });
});
