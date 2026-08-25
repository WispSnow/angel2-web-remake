import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE16_ASSETS,
  STAGE16_DEFINITION,
  STAGE16_EVENT_PROGRAM,
  STAGE16_MUSIC_PROGRAMS,
  STAGE16_SEMANTIC_ALLIED_UNITS,
  STAGE16_SEMANTIC_ENEMY_UNITS,
  STAGE16_SOURCES,
  STAGE16_STORY_PAGES,
  STAGE16_TERRAIN_TOKENS,
  activateStage16Content,
} from "../../src/game/content/stage16";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 16 generated content", () => {
  it("defines Dragon Tower Floor Three deployment and the machine-proven Sha objective", () => {
    activateStage16Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-16"]).toBe(STAGE16_DEFINITION);
    expect(STAGE16_DEFINITION).toMatchObject({
      id: "stage-16",
      nativeStage: 16,
      name: "龍塔第三層",
      viewport: { initialOrigin: { x: 21, y: 28 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 10 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「莎」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
        maximumUnits: 10,
        openCells: expect.arrayContaining([{ x: 23, y: 29 }, { x: 27, y: 31 }]),
      },
    });
    expect(STAGE16_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 35,
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
      completedRoute: { module: 27, stage: 17, replayPresentation: false },
      stableRemakeDecision: "REMAKE-051",
    });
  });

  it("keeps twenty-two eligible allies and exactly thirteen opening guards", () => {
    expect(STAGE16_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE16_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE16_SEMANTIC_ENEMY_UNITS).toHaveLength(13);
    expect(STAGE16_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 10)).toMatchObject({
      slot: 10,
      classId: "half-dragon-warrior",
      name: "莎",
      portrait: 36,
      position: { x: 25, y: 12 },
      aiBehavior: 1,
    });
    expect(STAGE16_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "steel-armor-warrior", "archer", "half-dragon-warrior", "archer",
      "steel-armor-warrior", "steel-armor-warrior", "magician", "steel-armor-warrior",
      "steel-armor-warrior", "divine-sword-warrior", "divine-sword-warrior",
      "divine-sword-warrior", "divine-sword-warrior",
    ]);
    // The four divine sword warriors are the only native behavior-0 guards on this map.
    expect(STAGE16_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 0)
      .map(({ slot, position }) => ({ slot, position }))).toEqual([
      { slot: 43, position: { x: 15, y: 27 } },
      { slot: 42, position: { x: 18, y: 27 } },
      { slot: 41, position: { x: 32, y: 27 } },
      { slot: 40, position: { x: 35, y: 27 } },
    ]);
    expect(STAGE16_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 10)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers the four SAY/35 battle-map checkpoints and original phase music", () => {
    activateStage16Content();
    const opening = STAGE16_STORY_PAGES["stage-16-opening-story"];
    expect(opening).toHaveLength(4);
    expect(opening.every(({ source }) => !("backgroundId" in source))).toBe(true);
    expect(opening.every(({ upper }) => upper?.speaker === "莎")).toBe(true);
    expect(opening[0]).toMatchObject({ upper: { text: expect.stringContaining("闖進龍塔") } });
    expect(opening[1]).toMatchObject({ upper: { text: expect.stringContaining("無冤無仇") } });
    // The native script appends the closing line to the same window instead of reopening it.
    expect(opening[3]).toMatchObject({
      revealStart: opening[2].upper?.text.length,
      upper: { text: expect.stringContaining("討回公道") },
    });
    expect(storyPagesForId("stage-16-opening-story")).toBe(opening);
    expect(STAGE16_MUSIC_PROGRAMS["stage-16-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/39", loopTrack: "MUSIC/38" });
    expect(STAGE16_MUSIC_PROGRAMS["stage-16-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/23", loopTrack: "MUSIC/22" });
    expect(musicProgramFor("stage-16-player-phase-music"))
      .toBe(STAGE16_MUSIC_PROGRAMS["stage-16-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE16_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE16_ASSETS.map,
      STAGE16_ASSETS.minimap,
      ...Object.values(STAGE16_ASSETS.unitSprites),
      ...Object.values(STAGE16_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
