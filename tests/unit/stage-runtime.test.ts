import { describe, expect, it } from "vitest";
import {
  isPlayableStageId,
  loadStageRuntime,
  loadedStageRuntime,
  stageRuntimeSourceForDestination,
  STAGE_RUNTIME_MANIFEST,
} from "../../src/game/stage-runtime";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE0_ACTION_PRESENTATION_ASSETS } from "../../src/game/content/stage0-actions.generated";
import { presentationActionIdsForClass } from "../../src/game/content/actions";
import { mapActionAtlasIdForAction } from "../../src/game/content/map-action-assets";
import { MAP_ACTION_ATLAS_IDS } from "../../src/game/content/map-action-atlases.generated";
import { collectMapActionSources } from "../../src/game/phaser/map-action-atlas";
import { allyMapUnitAssetsForClasses } from "../../src/game/content/map-unit-assets";
import {
  deferredAllyClassIds,
  stageSimulationEffectFor,
} from "../../src/game/content/stage-effects";
import type { CampaignState, Side, StageId, UnitClassId } from "../../src/game/types";

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
      "stage-18",
      "stage-19",
      "stage-20",
      "stage-21",
      "stage-22",
      "stage-23",
      "stage-24",
      "stage-26",
      "stage-27",
      "stage-28",
      "stage-29",
      "stage-30",
      "stage-31",
      "stage-32",
      "stage-33",
      "stage-34",
      "stage-35",
      "stage-36",
      "stage-37",
      "stage-38",
    ]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ ordinal }) => ordinal))
      .toEqual([0, 1, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
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
      "stage-19",
      "stage-20",
      "stage-21",
      "stage-22",
      "stage-23",
      "stage-24",
      "stage-26",
      "stage-27",
      "stage-28",
      "stage-29",
      "stage-30",
      "stage-31",
      "stage-32",
      "stage-33",
      "stage-34",
      "stage-35",
      "stage-36",
      "stage-37",
      "stage-49",
      "stage-39",
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
      "龍塔第五層",
      "龍塔第六層",
      "龍塔頂部",
      "焦土森林村莊外",
      "焦土森林村莊中",
      "死亡之谷中",
      "死亡之谷城堡前",
      "遭遇碧娜維姬",
      "趕回瓦爾克麗城",
      "保衛瓦爾克麗城",
      "騎士城堡前",
      "治癒維斯塔女帝",
      "前往斯德林海峽",
      "斯德林海峽",
      "拉那洛城外",
      "拉那洛城內",
      "時空異變",
      "異世界的碧娜維姬",
      "究極女神",
      "異世界",
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
        "龍塔第六層",
        "龍塔頂部",
        "焦土森林村莊外",
        "焦土森林村莊中",
        "死亡之谷中",
        "死亡之谷城堡前",
        "遭遇碧娜維姬",
        "趕回瓦爾克麗城",
        "保衛瓦爾克麗城",
        "騎士城堡前",
        "治癒維斯塔女帝",
        "前往斯德林海峽",
        "斯德林海峽",
        "拉那洛城外",
        "拉那洛城內",
        "時空異變",
        "異世界的碧娜維姬",
        "究極女神",
        "主線結局",
        "製作人員表",
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
    expect(isPlayableStageId("stage-18")).toBe(true);
    expect(isPlayableStageId("stage-19")).toBe(true);
    expect(isPlayableStageId("stage-20")).toBe(true);
    expect(isPlayableStageId("stage-21")).toBe(true);
    expect(isPlayableStageId("stage-22")).toBe(true);
    expect(isPlayableStageId("stage-23")).toBe(true);
    expect(isPlayableStageId("stage-24")).toBe(true);
    expect(isPlayableStageId("stage-26")).toBe(true);
    expect(isPlayableStageId("stage-27")).toBe(true);
    expect(isPlayableStageId("stage-28")).toBe(true);
    expect(isPlayableStageId("stage-29")).toBe(true);
    expect(isPlayableStageId("stage-30")).toBe(true);
    expect(isPlayableStageId("stage-31")).toBe(true);
    expect(isPlayableStageId("stage-32")).toBe(true);
    expect(isPlayableStageId("stage-33")).toBe(true);
    expect(isPlayableStageId("stage-34")).toBe(true);
    expect(isPlayableStageId("stage-35")).toBe(true);
    expect(isPlayableStageId("stage-36")).toBe(true);
    expect(isPlayableStageId("stage-37")).toBe(true);
    expect(isPlayableStageId("stage-38")).toBe(true);
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
    expect(stageRuntimeSourceForDestination("stage-19")?.id).toBe("stage-18");
    expect(stageRuntimeSourceForDestination("stage-20")?.id).toBe("stage-19");
    expect(stageRuntimeSourceForDestination("stage-21")?.id).toBe("stage-20");
    expect(stageRuntimeSourceForDestination("stage-22")?.id).toBe("stage-21");
    expect(stageRuntimeSourceForDestination("stage-23")?.id).toBe("stage-22");
    expect(stageRuntimeSourceForDestination("stage-24")?.id).toBe("stage-23");
    expect(stageRuntimeSourceForDestination("stage-26")?.id).toBe("stage-24");
    expect(stageRuntimeSourceForDestination("stage-27")?.id).toBe("stage-26");
    expect(stageRuntimeSourceForDestination("stage-28")?.id).toBe("stage-27");
    expect(stageRuntimeSourceForDestination("stage-29")?.id).toBe("stage-28");
    expect(stageRuntimeSourceForDestination("stage-30")?.id).toBe("stage-29");
    expect(stageRuntimeSourceForDestination("stage-31")?.id).toBe("stage-30");
    expect(stageRuntimeSourceForDestination("stage-32")?.id).toBe("stage-31");
    expect(stageRuntimeSourceForDestination("stage-33")?.id).toBe("stage-32");
    expect(stageRuntimeSourceForDestination("stage-34")?.id).toBe("stage-33");
    expect(stageRuntimeSourceForDestination("stage-35")?.id).toBe("stage-34");
    expect(stageRuntimeSourceForDestination("stage-36")?.id).toBe("stage-35");
    expect(stageRuntimeSourceForDestination("stage-37")?.id).toBe("stage-36");
    expect(stageRuntimeSourceForDestination("stage-49")?.id).toBe("stage-37");
    expect(stageRuntimeSourceForDestination("stage-39")?.id).toBe("stage-38");
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
    const stage18 = await loadStageRuntime("stage-18");
    const stage19 = await loadStageRuntime("stage-19");
    const stage20 = await loadStageRuntime("stage-20");
    const stage21 = await loadStageRuntime("stage-21");
    const stage22 = await loadStageRuntime("stage-22");
    const stage23 = await loadStageRuntime("stage-23");
    const stage24 = await loadStageRuntime("stage-24");
    const stage26 = await loadStageRuntime("stage-26");
    const stage27 = await loadStageRuntime("stage-27");
    const stage28 = await loadStageRuntime("stage-28");
    const stage29 = await loadStageRuntime("stage-29");
    const stage30 = await loadStageRuntime("stage-30");
    const stage31 = await loadStageRuntime("stage-31");
    const stage32 = await loadStageRuntime("stage-32");
    const stage33 = await loadStageRuntime("stage-33");
    const stage34 = await loadStageRuntime("stage-34");
    const stage35 = await loadStageRuntime("stage-35");
    const stage36 = await loadStageRuntime("stage-36");
    const stage37 = await loadStageRuntime("stage-37");
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
      6: "/assets/original/story-stage7-background-6.png",
      7: "/assets/original/story-stage7-background-7.png",
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
      10: "/assets/original/story-stage10-background-10.png",
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
    expect(stage18.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 33 } }],
      maximumUnits: 8,
    });
    expect(stage18.save.enemyClassById).toContainEqual(["2:12", "half-dragon-warrior"]);
    expect(stage18.save.enemyClassById.filter(([, classId]) => classId === "divine-sword-warrior"))
      .toHaveLength(6);
    expect(stage18.nextStageId).toBe("stage-19");
    expect(stage19.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 33 } }],
      maximumUnits: 10,
    });
    expect(stage19.save.enemyClassById).toContainEqual(["2:13", "half-dragon-warrior"]);
    expect(stage19.save.enemyClassById.filter(([, classId]) => classId === "steel-armor-warrior"))
      .toHaveLength(7);
    expect(stage19.nextStageId).toBe("stage-20");
    expect(stage20.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 32, position: { x: 28, y: 14 } },
        { slot: 0, position: { x: 30, y: 18 } },
        { slot: 24, position: { x: 31, y: 19 } },
      ],
      maximumUnits: 17,
    });
    expect(stage20.save.enemyClassById).toEqual([["2:28", "dragon"]]);
    expect(stage20.mapPresentationActionIds).toContain("wd");
    expect(stage20.nextStageId).toBe("stage-21");
    expect(stage21.createBattle({ ...campaign, stageId: "stage-21" }).units).toEqual([]);
    expect(stage21.assets?.storyBackgrounds).toEqual({
      16: "/assets/original/story-stage21-background-16.png",
    });
    expect(stage21.save.alliedUnits).toEqual({
      kind: "exact-slots",
      slots: [0, 1, 24, 8],
    });
    expect(stage21.nextStageId).toBe("stage-22");
    expect(stage22.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 23, y: 34 } }],
      maximumUnits: 19,
    });
    expect(stage22.preparation?.presentation.enemies).toEqual([]);
    expect(stage22.save.enemyClassById).toEqual([
      ["2:2", "magic-priest"], ["2:28", "dragon"],
      ["2:40", "magic-priest"], ["2:41", "magic-priest"],
      ["2:42", "magic-priest"], ["2:43", "magic-priest"],
    ]);
    expect(stage22.nextStageId).toBe("stage-23");
    expect(stage23.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 25, y: 38 } }],
      maximumUnits: 15,
    });
    expect(stage23.preparation?.presentation.enemies).toHaveLength(21);
    expect(stage23.entry).toMatchObject({ phase: "deployment", trigger: "campaign-entered" });
    expect(stage23.save.enemyClassById).toHaveLength(21);
    expect(stage23.save.enemyClassById).toContainEqual(["2:34", "magic-archer"]);
    expect(stage23.save.enemyClassById).toContainEqual(["2:48", "steel-armor-warrior"]);
    expect(stage23.retry.mode).toBe("preparation");
    expect(stage23.nextStageId).toBe("stage-24");
    expect(stage24.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 27, y: 39 } }],
      maximumUnits: 15,
    });
    expect(stage24.preparation?.presentation.enemies).toHaveLength(22);
    expect(stage24.entry).toMatchObject({ phase: "deployment", trigger: "campaign-entered" });
    expect(stage24.save.enemyClassById).toHaveLength(22);
    expect(stage24.save.enemyClassById).toContainEqual(["2:31", "bone-knight"]);
    expect(stage24.save.enemyClassById).toContainEqual(["2:35", "demon-dragon-knight"]);
    expect(stage24.retry.mode).toBe("preparation");
    expect(stage24.nextStageId).toBe("stage-26");
    expect(stage26.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 1, position: { x: 19, y: 31 } },
        { slot: 0, position: { x: 22, y: 31 } },
        { slot: 8, position: { x: 26, y: 31 } },
        { slot: 7, position: { x: 30, y: 31 } },
      ],
      maximumUnits: 22,
    });
    expect(stage26.preparation?.presentation.enemies).toHaveLength(8);
    expect(stage26.entry).toMatchObject({ phase: "deployment", trigger: "campaign-entered" });
    expect(stage26.save.enemyClassById).toHaveLength(8);
    expect(stage26.save.enemyClassById).toContainEqual(["2:1", "magic-master"]);
    expect(stage26.assets?.enemyPhaseTailPresentations?.[0]).toMatchObject({
      id: "stage-26-column-push-presentation",
      phase1: { waitPerDescriptorNativeTicks: 15 },
      phase2: { waitPerDescriptorNativeTicks: 15 },
      sweep: { waitPerDescriptorNativeTicks: 5 },
    });
    expect(stage26.retry.mode).toBe("preparation");
    expect(stage26.nextStageId).toBe("stage-27");
    expect(stage27.preparation?.definition).toMatchObject({
      fixedPlacements: expect.arrayContaining([
        { slot: 0, position: { x: 39, y: 37 } },
        { slot: 22, position: { x: 20, y: 11 } },
        { slot: 57, position: { x: 35, y: 35 } },
      ]),
      maximumUnits: 31,
    });
    expect(stage27.preparation?.presentation.enemies).toHaveLength(5);
    expect(stage27.entry).toMatchObject({ phase: "deployment", trigger: "campaign-entered" });
    // Five static rebels plus the ten REMAKE-153 pursuer slots 30..39.
    expect(stage27.save.enemyClassById).toHaveLength(15);
    expect(stage27.save.enemyClassById).toContainEqual(["2:40", "magic-sword-warrior"]);
    expect(stage27.save.enemyClassById).toContainEqual(["2:30", "pegasus-warrior"]);
    expect(stage27.save.enemyClassById).toContainEqual(["2:36", "great-axe-warrior"]);
    expect(stage27.save.namedUnits).toEqual([{
      match: { kind: "unit", unitId: "1:22", side: 1, slot: 22 },
      displayIdentity: "named-class-portrait",
      name: "愛莉歐拉",
      portrait: "class-fallback",
    }]);
    expect(stage27.retry.mode).toBe("preparation");
    expect(stage27.nextStageId).toBe("stage-28");
    expect(stage28.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 28, y: 24 } }],
      maximumUnits: 29,
    });
    expect(stage28.preparation?.definition.openCells).toHaveLength(34);
    expect(stage28.preparation?.presentation.enemies).toHaveLength(17);
    expect(stage28.entry).toMatchObject({
      phase: "prebattleStory",
      trigger: "campaign-entered",
    });
    expect(stage28.save.enemyClassById).toHaveLength(17);
    expect(stage28.save.enemyClassById).toContainEqual(["2:41", "demon-dragon-knight"]);
    expect(stage28.save.enemyClassById).toContainEqual(["2:50", "evil-sword-warrior"]);
    expect(stage28.assets?.storyBackground)
      .toBe("/assets/original/story-stage28-background-22.png");
    expect(stage28.retry.mode).toBe("entry");
    expect(stage28.nextStageId).toBe("stage-29");
    expect(stage29.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 41, y: 26 } }],
      maximumUnits: 15,
    });
    expect(stage29.preparation?.definition.openCells).toHaveLength(14);
    expect(stage29.preparation?.definition.optionalSlots).toHaveLength(29);
    expect(stage29.preparation?.definition.optionalSlots).toContain(22);
    expect(stage29.preparation?.presentation.enemies).toHaveLength(15);
    expect(stage29.entry).toMatchObject({
      phase: "prebattleStory",
      trigger: "campaign-entered",
    });
    expect(stage29.save.validEventIds).toEqual([
      "stage-29-prebattle-story",
      "stage-29-enter-deployment",
      "stage-29-objective-reached",
      "stage-29-completed-route",
    ]);
    expect(stage29.save.requiredResumeEventIds).toEqual([
      "stage-29-prebattle-story",
      "stage-29-enter-deployment",
    ]);
    expect(stage29.save.enemyClassById).toHaveLength(15);
    expect(stage29.save.enemyClassById).toContainEqual(["2:4", "demon-dragon-knight"]);
    expect(stage29.save.enemyClassById.filter(([, classId]) => classId === "magic-archer"))
      .toHaveLength(5);
    expect(stage29.assets?.storyBackground)
      .toBe("/assets/original/story-stage29-background-23.png");
    expect(stage29.assets?.map).toBe("/assets/original/stage29-map.png");
    expect(stage29.assets?.minimap).toBe("/assets/original/stage29-minimap.png");
    expect(stage29.retry.mode).toBe("entry");
    expect(stage29.nextStageId).toBe("stage-30");
    expect(stage30.createBattle({ ...campaign, stageId: "stage-30" }).stage.id).toBe("stage-30");
    expect(stage30.preparation).toBeUndefined();
    expect(stage30.entry).toMatchObject({
      phase: "prebattleStory",
      trigger: "campaign-entered",
    });
    expect(stage30.save.alliedUnits).toEqual({ kind: "exact-slots", slots: [0, 7, 40] });
    expect(stage30.save.enemyClassById).toEqual([]);
    expect(stage30.save.enemyFormSequences?.[0]).toMatchObject({
      unitId: "2:27",
      experience: 0,
    });
    expect(stage30.save.enemyFormSequences?.[0]?.classIdsByDifficulty.map(({ length }) => length))
      .toEqual([8, 16, 24, 32]);
    expect(stage30.assets?.storyBackground)
      .toBe("/assets/original/story-stage29-background-23.png");
    expect(stage30.assets?.unitSprites["enemy-empress"]).toContain("enemy-empress.png");
    expect(stage30.retry.mode).toBe("entry");
    expect(stage30.nextStageId).toBe("stage-31");
    expect(stage31.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 4, position: { x: 25, y: 12 } },
        { slot: 3, position: { x: 22, y: 14 } },
        { slot: 2, position: { x: 27, y: 14 } },
        { slot: 1, position: { x: 25, y: 15 } },
        { slot: 0, position: { x: 26, y: 33 } },
      ],
      maximumUnits: 17,
    });
    expect(stage31.preparation?.definition.openCells).toHaveLength(12);
    expect(stage31.preparation?.presentation.enemies).toHaveLength(15);
    expect(stage31.save.enemyClassById).toHaveLength(15);
    expect(stage31.assets?.storyBackground)
      .toBe("/assets/original/story-stage29-background-23.png");
    expect(stage31.nextStageId).toBe("stage-32");
    expect(stage32.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 26, y: 28 } }],
      maximumUnits: 16,
    });
    expect(stage32.preparation?.definition.openCells).toHaveLength(15);
    expect(stage32.preparation?.definition.optionalSlots).toHaveLength(28);
    expect(stage32.preparation?.presentation.enemies).toHaveLength(18);
    expect(stage32.save.enemyClassById).toHaveLength(18);
    expect(stage32.save.enemyClassById).toContainEqual(["2:6", "demon-dragon-knight"]);
    expect(stage32.assets?.storyBackground).toBeUndefined();
    expect(stage32.assets?.map).toBe("/assets/original/stage32-map.png");
    expect(stage32.retry.mode).toBe("preparation");
    expect(stage32.nextStageId).toBe("stage-33");
    expect(stage33.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 27, y: 44 } }],
      maximumUnits: 10,
    });
    expect(stage33.preparation?.definition.openCells).toHaveLength(9);
    expect(stage33.preparation?.definition.optionalSlots).toHaveLength(28);
    expect(stage33.preparation?.presentation.enemies).toHaveLength(29);
    expect(stage33.save.enemyClassById).toHaveLength(29);
    expect(stage33.save.enemyClassById).toContainEqual(["2:55", "demon-dragon-knight"]);
    expect(stage33.save.namedUnits).toEqual([
      {
        match: { kind: "unit", unitId: "2:23", side: 2, slot: 23 },
        name: "阿莉絲",
        portrait: 30,
      },
      {
        match: { kind: "unit", unitId: "2:24", side: 2, slot: 24 },
        name: "瑪西爾",
        portrait: 31,
      },
    ]);
    expect(stage33.assets?.storyBackground).toBeUndefined();
    expect(stage33.assets?.map).toBe("/assets/original/stage33-map.png");
    expect(stage33.retry.mode).toBe("preparation");
    expect(stage33.nextStageId).toBe("stage-34");
    expect(stage34.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 30, y: 21 } }],
      maximumUnits: 11,
    });
    expect(stage34.preparation?.definition.openCells).toHaveLength(10);
    expect(stage34.preparation?.definition.optionalSlots).toHaveLength(28);
    expect(stage34.preparation?.presentation.enemies).toHaveLength(19);
    expect(stage34.save.enemyClassById).toHaveLength(19);
    expect(stage34.save.enemyClassById).toContainEqual(["2:7", "evil-sword-warrior"]);
    expect(stage34.assets?.storyBackground).toBeUndefined();
    expect(stage34.assets?.map).toBe("/assets/original/stage34-map.png");
    expect(stage34.retry.mode).toBe("preparation");
    expect(stage34.nextStageId).toBe("stage-35");
    expect(stage35.preparation).toBeUndefined();
    expect(stage35.createBattle({ ...campaign, stageId: "stage-35" }).units).toHaveLength(19);
    expect(stage35.save.alliedUnits).toEqual({
      kind: "exact-slots",
      slots: [0, 1, 2, 3, 4, 5, 7, 8, 18],
    });
    expect(stage35.save.enemyClassById).toHaveLength(10);
    expect(stage35.save.enemyClassById).toContainEqual(["2:38", "demon-dragon-knight"]);
    expect(stage35.assets?.storyBackground).toBeUndefined();
    expect(stage35.assets?.map).toBe("/assets/original/stage35-map.png");
    expect(stage35.retry.mode).toBe("entry");
    expect(stage35.nextStageId).toBe("stage-36");
    expect(stage36.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 24, y: 27 } }],
      maximumUnits: 28,
    });
    expect(stage36.preparation?.definition.openCells).toHaveLength(27);
    expect(stage36.preparation?.definition.optionalSlots).toHaveLength(28);
    expect(stage36.preparation?.presentation.enemies).toHaveLength(30);
    expect(stage36.save.enemyClassById).toHaveLength(30);
    expect(stage36.save.enemyClassById).toContainEqual(["2:1", "wizard"]);
    expect(stage36.assets?.storyBackground).toBeUndefined();
    expect(stage36.assets?.map).toBe("/assets/original/stage36-map.png");
    expect(stage36.retry.mode).toBe("preparation");
    expect(stage36.nextStageId).toBe("stage-37");
    expect(stage37.preparation?.definition).toMatchObject({
      fixedPlacements: [{ slot: 0, position: { x: 23, y: 17 } }],
      maximumUnits: 27,
    });
    expect(stage37.preparation?.definition.openCells).toHaveLength(26);
    expect(stage37.preparation?.presentation.enemies).toHaveLength(3);
    expect(stage37.save.enemyClassById).toEqual([
      ["2:56", "head"], ["2:54", "hand"], ["2:55", "hand"],
    ]);
    expect(stage37.assets?.map).toBe("/assets/original/stage37-map.png");
    expect(stage37.nextStageId).toBe("stage-49");
    const stage38 = await loadStageRuntime("stage-38");
    expect(stage38.preparation?.definition).toMatchObject({
      fixedPlacements: [
        { slot: 0, position: { x: 29, y: 21 } },
        { slot: 1, position: { x: 30, y: 21 } },
      ],
      maximumUnits: 20,
    });
    expect(stage38.preparation?.definition.openCells).toHaveLength(18);
    expect(stage38.preparation?.presentation.enemies).toHaveLength(44);
    expect(stage38.save.enemyClassById).toHaveLength(44);
    expect(stage38.assets?.map).toBe("/assets/original/stage38-map.png");
    expect(stage38.nextStageId).toBe("stage-39");
    expect(loadedStageRuntime("stage-02")).toBe(stage2);
    expect(await loadStageRuntime("stage-02")).toBe(stage2);
  });

  it("carries the campaign record counters into every rebuilt battle", async () => {
    // Regression: the per-stage constructors only receive difficulty, roster,
    // and RNG, so a battle rebuilt at deployment confirm or retreat used to
    // restart from zeroed counters and silently discarded every earlier stage's
    // 戰績 before the stage-49 ending read them.
    const counters = Array<number>(75).fill(0);
    counters[0] = 41;
    counters[7] = 13;
    for (const stageId of Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[]) {
      const runtime = await loadStageRuntime(stageId);
      const entry = {
        ...campaign,
        stageId,
        difficulty: 0 as const,
        roster: completeCampaignRoster([]),
        recordCounters: [...counters],
      };
      const battle = runtime.createBattle(entry, runtime.preparation?.createInitialResult());
      expect(battle.campaignSnapshot().recordCounters?.slice(0, 8))
        .toEqual([41, 0, 0, 0, 0, 0, 0, 13]);
      if (!runtime.preparation) continue;
      // The deployment-confirm rebuild takes the same path with a real result.
      const deployed = runtime.createBattle(entry, runtime.preparation.createInitialResult());
      expect(deployed.campaignSnapshot().recordCounters?.[0]).toBe(41);
    }
  });

  /**
   * Regression: `restartBattle` answers `skip-entry-story` by calling
   * `createBattle(snapshot)` with no deployment result, which every deployment
   * stage rejects outright. Stage 20 shipped with that mode, so 全面撤退 and the
   * defeat retry both threw before they could reach the deployment surface —
   * the confirm looked dead and only 取消 responded. A stage that owns a
   * preparation surface must retry through `entry` or `preparation`.
   */
  it("never gives a deployment stage the fixed-roster retry mode", async () => {
    for (const stageId of Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[]) {
      const runtime = await loadStageRuntime(stageId);
      if (!runtime.preparation) continue;
      expect(STAGE_RUNTIME_MANIFEST[stageId].retry.mode, stageId).not.toBe("skip-entry-story");
    }
    expect(STAGE_RUNTIME_MANIFEST["stage-20"].retry).toMatchObject({
      mode: "preparation",
      retreatStatusText: "全面撤退：返回龍塔頂部部署並重新編隊。",
    });
  });

  /**
   * The battle scene schedules one ally figure per class it expects on the
   * board, and the stage resource gate stages exactly the roster closure plus
   * the stage's own `unitSprites`. Anything outside that pair reaches Phaser
   * as a raw `/assets/original` URL after the loading page is gone — or, when
   * nothing schedules it at all, as Phaser's missing-texture placeholder,
   * which is how stage 21's four scouts shipped.
   */
  it("stages an ally figure for every class its scene can put on the board", async () => {
    const roster = completeCampaignRoster([]);
    const missing: string[] = [];
    for (const stageId of Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[]) {
      const runtime = await loadStageRuntime(stageId);
      const battle = runtime.createBattle(
        { ...campaign, stageId, roster },
        runtime.preparation?.createInitialResult(),
      );
      const staged = new Set<string>([
        ...allyMapUnitAssetsForClasses(roster.map(({ classId }) => classId)).values(),
        ...Object.values(runtime.assets?.unitSprites ?? {}),
      ]);
      const sceneClassIds = [...new Set<UnitClassId>([
        ...battle.units.filter(({ side }) => side === 1).map(({ classId }) => classId),
        ...deferredAllyClassIds(runtime.definition.events, {
          unit: (id) => battle.unit(id),
          rosterClassId: (slot) => roster.find((entry) => entry.slot === slot)?.classId,
        }),
      ])];
      for (const [classId, source] of allyMapUnitAssetsForClasses(sceneClassIds)) {
        if (!staged.has(source)) missing.push(`${stageId}: ${classId} → ${source}`);
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * `BattleScene` preloads map-action atlases once, from the stage manifest.
   * A unit that reaches the board later cannot add one, so an action whose
   * atlas was never listed throws inside the render — the controller's
   * fallback then leaves the presentation frozen and the enemy phase never
   * finishes. Stage 22 shipped exactly that way: its demon dragon arrives by
   * story reinforcement and `WD` was missing from the list.
   *
   * The reachable set is deliberately the units the stage really writes —
   * board entries, story reinforcements and form transitions — not the whole
   * promotion closure, which no released stage can traverse inside one battle.
   */
  it("preloads a map-action atlas for every action its reachable units can present", async () => {
    /**
     * Two stages carry a caster that never reaches an interactive phase, so
     * none of its actions can be presented: `stage-42-portal` is a scripted
     * interlude that routes out without ever handing the board to a side
     * phase, and stage 30's empress is rewritten into a soldier by the
     * opening form transition before the player takes control. Naming them
     * keeps the rule strict everywhere the board is actually played.
     */
    const CUTSCENE_ONLY_CASTERS: Readonly<Partial<Record<StageId, readonly UnitClassId[]>>> = {
      "stage-42-portal": ["empress", "magic-priest"],
      "stage-30": ["empress"],
    };
    const atlasIds = new Set<string>(MAP_ACTION_ATLAS_IDS);
    const alwaysLoaded = new Set(collectMapActionSources(STAGE0_ACTION_PRESENTATION_ASSETS)
      .map((source) => source.slice("/assets/original/map-actions/".length))
      .map((relative) => relative.slice(0, relative.indexOf("/"))));
    const missing: string[] = [];
    for (const stageId of Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[]) {
      const runtime = await loadStageRuntime(stageId);
      const battle = runtime.createBattle(
        { ...campaign, stageId, roster: completeCampaignRoster([]) },
        runtime.preparation?.createInitialResult(),
      );
      const reachable = new Map<string, { classId: UnitClassId; side: Side }>();
      const add = (classId: UnitClassId, side: Side) =>
        reachable.set(`${classId}:${side}`, { classId, side });
      for (const unit of battle.units) add(unit.classId, unit.side);
      for (const event of runtime.definition.events) {
        if (event.simulationEffect === "none") continue;
        const effect = stageSimulationEffectFor(event.simulationEffect);
        if (effect?.type === "unit-form-transition") {
          const side = battle.unit(effect.actorId)?.side;
          if (side) add(effect.targetClassId, side);
        }
        if (effect?.type !== "story-reinforcements") continue;
        for (const actor of effect.actors) {
          if (actor.forcedClassId) add(actor.forcedClassId, actor.source.side);
        }
      }
      const preloaded = new Set([
        ...alwaysLoaded,
        ...runtime.mapPresentationActionIds.map(mapActionAtlasIdForAction),
      ]);
      const inert = CUTSCENE_ONLY_CASTERS[stageId] ?? [];
      for (const classId of inert) {
        expect([...reachable.values()].some((entry) => entry.classId === classId), stageId)
          .toBe(true);
      }
      for (const { classId, side } of reachable.values()) {
        if (inert.includes(classId)) continue;
        for (const actionId of presentationActionIdsForClass(classId, side)) {
          const atlasId = mapActionAtlasIdForAction(actionId);
          // Actions without their own atlas (the `1N` teleport) draw nothing.
          if (!atlasIds.has(atlasId) || preloaded.has(atlasId)) continue;
          missing.push(`${stageId}: ${classId} side ${side} needs ${atlasId} for ${actionId}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(STAGE_RUNTIME_MANIFEST["stage-20"].mapPresentationActionIds).toContain("wd");
    expect(STAGE_RUNTIME_MANIFEST["stage-22"].mapPresentationActionIds).toContain("wd");
  });
});
