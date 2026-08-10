import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE15_ASSETS,
  STAGE15_DEFINITION,
  STAGE15_EVENT_PROGRAM,
  STAGE15_MUSIC_PROGRAMS,
  STAGE15_SEMANTIC_ALLIED_UNITS,
  STAGE15_SEMANTIC_ENEMY_UNITS,
  STAGE15_SOURCES,
  STAGE15_STORY_PAGES,
  STAGE15_TERRAIN_TOKENS,
  activateStage15Content,
} from "../../src/game/content/stage15";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 15 generated content", () => {
  it("defines Dragon Tower Floor Two deployment and the machine-proven Lan objective", () => {
    activateStage15Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-15"]).toBe(STAGE15_DEFINITION);
    expect(STAGE15_DEFINITION).toMatchObject({
      id: "stage-15",
      nativeStage: 15,
      name: "龍塔第二層",
      viewport: { initialOrigin: { x: 21, y: 28 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 9 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「蘭」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
        maximumUnits: 10,
        openCells: expect.arrayContaining([{ x: 23, y: 29 }, { x: 27, y: 31 }]),
      },
    });
    expect(STAGE15_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 34,
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
      completedRoute: { module: 27, stage: 16, replayPresentation: false },
      stableRemakeDecision: "REMAKE-048",
    });
  });

  it("keeps twenty-two eligible allies and exactly ten opening guards", () => {
    expect(STAGE15_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE15_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE15_SEMANTIC_ENEMY_UNITS).toHaveLength(10);
    expect(STAGE15_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 9)).toMatchObject({
      slot: 9,
      classId: "half-dragon-warrior",
      name: "蘭",
      portrait: 35,
      position: { x: 25, y: 23 },
      aiBehavior: 1,
    });
    expect(STAGE15_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "great-axe-warrior", "great-axe-warrior", "pegasus-warrior", "magician",
      "half-dragon-warrior", "pegasus-warrior", "archer", "steel-armor-warrior",
      "steel-armor-warrior", "archer",
    ]);
    expect(STAGE15_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 9)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers the five SAY/34 battle-map checkpoints and original phase music", () => {
    activateStage15Content();
    const opening = STAGE15_STORY_PAGES["stage-15-opening-story"];
    expect(opening).toHaveLength(5);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening[0]).toMatchObject({ upper: { speaker: "蘭", text: expect.stringContaining("妳們是誰") } });
    expect(opening[2]).toMatchObject({ lower: { speaker: "妮雅", text: expect.stringContaining("通融一下") } });
    expect(opening.at(-1)).toMatchObject({ lower: { speaker: "蘇蘭達", text: expect.stringContaining("只好得罪") } });
    expect(storyPagesForId("stage-15-opening-story")).toBe(opening);
    expect(STAGE15_MUSIC_PROGRAMS["stage-15-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/19", loopTrack: "MUSIC/18" });
    expect(STAGE15_MUSIC_PROGRAMS["stage-15-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/21", loopTrack: "MUSIC/20" });
    expect(musicProgramFor("stage-15-player-phase-music"))
      .toBe(STAGE15_MUSIC_PROGRAMS["stage-15-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE15_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE15_ASSETS.map,
      STAGE15_ASSETS.minimap,
      ...Object.values(STAGE15_ASSETS.unitSprites),
      ...Object.values(STAGE15_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
