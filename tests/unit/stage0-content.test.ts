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
  isRuntimeStageId,
} from "../../src/game/content/stages";
import type { Difficulty } from "../../src/game/types";
import { shortestPath } from "../../src/game/simulation/grid";

describe("stage 0 evidence-backed content", () => {
  it("registers stage 0 as the only runnable stage definition", () => {
    expect(Object.keys(RUNTIME_STAGE_DEFINITIONS)).toEqual(["stage-00"]);
    expect(isRuntimeStageId("stage-00")).toBe(true);
    expect(isRuntimeStageId("stage-01")).toBe(false);
  });

  it("binds the native full-combat background and complete cavalry attack records", () => {
    expect(ASSETS.fullBattle.stageBackground).toContain("stage0-background.png");
    expect(ASSETS.fullBattle.left.cavalryPlus50).toHaveLength(9);
    expect(ASSETS.fullBattle.right.cavalryPlus50).toHaveLength(9);
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

  it("selects native visible growth rows from cumulative experience", () => {
    expect(classStatsFor({ classId: "soldier", experience: 0 })).toMatchObject({ attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 });
    expect(classStatsFor({ classId: "soldier", experience: 100 })).toMatchObject({ attack: 42, defense: 24, maxLife: 170, level: 2 });
    expect(classStatsFor({ classId: "cavalry", experience: 180 })).toMatchObject({ attack: 60, defense: 33, maxLife: 230, level: 2 });
    expect(classStatsFor({ classId: "soldier", experience: 301 })).toMatchObject({ attack: 46, defense: 27, maxLife: 190, level: 4 });
    expect(classStatsFor({ classId: "cavalry", experience: 461 })).toMatchObject({ attack: 66, defense: 36, maxLife: 270, level: 4 });
    expect(nextExperienceThresholdFor({ classId: "soldier", experience: 32 })).toBe(100);
    expect(nextExperienceThresholdFor({ classId: "soldier", experience: 301 })).toBe(400);
    expect(nextExperienceThresholdFor({ classId: "cavalry", experience: 461 })).toBe(560);
  });

  it("reproduces the native stage-0 enemy stats for all four difficulties", () => {
    const expected = [
      {
        soldier: { experience: 101, attack: 42, defense: 24, maxLife: 170, level: 2 },
        hading: { experience: 181, attack: 60, defense: 33, maxLife: 230, level: 2 },
      },
      {
        soldier: { experience: 201, attack: 45, defense: 27, maxLife: 180, level: 3 },
        hading: { experience: 361, attack: 65, defense: 36, maxLife: 260, level: 3 },
      },
      {
        soldier: { experience: 301, attack: 46, defense: 27, maxLife: 190, level: 4 },
        hading: { experience: 461, attack: 66, defense: 36, maxLife: 270, level: 4 },
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
