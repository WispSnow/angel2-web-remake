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
    ]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ ordinal }) => ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.values(STAGE_RUNTIME_MANIFEST).map(({ nextStageId }) => nextStageId)).toEqual([
      "stage-01",
      "stage-02",
      "stage-03",
      "stage-04",
      "stage-05",
    ]);
    expect(isPlayableStageId("stage-03")).toBe(true);
    expect(isPlayableStageId("stage-04")).toBe(true);
    expect(isPlayableStageId("stage-05")).toBe(false);
    expect(stageRuntimeSourceForDestination("stage-04")?.id).toBe("stage-03");
    expect(stageRuntimeSourceForDestination("stage-05")?.id).toBe("stage-04");
    expect(STAGE_RUNTIME_MANIFEST["stage-03"].mapPresentationActionIds).toContain("recovery-1");
  });

  it("loads and caches fixed-stage factories without losing their semantic assets", async () => {
    const stage2 = await loadStageRuntime("stage-02");
    const stage3 = await loadStageRuntime("stage-03");
    const stage4 = await loadStageRuntime("stage-04");
    expect(stage2.createBattle(campaign).stage.id).toBe("stage-02");
    expect(stage3.createBattle({ ...campaign, stageId: "stage-03" }).stage.id).toBe("stage-03");
    expect(stage3.assets?.unitSprites["enemy-monk"]).toContain("unit-enemy-monk.png");
    expect(stage4.preparation?.definition.fixedPlacements.map(({ slot }) => slot)).toEqual([0, 24]);
    expect(stage4.assets?.routePulsePresentations?.[0]).toMatchObject({
      resource: "MAGIC/26",
      frameIndices: [11, 12],
    });
    expect(loadedStageRuntime("stage-02")).toBe(stage2);
    expect(await loadStageRuntime("stage-02")).toBe(stage2);
  });
});
