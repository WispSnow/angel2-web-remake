import { describe, expect, it } from "vitest";
import { completeCampaignRoster, initialEnemyExperience } from "../../src/game/content/stage0";
import {
  STAGE8_WOODEN_FLOOR_TERRAIN_SLOT,
  stage8TerrainSlotAt,
} from "../../src/game/content/stage8";
import { Stage8Battle, createStage8Units } from "../../src/game/simulation/stage8-battle";
import type { CampaignState, Position } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-08",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 8, classId: "magician", experience: 500, life: 180 },
    { slot: 17, classId: "land-knight", experience: 620, life: 220 },
    { slot: 18, classId: "priest", experience: 580, life: 180 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 11,
};

describe("stage 8 battle simulation", () => {
  it("builds the fixed eight-versus-eleven battle with all allies player-controlled", () => {
    expect(createStage8Units(campaign.difficulty, campaign.roster)).toHaveLength(19);
    const battle = new Stage8Battle(campaign);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(11);
    expect(battle.unit("1:8")).toMatchObject({
      classId: "cavalry", name: "蘇蘭達", portrait: 10, x: 23, y: 30,
    });
    expect(battle.unit("1:17")).toMatchObject({
      classId: "land-knight", name: "阿曼妮", life: 340,
    });
    expect(battle.unit("1:18")).toMatchObject({
      classId: "priest", name: "雷伊拉", life: 265,
    });
    for (const id of ["1:8", "1:40", "1:41", "1:42", "1:43", "1:44"]) {
      const unit = battle.unit(id)!;
      expect(unit.life, id).toBe(battle.statsFor(unit).maxLife);
    }
    expect(battle.unit("1:40")).toMatchObject({
      classId: "cavalry", experience: 0, life: 200,
    });
    const alliedIds = battle.units.filter(({ side }) => side === 1).map(({ id }) => id);
    expect(alliedIds.every((id) => battle.isPlayerControllableAlly(id))).toBe(true);
    expect(battle.alliedActionOrder(false)).toEqual([]);
    expect(battle.forceForUnit("1:8")).toMatchObject({
      id: "sulanda-ranger-command", control: "player",
    });
    expect(battle.forceForUnit("1:40")).toMatchObject({
      id: "sulanda-ranger-command", control: "player",
    });
    expect(battle.forceForUnit("2:30")).toMatchObject({
      id: "dragon-tower-camp-raiders", control: "independent-ai",
    });
  });

  it("retains Web difficulty levels for stage 8's native no-seed exception", () => {
    const levels = [2, 4, 6, 5] as const;
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage8Battle({ ...campaign, difficulty });
      for (const enemy of battle.units.filter(({ side }) => side === 2)) {
        expect(enemy.experience, `${difficulty}:${enemy.id}`)
          .toBe(initialEnemyExperience(enemy.classId, difficulty));
        expect(battle.statsFor(enemy).level, `${difficulty}:${enemy.id}`).toBe(levels[difficulty]);
      }
    }
  });

  it("keeps campaign experience when the template overrides the class", () => {
    // 原版模块 27 只写非零 side-1 职业覆写，不碰 `ME_EXP`；模块 29 `0000:536B` 随后用
    // 同一份累计经验重走新职业的成长行。所以覆写是等价经验换算，不是重置——与转职
    // （`PROMO-006` 提交时经验清零）是两套语义。
    const promoted: CampaignState = {
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 40, classId: "warrior", experience: 400, life: 260 },
      ]),
    };
    const battle = new Stage8Battle(promoted);
    const overridden = battle.unit("1:40")!;
    expect(overridden).toMatchObject({ classId: "cavalry", experience: 400 });
    expect(battle.statsFor(overridden))
      .toMatchObject({ attack: 65, defense: 36, maxLife: 260, movement: 8, level: 3 });
    // 覆写后的职业与保留的经验一起写回战役档，玩家在第 2 关选的戰士不会回来。
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 40))
      .toMatchObject({ classId: "cavalry", experience: 400 });
  });

  it("wins only after all enemies leave and loses when Sulanda leaves", () => {
    const ongoing = new Stage8Battle(campaign);
    ongoing.units = ongoing.units.filter(({ side, id }) => side === 1 || id === "2:39");
    expect(ongoing.outcome()).toBe("ongoing");

    const victorious = new Stage8Battle(campaign);
    victorious.units = victorious.units.filter(({ side }) => side === 1);
    expect(victorious.outcome()).toBe("victory");

    const defeated = new Stage8Battle(campaign);
    defeated.units = defeated.units.filter(({ id }) => id !== "1:8");
    expect(defeated.outcome()).toBe("defeat");
  });

  it("uses ordinary terrain and round transitions without inherited force-field damage", () => {
    const battle = new Stage8Battle(campaign);
    const lifeBefore = battle.units.map(({ id, life }) => [id, life] as const);
    expect(battle.routePulseSafeAreaForUnit("1:8")).toEqual([]);
    battle.startNextRound();
    expect(battle.round).toBe(2);
    expect(battle.units.map(({ id, life }) => [id, life] as const)).toEqual(lifeBefore);
  });

  it("lets a player magician handed to free action select an expert technique", () => {
    const battle = new Stage8Battle({
      ...campaign,
      roster: completeCampaignRoster([
        { slot: 8, classId: "cavalry", experience: 500, life: 180 },
        { slot: 17, classId: "magician", experience: 620, life: 180 },
        { slot: 18, classId: "priest", experience: 580, life: 180 },
      ]),
    });
    const magician = battle.unit("1:17")!;
    const targets = [battle.unit("2:30")!, battle.unit("2:35")!];
    battle.units = battle.units.filter((unit) =>
      unit.side === 1 || targets.some(({ id }) => id === unit.id));
    Object.assign(magician, { x: 24, y: 30 });
    Object.assign(targets[0], { x: 26, y: 30 });
    Object.assign(targets[1], { x: 26, y: 31 });

    expect(battle.planAlliedAiAction(magician.id)).toMatchObject({
      unitId: magician.id,
      kind: "special",
    });
  });

  it("lets a formerly automatic ranger use expert techniques after a free-action handoff", () => {
    const battle = new Stage8Battle(campaign);
    const magician = battle.unit("1:40")!;
    const targets = [battle.unit("2:30")!, battle.unit("2:35")!];
    Object.assign(magician, {
      classId: "magician",
      className: "魔術士",
      x: 24,
      y: 30,
    });
    battle.units = battle.units.filter((unit) =>
      unit.side === 1 || targets.some(({ id }) => id === unit.id));
    Object.assign(targets[0], { x: 26, y: 30 });
    Object.assign(targets[1], { x: 26, y: 31 });

    expect(battle.isPlayerControllableAlly(magician.id)).toBe(true);
    expect(battle.planAlliedAiAction(magician.id)).toMatchObject({
      unitId: magician.id,
      kind: "special",
    });
  });
});

