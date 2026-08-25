import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage31Content,
  STAGE31,
  STAGE31_ASSETS,
  STAGE31_DEFINITION,
  STAGE31_EVENT_PROGRAM,
  STAGE31_MUSIC_PROGRAMS,
  STAGE31_SEMANTIC_ALLIED_UNITS,
  STAGE31_SEMANTIC_ENEMY_UNITS,
  STAGE31_SOURCES,
  STAGE31_STORY_PAGES,
  STAGE31_TERRAIN_TOKENS,
} from "../../src/game/content/stage31";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 31 generated content", () => {
  it("defines five fixed allies, twelve optional cells, and fifteen ambushers", () => {
    expect(STAGE31).toMatchObject({
      id: "stage-31",
      nativeStage: 31,
      name: "前往斯德林海峽",
      viewport: { initialOrigin: { x: 20, y: 21 } },
    });
    expect(STAGE31_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: expect.arrayContaining([
          { slot: 4, position: { x: 25, y: 12 } },
          { slot: 0, position: { x: 26, y: 33 } },
        ]),
        maximumUnits: 17,
      },
    });
    expect(STAGE31_DEFINITION.deployment.optionalSlots).toHaveLength(24);
    expect(STAGE31_DEFINITION.deployment.openCells).toHaveLength(12);
    expect(STAGE31_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE31_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE31_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯",
      portrait: 14,
      untouchedExperience: 0,
    });

    expect(STAGE31_SEMANTIC_ENEMY_UNITS).toHaveLength(15);
    expect(STAGE31_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: 5,
        classId: "demon-dragon-knight",
        name: "菲伊魯茵",
        portrait: 25,
        position: { x: 16, y: 14 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 55,
        classId: "demon-dragon-knight",
        position: { x: 15, y: 23 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 50,
        classId: "half-dragon-warrior",
        position: { x: 39, y: 25 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 49,
        classId: "beast-knight",
        position: { x: 23, y: 41 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 46,
        classId: "beast-knight",
        position: { x: 28, y: 41 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 48,
        classId: "bone-knight",
        position: { x: 24, y: 41 },
        aiBehavior: 0,
      }),
    ]));
    const enemyClassCounts = STAGE31_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "demon-dragon-knight": 5,
      "half-dragon-warrior": 5,
      "beast-knight": 2,
      "bone-knight": 1,
      "swift-dragon-knight": 2,
    });
    expect(STAGE31_ASSETS.unitSprites["enemy-demon-dragon-knight"])
      .toBe("/assets/original/technique-lab/units/enemy-demon-dragon-knight.png");
  });

  it("registers SAY/0060–0062 and the stage 32 route effects", () => {
    activateStage31Content();
    expect(Object.fromEntries(Object.entries(STAGE31_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-31-prebattle-story": 14,
      "stage-31-opening-story": 8,
      "stage-31-victory-story": 2,
    });
    expect(STAGE31_STORY_PAGES["stage-31-prebattle-story"][0]?.upper?.text)
      .toContain("外面的吵雜聲");
    expect(STAGE31_STORY_PAGES["stage-31-opening-story"][0]?.lower?.text)
      .toContain("橫渡斯德林海峽");
    expect(STAGE31_STORY_PAGES["stage-31-victory-story"][0]?.lower?.text)
      .toContain("快撤退呀");
    expect(stageSimulationEffectFor("stage-31-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-31-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-31-route-to-stage-32"))
      .toEqual({ type: "campaign-route", destination: "stage-32" });
  });

  it("records the five-channel no-reinforcement audit and stage 32 route", () => {
    expect(STAGE31_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: 60,
      prebattleBackgroundRecord: 23,
      prebattleMusicRecord: 79,
      openingStoryRecord: 61,
      victoryStoryRecord: 62,
      enemyReinforcements: { kind: "none", initialSide2: 15 },
      completedRoute: { module: 27, stage: 32, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-072"],
    });
    expect(STAGE31_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native story and phase music", () => {
    activateStage31Content();
    expect(STAGE31_MUSIC_PROGRAMS["stage-31-story-music"])
      .toMatchObject({ track: "MAGIC/79" });
    expect(STAGE31_MUSIC_PROGRAMS["stage-31-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE31_MUSIC_PROGRAMS["stage-31-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/37", loopTrack: "MUSIC/36" });
    expect(musicProgramFor("stage-31-player-phase-music"))
      .toBe(STAGE31_MUSIC_PROGRAMS["stage-31-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE31_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE31_ASSETS.map,
      STAGE31_ASSETS.minimap,
      STAGE31_ASSETS.storyBackground,
      ...Object.values(STAGE31_ASSETS.unitSprites),
      ...Object.values(STAGE31_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
