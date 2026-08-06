import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE4_DEFINITION } from "../../src/game/content/stage4";
import { Stage4Battle, createStage4DeploymentRoster } from "../../src/game/simulation/stage4-battle";
import type { DeploymentResult } from "../../src/game/simulation/deployment";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-04",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster([
    { slot: 0, classId: "cavalry", experience: 520, life: 120 },
    { slot: 1, classId: "monk", experience: 480, life: 111 },
    { slot: 24, classId: "soldier", experience: 0, life: 90 },
  ]),
  rngState: 0x1234_5678,
  rngCalls: 7,
};

const fullDeployment = (): DeploymentResult => ({
  placements: [
    ...STAGE4_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot,
      position: { ...position },
      fixed: true,
    })),
    ...STAGE4_DEFINITION.deployment.optionalSlots.map((slot, index) => ({
      slot,
      position: { ...STAGE4_DEFINITION.deployment.openCells[index] },
      fixed: false,
    })),
  ],
});

const moveAlong = (
  battle: Stage4Battle,
  unitId: string,
  path: readonly { x: number; y: number }[],
): void => {
  for (const position of path.slice(1)) {
    expect(battle.moveUnitStep(unitId, position, true)).toBe(true);
  }
};

describe("stage 4 deployment, forces, and route pulse", () => {
  it("inherits selected campaign units and applies Gadirath's untouched magician baseline", () => {
    const roster = createStage4DeploymentRoster(campaign);
    expect(roster).toHaveLength(8);
    expect(roster.find(({ slot }) => slot === 0)).toMatchObject({
      classId: "cavalry",
      experience: 520,
      life: 120,
    });
    expect(roster.find(({ slot }) => slot === 24)).toMatchObject({
      classId: "magician",
      experience: 299,
      name: "葛蒂拉斯",
    });

    const battle = new Stage4Battle(campaign, fullDeployment());
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(8);
    expect(battle.units.filter(({ side }) => side === 2)).toHaveLength(2);
    expect(battle.unit("1:24")).toMatchObject({ classId: "magician", x: 25, y: 41 });
    expect(battle.isPlayerControllableAlly("1:0")).toBe(true);
    expect(battle.isPlayerControllableAlly("1:24")).toBe(false);
    expect(battle.forceForUnit("1:0")).toMatchObject({ id: "nia-escort", control: "player" });
    expect(battle.forceForUnit("1:24")).toMatchObject({
      id: "barrier-guide",
      control: "independent-ai",
      tacticLabel: "引導結界",
    });
    expect(battle.forceForUnit("2:40")).toMatchObject({
      id: "castle-sentries",
      tacticLabel: "阻擊護衛隊",
    });
  });

  it("preserves Gadirath's promoted campaign class in deployment and battle", () => {
    const promotedCampaign: CampaignState = {
      ...campaign,
      roster: campaign.roster.map((entry) => entry.slot === 24
        ? { ...entry, classId: "evil-mage", experience: 1_050, life: 300 }
        : entry),
    };
    expect(createStage4DeploymentRoster(promotedCampaign).find(({ slot }) => slot === 24))
      .toMatchObject({ classId: "evil-mage", experience: 1_050, life: 300 });
    expect(new Stage4Battle(promotedCampaign, fullDeployment()).unit("1:24"))
      .toMatchObject({ classId: "evil-mage", experience: 1_050, life: 300 });
  });

  it("plans behavior 12 before ordinary AI and pulses after moving toward the lower cell", () => {
    const battle = new Stage4Battle(campaign, fullDeployment());
    const guide = battle.unit("1:24")!;
    const originCell = guide.y * 50 + guide.x;
    const action = battle.planAlliedAiAction(guide.id);
    expect(action).toMatchObject({ unitId: guide.id, kind: "route-pulse" });
    expect(action!.path).toHaveLength(3);
    const destination = action!.path.at(-1)!;
    expect(destination.y * 50 + destination.x).toBeLessThan(originCell);
    moveAlong(battle, guide.id, action!.path);

    const callsBefore = battle.rng.calls;
    const outside = battle.unit("1:1")!;
    outside.x = 0;
    outside.y = 0;
    outside.life = 111;
    outside.statuses.magicGuard = 3;
    const prepared = battle.prepareRoutePulse(guide.id, action!.path);
    expect(prepared.safeCells).toContainEqual({ x: guide.x, y: guide.y });
    expect(prepared.affectedUnits.find(({ unitId }) => unitId === outside.id)).toMatchObject({
      lifeBefore: 111,
      lifeAfter: 55,
      died: false,
    });
    expect(battle.rng.calls).toBe(callsBefore);

    battle.commitRoutePulse(prepared);
    expect(battle.unit(outside.id)).toMatchObject({ life: 55, acted: false });
    expect(battle.unit(outside.id)?.statuses.magicGuard).toBe(3);
    expect(battle.unit(guide.id)?.acted).toBe(true);
    expect(battle.rng.calls).toBe(callsBefore);
  });

  it("ignores occupancy while flooding the uniform safe area", () => {
    const unoccupied = new Stage4Battle(campaign, fullDeployment());
    const occupied = new Stage4Battle(campaign, fullDeployment());
    const guide = occupied.unit("1:24")!;
    for (const [index, unit] of occupied.units.filter(({ side, id }) => side === 1 && id !== guide.id).entries()) {
      unit.x = guide.x + (index % 3) - 1;
      unit.y = guide.y + Math.floor(index / 3) - 1;
    }
    expect(occupied.routePulseSafeArea(guide.id)).toEqual(
      unoccupied.routePulseSafeArea("1:24"),
    );
    expect(occupied.routePulseSafeAreaForUnit("1:0")).toEqual(
      occupied.routePulseSafeArea(guide.id),
    );
    expect(occupied.routePulseSafetyForUnit(guide.id)).toBe("safe");
    expect(occupied.routePulseSafetyForUnit("2:40")).toBeUndefined();
  });

  it("still pulses when the route cannot enter a lower cell and removes zero-life targets", () => {
    const battle = new Stage4Battle(campaign, fullDeployment());
    const guide = battle.unit("1:24")!;
    guide.x = 25;
    guide.y = 2;
    const doomed = battle.unit("1:1")!;
    doomed.x = 0;
    doomed.y = 0;
    doomed.life = 1;
    const action = battle.planAlliedAiAction(guide.id);
    expect(action).toEqual({
      unitId: guide.id,
      kind: "route-pulse",
      path: [{ x: 25, y: 2 }],
    });
    const prepared = battle.prepareRoutePulse(guide.id, action!.path);
    expect(prepared.affectedUnits).toContainEqual(expect.objectContaining({
      unitId: doomed.id,
      lifeAfter: 0,
      died: true,
    }));
    battle.commitRoutePulse(prepared);
    expect(battle.unit(doomed.id)).toBeUndefined();
  });

  it("wins only when Gadirath reaches cells 0..174 and loses if either protected unit is removed", () => {
    const battle = new Stage4Battle(campaign, fullDeployment());
    const guide = battle.unit("1:24")!;
    guide.x = 25;
    guide.y = 3;
    expect(battle.outcome()).toBe("ongoing");
    guide.x = 24;
    expect(battle.outcome()).toBe("victory");

    for (const protectedId of ["1:0", "1:24"]) {
      const defeated = new Stage4Battle(campaign, fullDeployment());
      defeated.units = defeated.units.filter(({ id }) => id !== protectedId);
      expect(defeated.outcome()).toBe("defeat");
    }
  });
});
