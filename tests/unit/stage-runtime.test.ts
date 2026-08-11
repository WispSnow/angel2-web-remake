import { describe, expect, it } from "vitest";
import {
  isPlayableStageId,
  loadStageRuntime,
  loadedStageRuntime,
  stageRuntimeSourceForDestination,
  STAGE_RUNTIME_MANIFEST,
} from "../../src/game/stage-runtime";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-02",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: [],
  rngState: 0x1234_5678,
  rngCalls: 0,
};

describe("stage runtime manifest", () => {
  it("defines one ordered loader and route for every playable stage", () => {
    expect(Object.keys(STAGE_RUNTIME_MANIFEST)).toEqual([
      "stage-00",
      "stage-01",
      "stage-02",
      "stage-03",
      "stage-04",
      "stage-05",
      "stage-42-portal",
      "stage-06",
      "stage-07",
      "stage-08",
      "stage-09",
      "stage-11",
      "stage-10",
      "stage-12",
      "stage-13",
      "stage-14",
      "stage-15",
      "stage-16",
      "stage-17",
    ]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ ordinal }) => ordinal))
      .toEqual([0, 1, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ nextStageId }) => nextStageId)).toEqual([
      "stage-01",
      "stage-02",
      "stage-03",
      "stage-04",
      "stage-05",
      "stage-42-portal",
      "stage-06",
      "stage-07",
      "stage-08",
      "stage-09",
      "stage-11",
      "stage-10",
      "stage-12",
      "stage-13",
      "stage-14",
      "stage-15",
      "stage-16",
      "stage-17",
      "stage-18",
    ]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ label }) => label)).toEqual([
      "瓦爾克麗宮",
      "騎士城堡前",
      "攻打騎士堡",
      "救援友軍",
      "通過力場",
      "遭遇丁塔琪",
      "異世界之門",
      "過異世界之門",
      "來到異世界",
      "營地遭到偷襲",
      "找尋傳說中的飛船",
      "拯救蘇蘭達",
      "飛船上遭遇敵人",
      "落入沼澤",
      "龍塔外",
      "龍塔第一層",
      "龍塔第二層",
      "龍塔第三層",
      "龍塔第四層",
    ]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ completion }) => completion.destinationLabel))
      .toEqual([
        "騎士城堡前", "攻打騎士堡", "救援友軍", "通過力場",
        "遭遇丁塔琪", "異世界之門", "過異世界之門", "來到異世界",
        "營地遭到偷襲",
        "找尋傳說中的飛船",
        "拯救蘇蘭達",
        "飛船上遭遇敵人",
        "落入沼澤",
        "龍塔外",
        "龍塔第一層",
        "龍塔第二層",
        "龍塔第三層",
        "龍塔第四層",
        "龍塔第五層",
      ]);
    expect(isPlayableStageId("stage-03")).toBe(true);
    expect(isPlayableStageId("stage-04")).toBe(true);
    expect(isPlayableStageId("stage-05")).toBe(true);
    expect(isPlayableStageId("stage-42-portal")).toBe(true);
    expect(isPlayableStageId("stage-06")).toBe(true);
    expect(isPlayableStageId("stage-07")).toBe(true);
    expect(isPlayableStageId("stage-08")).toBe(true);
    expect(isPlayableStageId("stage-09")).toBe(true);
    expect(isPlayableStageId("stage-11")).toBe(true);
    expect(isPlayableStageId("stage-10")).toBe(true);
    expect(isPlayableStageId("stage-12")).toBe(true);
    expect(isPlayableStageId("stage-13")).toBe(true);
    expect(isPlayableStageId("stage-14")).toBe(true);
    expect(isPlayableStageId("stage-15")).toBe(true);
    expect(isPlayableStageId("stage-16")).toBe(true);
    expect(isPlayableStageId("stage-17")).toBe(true);
    expect(stageRuntimeSourceForDestination("stage-04")?.id).toBe("stage-03");
    expect(stageRuntimeSourceForDestination("stage-05")?.id).toBe("stage-04");
    expect(stageRuntimeSourceForDestination("stage-42-portal")?.id).toBe("stage-05");
    expect(stageRuntimeSourceForDestination("stage-06")?.id).toBe("stage-42-portal");
    expect(stageRuntimeSourceForDestination("stage-07")?.id).toBe("stage-06");
    expect(stageRuntimeSourceForDestination("stage-08")?.id).toBe("stage-07");
    expect(stageRuntimeSourceForDestination("stage-09")?.id).toBe("stage-08");
    expect(stageRuntimeSourceForDestination("stage-10")?.id).toBe("stage-11");
    expect(stageRuntimeSourceForDestination("stage-12")?.id).toBe("stage-10");
    expect(stageRuntimeSourceForDestination("stage-13")?.id).toBe("stage-12");
    expect(stageRuntimeSourceForDestination("stage-14")?.id).toBe("stage-13");
    expect(stageRuntimeSourceForDestination("stage-15")?.id).toBe("stage-14");
    expect(stageRuntimeSourceForDestination("stage-16")?.id).toBe("stage-15");
    expect(stageRuntimeSourceForDestination("stage-17")?.id).toBe("stage-16");
    expect(stageRuntimeSourceForDestination("stage-18")?.id).toBe("stage-17");
    expect(stageRuntimeSourceForDestination("stage-11")?.id).toBe("stage-09");
    expect(stageRuntimeSourceForDestination("stage-10")?.id).toBe("stage-11");
    expect(STAGE_RUNTIME_MANIFEST["stage-03"].mapPresentationActionIds).toContain("recovery-1");
  });

  it("loads and caches fixed-stage factories without losing their semantic assets", async () => {
    const stage2 = await loadStageRuntime("stage-02");
    const stage3 = await loadStageRuntime("stage-03");
    const stage4 = await loadStageRuntime("stage-04");
    const stage5 = await loadStageRuntime("stage-05");
    const portal = await loadStageRuntime("stage-42-portal");
    const stage6 = await loadStageRuntime("stage-06");
    const stage7 = await loadStageRuntime("stage-07");
    const stage8 = await loadStageRuntime("stage-08");
    const stage9 = await loadStageRuntime("stage-09");
    const stage11 = await loadStageRuntime("stage-11");
    const stage12 = await loadStageRuntime("stage-12");
    const stage13 = await loadStageRuntime("stage-13");
    const stage14 = await loadStageRuntime("stage-14");
    const stage15 = await loadStageRuntime("stage-15");
    const stage16 = await loadStageRuntime("stage-16");
    const stage17 = await loadStageRuntime("stage-17");
    expect(stage2.createBattle(campaign).stage.id).toBe("stage-02");
    expect(stage3.createBattle({ ...campaign, stageId: "stage-03" }).stage.id).toBe("stage-03");
    expect(stage3.assets?.unitSprites["enemy-monk"]).toContain("unit-enemy-monk.png");
    expect(stage4.preparation?.definition.fixedPlacements.map(({ slot }) => slot)).toEqual([0, 24]);
    expect(stage4.assets?.routePulsePresentations?.[0]).toMatchObject({
      resource: "MAGIC/26",
      runtimeTileCodes: [12, 13],
      effectRangeValue: 1,
      rangeThresholdStart: 0,
      sweepWidth: 11,
    });
    expect(stage5.preparation?.definition).toMatchObject({ maximumUnits: 6 });
    expect(stage5.assets?.unitSprites["enemy-archer"]).toContain("enemy-archer.png");
    expect(portal.entry.phase).toBe("scriptedMove");
    expect(portal.mapPresentationActionIds).toEqual(["lightning-4"]);
    expect(stage6.preparation?.definition).toMatchObject({ maximumUnits: 9 });
    expect(stage6.assets?.storyBackgrounds).toEqual({
      5: "/assets/original/story-stage6-background-5.png",
      31: "/assets/original/story-stage6-background-31.png",
    });
    expect(stage7.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 0, position: { x: 22, y: 28 } },
        { slot: 1, position: { x: 26, y: 28 } },
      ],
      maximumUnits: 7,
    });
    expect(stage7.retry).toMatchObject({
      mode: "entry",
      statusText: "重新開始第 7 關關前流程。",
    });
    expect(stage7.assets?.storyBackgrounds).toEqual({
      6: "/assets/original/story-stage7-background-6.png",
      7: "/assets/original/story-stage7-background-7.png",
    });
    expect(stage8.createBattle({ ...campaign, stageId: "stage-08" }).stage.id).toBe("stage-08");
    expect(stage8.assets?.storyBackgrounds).toEqual({
      6: "/assets/original/story-stage8-background-6.png",
      7: "/assets/original/story-stage8-background-7.png",
      8: "/assets/original/story-stage8-background-8.png",
    });
    expect(stage8.save.alliedUnits).toEqual({
      kind: "exact-slots",
      slots: [8, 17, 18, 40, 41, 42, 43, 44],
    });
    expect(stage8.save.validEventIds).toEqual([
      "stage-08-prebattle-story",
      "stage-08-opening-story",
      "stage-08-objective-reached",
      "stage-08-victory-story",
      "stage-08-completed-route",
    ]);
    expect(stage9.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 9, position: { x: 16, y: 38 } },
        { slot: 0, position: { x: 17, y: 39 } },
      ],
      maximumUnits: 9,
    });
    expect(stage9.nextStageId).toBe("stage-11");
    expect(stage11.createBattle({ ...campaign, stageId: "stage-11" }).stage.id).toBe("stage-11");
    expect(stage11.nextStageId).toBe("stage-10");
    expect(stage11.save.alliedUnits).toEqual({
      kind: "exact-slots",
      slots: [8, 16, 17, 18, 19, 40, 41, 42],
    });
    expect(stage12.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 23, y: 20 } }],
      maximumUnits: 9,
    });
    expect(stage12.assets?.storyBackgrounds).toEqual({
      10: "/assets/original/story-stage12-background-10.png",
      11: "/assets/original/story-stage12-background-11.png",
      12: "/assets/original/story-stage12-background-12.png",
      13: "/assets/original/story-stage12-background-13.png",
      14: "/assets/original/story-stage12-background-14.png",
    });
    expect(stage12.nextStageId).toBe("stage-13");
    expect(stage13.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 36, y: 37 } }],
      maximumUnits: 12,
    });
    expect(stage13.assets?.storyBackgrounds).toEqual({
      15: "/assets/original/story-stage13-background-15.png",
    });
    expect(stage13.save.enemyClassById).toContainEqual(["2:24", "divine-sword-warrior"]);
    expect(stage13.nextStageId).toBe("stage-14");
    expect(stage14.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
      maximumUnits: 10,
    });
    expect(stage14.save.enemyClassById).toContainEqual(["2:8", "half-dragon-warrior"]);
    expect(stage14.nextStageId).toBe("stage-15");
    expect(stage15.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
      maximumUnits: 10,
    });
    expect(stage15.save.enemyClassById).toContainEqual(["2:9", "half-dragon-warrior"]);
    expect(stage15.nextStageId).toBe("stage-16");
    expect(stage16.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 31 } }],
      maximumUnits: 10,
    });
    expect(stage16.save.enemyClassById).toContainEqual(["2:10", "half-dragon-warrior"]);
    expect(stage16.save.enemyClassById.filter(([, classId]) => classId === "divine-sword-warrior"))
      .toHaveLength(4);
    expect(stage16.nextStageId).toBe("stage-17");
    expect(stage17.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 24 } }],
      maximumUnits: 10,
    });
    expect(stage17.save.enemyClassById).toContainEqual(["2:11", "half-dragon-warrior"]);
    expect(stage17.save.enemyClassById.filter(([, classId]) => classId === "steel-armor-warrior"))
      .toHaveLength(4);
    expect(stage17.nextStageId).toBe("stage-18");
    expect(loadedStageRuntime("stage-02")).toBe(stage2);
    expect(await loadStageRuntime("stage-02")).toBe(stage2);
  });
});
