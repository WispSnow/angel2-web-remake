import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage23Content,
  STAGE23_ASSETS,
  STAGE23_DEFINITION,
  STAGE23_EVENT_PROGRAM,
  STAGE23_MUSIC_PROGRAMS,
  STAGE23_SEMANTIC_ALLIED_UNITS,
  STAGE23_SEMANTIC_ENEMY_UNITS,
  STAGE23_SOURCES,
  STAGE23_STORY_PAGES,
  STAGE23_TERRAIN_TOKENS,
} from "../../src/game/content/stage23";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 23 generated content", () => {
  it("defines the native Nia breakthrough objective, deployment, and 21 static guards", () => {
    expect(STAGE23_DEFINITION).toMatchObject({
      id: "stage-23",
      nativeStage: 23,
      name: "死亡之谷中",
      objective: {
        victory: {
          type: "unit-in-cell-range",
          side: 1,
          slot: 0,
          width: 50,
          minimum: 0,
          maximum: 524,
        },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "「妮雅」到達死亡之谷的頂端",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 25, y: 38 } }],
        maximumUnits: 15,
        openCells: expect.arrayContaining([{ x: 23, y: 37 }, { x: 27, y: 39 }]),
      },
    });
    expect(STAGE23_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE23_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE23_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯",
      portrait: 14,
      initialClassId: "magic-priest",
      untouchedExperience: 0,
    });
    expect(STAGE23_SEMANTIC_ENEMY_UNITS).toHaveLength(21);
    expect(STAGE23_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 45, classId: "half-dragon-warrior", position: { x: 16, y: 10 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 36, classId: "flying-dragon-knight", position: { x: 24, y: 10 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 34, classId: "magic-archer", position: { x: 22, y: 19 }, aiBehavior: 1 }),
      expect.objectContaining({ slot: 43, classId: "crossbow", position: { x: 32, y: 14 }, aiBehavior: 1 }),
      expect.objectContaining({ slot: 53, classId: "swift-dragon-knight", position: { x: 29, y: 17 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 32, classId: "divine-sword-warrior", position: { x: 24, y: 25 }, aiBehavior: 2 }),
      expect.objectContaining({ slot: 48, classId: "steel-armor-warrior", position: { x: 24, y: 29 }, aiBehavior: 2 }),
    ]));
    const enemyClassCounts = STAGE23_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "half-dragon-warrior": 3,
      "flying-dragon-knight": 3,
      crossbow: 7,
      "swift-dragon-knight": 2,
      "magic-archer": 2,
      "divine-sword-warrior": 2,
      "steel-armor-warrior": 2,
    });
  });

  it("registers the four opening checkpoints and route effects", () => {
    activateStage23Content();
    expect(Object.fromEntries(Object.entries(STAGE23_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-23-opening-story": 4,
    });
    expect(STAGE23_STORY_PAGES["stage-23-opening-story"][2]?.upper?.text)
      .toContain("大家別理會這些");
    expect(stageSimulationEffectFor("stage-23-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-23-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-23-route-to-stage-24"))
      .toEqual({ type: "campaign-route", destination: "stage-24" });
  });

  it("records the five-channel no-reinforcement audit and native route", () => {
    expect(STAGE23_EVENT_PROGRAM).toMatchObject({
      openingStoryRecord: 46,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 21,
      },
      completedRoute: { module: 27, stage: 24, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-054", "REMAKE-058", "REMAKE-059"],
    });
    expect(STAGE23_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers the native phase music", () => {
    activateStage23Content();
    expect(STAGE23_MUSIC_PROGRAMS["stage-23-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/19", loopTrack: "MUSIC/18" });
    expect(STAGE23_MUSIC_PROGRAMS["stage-23-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(musicProgramFor("stage-23-player-phase-music"))
      .toBe(STAGE23_MUSIC_PROGRAMS["stage-23-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE23_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE23_ASSETS.map,
      STAGE23_ASSETS.minimap,
      ...Object.values(STAGE23_ASSETS.unitSprites),
      ...Object.values(STAGE23_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
