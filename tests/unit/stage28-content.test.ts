import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage28Content,
  STAGE28,
  STAGE28_ASSETS,
  STAGE28_DEFINITION,
  STAGE28_EVENT_PROGRAM,
  STAGE28_MUSIC_PROGRAMS,
  STAGE28_SEMANTIC_ALLIED_UNITS,
  STAGE28_SEMANTIC_ENEMY_UNITS,
  STAGE28_SOURCES,
  STAGE28_STORY_PAGES,
  STAGE28_TERRAIN_TOKENS,
} from "../../src/game/content/stage28";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 28 generated content", () => {
  it("defines the 29-unit Valkyrie defense deployment and 17 static attackers", () => {
    expect(STAGE28).toMatchObject({
      id: "stage-28",
      nativeStage: 28,
      name: "保衛瓦爾克麗城",
      viewport: { initialOrigin: { x: 23, y: 21 } },
    });
    expect(STAGE28_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗攻擊瓦爾克麗城的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 28, y: 24 } }],
        maximumUnits: 29,
      },
    });
    expect(STAGE28_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE28_DEFINITION.deployment.openCells).toHaveLength(34);
    expect(STAGE28_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE28_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE28_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 7)).toMatchObject({
      name: "琴斯",
      portrait: 14,
      untouchedExperience: 0,
    });

    expect(STAGE28_SEMANTIC_ENEMY_UNITS).toHaveLength(17);
    expect(STAGE28_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: 41,
        classId: "demon-dragon-knight",
        position: { x: 39, y: 12 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 55,
        classId: "magic-sword-warrior",
        position: { x: 27, y: 15 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 50,
        classId: "evil-sword-warrior",
        position: { x: 34, y: 16 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 49,
        classId: "magic-master",
        position: { x: 22, y: 33 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 46,
        classId: "crossbow",
        position: { x: 24, y: 33 },
        aiBehavior: 0,
      }),
      expect.objectContaining({
        slot: 44,
        classId: "pegasus-warrior",
        position: { x: 37, y: 40 },
        aiBehavior: 0,
      }),
    ]));
    const enemyClassCounts = STAGE28_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "demon-dragon-knight": 2,
      "magic-sword-warrior": 4,
      "evil-sword-warrior": 4,
      "magic-master": 3,
      crossbow: 2,
      "pegasus-warrior": 2,
    });
    expect(STAGE28_ASSETS.unitSprites["enemy-demon-dragon-knight"])
      .toBe("/assets/original/technique-lab/units/enemy-demon-dragon-knight.png");
  });

  it("registers the prebattle, opening, victory, and stage 29 route effects", () => {
    activateStage28Content();
    expect(Object.fromEntries(Object.entries(STAGE28_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-28-prebattle-story": 14,
      "stage-28-opening-story": 5,
      "stage-28-victory-story": 8,
    });
    expect(STAGE28_STORY_PAGES["stage-28-prebattle-story"][0]?.lower?.text)
      .toContain("暫時得到勝利的瓦爾克麗軍");
    expect(STAGE28_STORY_PAGES["stage-28-opening-story"][0]?.lower?.text)
      .toContain("妮雅殿下");
    expect(STAGE28_STORY_PAGES["stage-28-victory-story"][0]?.lower?.text)
      .toContain("成功的突破了敵方所設下的包圍圈");
    expect(stageSimulationEffectFor("stage-28-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-28-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-28-route-to-stage-29"))
      .toEqual({ type: "campaign-route", destination: "stage-29" });
  });

  it("records the five-channel no-reinforcement audit and stage 29 route", () => {
    expect(STAGE28_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: 53,
      prebattleBackgroundRecord: 22,
      prebattleMusicRecord: 76,
      openingStoryRecord: 54,
      victoryStoryRecord: 55,
      enemyReinforcements: { kind: "none", initialSide2: 17 },
      completedRoute: { module: 25, stage: 29, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-068"],
    });
    expect(STAGE28_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native story and phase music", () => {
    activateStage28Content();
    expect(STAGE28_MUSIC_PROGRAMS["stage-28-story-music"])
      .toMatchObject({ track: "MAGIC/76" });
    expect(STAGE28_MUSIC_PROGRAMS["stage-28-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/11", loopTrack: "MUSIC/10" });
    expect(STAGE28_MUSIC_PROGRAMS["stage-28-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/27", loopTrack: "MUSIC/26" });
    expect(musicProgramFor("stage-28-player-phase-music"))
      .toBe(STAGE28_MUSIC_PROGRAMS["stage-28-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE28_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE28_ASSETS.map,
      STAGE28_ASSETS.minimap,
      STAGE28_ASSETS.storyBackground,
      ...Object.values(STAGE28_ASSETS.unitSprites),
      ...Object.values(STAGE28_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
