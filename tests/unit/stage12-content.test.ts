import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE12_ASSETS,
  STAGE12_DEFINITION,
  STAGE12_EVENT_PROGRAM,
  STAGE12_MUSIC_PROGRAMS,
  STAGE12_SEMANTIC_ALLIED_UNITS,
  STAGE12_SEMANTIC_ENEMY_UNITS,
  STAGE12_SOURCES,
  STAGE12_STORY_PAGES,
  STAGE12_TERRAIN_TOKENS,
  activateStage12Content,
} from "../../src/game/content/stage12";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 12 generated content", () => {
  it("defines the native swamp deployment and corrected elimination objective", () => {
    activateStage12Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-12"]).toBe(STAGE12_DEFINITION);
    expect(STAGE12_DEFINITION).toMatchObject({
      id: "stage-12",
      nativeStage: 12,
      name: "落入沼澤",
      viewport: { initialOrigin: { x: 19, y: 17 } },
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊退全部水戰士",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 23, y: 20 } }],
        maximumUnits: 9,
        openCells: expect.arrayContaining([{ x: 22, y: 18 }, { x: 24, y: 22 }]),
      },
    });
    expect(STAGE12_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 29,
      openingStoryRecord: 30,
      victoryStoryRecord: 31,
      enemyReinforcements: {
        kind: "none",
        auditedSources: [
          "initial-template", "round-event-handler", "dynamic-board-catalog",
          "full-round-special-chain",
        ],
      },
      dynamicInstances: {
        kind: "water-warrior-split",
        rootSlots: [40, 41, 42, 44, 43],
        maximumBodiesPerRoot: 4,
        sharedLife: true,
        stageReinforcement: false,
      },
      completedRoute: { module: 25, stage: 13, replayPresentation: false },
      stableRemakeDecision: "REMAKE-043",
    });
  });

  it("keeps twenty eligible allies and five water-warrior roots", () => {
    expect(STAGE12_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE12_SEMANTIC_ALLIED_UNITS).toHaveLength(20);
    expect(STAGE12_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 0))
      .toMatchObject({ name: "妮雅", portrait: 46, aiBehavior: 0 });
    expect(STAGE12_SEMANTIC_ENEMY_UNITS).toEqual([
      expect.objectContaining({ slot: 40, classId: "water-warrior", position: { x: 39, y: 17 } }),
      expect.objectContaining({ slot: 41, classId: "water-warrior", position: { x: 39, y: 20 } }),
      expect.objectContaining({ slot: 42, classId: "water-warrior", position: { x: 39, y: 23 } }),
      expect.objectContaining({ slot: 44, classId: "water-warrior", position: { x: 39, y: 26 } }),
      expect.objectContaining({ slot: 43, classId: "water-warrior", position: { x: 39, y: 28 } }),
    ]);
  });

  it("registers SAY/29-31, BK/10-14, and original music", () => {
    activateStage12Content();
    const prebattle = STAGE12_STORY_PAGES["stage-12-prebattle-story"];
    const opening = STAGE12_STORY_PAGES["stage-12-opening-story"];
    const victory = STAGE12_STORY_PAGES["stage-12-victory-story"];
    expect([prebattle.length, opening.length, victory.length]).toEqual([11, 6, 6]);
    expect([...new Set(prebattle.map(({ source }) => source.backgroundId))]).toEqual([10, 11, 12, 13]);
    expect(opening.every(({ source }) => source.backgroundId === 14)).toBe(true);
    expect(prebattle[0]?.lower).toMatchObject({ speaker: "希蜜" });
    expect(opening.at(-1)).toMatchObject({ lower: { text: expect.stringContaining("水戰士") } });
    expect(victory.at(-1)).toMatchObject({ lower: { speaker: "葛蒂拉斯" } });
    expect(storyPagesForId("stage-12-opening-story")).toBe(opening);
    expect(STAGE12_MUSIC_PROGRAMS["stage-12-story-music"]).toMatchObject({ track: "MAGIC/76" });
    expect(STAGE12_MUSIC_PROGRAMS["stage-12-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/9", loopTrack: "MUSIC/8" });
    expect(STAGE12_MUSIC_PROGRAMS["stage-12-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/25", loopTrack: "MUSIC/24" });
    expect(musicProgramFor("stage-12-story-music"))
      .toBe(STAGE12_MUSIC_PROGRAMS["stage-12-story-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE12_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE12_ASSETS.map,
      STAGE12_ASSETS.minimap,
      ...Object.values(STAGE12_ASSETS.storyBackgrounds),
      ...Object.values(STAGE12_ASSETS.unitSprites),
      ...Object.values(STAGE12_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
