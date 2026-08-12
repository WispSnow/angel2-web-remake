import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE22_DEFINITION,
  STAGE22_SEMANTIC_ENEMIES,
} from "../../src/game/content/stage22";
import { createFixedStageEnemy } from "../../src/game/simulation/fixed-stage-battle";
import {
  createStage22DeploymentRoster,
  Stage22Battle,
} from "../../src/game/simulation/stage22-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-22",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    { slot: 10, classId: "water-warrior", experience: 299, life: 250 },
    { slot: 11, classId: "water-warrior", experience: 299, life: 250 },
  ]),
  rngState: 0x22_22_22_22,
  rngCalls: 12,
};

const fullDeployment = {
  placements: [
    ...STAGE22_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE22_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
      slot, position: { ...STAGE22_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

const appendAmbush = (battle: Stage22Battle): void => {
  battle.appendStoryUnits(STAGE22_SEMANTIC_ENEMIES.map((enemy) => createFixedStageEnemy(
    enemy,
    campaign.difficulty,
  )));
};

describe("stage 22 battle simulation", () => {
  it("builds the nineteen-unit deployment before any enemy is visible", () => {
    const roster = createStage22DeploymentRoster(campaign);
    expect(roster).toHaveLength(28);
    for (const slot of [25, 26, 27, 28, 29, 30, 31]) {
      expect(roster.find((unit) => unit.slot === slot)).toMatchObject({
        classId: "half-dragon-warrior",
        experience: 299,
      });
    }
    const battle = new Stage22Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(19);
    expect(battle.units.filter(({ side }) => side === 2)).toEqual([]);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 23, y: 34, life: 240,
    });
    expect(battle.isPlayerControllableAlly("1:0")).toBe(true);
    expect(battle.outcome()).toBe("victory");
  });

  it("accepts the native minimum deployment", () => {
    const battle = new Stage22Battle(campaign, {
      placements: STAGE22_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("wins when the Dragon leaves while all five magic priests remain", () => {
    const victory = new Stage22Battle(campaign, fullDeployment);
    appendAmbush(victory);
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(6);
    victory.units = victory.units.filter(({ id }) => id !== "2:28");
    expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(victory.outcome()).toBe("victory");

    const ongoing = new Stage22Battle(campaign, fullDeployment);
    appendAmbush(ongoing);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:2");
    expect(ongoing.outcome()).toBe("ongoing");

    const simultaneous = new Stage22Battle(campaign, fullDeployment);
    appendAmbush(simultaneous);
    simultaneous.units = simultaneous.units.filter(({ id }) => id !== "1:0" && id !== "2:28");
    expect(simultaneous.outcome()).toBe("defeat");
  });

  it("gives all six event-inserted enemies shared AI actions", () => {
    const battle = new Stage22Battle(campaign, fullDeployment);
    appendAmbush(battle);
    for (const id of ["2:40", "2:41", "2:42", "2:43"]) {
      expect(battle.unit(id), id).toMatchObject({
        classId: "magic-priest",
        name: "魔祭師",
        portrait: 49,
      });
    }
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
