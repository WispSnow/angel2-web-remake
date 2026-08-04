import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGE2_ASSETS,
  STAGE2_CAMERA_ORIGIN_BOUNDS,
  STAGE2_DEFINITION,
  STAGE2_EVENT_PROGRAM,
  STAGE2_MUSIC_PROGRAMS,
  STAGE2_SEMANTIC_ALLIED_UNITS,
  STAGE2_SEMANTIC_ENEMY_UNITS,
  STAGE2_SOURCES,
  STAGE2_STORY_PAGES,
  STAGE2_TERRAIN_CONTENT_BOUNDS,
  STAGE2_TERRAIN_TOKENS,
  STAGE2_TOKEN_TO_TERRAIN_SLOT,
  activateStage2Content,
  stage2TerrainSlotAt,
} from "../../src/game/content/stage2";
import { RUNTIME_STAGE_DEFINITIONS, isRuntimeStageId } from "../../src/game/content/stages";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 2 generated content", () => {
  it("registers the fixed stage definition, objective, stories and route", () => {
    activateStage2Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-02"]).toBe(STAGE2_DEFINITION);
    expect(isRuntimeStageId("stage-02")).toBe(true);
    expect(STAGE2_DEFINITION).toMatchObject({
      id: "stage-02",
      nativeStage: 2,
      name: "救援友軍",
      width: 50,
      height: 50,
      viewport: {
        width: 10,
        height: 7,
        initialOrigin: { x: 17, y: 31 },
        originBounds: { min: { x: 14, y: 13 }, max: { x: 26, y: 31 } },
      },
      deployment: { kind: "fixed" },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 18 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗敵人首領「蘭」",
        defeatText: "「妮雅」戰敗",
      },
      music: {
        playerPhase: "stage-02-player-phase-music",
        enemyPhase: "stage-02-enemy-phase-music",
      },
    });
    expect(STAGE2_DEFINITION.contentIdentity).toMatch(/^stage-02\/evidence-[a-f0-9]{64}$/u);
    expect(STAGE2_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-02-opening-story",
      "stage-02-boss-defeated",
      "stage-02-victory-story",
      "stage-02-completed-route",
    ]);
    expect(STAGE2_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 155,
      victoryStoryRecord: 175,
      completedRoute: { module: 27, stage: 3, replayPresentation: false },
    });
  });

  it("decodes all terrain cells and preserves the complete fixed roster", () => {
    expect(STAGE2_TERRAIN_TOKENS).toHaveLength(2500);
    expect(new Set(STAGE2_TERRAIN_TOKENS).size).toBe(85);
    expect(STAGE2_TOKEN_TO_TERRAIN_SLOT).toHaveLength(128);
    expect(STAGE2_TERRAIN_CONTENT_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 35, y: 37 },
    });
    expect(STAGE2_CAMERA_ORIGIN_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 26, y: 31 },
    });
    expect(stage2TerrainSlotAt({ x: 25, y: 21 })).toBeGreaterThanOrEqual(0);
    expect(stage2TerrainSlotAt({ x: -1, y: 0 })).toBe(0);

    expect(STAGE2_SEMANTIC_ALLIED_UNITS.map(({ slot, aiBehavior, position, classOverride }) => ({
      slot,
      aiBehavior,
      position,
      classOverride,
    }))).toEqual([
      { slot: 44, aiBehavior: 11, position: { x: 22, y: 32 }, classOverride: undefined },
      { slot: 45, aiBehavior: 11, position: { x: 28, y: 32 }, classOverride: undefined },
      { slot: 43, aiBehavior: 11, position: { x: 20, y: 33 }, classOverride: undefined },
      { slot: 41, aiBehavior: 11, position: { x: 23, y: 33 }, classOverride: undefined },
      { slot: 40, aiBehavior: 11, position: { x: 27, y: 33 }, classOverride: undefined },
      { slot: 42, aiBehavior: 11, position: { x: 29, y: 33 }, classOverride: undefined },
      { slot: 0, aiBehavior: 0, position: { x: 21, y: 35 }, classOverride: undefined },
      { slot: 24, aiBehavior: 0, position: { x: 25, y: 35 }, classOverride: "magician" },
      { slot: 2, aiBehavior: 0, position: { x: 28, y: 35 }, classOverride: undefined },
    ]);
    expect(STAGE2_SEMANTIC_ENEMY_UNITS.map(({ slot, classId, name, portrait, aiBehavior }) => ({
      slot,
      classId,
      name,
      portrait,
      aiBehavior,
    }))).toEqual([
      { slot: 47, classId: "cavalry", name: "騎士團騎兵", portrait: 53, aiBehavior: 0 },
      { slot: 18, classId: "cavalry", name: "蘭", portrait: 35, aiBehavior: 2 },
      { slot: 46, classId: "cavalry", name: "騎士團騎兵", portrait: 53, aiBehavior: 0 },
      { slot: 51, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 2 },
      { slot: 50, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 2 },
    ]);
  });

  it("compiles all KY checkpoints and registers evidence-backed phase music", () => {
    activateStage2Content();
    expect(STAGE2_STORY_PAGES["stage-02-opening-story"]).toHaveLength(1);
    expect(STAGE2_STORY_PAGES["stage-02-victory-story"]).toHaveLength(3);
    expect(storyPagesForId("stage-02-opening-story")).toBe(STAGE2_STORY_PAGES["stage-02-opening-story"]);
    expect(storyPagesForId("stage-02-victory-story")).toBe(STAGE2_STORY_PAGES["stage-02-victory-story"]);
    expect(STAGE2_STORY_PAGES["stage-02-opening-story"][0].source.record).toBe(155);
    expect(STAGE2_STORY_PAGES["stage-02-victory-story"][0].lower?.speaker).toBe("士兵");
    expect(STAGE2_MUSIC_PROGRAMS["stage-02-player-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/29",
      loopTrack: "MUSIC/28",
    });
    expect(STAGE2_MUSIC_PROGRAMS["stage-02-enemy-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/37",
      loopTrack: "MUSIC/36",
    });
    expect(musicProgramFor("stage-02-player-phase-music"))
      .toBe(STAGE2_MUSIC_PROGRAMS["stage-02-player-phase-music"]);
  });

  it("keeps every generated source and shipped asset byte-identical", async () => {
    for (const source of STAGE2_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE2_ASSETS.map,
      STAGE2_ASSETS.minimap,
      ...Object.values(STAGE2_ASSETS.audio),
    ]) {
      const value = await readFile(path.join(workspace, "public", source));
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
