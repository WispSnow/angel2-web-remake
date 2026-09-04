import { describe, expect, it } from "vitest";
import { classStatsFor, killRewardFor } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE12_DEFINITION } from "../../src/game/content/stage12";
import { Stage12Battle, createStage12DeploymentRoster } from "../../src/game/simulation/stage12-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-12",
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

/** Slot 1 carries 初級落雷／初級炎暴 so the technique kill reward can be observed. */
const magicianCampaign: CampaignState = {
  ...campaign,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
    {
      slot: 1,
      classId: "magician",
      experience: 299,
      life: classStatsFor({ classId: "magician", experience: 299 }).maxLife,
    },
  ]),
};

const fullDeployment = {
  placements: [
    ...STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE12_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
      slot, position: { ...STAGE12_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 12 battle simulation", () => {
  it("builds the nine-unit party and five-root expert water-warrior force", () => {
    expect(createStage12DeploymentRoster(campaign)).toHaveLength(20);
    const battle = new Stage12Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 23, y: 20, life: 340,
    });
    expect(battle.unit("2:40")).toMatchObject({
      classId: "water-warrior", x: 39, y: 17,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-swamp-party", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "swamp-water-warriors", control: "independent-ai", doctrine: { strategy: "expert" },
    });
  });

  it("allows the native minimum one-unit deployment", () => {
    const deployment = {
      placements: STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    };
    const battle = new Stage12Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
  });

  it("has no stage reinforcement but keeps water-warrior defensive splitting", () => {
    const battle = new Stage12Battle(campaign, fullDeployment);
    const attacker = battle.unit("1:1")!;
    const defender = battle.unit("2:40")!;
    attacker.x = 38;
    attacker.y = 17;
    const enemyRoots = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
    const result = battle.attack(attacker.id, defender.id);
    expect(result).toMatchObject({ splitUnitId: "2:40:split-1", splitCount: 2 });
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(6);
    expect(battle.forceForUnit("2:40:split-1")?.id).toBe("swamp-water-warriors");
    battle.startNextRound();
    expect(battle.units.filter(({ side, id }) => side === 2 && !id.includes(":split-"))
      .map(({ id }) => id)).toEqual(enemyRoots);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(6);
  });

  it("wins only after every split group leaves and loses if Nia leaves", () => {
    const ongoing = new Stage12Battle(campaign, fullDeployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:40");
    expect(ongoing.outcome()).toBe("ongoing");

    const victory = new Stage12Battle(campaign, fullDeployment);
    victory.units = victory.units.filter(({ side }) => side !== 2);
    expect(victory.outcome()).toBe("victory");

    const simultaneous = new Stage12Battle(campaign, fullDeployment);
    simultaneous.units = simultaneous.units.filter(({ side, slot }) => side !== 2 && slot !== 0);
    expect(simultaneous.outcome()).toBe("defeat");
  });

  /**
   * REMAKE-137: native `0000:96C2` pays the class reward per cleared board cell
   * and hands the total to the shot or technique through `0000:63CF`, so a
   * four-body group is worth `4 x 40` however the shared life reached zero.
   */
  function splitGroupBattle(): Stage12Battle {
    const battle = new Stage12Battle(magicianCampaign, fullDeployment);
    const melee = battle.unit("1:0")!;
    for (let hit = 0; hit < 3; hit += 1) {
      melee.x = 38;
      melee.y = 17;
      battle.attack(melee.id, "2:40");
      battle.startNextRound();
    }
    const group = battle.units.filter(({ side, slot }) => side === 2 && slot === 40);
    expect(group).toHaveLength(4);
    for (const body of group) body.life = 10;
    return battle;
  }

  const groupKillReward = killRewardFor("water-warrior", 2) * 4;

  it("pays the whole split group for a 落雷 kill that only covers part of it", () => {
    const battle = splitGroupBattle();
    const mage = battle.unit("1:1")!;
    // One body walks out of the ring; the shared life still ends at zero.
    battle.unit("2:40:split-3")!.x = 43;
    mage.x = 38;
    mage.y = 14;
    const before = mage.experience;

    const prepared = battle.prepareSpecialAction({
      actionId: "lightning-1",
      actorId: mage.id,
      targetId: "2:40:split-1",
      target: { x: 39, y: 16 },
    });
    // One shared pool behind the covered cells: the first one the scan reaches
    // empties it, so it alone carries the death the scan then pays four cells for.
    expect(prepared.result.affectedUnits.filter(({ died }) => died)).toHaveLength(1);
    battle.commitPreparedAction(prepared);

    expect(battle.units.filter(({ side, slot }) => side === 2 && slot === 40)).toHaveLength(0);
    const gained = battle.unit(mage.id)!.experience - before;
    expect(gained - groupKillReward).toBeGreaterThanOrEqual(8);
    expect(gained - groupKillReward).toBeLessThanOrEqual(9);
  });

  /**
   * The splash case behind the 2026-09-04 report: every ring tier on its own
   * leaves the shared life standing, so the group only falls once the later
   * cells have drained what the first one left. Native `1000:736D` re-reads the
   * slot's live life per cell, so the total taken is the shared life itself and
   * the cell that empties it is what the death scan pays for.
   */
  it("pays the whole split group when only the splash total reaches the shared life", () => {
    const battle = splitGroupBattle();
    // 60 clears 初級落雷's 50-point centre and every 35-point neighbour tier.
    for (const body of battle.units.filter(({ side, slot }) => side === 2 && slot === 40)) {
      body.life = 60;
    }
    const mage = battle.unit("1:1")!;
    mage.x = 38;
    mage.y = 14;
    const before = mage.experience;

    const prepared = battle.prepareSpecialAction({
      actionId: "lightning-1",
      actorId: mage.id,
      targetId: "2:40:split-1",
      target: { x: 39, y: 16 },
    });
    // No single cell is lethal on its own, and the ring can never remove more
    // life than the one slot behind its four cells had.
    expect(prepared.result.affectedUnits.every(({ damage }) => damage < 60)).toBe(true);
    expect(prepared.result.affectedUnits.filter(({ died }) => died)).toHaveLength(1);
    expect(prepared.result.damage).toBe(60);
    battle.commitPreparedAction(prepared);

    expect(battle.units.filter(({ side, slot }) => side === 2 && slot === 40)).toHaveLength(0);
    const gained = battle.unit(mage.id)!.experience - before;
    expect(gained - groupKillReward).toBeGreaterThanOrEqual(8);
    expect(gained - groupKillReward).toBeLessThanOrEqual(9);
  });

  it("pays the whole split group for a single-target 炎暴 kill", () => {
    const battle = splitGroupBattle();
    const mage = battle.unit("1:1")!;
    mage.x = 38;
    mage.y = 16;
    const before = mage.experience;

    const prepared = battle.prepareSpecialAction({
      actionId: "fire-1",
      actorId: mage.id,
      targetId: "2:40",
      target: { x: 39, y: 17 },
    });
    expect(prepared.result.affectedUnits).toHaveLength(1);
    battle.commitPreparedAction(prepared);

    expect(battle.units.filter(({ side, slot }) => side === 2 && slot === 40)).toHaveLength(0);
    const gained = battle.unit(mage.id)!.experience - before;
    expect(gained - groupKillReward).toBeGreaterThanOrEqual(8);
    expect(gained - groupKillReward).toBeLessThanOrEqual(9);
  });

  it("gives every water-warrior root a legal shared-expert action", () => {
    const battle = new Stage12Battle(campaign, fullDeployment);
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });
});
