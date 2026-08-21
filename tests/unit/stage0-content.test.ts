import { describe, expect, it } from "vitest";
import {
  ASSETS,
  STAGE0,
  STAGE0_ALLY_INITIAL_EXPERIENCE,
  TERRAIN_TOKENS,
  TOKEN_TO_TERRAIN_SLOT,
  classStatsFor,
  createStage0Units,
  initialEnemyExperience,
  nextExperienceThresholdFor,
  statsFor,
  terrainSlotAt,
} from "../../src/game/content/stage0";
import {
  RUNTIME_STAGE_DEFINITIONS,
  STAGE0_DEFINITION,
  isRuntimeStageId,
} from "../../src/game/content/stages";
import type { Difficulty } from "../../src/game/types";
import { shortestPath } from "../../src/game/simulation/grid";

describe("stage 0 evidence-backed content", () => {
  it("registers stage 0 as runnable content", () => {
    expect(RUNTIME_STAGE_DEFINITIONS["stage-00"]).toBe(STAGE0_DEFINITION);
    expect(isRuntimeStageId("stage-00")).toBe(true);
    expect(STAGE0_DEFINITION).toMatchObject({
      contentIdentity: "stage-00/native-actions-1",
      deployment: { kind: "fixed" },
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: STAGE0.objective,
        defeatText: STAGE0.defeat,
      },
      stories: {
        prebattle: "stage-00-prebattle-story",
        opening: "stage-00-opening-story",
        roundStarts: [{ round: 2, storyId: "stage-00-round-2-story" }],
        victory: "stage-00-victory-story",
      },
      music: {
        story: "stage-00-story-music",
        playerPhase: "stage-00-player-phase-music",
        enemyPhase: "stage-00-enemy-phase-music",
      },
    });
    expect(STAGE0_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-00-prebattle-story",
      "stage-00-opening-move",
      "stage-00-opening-story",
      "stage-00-round-2-story",
      "stage-00-victory-story",
      "stage-00-completed-route",
    ]);
  });

  it("binds the complete cavalry attack records", () => {
    expect(ASSETS.fullBattle.left.cavalryPlus50).toHaveLength(9);
    expect(ASSETS.fullBattle.right.cavalryPlus50).toHaveLength(9);
    expect(ASSETS.allyPromotionTargets).toEqual({
      archer: "/assets/original/unit-ally-archer.png",
      cavalry: "/assets/original/unit-ally-cavalry.png",
      sister: "/assets/original/unit-ally-sister.png",
      warrior: "/assets/original/unit-ally-warrior.png",
    });
    expect(ASSETS.promotionMenu).toEqual({
      frame: "/assets/original/promotion-menu-frame.png",
    });
  });

  it("decodes the complete 50×50 terrain model", () => {
    expect(TERRAIN_TOKENS).toHaveLength(2500);
    expect(TOKEN_TO_TERRAIN_SLOT).toHaveLength(128);
    expect(terrainSlotAt({ x: 29, y: 26 })).toBeGreaterThan(0);
  });

  it("builds the verified fixed roster", () => {
    const units = createStage0Units();
    expect(units.filter((unit) => unit.side === 1)).toHaveLength(6);
    expect(units.filter((unit) => unit.side === 2)).toHaveLength(10);
    expect(units.find((unit) => unit.id === "1:0")).toMatchObject({
      name: "妮雅",
      x: 10,
      y: 23,
      experience: 299,
      life: 180,
    });
    expect(units.find((unit) => unit.id === "1:1")).toMatchObject({
      name: "希蜜",
      x: 28,
      y: 29,
      experience: 299,
      life: 180,
    });
    expect(units.find((unit) => unit.id === "2:15")).toMatchObject({
      classId: "cavalry",
      className: "騎兵",
      name: "哈釘",
      portrait: 15,
      experience: 181,
      life: 230,
    });
  });

  it("finds a legal opening route for Nia within the FM budget", () => {
    const units = createStage0Units();
    const nia = units.find((unit) => unit.id === "1:0")!;
    const route = shortestPath(nia, STAGE0.opening.to, "soldier", STAGE0.opening.budget, units.filter((unit) => unit.id !== nia.id));
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(0)).toEqual(STAGE0.opening.from);
    expect(route.at(-1)).toEqual(STAGE0.opening.to);
    expect(route.length - 1).toBeLessThanOrEqual(STAGE0.opening.budget);
  });

  it("selects native growth rows and reports current-profession levels", () => {
    expect(classStatsFor({ classId: "soldier", experience: 0 })).toMatchObject({ attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 });
    expect(classStatsFor({ classId: "soldier", experience: 100 })).toMatchObject({ attack: 42, defense: 24, maxLife: 170, level: 2 });
    expect(classStatsFor({ classId: "cavalry", experience: 180 })).toMatchObject({ attack: 60, defense: 33, maxLife: 230, level: 2 });
    expect(classStatsFor({ classId: "soldier", experience: 301 })).toMatchObject({ attack: 46, defense: 27, maxLife: 190, level: 4 });
    expect(classStatsFor({ classId: "cavalry", experience: 461 })).toMatchObject({ attack: 66, defense: 36, maxLife: 270, level: 4 });
    expect(nextExperienceThresholdFor({ classId: "soldier", experience: 32 })).toBe(100);
    expect(nextExperienceThresholdFor({ classId: "soldier", experience: 301 })).toBe(400);
    expect(nextExperienceThresholdFor({ classId: "cavalry", experience: 461 })).toBe(560);
  });

  it("reproduces the stage-0 enemy stats for all four difficulties", () => {
    // 难度 0（等级 2）与难度 3（等级 5 + ×1.5）逐字保持原版。难度 1／2 走
    // `REMAKE-103` 的 linear 曲线并分别坐在等级 4／6：士兵每行 +3/+3/+10，
    // 騎兵每行 +5/+3/+30，经验阶梯仍是原版的每行 +100。
    const expected = [
      {
        soldier: { experience: 101, attack: 42, defense: 24, maxLife: 170, level: 2 },
        hading: { experience: 181, attack: 60, defense: 33, maxLife: 230, level: 2 },
      },
      {
        soldier: { experience: 301, attack: 48, defense: 30, maxLife: 190, level: 4 },
        hading: { experience: 461, attack: 70, defense: 39, maxLife: 290, level: 4 },
      },
      {
        soldier: { experience: 501, attack: 54, defense: 36, maxLife: 210, level: 6 },
        hading: { experience: 661, attack: 80, defense: 45, maxLife: 350, level: 6 },
      },
      {
        soldier: { experience: 401, attack: 70, defense: 40, maxLife: 300, level: 5 },
        hading: { experience: 561, attack: 100, defense: 54, maxLife: 420, level: 5 },
      },
    ] as const;

    for (const difficulty of [0, 1, 2, 3] satisfies Difficulty[]) {
      const units = createStage0Units(difficulty);
      const soldier = units.find((unit) => unit.id === "2:48");
      const hading = units.find((unit) => unit.id === "2:15");
      if (!soldier || !hading) throw new Error("stage 0 enemy fixture is incomplete");
      expect(initialEnemyExperience("soldier", difficulty)).toBe(expected[difficulty].soldier.experience);
      expect(initialEnemyExperience("cavalry", difficulty)).toBe(expected[difficulty].hading.experience);
      expect({
        experience: soldier.experience,
        ...statsFor(soldier, difficulty),
      }).toMatchObject(expected[difficulty].soldier);
      expect({
        experience: hading.experience,
        ...statsFor(hading, difficulty),
      }).toMatchObject(expected[difficulty].hading);
    }
  });

  it("reproduces the named and generic allied fresh-battle groups on every difficulty", () => {
    const expectedBySlot = {
      0: { experience: 299, life: 180, attack: 45, defense: 27, maxLife: 180, movement: 4, level: 3 },
      1: { experience: 299, life: 180, attack: 45, defense: 27, maxLife: 180, movement: 4, level: 3 },
      40: { experience: 0, life: 160, attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 },
      41: { experience: 0, life: 160, attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 },
      42: { experience: 0, life: 160, attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 },
      43: { experience: 0, life: 160, attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 },
    } as const;
    expect(STAGE0_ALLY_INITIAL_EXPERIENCE).toEqual({
      0: 299,
      1: 299,
      40: 0,
      41: 0,
      42: 0,
      43: 0,
    });

    for (const difficulty of [0, 1, 2, 3] satisfies Difficulty[]) {
      const allies = createStage0Units(difficulty).filter((unit) => unit.side === 1);
      expect(Object.fromEntries(allies.map((unit) => [
        unit.slot,
        {
          experience: unit.experience,
          life: unit.life,
          ...statsFor(unit, difficulty),
        },
      ]))).toEqual(expectedBySlot);
    }
  });
});
