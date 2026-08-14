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

function activateCastleGuard(battle: Stage1Battle): void {
  battle.restore({
    ...battle.serializableSnapshot(),
    enemyAi: {
      activeGroupIds: ["castle-guard"],
      pendingNoticeGroupIds: [],
      fangPursuitRound: battle.round + 1,
    },
  });
}

describe("stage 1 battle construction", () => {
  it("builds deployment-selected allies, applies the untouched magician baseline, and loads evidence-backed enemies", () => {
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
      name: "娜米",
      portrait: 20,
      x: 25,
      y: 16,
    });
    expect(battle.unit("2:43")).toMatchObject({
      classId: "sister",
      name: "騎士團修女",
      portrait: 49,
    });
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(7);
    expect(battle.enemyBehaviorFor("2:43")).toBe(2);
  });

  it("preserves Gadirath's promoted campaign class", () => {
    const promotedCampaign: CampaignState = {
      ...campaign,
      roster: [
        ...campaign.roster,
        { slot: 24, classId: "wizard", experience: 1_050, life: 300 },
      ],
    };

    const battle = new Stage1Battle(promotedCampaign, deploymentWithMagician());
    expect(battle.unit("1:24")).toMatchObject({
      classId: "wizard",
      experience: 1_050,
      life: 310,
    });
  });

  it("uses inherited class portraits for generic allies and preserves named portraits", () => {
    const promotedCampaign: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => entry.slot === 40
        ? { ...entry, classId: "warrior", experience: 480 }
        : entry),
    };

    const battle = new Stage1Battle(promotedCampaign, deploymentWithMagician());
    expect(battle.unit("1:40")).toMatchObject({
      classId: "warrior",
      className: "戰士",
      name: "戰士",
      portrait: 57,
    });
    expect(battle.unit("1:0")).toMatchObject({ classId: "cavalry", portrait: 46 });
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
    // Native seed 5 at the caster cell; the map reaches four cells.
    expect(fire.valueAt(sister)).toBe(5);
    expect(heal.valueAt(sister)).toBe(5);
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
    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: ["castle-guard"] });

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
    activateCastleGuard(battle);

    expect(battle.planEnemyAiAction(sister.id, 2)).toMatchObject({
      unitId: sister.id,
      kind: "special",
      actionId: "heal-1",
      targetId: ally.id,
    });
  });

  it("starts the lower soldiers in pursuit while the castle guard and Fang hold", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.enemyAiIntentFor("2:45")).toBe("pursuit");
    expect(battle.enemyAiIntentFor("2:46")).toBe("pursuit");
    for (const id of ["2:40", "2:41", "2:42", "2:43"]) {
      expect(battle.enemyAiIntentFor(id)).toBe("alert");
      expect(battle.planEnemyAiAction(id)).toMatchObject({ kind: "wait" });
    }
    expect(battle.enemyAiIntentFor("2:16")).toBe("sentry");
    expect(battle.planEnemyAiAction("2:16")).toMatchObject({ kind: "wait" });
    expect(battle.planEnemyAiAction("2:45")).toMatchObject({ kind: "move" });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
  });

  it("previews the movement budget of each enemy's current intent", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    const patrol = battle.unit("2:45")!;
    const patrolRange = battle.enemyMovementRange(patrol.id);
    expect(patrolRange).toContainEqual({ x: patrol.x, y: patrol.y });
    expect(patrolRange.length).toBeGreaterThan(1);

    const guard = battle.unit("2:40")!;
    const alertRange = battle.enemyMovementRange(guard.id);
    expect(alertRange).toContainEqual({ x: guard.x, y: guard.y });
    expect(alertRange.length).toBeGreaterThan(1);
    const fang = battle.unit("2:16")!;
    expect(battle.enemyMovementRange(fang.id)).toEqual([{ x: fang.x, y: fang.y }]);

    activateCastleGuard(battle);
    expect(battle.enemyMovementRange(guard.id)).toEqual(alertRange);
    expect(battle.enemyMovementRange(fang.id)).toEqual([{ x: fang.x, y: fang.y }]);

    battle.unit(guard.id)!.actionDisabled = true;
    expect(battle.enemyMovementRange(guard.id)).toEqual([]);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
  });

  it("ignores move-plus-technique and Fang reach when the second group cannot deal damage", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    player.x = 25;
    player.y = 21;

    for (const sisterId of ["2:42", "2:43"]) {
      expect(battle.actionRange(sisterId, "fire-1").valueAt(player)).toBe(0);
    }
    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: [] });
    for (const id of ["2:40", "2:41", "2:42", "2:43"]) {
      expect(battle.enemyAiIntentFor(id)).toBe("alert");
    }

    const pursuing = new Stage1Battle(campaign, deploymentWithMagician());
    const pursuitTarget = pursuing.unit("1:0")!;
    pursuitTarget.x = player.x;
    pursuitTarget.y = player.y;
    activateCastleGuard(pursuing);
    const sisterAction = pursuing.planEnemyAiAction("2:43");
    expect(sisterAction).toMatchObject({ kind: "move" });
    expect(sisterAction?.path.length).toBeGreaterThan(1);
    expect(sisterAction).not.toHaveProperty("actionId");
    pursuing.startNextRound();
    expect(pursuing.planEnemyAiAction("2:16")).toMatchObject({
      kind: "attack",
      targetId: pursuitTarget.id,
    });
  });

  it("activates the second group when a member can move and ordinary-attack this turn", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    const guard = battle.unit("2:40")!;
    const sisterRanges = ["2:42", "2:43"].map((id) => battle.actionRange(id, "fire-1"));
    const candidate = battle.reachableCells(guard.id)
      .flatMap(({ x, y }) => [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ])
      .find((position) =>
        position.x >= 0
        && position.y >= 0
        && position.x < battle.stage.width
        && position.y < battle.stage.height
        && Math.abs(position.x - guard.x) + Math.abs(position.y - guard.y) > 1
        && !battle.unitAt(position)
        && sisterRanges.every((range) => range.valueAt(position) === 0));
    expect(candidate).toBeDefined();
    if (!candidate) return;
    player.x = candidate.x;
    player.y = candidate.y;

    expect(sisterRanges.every((range) => range.valueAt(player) === 0)).toBe(true);
    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: ["castle-guard"] });
    const guardAction = battle.planEnemyAiAction("2:40");
    expect(guardAction).toMatchObject({ kind: "attack", targetId: player.id });
    expect(guardAction?.path.length).toBeGreaterThan(1);
  });

  it("does not unlock an alert group whose possible attackers are all confused", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    const guard = battle.unit("2:40")!;
    const candidate = battle.reachableCells(guard.id)
      .flatMap(({ x, y }) => [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ])
      .find((position) =>
        position.x >= 0
        && position.y >= 0
        && position.x < battle.stage.width
        && position.y < battle.stage.height
        && !battle.unitAt(position));
    expect(candidate).toBeDefined();
    if (!candidate) return;
    player.x = candidate.x;
    player.y = candidate.y;
    for (const id of ["2:40", "2:41", "2:42", "2:43"]) {
      battle.unit(id)!.statuses.confusion = 3;
    }

    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: [] });
    expect(battle.planEnemyAiAction(guard.id)).not.toMatchObject({
      kind: "attack",
      targetId: player.id,
    });
  });

  it("never plans a technique from a moved position for enemy or allied AI", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const sister = battle.unit("2:43")!;
    const player = battle.unit("1:0")!;
    player.x = 25;
    player.y = 21;
    battle.units = [sister, player];

    expect(battle.planSpecialAiAction(sister.id, "fire-1")).toBeUndefined();
    activateCastleGuard(battle);
    expect(battle.planEnemyAiAction(sister.id)).toMatchObject({ kind: "move" });

    sister.side = 1;
    player.side = 2;
    expect(battle.planSpecialAiAction(sister.id, "fire-1")).toBeUndefined();
    expect(battle.planAlliedAiAction(sister.id)).not.toMatchObject({ kind: "special" });
  });

  it("activates the whole guard on a current-position action threat and delays Fang one round", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    const sister = battle.unit("2:43")!;
    player.x = sister.x;
    player.y = sister.y + 4;

    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: ["castle-guard"] });
    for (const id of ["2:40", "2:41", "2:42", "2:43"]) {
      expect(battle.enemyAiIntentFor(id)).toBe("pursuit");
    }
    expect(battle.enemyAiIntentFor("2:16")).toBe("sentry");
    expect(battle.serializableSnapshot().enemyAi).toEqual({
      activeGroupIds: ["castle-guard"],
      pendingNoticeGroupIds: [],
      fangPursuitRound: 2,
    });

    battle.startNextRound();
    expect(battle.enemyAiIntentFor("2:16")).toBe("pursuit");
  });

  it("does not treat a frozen player unit as a damage-action candidate", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    const sister = battle.unit("2:43")!;
    player.x = sister.x;
    player.y = sister.y + 4;
    player.actionDisabled = true;

    expect(battle.actionRange(sister.id, "fire-1").valueAt(player)).toBeGreaterThan(0);
    expect(battle.planSpecialAiAction(sister.id, "fire-1")).toBeUndefined();
    expect(battle.beginEnemyPhase()).toEqual({ activatedGroupIds: [] });
  });

  it("keeps low-life pursuit units in place to rest unless they have a guaranteed kill", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const soldier = battle.unit("2:45")!;
    const player = battle.unit("1:0")!;
    soldier.life = Math.floor(battle.statsFor(soldier).maxLife * 39 / 100);
    player.x = soldier.x;
    player.y = soldier.y + 1;
    player.life = battle.statsFor(player).maxLife;

    expect(battle.planEnemyAiAction(soldier.id)).toEqual({
      unitId: soldier.id,
      kind: "rest",
      path: [{ x: soldier.x, y: soldier.y }],
    });

    battle.unit(player.id)!.life = 1;
    expect(battle.planEnemyAiAction(soldier.id)).toMatchObject({
      kind: "attack",
      targetId: player.id,
    });

    const alertGuard = battle.unit("2:40")!;
    alertGuard.life = Math.floor(battle.statsFor(alertGuard).maxLife * 39 / 100);
    expect(battle.planEnemyAiAction(alertGuard.id)).toEqual({
      unitId: alertGuard.id,
      kind: "rest",
      path: [{ x: alertGuard.x, y: alertGuard.y }],
    });
  });

  it("records an attacked guard immediately and preserves its pending alert through restore", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const player = battle.unit("1:0")!;
    const guard = battle.unit("2:40")!;
    player.x = guard.x;
    player.y = guard.y + 1;
    battle.attack(player.id, guard.id);

    expect(battle.serializableSnapshot().enemyAi).toEqual({
      activeGroupIds: ["castle-guard"],
      pendingNoticeGroupIds: ["castle-guard"],
      fangPursuitRound: 2,
    });

    const restored = new Stage1Battle(campaign, deploymentWithMagician());
    restored.restore(battle.serializableSnapshot());
    expect(restored.beginEnemyPhase()).toEqual({ activatedGroupIds: ["castle-guard"] });
    expect(restored.beginEnemyPhase()).toEqual({ activatedGroupIds: [] });
    expect(restored.enemyAiIntentFor("2:16")).toBe("sentry");
  });

  it("lets pursuit units move and attack in one action", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const soldier = battle.unit("2:45")!;
    const player = battle.unit("1:0")!;
    player.x = soldier.x;
    player.y = soldier.y + battle.statsFor(soldier).movement;
    battle.units = [soldier, player];

    const action = battle.planEnemyAiAction(soldier.id);
    expect(action).toMatchObject({ kind: "attack", targetId: player.id });
    expect(action?.path.length).toBeGreaterThan(1);
  });

  it("ranks sister actions without peeking at PRNG", () => {
    const battle = new Stage1Battle(campaign, deploymentWithMagician());
    const sister = battle.unit("2:43")!;
    const ally = battle.unit("2:40")!;
    const player = battle.unit("1:0")!;
    const fireBoundary = battle.actionRange(sister.id, "fire-1").cells()
      .find((position) => battle.actionRange(sister.id, "fire-1").valueAt(position) === 1)!;
    ally.x = sister.x + 1;
    ally.y = sister.y;
    ally.life = Math.floor(battle.statsFor(ally).maxLife * 30 / 100);
    player.x = fireBoundary.x;
    player.y = fireBoundary.y;
    player.life = battle.statsFor(player).maxLife;
    battle.units = [sister, ally, player];
    activateCastleGuard(battle);
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };

    expect(battle.planEnemyAiAction(sister.id)).toMatchObject({
      kind: "special",
      actionId: "heal-1",
      targetId: ally.id,
    });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);

    battle.unit(player.id)!.life = 1;
    expect(battle.planEnemyAiAction(sister.id)).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: player.id,
    });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);

    battle.unit(player.id)!.life = battle.statsFor(player).maxLife;
    battle.unit(ally.id)!.life = Math.floor(battle.statsFor(ally).maxLife * 70 / 100);
    expect(battle.planEnemyAiAction(sister.id)).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: player.id,
    });
  });
});
