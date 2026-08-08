import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE5_ASSETS,
  STAGE5_DEFINITION,
  STAGE5_EVENT_PROGRAM,
  STAGE5_MUSIC_PROGRAMS,
  STAGE5_SEMANTIC_ENEMY_UNITS,
  STAGE5_SOURCES,
  STAGE5_STORY_PAGES,
  STAGE5_TERRAIN_TOKENS,
  STAGE42_ASSETS,
  STAGE42_EVENT_PROGRAM,
  STAGE42_PORTAL_DEFINITION,
  STAGE42_SEMANTIC_ALLIED_UNITS,
  STAGE42_TERRAIN_TOKENS,
  activateStage5Content,
} from "../../src/game/content/stage5";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 5 and portal generated content", () => {
  it("defines the six-unit deployment and either-boss victory contract", () => {
    activateStage5Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-05"]).toBe(STAGE5_DEFINITION);
    expect(STAGE5_DEFINITION).toMatchObject({
      id: "stage-05",
      nativeStage: 5,
      name: "遭遇丁塔琪",
      viewport: { initialOrigin: { x: 21, y: 30 } },
      objective: {
        victory: { type: "any-unit-removed", side: 2, slots: [25, 26] },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗汀塔琪或萊茵任一人",
      },
      deployment: {
        eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 33 } }],
        optionalSlots: [1, 2, 3, 4, 20, 21, 24],
        maximumUnits: 6,
      },
    });
    expect(STAGE5_DEFINITION.deployment.openCells).toEqual([
      { x: 23, y: 33 }, { x: 27, y: 33 }, { x: 23, y: 34 },
      { x: 25, y: 34 }, { x: 27, y: 34 },
    ]);
    expect(STAGE5_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 9,
      victoryStoryRecord: 10,
      completedRoute: { module: 27, stage: 42, replayPresentation: false },
    });
  });

  it("keeps fourteen enemies and machine-resolved boss identities", () => {
    expect(STAGE5_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE5_SEMANTIC_ENEMY_UNITS).toHaveLength(14);
    expect(STAGE5_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 25)).toMatchObject({
      classId: "soldier", name: "汀塔琪", portrait: 3,
      position: { x: 23, y: 16 }, aiBehavior: 1,
    });
    expect(STAGE5_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 26)).toMatchObject({
      classId: "soldier", name: "萊茵", portrait: 2,
      position: { x: 27, y: 16 }, aiBehavior: 1,
    });
    expect(STAGE5_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 1)
      .map(({ slot }) => slot)).toEqual([44, 40, 25, 26]);
  });

  it("encodes scene 42 as an ordered non-interactive event program", () => {
    expect(RUNTIME_STAGE_DEFINITIONS["stage-42-portal"]).toBe(STAGE42_PORTAL_DEFINITION);
    expect(STAGE42_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE42_SEMANTIC_ALLIED_UNITS).toHaveLength(10);
    expect(STAGE42_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 23))
      .toMatchObject({ forcedClassId: "empress", position: { x: 23, y: 22 } });
    expect(STAGE42_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7))
      .toMatchObject({ forcedClassId: "magic-priest", position: { x: 24, y: 22 } });
    expect(STAGE42_PORTAL_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-42-nia-move", "stage-42-arrival-story", "stage-42-confrontation-story",
      "stage-42-gadirath-move", "stage-42-intervention-story", "stage-42-lightning",
      "stage-42-departures", "stage-42-departure-story", "stage-42-completed-route",
    ]);
    expect(STAGE42_EVENT_PROGRAM.liveVictory999.at(-1)).toMatchObject({
      op: "setNextStage", nextStage: 6,
    });
  });

  it("registers the six stories and native stage music", () => {
    activateStage5Content();
    expect(Object.values(STAGE5_STORY_PAGES).map((pages) => pages.length))
      .toEqual([9, 11, 1, 6, 2, 16]);
    expect(storyPagesForId("stage-42-portal-departure-story"))
      .toBe(STAGE5_STORY_PAGES["stage-42-portal-departure-story"]);
    expect(STAGE5_MUSIC_PROGRAMS["stage-05-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE5_MUSIC_PROGRAMS["stage-05-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(STAGE5_MUSIC_PROGRAMS["stage-42-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/35", loopTrack: "MUSIC/34" });
    expect(musicProgramFor("stage-42-player-phase-music"))
      .toBe(STAGE5_MUSIC_PROGRAMS["stage-42-player-phase-music"]);
  });

  it("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE5_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE5_ASSETS.map, STAGE5_ASSETS.minimap, ...Object.values(STAGE5_ASSETS.unitSprites),
      ...Object.values(STAGE5_ASSETS.audio), STAGE42_ASSETS.map, STAGE42_ASSETS.minimap,
      ...Object.values(STAGE42_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
