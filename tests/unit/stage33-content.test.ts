import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage33Content,
  STAGE33,
  STAGE33_ASSETS,
  STAGE33_DEFINITION,
  STAGE33_EVENT_PROGRAM,
  STAGE33_MUSIC_PROGRAMS,
  STAGE33_SEMANTIC_ALLIED_UNITS,
  STAGE33_SEMANTIC_ENEMY_UNITS,
  STAGE33_SOURCES,
  STAGE33_STORY_PAGES,
  STAGE33_TERRAIN_TOKENS,
} from "../../src/game/content/stage33";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 33 generated content", () => {
  it("defines one fixed ally, nine optional cells, and twenty-nine static guards", () => {
    expect(STAGE33).toMatchObject({
      id: "stage-33",
      nativeStage: 33,
      name: "拉那洛城外",
      viewport: { initialOrigin: { x: 23, y: 39 } },
    });
    expect(STAGE33_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 27, y: 44 } }],
        maximumUnits: 10,
      },
    });
    expect(STAGE33_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE33_DEFINITION.deployment.openCells).toHaveLength(9);
    expect(STAGE33_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE33_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE33_SEMANTIC_ALLIED_UNITS.map(({ slot }) => Number(slot)))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));

    expect(STAGE33_SEMANTIC_ENEMY_UNITS).toHaveLength(29);
    expect(STAGE33_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 55, classId: "demon-dragon-knight", aiBehavior: 0 }),
      expect.objectContaining({ slot: 39, classId: "great-axe-warrior", aiBehavior: 2 }),
      expect.objectContaining({
        slot: 23,
        classId: "swift-dragon-knight",
        name: "阿莉絲",
        portrait: 30,
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 24,
        classId: "swift-dragon-knight",
        name: "瑪西爾",
        portrait: 31,
        aiBehavior: 0,
      }),
      expect.objectContaining({ slot: 47, classId: "evil-mage", aiBehavior: 1 }),
      expect.objectContaining({ slot: 49, classId: "wizard", aiBehavior: 1 }),
      expect.objectContaining({ slot: 54, classId: "magic-master", aiBehavior: 1 }),
      expect.objectContaining({ slot: 44, classId: "magic-armor-warrior", aiBehavior: 1 }),
    ]));
    const enemyClassCounts = STAGE33_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "demon-dragon-knight": 2,
      "great-axe-warrior": 6,
      "beast-knight": 4,
      "swift-dragon-knight": 2,
      "evil-mage": 4,
      wizard: 2,
      "prayer-guide": 2,
      "magic-master": 2,
      "magic-armor-warrior": 5,
    });
    expect(STAGE33_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 1))
      .toHaveLength(15);
  });

  it("registers SAY/0065, ordinary victory feedback, and the stage 34 route", () => {
    activateStage33Content();
    expect(Object.fromEntries(Object.entries(STAGE33_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-33-opening-story": 6,
    });
    expect(STAGE33_STORY_PAGES["stage-33-opening-story"][2]?.lower?.text)
      .toContain("四騎士的最後一人現在正守在城裡");
    expect(stageSimulationEffectFor("stage-33-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-33-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-33-route-to-stage-34"))
      .toEqual({ type: "campaign-route", destination: "stage-34" });
  });

  it("records five audited channels with no reinforcement producer", () => {
    expect(STAGE33_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 73,
      openingStoryRecord: 65,
      victoryStoryRecord: null,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 29,
        narrativeCallsThemReinforcements: false,
      },
      completedRoute: { module: 27, stage: 34, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-074", "REMAKE-119"],
    });
    expect(STAGE33_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native phase music without inventing prebattle music", () => {
    activateStage33Content();
    expect(STAGE33_MUSIC_PROGRAMS["stage-33-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/19", loopTrack: "MUSIC/18" });
    expect(STAGE33_MUSIC_PROGRAMS["stage-33-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(musicProgramFor("stage-33-player-phase-music"))
      .toBe(STAGE33_MUSIC_PROGRAMS["stage-33-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE33_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE33_ASSETS.map,
      STAGE33_ASSETS.minimap,
      ...Object.values(STAGE33_ASSETS.unitSprites),
      ...Object.values(STAGE33_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
