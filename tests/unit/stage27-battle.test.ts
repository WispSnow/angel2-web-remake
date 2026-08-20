import { describe, expect, it } from "vitest";
import { techniqueActionIdsFor } from "../../src/game/content/actions";
import { movementRulesFor, usesClassIdentity } from "../../src/game/content/classes";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  STAGE27_DEFINITION,
  STAGE27_IRON_PLATE_TERRAIN_SLOT,
  STAGE27_OBSTACLE_TERRAIN_SLOT,
  stage27TerrainSlotAt,
} from "../../src/game/content/stage27";
import {
  createStage27DeploymentRoster,
  Stage27Battle,
} from "../../src/game/simulation/stage27-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-27",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 800, life: 250 },
    { slot: 7, classId: "magic-priest", experience: 700, life: 190 },
    { slot: 45, classId: "crossbow", experience: 460, life: 150 },
  ]),
  rngState: 0x27_27_27_27,
  rngCalls: 22,
};

const fullDeployment = {
  placements: [
    ...STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE27_DEFINITION.deployment.optionalSlots.slice(0, 20).map((slot, index) => ({
      slot, position: { ...STAGE27_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

const cityDefenderIds = ["1:22", "1:41", "1:44", "1:43", "1:45", "1:42", "1:40"];

describe("stage 27 battle simulation", () => {
  it("builds 31 allies, five static rebels, and inherited campaign units", () => {
    const roster = createStage27DeploymentRoster(campaign);
    expect(roster).toHaveLength(29);
    expect(roster.map(({ slot }) => slot)).not.toEqual(
      expect.arrayContaining([22, 40, 41, 42, 43, 44, 45, 56, 57, 58]),
    );
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 700,
    });
    expect(roster.find(({ slot }) => slot === 45)).toBeUndefined();
    const battle = new Stage27Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(31);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 39, y: 37, life: 380,
    });
    // REMAKE-120 保留描述符姓名；原版不存在专属肖像，所以仍使用当前职业的通用肖像 57。
    const eliola = battle.unit("1:22");
    expect(eliola).toMatchObject({
      classId: "great-axe-warrior", className: "巨斧戰士", name: "愛莉歐拉", portrait: 57,
      displayIdentity: "named-class-portrait",
      x: 20, y: 11,
    });
    if (!eliola) throw new Error("stage 27 test is missing Eliola");
    expect(usesClassIdentity(eliola)).toBe(false);
    expect(battle.unit("1:45")).toMatchObject({ classId: "crossbow", x: 21, y: 14 });
    expect(battle.units.filter(({ side, classId }) => side === 1 && classId === "engineer"))
      .toHaveLength(3);
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native eleven-fixed minimum", () => {
    const battle = new Stage27Battle(campaign, {
      placements: STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual([
      "1:22", "1:41", "1:44", "1:43", "1:45", "1:42", "1:40",
      "1:57", "1:56", "1:58", "1:0",
    ]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);
  });

  it("assigns seven defenders to allied AI and keeps Nia, engineers, and candidates player-controlled", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    expect(battle.forceForUnit("1:22")).toMatchObject({
      id: "valkyrie-city-defense", control: "independent-ai",
    });
    expect(battle.forceForUnit("1:22")?.commanderId).toBeUndefined();
    expect(battle.forceForUnit("1:41")?.unitIds).toHaveLength(7);
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-valkyrie-return-team", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("1:57")?.control).toBe("player");
    expect(battle.forceForUnit("1:1")?.control).toBe("player");
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "valkyrie-rebels", control: "independent-ai",
    });
  });

  it("holds every city defender in sentry posture on round 1 and pursues from round 2", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);

    expect(cityDefenderIds.map((id) => battle.alliedBehaviorFor(id)))
      .toEqual([1, 1, 1, 1, 1, 1, 1]);
    for (const id of cityDefenderIds) {
      const unit = battle.unit(id);
      if (!unit) throw new Error(`stage 27 test is missing city defender ${id}`);
      expect(battle.planAlliedAiAction(id)?.path).toEqual([{ x: unit.x, y: unit.y }]);
    }

    battle.round = 2;
    expect(cityDefenderIds.map((id) => battle.alliedBehaviorFor(id)))
      .toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(cityDefenderIds.map((id) => battle.planAlliedAiAction(id))
      .some((action) => (action?.path.length ?? 0) > 1)).toBe(true);
  });

  it("keeps the battle ongoing when the named defender or all seven defenders are removed", () => {
    const namedDefenderBattle = new Stage27Battle(campaign, fullDeployment);
    namedDefenderBattle.units = namedDefenderBattle.units.filter(({ id }) => id !== "1:22");
    expect(namedDefenderBattle.outcome()).toBe("ongoing");

    const allDefendersBattle = new Stage27Battle(campaign, fullDeployment);
    const defenderSet = new Set(cityDefenderIds);
    allDefendersBattle.units = allDefendersBattle.units.filter(({ id }) => !defenderSet.has(id));
    expect(allDefendersBattle.outcome()).toBe("ongoing");
  });

  it("uses all four exact destination ranges without requiring rebel elimination", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 27 test is missing Nia");
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(5);

    nia.x = 25;
    nia.y = 14;
    expect(battle.outcome()).toBe("victory");
    nia.x = 26;
    nia.y = 14;
    expect(battle.outcome()).toBe("ongoing");
    nia.x = 16;
    nia.y = 12;
    expect(battle.outcome()).toBe("victory");
    nia.x = 15;
    nia.y = 12;
    expect(battle.outcome()).toBe("ongoing");
    nia.x = 25;
    nia.y = 11;
    expect(battle.outcome()).toBe("victory");
    nia.x = 26;
    nia.y = 11;
    expect(battle.outcome()).toBe("ongoing");
  });

  it("binds the two stage 27 construction source tokens to their evidenced logical slots", () => {
    // B/0055 cell (16,25) holds raw token 3 and (16,26) holds raw token 57, so
    // 鐵板 paves a universally cost-1 surface while 障礙 drops a cost-4 one.
    expect([STAGE27_IRON_PLATE_TERRAIN_SLOT, STAGE27_OBSTACLE_TERRAIN_SLOT]).toEqual([21, 9]);
    expect(stage27TerrainSlotAt({ x: 16, y: 25 })).toBe(21);
    expect(stage27TerrainSlotAt({ x: 16, y: 26 })).toBe(9);
  });

  it("lets all three engineers build on the native seed-5 route without cost", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    for (const id of ["1:56", "1:57", "1:58"]) {
      const engineer = battle.unit(id);
      if (!engineer) throw new Error(`stage 27 test is missing engineer ${id}`);
      expect(engineer.classId).toBe("engineer");
      expect(techniqueActionIdsFor(engineer)).toEqual(["iron-plate", "obstacle"]);
    }

    const engineer = battle.unit("1:57");
    if (!engineer) throw new Error("stage 27 test is missing engineer 1:57");
    const experienceBefore = engineer.experience;
    const rngBefore = { state: battle.rng.state, calls: battle.rng.calls };
    expect(battle.actionRange(engineer.id, "iron-plate").cells())
      .toEqual(battle.actionRange(engineer.id, "obstacle").cells());

    const prepared = battle.prepareConstruction(engineer.id, { x: 35, y: 33 }, "iron-plate");
    expect(prepared.path).toEqual([{ x: 35, y: 35 }, { x: 35, y: 34 }, { x: 35, y: 33 }]);
    // Native order is down, up, right, left around the destination; the centre
    // cell keeps its own terrain.
    expect(prepared.terrainMutations.map(({ x, y, slotBefore }) => ({ x, y, slotBefore })))
      .toEqual([
        { x: 35, y: 34, slotBefore: 1 },
        { x: 35, y: 32, slotBefore: 7 },
        { x: 36, y: 33, slotBefore: 1 },
        { x: 34, y: 33, slotBefore: 7 },
      ]);
    expect(engineer).toMatchObject({ x: 35, y: 35, acted: false });
    expect(battle.terrainOverrides).toEqual([]);

    battle.commitConstruction(prepared);
    expect(engineer).toMatchObject({ x: 35, y: 33, acted: true });
    // The destination itself is never rewritten, so it stays on logical slot 7
    // — the band only the engineer's own movement table can enter.
    expect(battle.terrainSlotAt({ x: 35, y: 33 })).toBe(7);
    for (const mutation of prepared.terrainMutations) {
      expect(battle.terrainSlotAt(mutation)).toBe(STAGE27_IRON_PLATE_TERRAIN_SLOT);
    }
    expect(battle.terrainOverrides).toEqual([
      { x: 35, y: 32, kind: "iron-plate" },
      { x: 34, y: 33, kind: "iron-plate" },
      { x: 36, y: 33, kind: "iron-plate" },
      { x: 35, y: 34, kind: "iron-plate" },
    ]);
    expect(engineer.experience).toBe(experienceBefore);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(rngBefore);
  });

  it("turns the paved cells into a crossing the rest of the army can use", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    const engineer = battle.unit("1:57");
    if (!engineer) throw new Error("stage 27 test is missing engineer 1:57");
    const nia = movementRulesFor("land-knight");
    expect(nia[7]).toBe(99);
    expect(nia[STAGE27_IRON_PLATE_TERRAIN_SLOT]).toBe(1);
    expect(nia[STAGE27_OBSTACLE_TERRAIN_SLOT]).toBe(4);

    expect(nia[battle.terrainSlotAt({ x: 35, y: 32 })]).toBe(99);
    battle.commitConstruction(
      battle.prepareConstruction(engineer.id, { x: 35, y: 33 }, "iron-plate"),
    );
    expect(nia[battle.terrainSlotAt({ x: 35, y: 32 })]).toBe(1);
  });

  it("gives Nia defeat priority and sends all five rebels into pursuit", () => {
    const battle = new Stage27Battle(campaign, fullDeployment);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 27 test is missing Nia");
    nia.x = 25;
    nia.y = 14;
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
    for (const enemy of battle.units.filter(({ side }) => side === 2)) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
    }
  });
});
