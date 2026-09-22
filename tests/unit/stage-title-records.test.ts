import { describe, expect, it } from "vitest";
import battleText from "../../reverse/parsed/native/battle-text.json";
import storyPresentations from "../../reverse/parsed/native/story-presentations.json";
import { NATIVE_STAGE_LABELS } from "../../src/game/content/native-font.generated";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";

/**
 * REMAKE-158, evidence side. `DS:30BA` as the two extractors decoded it, and the
 * SAY record every stage generator reads its title (and next title) from. The
 * table is scanned first-match by native stage number, like `0000:4F41` does.
 */
const titleTable = storyPresentations.globalReachabilityAudit.tables.postBattle;

const firstRecordFor = (stage: number): number => {
  const entry = titleTable.entries.find(({ key }) => key === stage);
  if (!entry) throw new Error(`DS:30BA has no entry for stage ${stage}`);
  return entry.dialogueRecord;
};

const dialoguePath = (record: number) =>
  `reverse/parsed/dialogue/${String(record).padStart(4, "0")}.json`;

const nativeNumberOf = (routeId: string): number => {
  const digits = /^stage-(\d+)/u.exec(routeId)?.[1];
  if (digits === undefined) throw new Error(`${routeId} has no native stage number`);
  return Number(digits);
};

interface GeneratedSource {
  readonly id: string;
  readonly path: string;
}

describe("DS:30BA stage title records (REMAKE-158)", () => {
  it("is the same table the battle-text extractor decoded", () => {
    expect(battleText.stageLabel.table.address).toBe(titleTable.address);
    expect(battleText.stageLabel.table.entries)
      .toEqual(titleTable.entries.map(({ key, dialogueRecord }) => ({ stage: key, sayRecord: dialogueRecord })));
  });

  it("ships the first entry of every stage as NATIVE_STAGE_LABELS", () => {
    const visibleTextByRecord = new Map(battleText.stageLabel.table.labels
      .map(({ sayRecord, text }) => [sayRecord, text.replaceAll("\t", "").trim()]));
    const stages = [...new Set(titleTable.entries.map(({ key }) => key))];
    expect(Object.fromEntries(stages.map((stage) => {
      const record = firstRecordFor(stage);
      return [stage, record === 0 ? null : visibleTextByRecord.get(record)];
    }))).toEqual(NATIVE_STAGE_LABELS);

    // Stage 38's second entry is record 0; the scan never reaches it.
    expect(titleTable.entries.filter(({ key }) => key === 38).map(({ dialogueRecord }) => dialogueRecord))
      .toEqual([161, 0]);
    // SAY/0124 過異世界之門 is a label record nothing points at, which is why
    // counting records from stage 5 lands stages 6..8 one record early.
    expect(titleTable.entries.map(({ dialogueRecord }) => dialogueRecord)).not.toContain(124);
    expect([6, 7, 8].map(firstRecordFor)).toEqual([125, 126, 158]);
  });

  it("makes every stage generator read its titles from DS:30BA", async () => {
    const generated = import.meta.glob<Record<string, unknown>>(
      "../../src/game/content/stage*-runtime.generated.ts",
    );
    const checked: number[] = [];
    for (const [file, load] of Object.entries(generated)) {
      const stage = nativeNumberOf(`stage-${/stage(\d+)-runtime/u.exec(file)?.[1] ?? ""}`);
      const sources = (await load())[`STAGE${stage}_SOURCES`] as readonly GeneratedSource[] | undefined;
      const title = sources?.find(({ id }) => id === "title");
      if (!sources || !title) continue;
      expect(title.path, `stage ${stage} title`).toBe(dialoguePath(firstRecordFor(stage)));

      const nextTitle = sources.find(({ id }) => id === "nextTitle");
      if (nextTitle) {
        const entry = Object.values(STAGE_RUNTIME_MANIFEST).find(({ id }) =>
          id !== "stage-42-portal" && nativeNumberOf(id) === stage);
        if (!entry) throw new Error(`stage ${stage} has no runtime manifest entry`);
        expect(nextTitle.path, `stage ${stage} next title`)
          .toBe(dialoguePath(firstRecordFor(nativeNumberOf(entry.nextStageId))));
      }
      checked.push(stage);
    }
    // Stage 0 names itself in stage0.ts and stage 25 was never shipped.
    expect(checked.sort((left, right) => left - right)).toEqual([
      ...Array.from({ length: 24 }, (_, index) => index + 1),
      ...Array.from({ length: 13 }, (_, index) => index + 26),
    ]);
  });
});
