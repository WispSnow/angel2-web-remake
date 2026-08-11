import { describe, expect, it } from "vitest";
import {
  STAGE20_DEFINITION,
  STAGE20_SEMANTIC_DRAGON,
  STAGE20_SEMANTIC_ENEMY_UNITS,
} from "../../src/game/content/stage20";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { createFixedStageEnemy } from "../../src/game/simulation/fixed-stage-battle";
import {
  createStage20DeploymentRoster,
  Stage20Battle,
} from "../../src/game/simulation/stage20-battle";
import type { CampaignState } from "../../src/game/types";

const campaign = (): CampaignState => ({
  stageId: "stage-20",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([]),
  rngState: 0x20_20_20_20,
  rngCalls: 0,
});

const fullDeployment = () => ({
  placements: [
    ...STAGE20_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE20_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
      slot,
      position: { ...STAGE20_DEFINITION.deployment.openCells[index] },
      fixed: false,
    })),
  ],
});

function replaceTableauWithDragon(battle: Stage20Battle): void {
  battle.removeStoryUnits(STAGE20_SEMANTIC_ENEMY_UNITS.map(({ slot }) => ({ side: 2, slot })));
  const dragon = createFixedStageEnemy({
    slot: STAGE20_SEMANTIC_DRAGON.slot,
    position: STAGE20_SEMANTIC_DRAGON.position,
    classId: STAGE20_SEMANTIC_DRAGON.classId,
    name: STAGE20_SEMANTIC_DRAGON.name,
    portrait: STAGE20_SEMANTIC_DRAGON.portrait,
    aiBehavior: STAGE20_SEMANTIC_DRAGON.aiBehavior,
  }, battle.difficulty);
  battle.appendStoryUnits([dragon], [{ sourceUnitId: "2:55", derivedUnitId: dragon.id }]);
}

describe("stage 20 battle", () => {
  it("builds three fixed allies, fourteen optional allies, and the 16-unit narrative tableau", () => {
    const state = campaign();
    const roster = createStage20DeploymentRoster(state);
    expect(roster).toHaveLength(23);
    expect(roster.find(({ slot }) => slot === 32)).toMatchObject({
      name: "守護者", portrait: 65, classId: "prayer-guide",
    });
    const battle = new Stage20Battle(state, fullDeployment());
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(17);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(16);
    expect(battle.unit("1:32")).toMatchObject({ x: 28, y: 14, classId: "prayer-guide" });
    expect(battle.isPlayerControllableAlly("1:32")).toBe(true);
    expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 32)).toMatchObject({
      classId: "soldier", experience: 0,
    });
  });

  it("inherits the tableau force for the dragon and lets expert AI choose WD", () => {
    const battle = new Stage20Battle(campaign(), fullDeployment());
    const guardian = battle.unit("1:32");
    if (!guardian) throw new Error("guardian missing");
    guardian.x = 28;
    guardian.y = 17;
    replaceTableauWithDragon(battle);

    const dragon = battle.unit("2:28");
    expect(dragon).toMatchObject({ classId: "dragon", name: "妖龍", life: 2_400 });
    expect(battle.outcome()).toBe("ongoing");
    expect(battle.planSpecialAiAction("2:28", "wd")).toMatchObject({
      unitId: "2:28",
      kind: "special",
      actionId: "wd",
    });
  });

  it("rebuilds the dragon force membership before validating a restored player save", () => {
    const state = campaign();
    const battle = new Stage20Battle(state, fullDeployment());
    replaceTableauWithDragon(battle);
    const snapshot = battle.serializableSnapshot();
    const restored = new Stage20Battle(state, fullDeployment());
    expect(() => restored.restore(snapshot, state.roster)).not.toThrow();
    expect(restored.unit("2:28")?.classId).toBe("dragon");
  });
});
