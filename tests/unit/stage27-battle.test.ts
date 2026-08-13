import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE27_DEFINITION } from "../../src/game/content/stage27";
import {
  createStage27DeploymentRoster,
  Stage27Battle,
} from "../../src/game/simulation/stage27-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-27",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 800, life: 250 },
    { slot: 7, classId: "magic-priest", experience: 700, life: 190 },
    { slot: 45, classId: "crossbow", experience: 460, life: 150 },
  ]),
  rngState: 0x27_27_27_27,
  rngCalls: 22,
};

const fullDeployment = {
  placements: [
    ...STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE27_DEFINITION.deployment.optionalSlots.slice(0, 20).map((slot, index) => ({
      slot, position: { ...STAGE27_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 27 battle simulation", () => {
  it("builds 31 allies, five static rebels, and inherited campaign units", () => {
    const roster = createStage27DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot)).not.toEqual(
      expect.arrayContaining([22, 40, 41, 42, 43, 44, 45, 56, 57, 58]),
    );
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 700,
    });
    expect(roster.find(({ slot }) => slot === 45)).toBeUndefined();
    const battle = new Stage27Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(31);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 39, y: 37, life: 250,
    });
    expect(battle.unit("1:22")).toMatchObject({
      classId: "great-axe-warrior", name: "愛莉歐拉", x: 20, y: 11,
    });
    expect(battle.unit("1:45")).toMatchObject({ classId: "crossbow", x: 21, y: 14 });
    expect(battle.units.filter(({ side, classId }) => side === 1 && classId === "engineer"))
      .toHaveLength(3);
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native eleven-fixed minimum", () => {
    const battle = new Stage27Battle(campaign, {
      placements: STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual([
      "1:22", "1:41", "1:44", "1:43", "1:45", "1:42", "1:40",
      "1:57", "1:56", "1:58", "1:0",
    ]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
  });

  it("assigns seven defenders to allied AI and keeps Nia, engineers, and candidates player-controlled", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    expect(battle.forceForUnit("1:22")).toMatchObject({
      id: "valkyrie-city-defense", control: "independent-ai",
    });
    expect(battle.forceForUnit("1:41")?.unitIds).toHaveLength(7);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-valkyrie-return-team", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("1:57")?.control).toBe("player");
    expect(battle.forceForUnit("1:1")?.control).toBe("player");
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "valkyrie-rebels", control: "independent-ai",
    });
  });

  it("uses all four exact destination ranges without requiring rebel elimination", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 27 test is missing Nia");
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);

    nia.x = 25;
    nia.y = 14;
    expect(battle.outcome()).toBe("victory");
    nia.x = 26;
    nia.y = 14;
    expect(battle.outcome()).toBe("ongoing");
    nia.x = 16;
    nia.y = 12;
    expect(battle.outcome()).toBe("victory");
    nia.x = 15;
    nia.y = 12;
    expect(battle.outcome()).toBe("ongoing");
    nia.x = 25;
    nia.y = 11;
    expect(battle.outcome()).toBe("victory");
    nia.x = 26;
    nia.y = 11;
    expect(battle.outcome()).toBe("ongoing");
  });

  it("gives Nia defeat priority and sends all five rebels into pursuit", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 27 test is missing Nia");
    nia.x = 25;
    nia.y = 14;
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    }
  });
});
