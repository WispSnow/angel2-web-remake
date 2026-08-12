import { beforeAll, describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE22_DEFINITION } from "../../src/game/content/stage22";
import { activateStage1Content } from "../../src/game/content/stage1";
import {
  BATTLE_ACTION_DEFINITIONS,
  HALF_DRAGON_TELEPORT_ACTION_ID,
  techniqueActionIdsFor,
} from "../../src/game/content/actions";
import { classDefinition, movementRulesFor } from "../../src/game/content/classes";
import { techniqueSelectionRange } from "../../src/game/simulation/actions/range-map";
import { Stage22Battle } from "../../src/game/simulation/stage22-battle";
import type { CampaignState, Position } from "../../src/game/types";

beforeAll(() => activateStage1Content());

const campaign: CampaignState = {
  stageId: "stage-22",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 720, life: 240 },
  ]),
  rngState: 0x22_22_22_22,
  rngCalls: 12,
};

/** Scene 22 overwrites deployable side-1 slots 25–31 with the class. */
const HALF_DRAGON_SLOTS = [25, 26, 27, 28, 29, 30, 31] as const;

const fullDeployment = {
  placements: [
    ...STAGE22_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...HALF_DRAGON_SLOTS.map((slot, index) => ({
      slot, position: { ...STAGE22_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

const createStage22 = (): Stage22Battle => new Stage22Battle(campaign, fullDeployment);

const halfDragonIn = (battle: Stage22Battle) => {
  const actor = battle.units.find(({ classId, side }) =>
    side === 1 && classId === "half-dragon-warrior");
  expect(actor, "stage 22 deploys at least one half-dragon warrior").toBeDefined();
  return actor!;
};

describe("half-dragon teleport (BAT-068 / REMAKE-062)", () => {
  it("offers exactly one unnamed native technique at every growth row", () => {
    const definition = classDefinition("half-dragon-warrior");
    expect(definition.actionCategory).toBe("technique");
    expect(definition.technique).toBeNull();
    expect(definition.directTechnique).toMatchObject({
      classCode: "1N",
      rangeSeed: 200,
      rangePropagationMode: "0",
      target: "empty-cell",
      endsActivation: true,
      grantsExperience: false,
    });

    // The native branch at 0000:702D never reads the DS:524C tier selector, so
    // every growth row exposes the same single action.
    for (const row of definition.dataRows.slice(0, 3)) {
      expect(techniqueActionIdsFor({
        classId: "half-dragon-warrior",
        experience: row.experienceThreshold,
      })).toEqual([HALF_DRAGON_TELEPORT_ACTION_ID]);
    }

    const action = BATTLE_ACTION_DEFINITIONS[HALF_DRAGON_TELEPORT_ACTION_ID];
    expect(action.nativeCode).toBeNull();
    expect(action.label).toBe("傳送");
    expect(action.range.nativeSeed).toBe(200);
  });

  it("floods at a flat cost of one and stops only at movement rule 99", () => {
    const rules = movementRulesFor("half-dragon-warrior");
    const blockedSlot = rules.findIndex((rule) => rule === 99);
    const openSlot = rules.findIndex((rule) => rule === 1);
    expect(blockedSlot).toBeGreaterThanOrEqual(0);
    expect(openSlot).toBeGreaterThanOrEqual(0);

    // A wall of rule-99 terrain at x=2 seals the right-hand strip off. Mode `0`
    // never enters a 99 cell, so the seed cannot leak past it.
    const walled = {
      width: 6,
      height: 3,
      terrainSlotAt: ({ x }: Position) => (x === 2 ? blockedSlot : openSlot),
    };
    const range = techniqueSelectionRange(
      { x: 0, y: 1, classId: "half-dragon-warrior" },
      walled,
      200,
    );
    expect(range.valueAt({ x: 0, y: 1 })).toBe(200);
    // Flat cost of one per step regardless of the terrain's own rule value.
    expect(range.valueAt({ x: 1, y: 1 })).toBe(199);
    expect(range.valueAt({ x: 0, y: 0 })).toBe(199);
    expect(range.valueAt({ x: 1, y: 0 })).toBe(198);
    expect(range.valueAt({ x: 2, y: 1 })).toBe(0);
    for (let x = 3; x < 6; x += 1) {
      for (let y = 0; y < 3; y += 1) expect(range.valueAt({ x, y })).toBe(0);
    }
  });

  it("crosses occupied cells while refusing them as landings", () => {
    const battle = createStage22();
    const actor = halfDragonIn(battle);
    const range = battle.actionRange(actor.id, HALF_DRAGON_TELEPORT_ACTION_ID);
    const targets = battle.actionTargetCells(actor.id, HALF_DRAGON_TELEPORT_ACTION_ID);
    const occupied = battle.units.filter(({ id }) => id !== actor.id);

    expect(occupied.length).toBeGreaterThan(0);
    for (const unit of occupied) {
      // Propagation ignores the side map, so allied bodies still carry a value.
      expect(range.valueAt(unit), `${unit.id} range value`).toBeGreaterThan(0);
      expect(targets).not.toContainEqual({ x: unit.x, y: unit.y });
    }
    expect(targets).not.toContainEqual({ x: actor.x, y: actor.y });
    expect(targets.length).toBe(range.cells().length - battle.units.length);

    // Every reachable cell must be terrain the class may enter.
    const rules = movementRulesFor("half-dragon-warrior");
    for (const cell of range.cells()) {
      expect(rules[battle.terrainSlotAt(cell)], `${cell.x},${cell.y}`).not.toBe(99);
    }

    // The presentation replays the native buffer backwards, so the path starts
    // on the actor and each step is one orthogonal move.
    const far = targets.find((cell) =>
      Math.abs(cell.x - actor.x) + Math.abs(cell.y - actor.y) > 20)!;
    const path = battle.directTechniquePath(actor.id, far);
    expect(path[0]).toEqual({ x: actor.x, y: actor.y });
    expect(path[path.length - 1]).toEqual(far);
    for (let index = 1; index < path.length; index += 1) {
      const step = Math.abs(path[index].x - path[index - 1].x)
        + Math.abs(path[index].y - path[index - 1].y);
      expect(step, `step ${index}`).toBe(1);
    }
  });

  it("spends the action without damage, experience or gameplay PRNG", () => {
    const battle = createStage22();
    const actor = halfDragonIn(battle);
    const before = {
      position: { x: actor.x, y: actor.y },
      experience: actor.experience,
      life: actor.life,
      rng: { state: battle.rng.state, calls: battle.rng.calls },
      unitCount: battle.units.length,
    };
    const destination = battle
      .actionTargetCells(actor.id, HALF_DRAGON_TELEPORT_ACTION_ID)
      .find((cell) => Math.abs(cell.x - actor.x) + Math.abs(cell.y - actor.y) > 20);
    expect(destination, "a far landing exists on the stage 22 map").toBeDefined();

    const prepared = battle.prepareSpecialAction({
      actionId: HALF_DRAGON_TELEPORT_ACTION_ID,
      actorId: actor.id,
      target: destination!,
    });
    expect(prepared.result.damage).toBe(0);
    expect(prepared.result.healing).toBe(0);
    expect(prepared.result.experienceGained).toBe(0);
    expect({ x: actor.x, y: actor.y }).toEqual(before.position);

    battle.commitPreparedAction(prepared);
    expect({ x: actor.x, y: actor.y }).toEqual(destination);
    expect(actor.acted).toBe(true);
    expect(actor.experience).toBe(before.experience);
    expect(actor.life).toBe(before.life);
    expect(battle.units).toHaveLength(before.unitCount);
    expect({ state: battle.rng.state, calls: battle.rng.calls }).toEqual(before.rng);
    // An already-spent actor has no further landings, so no follow-up action.
    expect(battle.actionTargetCells(actor.id, HALF_DRAGON_TELEPORT_ACTION_ID)).toEqual([]);
  });

  it("rejects occupied, out-of-range and wrong-class submissions", () => {
    const battle = createStage22();
    const actor = halfDragonIn(battle);
    const blocked = battle.units.find(({ id }) => id !== actor.id)!;

    expect(() => battle.prepareSpecialAction({
      actionId: HALF_DRAGON_TELEPORT_ACTION_ID,
      actorId: actor.id,
      target: { x: blocked.x, y: blocked.y },
    })).toThrow("illegal special action");

    const other = battle.units.find(({ side, classId }) =>
      side === 1 && classId !== "half-dragon-warrior")!;
    expect(techniqueActionIdsFor(other)).not.toContain(HALF_DRAGON_TELEPORT_ACTION_ID);
    expect(battle.actionTargetCells(other.id, HALF_DRAGON_TELEPORT_ACTION_ID)).toEqual([]);
    expect(battle.directTechniquePath(other.id, { x: actor.x, y: actor.y })).toEqual([]);
  });
});
