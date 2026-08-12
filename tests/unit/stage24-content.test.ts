import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage24Content,
  STAGE24_ASSETS,
  STAGE24_DEFINITION,
  STAGE24_EVENT_PROGRAM,
  STAGE24_MUSIC_PROGRAMS,
  STAGE24_SEMANTIC_ALLIED_UNITS,
  STAGE24_SEMANTIC_ENEMY_UNITS,
  STAGE24_SOURCES,
  STAGE24_STORY_PAGES,
  STAGE24_TERRAIN_TOKENS,
} from "../../src/game/content/stage24";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 24 generated content", () => {
  it("defines the native castle arrival objective, deployment, and 22 static guards", () => {
    expect(STAGE24_DEFINITION).toMatchObject({
      id: "stage-24",
      nativeStage: 24,
      name: "死亡之谷城堡前",
      objective: {
        victory: {
          type: "unit-in-cell-range",
          side: 1,
          slot: 0,
          width: 50,
          minimum: 0,
          maximum: 1030,
        },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "「妮雅」到達死亡之谷的城堡",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 27, y: 39 } }],
        maximumUnits: 15,
        openCells: expect.arrayContaining([{ x: 25, y: 38 }, { x: 29, y: 40 }]),
      },
    });
    expect(STAGE24_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE24_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE24_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯",
      portrait: 14,
    });
    expect(STAGE24_SEMANTIC_ENEMY_UNITS).toHaveLength(22);
    expect(STAGE24_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 31, classId: "bone-knight", position: { x: 24, y: 20 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 52, classId: "crossbow", position: { x: 17, y: 22 }, aiBehavior: 1 }),
      expect.objectContaining({ slot: 38, classId: "half-dragon-warrior", position: { x: 19, y: 22 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 48, classId: "steel-armor-warrior", position: { x: 25, y: 23 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 35, classId: "demon-dragon-knight", position: { x: 29, y: 25 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 39, classId: "jungle-warrior", position: { x: 29, y: 30 }, aiBehavior: 1 }),
    ]));
    const enemyClassCounts = STAGE24_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "bone-knight": 1,
      crossbow: 11,
      "half-dragon-warrior": 3,
      "steel-armor-warrior": 3,
      "demon-dragon-knight": 3,
      "jungle-warrior": 1,
    });
    expect(STAGE24_ASSETS.unitSprites["enemy-bone-knight"])
      .toBe("/assets/original/technique-lab/units/enemy-bone-knight.png");
  });

  it("registers the four opening and nine victory checkpoints", () => {
    activateStage24Content();
    expect(Object.fromEntries(Object.entries(STAGE24_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-24-opening-story": 4,
      "stage-24-victory-story": 9,
    });
    expect(STAGE24_STORY_PAGES["stage-24-opening-story"][0]?.lower?.text)
      .toContain("這座城堡");
    expect(STAGE24_STORY_PAGES["stage-24-victory-story"][0]?.lower?.text)
      .toContain("大門打開");
    expect(stageSimulationEffectFor("stage-24-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-24-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-24-route-to-stage-26"))
      .toEqual({ type: "campaign-route", destination: "stage-26" });
  });

  it("records the five-channel no-reinforcement audit and stage-25-skipping route", () => {
    expect(STAGE24_EVENT_PROGRAM).toMatchObject({
      module25StoryRecord: null,
      openingStoryRecord: 47,
      victoryStoryRecord: 48,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 22,
      },
      completedRoute: { module: 27, stage: 26, replayPresentation: false },
      skippedNativeStage: 25,
      stableRemakeDecisions: ["REMAKE-061"],
    });
    expect(STAGE24_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers the native phase music", () => {
    activateStage24Content();
    expect(STAGE24_MUSIC_PROGRAMS["stage-24-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE24_MUSIC_PROGRAMS["stage-24-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-24-player-phase-music"))
      .toBe(STAGE24_MUSIC_PROGRAMS["stage-24-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE24_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE24_ASSETS.map,
      STAGE24_ASSETS.minimap,
      ...Object.values(STAGE24_ASSETS.unitSprites),
      ...Object.values(STAGE24_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
