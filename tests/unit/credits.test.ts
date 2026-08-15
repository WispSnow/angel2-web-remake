import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CREDITS_FINAL_SCREEN,
  CREDITS_FINAL_TIMELINE,
  CREDITS_MUSIC,
  CREDITS_NAME_FRAMES,
  CREDITS_PAGES,
  CREDITS_ROLE_FRAMES,
  CREDITS_TRANSITION,
  CreditsSession,
} from "../../src/game/content/credits";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { isSaveData, SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("module 46 credits", () => {
  it("keeps seven pages plus one unskippable native transition before the terminal screen", () => {
    expect(CREDITS_PAGES).toHaveLength(7);
    expect(CREDITS_TRANSITION).toMatchObject({
      count: 8,
      nativeSteps: 400,
      waitNativeTicksPerStep: 2,
      inputSkippable: false,
    });
    expect(CREDITS_ROLE_FRAMES).toHaveLength(20);
    expect(CREDITS_NAME_FRAMES).toHaveLength(22);
    const session = new CreditsSession();
    for (let transition = 0; transition < 8; transition += 1) {
      expect(session.section).toBe("page");
      expect(session.transitionIndex).toBe(transition);
      expect(session.pageIndex).toBe(Math.min(transition, 6));
      session.advance();
    }
    expect(session.section).toBe("the-end");
    session.advance();
    expect(session.section).toBe("the-end");
  });

  it("ships every generated role, name, and final animation frame", async () => {
    const sources = [
      ...CREDITS_ROLE_FRAMES.map(({ src }) => src),
      ...CREDITS_NAME_FRAMES.map(({ src }) => src),
      CREDITS_FINAL_SCREEN.base,
      ...CREDITS_FINAL_SCREEN.overlays,
      CREDITS_MUSIC.source,
    ];
    for (const source of sources) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
    expect(CREDITS_FINAL_TIMELINE[0]).toEqual({ frame: null, waitNativeTicks: 402 });
    expect(CREDITS_FINAL_TIMELINE.at(-1)).toEqual({ frame: 1, waitNativeTicks: 10 });
  });

  it("accepts stage-39 only as stage 38's completed credits route", () => {
    const save: CompletedSaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      savedAt: "2000-01-01T00:00:00.000Z",
      saveCount: 1,
      stageId: "stage-39",
      stageLabel: "製作人員表",
      ruleset: "stableRemake",
      difficulty: 0,
      rngState: 0x38_39_46,
      rngCalls: 0,
      roster: completeCampaignRoster([]),
      recordCounters: Array<number>(75).fill(0),
      stageProgress: 1000,
      consumedEventIds: [
        "stage-38-enter-deployment",
        "stage-38-opening-story",
        "stage-38-objective-reached",
        "stage-38-victory-story",
        "stage-38-completed-route",
      ],
    };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, stageId: "stage-38" })).toBe(false);
  });
});
