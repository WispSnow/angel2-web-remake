import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage37Content,
  STAGE37,
  STAGE37_ASSETS,
  STAGE37_DEFINITION,
  STAGE37_EVENT_PROGRAM,
  STAGE37_MUSIC_PROGRAMS,
  STAGE37_SEMANTIC_ALLIED_UNITS,
  STAGE37_SEMANTIC_ENEMY_UNITS,
  STAGE37_SOURCES,
  STAGE37_STORY_PAGES,
  STAGE37_TERRAIN_TOKENS,
} from "../../src/game/content/stage37";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 37 generated content", () => {
  it("defines the native twenty-seven-versus-three final-boss board", () => {
    expect(STAGE37).toMatchObject({
      id: "stage-37",
      nativeStage: 37,
      name: "究極女神",
      viewport: { initialOrigin: { x: 19, y: 11 } },
    });
    expect(STAGE37_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "消滅「究極女神」的三個部位",
      },
      deployment: {
        fixedPlacements: [{ slot: 0, position: { x: 23, y: 17 } }],
        maximumUnits: 27,
      },
    });
    expect(STAGE37_DEFINITION.deployment.openCells).toHaveLength(26);
    expect(STAGE37_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE37_SEMANTIC_ENEMY_UNITS).toEqual([
      expect.objectContaining({ slot: 56, classId: "head", portrait: 8, position: { x: 23, y: 11 } }),
      expect.objectContaining({ slot: 54, classId: "hand", portrait: 8, position: { x: 22, y: 12 } }),
      expect.objectContaining({ slot: 55, classId: "hand", portrait: 8, position: { x: 24, y: 12 } }),
    ]);
    expect(STAGE37_TERRAIN_TOKENS).toHaveLength(2500);
  });

  it("records the visible objective conflict and the five closed generation channels", () => {
    expect(STAGE37_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 77,
      openingStoryRecord: 81,
      victoryStoryRecord: null,
      visibleObjectiveRecord: { record: 105 },
      enemyReinforcements: { kind: "none", initialSide2: 3 },
      completedRoute: { module: 25, stage: 49, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-005", "REMAKE-013", "REMAKE-084", "REMAKE-085"],
    });
    expect(STAGE37_EVENT_PROGRAM.visibleObjectiveRecord.conflict).toContain("all side-2 parts");
    expect(STAGE37_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
    expect(STAGE37_EVENT_PROGRAM.boss.statusAndControl).toEqual({
      ice: {
        immuneClasses: ["head", "hand"],
        effect: "no displacement or action disable",
      },
      confusion: { immuneClasses: ["head", "hand"], stateWrite: false },
      poison: { immuneClasses: ["head", "hand"], stateWrite: false },
      attackDown: { immuneClasses: [], stateWrite: true, fixedDelta: -20 },
      defenseDown: { immuneClasses: [], stateWrite: true, fixedDelta: -20 },
      spellSeal: {
        immuneClasses: [],
        stateWrite: true,
        blocksDedicatedBossActions: false,
      },
    });
    expect(STAGE37_EVENT_PROGRAM.boss.actionOrder).toEqual({
      recoveryRound: ["head", "left-hand", "right-hand"],
      iceRound: ["left-hand", "right-hand", "head"],
    });
    expect(STAGE37_EVENT_PROGRAM.boss.portraitIdentity).toEqual({
      name: "碧娜維姬",
      portraitRecord: 8,
      nativePartPortraitSentinel: 255,
      nativeClassFallbackPortraitRecord: 51,
    });
  });

  it("registers SAY/0081, native music, and the stage-49 ending boundary", () => {
    activateStage37Content();
    expect(STAGE37_STORY_PAGES["stage-37-opening-story"]).toHaveLength(7);
    expect(STAGE37_STORY_PAGES["stage-37-opening-story"][0]?.upper?.text).toContain("我要變強");
    expect(STAGE37_STORY_PAGES["stage-37-opening-story"][3]?.lower?.text).toContain("吸收自己的部下");
    expect(stageSimulationEffectFor("stage-37-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-37-route-to-stage-49"))
      .toEqual({ type: "campaign-route", destination: "stage-49" });
    expect(STAGE37_MUSIC_PROGRAMS["stage-37-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/33", loopTrack: "MUSIC/32" });
    expect(STAGE37_MUSIC_PROGRAMS["stage-37-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-37-player-phase-music"))
      .toBe(STAGE37_MUSIC_PROGRAMS["stage-37-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE37_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE37_ASSETS.map,
      STAGE37_ASSETS.minimap,
      ...Object.values(STAGE37_ASSETS.unitSprites),
      ...Object.values(STAGE37_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
