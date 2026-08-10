import { describe, expect, it } from "vitest";
import { classStatsFor } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE13_DEFINITION } from "../../src/game/content/stage13";
import { Stage13Battle, createStage13DeploymentRoster } from "../../src/game/simulation/stage13-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-13",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 1, classId: "soldier", experience: 299, life: 120 },
    { slot: 24, classId: "wizard", experience: 660, life: 150 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const fullDeployment = {
  placements: [
    ...STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE13_DEFINITION.deployment.optionalSlots.slice(0, 11).map((slot, index) => ({
      slot, position: { ...STAGE13_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 13 battle simulation", () => {
  it("builds a twelve-unit player strike team and Marsiel's nine-unit expert guard", () => {
    const roster = createStage13DeploymentRoster(campaign);
    expect(roster).toHaveLength(22);
    expect(roster.find(({ slot }) => slot === 10)).toMatchObject({
      classId: "water-warrior",
      experience: 299,
      life: classStatsFor({ classId: "water-warrior", experience: 299 }).maxLife,
    });
    expect(roster.find(({ slot }) => slot === 11)).toMatchObject({
      classId: "water-warrior", experience: 299,
    });

    const battle = new Stage13Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(12);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(9);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 36, y: 37, life: 240,
    });
    expect(battle.unit("1:10")).toMatchObject({ classId: "water-warrior", name: "瑪琳", portrait: 26 });
    expect(battle.unit("1:11")).toMatchObject({ classId: "water-warrior", name: "摩莉娜", portrait: 27 });
    expect(battle.unit("2:24")).toMatchObject({
      classId: "divine-sword-warrior", name: "瑪西爾", portrait: 31, x: 19, y: 17,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-dragon-tower-strike-team", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:24")).toMatchObject({
      id: "marsiel-dragon-tower-guard", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage13Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("uses water warrior only as an untouched newcomer baseline", () => {
    const inheritedCampaign: CampaignState = {
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 10, classId: "land-knight", experience: 640, life: 210 },
      ]),
    };
    expect(createStage13DeploymentRoster(inheritedCampaign).find(({ slot }) => slot === 10))
      .toMatchObject({ classId: "land-knight", experience: 640, life: 210 });
    expect(createStage13DeploymentRoster(inheritedCampaign).find(({ slot }) => slot === 11))
      .toMatchObject({ classId: "water-warrior", experience: 299 });
  });

  it("has exactly the nine opening enemies and no later reinforcement", () => {
    const battle = new Stage13Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    expect(enemies).toEqual(["2:24", "2:43", "2:46", "2:47", "2:41", "2:42", "2:45", "2:48", "2:49"]);
    battle.startNextRound();
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(enemies);
  });

  it("wins when Marsiel leaves even if eight guards remain and prioritizes Nia's defeat", () => {
    const victory = new Stage13Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ id }) => id !== "2:24");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(8);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage13Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:43");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage13Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:24");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives every guard a legal shared expert-AI action", () => {
    const battle = new Stage13Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
