import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE17_ASSETS,
  STAGE17_DEFINITION,
  STAGE17_EVENT_PROGRAM,
  STAGE17_MUSIC_PROGRAMS,
  STAGE17_SEMANTIC_ALLIED_UNITS,
  STAGE17_SEMANTIC_ENEMY_UNITS,
  STAGE17_SOURCES,
  STAGE17_STORY_PAGES,
  STAGE17_TERRAIN_TOKENS,
  activateStage17Content,
} from "../../src/game/content/stage17";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 17 generated content", () => {
  it("defines Dragon Tower Floor Four deployment and the machine-proven Qian objective", () => {
    activateStage17Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-17"]).toBe(STAGE17_DEFINITION);
    expect(STAGE17_DEFINITION).toMatchObject({
      id: "stage-17",
      nativeStage: 17,
      name: "龍塔第四層",
      viewport: { initialOrigin: { x: 21, y: 21 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 11 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「倩」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 24 } }],
        maximumUnits: 10,
        openCells: expect.arrayContaining([{ x: 23, y: 23 }, { x: 26, y: 26 }]),
      },
    });
    expect(STAGE17_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 36,
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
      completedRoute: { module: 27, stage: 18, replayPresentation: false },
      stableRemakeDecision: "REMAKE-051",
    });
  });

  it("keeps twenty-two eligible allies and exactly twelve opening guards", () => {
    expect(STAGE17_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE17_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE17_SEMANTIC_ENEMY_UNITS).toHaveLength(12);
    expect(STAGE17_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 11)).toMatchObject({
      slot: 11,
      classId: "half-dragon-warrior",
      name: "倩",
      portrait: 37,
      position: { x: 25, y: 12 },
      aiBehavior: 1,
    });
    expect(STAGE17_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "half-dragon-warrior", "magician", "monk", "divine-sword-warrior",
      "great-axe-warrior", "great-axe-warrior", "divine-sword-warrior", "priest",
      "steel-armor-warrior", "steel-armor-warrior", "steel-armor-warrior",
      "steel-armor-warrior",
    ]);
    // The four southern steel armor warriors are the only native behavior-0 guards on this map.
    expect(STAGE17_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 0)
      .map(({ slot, position }) => ({ slot, position }))).toEqual([
      { slot: 51, position: { x: 25, y: 32 } },
      { slot: 52, position: { x: 23, y: 34 } },
      { slot: 54, position: { x: 25, y: 34 } },
      { slot: 53, position: { x: 27, y: 34 } },
    ]);
    expect(STAGE17_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 11)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers the three SAY/36 battle-map checkpoints and original phase music", () => {
    activateStage17Content();
    const opening = STAGE17_STORY_PAGES["stage-17-opening-story"];
    expect(opening).toHaveLength(3);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening.every(({ upper }) => upper?.speaker === "倩")).toBe(true);
    expect(opening[0]).toMatchObject({ upper: { text: expect.stringContaining("她們幾個人真是沒用") } });
    expect(opening[1]).toMatchObject({ upper: { text: expect.stringContaining("別想從我這裡過去") } });
    // The native script appends the closing line to the same window instead of reopening it.
    expect(opening[2]).toMatchObject({
      revealStart: opening[1].upper?.text.length,
      upper: { text: expect.stringContaining("納命來吧") },
    });
    expect(storyPagesForId("stage-17-opening-story")).toBe(opening);
    expect(STAGE17_MUSIC_PROGRAMS["stage-17-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/7", loopTrack: "MUSIC/6" });
    expect(STAGE17_MUSIC_PROGRAMS["stage-17-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/21", loopTrack: "MUSIC/20" });
    expect(musicProgramFor("stage-17-player-phase-music"))
      .toBe(STAGE17_MUSIC_PROGRAMS["stage-17-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE17_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE17_ASSETS.map,
      STAGE17_ASSETS.minimap,
      ...Object.values(STAGE17_ASSETS.unitSprites),
      ...Object.values(STAGE17_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
