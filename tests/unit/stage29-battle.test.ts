import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  unitDisplayName,
} from "../../src/game/content/classes";
import {
  STAGE29_DEFINITION,
  STAGE29_IRON_PLATE_TERRAIN_SLOT,
  STAGE29_OBSTACLE_TERRAIN_SLOT,
} from "../../src/game/content/stage29";
import {
  createStage29DeploymentRoster,
  Stage29Battle,
} from "../../src/game/simulation/stage29-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-29",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 900, life: 260 },
    { slot: 7, classId: "magic-priest", experience: 700, life: 190 },
    { slot: 10, classId: "water-warrior", experience: 420, life: 270 },
    { slot: 22, classId: "great-axe-warrior", experience: 360, life: 310 },
    { slot: 25, classId: "half-dragon-warrior", experience: 380, life: 270 },
  ]),
  rngState: 0x29_29_29_29,
  rngCalls: 25,
};

const deployedOptionalSlots = [
  ...STAGE29_DEFINITION.deployment.optionalSlots.slice(0, 13),
  22,
];
const fullDeployment = {
  placements: [
    ...STAGE29_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...deployedOptionalSlots.map((slot, index) => ({
      slot, position: { ...STAGE29_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 29 battle simulation", () => {
  it("keeps slot 22's actor name after deployment while her portrait follows the class", () => {
    const roster = createStage29DeploymentRoster(campaign);
    expect(roster).toHaveLength(30);
    expect(roster.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", classId: "magic-priest", experience: 700,
    });
    expect(roster.find(({ slot }) => slot === 22)).toMatchObject({
      name: "愛莉歐拉",
      portrait: 57,
      classId: "great-axe-warrior",
      className: "巨斧戰士",
      experience: 360,
    });

    const battle = new Stage29Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(15);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
    expect(battle.unit("1:0")).toMatchObject({
      classId: "land-knight", name: "妮雅", portrait: 46, x: 41, y: 26,
    });
    expect(battle.unit("1:22")).toMatchObject({
      classId: "great-axe-warrior",
      className: "巨斧戰士",
      name: "愛莉歐拉",
      portrait: 57,
      displayIdentity: "named-class-portrait",
      experience: 360,
    });
    expect(unitDisplayName(battle.unit("1:22")!)).toBe("愛莉歐拉");
    expect(battle.unit("2:4")).toMatchObject({
      classId: "demon-dragon-knight",
      name: "艾西柯羅",
      portrait: 6,
      x: 40,
      y: 13,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({
      id: "nia-knight-castle-assault-team", control: "player", commanderId: "1:0",
    });
    expect(battle.forceForUnit("2:4")).toMatchObject({
      id: "knight-castle-defense-force", control: "independent-ai",
    });
    expect(battle.outcome()).toBe("ongoing");
  });

  it("accepts the native Nia-only minimum deployment", () => {
    const battle = new Stage29Battle(campaign, {
      placements: STAGE29_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
    });
    expect(battle.units.filter(({ side }) => side === 1).map(({ id }) => id)).toEqual(["1:0"]);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(15);
  });

  it("requires every enemy to leave and gives Nia defeat priority", () => {
    const battle = new Stage29Battle(campaign, fullDeployment);
    battle.units = battle.units.filter(({ id }) => id !== "2:4");
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(14);
    expect(battle.outcome()).toBe("ongoing");

    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");

    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("preserves five behavior-2 archers but sends all 15 enemies into pursuit", () => {
    const battle = new Stage29Battle(campaign, fullDeployment);
    const enemies = battle.units.filter(({ side }) => side === 2);
    expect(enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 2)).toHaveLength(5);
    expect(enemies.filter(({ id }) => battle.enemyBehaviorFor(id) === 0)).toHaveLength(10);
    for (const enemy of enemies) {
      expect(battle.enemyAiIntentFor(enemy.id)).toBe("pursuit");
      expect(battle.planEnemyAiAction(enemy.id), enemy.id).toMatchObject({ unitId: enemy.id });
    }
  });

  it("never generates or replaces defenders across rounds, defeats, or difficulty", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage29Battle({ ...campaign, difficulty }, fullDeployment);
      const initialEnemyIds = battle.units.filter(({ side }) => side === 2).map(({ id }) => id);
      expect(initialEnemyIds).toHaveLength(15);

      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(initialEnemyIds);

      const [defeatedId, ...remainingEnemyIds] = initialEnemyIds;
      if (!defeatedId) throw new Error("stage 29 reinforcement audit requires an opening defender");
      battle.units = battle.units.filter(({ id }) => id !== defeatedId);
      battle.beginEnemyPhase();
      battle.startNextRound();
      expect(battle.units.filter(({ side }) => side === 2).map(({ id }) => id))
        .toEqual(remainingEnemyIds);
    }
  });

  it("uses the same logical construction slot for both native token-16 actions", () => {
    expect(STAGE29_IRON_PLATE_TERRAIN_SLOT).toBe(STAGE29_OBSTACLE_TERRAIN_SLOT);
  });
});
