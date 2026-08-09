import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE5_DEFINITION } from "../../src/game/content/stage5";
import { prepareScriptedLightning4 } from "../../src/game/simulation/scripted-actions";
import { Stage42PortalBattle } from "../../src/game/simulation/stage42-portal-battle";
import { Stage5Battle, createStage5DeploymentRoster } from "../../src/game/simulation/stage5-battle";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { BattleUnit, CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-05",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "cavalry", experience: 520, life: 120 },
    { slot: 1, classId: "monk", experience: 480, life: 111 },
    { slot: 7, classId: "archer", experience: 410, life: 100 },
    { slot: 23, classId: "warrior", experience: 430, life: 120 },
    { slot: 24, classId: "evil-mage", experience: 1_050, life: 300 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 7,
};

const deployment = {
  placements: [
    ...STAGE5_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE5_DEFINITION.deployment.optionalSlots.slice(0, 5).map((slot, index) => ({
      slot, position: { ...STAGE5_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 5 battle and portal simulation", () => {
  it("inherits the selected six allies and builds all fourteen explicit enemies", () => {
    expect(createStage5DeploymentRoster(campaign)).toHaveLength(8);
    const battle = new Stage5Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(6);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(14);
    expect(battle.unit("1:0")).toMatchObject({ classId: "cavalry", x: 25, y: 33 });
    expect(battle.unit("2:25")).toMatchObject({ name: "汀塔琪", portrait: 3 });
    expect(battle.unit("2:26")).toMatchObject({ name: "萊茵", portrait: 2 });
    expect(battle.forceForUnit("1:0")).toMatchObject({ id: "nia-inner-hall", control: "player" });
    expect(battle.forceForUnit("2:51")).toMatchObject({ id: "knight-elite", control: "independent-ai" });
  });

  it("wins when either boss leaves, ignores other enemies, and loses with Nia", () => {
    const ongoing = new Stage5Battle(campaign, deployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:44");
    expect(ongoing.outcome()).toBe("ongoing");

    for (const bossId of ["2:25", "2:26"]) {
      const battle = new Stage5Battle(campaign, deployment);
      battle.units = battle.units.filter(({ id }) => id !== bossId);
      expect(battle.outcome()).toBe("victory");
    }
    const defeated = new Stage5Battle(campaign, deployment);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:0");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("does not carry the stage 4 force-field pulse into later rounds", () => {
    const deploymentWithGadirath = {
      placements: [
        ...STAGE5_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
          slot, position: { ...position }, fixed: true,
        })),
        ...[1, 2, 3, 4, 24].map((slot, index) => {
          const position = STAGE5_DEFINITION.deployment.openCells[index];
          if (!position) throw new Error(`missing stage 5 deployment cell ${index}`);
          return { slot, position: { ...position }, fixed: false };
        }),
      ],
    };
    const battle = new Stage5Battle(campaign, deploymentWithGadirath);
    const lifeBefore = battle.units.map(({ id, life }) => [id, life] as const);

    expect(battle.routePulseSafeAreaForUnit("1:0")).toEqual([]);
    expect(battle.planAlliedAiAction("1:24")?.kind).not.toBe("route-pulse");
    battle.startNextRound();

    expect(battle.round).toBe(2);
    expect(battle.units.map(({ id, life }) => [id, life] as const)).toEqual(lifeBefore);
  });

  it("plans each enemy archer-family class through its shooting action", () => {
    for (const [classId, actionId] of [
      ["archer", "archer-shot"],
      ["crossbow", "crossbow-shot"],
      ["magic-archer", "magic-archer-shot"],
    ] as const) {
      const battle = new Stage5Battle(campaign, deployment);
      const shooter = battle.unit("2:44");
      if (!shooter) throw new Error("missing stage 5 enemy archer");
      shooter.classId = classId;
      shooter.x = 25;
      shooter.y = 29;

      expect(battle.planEnemyAiAction(shooter.id)).toMatchObject({
        unitId: shooter.id,
        kind: "special",
        actionId,
      });
    }
  });

  it("resolves scripted 4L as five deterministic rings with guard semantics", () => {
    const makeUnit = (slot: number, x: number, statuses = emptyUnitStatuses()): BattleUnit => ({
      id: `1:${slot}`, side: 1, slot, classId: "soldier", className: "士兵",
      name: `target-${slot}`, portrait: 47, x, y: 22, life: 200, experience: 299,
      acted: false, actionDisabled: false, statuses,
    });
    const units = [0, 1, 2, 3, 4].map((distance) => makeUnit(distance, 24 + distance));
    units[1]!.statuses.magicGuard = 2;
    const result = prepareScriptedLightning4(units, { width: 50, height: 50 }, { x: 24, y: 22 }, 1, "story:test");
    expect(result.affectedUnits.map(({ damage }) => damage)).toEqual([110, 0, 70, 50, 30]);
    expect(result.affectedUnits[1]).toMatchObject({ blocked: true, blockReason: "magicGuard" });
    expect(result.affectedUnits[1]?.statusesAfter.magicGuard).toBe(0);
    expect(result.experienceGained).toBe(0);
  });

  it("forces scene classes without flattening them into campaign growth and departs without EXP", () => {
    const portal = new Stage42PortalBattle(campaign);
    expect(portal.units).toHaveLength(10);
    expect(portal.units.filter(({ side }) => side === 2)).toHaveLength(0);
    expect(portal.unit("1:23")).toMatchObject({ classId: "empress", x: 23, y: 22 });
    expect(portal.unit("1:7")).toMatchObject({ classId: "magic-priest", x: 24, y: 22 });
    const callsBefore = portal.rng.calls;
    const result = prepareScriptedLightning4(
      portal.units,
      portal.stage,
      { x: 24, y: 22 },
      1,
      "story:portal-lightning",
    );
    portal.commitScriptedSpecialAction(result, ["1:7", "1:23"]);
    const experienceAfterLightning = portal.unit("1:7")?.experience;
    expect(portal.removeStoryUnits([{ side: 1, slot: 7 }, { side: 1, slot: 23 }]))
      .toEqual(["1:23", "1:7"]);
    expect(portal.unit("1:7")).toBeUndefined();
    expect(portal.unit("1:23")).toBeUndefined();
    expect(experienceAfterLightning).toBe(410);
    expect(portal.rng.calls).toBe(callsBefore);
    expect(portal.campaignSnapshot().roster[7]).toMatchObject({ classId: "archer", experience: 410 });
    expect(portal.campaignSnapshot().roster[23]).toMatchObject({ classId: "warrior", experience: 430 });
  });
});
