import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE10_ASSETS,
  STAGE10_DEFINITION,
  STAGE10_EVENT_PROGRAM,
  STAGE10_MUSIC_PROGRAMS,
  STAGE10_SEMANTIC_ALLIED_UNITS,
  STAGE10_SEMANTIC_ENEMY_UNITS,
  STAGE10_SOURCES,
  STAGE10_STORY_PAGES,
  STAGE10_TERRAIN_TOKENS,
  activateStage10Content,
} from "../../src/game/content/stage10";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 10 generated content", () => {
  it("defines the native airship deployment and corrected elimination objective", () => {
    activateStage10Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-10"]).toBe(STAGE10_DEFINITION);
    expect(STAGE10_DEFINITION).toMatchObject({
      id: "stage-10",
      nativeStage: 10,
      name: "飛船上遭遇敵人",
      viewport: { initialOrigin: { x: 22, y: 21 } },
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊退全部追兵",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 27, y: 29 } }],
        maximumUnits: 13,
        openCells: expect.arrayContaining([{ x: 25, y: 22 }, { x: 28, y: 24 }]),
      },
    });
    expect(STAGE10_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 28,
      enemyReinforcements: {
        kind: "none",
        auditedSources: ["initial-template", "round-event-handler", "full-round-special-chain"],
      },
      completedRoute: { module: 25, stage: 12, replayPresentation: false },
      stableRemakeDecision: "REMAKE-042",
    });
  });

  it("keeps twenty eligible allies and all five native pursuers", () => {
    expect(STAGE10_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE10_SEMANTIC_ALLIED_UNITS).toHaveLength(20);
    expect(STAGE10_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 0))
      .toMatchObject({ name: "妮雅", portrait: 46, aiBehavior: 0 });
    expect(STAGE10_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 8))
      .toMatchObject({ name: "蘇蘭達", portrait: 10, aiBehavior: 0 });
    expect(STAGE10_SEMANTIC_ENEMY_UNITS).toEqual([
      expect.objectContaining({ slot: 43, classId: "pegasus-warrior", position: { x: 22, y: 13 } }),
      expect.objectContaining({ slot: 42, classId: "half-dragon-warrior", position: { x: 24, y: 13 } }),
      expect.objectContaining({ slot: 20, classId: "half-dragon-warrior", name: "克諾絲", portrait: 4, position: { x: 26, y: 13 } }),
      expect.objectContaining({ slot: 40, classId: "pegasus-warrior", position: { x: 28, y: 13 } }),
      expect.objectContaining({ slot: 41, classId: "pegasus-warrior", position: { x: 30, y: 13 } }),
    ]);
  });

  it("registers the 15-page SAY/28 story, BK/10, and original music", () => {
    activateStage10Content();
    const story = STAGE10_STORY_PAGES["stage-10-prebattle-story"];
    expect(story).toHaveLength(15);
    expect(story.every(({ source }) => source.backgroundId === 10)).toBe(true);
    expect(story[0]?.lower).toMatchObject({ speaker: "希蜜" });
    expect(story.at(-1)).toMatchObject({ upper: { speaker: "多莉" } });
    expect(storyPagesForId("stage-10-prebattle-story")).toBe(story);
    expect(STAGE10_MUSIC_PROGRAMS["stage-10-story-music"])
      .toMatchObject({ track: "MAGIC/74" });
    expect(STAGE10_MUSIC_PROGRAMS["stage-10-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE10_MUSIC_PROGRAMS["stage-10-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/37", loopTrack: "MUSIC/36" });
    expect(musicProgramFor("stage-10-story-music"))
      .toBe(STAGE10_MUSIC_PROGRAMS["stage-10-story-music"]);
  });

  it("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE10_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE10_ASSETS.map,
      STAGE10_ASSETS.minimap,
      ...Object.values(STAGE10_ASSETS.storyBackgrounds),
      ...Object.values(STAGE10_ASSETS.unitSprites),
      ...Object.values(STAGE10_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
