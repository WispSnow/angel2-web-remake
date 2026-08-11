import { describe, it } from "vitest";
import { ArenaBattle } from "../../src/game/simulation/arena-battle";
import { DeterministicRng } from "../../src/game/simulation/rng";

type P = Record<string, unknown>;

const u = (id: string, side: 1 | 2, slot: number, classId: string, level: 1 | 2 | 3, x: number, y: number) =>
  ({ id, side, slot, classId, level, x, y }) as P;

function report(name: string, units: P[], mutate: (battle: ArenaBattle) => void = () => {}) {
  const battle = new ArenaBattle(units as never, 0, new DeterministicRng(0x0a2e2026));
  mutate(battle);
  const enemyIds = units.filter(({ side }) => side === 2).map(({ id }) => id as string);
  console.log(`\n##### ${name}`);
  for (const id of enemyIds) {
    const action = battle.planEnemyAiAction(id);
    console.log(`  ${id} -> ${action?.kind}/${action?.actionId ?? "-"} t=${action?.targetId ?? "-"} to=${JSON.stringify(action?.path?.at(-1))}`);
  }
  console.log(`  order: ${JSON.stringify(battle.nextEnemyActionId(enemyIds))}`);
}

const confuse = (id: string) => (battle: ArenaBattle) => {
  const unit = battle.unit(id);
  if (unit) unit.statuses.confusion = 3;
};

describe("round 8", () => {
  it("curse-master pairs before and after the target is confused", () => {
    for (const level of [1, 2] as const) {
      const units = [
        u("arena-1-0", 1, 0, "soldier", 1, 20, 30),
        u("arena-2-0", 2, 0, "curse-master", level, 23, 30),
        u("arena-2-1", 2, 1, "curse-master", level, 24, 30),
      ];
      report(`tier ${level}: fresh target`, units);
      report(`tier ${level}: target already confused`, units, confuse("arena-1-0"));
    }
  });
});
