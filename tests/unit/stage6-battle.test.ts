import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE6_DEFINITION } from "../../src/game/content/stage6";
import { Stage6Battle, createStage6DeploymentRoster } from "../../src/game/simulation/stage6-battle";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { BattleUnit, CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-06",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 520, life: 220 },
    { slot: 1, classId: "priest", experience: 480, life: 180 },
    { slot: 17, classId: "archer", experience: 410, life: 130 },
    { slot: 24, classId: "evil-mage", experience: 1_050, life: 300 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 7,
};

const deployment = {
  placements: [
    ...STAGE6_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE6_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
      slot, position: { ...STAGE6_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 6 battle simulation", () => {
  it("inherits the selected nine allies and builds the nine-unit pursuit force", () => {
    expect(createStage6DeploymentRoster(campaign)).toHaveLength(13);
    const battle = new Stage6Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(9);
    expect(battle.unit("1:0")).toMatchObject({ classId: "land-knight", x: 21, y: 24 });
    expect(battle.unit("2:19")).toMatchObject({
      classId: "land-knight", name: "西艾蕾", portrait: 5, x: 39, y: 36,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-otherworld-vanguard", control: "player",
    });
    expect(battle.forceForUnit("2:19")).toMatchObject({
      id: "xielei-pursuit-force", control: "independent-ai",
    });
  });

  it("wins only when Xielei leaves and loses when Nia leaves", () => {
    const ongoing = new Stage6Battle(campaign, deployment);
    ongoing.units = ongoing.units.filter(({ id }) => id !== "2:46");
    expect(ongoing.outcome()).toBe("ongoing");

    const victorious = new Stage6Battle(campaign, deployment);
    victorious.units = victorious.units.filter(({ id }) => id !== "2:19");
    expect(victorious.outcome()).toBe("victory");

    const defeated = new Stage6Battle(campaign, deployment);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:0");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("does not inherit the stage 4 force-field life-halving behavior", () => {
    const battle = new Stage6Battle(campaign, deployment);
    const lifeBefore = battle.units.map(({ id, life }) => [id, life] as const);
    expect(battle.routePulseSafeAreaForUnit("1:0")).toEqual([]);
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.map(({ id, life }) => [id, life] as const)).toEqual(lifeBefore);
  });

  it("keeps story tableau identities separate from campaign roster semantics", () => {
    const battle = new Stage6Battle(campaign, deployment);
    const rosterBefore = battle.campaignSnapshot().roster.map((entry) => ({ ...entry }));
    const storyUnit: BattleUnit = {
      id: "story:ranger-leader",
      side: 1,
      slot: 17,
      classId: "cavalry",
      className: "騎兵",
      name: "阿曼妮",
      portrait: 18,
      x: 11,
      y: 30,
      life: 100,
      experience: 410,
      acted: true,
      actionDisabled: false,
      statuses: emptyUnitStatuses(),
    };
    expect(battle.appendStoryUnits([storyUnit])).toEqual(["story:ranger-leader"]);
    expect(battle.unit("story:ranger-leader")).toMatchObject({ classId: "cavalry", slot: 17 });
    expect(battle.campaignSnapshot().roster).toEqual(rosterBefore);
    expect(() => battle.appendStoryUnits([storyUnit])).toThrow("duplicate story unit id");
  });

  /**
   * The victory tableau writes slots 0–7 back onto the board from the roster, so
   * a slot's roster life is what the tableau shows. Battle records written before
   * `REMAKE-077` covered off-board slots could still hold the life a slot ended an
   * earlier stage with — Kins (slot 7) is never a stage 6 candidate. Only the
   * slots this battle writes back may differ from the stage-entry rebuild.
   */
  it("reads a battle record back with every slot it never wrote refilled", () => {
    const battle = new Stage6Battle(campaign, deployment);
    const { units, ...snapshot } = battle.serializableSnapshot();
    const fellHere = new Map([[2, 0], [7, 0], [14, 5]]);
    const savedRoster = battle.campaignSnapshot().roster.map((entry) => ({
      ...entry,
      life: fellHere.get(entry.slot) ?? entry.life,
    }));
    const restored = new Stage6Battle(campaign, deployment);
    restored.restore({ ...snapshot, units: units.filter(({ id }) => id !== "1:2") }, savedRoster);
    const life = (slot: number) =>
      restored.campaignSnapshot().roster.find((entry) => entry.slot === slot)?.life;
    const maxLife = (slot: number) =>
      restored.statsFor({ ...savedRoster[slot], side: 1 }).maxLife;
    // Deployed and fallen in this battle: the tableau keeps the native slot's 0.
    expect(life(2)).toBe(0);
    // Never on this board (Kins) or left on the bench: the stage-entry rebuild.
    expect(life(7)).toBe(maxLife(7));
    expect(life(14)).toBe(maxLife(14));
  });
});
