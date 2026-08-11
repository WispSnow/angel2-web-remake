import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE19_ASSETS,
  STAGE19_DEFINITION,
  STAGE19_EVENT_PROGRAM,
  STAGE19_MUSIC_PROGRAMS,
  STAGE19_SEMANTIC_ALLIED_UNITS,
  STAGE19_SEMANTIC_ENEMY_UNITS,
  STAGE19_SOURCES,
  STAGE19_STORY_PAGES,
  STAGE19_TERRAIN_TOKENS,
  activateStage19Content,
} from "../../src/game/content/stage19";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 19 generated content", () => {
  it("defines Dragon Tower Floor Six deployment and the machine-proven Ai objective", () => {
    activateStage19Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-19"]).toBe(STAGE19_DEFINITION);
    expect(STAGE19_DEFINITION).toMatchObject({
      id: "stage-19",
      nativeStage: 19,
      name: "龍塔第六層",
      viewport: { initialOrigin: { x: 21, y: 28 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 13 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「愛」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 33 } }],
        maximumUnits: 10,
        openCells: expect.arrayContaining([{ x: 23, y: 32 }, { x: 27, y: 34 }]),
      },
    });
    expect(STAGE19_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 38,
      nativeDelayedAiReset: {
        firstRound: 6,
        repeatsEveryActiveRound: true,
        operation: "fillSide2PerSlotAiBehavior",
        slots: 75,
        value: 0,
        stableRemakeEffect: "release-native-sentries-to-shared-expert-pursuit",
      },
      enemyReinforcements: {
        kind: "none",
        auditedSources: [
          "initial-template", "round-event-handler", "dynamic-board-catalog",
          "full-round-special-chain", "defeat-replacement-and-form-chain",
        ],
      },
      completedRoute: { module: 25, stage: 20, replayPresentation: false },
      stableRemakeDecision: "REMAKE-051",
    });
  });

  it("keeps twenty-two eligible allies and exactly twenty-one opening guards", () => {
    expect(STAGE19_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE19_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE19_SEMANTIC_ENEMY_UNITS).toHaveLength(21);
    expect(STAGE19_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 13)).toMatchObject({
      slot: 13,
      classId: "half-dragon-warrior",
      name: "愛",
      portrait: 39,
      position: { x: 25, y: 12 },
      aiBehavior: 1,
    });
    expect(STAGE19_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "warrior", "half-dragon-warrior", "warrior", "divine-sword-warrior",
      "steel-armor-warrior", "priest", "monk", "steel-armor-warrior",
      "divine-sword-warrior", "divine-sword-warrior", "steel-armor-warrior", "magician",
      "steel-armor-warrior", "divine-sword-warrior", "great-axe-warrior", "great-axe-warrior",
      "steel-armor-warrior", "steel-armor-warrior", "steel-armor-warrior", "great-axe-warrior",
      "great-axe-warrior",
    ]);
    expect(STAGE19_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 1)).toHaveLength(13);
    expect(STAGE19_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior !== 1)
      .map(({ slot }) => slot)).toEqual([52, 47, 51, 48, 55, 50, 49, 54]);
    expect(STAGE19_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 13)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers four SAY/38 checkpoints with Sulanda as the lower speaker and original music", () => {
    activateStage19Content();
    const opening = STAGE19_STORY_PAGES["stage-19-opening-story"];
    expect(opening).toHaveLength(4);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening[0]).toMatchObject({
      upper: { speaker: "愛", portrait: 39, text: expect.stringContaining("妳們來了") },
    });
    expect(opening[2]).toMatchObject({
      lower: { speaker: "蘇蘭達", portrait: 10, text: expect.stringContaining("要見龍王") },
    });
    expect(opening[3]).toMatchObject({
      upper: { speaker: "愛", text: expect.stringContaining("消滅妳們") },
      lower: { speaker: "蘇蘭達", portrait: 10 },
    });
    expect(storyPagesForId("stage-19-opening-story")).toBe(opening);
    expect(STAGE19_MUSIC_PROGRAMS["stage-19-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE19_MUSIC_PROGRAMS["stage-19-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/21", loopTrack: "MUSIC/20" });
    expect(musicProgramFor("stage-19-player-phase-music"))
      .toBe(STAGE19_MUSIC_PROGRAMS["stage-19-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE19_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE19_ASSETS.map,
      STAGE19_ASSETS.minimap,
      ...Object.values(STAGE19_ASSETS.unitSprites),
      ...Object.values(STAGE19_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
