import { describe, expect, it } from "vitest";
import { terrainDefensePercentFor } from "../../src/game/content/classes";
import { STAGE0 } from "../../src/game/content/stage0";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { manhattan, movementCost, positionKey, reachableCells, zoneOfControl } from "../../src/game/simulation/grid";
import { DeterministicRng } from "../../src/game/simulation/rng";

function battleAtPlayableOpening(seed = 0x1234, difficulty: 0 | 1 | 2 | 3 = 0): Stage0Battle {
  const battle = new Stage0Battle(difficulty, new DeterministicRng(seed));
  const nia = battle.unit("1:0")!;
  nia.x = STAGE0.opening.to.x;
  nia.y = STAGE0.opening.to.y;
  return battle;
}

describe("stage 0 battle simulation", () => {
  it("rebuilds the fixed battle from an immutable campaign-entry snapshot", () => {
    const source = new Stage0Battle(2, new DeterministicRng(0x1357_2468, 11));
    const entry = source.campaignSnapshot();
    entry.roster[0] = {
      ...entry.roster[0],
      classId: "cavalry",
      experience: 0,
      life: 123,
    };

    const restored = Stage0Battle.fromCampaignEntry(entry);

    expect(restored).toMatchObject({ difficulty: 2, round: 1, focusId: "1:0" });
    expect(restored.rng).toMatchObject({ state: 0x1357_2468, calls: 11 });
    expect(restored.unit("1:0")).toMatchObject({
      classId: "cavalry",
      className: "騎兵",
      experience: 0,
      life: 123,
      acted: false,
      actionDisabled: false,
    });
    expect(restored.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(restored.campaignSnapshot()).toEqual(entry);
  });

  it("uses difficulty-derived enemies in deterministic combat", () => {
    const easy = battleAtPlayableOpening(42, 0);
    const hardest = battleAtPlayableOpening(42, 3);
    expect(easy.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    expect(hardest.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);

    const easyResult = easy.attack("1:0", "2:45");
    const hardestResult = hardest.attack("1:0", "2:45");

    expect(hardestResult.damage).toBeLessThan(easyResult.damage);
    expect(hardestResult.counterDamage).toBeGreaterThan(easyResult.counterDamage);
    expect(hardestResult.experienceGained).toBeGreaterThan(easyResult.experienceGained);
    expect(easy.unit("2:45")).toMatchObject({ experience: 101 });
    expect(hardest.unit("2:45")).toMatchObject({ experience: 401 });
  });

  it("keeps simulation deterministic for equal seed and commands", () => {
    const left = battleAtPlayableOpening(42);
    const right = battleAtPlayableOpening(42);
    expect(left.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    expect(right.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    expect(left.attack("1:0", "2:45")).toEqual(right.attack("1:0", "2:45"));
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it("provides movement range while respecting occupied cells", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const cells = reachableCells(nia, battle.units);
    expect(cells).toContainEqual({ x: 28, y: 26 });
    expect(cells).not.toContainEqual({ x: 27, y: 26 });
  });

  it("uses the native strict movement boundary for a movement-4 soldier", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    nia.x = 21;
    nia.y = 19;
    battle.units = [nia];

    const cells = reachableCells(nia, battle.units);

    expect(cells).toContainEqual({ x: 21, y: 22 });
    expect(cells).not.toContainEqual({ x: 21, y: 23 });
    expect(manhattan(nia, { x: 21, y: 22 })).toBe(3);
  });

  it("charges the verified stage-0 terrain costs and stops after expensive cells", () => {
    expect(movementCost("soldier", { x: 21, y: 20 })).toBe(1);
    expect(movementCost("soldier", { x: 22, y: 24 })).toBe(2);
    expect(movementCost("soldier", { x: 25, y: 19 })).toBe(3);
    expect(movementCost("soldier", { x: 0, y: 0 })).toBe(99);

    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    nia.x = 24;
    nia.y = 19;
    battle.units = [nia];
    const cells = reachableCells(nia, battle.units);

    expect(cells).toContainEqual({ x: 25, y: 19 });
    expect(cells).not.toContainEqual({ x: 26, y: 19 });
  });

  it("can path through a friendly unit but cannot stop on its occupied cell", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const ally = battle.unit("1:43")!;
    nia.x = 21;
    nia.y = 19;
    ally.x = 21;
    ally.y = 20;
    battle.units = [nia, ally];

    const cells = reachableCells(nia, battle.units);

    expect(cells).not.toContainEqual({ x: 21, y: 20 });
    expect(cells).toContainEqual({ x: 21, y: 21 });
    expect(battle.moveUnitStep(nia.id, { x: 21, y: 20 })).toBe(false);
    const path = battle.movementPath(nia.id, { x: 21, y: 21 });
    expect(path).toEqual([
      { x: 21, y: 19 },
      { x: 21, y: 20 },
      { x: 21, y: 21 },
    ]);
    expect(battle.moveUnitStep(nia.id, path[1], true)).toBe(true);
    expect(battle.moveUnitStep(nia.id, path[2])).toBe(true);
    expect(nia).toMatchObject({ x: 21, y: 21 });
    expect(ally).toMatchObject({ x: 21, y: 20 });
  });

  it("allows entering an enemy zone of control but never paths through it", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const enemy = battle.unit("2:45")!;
    nia.x = 21;
    nia.y = 19;
    enemy.x = 22;
    enemy.y = 20;
    battle.units = [nia, enemy];
    const withoutEnemy = reachableCells(nia, [nia]);
    const withEnemy = reachableCells(nia, [nia, enemy]);

    expect(withoutEnemy).toContainEqual({ x: 21, y: 21 });
    expect(withEnemy).toContainEqual({ x: 21, y: 20 });
    expect(withEnemy).not.toContainEqual({ x: 21, y: 21 });
    expect(battle.moveUnit(nia.id, { x: 21, y: 21 })).toBe(false);
  });

  it("lets an enemy leave a control zone it starts in", () => {
    const battle = battleAtPlayableOpening();
    const enemy = battle.unit("2:45");
    const adjacentAlly = battle.unit("1:43");

    expect(enemy).toBeDefined();
    expect(adjacentAlly).toBeDefined();
    expect(Math.abs(enemy!.x - adjacentAlly!.x) + Math.abs(enemy!.y - adjacentAlly!.y)).toBe(1);

    const movement = battle.planRouteEnemy(enemy!.id);

    expect(movement).toBeDefined();
    expect(movement!.path.length).toBeGreaterThan(1);
    expect(movement!.path[0]).toEqual({ x: enemy!.x, y: enemy!.y });
    expect(movement!.destination).not.toEqual({ x: enemy!.x, y: enemy!.y });
  });

  it("resolves ordinary damage, counterattack, experience and action consumption", () => {
    const battle = battleAtPlayableOpening(7);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const attacker = battle.unit("1:0")!;
    const defender = battle.unit("2:45")!;
    const defenderLife = defender.life;
    const attackerStats = battle.effectiveStatsFor(attacker);
    const defenderStats = battle.effectiveStatsFor(defender);
    const defenderTerrainDefense = Math.floor(
      defenderStats.defense
      * terrainDefensePercentFor(defender.classId, battle.terrainSlotAt(defender))
      / 100,
    );
    const attackerTerrainDefense = Math.floor(
      attackerStats.defense
      * terrainDefensePercentFor(attacker.classId, battle.terrainSlotAt(attacker))
      / 100,
    );
    const trial = battle.rng.clone();
    const expectedDamage = Math.max(
      0,
      attackerStats.attack - defenderStats.defense - defenderTerrainDefense,
    ) + trial.between(4, 7) + trial.between(4, 7);
    const expectedCounterDamage = Math.floor(Math.max(
      0,
      defenderStats.attack - attackerStats.defense - attackerTerrainDefense,
    ) / 2);
    const result = battle.attack("1:0", "2:45");
    expect(result.damage).toBe(expectedDamage);
    expect(result.counterDamage).toBe(expectedCounterDamage);
    expect(result.counterOccurred).toBe(true);
    expect(battle.unit("2:45")!.life).toBe(defenderLife - result.damage);
    expect(battle.unit("1:0")!.acted).toBe(true);
    expect(battle.unit("1:0")!.experience).toBe(299 + result.experienceGained);
  });

  it("restores fifteen percent of maximum life before consuming the unit action", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    nia.life = 100;

    expect(battle.rest(nia.id)).toBe(27);
    expect(nia.life).toBe(127);
    expect(nia.acted).toBe(true);
    expect(battle.rest(nia.id)).toBe(0);
    expect(nia.life).toBe(127);
  });

  it("applies the native all-rest command only to remaining unspent allies", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const ximi = battle.unit("1:1")!;
    const alreadySpent = battle.unit("1:43")!;
    nia.life = 100;
    ximi.life = 150;
    alreadySpent.life = 100;
    alreadySpent.acted = true;

    expect(battle.restAllUnspentAllies()).toEqual({ count: 5, recovered: 54 });
    expect(nia).toMatchObject({ life: 127, acted: true });
    expect(ximi).toMatchObject({ life: 177, acted: true });
    expect(alreadySpent).toMatchObject({ life: 100, acted: true });
    expect(battle.units.filter((unit) => unit.side === 1).every((unit) => unit.acted)).toBe(true);
  });

  it("plans ordinary allied AI attacks and leader-cohesion movement", () => {
    const battle = battleAtPlayableOpening();
    const adjacentAlly = battle.unit("1:43")!;
    const freeAction = battle.planAlliedAiAction(adjacentAlly.id);

    expect(freeAction).toMatchObject({ unitId: adjacentAlly.id, kind: "attack" });
    expect(freeAction?.targetId).toBeDefined();
    expect(freeAction?.path.length).toBeGreaterThan(0);

    const distantAlly = battle.unit("1:41")!;
    const followAction = battle.planAlliedAiAction(distantAlly.id, "1:0");
    expect(followAction).toMatchObject({ unitId: distantAlly.id, kind: "move" });
    expect(followAction?.path.length).toBeGreaterThan(1);
    expect(manhattan(followAction!.path[0], distantAlly)).toBe(0);
    for (let index = 1; index < followAction!.path.length; index += 1) {
      expect(manhattan(followAction!.path[index - 1], followAction!.path[index])).toBe(1);
    }
  });

  it("runs behavior 12 toward the hidden palace exit without attacking", () => {
    const battle = battleAtPlayableOpening();
    const enemy = battle.unit("2:41")!;
    const before = manhattan(enemy, STAGE0.enemyRouteTarget);
    const alliedLives = battle.units.filter((unit) => unit.side === 1).map((unit) => unit.life);
    const movement = battle.moveRouteEnemy(enemy.id)!;
    expect(movement.path.length).toBeGreaterThan(1);
    for (let index = 1; index < movement.path.length; index += 1) {
      expect(manhattan(movement.path[index - 1], movement.path[index])).toBe(1);
    }
    expect(enemy).toMatchObject(movement.destination);
    expect(manhattan(enemy, STAGE0.enemyRouteTarget)).toBeLessThan(before);
    expect(battle.units.filter((unit) => unit.side === 1).map((unit) => unit.life)).toEqual(alliedLives);
  });

  it("uses native class priority followed by stable row-major scanning", () => {
    const battle = battleAtPlayableOpening();

    expect(battle.enemyActionOrder()).toEqual([
      "2:15",
      "2:48",
      "2:46",
      "2:47",
      "2:45",
      "2:44",
      "2:43",
      "2:40",
      "2:41",
      "2:42",
    ]);

    battle.unit("2:15")!.acted = true;
    expect(battle.enemyActionOrder()[0]).toBe("2:48");
    expect(battle.enemyActionOrder()).not.toContain("2:15");
  });

  it("plans every enemy route with the current allied zone of control", () => {
    const battle = battleAtPlayableOpening();
    const enemyIds = battle.units.filter((unit) => unit.side === 2).map((unit) => unit.id);

    for (const enemyId of enemyIds) {
      const enemy = battle.unit(enemyId);
      if (!enemy) continue;
      const controlled = zoneOfControl(enemy, battle.units);
      const movement = battle.planRouteEnemy(enemyId);
      expect(movement).toBeDefined();

      // Starting inside ZOC is allowed, and entering ZOC may be the endpoint;
      // no intermediate step may pass through a cell controlled by side 1.
      for (const step of movement!.path.slice(1, -1)) {
        expect(controlled.has(positionKey(step))).toBe(false);
      }
      battle.moveRouteEnemy(enemyId);
    }
  });

  it("previews the same stage-specific movement budget at every difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = battleAtPlayableOpening(0x1234, difficulty);
      const enemy = battle.unit("2:41");
      if (!enemy) throw new Error("missing stage 0 route enemy");
      enemy.x = 21;
      enemy.y = 19;
      battle.units = [enemy];

      const nativeClassRange = reachableCells(enemy, battle.units);
      const stageRouteRange = battle.enemyMovementRange(enemy.id);

      expect(stageRouteRange).toEqual(reachableCells(enemy, battle.units, STAGE0.enemyRouteMovement));
      expect(stageRouteRange.length).toBeGreaterThan(nativeClassRange.length);
    }
  });

  it("accepts all three staircase cells and evacuates during the route action", () => {
    for (const exit of STAGE0.enemyExitCells) {
      const battle = battleAtPlayableOpening();
      const nia = battle.unit("1:0")!;
      const hading = battle.unit("2:15")!;
      battle.units = [nia, hading];
      hading.x = exit.x;
      hading.y = exit.y;
      expect(battle.evacuateEnemy(hading.id)).toBe(true);
      expect(battle.unit(hading.id)).toBeUndefined();
      expect(battle.outcome()).toBe("victory");
    }

    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const hading = battle.unit("2:15")!;
    const leftExit = STAGE0.enemyExitCells[0];
    battle.units = [nia, hading];
    hading.x = leftExit.x;
    hading.y = leftExit.y - 1;
    const movement = battle.moveRouteEnemy(hading.id)!;
    expect(movement.reachedExit).toBe(true);
    expect(movement.destination).toEqual(STAGE0.enemyRouteTarget);
    expect(movement.path.at(-1)).toEqual(movement.destination);
    expect(movement.path.filter((step) => STAGE0.enemyExitCells.some((exit) => positionKey(exit) === positionKey(step)))).toHaveLength(1);
    expect(battle.unit(hading.id)).toBeUndefined();
    expect(battle.outcome()).toBe("victory");

    const crossingBattle = battleAtPlayableOpening();
    const crossingNia = crossingBattle.unit("1:0")!;
    const crossingHading = crossingBattle.unit("2:15")!;
    crossingBattle.units = [crossingNia, crossingHading];
    crossingHading.x = leftExit.x - 1;
    crossingHading.y = leftExit.y;
    const crossingMovement = crossingBattle.moveRouteEnemy(crossingHading.id)!;
    expect(crossingMovement.destination).toEqual(leftExit);
    expect(crossingMovement.path.at(-1)).toEqual(leftExit);
    expect(crossingMovement.path).not.toContainEqual(STAGE0.enemyRouteTarget);
    expect(crossingBattle.unit(crossingHading.id)).toBeUndefined();
  });

  it("advances rounds and refreshes action state", () => {
    const battle = battleAtPlayableOpening();
    battle.unit("1:0")!.acted = true;
    battle.unit("1:0")!.actionDisabled = true;
    battle.unit("2:15")!.actionDisabled = true;
    battle.clearActionDisableState(1);
    expect(battle.unit("1:0")!.actionDisabled).toBe(false);
    expect(battle.unit("2:15")!.actionDisabled).toBe(true);
    expect(battle.enemyActionOrder()).not.toContain("2:15");
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.every((unit) => unit.acted === false)).toBe(true);
    expect(battle.units.every((unit) => unit.actionDisabled === false)).toBe(true);
    expect(battle.focusId).toBe("1:0");
  });

  it("makes a frozen defender untargetable, then vulnerable next round", () => {
    const battle = battleAtPlayableOpening();
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const defender = battle.unit("2:45")!;
    defender.actionDisabled = true;
    const lifeBefore = defender.life;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };
    expect(() => battle.attack("1:0", "2:45")).toThrow("illegal ordinary attack");
    expect(defender.life).toBe(lifeBefore);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
    expect(battle.unit("1:0")!.acted).toBe(false);

    battle.startNextRound();
    expect(defender.actionDisabled).toBe(false);
    const thawedResult = battle.attack("1:0", "2:45");
    expect(thawedResult.damage).toBeGreaterThan(0);
    expect(defender.life).toBeLessThan(lifeBefore);
  });

  it("keeps every surviving ally mobile after the first enemy route phase", () => {
    const battle = battleAtPlayableOpening();
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    battle.attack("1:0", "2:45");

    const enemyIds = battle.units.filter((unit) => unit.side === 2).map((unit) => unit.id);
    for (const enemyId of enemyIds) battle.moveRouteEnemy(enemyId);
    battle.startNextRound();

    const stalledAllies = battle.units
      .filter((unit) => unit.side === 1)
      .filter((unit) => reachableCells(unit, battle.units).length <= 1)
      .map((unit) => unit.id);

    expect(stalledAllies).toEqual([]);
  });

  it("implements the exact stage defeat and victory predicates", () => {
    const defeat = battleAtPlayableOpening();
    defeat.units = defeat.units.filter((unit) => unit.id !== "1:0");
    expect(defeat.outcome()).toBe("defeat");

    const victory = battleAtPlayableOpening();
    victory.units = victory.units.filter((unit) => unit.side === 1);
    expect(victory.outcome()).toBe("victory");
  });

  it("saturates life at zero and removes a killed unit before counterattack", () => {
    const battle = battleAtPlayableOpening(99);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    battle.unit("2:45")!.life = 1;
    const niaLife = battle.unit("1:0")!.life;
    const result = battle.attack("1:0", "2:45");
    expect(result.defenderDied).toBe(true);
    expect(result.counterDamage).toBe(0);
    expect(result.counterOccurred).toBe(false);
    expect(battle.unit("2:45")).toBeUndefined();
    expect(battle.unit("1:0")!.life).toBe(niaLife);
  });
});
