import { describe, expect, it } from "vitest";
import {
  ALL_TERRAIN_ARENA_ENVIRONMENT,
  ArenaBattle,
  type ArenaBattleEnvironment,
} from "../../src/game/simulation/arena-battle";
import { shootingLineVisitProbabilities } from "../../src/game/simulation/actions/range-map";
import { classCombatRole, classDefinition } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE19_DEFINITION } from "../../src/game/content/stage19";
import { STAGE34_DEFINITION } from "../../src/game/content/stage34";
import { manhattan } from "../../src/game/simulation/grid";
import { expertSpecialUtility } from "../../src/game/simulation/expert-ai";
import { DeterministicRng } from "../../src/game/simulation/rng";
import { Stage19Battle } from "../../src/game/simulation/stage19-battle";
import { Stage34Battle } from "../../src/game/simulation/stage34-battle";
import { Stage3Battle } from "../../src/game/simulation/stage3-battle";
import type { CampaignState } from "../../src/game/types";

/** Stage 19 names side-2 slot 13 as the victory target; every other enemy is rank and file. */
const stage19Campaign: CampaignState = {
  stageId: "stage-19",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x1234_5678,
  rngCalls: 0,
};

const stage19Deployment = {
  placements: [
    ...STAGE19_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE19_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
      slot, position: { ...STAGE19_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

/** Stage 3 names side-2 slot 17, a monk, as the victory target. */
const stage3Campaign: CampaignState = {
  stageId: "stage-03",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x1234_5678,
  rngCalls: 0,
};

/**
 * Stage 34 wins by wiping side 2 out, so its victory condition names nobody.
 * Its two named generals — 芙瑪羅妮 `2:6` and 蕾娜吉芙 `2:7` — are therefore the
 * REMAKE-090 case that the victory-slot commander test never covered.
 */
const stage34Campaign: CampaignState = {
  stageId: "stage-34",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x3434_3434,
  rngCalls: 0,
};

const stage34Deployment = {
  placements: [
    ...STAGE34_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE34_DEFINITION.deployment.optionalSlots.slice(0, 10).map((slot, index) => ({
      slot, position: { ...STAGE34_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

const placements = () => [
  { id: "ally-a", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
  { id: "ally-b", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 23, y: 30 },
  { id: "enemy-caster", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
  { id: "enemy-front", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 30 },
];

describe("REMAKE-033/037 stable-remake shared automatic expert AI", () => {
  it("uses the same expert technique planner for free-action allies without planning RNG", () => {
    const rng = new DeterministicRng(0x3701);
    const battle = new ArenaBattle([
      { id: "ally-magician", side: 1 as const, slot: 0, classId: "magician" as const, level: 1 as const, x: 24, y: 30 },
      { id: "ally-warrior", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-a", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-b", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 31 },
    ], 0, rng);
    const before = { state: rng.state, calls: rng.calls };

    expect(battle.planAlliedAiAction("ally-magician")).toMatchObject({
      kind: "special",
      unitId: "ally-magician",
    });
    expect(battle.expertAiDecisionTrace("ally-magician")?.policy)
      .toBe("stable-remake-expert");
    expect({ state: rng.state, calls: rng.calls }).toEqual(before);
  });

  it("re-evaluates free-action ally priority from the current squad state", () => {
    const battle = new ArenaBattle([
      { id: "ally-caster", side: 1 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
      { id: "ally-front", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-a", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-b", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, new DeterministicRng(0x3702));
    battle.unit("ally-front")!.life = 1;

    expect(battle.nextAlliedActionId(["ally-caster", "ally-front"]))
      .toBe("ally-caster");
  });

  it("uses one deterministic policy at every campaign difficulty without planning RNG", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const rng = new DeterministicRng(0x3300 + difficulty);
      const battle = new ArenaBattle(placements(), difficulty, rng);
      battle.unit("enemy-front")!.life = 1;
      const before = { state: rng.state, calls: rng.calls };

      const action = battle.planEnemyAiAction("enemy-caster");
      expect(action).toMatchObject({
        kind: "special",
        actionId: "heal-1",
        targetId: "enemy-front",
      });
      expect(battle.expertAiDecisionTrace("enemy-caster")?.policy)
        .toBe("stable-remake-expert");
      expect({ state: rng.state, calls: rng.calls }).toEqual(before);
    }
  });

  it("focuses the lowest-life hostile target when ordinary attack scores tie for either side", () => {
    const alliedBattle = new ArenaBattle([
      { id: "ally-soldier", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-earlier", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-wounded", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 25, y: 31 },
    ], 0, new DeterministicRng(0x3370));
    alliedBattle.unit("enemy-earlier")!.life = 109;
    alliedBattle.unit("enemy-wounded")!.life = 100;

    expect(alliedBattle.planAlliedAiAction("ally-soldier")).toMatchObject({
      kind: "attack",
      targetId: "enemy-wounded",
    });

    const enemyBattle = new ArenaBattle([
      { id: "ally-earlier", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "ally-wounded", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 25, y: 31 },
      { id: "enemy-soldier", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x3371));
    enemyBattle.unit("ally-earlier")!.life = 109;
    enemyBattle.unit("ally-wounded")!.life = 100;

    expect(enemyBattle.planEnemyAiAction("enemy-soldier", 1)).toMatchObject({
      kind: "attack",
      targetId: "ally-wounded",
    });
  });

  it("focuses the lowest-life hostile target when shooting or technique scores tie", () => {
    const battle = new ArenaBattle([
      { id: "ally-earlier", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 29 },
      { id: "ally-wounded", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3372));
    battle.unit("ally-earlier")!.life = 109;
    battle.unit("ally-wounded")!.life = 100;

    expect(battle.planEnemyAiAction("enemy-archer", 1)).toMatchObject({
      kind: "special",
      actionId: "archer-shot",
      targetId: "ally-wounded",
    });

    const techniqueBattle = new ArenaBattle([
      { id: "ally-earlier", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 29 },
      { id: "ally-wounded", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x3375));
    techniqueBattle.unit("ally-earlier")!.life = 109;
    techniqueBattle.unit("ally-wounded")!.life = 100;

    expect(techniqueBattle.planEnemyAiAction("enemy-sister", 1)).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: "ally-wounded",
    });
  });

  it("does not let current-life threat scoring pull a free-action crossbow away from the weakest wizard", () => {
    const rng = new DeterministicRng(0x3376);
    const battle = new ArenaBattle([
      { id: "ally-crossbow", side: 1 as const, slot: 0, classId: "crossbow" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-wizard-earlier", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 22, y: 29 },
      { id: "enemy-wizard-wounded", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, rng, {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });
    battle.unit("enemy-wizard-earlier")!.life = 200;
    battle.unit("enemy-wizard-wounded")!.life = 100;
    const before = { state: rng.state, calls: rng.calls };

    expect(battle.planAlliedAiAction("ally-crossbow")).toMatchObject({
      kind: "special",
      actionId: "crossbow-shot",
      targetId: "enemy-wizard-wounded",
    });
    expect({ state: rng.state, calls: rng.calls }).toEqual(before);
  });

  it("focuses the wizard with the lowest expected life after a crossbow shot", () => {
    const rng = new DeterministicRng(0x3377);
    const battle = new ArenaBattle([
      { id: "ally-crossbow", side: 1 as const, slot: 0, classId: "crossbow" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-wizard-healthy", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 22, y: 29 },
      { id: "enemy-wizard-focus", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, rng, {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });
    battle.unit("enemy-wizard-healthy")!.life = 200;
    // Crossbow minimum/expected damage is 70/79: this is not a guaranteed
    // kill, but it is still the target the shot is most likely to finish.
    battle.unit("enemy-wizard-focus")!.life = 75;
    const before = { state: rng.state, calls: rng.calls };

    expect(battle.planAlliedAiAction("ally-crossbow")).toMatchObject({
      kind: "special",
      actionId: "crossbow-shot",
      targetId: "enemy-wizard-focus",
    });
    expect({ state: rng.state, calls: rng.calls }).toEqual(before);
  });

  it("does not treat a larger maximum-life pool as extra target threat", () => {
    const battle = new ArenaBattle([
      { id: "ally-crossbow", side: 1 as const, slot: 0, classId: "crossbow" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-wizard-light", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 22, y: 29 },
      { id: "enemy-wizard-thick", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, new DeterministicRng(0x3378));
    const actor = battle.unit("ally-crossbow")!;
    const light = battle.unit("enemy-wizard-light")!;
    const thick = battle.unit("enemy-wizard-thick")!;
    const context = {
      width: 50,
      height: 60,
      units: [actor, light, thick],
      terrainSlotAt: () => 2,
      statsFor: () => ({ attack: 120, defense: 80, maxLife: 200, movement: 4, level: 2 }),
      effectiveStatsFor: (unit: typeof actor) => ({
        attack: 120,
        defense: 80,
        maxLife: unit.id === thick.id ? 2_000 : 200,
        movement: 4,
        level: 2,
      }),
    };

    const lightUtility = expertSpecialUtility(
      context,
      actor,
      "crossbow-shot",
      light,
      [actor],
    );
    const thickUtility = expertSpecialUtility(
      context,
      actor,
      "crossbow-shot",
      thick,
      [actor],
    );

    expect(thickUtility.targetThreat).toBe(lightUtility.targetThreat);
  });

  it("uses explicit caster and shooter target-priority bonuses", () => {
    const battle = new ArenaBattle([
      { id: "ally-crossbow", side: 1 as const, slot: 0, classId: "crossbow" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-caster", side: 2 as const, slot: 0, classId: "magic-priest" as const, level: 1 as const, x: 22, y: 28 },
      { id: "enemy-shooter", side: 2 as const, slot: 1, classId: "archer" as const, level: 1 as const, x: 22, y: 29 },
      { id: "enemy-half-dragon", side: 2 as const, slot: 2, classId: "half-dragon-warrior" as const, level: 1 as const, x: 23, y: 28 },
      { id: "enemy-great-dragon", side: 2 as const, slot: 3, classId: "great-dragon-knight" as const, level: 1 as const, x: 23, y: 29 },
      { id: "enemy-engineer", side: 2 as const, slot: 4, classId: "engineer" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, new DeterministicRng(0x3379));
    const actor = battle.unit("ally-crossbow")!;
    const targets = [
      battle.unit("enemy-caster")!,
      battle.unit("enemy-shooter")!,
      battle.unit("enemy-half-dragon")!,
      battle.unit("enemy-great-dragon")!,
      battle.unit("enemy-engineer")!,
    ];
    const context = {
      width: 50,
      height: 60,
      units: [actor, ...targets],
      terrainSlotAt: () => 2,
      statsFor: () => ({ attack: 120, defense: 80, maxLife: 200, movement: 4, level: 2 }),
      effectiveStatsFor: () => ({ attack: 120, defense: 80, maxLife: 200, movement: 4, level: 2 }),
    };
    const threatFor = (target: typeof actor): number => expertSpecialUtility(
      context,
      actor,
      "crossbow-shot",
      target,
      [actor],
    ).targetThreat;

    expect(threatFor(targets[0])).toBe(186);
    expect(threatFor(targets[1])).toBe(166);
    expect(targets.slice(2).map(threatFor)).toEqual([136, 136, 136]);
  });

  it("focuses the lowest-life target when automatic squad action scores tie", () => {
    const uniformTerrain = {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    } satisfies ArenaBattleEnvironment;
    const alliedBattle = new ArenaBattle([
      { id: "ally-earlier", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 10 },
      { id: "ally-focus", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-high", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 21, y: 10 },
      { id: "enemy-low", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 21, y: 30 },
    ], 0, new DeterministicRng(0x3373), uniformTerrain);
    alliedBattle.unit("enemy-high")!.life = 109;
    alliedBattle.unit("enemy-low")!.life = 100;

    expect(alliedBattle.selectNextAlliedAiAction(["ally-earlier", "ally-focus"]))
      .toMatchObject({
        unitId: "ally-focus",
        action: { kind: "attack", targetId: "enemy-low" },
      });

    const enemyBattle = new ArenaBattle([
      { id: "ally-high", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 21, y: 10 },
      { id: "ally-low", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 21, y: 30 },
      { id: "enemy-earlier", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 10 },
      { id: "enemy-focus", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3374), uniformTerrain);
    enemyBattle.unit("ally-high")!.life = 109;
    enemyBattle.unit("ally-low")!.life = 100;

    expect(enemyBattle.selectNextEnemyAiAction(["enemy-earlier", "enemy-focus"]))
      .toMatchObject({
        unitId: "enemy-focus",
        action: { kind: "attack", targetId: "ally-low" },
      });
  });

  it("takes a guaranteed kill before emergency healing", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3301));
    battle.unit("ally-a")!.life = 1;
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-caster")).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: "ally-a",
    });
    expect(battle.expertAiDecisionTrace("enemy-caster")?.chosen?.reasons)
      .toContain("確定擊殺×1");
  });

  /**
   * A stage whose victory condition names no slot has no commander, so every
   * enemy keeps trading: one of theirs for one of the player's is a bargain
   * the AI should always take, however badly hurt it is.
   */
  it("takes a guaranteed kill at any life when the stage names no victory slot", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3303));
    battle.unit("ally-b")!.life = 1;
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-front")).toMatchObject({
      kind: "attack",
      targetId: "ally-b",
    });
  });

  /**
   * The named victory target is the AI's own loss condition, so below 20% it
   * breaks contact even with a kill in reach — that trade ends the stage.
   * Its rank and file keep taking the same kill.
   */
  it("rests a named victory target below 20% life but not its rank and file", () => {
    const battle = new Stage19Battle(stage19Campaign, stage19Deployment);
    const commander = battle.unit("2:13");
    const trooper = battle.unit("2:30");
    const commanderBait = battle.unit("1:0");
    const trooperBait = battle.unit("1:1");
    if (!commander || !trooper || !commanderBait || !trooperBait) throw new Error("units missing");
    commanderBait.x = 25;
    commanderBait.y = 11;
    commanderBait.life = 1;
    trooperBait.x = 29;
    trooperBait.y = 11;
    trooperBait.life = 1;
    commander.life = 30; // 9% of 320
    trooper.life = 20; // 8% of 240

    expect(battle.planEnemyAiAction("2:13")).toMatchObject({ kind: "rest" });
    expect(battle.planEnemyAiAction("2:30")).toMatchObject({
      kind: "attack",
      targetId: "1:1",
    });
  });

  /**
   * Rest restores 15% of max life; a monk's own `1H` restores 24%. When the
   * policy spends the action on recovery it should spend it on the larger
   * restore, so stage 3's monk commander heals itself instead of resting.
   */
  it("heals itself instead of resting when its own technique restores more", () => {
    const battle = new Stage3Battle(stage3Campaign);
    const commander = battle.unit("2:17");
    if (!commander) throw new Error("commander missing");
    expect(commander.classId).toBe("monk");
    const maximumLife = battle.statsFor(commander).maxLife;
    commander.life = Math.floor(maximumLife * 0.15);

    expect(battle.planEnemyAiAction("2:17")).toMatchObject({
      kind: "special",
      actionId: "heal-1",
      targetId: "2:17",
    });
  });

  it("rests when no technique of its own beats the native 15% recovery", () => {
    const battle = new Stage3Battle(stage3Campaign);
    const trooper = battle.units.find(({ side, classId }) =>
      side === 2 && classId !== "monk");
    if (!trooper) throw new Error("trooper missing");
    trooper.life = Math.floor(battle.statsFor(trooper).maxLife * 0.15);
    for (const other of battle.units.filter(({ id }) => id !== trooper.id)) {
      if (other.side === 1) other.x = 49;
      if (other.side === 1) other.y = 49;
    }

    expect(battle.planEnemyAiAction(trooper.id)).toMatchObject({ kind: "rest" });
  });

  /**
   * REMAKE-090. Before this rule the leader spent its whole movement budget on
   * the deepest engagement cell and attacked from it, landing alone inside the
   * player formation with its escort left several cells behind.
   */
  it("advances a named leader without attacking and keeps it out of the deepest cell", () => {
    const battle = new Stage34Battle(stage34Campaign, stage34Deployment);
    const leader = battle.unit("2:6");
    if (!leader) throw new Error("leader missing");
    expect(leader.name).toBe("芙瑪羅妮");
    // The stage wipes side 2 out, so no victory slot marks her as a commander.
    const action = battle.planEnemyAiAction("2:6");
    expect(action).toMatchObject({ kind: "move" });
    expect(action).not.toHaveProperty("targetId");

    const destination = action!.path.at(-1)!;
    const players = battle.units.filter(({ side }) => side === 1);
    const nearestPlayerAfter = Math.min(...players.map((player) => manhattan(destination, player)));
    const squad = battle.units.filter((unit) => unit.side === 2 && unit.id !== leader.id);
    const nearestSquadmateAfter = Math.min(...squad.map((mate) => manhattan(destination, mate)));
    // She stops behind her own escort instead of outrunning it into contact.
    expect(nearestPlayerAfter).toBeGreaterThan(nearestSquadmateAfter);
    expect(battle.expertAiDecisionTrace("2:6")?.chosen?.reasons).toContain("暴露 1");
  });

  it("still lets a named leader strike from the cell it already holds", () => {
    const battle = new Stage34Battle(stage34Campaign, stage34Deployment);
    const leader = battle.unit("2:6");
    const bait = battle.unit("1:0");
    if (!leader || !bait) throw new Error("units missing");
    bait.x = leader.x;
    bait.y = leader.y + 1;

    expect(battle.planEnemyAiAction("2:6")).toMatchObject({
      kind: "attack",
      targetId: "1:0",
      path: [{ x: leader.x, y: leader.y }],
    });
  });

  it("keeps the rank and file of the same force on move-then-attack pursuit", () => {
    const battle = new Stage34Battle(stage34Campaign, stage34Deployment);
    const trooper = battle.units.find((unit) => unit.side === 2
      && unit.name === unit.className
      && classCombatRole(unit.classId) === "melee"
      && classDefinition(unit.classId).actionCategory === "ordinary");
    const bait = battle.unit("1:0");
    if (!trooper || !bait) throw new Error("units missing");
    bait.x = trooper.x;
    bait.y = trooper.y + 2;

    const action = battle.planEnemyAiAction(trooper.id);
    expect(action).toMatchObject({ kind: "attack", targetId: "1:0" });
    expect(action?.path.length).toBeGreaterThan(1);
  });

  it("keeps the named victory target fighting at or above 20% life", () => {
    const battle = new Stage19Battle(stage19Campaign, stage19Deployment);
    const commander = battle.unit("2:13");
    const bait = battle.unit("1:0");
    if (!commander || !bait) throw new Error("units missing");
    bait.x = 25;
    bait.y = 11;
    bait.life = 1;
    commander.life = 80; // 25% of 320

    expect(battle.planEnemyAiAction("2:13")).toMatchObject({
      kind: "attack",
      targetId: "1:0",
    });
  });

  it("uses emergency healing before nonlethal damage", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3302));
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-caster")).toMatchObject({
      kind: "special",
      actionId: "heal-1",
      targetId: "enemy-front",
    });
    expect(battle.expertAiDecisionTrace("enemy-caster")?.chosen?.reasons)
      .toContain("緊急救援×1");
  });

  it("hits a wizard before making an otherwise critical save", () => {
    const battle = new ArenaBattle([
      { id: "ally-wizard", side: 1 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-caster", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x335f));
    battle.unit("enemy-front")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-caster")).toMatchObject({
      kind: "special",
      actionId: "fire-1",
      targetId: "ally-wizard",
    });
    expect(battle.expertAiDecisionTrace("enemy-caster")?.chosen?.reasons)
      .toContain("巫師仇恨×1");
  });

  it("treats an effective hit on a wizard as the second-highest strategy", () => {
    const battle = new ArenaBattle([
      { id: "ally-wizard", side: 1 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 24, y: 30 },
      { id: "ally-elite", side: 1 as const, slot: 1, classId: "magic-master" as const, level: 3 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 0, classId: "warrior" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x3360));

    expect(battle.planEnemyAiAction("enemy-warrior", 1)).toMatchObject({
      kind: "attack",
      targetId: "ally-wizard",
    });
    expect(battle.expertAiDecisionTrace("enemy-warrior")?.chosen?.reasons)
      .toContain("巫師仇恨×1");
  });

  it("takes any guaranteed kill before a nonlethal wizard hit", () => {
    const battle = new ArenaBattle([
      { id: "ally-wizard", side: 1 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 24, y: 30 },
      { id: "ally-fatal", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 0, classId: "warrior" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x3361));
    battle.unit("ally-fatal")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-warrior", 1)).toMatchObject({
      kind: "attack",
      targetId: "ally-fatal",
    });
    expect(battle.expertAiDecisionTrace("enemy-warrior")?.chosen?.reasons)
      .toContain("確定擊殺×1");
  });

  it("values clustered area damage over weaker single-target fire", () => {
    const battle = new ArenaBattle([
      { id: "ally-a", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-b", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-priest", side: 2 as const, slot: 0, classId: "magic-priest" as const, level: 2 as const, x: 26, y: 30 },
    ], 0, new DeterministicRng(0x3303));

    expect(battle.planEnemyAiAction("enemy-priest")).toMatchObject({
      kind: "special",
      actionId: "lightning-1",
    });
  });

  it("does not reapply a control status when an untreated target is legal", () => {
    const battle = new ArenaBattle([
      { id: "ally-treated", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-open", side: 1 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-curse", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 1 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x3304));
    battle.unit("ally-treated")!.statuses.confusion = 3;

    expect(battle.planEnemyAiAction("enemy-curse")).toMatchObject({
      kind: "special",
      actionId: "confusion",
      targetId: "ally-open",
    });
  });

  it("ranks confusion above spell seal and rejects seal targets without a technique menu", () => {
    const battle = new ArenaBattle([
      { id: "ally-technique", side: 1 as const, slot: 0, classId: "magician" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-ordinary", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-curse", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 26, y: 30 },
    ], 0, new DeterministicRng(0x3380));
    const actor = battle.unit("enemy-curse")!;
    const techniqueTarget = battle.unit("ally-technique")!;
    const ordinaryTarget = battle.unit("ally-ordinary")!;
    const context = {
      width: 50,
      height: 60,
      units: battle.units,
      terrainSlotAt: () => 2,
      statsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
      effectiveStatsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
    };

    const confusion = expertSpecialUtility(
      context,
      actor,
      "confusion",
      techniqueTarget,
      [actor],
    );
    const spellSeal = expertSpecialUtility(
      context,
      actor,
      "spell-seal",
      techniqueTarget,
      [actor],
    );
    const invalidSpellSeal = expertSpecialUtility(
      context,
      actor,
      "spell-seal",
      ordinaryTarget,
      [actor],
    );

    expect(confusion.control).toBe(spellSeal.control + 20);
    expect(invalidSpellSeal).toMatchObject({ control: 0, targetThreat: 0, waste: 1 });
    expect(battle.planEnemyAiAction("enemy-curse")).toMatchObject({
      kind: "special",
      actionId: "confusion",
      targetId: "ally-technique",
    });
  });

  it("completely rejects reapplying the same control status", () => {
    const battle = new ArenaBattle([
      { id: "ally-confused", side: 1 as const, slot: 0, classId: "magician" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-curse", side: 2 as const, slot: 0, classId: "curse-master" as const, level: 3 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x3381));
    const actor = battle.unit("enemy-curse")!;
    const target = battle.unit("ally-confused")!;
    target.statuses.confusion = 3;

    const utility = expertSpecialUtility(
      {
        width: 50,
        height: 60,
        units: battle.units,
        terrainSlotAt: () => 2,
        statsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
        effectiveStatsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
      },
      actor,
      "confusion",
      target,
      [actor],
    );

    expect(utility).toMatchObject({ control: 0, targetThreat: 0, waste: 1 });
  });

  it("spends AA on the melee front instead of a higher-attack caster or the 魔導師 itself", () => {
    // REMAKE-102. At tier one the 魔導師 and the 巫師 both show 53 attack against
    // the 戰士's 50, so the plain `攻擊 + 40` support estimate used to hand AA to
    // a caster that never converts it into ordinary-attack damage.
    const battle = new ArenaBattle([
      { id: "ally-bait", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 18, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "warrior" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-guide", side: 2 as const, slot: 1, classId: "magic-guide" as const, level: 1 as const, x: 27, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 2, classId: "wizard" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3392));

    expect(battle.planEnemyAiAction("enemy-guide")).toMatchObject({
      kind: "special",
      actionId: "attack-up",
      targetId: "enemy-front",
    });
    expect(battle.expertAiDecisionTrace("enemy-guide")?.candidates
      .filter(({ action }) => action.actionId === "attack-up")
      .map(({ action }) => action.targetId))
      .toEqual(["enemy-front"]);
  });

  it("rejects every non-melee AA target while defense up and magic guard keep theirs", () => {
    const battle = new ArenaBattle([
      { id: "ally-bait", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 18, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "warrior" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-guide", side: 2 as const, slot: 1, classId: "magic-guide" as const, level: 3 as const, x: 27, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 2, classId: "archer" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3393));
    const actor = battle.unit("enemy-guide")!;
    const context = {
      width: 50,
      height: 60,
      units: battle.units,
      terrainSlotAt: () => 2,
      statsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
      effectiveStatsFor: () => ({ attack: 100, defense: 80, maxLife: 200, movement: 4, level: 1 }),
    };
    const utilityFor = (actionId: "attack-up" | "magic-guard", targetId: string) =>
      expertSpecialUtility(context, actor, actionId, battle.unit(targetId)!, [actor]);

    expect(utilityFor("attack-up", "enemy-front")).toMatchObject({ support: 140, waste: 0 });
    for (const targetId of ["enemy-guide", "enemy-archer"]) {
      expect(utilityFor("attack-up", targetId))
        .toMatchObject({ support: 0, targetThreat: 0, waste: 1 });
      // FM keeps the full ally set: it answers magic damage, not the attack chain.
      expect(utilityFor("magic-guard", targetId)).toMatchObject({ support: 120, waste: 0 });
    }
  });

  it("re-evaluates squad actor priority from the current state", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3305));
    battle.unit("enemy-front")!.life = 1;
    const pending = ["enemy-caster", "enemy-front"];

    expect(battle.nextEnemyActionId(pending)).toBe("enemy-caster");

    battle.unit("ally-b")!.life = 1;
    expect(battle.nextEnemyActionId(pending)).toBe("enemy-front");
  });

  it("returns the winning plan with its actor and invalidates that cache after state changes", () => {
    const rng = new DeterministicRng(0x3305);
    const battle = new ArenaBattle(placements(), 0, rng);
    battle.unit("enemy-front")!.life = 1;
    const pending = ["enemy-caster", "enemy-front"];
    const rngBefore = { state: rng.state, calls: rng.calls };

    const selection = battle.selectNextEnemyAiAction(pending);
    expect(selection).toMatchObject({
      unitId: "enemy-caster",
      action: {
        unitId: "enemy-caster",
        kind: "special",
        actionId: "heal-1",
        targetId: "enemy-front",
      },
    });
    if (!selection?.action) throw new Error("enemy selection is missing its planned action");
    const diagnosticsAfterSelection = battle.aiPlanningDiagnostics();
    expect(battle.planEnemyAiAction(selection.unitId)).toEqual(selection.action);
    expect(battle.aiPlanningDiagnostics()).toEqual(diagnosticsAfterSelection);
    expect({ state: rng.state, calls: rng.calls }).toEqual(rngBefore);

    battle.unit("ally-b")!.life = 1;
    expect(battle.selectNextEnemyAiAction(pending)).toMatchObject({
      unitId: "enemy-front",
      action: { kind: "attack", targetId: "ally-b" },
    });
    expect(battle.aiPlanningDiagnostics().movementMapBuilds).toBeGreaterThan(0);
  });

  it("moves a shooter toward the safest effective range edge instead of closing for no reason", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3306));

    const action = battle.planEnemyAiAction("enemy-archer");
    expect(action).toMatchObject({
      kind: "special",
      actionId: "archer-shot",
      targetId: "ally-target",
    });
    const destination = action!.path.at(-1)!;
    expect(Math.abs(destination.x - 22) + Math.abs(destination.y - 30)).toBe(4);
    expect(battle.expertAiDecisionTrace("enemy-archer")?.chosen?.reasons).toContain("射距 4");
  });

  it("pursues the nearest target by traversable movement cost instead of screen geometry", () => {
    const environment: ArenaBattleEnvironment = {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: ({ x, y }) => x === 25 && y < 40 ? 0 : 2,
    };
    const battle = new ArenaBattle([
      { id: "ally-behind-wall", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "ally-open-route", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 36 },
      { id: "enemy-pursuer", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3312), environment);

    expect(battle.planEnemyAiAction("enemy-pursuer")).toMatchObject({
      kind: "move",
      pursuitProgress: 3,
      path: [
        { x: 24, y: 30 },
        { x: 24, y: 31 },
        { x: 24, y: 32 },
        { x: 24, y: 33 },
      ],
    });
    expect(battle.expertAiDecisionTrace("enemy-pursuer")?.chosen?.reasons)
      .toContain("目標推進 3");

    const alliedBattle = new ArenaBattle([
      { id: "ally-pursuer", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-behind-wall", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-open-route", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 36 },
    ], 0, new DeterministicRng(0x3313), environment);

    expect(alliedBattle.planAlliedAiAction("ally-pursuer")).toMatchObject({
      kind: "move",
      pursuitProgress: 3,
      path: [
        { x: 24, y: 30 },
        { x: 24, y: 31 },
        { x: 24, y: 32 },
        { x: 24, y: 33 },
      ],
    });

    const weightedTerrainBattle = new ArenaBattle([
      { id: "ally-near-costly", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "ally-far-cheap", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 20, y: 36 },
      { id: "enemy-weighted-pursuer", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3314), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: ({ x, y }) => x >= 21 && x <= 24 && y >= 29 && y <= 31 ? 1 : 2,
    });

    expect(weightedTerrainBattle.planEnemyAiAction("enemy-weighted-pursuer")).toMatchObject({
      kind: "move",
      path: [
        { x: 20, y: 30 },
        { x: 20, y: 31 },
        { x: 20, y: 32 },
        { x: 20, y: 33 },
      ],
    });
  });

  it("falls back to geometric approach when an impassable sea splits every engagement route", () => {
    const splitBySea: ArenaBattleEnvironment = {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: ({ x }) => x === 25 ? 0 : 2,
    };
    const enemyBattle = new ArenaBattle([
      { id: "ally-across-sea", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 30, y: 30 },
      { id: "enemy-pursuer", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x331a), splitBySea);

    expect(enemyBattle.planEnemyAiAction("enemy-pursuer")).toMatchObject({
      kind: "move",
      path: [
        { x: 20, y: 30 },
        { x: 21, y: 30 },
        { x: 22, y: 30 },
        { x: 23, y: 30 },
      ],
    });
    expect(enemyBattle.expertAiDecisionTrace("enemy-pursuer")?.chosen?.reasons)
      .toContain("目標推進 3");

    const alliedBattle = new ArenaBattle([
      { id: "ally-pursuer", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 30 },
      { id: "enemy-across-sea", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 30, y: 30 },
    ], 0, new DeterministicRng(0x331b), splitBySea);

    expect(alliedBattle.planAlliedAiAction("ally-pursuer")).toMatchObject({
      kind: "move",
      path: [
        { x: 20, y: 30 },
        { x: 21, y: 30 },
        { x: 22, y: 30 },
        { x: 23, y: 30 },
      ],
    });
  });

  it("keeps next-turn caster safety ahead of a closer superior terrain cell", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x331c), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      // The closer casting cell has better class-adjusted defense, but lets
      // the target establish melee contact on its next phase.
      terrainSlotAt: ({ x, y }) => x === 25 && y === 30 ? 1 : 2,
    });

    expect(battle.planEnemyAiAction("enemy-sister")).toMatchObject({
      kind: "move",
      path: [
        { x: 27, y: 30 },
        { x: 26, y: 30 },
      ],
      setupActionId: "fire-1",
      setupTargetId: "ally-target",
    });
  });

  it("keeps a technique caster at maximum casting distance when terrain defense ties", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 27, y: 30 },
    ], 0, new DeterministicRng(0x331d), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });

    expect(battle.planEnemyAiAction("enemy-sister")).toMatchObject({
      kind: "move",
      path: [
        { x: 27, y: 30 },
        { x: 26, y: 30 },
      ],
      setupActionId: "fire-1",
      setupTargetId: "ally-target",
    });
  });

  it("keeps one forecast target fixed before maximizing that target's casting distance", () => {
    const battle = new ArenaBattle([
      { id: "ally-priority", side: 1 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 21, y: 30 },
      { id: "ally-alternate", side: 1 as const, slot: 1, classId: "archer" as const, level: 1 as const, x: 24, y: 28 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3328), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });
    battle.unit("ally-priority")!.life = 1;

    const action = battle.planEnemyAiAction("enemy-sister", 2);
    expect(action).toMatchObject({
      kind: "move",
      setupActionId: "fire-1",
      setupTargetId: "ally-priority",
    });
    expect(manhattan(action!.path.at(-1)!, battle.unit("ally-priority")!)).toBe(4);
  });

  it("chooses a safe next-turn casting position before a riskier superior terrain cell", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 21, y: 30 },
      { id: "ally-immobile-melee", side: 1 as const, slot: 1, classId: "head" as const, level: 1 as const, x: 24, y: 29 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3321), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: ({ x, y }) => x === 24 && y === 30 ? 1 : 2,
    });
    battle.unit("ally-target")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-sister", 2)).toMatchObject({
      kind: "move",
      path: [
        { x: 28, y: 30 },
        { x: 27, y: 30 },
        { x: 26, y: 30 },
        { x: 25, y: 30 },
      ],
      setupActionId: "fire-1",
      setupTargetId: "ally-target",
    });
  });

  it("keeps a pure support caster with its friendly front instead of pursuing an enemy", () => {
    const battle = new ArenaBattle([
      { id: "ally-front", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 30, y: 30 },
      { id: "enemy-flank", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 15, y: 30 },
      { id: "enemy-monk", side: 2 as const, slot: 0, classId: "monk" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3322), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });

    const action = battle.planEnemyAiAction("enemy-monk", 2);
    expect(action).toMatchObject({ kind: "move" });
    expect(action!.path.at(-1)!.x).toBeGreaterThan(20);
    expect(action).not.toHaveProperty("targetId", "enemy-flank");
  });

  it("keeps a prayer-capable support career anchored to its friendly front", () => {
    const battle = new ArenaBattle([
      { id: "ally-front", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 30, y: 30 },
      { id: "enemy-flank", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 15, y: 30 },
      { id: "enemy-prayer-guide", side: 2 as const, slot: 0, classId: "prayer-guide" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3327), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });
    battle.unit("enemy-prayer-guide")!.experience = 10_000;
    battle.unit("enemy-prayer-guide")!.statuses.techniqueSeal = 3;

    const action = battle.planEnemyAiAction("enemy-prayer-guide", 2);
    expect(action).toMatchObject({ kind: "move" });
    expect(action!.path.at(-1)!.x).toBeGreaterThan(20);
  });

  it("does not turn a ranged sentry into an adjacent ordinary attacker", () => {
    const battle = new ArenaBattle([
      { id: "ally-adjacent", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x3323));

    expect(battle.planEnemyAiAction("enemy-archer", 1)).toEqual({
      unitId: "enemy-archer",
      kind: "wait",
      path: [{ x: 25, y: 30 }],
    });
  });

  it("positions a free-action sister for next-turn healing instead of chasing melee", () => {
    const battle = new ArenaBattle([
      { id: "ally-sister", side: 1 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 27, y: 30 },
      { id: "ally-wounded", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "enemy-distant", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 40, y: 30 },
    ], 0, new DeterministicRng(0x331e), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });
    battle.unit("ally-wounded")!.life -= 20;

    expect(battle.planAlliedAiAction("ally-sister")).toMatchObject({
      kind: "move",
      path: [
        { x: 27, y: 30 },
        { x: 26, y: 30 },
      ],
      setupActionId: "heal-1",
      setupTargetId: "ally-wounded",
    });
  });

  it("returns a caster to its expert pursuit when no reachable cell enables a next-turn action", () => {
    const battle = new ArenaBattle([
      { id: "ally-distant", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 40, y: 30 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3320), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: () => 2,
    });

    const action = battle.planEnemyAiAction("enemy-sister", 2);
    expect(action).toMatchObject({
      kind: "move",
      pursuitProgress: 4,
      path: [
        { x: 20, y: 30 },
        { x: 21, y: 30 },
        { x: 22, y: 30 },
        { x: 23, y: 30 },
        { x: 24, y: 30 },
      ],
    });
    expect(action).not.toHaveProperty("setupActionId");
    expect(action).not.toHaveProperty("setupTargetId");
  });

  it("never falls back to melee when a fixed technique guard cannot cast", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-sister", side: 2 as const, slot: 0, classId: "sister" as const, level: 1 as const, x: 25, y: 30 },
    ], 0, new DeterministicRng(0x331f));
    battle.unit("enemy-sister")!.statuses.techniqueSeal = 3;

    expect(battle.planEnemyAiAction("enemy-sister", 1)).toMatchObject({
      kind: "wait",
      path: [{ x: 25, y: 30 }],
    });
  });

  it("queues behind an occupied melee frontage when no vacant engagement route exists", () => {
    const corridorEnvironment: ArenaBattleEnvironment = {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: ({ x, y }) => y === 30 && x >= 21 && x <= 25 ? 2 : 0,
    };
    const queueRng = new DeterministicRng(0x3315);
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-rear", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
    ], 0, queueRng, corridorEnvironment);
    const queueRngBefore = { state: queueRng.state, calls: queueRng.calls };

    expect(battle.planEnemyAiAction("enemy-rear")).toMatchObject({
      kind: "move",
      pursuitProgress: 1,
      queueAdvance: true,
      path: [
        { x: 22, y: 30 },
        { x: 23, y: 30 },
      ],
    });
    expect(battle.expertAiDecisionTrace("enemy-rear")?.chosen?.reasons)
      .toContain("目標推進 1");
    expect(battle.expertAiDecisionTrace("enemy-rear")?.chosen?.reasons)
      .toContain("隊列推進");
    expect({ state: queueRng.state, calls: queueRng.calls }).toEqual(queueRngBefore);

    const bypassCells = new Set([
      "23,30", "24,30", "23,29", "24,29", "25,29", "25,30",
    ]);
    const bypassBattle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-rear", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, new DeterministicRng(0x3318), {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: (position) => bypassCells.has(`${position.x},${position.y}`) ? 2 : 0,
    });

    expect(bypassBattle.planEnemyAiAction("enemy-rear")).toMatchObject({
      kind: "attack",
      targetId: "ally-target",
      path: [
        { x: 23, y: 30 },
        { x: 23, y: 29 },
        { x: 24, y: 29 },
        { x: 25, y: 29 },
      ],
    });
  });

  it("vacates an equivalent melee choke attack position for an unacted squadmate", () => {
    const openCells = new Set(["23,30", "24,30", "24,29", "25,29", "25,30"]);
    const chokeEnvironment: ArenaBattleEnvironment = {
      ...ALL_TERRAIN_ARENA_ENVIRONMENT,
      terrainSlotAt: (position) => openCells.has(`${position.x},${position.y}`) ? 2 : 0,
    };
    const reliefRng = new DeterministicRng(0x3316);
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-rear", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, reliefRng, chokeEnvironment);
    const reliefRngBefore = { state: reliefRng.state, calls: reliefRng.calls };

    const frontAction = battle.planEnemyAiAction("enemy-front");
    expect(frontAction).toMatchObject({
      kind: "attack",
      targetId: "ally-target",
      trafficRelease: 1,
      path: [
        { x: 24, y: 30 },
        { x: 24, y: 29 },
        { x: 25, y: 29 },
      ],
    });
    expect(battle.expertAiDecisionTrace("enemy-front")?.chosen?.reasons)
      .toContain("讓路×1");
    expect(battle.nextEnemyActionId(["enemy-front", "enemy-rear"]))
      .toBe("enemy-front");
    expect({ state: reliefRng.state, calls: reliefRng.calls }).toEqual(reliefRngBefore);

    expect(battle.moveUnit("enemy-front", frontAction!.path.at(-1)!)).toBe(true);
    battle.attack("enemy-front", "ally-target");
    expect(battle.planEnemyAiAction("enemy-rear")).toMatchObject({
      kind: "attack",
      targetId: "ally-target",
      path: [
        { x: 23, y: 30 },
        { x: 24, y: 30 },
      ],
    });

    const noFollower = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3317), chokeEnvironment);

    expect(noFollower.planEnemyAiAction("enemy-front")).toMatchObject({
      kind: "attack",
      path: [{ x: 24, y: 30 }],
    });

    const unsafeSideStep = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "ally-distant-threat", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 25, y: 24 },
      { id: "enemy-front", side: 2 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-rear", side: 2 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
    ], 0, new DeterministicRng(0x3319), chokeEnvironment);

    expect(unsafeSideStep.planEnemyAiAction("enemy-front")).toMatchObject({
      kind: "attack",
      path: [{ x: 24, y: 30 }],
    });
  });

  it("values full ranged threat exposure before stretching to maximum range", () => {
    const battle = new ArenaBattle([
      { id: "ally-target", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-crossbow", side: 1 as const, slot: 1, classId: "crossbow" as const, level: 1 as const, x: 38, y: 30 },
      { id: "enemy-archer", side: 2 as const, slot: 0, classId: "archer" as const, level: 1 as const, x: 24, y: 30 },
    ], 0, new DeterministicRng(0x3311));

    const action = battle.planEnemyAiAction("enemy-archer");
    expect(action).toMatchObject({ kind: "special", actionId: "archer-shot" });
    const destination = action!.path.at(-1)!;
    expect(Math.abs(destination.x - 22) + Math.abs(destination.y - 30)).toBe(4);
    expect(Math.abs(destination.x - 38) + Math.abs(destination.y - 30)).toBeGreaterThan(13);
    expect(battle.expertAiDecisionTrace("enemy-archer")?.chosen?.reasons).toContain("射距 4");
  });

  it("chooses the highest-value exact magic-arrow line without reading the planning RNG", () => {
    const rng = new DeterministicRng(0x3307);
    const battle = new ArenaBattle([
      { id: "ally-main", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 23, y: 31 },
      { id: "ally-high-line", side: 1 as const, slot: 1, classId: "magic-master" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-low-line", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 21, y: 31 },
      { id: "enemy-magic-archer", side: 2 as const, slot: 0, classId: "magic-archer" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, rng);
    const before = { state: rng.state, calls: rng.calls };

    const action = battle.planEnemyAiAction("enemy-magic-archer", 1);
    expect(action).toMatchObject({
      kind: "special",
      actionId: "magic-archer-shot",
      targetId: "ally-main",
    });
    expect(action?.linePath).toContainEqual({ x: 22, y: 30 });
    expect(action?.linePath).not.toContainEqual({ x: 21, y: 31 });
    expect(battle.expertAiDecisionTrace("enemy-magic-archer")?.chosen?.reasons)
      .toContain("有效傷害 88");
    expect({ state: rng.state, calls: rng.calls }).toEqual(before);
  });

  it("maximizes magic-arrow total damage before the default ranged tie-breaks", () => {
    const battle = new ArenaBattle([
      { id: "ally-line", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 22, y: 30 },
      { id: "ally-high-damage", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "ally-one-life", side: 1 as const, slot: 2, classId: "soldier" as const, level: 1 as const, x: 20, y: 34 },
      { id: "enemy-magic-archer", side: 2 as const, slot: 0, classId: "magic-archer" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3324));
    battle.unit("ally-one-life")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-magic-archer", 1)).toMatchObject({
      kind: "special",
      actionId: "magic-archer-shot",
      targetId: "ally-high-damage",
    });
  });

  it("does not let a magic archer act adjacent to any enemy, even one currently disabled", () => {
    const battle = new ArenaBattle([
      { id: "ally-adjacent", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
      { id: "ally-ranged-target", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 23, y: 30 },
      { id: "enemy-magic-archer", side: 2 as const, slot: 0, classId: "magic-archer" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3325));
    battle.unit("ally-adjacent")!.actionDisabled = true;

    expect(battle.planEnemyAiAction("enemy-magic-archer", 1)).toEqual({
      unitId: "enemy-magic-archer",
      kind: "wait",
      path: [{ x: 20, y: 30 }],
    });
  });

  it("moves a pursuing magic archer out of contact before selecting a damage line", () => {
    const battle = new ArenaBattle([
      { id: "ally-adjacent", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 20, y: 31 },
      { id: "ally-ranged-target", side: 1 as const, slot: 1, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-magic-archer", side: 2 as const, slot: 0, classId: "magic-archer" as const, level: 1 as const, x: 20, y: 30 },
    ], 0, new DeterministicRng(0x3326));

    const action = battle.planEnemyAiAction("enemy-magic-archer", 2);
    expect(action).toMatchObject({
      kind: "special",
      actionId: "magic-archer-shot",
    });
    const destination = action!.path.at(-1)!;
    expect(manhattan(destination, battle.unit("ally-adjacent")!)).toBeGreaterThan(1);
    expect(manhattan(destination, battle.unit("ally-ranged-target")!)).toBeGreaterThan(1);
  });

  it("retains the original random-route branch probabilities as reverse evidence", () => {
    const probabilities = shootingLineVisitProbabilities(
      { x: 0, y: 0, classId: "magic-archer" },
      { x: 2, y: 2 },
      { width: 5, height: 5, terrainSlotAt: () => 1 },
      6,
    );

    expect(probabilities.get("2,2")).toBe(1);
    expect(probabilities.get("2,1")).toBeCloseTo(.5);
    expect(probabilities.get("1,1")).toBeCloseTo(.5);
    expect(probabilities.get("0,1")).toBeCloseTo(.5);
    expect(probabilities.has("0,0")).toBe(false);
  });

  it("defers an actual ice choice until every non-ice actor has gone", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 24, y: 29 },
    ], 0, new DeterministicRng(0x3308));

    expect(battle.planEnemyAiAction("enemy-wizard")?.actionId).toBe("ice-2");
    expect(battle.nextEnemyActionId(["enemy-wizard", "enemy-warrior"]))
      .toBe("enemy-warrior");
  });

  it("scores ice from the landing cells the resolver will commit", () => {
    // REMAKE-094: a target on the value-1 outer ring is shoved clear of the
    // effect and never freezes, so the scorer must not book it as control — nor
    // as an effective wizard hit for the REMAKE-036 priority band.
    const battle = new ArenaBattle([
      { id: "ally-outer", side: 1 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 23, y: 30 },
      { id: "ally-inner", side: 1 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
    ], 0, new DeterministicRng(0x3311));
    const actor = battle.unit("enemy-wizard")!;
    const outer = battle.unit("ally-outer")!;
    const inner = battle.unit("ally-inner")!;
    const stats = { attack: 60, defense: 40, maxLife: 200, movement: 4, level: 2 };
    const contextFor = (units: readonly (typeof actor)[]) => ({
      width: 50,
      height: 60,
      units,
      terrainSlotAt: () => 2,
      statsFor: () => stats,
      effectiveStatsFor: () => stats,
    });

    const shovedOut = expertSpecialUtility(contextFor([actor, outer]), actor, "ice-2", actor, [actor]);
    expect(shovedOut.control).toBe(0);
    expect(shovedOut.wizardHits).toBe(0);
    expect(shovedOut.waste).toBe(1);

    const held = expertSpecialUtility(contextFor([actor, inner]), actor, "ice-2", actor, [actor]);
    expect(held.control).toBeGreaterThan(0);
    expect(held.wizardHits).toBe(1);
    expect(held.waste).toBe(0);
  });

  it("keeps a wizard out of melee and defers its ice action behind ordinary attackers", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 25, y: 30 },
      { id: "enemy-wizard", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-warrior", side: 2 as const, slot: 1, classId: "warrior" as const, level: 1 as const, x: 30, y: 30 },
    ], 0, new DeterministicRng(0x3309));
    battle.unit("ally")!.life = 1;

    expect(battle.planEnemyAiAction("enemy-wizard")).toMatchObject({
      kind: "special",
      actionId: "ice-2",
    });
    expect(battle.nextEnemyActionId(["enemy-wizard", "enemy-warrior"]))
      .toBe("enemy-warrior");
  });

  it("forbids ice when every surviving enemy has an ice technique", () => {
    const battle = new ArenaBattle([
      { id: "ally", side: 1 as const, slot: 0, classId: "soldier" as const, level: 1 as const, x: 24, y: 30 },
      { id: "enemy-wizard-a", side: 2 as const, slot: 0, classId: "wizard" as const, level: 1 as const, x: 26, y: 30 },
      { id: "enemy-wizard-b", side: 2 as const, slot: 1, classId: "wizard" as const, level: 1 as const, x: 28, y: 30 },
    ], 0, new DeterministicRng(0x3310));

    expect(battle.planEnemyAiAction("enemy-wizard-a")?.actionId).not.toBe("ice-2");
    expect(battle.planEnemyAiAction("enemy-wizard-b")?.actionId).not.toBe("ice-2");
  });

  it("recognizes an entirely frozen manual player phase", () => {
    const battle = new ArenaBattle(placements(), 0, new DeterministicRng(0x3312));
    for (const ally of battle.units.filter(({ side }) => side === 1)) ally.actionDisabled = true;

    expect(battle.playerManualPhaseComplete()).toBe(true);
    expect(battle.allPlayerControllableAlliesFrozen()).toBe(true);
    battle.unit("ally-a")!.actionDisabled = false;
    expect(battle.allPlayerControllableAlliesFrozen()).toBe(false);
  });
});
