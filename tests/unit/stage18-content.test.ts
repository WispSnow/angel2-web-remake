import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE18_ASSETS,
  STAGE18_DEFINITION,
  STAGE18_EVENT_PROGRAM,
  STAGE18_MUSIC_PROGRAMS,
  STAGE18_SEMANTIC_ALLIED_UNITS,
  STAGE18_SEMANTIC_ENEMY_UNITS,
  STAGE18_SOURCES,
  STAGE18_STORY_PAGES,
  STAGE18_TERRAIN_TOKENS,
  activateStage18Content,
} from "../../src/game/content/stage18";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 18 generated content", () => {
  it("defines Dragon Tower Floor Five deployment and the machine-proven Li objective", () => {
    activateStage18Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-18"]).toBe(STAGE18_DEFINITION);
    expect(STAGE18_DEFINITION).toMatchObject({
      id: "stage-18",
      nativeStage: 18,
      name: "龍塔第五層",
      viewport: { initialOrigin: { x: 20, y: 27 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 12 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「麗」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 33 } }],
        maximumUnits: 8,
        openCells: expect.arrayContaining([{ x: 23, y: 32 }, { x: 28, y: 33 }]),
      },
    });
    expect(STAGE18_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 37,
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
      completedRoute: { module: 27, stage: 19, replayPresentation: false },
      stableRemakeDecision: "REMAKE-051",
    });
  });

  it("keeps twenty-two eligible allies and exactly sixteen opening guards", () => {
    expect(STAGE18_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE18_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE18_SEMANTIC_ENEMY_UNITS).toHaveLength(16);
    expect(STAGE18_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 12)).toMatchObject({
      slot: 12,
      classId: "half-dragon-warrior",
      name: "麗",
      portrait: 38,
      position: { x: 25, y: 24 },
      aiBehavior: 1,
    });
    expect(STAGE18_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "monk", "half-dragon-warrior", "archer", "magic-archer", "archer", "archer",
      "crossbow", "archer", "steel-armor-warrior", "steel-armor-warrior",
      "divine-sword-warrior", "divine-sword-warrior", "divine-sword-warrior",
      "divine-sword-warrior", "divine-sword-warrior", "divine-sword-warrior",
    ]);
    expect(STAGE18_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 1)).toHaveLength(10);
    expect(STAGE18_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 0)
      .map(({ slot }) => slot)).toEqual([46, 47, 48, 51, 52, 53]);
    expect(STAGE18_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 12)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers the three SAY/37 battle-map checkpoints and original phase music", () => {
    activateStage18Content();
    const opening = STAGE18_STORY_PAGES["stage-18-opening-story"];
    expect(opening).toHaveLength(3);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening[0]).toMatchObject({
      upper: { speaker: "麗", portrait: 38, text: expect.stringContaining("神聖的龍塔") },
    });
    expect(opening[1]).toMatchObject({
      lower: { speaker: "妮雅", portrait: 46, text: expect.stringContaining("女帝和琴斯") },
    });
    expect(opening[2]).toMatchObject({
      upper: { speaker: "麗", text: expect.stringContaining("先打倒我") },
    });
    expect(storyPagesForId("stage-18-opening-story")).toBe(opening);
    expect(STAGE18_MUSIC_PROGRAMS["stage-18-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/35", loopTrack: "MUSIC/34" });
    expect(STAGE18_MUSIC_PROGRAMS["stage-18-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/23", loopTrack: "MUSIC/22" });
    expect(musicProgramFor("stage-18-player-phase-music"))
      .toBe(STAGE18_MUSIC_PROGRAMS["stage-18-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE18_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE18_ASSETS.map,
      STAGE18_ASSETS.minimap,
      ...Object.values(STAGE18_ASSETS.unitSprites),
      ...Object.values(STAGE18_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
