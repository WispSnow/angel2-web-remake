import { describe, expect, it } from "vitest";
import {
  OPENING_STORY,
  PREBATTLE_STORY,
  ROUND2_STORY,
  VICTORY_STORY,
} from "../../src/game/content/dialogue";

describe("native stage-zero dialogue checkpoints", () => {
  it("preserves every module 25 and module 29 KY wait", () => {
    expect(PREBATTLE_STORY).toHaveLength(10);
    expect(OPENING_STORY).toHaveLength(5);
    expect(ROUND2_STORY).toHaveLength(5);
    expect(VICTORY_STORY).toHaveLength(8);
    for (const [record, pages] of [
      [0, PREBATTLE_STORY],
      [1, OPENING_STORY],
      [2, ROUND2_STORY],
      [3, VICTORY_STORY],
    ] as const) {
      expect(pages.map((page) => page.source)).toEqual(
        pages.map((_, index) => ({ record, wait: index + 1 })),
      );
    }
  });

  it("keeps independent windows open and appends the interrupted soldier line", () => {
    const firstHalf = PREBATTLE_STORY[4];
    const appended = PREBATTLE_STORY[5];
    expect(firstHalf.activeSlot).toBe("lower");
    expect(firstHalf.upper?.speaker).toBe("妮雅");
    expect(appended.upper).toEqual(firstHalf.upper);
    expect(appended.lower?.text.startsWith(firstHalf.lower?.text ?? "")).toBe(true);
    expect(appended.revealStart).toBe(firstHalf.lower?.text.length);
    expect(appended.lower?.text).toContain("騎士團的軍隊");
  });

  it("keeps the native victory pause after both windows close", () => {
    expect(VICTORY_STORY[2]).toMatchObject({
      activeSlot: undefined,
      upper: undefined,
      lower: undefined,
      source: { record: 3, wait: 3 },
    });
  });
});
