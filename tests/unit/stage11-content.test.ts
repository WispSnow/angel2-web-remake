import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE11_ASSETS,
  STAGE11_DEFINITION,
  STAGE11_EVENT_PROGRAM,
  STAGE11_MUSIC_PROGRAMS,
  STAGE11_SEMANTIC_REINFORCEMENTS,
  STAGE11_SEMANTIC_ALLIED_UNITS,
  STAGE11_SEMANTIC_ENEMY_UNITS,
  STAGE11_SOURCES,
  STAGE11_STORY_PAGES,
  STAGE11_TERRAIN_TOKENS,
  activateStage11Content,
} from "../../src/game/content/stage11";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 11 generated content", () => {
  it("defines the fixed evacuation and displays the machine objective", () => {
    activateStage11Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-11"]).toBe(STAGE11_DEFINITION);
    expect(STAGE11_DEFINITION).toMatchObject({
      id: "stage-11",
      nativeStage: 11,
      name: "拯救蘇蘭達",
      viewport: { initialOrigin: { x: 21, y: 32 } },
      objective: {
        victory: {
          type: "unit-in-cell-range",
          side: 1,
          slot: 8,
          width: 50,
          minimum: 0,
          maximum: 279,
        },
        defeat: { type: "unit-removed", side: 1, slot: 8 },
        victoryText: "護送「蘇蘭達」登上飛船",
        defeatText: "「蘇蘭達」戰敗",
      },
      deployment: { kind: "fixed" },
    });
    expect(STAGE11_EVENT_PROGRAM).toEqual({
      openingStoryRecords: [24, 25, 26],
      departure: { cell: 126, side: 1, slot: 9, timing: "after-opening-story" },
      victoryStoryRecord: 27,
      completedRoute: { module: 25, stage: 10, replayPresentation: false },
      stableRemakeDecision: "REMAKE-041",
    });
  });

  it("keeps the original nine allies, initial enemy, coordinates, classes, and behaviors", () => {
    expect(STAGE11_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE11_SEMANTIC_ALLIED_UNITS).toHaveLength(9);
    expect(STAGE11_SEMANTIC_ENEMY_UNITS).toEqual([
      expect.objectContaining({
        slot: 21,
        classId: "pegasus-warrior",
        position: { x: 36, y: 48 },
        aiBehavior: 0,
      }),
    ]);
    expect(STAGE11_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 9)).toMatchObject({
      name: "多莉", portrait: 13, position: { x: 26, y: 2 }, aiBehavior: 0,
    });
    expect(STAGE11_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 8)).toMatchObject({
      name: "蘇蘭達", portrait: 10, position: { x: 26, y: 35 }, aiBehavior: 0,
    });
    expect(STAGE11_SEMANTIC_ALLIED_UNITS.filter(({ portrait }) => portrait === undefined)
      .map(({ slot }) => slot)).toEqual([42, 41, 40]);
  });

  it("generates the native once-per-round reinforcement scan and reusable slot roster", () => {
    expect(STAGE11_SEMANTIC_REINFORCEMENTS).toMatchObject({
      timing: "before-side-2-ai",
      frequency: "once-per-round",
      firstRound: 1,
      spawnStart: { cell: 2432, x: 32, y: 48 },
      spawnScanDirection: -1,
      slotReuseAfterRemoval: true,
      simultaneousLimit: 40,
      lifetimeLimit: null,
      immediateActivation: true,
      prngCalls: 0,
    });
    expect(STAGE11_SEMANTIC_REINFORCEMENTS.candidates).toHaveLength(40);
    expect(STAGE11_SEMANTIC_REINFORCEMENTS.candidates.slice(0, 7)
      .map(({ slot, classId, aiBehavior }) => [slot, classId, aiBehavior])).toEqual([
      [40, "cavalry", 0],
      [41, "pegasus-warrior", 0],
      [42, "cavalry", 0],
      [43, "pegasus-warrior", 0],
      [44, "cavalry", 2],
      [45, "half-dragon-warrior", 2],
      [46, "soldier", 0],
    ]);
    expect(STAGE11_SEMANTIC_REINFORCEMENTS.candidates.at(-1)).toMatchObject({
      slot: 79,
      classId: "soldier",
      aiBehavior: 0,
    });
  });

  it("combines SAY 24–26 before Dori leaves and registers SAY 27 plus native music", () => {
    activateStage11Content();
    const opening = STAGE11_STORY_PAGES["stage-11-opening-story"];
    expect(opening).toHaveLength(13);
    expect(opening.map(({ source }) => source.record)).toEqual([
      24, 24, 24, 24,
      25, 25, 25, 25, 25, 25, 25,
      26, 26,
    ]);
    expect(opening[0]?.upper).toMatchObject({
      speaker: "蘇蘭達",
      text: "「夥伴們，再加點油！\n    妮雅她們馬上就來了！」",
    });
    expect(STAGE11_STORY_PAGES["stage-11-victory-story"]).toHaveLength(3);
    expect(storyPagesForId("stage-11-opening-story")).toBe(opening);
    expect(STAGE11_MUSIC_PROGRAMS["stage-11-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE11_MUSIC_PROGRAMS["stage-11-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-11-player-phase-music"))
      .toBe(STAGE11_MUSIC_PROGRAMS["stage-11-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE11_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE11_ASSETS.map,
      STAGE11_ASSETS.minimap,
      ...Object.values(STAGE11_ASSETS.unitSprites),
      ...Object.values(STAGE11_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
