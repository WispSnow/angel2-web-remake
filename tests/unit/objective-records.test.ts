import { describe, expect, it } from "vitest";
import battleObjectives from "../../reverse/parsed/native/battle-objectives.json";
import campaignRoster from "../../reverse/parsed/native/campaign-roster.json";
import storyPresentations from "../../reverse/parsed/native/story-presentations.json";
import type { PortraitRecord } from "../../src/game/types";

/**
 * REMAKE-051. The per-stage victory-condition text is not derived from the stage
 * number: module 29 keys it through `DS:1273`, and the stage title through
 * `DS:30BA`. Both tables are machine evidence, so every generated stage must
 * quote the record its own key points at, and every named boss the objective
 * text refers to must be the actor the machine objective slot resolves to.
 */
const objectiveRecordTable = storyPresentations.globalReachabilityAudit.tables.alternate;
const titleRecordTable = storyPresentations.globalReachabilityAudit.tables.postBattle;

const recordFor = (
  table: { entries: Array<{ key: number; dialogueRecord: number; enabled: boolean }> },
  stage: number,
): number => {
  const entries = table.entries.filter((entry) => entry.key === stage && entry.enabled);
  expect(entries, `stage ${stage} must resolve to exactly one enabled table entry`).toHaveLength(1);
  return entries[0]!.dialogueRecord;
};

const enemyActorFor = (slot: number) => {
  const actor = campaignRoster.displayResolution.enemyActors.find((entry) => entry.slot === slot);
  if (!actor) throw new Error(`missing native enemy actor ${slot}`);
  return actor;
};

interface StageUnderTest {
  nativeStage: number;
  load: () => Promise<{
    sources: ReadonlyArray<{ id: string; path: string }>;
    objective: { victoryText: string };
    enemyUnits: ReadonlyArray<{ slot: number; name: string; portrait?: PortraitRecord }>;
  }>;
}

