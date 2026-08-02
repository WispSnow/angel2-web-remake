import { describe, expect, it } from "vitest";
import type { StageObjectiveDefinition } from "../../src/game/content/stages";
import {
  battleOutcomeForObjective,
  objectiveConditionSatisfied,
} from "../../src/game/simulation/objectives";

const stage0Objective = {
  victory: { type: "eliminate-side", side: 2 },
  defeat: { type: "unit-removed", side: 1, slot: 0 },
  victoryText: "敵軍全滅",
  defeatText: "妮雅死亡",
  victoryStatusText: "敵軍已全滅。",
} as const satisfies StageObjectiveDefinition;

describe("stage objective evaluation", () => {
  it("preserves stage 0 victory, defeat, and defeat precedence", () => {
    const ongoing = [{ side: 1, slot: 0 }, { side: 2, slot: 48 }] as const;
    expect(battleOutcomeForObjective(ongoing, stage0Objective)).toBe("ongoing");
    expect(battleOutcomeForObjective([{ side: 1, slot: 0 }], stage0Objective)).toBe("victory");
    expect(battleOutcomeForObjective([{ side: 2, slot: 48 }], stage0Objective)).toBe("defeat");
    expect(battleOutcomeForObjective([], stage0Objective)).toBe("defeat");
  });

  it("supports a stage-specific named-unit victory condition", () => {
    expect(objectiveConditionSatisfied(
      [{ side: 2, slot: 3 }],
      { type: "unit-removed", side: 2, slot: 16 },
    )).toBe(true);
    expect(objectiveConditionSatisfied(
      [{ side: 2, slot: 16 }],
      { type: "unit-removed", side: 2, slot: 16 },
    )).toBe(false);
  });
});
