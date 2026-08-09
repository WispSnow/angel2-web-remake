import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE7_ASSETS,
  STAGE7_DEFINITION,
  STAGE7_EVENT_PROGRAM,
  STAGE7_MUSIC_PROGRAMS,
  STAGE7_SEMANTIC_ENEMY_UNITS,
  STAGE7_SOURCES,
  STAGE7_STORY_PAGES,
  STAGE7_TERRAIN_TOKENS,
  activateStage7Content,
} from "../../src/game/content/stage7";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 7 generated content", () => {
  it("defines the seven-unit camp defense and stable-remake Laili objective", () => {
    activateStage7Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-07"]).toBe(STAGE7_DEFINITION);
    expect(STAGE7_DEFINITION).toMatchObject({
      id: "stage-07",
      nativeStage: 7,
      name: "來到異世界",
      viewport: { initialOrigin: { x: 18, y: 25 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 18 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗萊莉",
      },
      deployment: {
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        fixedPlacements: [
          { slot: 0, position: { x: 22, y: 28 } },
          { slot: 1, position: { x: 26, y: 28 } },
        ],
        optionalSlots: [2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        maximumUnits: 7,
      },
    });
    expect(STAGE7_DEFINITION.deployment.openCells).toEqual([
      { x: 24, y: 19 },
      { x: 18, y: 20 },
      { x: 14, y: 22 },
      { x: 25, y: 23 },
      { x: 30, y: 23 },
    ]);
    expect(STAGE7_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 17,
      completedRoute: { module: 25, stage: 8, replayPresentation: false },
    });
  });

  it("keeps all eleven native raiders and Laili's machine identity", () => {
    expect(STAGE7_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE7_SEMANTIC_ENEMY_UNITS).toHaveLength(11);
    expect(STAGE7_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 18)).toMatchObject({
      classId: "land-knight",
      name: "萊莉",
      portrait: 19,
      position: { x: 35, y: 16 },
      aiBehavior: 0,
    });
    expect(new Set(STAGE7_SEMANTIC_ENEMY_UNITS.map(({ aiBehavior }) => aiBehavior)))
      .toEqual(new Set([0]));
  });

  it("registers the thirty-wait story, background switch, and native music", () => {
    activateStage7Content();
    const pages = STAGE7_STORY_PAGES["stage-07-prebattle-story"];
    expect(pages).toHaveLength(30);
    expect(pages.map(({ source }) => source.wait)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(pages.slice(0, 13).map(({ source }) => source.backgroundId))
      .toEqual(Array.from({ length: 13 }, () => 6));
    expect(pages.slice(13).map(({ source }) => source.backgroundId))
      .toEqual(Array.from({ length: 17 }, () => 7));
    expect(storyPagesForId("stage-07-prebattle-story")).toBe(pages);
    expect(STAGE7_MUSIC_PROGRAMS["stage-07-story-music"])
      .toMatchObject({ kind: "loop", track: "MAGIC/79" });
    expect(STAGE7_MUSIC_PROGRAMS["stage-07-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE7_MUSIC_PROGRAMS["stage-07-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/25", loopTrack: "MUSIC/24" });
    expect(musicProgramFor("stage-07-story-music"))
      .toBe(STAGE7_MUSIC_PROGRAMS["stage-07-story-music"]);
  });

  it("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE7_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE7_ASSETS.map,
      STAGE7_ASSETS.minimap,
      ...Object.values(STAGE7_ASSETS.storyBackgrounds),
      ...Object.values(STAGE7_ASSETS.unitSprites),
      ...Object.values(STAGE7_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
