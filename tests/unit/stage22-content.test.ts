import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage22Content,
  STAGE22_ASSETS,
  STAGE22_DEFINITION,
  STAGE22_EVENT_PROGRAM,
  STAGE22_MUSIC_PROGRAMS,
  STAGE22_SEMANTIC_ALLIED_UNITS,
  STAGE22_SEMANTIC_ENEMIES,
  STAGE22_SOURCES,
  STAGE22_STORY_PAGES,
  STAGE22_TERRAIN_TOKENS,
} from "../../src/game/content/stage22";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 22 generated content", () => {
  it("defines the native deployment, Dragon target, and six-enemy round-one ambush", () => {
    expect(STAGE22_DEFINITION).toMatchObject({
      id: "stage-22",
      nativeStage: 22,
      name: "焦土森林村莊中",
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 28 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗妖龍",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 23, y: 34 } }],
        maximumUnits: 19,
        openCells: expect.arrayContaining([{ x: 22, y: 31 }, { x: 24, y: 37 }]),
      },
    });
    expect(STAGE22_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE22_SEMANTIC_ALLIED_UNITS).toHaveLength(28);
    expect(STAGE22_SEMANTIC_ALLIED_UNITS.filter(({ slot }) => slot >= 25)).toEqual(
      expect.arrayContaining([25, 26, 27, 28, 29, 30, 31].map((slot) =>
        expect.objectContaining({ slot, initialClassId: "half-dragon-warrior" }))),
    );
    expect(STAGE22_SEMANTIC_ENEMIES).toEqual([
      expect.objectContaining({ slot: 2, classId: "magic-priest", name: "葛蒂拉斯", portrait: 0, position: { x: 23, y: 39 } }),
      expect.objectContaining({ slot: 28, classId: "dragon", name: "妖龍", portrait: 66, position: { x: 22, y: 24 } }),
      expect.objectContaining({ slot: 40, classId: "magic-priest", name: "魔祭師", portrait: 49, position: { x: 39, y: 32 } }),
      expect.objectContaining({ slot: 41, classId: "magic-priest", name: "魔祭師", portrait: 49, position: { x: 39, y: 34 } }),
      expect.objectContaining({ slot: 42, classId: "magic-priest", name: "魔祭師", portrait: 49, position: { x: 24, y: 40 } }),
      expect.objectContaining({ slot: 43, classId: "magic-priest", name: "魔祭師", portrait: 49, position: { x: 22, y: 40 } }),
    ]);
    expect(STAGE22_EVENT_PROGRAM).toMatchObject({
      roundOneStoryRecords: [76, 77, 78, 79],
      focusPortraitRecord: 46,
      reinforcementAudit: {
        kind: "round-1-six-enemy-ambush",
        initialSide2: 0,
        temporarySide1Slots: [23, 7],
        spawnedSide2Slots: [2, 28, 40, 41, 42, 43],
        victoryTargetSlot: 28,
        laterReinforcements: false,
      },
      completedRoute: { module: 25, stage: 23, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-056"],
    });
    expect(STAGE22_EVENT_PROGRAM.reinforcementAudit.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers all 35 dialogue checkpoints and the exact board-write choreography", () => {
    activateStage22Content();
    expect(Object.fromEntries(Object.entries(STAGE22_STORY_PAGES).map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-22-search-story": 1,
      "stage-22-reunion-story": 19,
      "stage-22-betrayal-story": 11,
      "stage-22-dragon-story": 4,
    });
    expect(stageSimulationEffectFor("stage-22-empress-arrival")).toMatchObject({
      type: "story-reinforcements",
      revealTiming: "native-before-write-deferred-refresh",
      actionSpent: false,
      focusPortrait: 46,
      focusPortraitTiming: "before-write",
      actors: [{ id: "1:23", position: { x: 32, y: 29 }, forcedClassId: "empress" }],
    });
    expect(stageSimulationEffectFor("stage-22-kins-arrival")).toMatchObject({
      type: "story-reinforcements",
      revealTiming: "native-before-write-deferred-refresh",
      actors: [{
        id: "1:7",
        position: { x: 32, y: 29 },
        focusPosition: { x: 33, y: 29 },
        forcedClassId: "magic-priest",
      }],
    });
    expect(stageSimulationEffectFor("stage-22-ambush-arrivals")).toMatchObject({
      type: "story-reinforcements",
      revealTiming: "deferred-refresh",
      actionSpent: false,
      actors: [{ id: "2:40" }, { id: "2:41" }, { id: "2:42" }, { id: "2:43" }],
    });
    expect(stageSimulationEffectFor("stage-22-player-ready")).toEqual({
      type: "enter-player-phase",
      statusText: "我方回合：打敗妖龍，保護妮雅。",
    });
  });

  it("registers the native phase music", () => {
    activateStage22Content();
    expect(STAGE22_MUSIC_PROGRAMS["stage-22-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/35", loopTrack: "MUSIC/34" });
    expect(STAGE22_MUSIC_PROGRAMS["stage-22-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-22-player-phase-music"))
      .toBe(STAGE22_MUSIC_PROGRAMS["stage-22-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE22_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE22_ASSETS.map,
      STAGE22_ASSETS.minimap,
      ...Object.values(STAGE22_ASSETS.unitSprites),
      ...Object.values(STAGE22_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
