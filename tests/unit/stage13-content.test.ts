import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE13_ASSETS,
  STAGE13_DEFINITION,
  STAGE13_EVENT_PROGRAM,
  STAGE13_MUSIC_PROGRAMS,
  STAGE13_SEMANTIC_ALLIED_UNITS,
  STAGE13_SEMANTIC_ENEMY_UNITS,
  STAGE13_SOURCES,
  STAGE13_STORY_PAGES,
  STAGE13_TERRAIN_TOKENS,
  activateStage13Content,
} from "../../src/game/content/stage13";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 13 generated content", () => {
  it("defines Dragon Tower Outside deployment and the machine-proven Marsiel objective", () => {
    activateStage13Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-13"]).toBe(STAGE13_DEFINITION);
    expect(STAGE13_DEFINITION).toMatchObject({
      id: "stage-13",
      nativeStage: 13,
      name: "龍塔外",
      viewport: { initialOrigin: { x: 32, y: 34 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 24 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗「瑪西爾」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 36, y: 37 } }],
        maximumUnits: 12,
        openCells: expect.arrayContaining([{ x: 34, y: 34 }, { x: 35, y: 37 }]),
      },
    });
    expect(STAGE13_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 32,
      enemyReinforcements: {
        kind: "none",
        auditedSources: [
          "initial-template", "round-event-handler", "dynamic-board-catalog",
          "full-round-special-chain",
        ],
      },
      completedRoute: { module: 27, stage: 14, replayPresentation: false },
      stableRemakeDecision: "REMAKE-046",
    });
  });

  it("keeps twenty-two eligible allies, two native water-warrior entrants, and nine opening enemies", () => {
    expect(STAGE13_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE13_SEMANTIC_ALLIED_UNITS).toHaveLength(22);
    expect(STAGE13_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 10))
      .toMatchObject({ name: "瑪琳", portrait: 26, initialClassId: "water-warrior", aiBehavior: 0 });
    expect(STAGE13_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 11))
      .toMatchObject({ name: "摩莉娜", portrait: 27, initialClassId: "water-warrior", aiBehavior: 0 });
    expect(STAGE13_SEMANTIC_ENEMY_UNITS).toHaveLength(9);
    expect(STAGE13_SEMANTIC_ENEMY_UNITS[0]).toMatchObject({
      slot: 24,
      classId: "divine-sword-warrior",
      name: "瑪西爾",
      portrait: 31,
      position: { x: 19, y: 17 },
    });
    expect(STAGE13_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId)).toEqual([
      "divine-sword-warrior", "pegasus-warrior", "land-knight", "magician",
      "magic-guide", "steel-armor-warrior", "cavalry", "archer", "monk",
    ]);
    expect(STAGE13_SEMANTIC_ENEMY_UNITS.slice(1)
      .every((unit) => !("portrait" in unit))).toBe(true);
  });

  it("registers SAY/32, BK/15, and the original stage music", () => {
    activateStage13Content();
    const prebattle = STAGE13_STORY_PAGES["stage-13-prebattle-story"];
    expect(prebattle).toHaveLength(10);
    expect(prebattle.every(({ source }) => source.backgroundId === 15)).toBe(true);
    expect(prebattle[1]).toMatchObject({ upper: { speaker: "多莉", text: expect.stringContaining("龍塔") } });
    expect(prebattle.at(-1)).toMatchObject({ lower: { speaker: "妮雅", text: expect.stringContaining("能力較強") } });
    expect(storyPagesForId("stage-13-prebattle-story")).toBe(prebattle);
    expect(STAGE13_MUSIC_PROGRAMS["stage-13-story-music"]).toMatchObject({ track: "MAGIC/77" });
    expect(STAGE13_MUSIC_PROGRAMS["stage-13-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE13_MUSIC_PROGRAMS["stage-13-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(musicProgramFor("stage-13-story-music"))
      .toBe(STAGE13_MUSIC_PROGRAMS["stage-13-story-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE13_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE13_ASSETS.map,
      STAGE13_ASSETS.minimap,
      ...Object.values(STAGE13_ASSETS.storyBackgrounds),
      ...Object.values(STAGE13_ASSETS.unitSprites),
      ...Object.values(STAGE13_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