const STAGES: StageUnderTest[] = [
  {
    nativeStage: 1,
    load: async () => {
      const m = await import("../../src/game/content/stage1");
      return { sources: m.STAGE1_SOURCES, objective: m.STAGE1_DEFINITION.objective, enemyUnits: m.STAGE1_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 2,
    load: async () => {
      const m = await import("../../src/game/content/stage2");
      return { sources: m.STAGE2_SOURCES, objective: m.STAGE2_DEFINITION.objective, enemyUnits: m.STAGE2_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 3,
    load: async () => {
      const m = await import("../../src/game/content/stage3");
      return { sources: m.STAGE3_SOURCES, objective: m.STAGE3_DEFINITION.objective, enemyUnits: m.STAGE3_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 4,
    load: async () => {
      const m = await import("../../src/game/content/stage4");
      return { sources: m.STAGE4_SOURCES, objective: m.STAGE4_DEFINITION.objective, enemyUnits: m.STAGE4_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 5,
    load: async () => {
      const m = await import("../../src/game/content/stage5");
      return { sources: m.STAGE5_SOURCES, objective: m.STAGE5_DEFINITION.objective, enemyUnits: m.STAGE5_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 6,
    load: async () => {
      const m = await import("../../src/game/content/stage6");
      return { sources: m.STAGE6_SOURCES, objective: m.STAGE6_DEFINITION.objective, enemyUnits: m.STAGE6_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 7,
    load: async () => {
      const m = await import("../../src/game/content/stage7");
      return { sources: m.STAGE7_SOURCES, objective: m.STAGE7_DEFINITION.objective, enemyUnits: m.STAGE7_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 8,
    load: async () => {
      const m = await import("../../src/game/content/stage8");
      return { sources: m.STAGE8_SOURCES, objective: m.STAGE8_DEFINITION.objective, enemyUnits: m.STAGE8_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 9,
    load: async () => {
      const m = await import("../../src/game/content/stage9");
      return { sources: m.STAGE9_SOURCES, objective: m.STAGE9_DEFINITION.objective, enemyUnits: m.STAGE9_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 10,
    load: async () => {
      const m = await import("../../src/game/content/stage10");
      return { sources: m.STAGE10_SOURCES, objective: m.STAGE10_DEFINITION.objective, enemyUnits: m.STAGE10_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 11,
    load: async () => {
      const m = await import("../../src/game/content/stage11");
      return { sources: m.STAGE11_SOURCES, objective: m.STAGE11_DEFINITION.objective, enemyUnits: m.STAGE11_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 12,
    load: async () => {
      const m = await import("../../src/game/content/stage12");
      return { sources: m.STAGE12_SOURCES, objective: m.STAGE12_DEFINITION.objective, enemyUnits: m.STAGE12_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 13,
    load: async () => {
      const m = await import("../../src/game/content/stage13");
      return { sources: m.STAGE13_SOURCES, objective: m.STAGE13_DEFINITION.objective, enemyUnits: m.STAGE13_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 14,
    load: async () => {
      const m = await import("../../src/game/content/stage14");
      return { sources: m.STAGE14_SOURCES, objective: m.STAGE14_DEFINITION.objective, enemyUnits: m.STAGE14_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 15,
    load: async () => {
      const m = await import("../../src/game/content/stage15");
      return { sources: m.STAGE15_SOURCES, objective: m.STAGE15_DEFINITION.objective, enemyUnits: m.STAGE15_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 16,
    load: async () => {
      const m = await import("../../src/game/content/stage16");
      return { sources: m.STAGE16_SOURCES, objective: m.STAGE16_DEFINITION.objective, enemyUnits: m.STAGE16_SEMANTIC_ENEMY_UNITS };
    },
  },
  {
    nativeStage: 17,
    load: async () => {
      const m = await import("../../src/game/content/stage17");
      return { sources: m.STAGE17_SOURCES, objective: m.STAGE17_DEFINITION.objective, enemyUnits: m.STAGE17_SEMANTIC_ENEMY_UNITS };
    },
  },
];

describe("per-stage victory-condition records (REMAKE-051)", () => {
  it("resolves the module-29 objective table to the machine-confirmed records", () => {
    expect(STAGES.map(({ nativeStage }) => recordFor(objectiveRecordTable, nativeStage))).toEqual([
      98, 172, 106, 107, 108, 160, 109, 162, 110, 111, 113, 114, 159, 83, 84, 85, 86,
    ]);
    // The title table is keyed the same way; stages 10 and 11 are the visible proof
    // that neither table is a stage-number formula.
    expect(recordFor(titleRecordTable, 10)).toBe(129);
    expect(recordFor(titleRecordTable, 11)).toBe(128);
  });

  it.each(STAGES)("stage $nativeStage quotes its own objective record", async ({ nativeStage, load }) => {
    const { sources } = await load();
    const objectiveSource = sources.find(({ id }) => id === "objectiveText");
    expect(objectiveSource, `stage ${nativeStage} must consume an objectiveText source`).toBeDefined();
    const record = recordFor(objectiveRecordTable, nativeStage);
    expect(objectiveSource!.path)
      .toBe(`reverse/parsed/dialogue/${String(record).padStart(4, "0")}.json`);
  });

  it.each(STAGES)("stage $nativeStage names the machine boss it actually checks", async ({ nativeStage, load }) => {
    const machine = battleObjectives.normalStageObjectives.find(({ stage }) => stage === nativeStage);
    if (!machine) throw new Error(`missing native objective for stage ${nativeStage}`);
    if (machine.victory.kind !== "required_side2_slot_absent") return;

    const slot = machine.victory.unitSlot!;
    const actor = enemyActorFor(slot);
    const { objective, enemyUnits } = await load();
    // The objective text must name the actor behind the slot the handler scans,
    // and the unit standing on the board must carry the same identity.
    expect(objective.victoryText, `stage ${nativeStage} victory text`).toContain(actor.normalizedName);
    const boss = enemyUnits.find((unit) => unit.slot === slot);
    expect(boss, `stage ${nativeStage} must place side-2 slot ${slot}`).toBeDefined();
    expect({ name: boss!.name, portrait: boss!.portrait })
      .toEqual({ name: actor.normalizedName, portrait: actor.portraitRecord });
  });
});
