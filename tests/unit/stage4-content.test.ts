import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { musicProgramFor } from "../../src/game/content/music";
import {
  STAGE4_ASSETS,
  STAGE4_DEFINITION,
  STAGE4_EVENT_PROGRAM,
  STAGE4_FORCE_FIELD_PRESENTATION,
  STAGE4_INITIAL_DANGER_CELLS,
  STAGE4_INITIAL_SAFE_CELLS,
  STAGE4_MUSIC_PROGRAMS,
  STAGE4_ROUTE_PULSE_DEFINITION,
  STAGE4_SEMANTIC_ALLIED_UNITS,
  STAGE4_SEMANTIC_ENEMY_UNITS,
  STAGE4_SOURCES,
  STAGE4_STORY_PAGES,
  STAGE4_TERRAIN_TOKENS,
  STAGE4_TOKEN_TO_TERRAIN_SLOT,
  activateStage4Content,
  stage4TerrainSlotAt,
} from "../../src/game/content/stage4";
import { RUNTIME_STAGE_DEFINITIONS, isRuntimeStageId } from "../../src/game/content/stages";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 4 generated content", () => {
  it("registers the deployment, corrected escort objective, and stage-05 route", () => {
    activateStage4Content();
    expect(RUNTIME_STAGE_DEFINITIONS["stage-04"]).toBe(STAGE4_DEFINITION);
    expect(isRuntimeStageId("stage-04")).toBe(true);
    expect(STAGE4_DEFINITION).toMatchObject({
      id: "stage-04",
      nativeStage: 4,
      name: "通過力場",
      width: 50,
      height: 50,
      viewport: { width: 10, height: 7, initialOrigin: { x: 21, y: 37 } },
      objective: {
        victory: {
          type: "unit-in-cell-range",
          side: 1,
          slot: 24,
          width: 50,
          minimum: 0,
          maximum: 174,
        },
        defeat: { type: "any-unit-removed", side: 1, slots: [0, 24] },
      },
      deployment: {
        kind: "interactive",
        eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
        fixedPlacements: [
          { slot: 0, position: { x: 25, y: 40 } },
          { slot: 24, position: { x: 25, y: 41 } },
        ],
        optionalSlots: [1, 2, 3, 4, 20, 21],
        maximumUnits: 8,
      },
    });
    expect(STAGE4_DEFINITION.deployment.openCells).toEqual([
      { x: 23, y: 40 }, { x: 27, y: 40 }, { x: 23, y: 41 },
      { x: 27, y: 41 }, { x: 24, y: 42 }, { x: 26, y: 42 },
    ]);
    expect(STAGE4_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-04-prebattle-story",
      "stage-04-enter-deployment",
      "stage-04-opening-story",
      "stage-04-objective-reached",
      "stage-04-victory-story",
      "stage-04-completed-route",
    ]);
    expect(STAGE4_EVENT_PROGRAM).toEqual({
      prebattleStoryRecord: 7,
      openingStoryRecord: 8,
      victoryStoryRecord: 174,
      completedRoute: { module: 27, stage: 5, replayPresentation: false },
    });
  });

  it("decodes the native terrain and roster without duplicating evidence offsets in runtime code", () => {
    expect(STAGE4_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE4_TOKEN_TO_TERRAIN_SLOT).toHaveLength(128);
    expect(stage4TerrainSlotAt({ x: 25, y: 41 })).toBeGreaterThan(0);
    expect(stage4TerrainSlotAt({ x: -1, y: 0 })).toBe(0);
    expect(STAGE4_SEMANTIC_ALLIED_UNITS).toHaveLength(8);
    expect(STAGE4_SEMANTIC_ENEMY_UNITS).toHaveLength(2);
    expect(STAGE4_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 24)).toMatchObject({
      initialClassId: "magician",
      name: "葛蒂拉斯",
      portrait: 0,
      aiBehavior: 12,
      untouchedExperience: 299,
    });
    expect(STAGE4_SEMANTIC_ENEMY_UNITS.map(({ slot, classId, position }) => ({
      slot,
      classId,
      position,
    }))).toEqual([
      { slot: 40, classId: "soldier", position: { x: 23, y: 15 } },
      { slot: 41, classId: "soldier", position: { x: 27, y: 15 } },
    ]);
  });

  it("preserves the behavior-12 safe area and MAGIC/26 presentation contract", () => {
    expect(STAGE4_ROUTE_PULSE_DEFINITION).toEqual({
      kind: "route-pulse",
      actorId: "1:24",
      route: { goal: { x: 25, y: 2 }, movement: 3, accept: "lower-cell-index" },
      safeArea: { mode: "uniform", seed: 3, impassableMovementRule: 99 },
      effect: { side: 1, numerator: 1, denominator: 2, rounding: "floor" },
      presentationId: "stage-04-force-field-pulse",
    });
    expect(STAGE4_INITIAL_SAFE_CELLS).toHaveLength(13);
    expect(STAGE4_INITIAL_DANGER_CELLS).toEqual([{ x: 23, y: 40 }, { x: 27, y: 40 }]);
    expect(STAGE4_FORCE_FIELD_PRESENTATION).toMatchObject({
      resource: "MAGIC/26",
      runtimeTileCodes: [12, 13],
      effectRangeValue: 1,
      rangeThresholdStart: 0,
      rangeThresholdDecrementPerDraw: 1,
      sweepWidth: 11,
      iterations: 11,
      drawsPerIteration: 2,
      waitPerDrawNativeTicks: 2,
      minimumStaticFeedbackNativeTicks: 15,
      fixedGraphicWaitNativeTicks: 44,
    });
    expect(STAGE4_FORCE_FIELD_PRESENTATION.frames).toHaveLength(13);
  });

  it("registers all story checkpoints and native phase music", () => {
    activateStage4Content();
    expect(STAGE4_STORY_PAGES["stage-04-prebattle-story"]).toHaveLength(26);
    expect(STAGE4_STORY_PAGES["stage-04-opening-story"]).toHaveLength(3);
    expect(STAGE4_STORY_PAGES["stage-04-victory-story"]).toHaveLength(3);
    expect(storyPagesForId("stage-04-opening-story"))
      .toBe(STAGE4_STORY_PAGES["stage-04-opening-story"]);
    expect(STAGE4_MUSIC_PROGRAMS["stage-04-story-music"]).toMatchObject({ track: "MAGIC/76" });
    expect(STAGE4_MUSIC_PROGRAMS["stage-04-player-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/39",
      loopTrack: "MUSIC/38",
    });
    expect(STAGE4_MUSIC_PROGRAMS["stage-04-enemy-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/5",
      loopTrack: "MUSIC/4",
    });
    expect(musicProgramFor("stage-04-player-phase-music"))
      .toBe(STAGE4_MUSIC_PROGRAMS["stage-04-player-phase-music"]);
  });

  it("keeps every evidence source and generated shipping asset byte-identical", async () => {
    for (const source of STAGE4_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE4_ASSETS.map,
      STAGE4_ASSETS.minimap,
      STAGE4_ASSETS.storyBackground,
      ...Object.values(STAGE4_ASSETS.unitSprites),
      ...Object.values(STAGE4_ASSETS.audio),
      ...STAGE4_FORCE_FIELD_PRESENTATION.frames,
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });

  it("ships distinct map figures for every promotion reachable from Gadirath", async () => {
    expect(ALLY_MAP_UNIT_ASSETS).toMatchObject({
      magician: "/assets/original/unit-ally-magician.png",
      "evil-mage": "/assets/original/technique-lab/units/ally-evil-mage.png",
      "magic-master": "/assets/original/technique-lab/units/ally-magic-master.png",
      wizard: "/assets/original/technique-lab/units/ally-wizard.png",
    });
    for (const classId of ["magician", "evil-mage", "magic-master", "wizard"] as const) {
      const source = ALLY_MAP_UNIT_ASSETS[classId];
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
