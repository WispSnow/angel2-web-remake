import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE38_DEFINITION } from "../../src/game/content/stage38";
import {
  createStage38DeploymentRoster,
  Stage38Battle,
} from "../../src/game/simulation/stage38-battle";
import { isSaveData, SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { BattleSaveData, CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-38",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 920, life: 270 },
    { slot: 1, classId: "magic-priest", experience: 720, life: 180 },
  ]),
  recordCounters: Array<number>(75).fill(0),
  rngState: 0x38_38_38_38,
  rngCalls: 38,
};

const fullDeployment = {
  placements: [
    ...STAGE38_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE38_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
      slot, position: { ...STAGE38_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

describe("stage 38 battle simulation", () => {
  it("builds the 20-person force and 44 exact static enemies", () => {
    expect(createStage38DeploymentRoster(campaign)).toHaveLength(29);
    const battle = new Stage38Battle(campaign, fullDeployment);
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(20);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(44);
    expect(battle.unit("1:0")).toMatchObject({ name: "妮雅", x: 29, y: 21 });
    expect(battle.unit("1:1")).toMatchObject({ name: "希蜜", x: 30, y: 21 });
    expect(battle.unit("2:52")).toMatchObject({ classId: "beast-knight", x: 25, y: 26 });
  });

  it("uses pursuit AI and preserves Nia defeat precedence", () => {
    const battle = new Stage38Battle(campaign, fullDeployment);
    expect(battle.enemyAiIntentFor("2:52")).toBe("pursuit");
    battle.units = battle.units.filter(({ side }) => side !== 2);
    expect(battle.outcome()).toBe("victory");
    battle.units = battle.units.filter(({ id }) => id !== "1:0");
    expect(battle.outcome()).toBe("defeat");
  });

  it("rejects deployment that omits either fixed actor", () => {
    expect(() => new Stage38Battle(campaign, {
      placements: fullDeployment.placements.filter(({ slot }) => slot !== 1),
    })).toThrow(/fixed slot 1/i);
  });

  it("accepts the exact stage-38 battle schema and rejects enemy class drift", () => {
    const battle = new Stage38Battle(campaign, fullDeployment);
    const snapshot = battle.serializableSnapshot();
    const save: BattleSaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      savedAt: "2000-01-01T00:00:00.000Z",
      saveCount: 1,
      stageId: "stage-38",
      stageLabel: "異世界",
      ruleset: "stableRemake",
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: battle.campaignSnapshot().roster,
      recordCounters: [...(campaign.recordCounters ?? [])],
      stageProgress: 0,
      consumedEventIds: [
        "stage-38-enter-deployment",
        "stage-38-opening-story",
      ],
      stageEntrySnapshot: campaign,
      battle: {
        phase: "player",
        ...snapshot,
        cursor: { x: 29, y: 21 },
        cameraOrigin: { ...battle.stage.viewport.initialOrigin },
      },
    };
    expect(isSaveData(save)).toBe(true);
    const enemy = save.battle.units.find(({ id }) => id === "2:52");
    if (!enemy) throw new Error("stage 38 save is missing enemy 2:52");
    enemy.classId = "soldier";
    enemy.className = "士兵";
    expect(isSaveData(save)).toBe(false);
  });
});
