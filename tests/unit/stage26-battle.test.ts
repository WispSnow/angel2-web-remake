import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE26_DEFINITION } from "../../src/game/content/stage26";
import {
  createStage26DeploymentRoster,
  Stage26Battle,
} from "../../src/game/simulation/stage26-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-26",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 760, life: 240 },
    { slot: 7, classId: "magic-priest", experience: 660, life: 180 },
    { slot: 8, classId: "cavalry", experience: 740, life: 220 },
  ]),
  rngState: 0x26_26_26_26,
  rngCalls: 18,
};

const fullDeployment = {
  placements: [
    ...STAGE26_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE26_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
      slot, position: { ...STAGE26_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 26 battle simulation", () => {
  it("builds the 22-unit deployment and all eight static enemies", () => {
    const roster = createStage26DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 660,
    });
    const battle = new Stage26Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(22);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(8);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 22, y: 31, life: 240,
    });
    expect(battle.unit("2:1")).toMatchObject({
      classId: "magic-master", name: "碧娜維姬", portrait: 8, x: 22, y: 15,
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native four-actor minimum deployment", () => {
    const battle = new Stage26Battle(campaign, {
      placements: STAGE26_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id))
      .toEqual(["1:1", "1:0", "1:8", "1:7"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(8);
  });

  it("wins only when Binaweiji is removed and gives Nia defeat priority", () => {
    const battle = new Stage26Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ id }) => id !== "2:1");
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
    expect(battle.outcome()).toBe("victory");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("maps seven guards to sentry and one priest to pursuit", () => {
    const battle = new Stage26Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    const sentries = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 1);
    const pursuers = enemies.filter(({ id }) => battle.enemyBehaviorFor(id) !== 1);
    expect(sentries).toHaveLength(7);
    expect(pursuers.map(({ id }) => id)).toEqual(["2:40"]);
    for (const enemy of sentries) expect(battle.enemyAiIntentFor(enemy.id)).toBe("sentry");
    for (const enemy of pursuers) expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
  });

  it("prepares then commits each of the two bottom-to-top column pushes", () => {
    const battle = new Stage26Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 26 test is missing Nia");
    expect(battle.prepareEnemyPhaseTail()?.moves).toEqual([]);
    nia.x = 22;
    nia.y = 20;
    nia.acted = true;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.enemyPhaseTailExecutionCount()).toBe(2);
    const first = battle.prepareEnemyPhaseTail();
    expect(first).toMatchObject({
      definitionId: "stage-26-column-push",
      presentationId: "stage-26-column-push-presentation",
      selectedUnitId: "1:0",
      origin: { x: 22, y: 13 },
      moves: [{ unitId: "1:0", from: { x: 22, y: 20 }, to: { x: 22, y: 23 } }],
    });
    expect(nia).toMatchObject({ x: 22, y: 20, acted: true });
    if (!first) throw new Error("stage 26 first tail was not prepared");
    battle.commitEnemyPhaseTail(first);
    expect(nia).toMatchObject({ x: 22, y: 23, acted: true });

    const second = battle.prepareEnemyPhaseTail();
    expect(second).toMatchObject({
      selectedUnitId: "1:0",
      origin: { x: 22, y: 13 },
      moves: [{ unitId: "1:0", from: { x: 22, y: 23 }, to: { x: 22, y: 26 } }],
    });
    if (!second) throw new Error("stage 26 second tail was not prepared");
    battle.commitEnemyPhaseTail(second);
    expect(nia).toMatchObject({ x: 22, y: 26, acted: true });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
  });
});
