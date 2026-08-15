import { describe, expect, it } from "vitest";
import { classDefinition, className, type ClassId } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE37_DEFINITION } from "../../src/game/content/stage37";
import {
  isSaveData,
  parseSaveData,
  SAVE_CONTENT_VERSION,
  SAVE_VERSION,
} from "../../src/game/save";
import {
  createStage37DeploymentRoster,
  Stage37Battle,
} from "../../src/game/simulation/stage37-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-37",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 7, classId: "magic-priest", experience: 0, life: 140 },
  ]),
  rngState: 0x37_37_37_37,
  rngCalls: 37,
};

const fullDeployment = {
  placements: [
    ...STAGE37_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE37_DEFINITION.deployment.optionalSlots.slice(0, 26).map((slot, index) => ({
      slot, position: { ...STAGE37_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

function configureCaster(
  battle: Stage37Battle,
  classId: ClassId,
  tier: 1 | 2 | 3,
) {
  const actor = battle.unit("1:0")!;
  actor.classId = classId;
  actor.className = className(classId);
  actor.experience = classDefinition(classId).dataRows[tier - 1].experienceThreshold;
  actor.x = 23;
  actor.y = 13;
  actor.acted = false;
  actor.actionDisabled = false;
  return actor;
}

describe("stage 37 battle simulation", () => {
  it("builds the 27-person decision force and three independent boss parts", () => {
    expect(createStage37DeploymentRoster(campaign)).toHaveLength(29);
    const battle = new Stage37Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(27);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(3);
    expect(battle.unit("2:56")).toMatchObject({ classId: "head", life: 10_000, x: 23, y: 11 });
    expect(battle.unit("2:54")).toMatchObject({ classId: "hand", life: 10_000, x: 22, y: 12 });
    expect(battle.unit("2:55")).toMatchObject({ classId: "hand", life: 10_000, x: 24, y: 12 });
    expect(battle.statsFor(battle.unit("2:56")!)).toMatchObject({
      attack: 100, defense: 10, maxLife: 10_000, movement: 1,
    });
  });

  it("applies the highest-difficulty 50% boss override without adding units", () => {
    const battle = new Stage37Battle({ ...campaign, difficulty: 3 }, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(3);
    for (const unit of battle.units.filter(({ side }) => side === 2)) {
      expect(unit.life).toBe(15_000);
      expect(battle.statsFor(unit)).toMatchObject({ attack: 150, defense: 15, maxLife: 15_000 });
    }
  });

  it("wins only after all three parts leave, with Nia defeat priority", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ id }) => id !== "2:56");
    expect(battle.outcome()).toBe("ongoing");
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("keeps every boss part immobile and moves only the ice-casting head behind both hands", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    expect(battle.movementPath("2:56", { x: 23, y: 12 })).toEqual([]);
    expect(battle.enemyActionOrder()).toEqual(["2:56", "2:54", "2:55"]);

    const head = battle.planEnemyAiAction("2:56")!;
    expect(head).toMatchObject({ kind: "special", actionId: "recovery-3", targetId: "2:56" });
    battle.commitPreparedAction(battle.prepareSpecialAction({
      actorId: head.unitId,
      actionId: head.actionId!,
      targetId: head.targetId,
    }));
    for (const id of ["2:54", "2:55"]) {
      const hand = battle.planEnemyAiAction(id)!;
      battle.commitPreparedAction(battle.prepareSpecialAction({
        actorId: hand.unitId,
        actionId: hand.actionId!,
        targetId: hand.targetId,
      }));
    }
    battle.startNextRound();
    expect(battle.enemyActionOrder()).toEqual(["2:54", "2:55", "2:56"]);
    expect(battle.selectNextEnemyAiAction(["2:56", "2:54", "2:55"]))
      .toMatchObject({ unitId: "2:54", action: { actionId: "lightning-4" } });
    for (const id of ["2:54", "2:55"]) {
      const hand = battle.planEnemyAiAction(id)!;
      battle.commitPreparedAction(battle.prepareSpecialAction({
        actorId: hand.unitId,
        actionId: hand.actionId!,
        targetId: hand.targetId,
      }));
    }
    expect(battle.enemyActionOrder()).toEqual(["2:56"]);
    expect(battle.planEnemyAiAction("2:56")).toMatchObject({ actionId: "ice-3" });
  });

  it("shares the lightning/fire toggle across both hands and serializes target RNG", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    battle.unit("2:56")!.acted = true;
    const before = { state: battle.rng.state, calls: battle.rng.calls };
    const left = battle.planEnemyAiAction("2:54")!;
    expect(left).toMatchObject({ kind: "special", actionId: "lightning-4" });
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before);
    battle.commitPreparedAction(battle.prepareSpecialAction({
      actorId: left.unitId,
      actionId: left.actionId!,
      targetId: left.targetId,
    }));
    expect(battle.rng.calls).toBeGreaterThan(before.calls);
    expect(battle.planEnemyAiAction("2:55")).toMatchObject({ actionId: "fire-4" });

    const snapshot = battle.serializableSnapshot();
    expect(snapshot.stage37Boss).toEqual({ headActionToggle: 0, handActionToggle: 1 });
    const restored = new Stage37Battle(campaign, fullDeployment);
    restored.restore(snapshot, campaign.roster);
    expect(restored.planEnemyAiAction("2:55")).toMatchObject({ actionId: "fire-4" });
  });

  it("reproduces the native head/hand status matrix and keeps seal outside their dedicated dispatcher", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    const head = battle.unit("2:56")!;
    const leftHand = battle.unit("2:54")!;
    const rightHand = battle.unit("2:55")!;

    const iceCaster = configureCaster(battle, "magician", 1);
    const ice = battle.prepareSpecialAction({ actionId: "ice-1", actorId: iceCaster.id });
    expect(ice.result.affectedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: head.id, blocked: true, blockReason: "classImmune", moved: false, actionDisabledAfter: false }),
      expect.objectContaining({ unitId: leftHand.id, blocked: true, blockReason: "classImmune", moved: false, actionDisabledAfter: false }),
      expect.objectContaining({ unitId: rightHand.id, blocked: true, blockReason: "classImmune", moved: false, actionDisabledAfter: false }),
    ]));

    const curseCaster = configureCaster(battle, "curse-master", 3);
    for (const [actionId, target] of [
      ["confusion", head],
      ["poison", leftHand],
    ] as const) {
      const prepared = battle.prepareSpecialAction({
        actionId,
        actorId: curseCaster.id,
        targetId: target.id,
      });
      expect(prepared.result).toMatchObject({ blocked: true, blockReason: "classImmune" });
      battle.commitPreparedAction(prepared);
      expect(target.statuses[actionId]).toBe(0);
      curseCaster.acted = false;
    }

    const attackDown = battle.prepareSpecialAction({
      actionId: "attack-down",
      actorId: curseCaster.id,
      targetId: head.id,
    });
    expect(attackDown.result.blocked).toBe(false);
    battle.commitPreparedAction(attackDown);
    curseCaster.acted = false;

    const priest = configureCaster(battle, "magic-priest", 1);
    const defenseDown = battle.prepareSpecialAction({
      actionId: "defense-down",
      actorId: priest.id,
      targetId: head.id,
    });
    expect(defenseDown.result.blocked).toBe(false);
    battle.commitPreparedAction(defenseDown);
    expect(head.statuses).toMatchObject({ attackDown: 3, defenseDown: 3 });
    expect(battle.effectiveStatsFor(head)).toMatchObject({ attack: 80, defense: 0 });

    configureCaster(battle, "curse-master", 3);
    for (const target of [head, leftHand, rightHand]) {
      const sealed = battle.prepareSpecialAction({
        actionId: "spell-seal",
        actorId: curseCaster.id,
        targetId: target.id,
      });
      expect(sealed.result.blocked).toBe(false);
      battle.commitPreparedAction(sealed);
      expect(target.statuses.techniqueSeal).toBe(3);
      curseCaster.acted = false;
    }

    expect(battle.planEnemyAiAction(head.id)).toMatchObject({ actionId: "recovery-3" });
    expect(battle.planEnemyAiAction(leftHand.id)).toMatchObject({ actionId: "lightning-4" });
    const sealedHeadAction = battle.prepareSpecialAction({
      actorId: head.id,
      actionId: "recovery-3",
      targetId: head.id,
    });
    expect(() => battle.commitPreparedAction(sealedHeadAction)).not.toThrow();
  });

  it("never creates reinforcements or replacement forms", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    const ids = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    battle.beginEnemyPhase();
    battle.startNextRound();
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id)).toEqual(ids);
    battle.units = battle.units.filter(({ id }) => id !== "2:54");
    battle.beginEnemyPhase();
    battle.startNextRound();
    expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
      .toEqual(["2:56", "2:55"]);
  });

  it("strictly validates the serialized boss toggles and fixed maximum life", () => {
    const battle = new Stage37Battle(campaign, fullDeployment);
    const battleCampaign = battle.campaignSnapshot();
    const save = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      savedAt: "2000-01-01T00:00:00.000Z",
      saveCount: 1,
      stageId: "stage-37",
      stageLabel: "究極女神",
      ruleset: "stableRemake",
      difficulty: campaign.difficulty,
      rngState: battleCampaign.rngState,
      rngCalls: battleCampaign.rngCalls,
      roster: battleCampaign.roster,
      stageProgress: 0,
      consumedEventIds: ["stage-37-enter-deployment", "stage-37-opening-story"],
      stageEntrySnapshot: { ...campaign, roster: battleCampaign.roster },
      battle: {
        phase: "player",
        ...battle.serializableSnapshot(),
        cursor: { x: 23, y: 17 },
        cameraOrigin: { x: 19, y: 11 },
      },
    } as const;
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({
      ...save,
      battle: { ...save.battle, stage37Boss: undefined },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: { ...save.battle, stage37Boss: { headActionToggle: 2, handActionToggle: 0 } },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:56"
          ? { ...unit, life: 10_001 }
          : unit),
      },
    })).toBe(false);
    expect(isSaveData({
      ...save,
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.id === "2:56"
          ? { ...unit, portrait: 51 as const }
          : unit),
      },
    })).toBe(false);

    const migrated = parseSaveData(JSON.stringify({
      ...save,
      version: 71,
      contentVersion: "stage-37-ultimate-goddess-1",
      battle: {
        ...save.battle,
        units: save.battle.units.map((unit) => unit.side === 2
          ? { ...unit, portrait: 51 }
          : unit),
      },
    }));
    expect(migrated).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      stageId: "stage-37",
    });
    expect(migrated?.kind === "battle"
      ? migrated.battle.units.filter(({ side }) => side === 2).map(({ portrait }) => portrait)
      : []).toEqual([8, 8, 8]);
  });

  it("migrates the legal v70 stage-37 boundary but rejects unshipped battles and stage-49 saves", () => {
    const base = {
      format: "ANGEL2-web-save",
      version: 70,
      contentVersion: "expert-control-targeting-ai-1",
      kind: "completed",
      savedAt: "2000-01-01T00:00:00.000Z",
      saveCount: 1,
      stageId: "stage-37",
      stageLabel: "究極女神",
      ruleset: "stableRemake",
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      stageProgress: 1000,
      consumedEventIds: [
        "stage-36-enter-deployment",
        "stage-36-opening-story",
        "stage-36-objective-reached",
        "stage-36-completed-route",
      ],
    };
    expect(parseSaveData(JSON.stringify(base))).toMatchObject({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      stageId: "stage-37",
    });

    const battle = new Stage37Battle(campaign, fullDeployment);
    const battleCampaign = battle.campaignSnapshot();
    expect(parseSaveData(JSON.stringify({
      ...base,
      kind: "battle",
      stageProgress: 0,
      consumedEventIds: ["stage-37-enter-deployment", "stage-37-opening-story"],
      stageEntrySnapshot: campaign,
      battle: {
        phase: "player",
        ...battle.serializableSnapshot(),
        cursor: { x: 23, y: 17 },
        cameraOrigin: { x: 19, y: 11 },
      },
      roster: battleCampaign.roster,
    }))).toBeUndefined();
    expect(parseSaveData(JSON.stringify({
      ...base,
      stageId: "stage-49",
      stageLabel: "主線結局",
      consumedEventIds: [
        "stage-37-enter-deployment",
        "stage-37-opening-story",
        "stage-37-objective-reached",
        "stage-37-completed-route",
      ],
    }))).toBeUndefined();
  });
});
