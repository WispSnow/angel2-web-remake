import { describe, expect, it } from "vitest";
import { usesClassIdentity } from "../../src/game/content/classes";
import { completeCampaignRoster, initialEnemyExperience } from "../../src/game/content/stage0";
import { Stage11Battle, createStage11Units } from "../../src/game/simulation/stage11-battle";
import { manhattan, movementCostsToNearestTarget, positionKey } from "../../src/game/simulation/grid";
import type { BattleUnit, CampaignState, Position } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-11",
  ruleset: "stableRemake",
  difficulty: 3,
  roster: completeCampaignRoster([
    { slot: 8, classId: "land-knight", experience: 680, life: 220 },
    { slot: 9, classId: "curse-master", experience: 620, life: 180 },
    { slot: 17, classId: "pegasus-warrior", experience: 620, life: 210 },
    { slot: 18, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

describe("stage 11 battle simulation", () => {
  it("builds the fixed nine-versus-one battle with all allies player-controlled", () => {
    expect(createStage11Units(campaign.difficulty, campaign.roster)).toHaveLength(10);
    const battle = new Stage11Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(9);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(1);
    expect(battle.unit("1:9")).toMatchObject({
      classId: "curse-master", name: "多莉", portrait: 13, x: 26, y: 2,
    });
    expect(battle.unit("1:8")).toMatchObject({
      classId: "land-knight", name: "蘇蘭達", portrait: 10, x: 26, y: 35, life: 340,
    });
    for (const id of ["1:40", "1:41", "1:42"]) {
      const unit = battle.unit(id)!;
      expect(unit.life, id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:42")).toMatchObject({
      classId: "cavalry", experience: 0, life: 200, x: 22, y: 35,
    });
    const lilante = battle.unit("2:21");
    expect(lilante).toMatchObject({
      classId: "pegasus-warrior", className: "飛馬戰士", name: "麗蘭特", portrait: 28, x: 36, y: 48,
    });
    if (!lilante) throw new Error("missing stage 11 opening pursuer");
    // REMAKE-164 keeps her out of rank and file, so REMAKE-118 plans her landings.
    expect(usesClassIdentity(lilante)).toBe(false);
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:8")).toMatchObject({
      id: "sulanda-ranger-evacuation", control: "player", doctrine: { strategy: "expert" },
    });
    expect(battle.forceForUnit("2:21")).toMatchObject({
      id: "lilante-pursuer",
      control: "independent-ai",
      tacticLabel: "追擊蘇蘭達",
      doctrine: { strategy: "expert", huntUnitId: "1:8" },
    });
  });

  it("retains Web difficulty levels for the opening pursuer and reinforcements", () => {
    const levels = [2, 4, 6, 5] as const;
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage11Battle({ ...campaign, difficulty });
      battle.beginEnemyPhase();
      for (const id of ["2:21", "2:40"]) {
        const enemy = battle.unit(id)!;
        expect(enemy.experience, `${difficulty}:${id}`)
          .toBe(initialEnemyExperience(enemy.classId, difficulty));
        expect(battle.statsFor(enemy).level, `${difficulty}:${id}`).toBe(levels[difficulty]);
      }
    }
  });

  it("wins only when Sulanda reaches cells 0..279 and loses if she leaves", () => {
    const battle = new Stage11Battle(campaign);
    battle.units = battle.units.filter(({ side }) => side === 1);
    expect(battle.outcome()).toBe("ongoing");

    const sulanda = battle.unit("1:8")!;
    Object.assign(sulanda, { x: 30, y: 5 });
    expect(battle.outcome()).toBe("ongoing");
    Object.assign(sulanda, { x: 29, y: 5 });
    expect(battle.outcome()).toBe("victory");

    const defeated = new Stage11Battle(campaign);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:8");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("removes Dori only as a story departure without changing the campaign roster", () => {
    const battle = new Stage11Battle(campaign);
    const rosterBefore = battle.campaignSnapshot().roster;
    expect(battle.removeStoryUnits([{ side: 1, slot: 9 }])).toEqual(["1:9"]);
    expect(battle.unit("1:9")).toBeUndefined();
    expect(battle.outcome()).toBe("ongoing");
    expect(battle.campaignSnapshot().roster).toEqual(rosterBefore);
  });

  it("gives the lone Pegasus pursuer a legal expert action", () => {
    const battle = new Stage11Battle(campaign);
    expect(battle.planEnemyAiAction("2:21")).toMatchObject({ unitId: "2:21" });
  });

  /** The opening board after SAY/0026, with every ally but 蘇蘭達 parked out of the way. */
  function huntBattle(): Stage11Battle {
    const battle = new Stage11Battle(campaign);
    battle.removeStoryUnits([{ side: 1, slot: 9 }]);
    return battle;
  }

  function place(battle: Stage11Battle, id: string, position: Position, life?: number): BattleUnit {
    const unit = battle.unit(id);
    if (!unit) throw new Error(`missing ${id}`);
    Object.assign(unit, position, life === undefined ? {} : { life });
    return unit;
  }

  it("has 麗蘭特 strike 蘇蘭達 even beside a ranger she could finish (REMAKE-184)", () => {
    const battle = huntBattle();
    place(battle, "2:21", { x: 30, y: 41 });
    place(battle, "1:40", { x: 31, y: 41 }, 1);
    place(battle, "1:8", { x: 28, y: 41 });
    expect(battle.planEnemyAiAction("2:21")).toMatchObject({ kind: "attack", targetId: "1:8" });
  });

  it("sends 麗蘭特 after 蘇蘭達 at full stride instead of holding by the reinforcements (REMAKE-184)", () => {
    const battle = huntBattle();
    battle.beginEnemyPhase();
    expect(battle.unit("2:40")).toMatchObject({ x: 32, y: 48 });
    place(battle, "2:21", { x: 30, y: 46 });
    place(battle, "1:8", { x: 30, y: 30 });
    // REMAKE-118 kept the named leader within reach of the cavalry at (32,48),
    // and every cell nearer 蘇蘭達 left it behind, so she used to wait here.
    const action = battle.planEnemyAiAction("2:21");
    expect(action).toMatchObject({ kind: "move", pursuitProgress: 7 });
    expect(manhattan(action?.path.at(-1) ?? { x: 30, y: 46 }, { x: 32, y: 48 })).toBeGreaterThan(4);
  });

  it("keeps 麗蘭特 chasing on low life instead of resting (REMAKE-184)", () => {
    const battle = huntBattle();
    const lilante = battle.unit("2:21")!;
    lilante.life = Math.floor(battle.statsFor(lilante).maxLife / 10);
    expect(battle.planEnemyAiAction("2:21")).toMatchObject({ kind: "move" });
  });

  it("has a boxed-in 麗蘭特 fight the rangers holding her (REMAKE-184)", () => {
    const battle = huntBattle();
    place(battle, "2:21", { x: 30, y: 41 });
    const wall = [{ x: 30, y: 42 }, { x: 29, y: 41 }, { x: 31, y: 41 }, { x: 30, y: 40 }];
    for (const [index, id] of ["1:40", "1:41", "1:42", "1:19"].entries()) place(battle, id, wall[index]);
    const action = battle.planEnemyAiAction("2:21");
    expect(action).toMatchObject({ kind: "attack" });
    expect(["1:40", "1:41", "1:42", "1:19"]).toContain(action?.targetId);
  });

  it("no longer lets a lone 陸戰騎士 蘇蘭達 dash to the ship untouched (REMAKE-184)", () => {
    // The reported line: 蘇蘭達 runs straight for the boarding cells from round 1
    // while everyone else stays put. Before REMAKE-184 nobody caught her by round 8.
    const battle = huntBattle();
    const boarding: Position[] = [];
    for (let cell = 0; cell < 280; cell += 1) boarding.push({ x: cell % 50, y: Math.floor(cell / 50) });
    let lilanteHits = 0;
    for (let round = 1; round <= 12 && battle.outcome() === "ongoing"; round += 1) {
      const sulanda = battle.unit("1:8")!;
      const remaining = movementCostsToNearestTarget(sulanda, boarding, [], {
        width: 50, height: 50, terrainSlotAt: (position) => battle.terrainSlotAt(position),
      });
      const goal = battle.reachableCells("1:8")
        .sort((left, right) => (remaining.get(positionKey(left)) ?? 999) - (remaining.get(positionKey(right)) ?? 999)
          || left.y - right.y || left.x - right.x)[0];
      for (const step of battle.movementPath("1:8", goal).slice(1)) battle.moveUnitStep("1:8", step);
      if (battle.outcome() !== "ongoing") break;
      battle.clearActionState(1);
      battle.beginEnemyPhase();
      const order = new Set(battle.enemyActionOrder());
      while (order.size > 0) {
        const selection = battle.selectNextEnemyAiAction([...order]);
        if (!selection) break;
        order.delete(selection.unitId);
        const action = selection.action ?? battle.planEnemyAiAction(selection.unitId);
        if (!action) continue;
        for (const step of action.path.slice(1)) battle.moveUnitStep(action.unitId, step);
        const before = battle.unit("1:8")?.life ?? 0;
        if (action.kind === "attack" && action.targetId) battle.attack(action.unitId, action.targetId);
        else if (action.kind === "rest") battle.rest(action.unitId);
        else battle.spendAction(action.unitId);
        if (action.unitId === "2:21" && (battle.unit("1:8")?.life ?? 0) < before) lilanteHits += 1;
      }
      battle.startNextRound();
    }
    expect(lilanteHits).toBeGreaterThanOrEqual(2);
  });

  it("spawns one reinforcement at the lower edge before each enemy phase", () => {
    const battle = new Stage11Battle(campaign);
    const callsBefore = battle.rng.calls;

    battle.beginEnemyPhase();
    expect(battle.unit("2:40")).toMatchObject({
      classId: "cavalry",
      name: "騎兵",
      x: 32,
      y: 48,
      acted: false,
      actionDisabled: false,
    });
    // Descriptors 40..59 carry FF portraits: reinforcements stay rank and file.
    expect(usesClassIdentity(battle.unit("2:40")!)).toBe(true);
    expect(battle.enemyActionOrder()).toContain("2:40");
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "pegasus-pursuer",
      label: "追擊增援隊",
      doctrine: { strategy: "expert" },
    });
    expect(battle.rng.calls).toBe(callsBefore);

    battle.beginEnemyPhase();
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(2);
    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.unit("2:41")).toMatchObject({
      classId: "pegasus-warrior",
      x: 31,
      y: 48,
    });
  });

  it("reuses a defeated slot and preserves generated units across restore", () => {
    const battle = new Stage11Battle(campaign);
    battle.beginEnemyPhase();
    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.enemyBehaviorFor("2:41")).toBe(0);

    const restored = new Stage11Battle(campaign);
    restored.restore(battle.serializableSnapshot(), battle.campaignSnapshot().roster);
    expect(restored.forceForUnit("2:40")?.id).toBe("pegasus-pursuer");
    expect(restored.forceForUnit("2:41")?.id).toBe("pegasus-pursuer");
    expect(restored.unit("2:40")).toMatchObject({ classId: "cavalry", x: 32, y: 48 });

    restored.removeStoryUnits([{ side: 2, slot: 40 }]);
    restored.startNextRound();
    restored.beginEnemyPhase();
    expect(restored.unit("2:40")).toMatchObject({ classId: "cavalry", x: 32, y: 48 });
    expect(restored.unit("2:42")).toBeUndefined();
  });

  it("uses all 40 simultaneous native slots and then stops until one is removed", () => {
    const battle = new Stage11Battle(campaign);
    for (let index = 0; index < 40; index += 1) {
      battle.beginEnemyPhase();
      if (index < 39) battle.startNextRound();
    }
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(41);
    expect(battle.unit("2:79")).toMatchObject({ classId: "soldier" });

    battle.startNextRound();
    battle.beginEnemyPhase();
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(41);
  });
});
