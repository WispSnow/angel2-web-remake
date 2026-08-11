import { describe, expect, it } from "vitest";
import { BATTLE_ACTION_DEFINITIONS } from "../../src/game/content/actions";
import {
  STAGE20_DEFINITION,
  STAGE20_SEMANTIC_DRAGON,
  STAGE20_SEMANTIC_ENEMY_UNITS,
} from "../../src/game/content/stage20";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { createFixedStageEnemy } from "../../src/game/simulation/fixed-stage-battle";
import {
  createStage20DeploymentRoster,
  Stage20Battle,
} from "../../src/game/simulation/stage20-battle";
import type { CampaignState } from "../../src/game/types";

const campaign = (): CampaignState => ({
  stageId: "stage-20",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x20_20_20_20,
  rngCalls: 0,
});

const fullDeployment = () => ({
  placements: [
    ...STAGE20_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE20_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
      slot,
      position: { ...STAGE20_DEFINITION.deployment.openCells[index] },
      fixed: false,
    })),
  ],
});

function replaceTableauWithDragon(battle: Stage20Battle): void {
  battle.removeStoryUnits(STAGE20_SEMANTIC_ENEMY_UNITS.map(({ slot }) => ({ side: 2, slot })));
  const dragon = createFixedStageEnemy({
    slot: STAGE20_SEMANTIC_DRAGON.slot,
    position: STAGE20_SEMANTIC_DRAGON.position,
    classId: STAGE20_SEMANTIC_DRAGON.classId,
    name: STAGE20_SEMANTIC_DRAGON.name,
    portrait: STAGE20_SEMANTIC_DRAGON.portrait,
    aiBehavior: STAGE20_SEMANTIC_DRAGON.aiBehavior,
  }, battle.difficulty);
  battle.appendStoryUnits([dragon], [{ sourceUnitId: "2:55", derivedUnitId: dragon.id }]);
}

function keepAllies(battle: Stage20Battle, keptSlots: readonly number[]): void {
  battle.removeStoryUnits(battle.units
    .filter(({ side, slot }) => side === 1 && !keptSlots.includes(slot))
    .map(({ slot }) => ({ side: 1 as const, slot })));
}

