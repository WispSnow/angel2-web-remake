import { describe, expect, it } from "vitest";
import { NATIVE_STAGE_LABELS } from "../../src/game/content/native-font.generated";
import { nativeStageNumber } from "../../src/game/content/objective-panel";
import { STAGE_INDEX } from "../../src/game/content/stage-index";
import { nativeStageLabel } from "../../src/game/native-hud-text";
import { loadStageRuntime, STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";
import type { StageId } from "../../src/game/types";

/**
 * REMAKE-158. The original only ever shows a stage name in the bottom bar, and
 * module 29 `0000:4F41` picks it from `DS:30BA` by native stage number: the first
 * entry wins and record 0 draws nothing. Stages 6..8 had been named by counting
 * SAY records from stage 5 and stage 38 by the remake's own "異世界", so every
 * surface that names a stage is tied back to that table here. The evidence side
 * of the table lives in `stage-title-records.test.ts`.
 */
const stageIds = Object.keys(STAGE_INDEX) as StageId[];

const nativeNumberOf = (id: StageId): number => {
  const native = nativeStageNumber(id);
  if (native === undefined) throw new Error(`${id} has no native stage number`);
  return native;
};

const originalTitleOf = (id: StageId): string | null => {
  const title = NATIVE_STAGE_LABELS[nativeNumberOf(id)];
  if (title === undefined) throw new Error(`DS:30BA has no entry for ${id}`);
  return title;
};

describe("stage titles (REMAKE-158)", () => {
  it("names every stage by its DS:30BA record", () => {
    const named = stageIds.filter((id) => originalTitleOf(id) !== null);
    expect(Object.fromEntries(named.map((id) => [id, STAGE_INDEX[id].label])))
      .toEqual(Object.fromEntries(named.map((id) => [id, originalTitleOf(id)])));
    // The portal scene is the one stage the original leaves unnamed.
    expect(stageIds.filter((id) => originalTitleOf(id) === null)).toEqual(["stage-42-portal"]);
  });

  it("keeps the four titles the Web version once got wrong", () => {
    expect(STAGE_INDEX["stage-06"].label).toBe("來到異世界");
    expect(STAGE_INDEX["stage-07"].label).toBe("營地遭到偷襲");
    expect(STAGE_INDEX["stage-08"].label).toBe("營地遭到偷襲 ２");
    expect(STAGE_INDEX["stage-38"].label).toBe("瑪姬的墓園");
  });

  it("stores every completed route under its destination's title", () => {
    for (const entry of Object.values(STAGE_RUNTIME_MANIFEST)) {
      const destination = entry.nextStageId;
      if (!Object.hasOwn(STAGE_INDEX, destination)) continue;
      expect(entry.completion.destinationLabel, `${entry.id} -> ${destination}`)
        .toBe(STAGE_INDEX[destination as StageId].label);
    }
  });

  it("draws the indexed title on each battle surface and nothing on the portal", async () => {
    for (const id of stageIds) {
      const { definition } = await loadStageRuntime(id);
      expect(definition.nativeStage, id).toBe(nativeNumberOf(id));
      expect(definition.name, id).toBe(STAGE_INDEX[id].label);
      expect(nativeStageLabel(definition), id)
        .toBe(originalTitleOf(id) === null ? undefined : STAGE_INDEX[id].label);
    }
  });
});
