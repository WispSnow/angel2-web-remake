import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage26Content,
  STAGE26_ASSETS,
  STAGE26_COLUMN_PUSH_PRESENTATION,
  STAGE26_DEFINITION,
  STAGE26_EVENT_PROGRAM,
  STAGE26_MUSIC_PROGRAMS,
  STAGE26_SEMANTIC_ALLIED_UNITS,
  STAGE26_SEMANTIC_ENEMY_UNITS,
  STAGE26_SOURCES,
  STAGE26_STORY_PAGES,
  STAGE26_TERRAIN_TOKENS,
} from "../../src/game/content/stage26";
import { STAGE26_COLUMN_PUSH } from "../../src/game/content/stage26-runtime.generated";
import { enemyPhaseTailPresentationTimeline } from "../../src/game/enemy-phase-tail-presentation";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 26 generated content", () => {
  it("defines the boss objective, four fixed allies, and eight static enemies", () => {
    expect(STAGE26_DEFINITION).toMatchObject({
      id: "stage-26",
      nativeStage: 26,
      name: "遭遇碧娜維姬",
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 1 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗「碧娜維姬」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [
          { slot: 1, position: { x: 19, y: 31 } },
          { slot: 0, position: { x: 22, y: 31 } },
          { slot: 8, position: { x: 26, y: 31 } },
          { slot: 7, position: { x: 30, y: 31 } },
        ],
        maximumUnits: 22,
      },
    });
    expect(STAGE26_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE26_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE26_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯", portrait: 14, untouchedExperience: 0,
    });
    expect(STAGE26_SEMANTIC_ENEMY_UNITS).toHaveLength(8);
    expect(STAGE26_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 1)).toMatchObject({
      classId: "magic-master",
      name: "碧娜維姬",
      portrait: 8,
      position: { x: 22, y: 15 },
      aiBehavior: 1,
    });
    expect(STAGE26_SEMANTIC_ENEMY_UNITS.filter(({ classId }) => classId === "magic-priest"))
      .toHaveLength(7);
  });

  it("registers the 24 opening and 34 victory checkpoints", () => {
    activateStage26Content();
    expect(Object.fromEntries(Object.entries(STAGE26_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-26-opening-story": 24,
      "stage-26-victory-story": 34,
    });
    expect(STAGE26_STORY_PAGES["stage-26-opening-story"][0]?.upper?.text)
      .toContain("蘇蘭達");
    expect(STAGE26_STORY_PAGES["stage-26-victory-story"][0]?.lower?.text)
      .toContain("碧娜維姬倒下");
    expect(stageSimulationEffectFor("stage-26-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-26-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-26-route-to-stage-27"))
      .toEqual({ type: "campaign-route", destination: "stage-27" });
  });

  it("keeps both native tail executions and the full 385-tick presentation", () => {
    expect(STAGE26_EVENT_PROGRAM).toMatchObject({
      module25StoryRecord: null,
      openingStoryRecord: 49,
      victoryStoryRecord: 50,
      enemyReinforcements: { kind: "none", initialSide2: 8 },
      enemyPhaseTail: {
        timing: "after-side-2-ai",
        executions: 2,
        presentationBeforeMovement: true,
      },
      completedRoute: { module: 27, stage: 27, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-063"],
    });
    expect(STAGE26_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);

    const timeline = enemyPhaseTailPresentationTimeline(
      STAGE26_COLUMN_PUSH_PRESENTATION,
      { x: 22, y: 13 },
    );
    expect(timeline).toHaveLength(43);
    expect(timeline.filter(({ phase }) => phase === "phase1")).toHaveLength(13);
    expect(timeline.filter(({ phase }) => phase === "phase2")).toHaveLength(4);
    expect(timeline.filter(({ phase }) => phase === "sweep")).toHaveLength(26);
    expect(timeline.reduce((ticks, step) => ticks + step.nativeTicks, 0))
      .toBe(STAGE26_COLUMN_PUSH.totalFixedWaitPerExecutionNativeTicks);
    expect(timeline.at(-1)?.origin).toEqual({ x: 22, y: 38 });
  });

  it("registers the native phase music", () => {
    activateStage26Content();
    expect(STAGE26_MUSIC_PROGRAMS["stage-26-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE26_MUSIC_PROGRAMS["stage-26-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(musicProgramFor("stage-26-player-phase-music"))
      .toBe(STAGE26_MUSIC_PROGRAMS["stage-26-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE26_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE26_ASSETS.map,
      STAGE26_ASSETS.minimap,
      ...Object.values(STAGE26_ASSETS.unitSprites),
      ...Object.values(STAGE26_ASSETS.audio),
      ...STAGE26_COLUMN_PUSH_PRESENTATION.phase1.frames,
      ...STAGE26_COLUMN_PUSH_PRESENTATION.phase2.frames,
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
