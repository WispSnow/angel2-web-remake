import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE8_ASSETS,
  STAGE8_DEFINITION,
  STAGE8_EVENT_PROGRAM,
  STAGE8_MUSIC_PROGRAMS,
  STAGE8_SEMANTIC_ALLIED_UNITS,
  STAGE8_SEMANTIC_ENEMY_UNITS,
  STAGE8_SOURCES,
  STAGE8_STORY_PAGES,
  STAGE8_TERRAIN_TOKENS,
  activateStage8Content,
} from "../../src/game/content/stage8";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 8 generated content", () => {
  it("defines the fixed ranger defense and stable-remake machine objective", () => {
    activateStage8Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-08"]).toBe(STAGE8_DEFINITION);
    expect(STAGE8_DEFINITION).toMatchObject({
      id: "stage-08",
      nativeStage: 8,
      name: "營地遭到偷襲",
      viewport: { initialOrigin: { x: 18, y: 27 } },
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 8 },
        victoryText: "擊退龍塔襲擊者",
        defeatText: "「蘇蘭達」戰敗",
      },
      deployment: { kind: "fixed" },
    });
    expect(STAGE8_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 21,
      openingStoryRecord: 156,
      omittedVictoryStoryRecord: 157,
      completedRoute: { module: 27, stage: 9, replayPresentation: false },
    });
  });

  it("keeps all eight allies, eleven enemies, forced classes, and native behavior values", () => {
    expect(STAGE8_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE8_SEMANTIC_ALLIED_UNITS).toHaveLength(8);
    expect(STAGE8_SEMANTIC_ENEMY_UNITS).toHaveLength(11);
    expect(STAGE8_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 8)).toMatchObject({
      forcedClassId: "cavalry",
      name: "蘇蘭達",
      portrait: 10,
      position: { x: 23, y: 30 },
      aiBehavior: 0,
    });
    expect(STAGE8_SEMANTIC_ALLIED_UNITS.filter(({ aiBehavior }) => aiBehavior === 2)
      .map(({ slot }) => slot)).toEqual([40, 43, 41, 42, 44]);
    expect(new Set(STAGE8_SEMANTIC_ENEMY_UNITS.map(({ aiBehavior }) => aiBehavior)))
      .toEqual(new Set([0]));
  });

  it("registers the three-background prebattle story, round-one story, and native music", () => {
    activateStage8Content();
    const prebattle = STAGE8_STORY_PAGES["stage-08-prebattle-story"];
    expect(prebattle).toHaveLength(34);
    expect(prebattle.map(({ source }) => source.wait))
      .toEqual(Array.from({ length: 34 }, (_, index) => index + 1));
    expect(prebattle.map(({ source }) => source.backgroundId)).toEqual([
      ...Array.from({ length: 7 }, () => 7),
      ...Array.from({ length: 8 }, () => 6),
      ...Array.from({ length: 19 }, () => 8),
    ]);
    expect(STAGE8_STORY_PAGES["stage-08-opening-story"]).toHaveLength(2);
    expect(storyPagesForId("stage-08-prebattle-story")).toBe(prebattle);
    expect(storyPagesForId("stage-08-victory-story" as never)).toEqual([]);
    expect(STAGE8_MUSIC_PROGRAMS["stage-08-story-music"])
      .toMatchObject({ kind: "loop", track: "MAGIC/72" });
    expect(STAGE8_MUSIC_PROGRAMS["stage-08-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE8_MUSIC_PROGRAMS["stage-08-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-08-story-music"))
      .toBe(STAGE8_MUSIC_PROGRAMS["stage-08-story-music"]);
  });

  it("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE8_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE8_ASSETS.map,
      STAGE8_ASSETS.minimap,
      ...Object.values(STAGE8_ASSETS.storyBackgrounds),
      ...Object.values(STAGE8_ASSETS.unitSprites),
      ...Object.values(STAGE8_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
