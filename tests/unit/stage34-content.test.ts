import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage34Content,
  STAGE34,
  STAGE34_ASSETS,
  STAGE34_DEFINITION,
  STAGE34_EVENT_PROGRAM,
  STAGE34_MUSIC_PROGRAMS,
  STAGE34_SEMANTIC_ALLIED_UNITS,
  STAGE34_SEMANTIC_ENEMY_UNITS,
  STAGE34_SOURCES,
  STAGE34_STORY_PAGES,
  STAGE34_TERRAIN_TOKENS,
} from "../../src/game/content/stage34";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 34 generated content", () => {
  it("defines one fixed ally, ten optional cells, and nineteen static enemies", () => {
    expect(STAGE34).toMatchObject({
      id: "stage-34",
      nativeStage: 34,
      name: "拉那洛城內",
      viewport: { initialOrigin: { x: 26, y: 17 } },
    });
    expect(STAGE34_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 30, y: 21 } }],
        maximumUnits: 11,
      },
    });
    expect(STAGE34_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE34_DEFINITION.deployment.openCells).toHaveLength(10);
    expect(STAGE34_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE34_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE34_SEMANTIC_ALLIED_UNITS.map(({ slot }) => Number(slot)))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));

    expect(STAGE34_SEMANTIC_ENEMY_UNITS).toHaveLength(19);
    expect(STAGE34_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 6, classId: "great-dragon-knight", name: "芙瑪羅妮", portrait: 11 }),
      expect.objectContaining({ slot: 7, classId: "evil-sword-warrior", name: "蕾娜吉芙", portrait: 24 }),
      expect.objectContaining({ slot: 39, classId: "prayer-guide", aiBehavior: 0 }),
      expect.objectContaining({ slot: 55, classId: "evil-mage", aiBehavior: 0 }),
      expect.objectContaining({ slot: 46, classId: "divine-sword-warrior", aiBehavior: 0 }),
      expect.objectContaining({ slot: 44, classId: "magic-master", aiBehavior: 0 }),
    ]));
    const enemyClassCounts = STAGE34_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "great-dragon-knight": 1,
      "prayer-guide": 3,
      "evil-sword-warrior": 5,
      "magic-armor-warrior": 1,
      "evil-mage": 3,
      "magic-sword-warrior": 1,
      "divine-sword-warrior": 2,
      "magic-master": 3,
    });
    expect(STAGE34_SEMANTIC_ENEMY_UNITS.every(({ aiBehavior }) => aiBehavior === 0)).toBe(true);
  });

  it("registers SAY/0066, ordinary victory feedback, and the stage 35 route", () => {
    activateStage34Content();
    expect(Object.fromEntries(Object.entries(STAGE34_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-34-opening-story": 4,
    });
    expect(STAGE34_STORY_PAGES["stage-34-opening-story"][0]?.upper?.text)
      .toContain("真沒想到妳們也能到達這裡");
    expect(STAGE34_STORY_PAGES["stage-34-opening-story"][3]?.upper?.text)
      .toContain("讓妳們瞧瞧我的看家本領");
    expect(stageSimulationEffectFor("stage-34-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-34-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-34-route-to-stage-35"))
      .toEqual({ type: "campaign-route", destination: "stage-35" });
  });

  it("records five audited channels with no reinforcement producer", () => {
    expect(STAGE34_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 74,
      openingStoryRecord: 66,
      victoryStoryRecord: null,
      enemyReinforcements: {
        kind: "none",
        initialSide2: 19,
        narrativeCallsThemReinforcements: false,
      },
      completedRoute: { module: 27, stage: 35, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-075"],
    });
    expect(STAGE34_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native phase music without inventing prebattle music", () => {
    activateStage34Content();
    expect(STAGE34_MUSIC_PROGRAMS["stage-34-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/3", loopTrack: "MUSIC/2" });
    expect(STAGE34_MUSIC_PROGRAMS["stage-34-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/21", loopTrack: "MUSIC/20" });
    expect(musicProgramFor("stage-34-player-phase-music"))
      .toBe(STAGE34_MUSIC_PROGRAMS["stage-34-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE34_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE34_ASSETS.map,
      STAGE34_ASSETS.minimap,
      ...Object.values(STAGE34_ASSETS.unitSprites),
      ...Object.values(STAGE34_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
