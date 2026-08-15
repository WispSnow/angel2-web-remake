import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FULL_COMBAT_BACKGROUND_EVIDENCE,
  FULL_COMBAT_BACKGROUND_FALLBACK_RECORD,
  FULL_COMBAT_BACKGROUND_RECORDS,
  FULL_COMBAT_BACKGROUND_STAGE_TABLE,
} from "../../src/game/content/full-combat-backgrounds.generated";
import {
  fullCombatBackgroundAsset,
  fullCombatBackgroundRecord,
} from "../../src/game/content/full-combat-backgrounds";
import { STAGE_RUNTIME_MANIFEST, loadStageRuntime } from "../../src/game/stage-runtime";
import { buildFullCombatScript } from "../../src/game/full-combat";
import { className } from "../../src/game/content/classes";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { AttackResult, BattleUnit, StageId } from "../../src/game/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** UN/0056 page 0 resolves every raw token to one of these logical slots. */
const LOGICAL_TERRAIN_SLOTS = Array.from({ length: 23 }, (_, slot) => slot);

const unit = (side: 1 | 2, slot: number): BattleUnit => ({
  id: `${side}:${slot}`,
  side,
  slot,
  classId: "soldier",
  className: className("soldier"),
  name: side === 1 ? "士兵" : "敵兵",
  portrait: side === 1 ? 46 : 47,
  x: side === 1 ? 24 : 25,
  y: 26,
  life: 160,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: emptyUnitStatuses(),
});

describe("native full-screen battle backdrop selection", () => {
  it("keeps the decoded native tables pinned to module 29", () => {
    expect(FULL_COMBAT_BACKGROUND_EVIDENCE.stageTable).toBe("DS:78DC");
    expect(FULL_COMBAT_BACKGROUND_EVIDENCE.defenderCell).toBe("DS:77C1");
    expect(FULL_COMBAT_BACKGROUND_EVIDENCE.backdropSize).toEqual([448, 148]);
    // 95F8 restarts the cursor at the table head rather than clearing it, so an
    // unlisted stage inherits the first entry instead of falling back to C/0.
    expect(FULL_COMBAT_BACKGROUND_FALLBACK_RECORD)
      .toBe(FULL_COMBAT_BACKGROUND_STAGE_TABLE[0].record);
    expect(fullCombatBackgroundRecord(44, 0)).toBe(FULL_COMBAT_BACKGROUND_FALLBACK_RECORD);
  });

  it("uses the stage table where the defender's terrain has no override", () => {
    // Stage 0's map only reaches indoor slots 13..16, which the 964E chain
    // never compares, so the palace record stands for the whole stage.
    expect(fullCombatBackgroundRecord(0, 13)).toBe(5);
    expect(fullCombatBackgroundRecord(0, 16)).toBe(5);
    expect(fullCombatBackgroundRecord(10, 14)).toBe(27);
    expect(fullCombatBackgroundRecord(21, 20)).toBe(23);
  });

  it("replaces the record from the defender's outdoor terrain slot", () => {
    expect(fullCombatBackgroundRecord(1, 1)).toBe(18);
    expect(fullCombatBackgroundRecord(1, 2)).toBe(16);
    expect(fullCombatBackgroundRecord(1, 3)).toBe(17);
    expect(fullCombatBackgroundRecord(1, 5)).toBe(20);
    expect(fullCombatBackgroundRecord(1, 6)).toBe(21);
    expect(fullCombatBackgroundRecord(1, 7)).toBe(19);
    expect(fullCombatBackgroundRecord(1, 8)).toBe(19);
    expect(fullCombatBackgroundRecord(1, 9)).toBe(29);
    expect(fullCombatBackgroundRecord(1, 12)).toBe(19);
    // Slot 8 is compared twice; only the first arm can run, so it must not
    // resolve to the unreachable C/29 branch at 96B3.
    expect(FULL_COMBAT_BACKGROUND_EVIDENCE.unreachableSwitchArms)
      .toEqual([{ slot: 8, record: 29, stageOverrides: [] }]);
  });

  it("substitutes stage 10's own record for the shared outdoor group", () => {
    for (const slot of [7, 8, 12]) {
      expect(fullCombatBackgroundRecord(10, slot)).toBe(28);
      expect(fullCombatBackgroundRecord(9, slot)).toBe(19);
    }
    expect(fullCombatBackgroundRecord(10, 3)).toBe(17);
  });

  it("keeps stages 6, 23 and 24 on their table record", () => {
    expect(fullCombatBackgroundRecord(6, 1)).toBe(22);
    expect(fullCombatBackgroundRecord(6, 12)).toBe(22);
    expect(fullCombatBackgroundRecord(23, 1)).toBe(31);
    expect(fullCombatBackgroundRecord(24, 12)).toBe(31);
    // The neighbouring stages are not exempt and must still swap.
    expect(fullCombatBackgroundRecord(22, 1)).toBe(18);
  });

  it("ships a decodable 448x148 backdrop for every reachable stage and slot", async () => {
    const stageIds = Object.keys(STAGE_RUNTIME_MANIFEST) as StageId[];
    const runtimes = await Promise.all(stageIds.map((stageId) => loadStageRuntime(stageId)));
    const nativeStages = [...new Set(runtimes.map(({ definition }) => definition.nativeStage))];
    expect(nativeStages.length).toBe(stageIds.length);
    const required = new Set<number>();
    for (const nativeStage of nativeStages) {
      for (const slot of LOGICAL_TERRAIN_SLOTS) {
        required.add(fullCombatBackgroundRecord(nativeStage, slot));
      }
    }
    expect(required.size).toBeGreaterThan(1);
    for (const record of required) {
      expect(FULL_COMBAT_BACKGROUND_RECORDS, `C/${record} is catalogued`).toContain(record);
      const asset = fullCombatBackgroundAsset(record);
      const buffer = await readFile(path.join(root, "public", asset.slice(1))).catch(() => undefined);
      expect(buffer, `backdrop file for C/${record}`).toBeDefined();
      if (!buffer) continue;
      expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `C/${record} PNG header`).toBe(true);
      expect([buffer.readUInt32BE(16), buffer.readUInt32BE(20)]).toEqual([448, 148]);
    }
  });

  it("rejects records the catalog does not ship", () => {
    expect(() => fullCombatBackgroundAsset(13)).toThrow(/C\/13/);
  });

  it("carries one backdrop through the whole script, counter-attack included", () => {
    const attacker = unit(1, 0);
    const defender = unit(2, 0);
    const result: AttackResult = {
      attackerId: attacker.id,
      defenderId: defender.id,
      damage: 24,
      counterDamage: 18,
      counterOccurred: true,
      defenderDied: false,
      attackerDied: false,
      experienceGained: 1,
      counterExperienceGained: 1,
    };
    const script = buildFullCombatScript(attacker, defender, result, 17);
    const records = new Set<number>();
    for (let t = 0; t <= script.duration; t += 40) records.add(script.sample(t).backgroundRecord);
    records.add(script.sample(script.duration).backgroundRecord);
    expect([...records]).toEqual([17]);
  });
});
