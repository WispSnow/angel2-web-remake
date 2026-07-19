import { describe, expect, it } from "vitest";
import { STAGE0 } from "../../src/game/content/stage0";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { manhattan, movementCost, positionKey, reachableCells, zoneOfControl } from "../../src/game/simulation/grid";
import { DeterministicRng } from "../../src/game/simulation/rng";

function battleAtPlayableOpening(seed = 0x1234): Stage0Battle {
  const battle = new Stage0Battle(new DeterministicRng(seed));
  const nia = battle.unit("1:0")!;
  nia.x = STAGE0.opening.to.x;
  nia.y = STAGE0.opening.to.y;
  return battle;
}

describe("stage 0 battle simulation", () => {
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
    expect(movementCost(0, { x: 21, y: 20 })).toBe(1);
    expect(movementCost(0, { x: 22, y: 24 })).toBe(2);
    expect(movementCost(0, { x: 25, y: 19 })).toBe(3);
    expect(movementCost(0, { x: 0, y: 0 })).toBe(99);

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
    const defenderLife = battle.unit("2:45")!.life;
    const result = battle.attack("1:0", "2:45");
    expect(result.damage).toBeGreaterThanOrEqual(8);
    expect(result.counterDamage).toBeGreaterThanOrEqual(0);
    expect(battle.unit("2:45")!.life).toBe(defenderLife - result.damage);
    expect(battle.unit("1:0")!.acted).toBe(true);
    expect(battle.unit("1:0")!.experience).toBe(result.experienceGained);
  });

  it("restores fifteen percent of maximum life before consuming the unit action", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    nia.life = 100;

    expect(battle.rest(nia.id)).toBe(24);
    expect(nia.life).toBe(124);
    expect(nia.acted).toBe(true);
    expect(battle.rest(nia.id)).toBe(0);
    expect(nia.life).toBe(124);
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

    expect(battle.restAllUnspentAllies()).toEqual({ count: 5, recovered: 34 });
    expect(nia).toMatchObject({ life: 124, acted: true });
    expect(ximi).toMatchObject({ life: 160, acted: true });
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

  it("previews the same stage-specific movement budget used by enemy routing", () => {
    const battle = battleAtPlayableOpening();
    const enemy = battle.unit("2:41")!;
    enemy.x = 21;
    enemy.y = 19;
    battle.units = [enemy];

    const nativeClassRange = reachableCells(enemy, battle.units);
    const stageRouteRange = battle.enemyMovementRange(enemy.id);

    expect(stageRouteRange).toEqual(reachableCells(enemy, battle.units, STAGE0.enemyRouteMovement));
    expect(stageRouteRange.length).toBeGreaterThan(nativeClassRange.length);
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
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.every((unit) => unit.acted === false)).toBe(true);
    expect(battle.focusId).toBe("1:0");
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
    expect(battle.unit("2:45")).toBeUndefined();
    expect(battle.unit("1:0")!.life).toBe(niaLife);
  });
});
