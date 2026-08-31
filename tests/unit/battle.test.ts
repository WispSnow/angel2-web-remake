import { describe, expect, it } from "vitest";
import { killRewardFor, terrainDefensePercentFor } from "../../src/game/content/classes";
import { STAGE0 } from "../../src/game/content/stage0";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { manhattan, movementCost, positionKey, reachableCells, zoneOfControl } from "../../src/game/simulation/grid";
import {
  STAGE_ROUND_LIMIT,
  STAGE_ROUND_LIMIT_WARNING_ROUNDS,
} from "../../src/game/simulation/objectives";
import { DeterministicRng } from "../../src/game/simulation/rng";
import type { Position } from "../../src/game/types";

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
    // 新战入场按原版 `0000:536B` 重建属性并回满生命，不沿用快照里的残血 123。
    expect(restored.unit("1:0")).toMatchObject({
      classId: "cavalry",
      className: "騎兵",
      experience: 0,
      life: 200,
      acted: false,
      actionDisabled: false,
    });
    expect(restored.units.filter(({ side }) => side === 2)).toHaveLength(10);
    expect(restored.campaignSnapshot()).toEqual({
      ...entry,
      roster: entry.roster.map((slot) => (slot.slot === 0 ? { ...slot, life: 200 } : slot)),
    });
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
    expect(easy.unit("2:45")).toMatchObject({
      experience: 101 + easyResult.counterExperienceGained,
    });
    expect(hardest.unit("2:45")).toMatchObject({
      experience: 401 + hardestResult.counterExperienceGained,
    });
  });

  it("increments the native record counter only when an allied ordinary attack kills", () => {
    // Native module 29 runs the KILL_ALL tail (0000:9252-9260) exclusively on
    // the killed-defender branch 0000:921C; a defender that survives returns at
    // 0000:921B first. 戰績 is therefore a kill count for the initiating slot.
    const survived = battleAtPlayableOpening(42);
    survived.setCampaignRecordCounters([7]);
    expect(survived.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    expect(survived.attack("1:0", "2:45").defenderDied).toBe(false);
    expect(survived.campaignSnapshot().recordCounters?.[0]).toBe(7);

    const killed = battleAtPlayableOpening(42);
    killed.setCampaignRecordCounters([7]);
    expect(killed.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const target = killed.unit("2:45");
    if (!target) throw new Error("missing stage 0 target");
    target.life = 1;
    expect(killed.attack("1:0", "2:45").defenderDied).toBe(true);
    expect(killed.campaignSnapshot().recordCounters?.[0]).toBe(8);
  });

  it("keeps an enemy kill out of the record counters", () => {
    // REMAKE-088: native 0000:9252 has no side test, so a side-2 kill wrote to
    // the one shared array under the enemy's own slot and inflated the
    // same-numbered ally's card and the epilogue total. stableRemake fixes that.
    const battle = battleAtPlayableOpening(42);
    const counters = Array<number>(75).fill(0);
    battle.setCampaignRecordCounters(counters);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("missing 妮雅");
    nia.life = 1;
    const result = battle.attack("2:45", "1:0");
    expect(result.defenderDied).toBe(true);
    expect(battle.campaignSnapshot().recordCounters).toEqual(counters);
  });

  it("leaves the native record counter alone when an allied counterattack kills", () => {
    // The mirrored counter routine 0000:9161 splits on the same kill test and
    // ends at 0000:91C4 without a KILL_ALL write, so only the unit that
    // initiated the attack can record a kill.
    const battle = battleAtPlayableOpening(42);
    battle.setCampaignRecordCounters([7]);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const enemy = battle.unit("2:45");
    if (!enemy) throw new Error("missing stage 0 enemy");
    enemy.life = 1;
    const result = battle.attack("2:45", "1:0");
    expect(result.counterOccurred).toBe(true);
    expect(result.attackerDied).toBe(true);
    expect(battle.campaignSnapshot().recordCounters?.[0]).toBe(7);
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

  it("charges terrain cost for the last step into contact as well", () => {
    // REMAKE-104: 原版 1000:3E81 只要求「敌方邻格的某个邻格剩余 >= 2」，从不减去该格自己的
    // 地形代价，等于按代价 1 写死最后一步；复刻按地形代价照常结算。宫殿第 36 行代价为 2，
    // 妮雅（移动 4）从 (25,33) 出发累计到 (25,36) 是 4，超出预算，因此本回合打不到 (25,37)。
    expect(movementCost("soldier", { x: 25, y: 35 })).toBe(1);
    expect(movementCost("soldier", { x: 25, y: 36 })).toBe(2);

    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const enemy = battle.unit("2:47")!;
    nia.x = 25;
    nia.y = 33;
    enemy.x = 25;
    enemy.y = 37;
    battle.units = [nia, enemy];
    const cells = reachableCells(nia, battle.units);

    expect(cells).toContainEqual({ x: 25, y: 35 });
    expect(cells).not.toContainEqual({ x: 25, y: 36 });
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

  it("keeps an occupied cell out of the control zone and propagates through it", () => {
    // `1000:3E3B` 先读阵营图，只把**空的**敌方邻格保留为 `FFh`。妮雅旁边的 (25,27) 由
    // side 2 自己占着，所以它不进保留集合：模式 `Y` 照常扣 1 穿过去继续向下，只是不能
    // 停在上面。复刻此前把全部四邻记为终止格，才让 2:47 绕道 (26,26..28)。
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const actor = battle.unit("2:47")!;
    const ally = battle.unit("2:48")!;
    nia.x = 24;
    nia.y = 27;
    actor.x = 25;
    actor.y = 26;
    ally.x = 25;
    ally.y = 27;
    battle.units = [nia, actor, ally];

    const controlled = zoneOfControl(actor, battle.units);
    expect(controlled.has(positionKey(ally))).toBe(false);
    expect(controlled.has(positionKey({ x: 24, y: 26 }))).toBe(true);

    const range = battle.enemyMovementRange(actor.id);
    expect(range).not.toContainEqual({ x: 25, y: 27 });
    expect(range).toContainEqual({ x: 25, y: 28 });
    expect(range).toContainEqual({ x: 25, y: 29 });
    // (25,30) 属代价 2 的槽 14，累计 5 不小于路线移动力 5，所以本回合仍到不了；
    // 这条边界由地形代价决定，与控制区无关。
    expect(range).not.toContainEqual({ x: 25, y: 30 });

    const movement = battle.planRouteEnemy(actor.id);
    expect(movement?.path).toEqual([
      { x: 25, y: 26 },
      { x: 25, y: 27 },
      { x: 25, y: 28 },
      { x: 25, y: 29 },
    ]);
  });

  it("does not let an ally beside an enemy truncate another ally's range", () => {
    // 保留规则不分阵营，模式 `M` 同样执行，所以我方棋子也会在控制区上开出可通行缺口。
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const ally = battle.unit("1:43")!;
    const enemy = battle.unit("2:45")!;
    nia.x = 25;
    nia.y = 26;
    ally.x = 25;
    ally.y = 27;
    enemy.x = 24;
    enemy.y = 27;
    battle.units = [nia, ally, enemy];

    const cells = reachableCells(nia, battle.units);

    expect(zoneOfControl(nia, battle.units).has(positionKey(ally))).toBe(false);
    expect(cells).not.toContainEqual({ x: 25, y: 27 });
    expect(cells).toContainEqual({ x: 25, y: 28 });
    expect(cells).toContainEqual({ x: 25, y: 29 });
    expect(battle.movementPath(nia.id, { x: 25, y: 29 })).toEqual([
      { x: 25, y: 26 },
      { x: 25, y: 27 },
      { x: 25, y: 28 },
      { x: 25, y: 29 },
    ]);
    // 空的控制区格照旧终止传播：可以停在 (24,26)，但不能借它走到 (23,26)。
    expect(cells).toContainEqual({ x: 24, y: 26 });
    expect(cells).not.toContainEqual({ x: 23, y: 26 });
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
    const defenderExperience = defender.experience;
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
    const expectedExperience = defenderStats.level + trial.between(4, 7);
    const expectedCounterExperience = Math.floor((attackerStats.level + trial.between(4, 7)) / 2);
    const result = battle.attack("1:0", "2:45");
    expect(result.damage).toBe(expectedDamage);
    expect(result.counterDamage).toBe(expectedCounterDamage);
    expect(result.counterOccurred).toBe(true);
    expect(result.experienceGained).toBe(expectedExperience);
    expect(result.counterExperienceGained).toBe(expectedCounterExperience);
    expect(battle.unit("2:45")!.life).toBe(defenderLife - result.damage);
    expect(battle.unit("1:0")!.acted).toBe(true);
    expect(battle.unit("1:0")!.experience).toBe(299 + result.experienceGained);
    expect(battle.unit("2:45")!.experience).toBe(
      defenderExperience + result.counterExperienceGained,
    );
  });

  it("awards the full class kill reward when a counterattack defeats the initiator", () => {
    const battle = battleAtPlayableOpening(19);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const attacker = battle.unit("1:0")!;
    const defender = battle.unit("2:45")!;
    attacker.life = 1;
    const defenderExperience = defender.experience;
    const trial = battle.rng.clone();
    trial.between(4, 7);
    trial.between(4, 7);
    trial.between(4, 7);
    const expectedCounterExperience = killRewardFor(attacker.classId, attacker.side)
      + trial.between(4, 7);

    const result = battle.attack(attacker.id, defender.id);

    expect(result).toMatchObject({
      counterOccurred: true,
      attackerDied: true,
      counterExperienceGained: expectedCounterExperience,
    });
    expect(result.counterExperienceGained).toBeGreaterThan(10);
    expect(defender.experience).toBe(defenderExperience + expectedCounterExperience);
  });

  it("awards counterattack experience even when the physical counter deals zero damage", () => {
    const battle = battleAtPlayableOpening(23);
    expect(battle.moveUnit("1:0", { x: 28, y: 26 })).toBe(true);
    const attacker = battle.unit("1:0")!;
    const defender = battle.unit("2:45")!;
    attacker.classId = "magic-armor-warrior";
    const attackerLife = attacker.life;
    const defenderExperience = defender.experience;

    const result = battle.attack(attacker.id, defender.id);

    expect(result).toMatchObject({
      counterOccurred: true,
      counterDamage: 0,
      counterExperienceGained: expect.any(Number),
    });
    expect(result.counterExperienceGained).toBeGreaterThan(0);
    expect(attacker.life).toBe(attackerLife);
    expect(defender.experience).toBe(defenderExperience + result.counterExperienceGained);
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

  it("accepts an already-spent or action-disabled ally as the follow-leader anchor", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const ximi = battle.unit("1:1")!;
    nia.acted = true;
    ximi.actionDisabled = true;
    battle.focusId = "1:43";

    expect(battle.commitFollowLeader(nia.id)).toBe(true);
    expect(nia).toMatchObject({ acted: true, actionDisabled: false });
    expect(battle.focusId).toBe(nia.id);
    expect(battle.commitFollowLeader(ximi.id)).toBe(true);
    expect(ximi).toMatchObject({ acted: true, actionDisabled: true });
    expect(battle.focusId).toBe(ximi.id);
    expect(battle.commitFollowLeader("2:40")).toBe(false);
  });

  it("plans expert allied AI attacks and explicit leader-cohesion movement", () => {
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

  it("routes follow-leader movement around walls even when the detour increases Manhattan distance", () => {
    const battle = battleAtPlayableOpening();
    const leader = battle.unit("1:0")!;
    const follower = battle.unit("1:43")!;
    leader.x = 18;
    leader.y = 20;
    leader.acted = true;
    follower.x = 12;
    follower.y = 20;
    battle.units = [leader, follower];
    const distanceBefore = manhattan(follower, leader);

    const action = battle.planAlliedAiAction(follower.id, leader.id);

    expect(action).toMatchObject({ unitId: follower.id, kind: "move" });
    expect(action?.path).toEqual([
      { x: 12, y: 20 },
      { x: 12, y: 21 },
      { x: 12, y: 22 },
      { x: 13, y: 22 },
    ]);
    expect(manhattan(action!.path.at(-1)!, leader)).toBeGreaterThan(distanceBefore);
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

  it("evacuates every cell above native index 2271, not only the staircase", () => {
    // 1000:1876 只比较行动结束后的格号，所以第 45 行 x>=22、第 46 行全部与三格楼梯
    // 同属撤离区，而 (21,45) 恰好等于 2271 不触发。
    const evacuating: Position[] = [
      ...STAGE0.enemyStaircaseCells,
      { x: 22, y: 45 },
      { x: 29, y: 45 },
      { x: 21, y: 46 },
      { x: 29, y: 46 },
    ];
    for (const cell of evacuating) {
      const battle = battleAtPlayableOpening();
      const nia = battle.unit("1:0")!;
      const hading = battle.unit("2:15")!;
      battle.units = [nia, hading];
      hading.x = cell.x;
      hading.y = cell.y;
      expect(battle.evacuateEnemy(hading.id)).toBe(true);
      expect(battle.unit(hading.id)).toBeUndefined();
      expect(battle.outcome()).toBe("victory");
    }

    for (const cell of [{ x: 21, y: 45 }, { x: 29, y: 44 }] satisfies Position[]) {
      const battle = battleAtPlayableOpening();
      const hading = battle.unit("2:15")!;
      hading.x = cell.x;
      hading.y = cell.y;
      expect(battle.evacuateEnemy(hading.id)).toBe(false);
      expect(battle.unit(hading.id)).toBeDefined();
    }
  });

  it("evacuates a route enemy as soon as its action ends inside the region", () => {
    const battle = battleAtPlayableOpening();
    const nia = battle.unit("1:0")!;
    const hading = battle.unit("2:15")!;
    battle.units = [nia, hading];
    hading.x = 25;
    hading.y = 43;
    const movement = battle.moveRouteEnemy(hading.id)!;
    expect(movement.reachedExit).toBe(true);
    // 撤离区从第 45 行开始，所以本次行动不必走到楼梯锚点。
    expect(movement.destination).toEqual({ x: 25, y: 46 });
    expect(movement.path.at(-1)).toEqual(movement.destination);
    expect(battle.unit(hading.id)).toBeUndefined();
    expect(battle.outcome()).toBe("victory");
  });

  it("keeps a blocked route enemy one row down, beside the unit in its way", () => {
    // 原版行为 12 先用忽略占格的模式 0 探路图定出理想路线，再取该路线上第一个落在
    // 移动图内的格，因此挡路的我方棋子不会被绕开：它只会停到挡路者旁边。
    const beside = battleAtPlayableOpening();
    const enemy = beside.unit("2:47")!;
    const blocker = beside.unit("1:43")!;
    enemy.x = 25;
    enemy.y = 26;
    blocker.x = 25;
    blocker.y = 27;
    beside.units = [beside.unit("1:0")!, blocker, enemy];
    const sidestep = beside.planRouteEnemy(enemy.id)!;
    expect(sidestep.destination).toEqual({ x: 26, y: 27 });
    expect(sidestep.path).toHaveLength(3);

    const above = battleAtPlayableOpening();
    const distantEnemy = above.unit("2:47")!;
    const distantBlocker = above.unit("1:43")!;
    distantEnemy.x = 25;
    distantEnemy.y = 25;
    distantBlocker.x = 25;
    distantBlocker.y = 27;
    above.units = [above.unit("1:0")!, distantBlocker, distantEnemy];
    const singleStep = above.planRouteEnemy(distantEnemy.id)!;
    expect(singleStep.destination).toEqual({ x: 25, y: 26 });
    expect(singleStep.path).toHaveLength(2);

    const mounted = battleAtPlayableOpening();
    const cavalry = mounted.unit("2:15")!;
    const mountedBlocker = mounted.unit("1:43")!;
    cavalry.x = 25;
    cavalry.y = 30;
    mountedBlocker.x = 25;
    mountedBlocker.y = 31;
    mounted.units = [mounted.unit("1:0")!, mountedBlocker, cavalry];
    const mountedStep = mounted.planRouteEnemy(cavalry.id)!;
    expect(mountedStep.destination).toEqual({ x: 26, y: 31 });
    expect(mountedStep.path).toHaveLength(3);
  });

  it("advances a free route enemy straight down its own column", () => {
    // 探路图的同值由后扫描方向覆盖（右 → 下 → 左 → 上），所以横向修正发生在锚点附近，
    // 而不是一开始就并入中央纵列。
    const battle = battleAtPlayableOpening();
    const enemy = battle.unit("2:45")!;
    battle.units = [battle.unit("1:0")!, enemy];
    const movement = battle.planRouteEnemy(enemy.id)!;
    expect(movement.destination).toEqual({ x: enemy.x, y: enemy.y + 3 });
    expect(movement.path.map(positionKey)).toEqual([
      { x: 27, y: 26 },
      { x: 27, y: 27 },
      { x: 27, y: 28 },
      { x: 27, y: 29 },
    ].map(positionKey));
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

  /**
   * REMAKE-110. The stage runs for at most `STAGE_ROUND_LIMIT` full rounds; the
   * counter only crosses the cap at a round boundary, so nothing is stored.
   */
  it("loses the stage once the round counter passes the cap", () => {
    const battle = battleAtPlayableOpening();
    expect(battle.roundLimit).toBe(STAGE_ROUND_LIMIT);

    battle.round = STAGE_ROUND_LIMIT;
    expect(battle.roundsRemaining).toBe(1);
    expect(battle.roundLimitExceeded).toBe(false);
    expect(battle.outcome()).toBe("ongoing");

    battle.startNextRound();
    expect(battle.round).toBe(STAGE_ROUND_LIMIT + 1);
    expect(battle.roundsRemaining).toBe(0);
    expect(battle.roundLimitExceeded).toBe(true);
    expect(battle.outcome()).toBe("defeat");
    // 越过上限的那一档只是判负标记；玩家看到的回合号停在最后一个真的打过的回合。
    expect(battle.displayRound).toBe(STAGE_ROUND_LIMIT);
  });

  it("keeps a victory won on the final round", () => {
    // 上限只在越过回合边界时判负，所以第 99 回合内打完敌人照常胜利。
    const battle = battleAtPlayableOpening();
    battle.round = STAGE_ROUND_LIMIT;
    battle.units = battle.units.filter((unit) => unit.side === 1);
    expect(battle.outcome()).toBe("victory");
  });

  it("marks the warning window only inside the final rounds of the cap", () => {
    const battle = battleAtPlayableOpening();
    expect(battle.roundLimitWarningActive).toBe(false);

    battle.round = STAGE_ROUND_LIMIT - STAGE_ROUND_LIMIT_WARNING_ROUNDS;
    expect(battle.roundLimitWarningActive).toBe(false);

    battle.round = STAGE_ROUND_LIMIT - STAGE_ROUND_LIMIT_WARNING_ROUNDS + 1;
    expect(battle.roundsRemaining).toBe(STAGE_ROUND_LIMIT_WARNING_ROUNDS);
    expect(battle.roundLimitWarningActive).toBe(true);

    // 越过上限后战斗已经结束，不再报「还剩几回合」。
    battle.round = STAGE_ROUND_LIMIT + 1;
    expect(battle.roundLimitWarningActive).toBe(false);
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
    expect(result.counterExperienceGained).toBe(0);
    expect(battle.unit("2:45")).toBeUndefined();
    expect(battle.unit("1:0")!.life).toBe(niaLife);
  });
});
