import { describe, expect, it } from "vitest";
import { STAGE1_DEFINITION } from "../../src/game/content/stage1";
import { finishDeployment, createDeploymentState, reduceDeployment } from "../../src/game/simulation/deployment";
import { Stage1Battle } from "../../src/game/simulation/stage1-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-01",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: [
    { slot: 0, classId: "cavalry", experience: 450, life: 100 },
    { slot: 1, classId: "archer", experience: 360, life: 90 },
    { slot: 40, classId: "soldier", experience: 40, life: 70 },
    { slot: 41, classId: "soldier", experience: 41, life: 71 },
    { slot: 42, classId: "soldier", experience: 42, life: 72 },
    { slot: 43, classId: "soldier", experience: 43, life: 73 },
  ],
  rngState: 0x12345678,
  rngCalls: 7,
};

function deploymentWithMagician() {
  let state = createDeploymentState(
    STAGE1_DEFINITION.deployment,
    STAGE1_DEFINITION.deployment.eligibleSlots,
  );
  state = reduceDeployment(state, { type: "toggle-roster-slot", slot: 24 });
  return finishDeployment(state);
}

describe("stage 1 battle construction", () => {
  it("builds deployment-selected allies, applies the magician override, and loads evidence-backed enemies", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());

    expect(battle.stage.id).toBe("stage-01");
    expect(battle.rng.state).toBe(campaign.rngState);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(6);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "cavalry",
      experience: 450,
      x: 22,
      y: 36,
    });
    expect(battle.unit("1:24")).toMatchObject({
      classId: "magician",
      name: "葛蒂拉斯",
      x: 21,
      y: 33,
    });
    expect(battle.unit("2:16")).toMatchObject({
      classId: "cavalry",
      name: "芳",
      x: 25,
      y: 16,
    });
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
    expect(battle.enemyBehaviorFor("2:43")).toBe(2);
  });

  it("uses the stage objective contract instead of requiring enemy elimination", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    expect(battle.outcome()).toBe("ongoing");
    battle.units = battle.units.filter(({ id }) => id !== "2:16");
    expect(battle.outcome()).toBe("victory");
    expect(battle.units.some(({ side }) => side === 2)).toBe(true);
  });

  it("exposes the same fire/heal selection radius to enemy sisters", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const sister = battle.unit("2:43")!;
    const fire = battle.actionRange(sister.id, "fire-1");
    const heal = battle.actionRange(sister.id, "heal-1");
    expect(fire.valueAt(sister)).toBe(6);
    expect(heal.valueAt(sister)).toBe(6);
    expect(fire.cells()).toEqual(heal.cells());
  });

  it("lets enemy sisters select fire at the unified radius-5 boundary", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const sister = battle.unit("2:43")!;
    const target = battle.unit("1:0")!;
    const boundary = battle.actionRange(sister.id, "fire-1").cells()
      .find((position) => battle.actionRange(sister.id, "fire-1").valueAt(position) === 1)!;
    target.x = boundary.x;
    target.y = boundary.y;
    battle.units = [sister, target];
    battle.rng.state = 2;

    expect(battle.planEnemyAiAction(sister.id, 2)).toMatchObject({
      unitId: sister.id,
      kind: "special",
      actionId: "fire-1",
      targetId: target.id,
      path: [{ x: sister.x, y: sister.y }],
    });
  });

  it("lets enemy sisters choose real missing life for heal", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const sister = battle.unit("2:43")!;
    const ally = battle.unit("2:16")!;
    const targetCell = battle.actionRange(sister.id, "heal-1").cells()
      .find((position) => position.x !== sister.x || position.y !== sister.y)!;
    ally.x = targetCell.x;
    ally.y = targetCell.y;
    ally.life -= 10;
    battle.units = [sister, ally];
    battle.rng.state = 1;

    expect(battle.planEnemyAiAction(sister.id, 2)).toMatchObject({
      unitId: sister.id,
      kind: "special",
      actionId: "heal-1",
      targetId: ally.id,
    });
  });
});