describe("stage 8 raiding magician and the wooden houses (REMAKE-173)", () => {
  const MAGICIAN_ID = "2:30";
  const inHouse = (position: Position): boolean =>
    stage8TerrainSlotAt(position) === STAGE8_WOODEN_FLOOR_TERRAIN_SLOT;

  /** 玩家退守中央木屋：只留魔術士一名敌军，其余袭击者不干扰落点。 */
  const partyInHouse = (
    cells: readonly Position[],
    magicianAt: Position,
    difficulty: CampaignState["difficulty"] = 2,
    rngState = campaign.rngState,
  ): Stage8Battle => {
    const battle = new Stage8Battle({ ...campaign, difficulty, rngState });
    const allies = battle.units.filter(({ side }) => side === 1);
    expect(cells).toHaveLength(allies.length);
    allies.forEach((ally, index) => Object.assign(ally, cells[index]));
    for (const cell of cells) expect(inHouse(cell), `${cell.x},${cell.y}`).toBe(true);
    battle.units = battle.units.filter(({ side, id }) => side === 1 || id === MAGICIAN_ID);
    Object.assign(battle.unit(MAGICIAN_ID)!, magicianAt);
    return battle;
  };

  /** One enemy phase for the magician alone; the party is restored and never acts. */
  const magicianTurn = (battle: Stage8Battle): NonNullable<ReturnType<Stage8Battle["planEnemyAiAction"]>> => {
    const action = battle.planEnemyAiAction(MAGICIAN_ID);
    if (!action) throw new Error("the magician has no plan");
    const steps = action.path.slice(1);
    for (const [index, step] of steps.entries()) {
      expect(battle.moveUnitStep(MAGICIAN_ID, step, index < steps.length - 1)).toBe(true);
    }
    if (action.kind === "special" && action.actionId) {
      battle.commitPreparedAction(battle.prepareSpecialAction({
        actionId: action.actionId,
        actorId: MAGICIAN_ID,
        ...(action.targetId ? { targetId: action.targetId } : {}),
      }));
    } else if (action.kind === "rest") {
      battle.rest(MAGICIAN_ID);
    } else {
      battle.spendAction(MAGICIAN_ID);
    }
    for (const ally of battle.units.filter(({ side }) => side === 1)) {
      ally.life = battle.statsFor(ally).maxLife;
      ally.actionDisabled = false;
    }
    battle.startNextRound();
    return action;
  };

  it("keeps the magician, and only her, off the floor of all three wooden buildings", () => {
    const battle = new Stage8Battle(campaign);
    expect(battle.forceForUnit(MAGICIAN_ID)?.doctrine).toEqual({
      strategy: "expert",
      keepOutTerrainSlotsByClass: { magician: [STAGE8_WOODEN_FLOOR_TERRAIN_SLOT] },
    });
    // 木板地面恰好是三栋木屋（含门口缺口），地图别处没有这种地形。
    const floor = new Set<string>();
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) if (inHouse({ x, y })) floor.add(`${x},${y}`);
    }
    const buildings: string[][] = [];
    const seen = new Set<string>();
    for (const start of floor) {
      if (seen.has(start)) continue;
      const building = [start];
      seen.add(start);
      for (let index = 0; index < building.length; index += 1) {
        const [x, y] = building[index]!.split(",").map(Number);
        for (const next of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
          if (!floor.has(next) || seen.has(next)) continue;
          seen.add(next);
          building.push(next);
        }
      }
      buildings.push(building);
    }
    expect(buildings).toHaveLength(3);
    const safeHouse = buildings.find((building) => building.includes("24,29"));
    // 中央木屋的北门 (25,25) 与南门 (23,30) 都算屋内，门外一格不算。
    expect(safeHouse).toEqual(expect.arrayContaining(["25,25", "23,30"]));
    expect(inHouse({ x: 25, y: 24 })).toBe(false);
    expect(inHouse({ x: 23, y: 31 })).toBe(false);
  });

  it("no longer parks her outside the wall at four cells from the party inside", () => {
    // The reported spot: four cells from 1:42 in a straight line, but the house
    // wall makes her fire walk round through a doorway, far past its reach.
    const cells = [
      { x: 24, y: 29 }, { x: 23, y: 30 }, { x: 22, y: 29 }, { x: 25, y: 26 },
      { x: 24, y: 27 }, { x: 27, y: 29 }, { x: 21, y: 28 }, { x: 28, y: 30 },
    ];
    const battle = partyInHouse(cells, { x: 28, y: 26 });
    const magician = battle.unit(MAGICIAN_ID)!;
    expect(Math.abs(magician.x - 27) + Math.abs(magician.y - 29)).toBe(4);
    for (const actionId of ["fire-1", "lightning-1"] as const) {
      expect(battle.actionTargets(MAGICIAN_ID, actionId), actionId).toEqual([]);
    }

    const first = magicianTurn(battle);
    expect(first.kind).toBe("move");
    let cast: ReturnType<typeof magicianTurn> | undefined;
    for (let turn = 1; turn < 8 && !cast; turn += 1) {
      const action = magicianTurn(battle);
      if (action.kind === "special") cast = action;
      for (const step of action.path) expect(inHouse(step), `turn ${turn}`).toBe(false);
    }
    // She reaches a doorway from outside and casts through it.
    expect(cast).toMatchObject({ kind: "special" });
    expect(cells.some(({ x, y }) => battle.units.find((unit) => unit.id === cast?.targetId)?.x === x
      && battle.units.find((unit) => unit.id === cast?.targetId)?.y === y)).toBe(true);
    expect(inHouse(battle.unit(MAGICIAN_ID)!)).toBe(false);
  });

  it("holds at a doorway instead of walking in when nobody inside is within her reach", () => {
    // East wing and west end: every cell outside the house is at least five
    // steps of fire from all of them, so the only way to cast is to go in.
    const cells = [
      { x: 20, y: 28 }, { x: 21, y: 28 }, { x: 20, y: 29 }, { x: 27, y: 29 },
      { x: 28, y: 29 }, { x: 29, y: 29 }, { x: 28, y: 30 }, { x: 29, y: 30 },
    ];
    for (const difficulty of [0, 3] as const) {
      const battle = partyInHouse(cells, { x: 28, y: 26 }, difficulty);
      for (let turn = 0; turn < 12; turn += 1) {
        const action = magicianTurn(battle);
        expect(action.kind, `${difficulty}:${turn}`).not.toBe("special");
        for (const step of action.path) expect(inHouse(step), `${difficulty}:${turn}`).toBe(false);
      }
      // She closes on the party round the wall to the north doorway, the
      // nearest point it can be reached through, and holds there.
      expect(battle.unit(MAGICIAN_ID)).toMatchObject({ x: 25, y: 24 });
      expect(battle.planEnemyAiAction(MAGICIAN_ID)?.kind).toBe("wait");
    }
  });

  it("keeps the confused wander outside too", () => {
    // Outside the south doorway the native ascending scan meets the doorway
    // and the floor behind it before any cell outside, so an unfiltered
    // wander walks in about half the time.
    const cells = [
      { x: 20, y: 28 }, { x: 21, y: 28 }, { x: 20, y: 29 }, { x: 27, y: 29 },
      { x: 28, y: 29 }, { x: 29, y: 29 }, { x: 28, y: 30 }, { x: 29, y: 30 },
    ];
    let moves = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const battle = partyInHouse(cells, { x: 23, y: 31 }, 2, 0x0800_0000 + seed);
      battle.unit(MAGICIAN_ID)!.statuses.confusion = 2;
      const action = battle.planEnemyAiAction(MAGICIAN_ID)!;
      if (action.kind === "move") moves += 1;
      for (const step of action.path) expect(inHouse(step), `seed ${seed}`).toBe(false);
    }
    expect(moves).toBeGreaterThan(0);
  });

  it("walks her back out when a technique shoves her inside", () => {
    const cells = [
      { x: 20, y: 28 }, { x: 21, y: 28 }, { x: 20, y: 29 }, { x: 27, y: 29 },
      { x: 28, y: 29 }, { x: 29, y: 29 }, { x: 28, y: 30 }, { x: 29, y: 30 },
    ];
    const battle = partyInHouse(cells, { x: 25, y: 27 });
    expect(inHouse(battle.unit(MAGICIAN_ID)!)).toBe(true);
    // Two cells of floor to the doorway, then the step out.
    expect(magicianTurn(battle)).toMatchObject({ kind: "move" });
    expect(battle.unit(MAGICIAN_ID)).toMatchObject({ x: 25, y: 25 });
    expect(magicianTurn(battle)).toMatchObject({ kind: "move" });
    expect(inHouse(battle.unit(MAGICIAN_ID)!)).toBe(false);
  });
});
