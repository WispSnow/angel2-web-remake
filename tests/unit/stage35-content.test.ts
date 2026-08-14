import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage35Content,
  STAGE35,
  STAGE35_ASSETS,
  STAGE35_DEFINITION,
  STAGE35_EVENT_PROGRAM,
  STAGE35_MUSIC_PROGRAMS,
  STAGE35_SEMANTIC_ALLIED_UNITS,
  STAGE35_SEMANTIC_ENEMY_UNITS,
  STAGE35_SOURCES,
  STAGE35_STORY_PAGES,
  STAGE35_TERRAIN_TOKENS,
} from "../../src/game/content/stage35";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 35 generated content", () => {
  it("defines the fixed nine-versus-ten time-space anomaly board", () => {
    expect(STAGE35).toMatchObject({
      id: "stage-35",
      nativeStage: 35,
      name: "時空異變",
      viewport: { initialOrigin: { x: 28, y: 7 } },
    });
    expect(STAGE35_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: { kind: "fixed" },
    });
    expect(STAGE35_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE35_SEMANTIC_ALLIED_UNITS).toHaveLength(9);
    expect(STAGE35_SEMANTIC_ALLIED_UNITS.map(({ slot }) => slot))
      .toEqual([5, 3, 0, 8, 4, 2, 1, 18, 7]);
    expect(STAGE35_SEMANTIC_ALLIED_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 0, name: "妮雅", portrait: 46, position: { x: 32, y: 10 } }),
      expect.objectContaining({ slot: 7, name: "琴斯", portrait: 14, position: { x: 32, y: 12 } }),
      expect.objectContaining({ slot: 18, name: "雷伊拉", portrait: 21, position: { x: 19, y: 12 } }),
    ]));
    expect(STAGE35_SEMANTIC_ENEMY_UNITS).toHaveLength(10);
    expect(STAGE35_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 39, classId: "land-knight", position: { x: 23, y: 8 } }),
      expect.objectContaining({ slot: 38, classId: "demon-dragon-knight", position: { x: 25, y: 9 } }),
      expect.objectContaining({ slot: 42, classId: "magician", position: { x: 22, y: 10 } }),
    ]));
    expect(STAGE35_SEMANTIC_ENEMY_UNITS.every(({ aiBehavior }) => aiBehavior === 12)).toBe(true);
  });

  it("registers SAY/0067, SAY/0068, and the frozen stage 36 route", () => {
    activateStage35Content();
    expect(Object.fromEntries(Object.entries(STAGE35_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-35-opening-story": 13,
      "stage-35-victory-story": 4,
    });
    expect(STAGE35_STORY_PAGES["stage-35-opening-story"][0]?.upper?.text)
      .toContain("異世界之門");
    expect(STAGE35_STORY_PAGES["stage-35-victory-story"][0]?.upper?.text)
      .toContain("不像是要作戰");
    expect(stageSimulationEffectFor("stage-35-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-35-route-to-stage-36"))
      .toEqual({ type: "campaign-route", destination: "stage-36" });
  });

  it("records five empty reinforcement channels separately from behavior 12", () => {
    expect(STAGE35_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 75,
      openingStoryRecord: 67,
      victoryStoryRecord: 68,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 10,
        narrativeCallsThemReinforcements: true,
      },
      enemyBehavior12: {
        kind: "consume-action-without-move-or-attack",
        routeTarget: null,
      },
      completedRoute: { module: 27, stage: 36, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-076"],
    });
    expect(STAGE35_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
    expect(STAGE35_EVENT_PROGRAM.enemyBehavior12.slots)
      .toEqual([39, 35, 36, 40, 44, 38, 41, 43, 37, 42]);
  });

  it("registers the native phase music", () => {
    activateStage35Content();
    expect(STAGE35_MUSIC_PROGRAMS["stage-35-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/35", loopTrack: "MUSIC/34" });
    expect(STAGE35_MUSIC_PROGRAMS["stage-35-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-35-player-phase-music"))
      .toBe(STAGE35_MUSIC_PROGRAMS["stage-35-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE35_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE35_ASSETS.map,
      STAGE35_ASSETS.minimap,
      ...Object.values(STAGE35_ASSETS.unitSprites),
      ...Object.values(STAGE35_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
