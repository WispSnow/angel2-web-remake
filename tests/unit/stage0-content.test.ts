import { describe, expect, it } from "vitest";
import { ASSETS, STAGE0, TERRAIN_TOKENS, TOKEN_TO_TERRAIN_SLOT, createStage0Units, nextExperienceThresholdFor, statsFor, terrainSlotAt } from "../../src/game/content/stage0";
import { shortestPath } from "../../src/game/simulation/grid";

describe("stage 0 evidence-backed content", () => {
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
    expect(units.find((unit) => unit.id === "1:0")).toMatchObject({ name: "妮雅", x: 10, y: 23, life: 160 });
    expect(units.find((unit) => unit.id === "1:1")).toMatchObject({ name: "希蜜", x: 28, y: 29 });
    expect(units.find((unit) => unit.id === "2:15")).toMatchObject({
      classId: 22,
      className: "騎兵",
      name: "哈釘",
      portrait: 15,
      life: 200,
    });
  });

  it("finds a legal opening route for Nia within the FM budget", () => {
    const units = createStage0Units();
    const nia = units.find((unit) => unit.id === "1:0")!;
    const route = shortestPath(nia, STAGE0.opening.to, 0, STAGE0.opening.budget, units.filter((unit) => unit.id !== nia.id));
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(0)).toEqual(STAGE0.opening.from);
    expect(route.at(-1)).toEqual(STAGE0.opening.to);
    expect(route.length - 1).toBeLessThanOrEqual(STAGE0.opening.budget);
  });

  it("selects original class rows from cumulative experience", () => {
    expect(statsFor({ classId: 0, experience: 0 })).toMatchObject({ attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 });
    expect(statsFor({ classId: 0, experience: 100 })).toMatchObject({ attack: 42, defense: 24, maxLife: 170, level: 2 });
    expect(statsFor({ classId: 22, experience: 180 })).toMatchObject({ attack: 60, defense: 33, maxLife: 230, level: 5 });
    expect(nextExperienceThresholdFor({ classId: 0, experience: 32 })).toBe(100);
  });
});
