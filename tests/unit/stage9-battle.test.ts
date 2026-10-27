import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE9_DEFINITION } from "../../src/game/content/stage9";
import { Stage9Battle, createStage9DeploymentRoster } from "../../src/game/simulation/stage9-battle";
import type { CampaignState, Position } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-09",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 620, life: 220 },
    { slot: 1, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

const deployment = {
  placements: [
    ...STAGE9_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE9_DEFINITION.deployment.optionalSlots.slice(0, 7).map((slot, index) => ({
      slot, position: { ...STAGE9_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 9 battle simulation", () => {
  it("builds the nine-unit escort and fourteen-unit blockade", () => {
    expect(createStage9DeploymentRoster(campaign)).toHaveLength(14);
    expect(createStage9DeploymentRoster(campaign).find(({ slot }) => slot === 9))
      .toMatchObject({ name: "多莉", classId: "curse-master", experience: 299 });
    const battle = new Stage9Battle(campaign, deployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(14);
    expect(battle.unit("1:9")).toMatchObject({ classId: "curse-master", x: 16, y: 38 });
    expect(battle.forceForUnit("1:9")).toMatchObject({
      id: "dori-flightship-guide", control: "independent-ai", tacticLabel: "飛船引路",
    });
    expect(battle.isPlayerControllableAlly("1:9")).toBe(false);
    expect(battle.isPlayerControllableAlly("1:0")).toBe(true);
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 9))
      .toMatchObject({ classId: "curse-master", experience: 299 });
  });

  it("moves Dori along the native three-waypoint route with movement six (REMAKE-183)", () => {
    const battle = new Stage9Battle(campaign, deployment);
    const action = battle.planAlliedAiAction("1:9");
    expect(action).toMatchObject({ unitId: "1:9", kind: "move" });
    expect(action?.path[0]).toEqual({ x: 16, y: 38 });
    expect(action?.path.at(-1)?.y).toBeLessThan(38);
    // Entry cost must stay strictly below the budget, so six allows five open-ground steps.
    expect(action?.path.length).toBeLessThanOrEqual(6);
  });

  /** Ship-side blockade only: the western cluster would otherwise stall her beside a blocker. */
  function shipSideBattle(): Stage9Battle {
    const battle = new Stage9Battle(campaign, deployment);
    battle.units = battle.units.filter((unit) => unit.side !== 2 || [48, 49, 50].includes(unit.slot));
    return battle;
  }

  function requireDori(battle: Stage9Battle) {
    const dori = battle.unit("1:9");
    if (!dori) throw new Error("Dori is missing");
    return dori;
  }

  /** Replays only Dori's own actions; every other unit stays where it is. */
  function traceDori(battle: Stage9Battle, limit: number): Position[] {
    const landings: Position[] = [];
    for (let turn = 0; turn < limit && battle.outcome() === "ongoing"; turn += 1) {
      const dori = requireDori(battle);
      const end = battle.planAlliedAiAction("1:9")?.path.at(-1);
      if (!end || (end.x === dori.x && end.y === dori.y)) break;
      Object.assign(dori, { x: end.x, y: end.y });
      landings.push({ x: end.x, y: end.y });
    }
    return landings;
  }

  it("walks Dori through the valley and boards beside the bow instead of the nearest arrival row", () => {
    const battle = shipSideBattle();
    const landings = traceDori(battle, 40);
    expect(battle.outcome()).toBe("victory");
    const final = landings.at(-1) ?? { x: -1, y: -1 };
    expect(final.x).toBeGreaterThanOrEqual(32);
    expect(final.y).toBeGreaterThanOrEqual(17);
    for (const cell of landings.slice(0, -1)) expect(cell.y * 50 + cell.x).toBeGreaterThan(933);
    expect(landings.some(({ x, y }) => x >= 31 && y >= 22 && y <= 23)).toBe(true);
    // REMAKE-183: at six she crosses the row-23 forest (cost 3) one cell a turn,
    // in step with six-movement escorts, so the static walk takes 20 turns instead of 13.
    expect(landings.length).toBeLessThanOrEqual(20);
  });

  it("stays on the valley legs at the cells where Manhattan scoring used to turn north", () => {
    for (const start of [{ x: 21, y: 23 }, { x: 19, y: 22 }, { x: 22, y: 22 }]) {
      const battle = shipSideBattle();
      Object.assign(requireDori(battle), start);
      const end = battle.planAlliedAiAction("1:9")?.path.at(-1) ?? start;
      expect(end.x).toBeGreaterThan(start.x);
      expect(end.y).toBeGreaterThanOrEqual(22);
    }
  });

  it("slips past the monk holding cell 934 onto the arrival cell beside the bow", () => {
    const battle = shipSideBattle();
    const monk = battle.units.find(({ side, slot }) => side === 2 && slot === 50);
    expect(monk).toMatchObject({ x: 34, y: 18 });
    Object.assign(requireDori(battle), { x: 34, y: 19 });
    expect(battle.planAlliedAiAction("1:9")?.path.at(-1)).toEqual({ x: 33, y: 18 });
    // The debug fixture parks her on cell 983; one independent action must still finish the stage.
    // With six movement (REMAKE-183) the step onto 933 beside the monk is the arrival she takes.
    Object.assign(requireDori(battle), { x: 33, y: 19 });
    expect(battle.planAlliedAiAction("1:9")?.path.at(-1)).toEqual({ x: 33, y: 18 });
  });

  it("waits instead of wandering when nothing reachable shortens the route", () => {
    const battle = shipSideBattle();
    Object.assign(requireDori(battle), { x: 34, y: 20 });
    const wall = [{ x: 34, y: 19 }, { x: 33, y: 19 }, { x: 35, y: 19 }];
    for (const [index, slot] of [48, 49, 50].entries()) {
      const blocker = battle.units.find((unit) => unit.side === 2 && unit.slot === slot);
      if (!blocker) throw new Error(`missing blocker ${slot}`);
      Object.assign(blocker, wall[index]);
    }
    expect(battle.planAlliedAiAction("1:9")).toMatchObject({ kind: "wait", path: [{ x: 34, y: 20 }] });
    // REMAKE-183: walled in and wounded, she recovers instead of standing idle.
    const dori = requireDori(battle);
    dori.life = battle.statsFor(dori).maxLife - 1;
    expect(battle.planAlliedAiAction("1:9")).toMatchObject({ kind: "rest", path: [{ x: 34, y: 20 }] });
  });

  it("rests Dori below 40% life instead of walking on (REMAKE-183)", () => {
    const battle = new Stage9Battle(campaign, deployment);
    const dori = requireDori(battle);
    const maxLife = battle.statsFor(dori).maxLife;
    const boundary = Math.ceil(maxLife * 40 / 100);
    dori.life = boundary - 1;
    expect(battle.planAlliedAiAction("1:9")).toMatchObject({ kind: "rest", path: [{ x: 16, y: 38 }] });
    dori.life = boundary;
    expect(battle.planAlliedAiAction("1:9")).toMatchObject({ kind: "move" });
    // The rest is the ordinary 15% recovery and spends her action.
    dori.life = boundary - 1;
    expect(battle.rest("1:9")).toBe(Math.floor(maxLife * 15 / 100));
    expect(dori.acted).toBe(true);
  });

  it("still boards a wounded Dori, because the arrival cell ends the stage (REMAKE-183)", () => {
    const battle = shipSideBattle();
    Object.assign(requireDori(battle), { x: 34, y: 19, life: 1 });
    expect(battle.planAlliedAiAction("1:9")).toMatchObject({ kind: "move" });
    expect(battle.planAlliedAiAction("1:9")?.path.at(-1)).toEqual({ x: 33, y: 18 });
  });

  it("wins by Dori reaching cell 933 or by elimination, with defeat precedence", () => {
    const routeVictory = new Stage9Battle(campaign, deployment);
    Object.assign(routeVictory.unit("1:9")!, { x: 34, y: 17 });
    expect(routeVictory.outcome()).toBe("victory");

    const stillTraveling = new Stage9Battle(campaign, deployment);
    Object.assign(stillTraveling.unit("1:9")!, { x: 34, y: 18 });
    expect(stillTraveling.outcome()).toBe("ongoing");

    const eliminationVictory = new Stage9Battle(campaign, deployment);
    eliminationVictory.units = eliminationVictory.units.filter(({ side }) => side !== 2);
    expect(eliminationVictory.outcome()).toBe("victory");

    const simultaneous = new Stage9Battle(campaign, deployment);
    simultaneous.units = simultaneous.units.filter(({ side, slot }) => side !== 2 && slot !== 9);
    expect(simultaneous.outcome()).toBe("defeat");
  });
});
