import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage27Content,
  STAGE27,
  STAGE27_ASSETS,
  STAGE27_DEFINITION,
  STAGE27_EVENT_PROGRAM,
  STAGE27_MUSIC_PROGRAMS,
  STAGE27_SEMANTIC_ALLIED_UNITS,
  STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS,
  STAGE27_SEMANTIC_ENEMY_UNITS,
  STAGE27_SOURCES,
  STAGE27_STORY_PAGES,
} from "../../src/game/content/stage27";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 27 generated content", () => {
  it("keeps the 11-fixed, 20-open, 31-unit deployment", () => {
    expect(STAGE27).toMatchObject({ id: "stage-27", nativeStage: 27, name: "趕回瓦爾克麗城" });
    expect(STAGE27_DEFINITION.deployment).toMatchObject({
      kind: "interactive",
      maximumUnits: 31,
    });
    expect(STAGE27_DEFINITION.deployment.fixedPlacements).toEqual([
      { slot: 22, position: { x: 20, y: 11 } },
      { slot: 41, position: { x: 25, y: 12 } },
      { slot: 44, position: { x: 16, y: 14 } },
      { slot: 43, position: { x: 18, y: 14 } },
      { slot: 45, position: { x: 21, y: 14 } },
      { slot: 42, position: { x: 23, y: 14 } },
      { slot: 40, position: { x: 25, y: 14 } },
      { slot: 57, position: { x: 35, y: 35 } },
      { slot: 56, position: { x: 38, y: 35 } },
      { slot: 58, position: { x: 33, y: 36 } },
      { slot: 0, position: { x: 39, y: 37 } },
    ]);
    expect(STAGE27_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE27_DEFINITION.deployment.openCells).toHaveLength(20);
    expect(STAGE27_DEFINITION.deployment.eligibleSlots).toHaveLength(39);
  });

  it("keeps only native scenario-flag units in the deployment roster", () => {
    expect(STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS.map(({ slot }) => slot)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      25, 26, 27, 28, 29, 30, 31,
    ]);
    expect(STAGE27_SEMANTIC_DEPLOYMENT_ROSTER_UNITS.map(({ slot }) => slot)).not.toEqual(
      expect.arrayContaining([22, 40, 41, 42, 43, 44, 45, 56, 57, 58]),
    );
  });

  it("separates seven automatic defenders from Nia, three engineers, and campaign candidates", () => {
    expect(STAGE27_SEMANTIC_ALLIED_UNITS).toHaveLength(39);
    expect(STAGE27_SEMANTIC_ALLIED_UNITS.filter(({ aiBehavior }) => aiBehavior === 2))
      .toHaveLength(7);
    expect(STAGE27_SEMANTIC_ALLIED_UNITS.filter(({ aiBehavior }) => aiBehavior === 0))
      .toHaveLength(32);
    // 十名固定棋盘单位的 side-1 角色描述符肖像都是 FFh，原版 `0000:51B9` 因此把肖像和
    // 单位名一起换成职业回退。槽 22 描述符里的「愛莉歐拉」全战役没有肖像记录，也从不是
    // 玩家向显示名，不得作为城防军主将登记。
    const fixedBoardOnly = STAGE27_SEMANTIC_ALLIED_UNITS
      .filter(({ slot }) => [22, 40, 41, 42, 43, 44, 45, 56, 57, 58].includes(slot));
    expect(fixedBoardOnly).toHaveLength(10);
    expect(fixedBoardOnly.filter((unit) => "portrait" in unit)).toEqual([]);
    expect(fixedBoardOnly.map(({ name }) => name)).toEqual([
      "巨斧戰士", "魔祭師", "魔術士", "咒術師", "士兵", "祈導師", "魔劍戰士",
      "工兵", "工兵", "工兵",
    ]);
    expect(STAGE27_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 22)).toMatchObject({
      name: "巨斧戰士",
      forcedClassId: "great-axe-warrior",
      aiBehavior: 2,
      untouchedExperience: 0,
    });
    expect(STAGE27_SEMANTIC_ALLIED_UNITS.filter(({ slot }) => [56, 57, 58].includes(slot)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ slot: 56, forcedClassId: "engineer", aiBehavior: 0 }),
        expect.objectContaining({ slot: 57, forcedClassId: "engineer", aiBehavior: 0 }),
        expect.objectContaining({ slot: 58, forcedClassId: "engineer", aiBehavior: 0 }),
      ]));
  });

  it("keeps all five static rebels and the exact four-part Nia destination", () => {
    expect(STAGE27_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 40, classId: "magic-sword-warrior", position: { x: 33, y: 11 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 41, classId: "magic-priest", position: { x: 31, y: 14 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 44, classId: "magic-archer", position: { x: 22, y: 19 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 43, classId: "magic-armor-warrior", position: { x: 19, y: 20 }, aiBehavior: 0 }),
      expect.objectContaining({ slot: 42, classId: "curse-master", position: { x: 16, y: 22 }, aiBehavior: 0 }),
    ]));
    expect(STAGE27_DEFINITION.objective.victory).toEqual({
      type: "any-of",
      conditions: [
        { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 0, maximum: 575 },
        { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 616, maximum: 625 },
        { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 666, maximum: 675 },
        { type: "unit-in-cell-range", side: 1, slot: 0, width: 50, minimum: 716, maximum: 725 },
      ],
    });
  });

  it("registers SAY 51/52, no reinforcements, and the stage 28 route", () => {
    activateStage27Content();
    expect(Object.fromEntries(Object.entries(STAGE27_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-27-opening-story": 6,
      "stage-27-victory-story": 10,
    });
    expect(STAGE27_STORY_PAGES["stage-27-opening-story"][0]?.lower?.text)
      .toContain("女帝");
    expect(STAGE27_STORY_PAGES["stage-27-victory-story"][0]?.lower?.text)
      .toContain("瓦爾克麗的危機");
    expect(STAGE27_EVENT_PROGRAM).toMatchObject({
      openingStoryRecord: 51,
      victoryStoryRecord: 52,
      alliedControl: {
        automaticBehavior2Slots: [22, 41, 44, 43, 45, 42, 40],
        playerBehavior0FixedSlots: [57, 56, 58, 0],
        firstRoundAutomaticPosture: "sentry",
        normalPostureFromRound: 2,
      },
      enemyReinforcements: { kind: "none", initialSide2: 5 },
      completedRoute: { module: 25, stage: 28, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-064", "REMAKE-067"],
    });
    expect(STAGE27_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
    expect(stageSimulationEffectFor("stage-27-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-27-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-27-route-to-stage-28"))
      .toEqual({ type: "campaign-route", destination: "stage-28" });
  });

  it("registers native phase music and keeps shipping assets present", async () => {
    activateStage27Content();
    expect(STAGE27_MUSIC_PROGRAMS["stage-27-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/3", loopTrack: "MUSIC/2" });
    expect(STAGE27_MUSIC_PROGRAMS["stage-27-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-27-player-phase-music"))
      .toBe(STAGE27_MUSIC_PROGRAMS["stage-27-player-phase-music"]);

    for (const source of STAGE27_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE27_ASSETS.map,
      STAGE27_ASSETS.minimap,
      ...Object.values(STAGE27_ASSETS.unitSprites),
      ...Object.values(STAGE27_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