describe("stage 20 battle", () => {
  it("builds three fixed allies, fourteen optional allies, and the 16-unit narrative tableau", () => {
    const state = campaign();
    const roster = createStage20DeploymentRoster(state);
    expect(roster).toHaveLength(23);
    expect(roster.find(({ slot }) => slot === 32)).toMatchObject({
      name: "守護者", portrait: 65, classId: "prayer-guide",
    });
    const battle = new Stage20Battle(state, fullDeployment());
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(17);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(16);
    expect(battle.unit("1:32")).toMatchObject({ x: 28, y: 14, classId: "prayer-guide" });
    expect(battle.isPlayerControllableAlly("1:32")).toBe(true);
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 32)).toMatchObject({
      classId: "soldier", experience: 0,
    });
  });

  it("inherits the tableau force for the dragon and lets expert AI choose WD", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    const guardian = battle.unit("1:32");
    if (!guardian) throw new Error("guardian missing");
    guardian.x = 28;
    guardian.y = 17;
    replaceTableauWithDragon(battle);

    const dragon = battle.unit("2:28");
    expect(dragon).toMatchObject({ classId: "dragon", name: "妖龍", life: 2_400 });
    expect(battle.outcome()).toBe("ongoing");
    expect(battle.planSpecialAiAction("2:28", "wd")).toMatchObject({
      unitId: "2:28",
      kind: "special",
      actionId: "wd",
    });
  });

  /**
   * The native `1000:1A68` dispatcher never reaches the ordinary attack
   * selector, so melee is a stableRemake improvement rather than an original
   * behavior. It stays available because a lone adjacent ally is a kill the
   * 90-per-cell WD path cannot reach; the expert kill band decides, and only
   * the commander rest below 20% may override it.
   */
  it("prefers a melee kill over a WD cast that cannot kill", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    replaceTableauWithDragon(battle);
    keepAllies(battle, [0]);
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("nia missing");
    nia.x = 29;
    nia.y = 17;

    expect(nia.life).toBeGreaterThan(BATTLE_ACTION_DEFINITIONS.wd.damage.perEligibleLineCell);
    expect(battle.planEnemyAiAction("2:28")).toMatchObject({
      kind: "attack",
      targetId: "1:0",
      path: [{ x: 29, y: 16 }],
    });
  });

  /**
   * The demon dragon is the slot the stage-20 victory condition names, so its
   * own death ends the battle. Below 20% it breaks contact even when a kill
   * is on the table — a one-for-one trade would hand the stage to the player.
   */
  it("rests below 20% life even when a melee kill is available", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    replaceTableauWithDragon(battle);
    keepAllies(battle, [0]);
    const nia = battle.unit("1:0");
    const dragon = battle.unit("2:28");
    if (!nia || !dragon) throw new Error("units missing");
    nia.x = 29;
    nia.y = 17;
    nia.life = 40;
    dragon.life = 400; // 16% of 2,400

    expect(battle.planEnemyAiAction("2:28")).toMatchObject({
      kind: "rest",
      path: [{ x: 29, y: 16 }],
    });
  });

  it("still takes a guaranteed kill between 20% and 39% life", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    replaceTableauWithDragon(battle);
    keepAllies(battle, [0]);
    const nia = battle.unit("1:0");
    const dragon = battle.unit("2:28");
    if (!nia || !dragon) throw new Error("units missing");
    nia.x = 29;
    nia.y = 17;
    dragon.life = 720; // 30% of 2,400

    expect(battle.planEnemyAiAction("2:28")).toMatchObject({
      kind: "attack",
      targetId: "1:0",
      path: [{ x: 29, y: 16 }],
    });
  });

  /**
   * `1000:2233` answers a successful `1000:1D67` retreat with `M`, and only
   * the `0P/1P` dispatcher reacts to that code by running the technique chain
   * again — from the cell it just retreated to.
   */
  it("retreats out of contact and still casts WD between 20% and 39% life", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    replaceTableauWithDragon(battle);
    keepAllies(battle, [0, 1]);
    const nia = battle.unit("1:0");
    const shield = battle.unit("1:1");
    const dragon = battle.unit("2:28");
    if (!nia || !shield || !dragon) throw new Error("units missing");
    // Two adjacent allies out of melee-kill reach, so the band decides.
    nia.x = 29;
    nia.y = 17;
    nia.life = 900;
    shield.x = 28;
    shield.y = 16;
    shield.life = 900;
    dragon.life = 720; // 30% of 2,400

    const action = battle.planEnemyAiAction("2:28");
    expect(action).toMatchObject({ kind: "special", actionId: "wd" });
    const destination = action?.path.at(-1);
    expect(destination).not.toEqual({ x: 29, y: 16 });
    expect(battle.units.some((unit) => unit.side === 1
      && Math.abs(unit.x - (destination?.x ?? 0)) + Math.abs(unit.y - (destination?.y ?? 0)) === 1))
      .toBe(false);
  });

  it("rests between 20% and 39% life when no opponent is adjacent", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    replaceTableauWithDragon(battle);
    const dragon = battle.unit("2:28");
    if (!dragon) throw new Error("dragon missing");
    dragon.life = 720;

    expect(battle.planEnemyAiAction("2:28")).toMatchObject({ kind: "rest" });
  });

  it("rebuilds the dragon force membership before validating a restored player save", () => {
    const state = campaign();
    const battle = new Stage20Battle(state, fullDeployment());
    replaceTableauWithDragon(battle);
    const snapshot = battle.serializableSnapshot();
    const restored = new Stage20Battle(state, fullDeployment());
    expect(() => restored.restore(snapshot, state.roster)).not.toThrow();
    expect(restored.unit("2:28")?.classId).toBe("dragon");
  });
});
