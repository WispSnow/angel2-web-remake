import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE9_ASSETS,
  STAGE9_DEFINITION,
  STAGE9_ESCORT_ROUTE_DEFINITION,
  STAGE9_EVENT_PROGRAM,
  STAGE9_MUSIC_PROGRAMS,
  STAGE9_SEMANTIC_ALLIED_UNITS,
  STAGE9_SEMANTIC_ENEMY_UNITS,
  STAGE9_SOURCES,
  STAGE9_STORY_PAGES,
  STAGE9_TERRAIN_TOKENS,
  activateStage9Content,
} from "../../src/game/content/stage9";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 9 generated content", () => {
  it("defines the native deployment and corrected two-path objective", () => {
    activateStage9Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-09"]).toBe(STAGE9_DEFINITION);
    expect(STAGE9_DEFINITION).toMatchObject({
      id: "stage-09",
      nativeStage: 9,
      name: "找尋傳說中的飛船",
      viewport: { initialOrigin: { x: 13, y: 36 } },
      objective: {
        victory: {
          type: "any-of",
          conditions: [
            { type: "unit-in-cell-range", side: 1, slot: 9, minimum: 0, maximum: 933 },
            { type: "eliminate-side", side: 2 },
          ],
        },
        defeat: { type: "any-unit-removed", side: 1, slots: [0, 9] },
      },
      deployment: {
        fixedPlacements: [
          { slot: 9, position: { x: 16, y: 38 } },
          { slot: 0, position: { x: 17, y: 39 } },
        ],
        maximumUnits: 9,
      },
    });
    expect(STAGE9_EVENT_PROGRAM).toMatchObject({
      openingStoryRecord: 22,
      victoryStoryRecord: 23,
      completedRoute: { module: 27, stage: 11, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-039", "REMAKE-040"],
    });
  });

  it("keeps Dori's native class, route, and all fourteen enemies", () => {
    expect(STAGE9_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE9_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 9)).toMatchObject({
      name: "多莉", portrait: 13, initialClassId: "curse-master", aiBehavior: 12,
    });
    expect(STAGE9_SEMANTIC_ENEMY_UNITS).toHaveLength(14);
    expect(STAGE9_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 19)).toMatchObject({
      classId: "land-knight", name: "西艾蕾", portrait: 5, position: { x: 17, y: 20 },
    });
    expect(STAGE9_ESCORT_ROUTE_DEFINITION).toEqual({
      actorId: "1:9",
      movement: 7,
      width: 50,
      waypoints: [
        { actorCellAtLeast: 1316, goal: { x: 16, y: 25 } },
        { actorCellAtLeast: 1184, goal: { x: 34, y: 22 } },
        { actorCellAtLeast: 934, goal: { x: 34, y: 17 } },
      ],
      victoryMaximumCell: 933,
      stableRemakeDecision: "REMAKE-040",
    });
  });

  it("registers SAY/22, SAY/23, and the original phase music", () => {
    activateStage9Content();
    expect(STAGE9_STORY_PAGES["stage-09-opening-story"]).toHaveLength(5);
    expect(STAGE9_STORY_PAGES["stage-09-victory-story"]).toHaveLength(3);
    expect(storyPagesForId("stage-09-opening-story"))
      .toBe(STAGE9_STORY_PAGES["stage-09-opening-story"]);
    expect(STAGE9_MUSIC_PROGRAMS["stage-09-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/39", loopTrack: "MUSIC/38" });
    expect(STAGE9_MUSIC_PROGRAMS["stage-09-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-09-player-phase-music"))
      .toBe(STAGE9_MUSIC_PROGRAMS["stage-09-player-phase-music"]);
  });

  it("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE9_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE9_ASSETS.map,
      STAGE9_ASSETS.minimap,
      ...Object.values(STAGE9_ASSETS.unitSprites),
      ...Object.values(STAGE9_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
