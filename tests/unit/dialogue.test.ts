import { describe, expect, it } from "vitest";
import {
  OPENING_STORY,
  PREBATTLE_STORY,
  ROUND2_STORY,
  STORY_PAGES_BY_ID,
  VICTORY_STORY,
  storyIdForStagePhase,
  storyPagesForStagePhase,
  storyPhaseForStageStory,
} from "../../src/game/content/dialogue";
import {
  GROUP_COMMAND_DIALOGUE,
  groupCommandDialogueFor,
} from "../../src/game/content/group-command-dialogue";
import { STAGE1_STORY_PAGES } from "../../src/game/content/stage1-runtime.generated";
import { STAGE2_STORY_PAGES } from "../../src/game/content/stage2-runtime.generated";
import { STAGE3_STORY_PAGES } from "../../src/game/content/stage3-runtime.generated";
import { STAGE4_STORY_PAGES } from "../../src/game/content/stage4-runtime.generated";
import { STAGE5_STORY_PAGES } from "../../src/game/content/stage5-runtime.generated";
import { STAGE6_STORY_PAGES } from "../../src/game/content/stage6-runtime.generated";
import { STAGE7_STORY_PAGES } from "../../src/game/content/stage7-runtime.generated";
import { STAGE8_STORY_PAGES } from "../../src/game/content/stage8-runtime.generated";
import { STAGE9_STORY_PAGES } from "../../src/game/content/stage9-runtime.generated";
import { STAGE10_STORY_PAGES } from "../../src/game/content/stage10-runtime.generated";
import { STAGE11_STORY_PAGES } from "../../src/game/content/stage11-runtime.generated";
import { STAGE12_STORY_PAGES } from "../../src/game/content/stage12-runtime.generated";
import { STAGE13_STORY_PAGES } from "../../src/game/content/stage13-runtime.generated";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import type { DialoguePage } from "../../src/game/types";

const GENERATED_STORIES = Object.assign(
  {},
  STAGE1_STORY_PAGES,
  STAGE2_STORY_PAGES,
  STAGE3_STORY_PAGES,
  STAGE4_STORY_PAGES,
  STAGE5_STORY_PAGES,
  STAGE6_STORY_PAGES,
  STAGE7_STORY_PAGES,
  STAGE8_STORY_PAGES,
  STAGE9_STORY_PAGES,
  STAGE10_STORY_PAGES,
  STAGE11_STORY_PAGES,
  STAGE12_STORY_PAGES,
  STAGE13_STORY_PAGES,
) as Readonly<Record<string, readonly DialoguePage[]>>;

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
    expect(appended.lower?.text?.startsWith(firstHalf.lower?.text ?? "")).toBe(true);
    expect(appended.revealStart).toBe(firstHalf.lower?.text?.length);
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

  it("resolves stage 0 dialogue through stable story IDs without changing pages", () => {
    expect(STORY_PAGES_BY_ID["stage-00-prebattle-story"]).toBe(PREBATTLE_STORY);
    expect(storyPagesForStagePhase(STAGE0_DEFINITION, "prebattleStory")).toBe(PREBATTLE_STORY);
    expect(storyPagesForStagePhase(STAGE0_DEFINITION, "openingStory")).toBe(OPENING_STORY);
    expect(storyPagesForStagePhase(STAGE0_DEFINITION, "round2Story")).toBe(ROUND2_STORY);
    expect(storyPagesForStagePhase(STAGE0_DEFINITION, "victoryStory")).toBe(VICTORY_STORY);
    expect(storyIdForStagePhase(STAGE0_DEFINITION, "openingStory"))
      .toBe("stage-00-opening-story");
    expect(storyPhaseForStageStory(STAGE0_DEFINITION, "stage-00-round-2-story"))
      .toBe("round2Story");
  });

  it("preserves the three native group-command lines and selector addresses", () => {
    expect(GROUP_COMMAND_DIALOGUE).toEqual({
      allRest: {
        selector: 0x1f,
        address: "DS:86E4",
        page: {
          activeSlot: "upper",
          upper: {
            portrait: 46,
            speaker: "妮雅",
            text: "大家聽著！\n所有還未行動的人在原地休息，補充體力．",
          },
          source: { record: "battle-command", wait: 0x1f, address: "DS:86E4" },
        },
      },
      followLeader: {
        selector: 0x21,
        address: "DS:873C",
        page: {
          activeSlot: "upper",
          upper: {
            portrait: 46,
            speaker: "妮雅",
            text: "大家聽著！\n所有還未行動的人跟著我來．",
          },
          source: { record: "battle-command", wait: 0x21, address: "DS:873C" },
        },
      },
      freeAction: {
        selector: 0x20,
        address: "DS:8716",
        page: {
          activeSlot: "upper",
          upper: {
            portrait: 46,
            speaker: "妮雅",
            text: "大家聽著！\n所有還未行動的人自由行動．",
          },
          source: { record: "battle-command", wait: 0x20, address: "DS:8716" },
        },
      },
    });
  });

  it("projects the native command line through the current allied focus", () => {
    expect(groupCommandDialogueFor("allRest", { name: "希蜜", portrait: 45 })).toMatchObject({
      upper: {
        portrait: 45,
        speaker: "希蜜",
        text: GROUP_COMMAND_DIALOGUE.allRest.page.upper?.text,
      },
      source: GROUP_COMMAND_DIALOGUE.allRest.page.source,
    });
    expect(GROUP_COMMAND_DIALOGUE.allRest.page.upper).toMatchObject({
      portrait: 46,
      speaker: "妮雅",
    });
  });
});

describe("generated native dialogue continuations", () => {
  it("starts appended text after the characters already visible at the previous KY", () => {
    const continuations: Array<{ storyId: string; wait: number }> = [];

    for (const [storyId, pages] of Object.entries(GENERATED_STORIES)) {
      for (let index = 1; index < pages.length; index += 1) {
        const previous = pages[index - 1];
        const current = pages[index];
        const slot = current.activeSlot;
        if (!slot) continue;
        const previousText = previous[slot]?.text;
        const currentText = current[slot]?.text;
        if (current.revealStart !== undefined) {
          expect(currentText?.startsWith(previousText ?? ""), `${storyId} KY ${current.source.wait}`).toBe(true);
          expect(current.revealStart, `${storyId} KY ${current.source.wait}`).toBe(previousText?.length);
        }
        if (!previousText || !currentText?.startsWith(previousText)) continue;

        expect(current.revealStart, `${storyId} KY ${current.source.wait}`).toBe(previousText.length);
        continuations.push({ storyId, wait: current.source.wait });
      }
    }

    expect(continuations).toContainEqual({ storyId: "stage-13-prebattle-story", wait: 6 });
  });
});
