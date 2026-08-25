import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  STAGE6_ASSETS,
  STAGE6_DEFINITION,
  STAGE6_EVENT_PROGRAM,
  STAGE6_MUSIC_PROGRAMS,
  STAGE6_REINFORCEMENT_ACTORS,
  STAGE6_SEMANTIC_ENEMY_UNITS,
  STAGE6_SOURCES,
  STAGE6_STORY_PAGES,
  STAGE6_TERRAIN_TOKENS,
  STAGE6_VICTORY_PRESENTATION,
  activateStage6Content,
} from "../../src/game/content/stage6";
import { RUNTIME_STAGE_DEFINITIONS } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 6 generated content", () => {
  it("defines the nine-unit deployment and machine-resolved Xielei objective", () => {
    activateStage6Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-06"]).toBe(STAGE6_DEFINITION);
    expect(STAGE6_DEFINITION).toMatchObject({
      id: "stage-06",
      nativeStage: 6,
      name: "過異世界之門",
      viewport: { initialOrigin: { x: 17, y: 21 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 19 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "擊敗西艾蕾",
      },
      deployment: {
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        fixedPlacements: [{ slot: 0, position: { x: 21, y: 24 } }],
        optionalSlots: [1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        maximumUnits: 9,
      },
    });
    expect(STAGE6_DEFINITION.deployment.openCells).toEqual([
      { x: 23, y: 24 }, { x: 25, y: 24 },
      { x: 21, y: 26 }, { x: 23, y: 26 }, { x: 25, y: 26 },
      { x: 21, y: 28 }, { x: 23, y: 28 }, { x: 25, y: 28 },
    ]);
    expect(STAGE6_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 14,
      openingStoryRecord: 15,
      retreatStoryRecord: 16,
      allianceStoryRecord: 115,
      completedRoute: { module: 25, stage: 7, replayPresentation: false },
    });
  });

  it("keeps nine native enemies and Xielei's class, portrait, and behavior", () => {
    expect(STAGE6_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE6_SEMANTIC_ENEMY_UNITS).toHaveLength(9);
    expect(STAGE6_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 19)).toMatchObject({
      classId: "land-knight",
      name: "西艾蕾",
      portrait: 5,
      position: { x: 39, y: 36 },
      aiBehavior: 0,
    });
    expect(new Set(STAGE6_SEMANTIC_ENEMY_UNITS.map(({ aiBehavior }) => aiBehavior)))
      .toEqual(new Set([0]));
  });

  it("encodes the ranger tableau and leader arrival as reusable simulation effects", () => {
    activateStage6Content();
    expect(STAGE6_REINFORCEMENT_ACTORS.map(({ slot, position }) => ({ slot, position })))
      .toEqual([
        { slot: 0, position: { x: 6, y: 27 } },
        { slot: 1, position: { x: 9, y: 28 } },
        { slot: 2, position: { x: 7, y: 29 } },
        { slot: 3, position: { x: 10, y: 29 } },
        { slot: 4, position: { x: 8, y: 30 } },
        { slot: 5, position: { x: 6, y: 31 } },
        { slot: 6, position: { x: 9, y: 31 } },
        { slot: 7, position: { x: 6, y: 33 } },
        { slot: 17, position: { x: 11, y: 30 } },
      ]);
    expect(STAGE6_REINFORCEMENT_ACTORS.at(-1)).toMatchObject({
      storyId: "story:ranger-leader",
      name: "阿曼妮",
      portraitRecord: 18,
      nativeClassRecord: 22,
    });
    const reinforcements = stageSimulationEffectFor("stage-06-reinforcement-tableau");
    expect(reinforcements?.type).toBe("story-reinforcements");
    expect(reinforcements && "actors" in reinforcements ? reinforcements.actors : [])
      .toHaveLength(9);
    expect(reinforcements && "actors" in reinforcements ? reinforcements.actors[0] : undefined)
      .toMatchObject({ id: "story:ranger:0" });
    expect(stageSimulationEffectFor("stage-06-ranger-leader-move")).toEqual({
      type: "scripted-unit-arrival",
      actorId: "story:ranger-leader",
      target: { side: 1, portrait: 46 },
      movementBudget: 50,
      statusText: "游騎兵領隊前來交涉……",
    });
    expect(STAGE6_VICTORY_PRESENTATION.events.find(({ trigger }) => trigger === "live victory 999")
      ?.steps.filter(({ op }) => op === "writeBoardCell")).toHaveLength(9);
  });

  it("registers four stories, the background switch, and native music", () => {
    activateStage6Content();
    expect(Object.values(STAGE6_STORY_PAGES).map((pages) => pages.length))
      .toEqual([10, 6, 15, 10]);
    expect(STAGE6_STORY_PAGES["stage-06-prebattle-story"].map(({ source }) => source.backgroundId))
      .toEqual([5, 5, 5, 5, 5, 5, 31, 31, 31, 31]);
    expect(storyPagesForId("stage-06-alliance-story"))
      .toBe(STAGE6_STORY_PAGES["stage-06-alliance-story"]);
    expect(STAGE6_MUSIC_PROGRAMS["stage-06-story-music"])
      .toMatchObject({ kind: "loop", track: "MAGIC/78" });
    expect(STAGE6_MUSIC_PROGRAMS["stage-06-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/3", loopTrack: "MUSIC/2" });
    expect(STAGE6_MUSIC_PROGRAMS["stage-06-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/31", loopTrack: "MUSIC/30" });
    expect(musicProgramFor("stage-06-story-music"))
      .toBe(STAGE6_MUSIC_PROGRAMS["stage-06-story-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps all evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE6_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE6_ASSETS.map,
      STAGE6_ASSETS.minimap,
      ...Object.values(STAGE6_ASSETS.storyBackgrounds),
      ...Object.values(STAGE6_ASSETS.unitSprites),
      ...Object.values(STAGE6_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
