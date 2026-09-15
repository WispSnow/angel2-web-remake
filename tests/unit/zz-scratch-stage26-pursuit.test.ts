import { it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { STAGE26_DEFINITION } from "../../src/game/content/stage26";
import { Stage26Battle } from "../../src/game/simulation/stage26-battle";
import type { CampaignState } from "../../src/game/types";

const campaign: CampaignState = {
  stageId: "stage-26",
  ruleset: "stableRemake",
  difficulty: 2,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 760, life: 240 },
    { slot: 7, classId: "magic-priest", experience: 660, life: 180 },
    { slot: 8, classId: "cavalry", experience: 740, life: 220 },
  ]),
  rngState: 0x26_26_26_26,
  rngCalls: 18,
};

const fullDeployment = {
  placements: [
    ...STAGE26_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
      slot, position: { ...position }, fixed: true,
    })),
    ...STAGE26_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
      slot, position: { ...STAGE26_DEFINITION.deployment.openCells[index] }, fixed: false,
    })),
  ],
};

function show(label: string, battle: Stage26Battle) {
  for (const id of ["2:41", "2:40", "2:39"]) {
    const unit = battle.unit(id);
    const action = battle.planEnemyAiAction(id);
    const end = action?.path.at(-1);
    console.log(label, id, `from (${unit?.x},${unit?.y})`, action?.kind, action?.actionId ?? "", action?.targetId ?? "",
      end ? `to (${end.x},${end.y})` : "", `pathLen=${action?.path.length}`);
  }
}

it("trace stage 26 slot 40 pursuit", () => {
  const a = new Stage26Battle(campaign, fullDeployment);
  show("deployment-row31", a);
  const b = new Stage26Battle(campaign, fullDeployment);
  const flier = b.units.find(({ side, id }) => side === 1 && id === "1:2");
  if (flier) { flier.x = 13; flier.y = 23; }
  show("one-ally-at-13,23", b);
  const c = new Stage26Battle(campaign, fullDeployment);
  for (const unit of c.units.filter(({ side }) => side === 1)) unit.y = 24;
  show("all-allies-row24", c);
});
