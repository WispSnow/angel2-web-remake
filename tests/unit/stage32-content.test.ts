import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage32Content,
  STAGE32,
  STAGE32_ASSETS,
  STAGE32_DEFINITION,
  STAGE32_EVENT_PROGRAM,
  STAGE32_MUSIC_PROGRAMS,
  STAGE32_SEMANTIC_ALLIED_UNITS,
  STAGE32_SEMANTIC_ENEMY_UNITS,
  STAGE32_SOURCES,
  STAGE32_STORY_PAGES,
  STAGE32_TERRAIN_TOKENS,
} from "../../src/game/content/stage32";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 32 generated content", () => {
  it("defines one fixed ally, fifteen optional cells, and eighteen static enemies", () => {
    expect(STAGE32).toMatchObject({
      id: "stage-32",
      nativeStage: 32,
      name: "斯德林海峽",
      viewport: { initialOrigin: { x: 21, y: 21 } },
    });
    expect(STAGE32_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 26, y: 28 } }],
        maximumUnits: 16,
      },
    });
    expect(STAGE32_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE32_DEFINITION.deployment.openCells).toHaveLength(15);
    expect(STAGE32_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE32_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE32_SEMANTIC_ALLIED_UNITS.map(({ slot }) => Number(slot))).not.toContain(23);

    expect(STAGE32_SEMANTIC_ENEMY_UNITS).toHaveLength(18);
    expect(STAGE32_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: 5,
        classId: "demon-dragon-knight",
        name: "菲伊魯茵",
        portrait: 25,
        position: { x: 26, y: 23 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 6,
        classId: "demon-dragon-knight",
        name: "芙瑪羅妮",
        portrait: 11,
        position: { x: 26, y: 18 },
        aiBehavior: 0,
      }),
      expect.objectContaining({ slot: 56, classId: "flying-dragon-knight" }),
      expect.objectContaining({ slot: 42, classId: "evil-sword-warrior" }),
      expect.objectContaining({ slot: 36, classId: "wizard" }),
      expect.objectContaining({ slot: 35, classId: "magic-master" }),
    ]));
    const enemyClassCounts = STAGE32_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "flying-dragon-knight": 1,
      "demon-dragon-knight": 2,
      "beast-knight": 1,
      "bone-knight": 1,
      "great-axe-warrior": 2,
      "evil-sword-warrior": 1,
      "magic-sword-warrior": 1,
      "swift-dragon-knight": 1,
      "magic-priest": 1,
      "prayer-guide": 1,
      "magic-armor-warrior": 1,
      "evil-mage": 1,
      "curse-master": 1,
      wizard: 1,
      "magic-master": 1,
      "magic-guide": 1,
    });
  });

  it("registers direct deployment, SAY/0063–0064, and the stage 33 route", () => {
    activateStage32Content();
    expect(Object.fromEntries(Object.entries(STAGE32_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-32-opening-story": 6,
      "stage-32-victory-story": 4,
    });
    expect(STAGE32_STORY_PAGES["stage-32-opening-story"][1]?.lower?.text)
      .toContain("居然有援兵");
    expect(STAGE32_STORY_PAGES["stage-32-victory-story"][0]?.upper?.text)
      .toContain("四騎士中的兩個");
    expect(stageSimulationEffectFor("stage-32-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-32-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-32-route-to-stage-33"))
      .toEqual({ type: "campaign-route", destination: "stage-33" });
  });

  it("records that narrative reinforcements are eighteen static template enemies", () => {
    expect(STAGE32_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 72,
      openingStoryRecord: 63,
      victoryStoryRecord: 64,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 18,
        narrativeCallsThemReinforcements: true,
      },
      completedRoute: { module: 27, stage: 33, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-073"],
    });
    expect(STAGE32_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native phase music without inventing a prebattle story program", () => {
    activateStage32Content();
    expect(STAGE32_MUSIC_PROGRAMS["stage-32-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/39", loopTrack: "MUSIC/38" });
    expect(STAGE32_MUSIC_PROGRAMS["stage-32-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-32-player-phase-music"))
      .toBe(STAGE32_MUSIC_PROGRAMS["stage-32-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE32_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE32_ASSETS.map,
      STAGE32_ASSETS.minimap,
      ...Object.values(STAGE32_ASSETS.unitSprites),
      ...Object.values(STAGE32_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
