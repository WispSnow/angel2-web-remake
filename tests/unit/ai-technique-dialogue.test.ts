import { describe, expect, test } from "vitest";
import {
  aiTechniqueDialogueFor,
  NATIVE_AI_TECHNIQUE_LINES,
} from "../../src/game/content/ai-technique-dialogue";

describe("native AI technique dialogue", () => {
  test("binds stage-1 enemy techniques to their native selectors and exact lines", () => {
    expect(NATIVE_AI_TECHNIQUE_LINES).toEqual({
      "fire-1": { selector: 0x0a, address: "DS:85CA", text: "看我的火球魔法." },
      "heal-1": { selector: 0x0f, address: "DS:860C", text: "生命單." },
    });

    expect(aiTechniqueDialogueFor({ name: "騎士團修女", portrait: 49, side: 2 }, "fire-1"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          portrait: 49,
          speaker: "騎士團修女・初級炎暴",
          text: "看我的火球魔法.",
        },
        source: { record: "ai-technique", wait: 0x0a, address: "DS:85CA" },
      });
    expect(aiTechniqueDialogueFor({ name: "騎士團修女", portrait: 49, side: 2 }, "heal-1"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "騎士團修女・初級治療",
          text: "生命單.",
        },
        source: { record: "ai-technique", wait: 0x0f, address: "DS:860C" },
      });
    expect(aiTechniqueDialogueFor({ name: "魔術士", portrait: 38, side: 2 }, "lightning-1"))
      .toBeUndefined();
  });
});
