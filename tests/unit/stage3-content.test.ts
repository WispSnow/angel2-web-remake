import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGE3_ASSETS,
  STAGE3_CAMERA_ORIGIN_BOUNDS,
  STAGE3_DEFINITION,
  STAGE3_EVENT_PROGRAM,
  STAGE3_MUSIC_PROGRAMS,
  STAGE3_SEMANTIC_ALLIED_UNITS,
  STAGE3_SEMANTIC_ENEMY_UNITS,
  STAGE3_SOURCES,
  STAGE3_STORY_PAGES,
  STAGE3_TERRAIN_CONTENT_BOUNDS,
  STAGE3_TERRAIN_TOKENS,
  STAGE3_TOKEN_TO_TERRAIN_SLOT,
  activateStage3Content,
  stage3TerrainSlotAt,
} from "../../src/game/content/stage3";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import { RUNTIME_STAGE_DEFINITIONS, isRuntimeStageId } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 3 generated content", () => {
  it("registers the fixed battle, corrected protected-unit objective, and stage-04 route", () => {
    activateStage3Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-03"]).toBe(STAGE3_DEFINITION);
    expect(isRuntimeStageId("stage-03")).toBe(true);
    expect(STAGE3_DEFINITION).toMatchObject({
      id: "stage-03",
      nativeStage: 3,
      name: "救援友軍",
      width: 50,
      height: 50,
      viewport: {
        width: 10,
        height: 7,
        initialOrigin: { x: 14, y: 31 },
        originBounds: { min: { x: 14, y: 13 }, max: { x: 27, y: 31 } },
      },
      deployment: { kind: "fixed" },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 17 },
        defeat: { type: "any-unit-removed", side: 1, slots: [1, 3] },
        victoryText: "打敗敵將領「梅蒂」",
        defeatText: "「希蜜」或「黛西」戰敗",
      },
    });
    expect(STAGE3_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-03-opening-story",
      "stage-03-player-ready",
      "stage-03-fourth-corps-joined",
      "stage-03-boss-defeated",
      "stage-03-victory-story",
      "stage-03-completed-route",
    ]);
    expect(STAGE3_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 12,
      victoryStoryRecord: 13,
      completedRoute: { module: 25, stage: 4, replayPresentation: false },
    });
  });

  it("decodes all terrain cells and preserves the native 13-vs-12 fixed roster", () => {
    expect(STAGE3_TERRAIN_TOKENS).toHaveLength(2500);
    expect(new Set(STAGE3_TERRAIN_TOKENS).size).toBe(54);
    expect(STAGE3_TOKEN_TO_TERRAIN_SLOT).toHaveLength(128);
    expect(STAGE3_TERRAIN_CONTENT_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 36, y: 37 },
    });
    expect(STAGE3_CAMERA_ORIGIN_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 27, y: 31 },
    });
    expect(stage3TerrainSlotAt({ x: 18, y: 34 })).toBeGreaterThan(0);
    expect(stage3TerrainSlotAt({ x: -1, y: 0 })).toBe(0);
    expect(STAGE3_SEMANTIC_ALLIED_UNITS).toHaveLength(13);
    expect(STAGE3_SEMANTIC_ENEMY_UNITS).toHaveLength(12);
    expect(STAGE3_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 3)).toMatchObject({
      name: "黛西",
      portrait: 43,
      position: { x: 28, y: 18 },
      aiBehavior: 3,
    });
    expect(STAGE3_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 21)).toMatchObject({
      position: { x: 30, y: 15 },
      aiBehavior: 4,
    });
    expect(STAGE3_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 17)).toMatchObject({
      classId: "monk",
      name: "梅蒂",
      portrait: 16,
      position: { x: 18, y: 15 },
    });
  });

  it("registers all dialogue checkpoints and phase music", () => {
    activateStage3Content();
    expect(STAGE3_STORY_PAGES["stage-03-opening-story"]).toHaveLength(3);
    expect(STAGE3_STORY_PAGES["stage-03-victory-story"]).toHaveLength(7);
    expect(storyPagesForId("stage-03-opening-story")).toBe(STAGE3_STORY_PAGES["stage-03-opening-story"]);
    expect(STAGE3_STORY_PAGES["stage-03-opening-story"][1].upper?.speaker).toBe("希蜜");
    expect(STAGE3_STORY_PAGES["stage-03-victory-story"][3].upper?.speaker).toBe("黛西");
    expect(STAGE3_MUSIC_PROGRAMS["stage-03-player-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/9",
      loopTrack: "MUSIC/8",
    });
    expect(STAGE3_MUSIC_PROGRAMS["stage-03-enemy-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/37",
      loopTrack: "MUSIC/36",
    });
    expect(musicProgramFor("stage-03-player-phase-music"))
      .toBe(STAGE3_MUSIC_PROGRAMS["stage-03-player-phase-music"]);
  });

  it("keeps every evidence source and shipped asset byte-identical", async () => {
    for (const source of STAGE3_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE3_ASSETS.map,
      STAGE3_ASSETS.minimap,
      STAGE3_ASSETS.enemyMonk,
      ...Object.values(STAGE3_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
