import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE14_ASSETS,
  STAGE14_DEFINITION,
  STAGE14_EVENT_PROGRAM,
  STAGE14_MUSIC_PROGRAMS,
  STAGE14_SEMANTIC_ALLIED_UNITS,
  STAGE14_SEMANTIC_ENEMY_UNITS,
  STAGE14_SOURCES,
  STAGE14_STORY_PAGES,
  STAGE14_TERRAIN_TOKENS,
  activateStage14Content,
} from "../../src/game/content/stage14";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 14 generated content", () => {
  it("defines Dragon Tower Floor One deployment and the machine-proven Fang objective", () => {
    activateStage14Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-14"]).toBe(STAGE14_DEFINITION);
    expect(STAGE14_DEFINITION).toMatchObject({
      id: "stage-14",
      nativeStage: 14,
      name: "龍塔第一層",
      viewport: { initialOrigin: { x: 21, y: 28 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 8 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「芳」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
        maximumUnits: 10,
        openCells: expect.arrayContaining([{ x: 23, y: 29 }, { x: 27, y: 31 }]),
      },
    });
    expect(STAGE14_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 33,
      nativeDelayedAiReset: {
        firstRound: 6,
        repeatsEveryActiveRound: true,
        operation: "fillSide2PerSlotAiBehavior",
        slots: 75,
        value: 0,
        stableRemakeEffect: "none-shared-expert-ai-already-active",
      },
      enemyReinforcements: {
        kind: "none",
        auditedSources: [
          "initial-template", "round-event-handler", "dynamic-board-catalog",
          "full-round-special-chain", "defeat-replacement-and-form-chain",
        ],
      },
      completedRoute: { module: 27, stage: 15, replayPresentation: false },
      stableRemakeDecision: "REMAKE-047",
    });
  });

  it("keeps twenty-two eligible allies and exactly seven opening guards", () => {
    expect(STAGE14_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE14_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE14_SEMANTIC_ENEMY_UNITS).toHaveLength(7);
    expect(STAGE14_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 8)).toMatchObject({
      slot: 8,
      classId: "half-dragon-warrior",
      name: "芳",
      portrait: 34,
      position: { x: 25, y: 12 },
      aiBehavior: 1,
    });
    expect(STAGE14_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "magic-guide", "half-dragon-warrior", "divine-sword-warrior",
      "magic-guide", "land-knight", "divine-sword-warrior", "pegasus-warrior",
    ]);
    expect(STAGE14_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 8)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers the five SAY/33 battle-map checkpoints and original phase music", () => {
    activateStage14Content();
    const opening = STAGE14_STORY_PAGES["stage-14-opening-story"];
    expect(opening).toHaveLength(5);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening[0]).toMatchObject({ upper: { speaker: "芳", text: expect.stringContaining("私闖龍塔") } });
    expect(opening[2]).toMatchObject({ upper: { speaker: "妮雅", text: expect.stringContaining("目標塔頂") } });
    expect(opening.at(-1)).toMatchObject({ lower: { speaker: "芳", text: expect.stringContaining("擋住她們") } });
    expect(storyPagesForId("stage-14-opening-story")).toBe(opening);
    expect(STAGE14_MUSIC_PROGRAMS["stage-14-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE14_MUSIC_PROGRAMS["stage-14-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/23", loopTrack: "MUSIC/22" });
    expect(musicProgramFor("stage-14-player-phase-music"))
      .toBe(STAGE14_MUSIC_PROGRAMS["stage-14-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE14_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE14_ASSETS.map,
      STAGE14_ASSETS.minimap,
      ...Object.values(STAGE14_ASSETS.unitSprites),
      ...Object.values(STAGE14_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
