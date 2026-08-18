import { describe, expect, it } from "vitest";
import {
  completeCampaignRoster,
  createStage0Units,
  terrainSlotAt,
} from "../../src/game/content/stage0";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  Stage0Battle,
  type BattleScenario,
} from "../../src/game/simulation/battle";
import {
  ForceRegistry,
  type ForceDefinition,
} from "../../src/game/simulation/forces";
import { DeterministicRng } from "../../src/game/simulation/rng";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { BattleUnit, Side } from "../../src/game/types";

const unit = (id: string, side: Side): BattleUnit => ({
  id,
  side,
  slot: Number(id.split(":")[1]),
  classId: "soldier",
  className: "士兵",
  name: id,
  portrait: side === 1 ? 47 : 48,
  x: 0,
  y: 0,
  life: 100,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: emptyUnitStatuses(),
});

const expertForce = (
  id: string,
  side: Side,
  unitIds: readonly string[],
): ForceDefinition => ({
  id,
  side,
  control: side === 1 ? "player" : "independent-ai",
  unitIds,
  doctrine: { strategy: "expert" },
});

describe("force registry", () => {
  it("keeps explicit independent control even when native behavior is zero", () => {
    const scenario: BattleScenario = {
      stage: STAGE0_DEFINITION,
      width: STAGE0_DEFINITION.width,
      height: STAGE0_DEFINITION.height,
      terrainSlotAt,
      createUnits: createStage0Units,
      createCampaignRoster: (difficulty) => completeCampaignRoster(
        createStage0Units(difficulty)
          .filter(({ side }) => side === 1)
          .map(({ slot, classId, experience, life }) => ({
            slot,
            classId,
            experience,
            life,
          })),
      ),
      enemyClassPriority: {},
      alliedBehaviorById: new Map([["1:43", 0]]),
      forces: [
        expertForce("player-force", 1, ["1:0", "1:1", "1:40", "1:41", "1:42"]),
        {
          ...expertForce("allied-npc", 1, ["1:43"]),
          control: "independent-ai",
        },
        expertForce(
          "enemy-force",
          2,
          createStage0Units(0).filter(({ side }) => side === 2).map(({ id }) => id),
        ),
      ],
    };
    const battle = new Stage0Battle(0, new DeterministicRng(1), scenario);

    expect(battle.alliedBehaviorFor("1:43")).toBe(0);
    expect(battle.isPlayerControllableAlly("1:43")).toBe(false);
    expect(battle.alliedActionOrder(false)).toContain("1:43");
    expect(battle.planAlliedAiAction("1:43", "1:0"))
      .toEqual(battle.planAlliedAiAction("1:43"));
    battle.unit("1:43")!.life -= 10;
    battle.restAllUnspentAllies();
    expect(battle.unit("1:43")?.acted).toBe(false);
  });

  it("resolves each corps doctrine and preferred target independently, then uses its fallback", () => {
    const units = [unit("1:1", 1), unit("1:2", 1), unit("2:1", 2), unit("2:2", 2)];
    const definitions: ForceDefinition[] = [
      expertForce("left-allies", 1, ["1:1"]),
      {
        ...expertForce("right-allies", 1, ["1:2"]),
        control: "independent-ai",
        doctrine: {
          strategy: "terrain-hold",
          allowedTerrainSlots: [3, 5],
          entryTerrainSlots: [3],
          restThresholdPercent: 50,
          criticalHealThresholdPercent: 50,
          preserveNativeFormation: true,
        },
      },
      {
        ...expertForce("first-enemies", 2, ["2:1"]),
        targeting: { preferredForceIds: ["left-allies"], fallback: "all-opponents" },
      },
      {
        ...expertForce("second-enemies", 2, ["2:2"]),
        targeting: { preferredForceIds: ["right-allies"], fallback: "wait" },
      },
    ];
    const registry = new ForceRegistry(definitions, units);
    const targetsFor = (unitId: string, availableUnits: readonly BattleUnit[]): BattleUnit[] => {
      const targetFilter = registry.targetFilterFor(unitId, availableUnits);
      if (!targetFilter) throw new Error(`Missing target policy for ${unitId}`);
      return availableUnits.filter(targetFilter);
    };

    expect(registry.definitionForUnit("1:1")?.doctrine.strategy).toBe("expert");
    expect(registry.definitionForUnit("1:2")?.doctrine.strategy).toBe("terrain-hold");
    expect(targetsFor("2:1", units)).toEqual([units[0]]);
    expect(targetsFor("2:2", units)).toEqual([units[1]]);

    const withoutPreferred = units.filter(({ id }) => id !== "1:1");
    expect(targetsFor("2:1", withoutPreferred)).toEqual([units[1]]);
    expect(targetsFor("2:2", withoutPreferred)).toEqual([units[1]]);

    const withoutEitherPreferred = units.filter(({ side }) => side === 2);
    expect(targetsFor("2:2", withoutEitherPreferred)).toEqual([]);
  });

  it("rejects duplicate membership, invalid commanders, friendly targets and invalid doctrine data", () => {
    const units = [unit("1:1", 1), unit("1:2", 1), unit("2:1", 2)];
    expect(() => new ForceRegistry([
      expertForce("one", 1, ["1:1"]),
      expertForce("two", 1, ["1:1"]),
    ], units)).toThrow(/belongs to both/);

    expect(() => new ForceRegistry([{
      ...expertForce("one", 1, ["1:1"]),
      commanderId: "1:2",
    }], units)).toThrow(/not a member/);

    expect(() => new ForceRegistry([
      expertForce("one", 1, ["1:1"]),
    ], units.filter(({ side }) => side === 1))).toThrow(/missing an explicit force assignment/);

    expect(() => new ForceRegistry([
      expertForce("one", 1, ["1:1"]),
      {
        ...expertForce("two", 1, ["1:2"]),
        targeting: { preferredForceIds: ["one"], fallback: "wait" },
      },
    ], units.filter(({ side }) => side === 1))).toThrow(/cannot target friendly force/);

    expect(() => new ForceRegistry([{
      ...expertForce("one", 1, ["1:1"]),
      doctrine: {
        strategy: "terrain-hold",
        allowedTerrainSlots: [3],
        entryTerrainSlots: [5],
        restThresholdPercent: 50,
        criticalHealThresholdPercent: 50,
        preserveNativeFormation: false,
      },
    }], [units[0]])).toThrow(/entry slot outside/);

    // REMAKE-111: a rally point outside the force would send the squad to
    // someone it is not protecting, so it is rejected like a foreign commander.
    expect(() => new ForceRegistry([{
      ...expertForce("one", 1, ["1:1"]),
      doctrine: {
        strategy: "terrain-hold",
        allowedTerrainSlots: [3],
        entryTerrainSlots: [3],
        restThresholdPercent: 50,
        criticalHealThresholdPercent: 50,
        preserveNativeFormation: false,
        rally: { unitId: "1:2", meleeHoldsFire: true },
      },
    }], [units[0]])).toThrow(/Rally unit 1:2 is not a member/);
  });
});
