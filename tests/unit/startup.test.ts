import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_OPTIONS,
  INTRO_BACKGROUND_CHANGES,
  INTRO_LINE_ASSIGNMENTS,
  NATIVE_INTRO_DURATION_MS,
} from "../../src/game/content/startup";

describe("native startup content", () => {
  it("preserves the four original difficulty values and labels", () => {
    expect(DIFFICULTY_OPTIONS.map(({ value, label }) => [value, label])).toEqual([
      [0, "過關斬將"],
      [1, "勢均力敵"],
      [2, "困難重重"],
      [3, "無法無天"],
    ]);
  });

  it("keeps the released intro timing, backgrounds and three-slot text schedule", () => {
    expect(NATIVE_INTRO_DURATION_MS).toBe(70_921);
    expect(INTRO_BACKGROUND_CHANGES).toHaveLength(7);
    expect(INTRO_LINE_ASSIGNMENTS).toHaveLength(29);
    expect(INTRO_LINE_ASSIGNMENTS.filter(({ text }) => text.length > 0)).toHaveLength(17);
    expect(new Set(INTRO_LINE_ASSIGNMENTS.map(({ slot }) => slot))).toEqual(new Set([0, 1, 2]));
  });
});
