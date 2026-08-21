import { describe, expect, test } from "vitest";
import { classPresentationAssetUrls } from "../../src/game/content/class-presentation-assets";
import {
  portraitAssetUrls,
  portraitAssetUrlsForRecords,
  stageDialoguePortraitRecords,
} from "../../src/game/content/portrait-assets";
import { PORTRAIT_CATALOG } from "../../src/game/content/portrait-catalog.generated";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";

describe("stage-scoped portrait assets", () => {
  test("keeps a layered portrait's base, eyes, and mouths in native catalog order", () => {
    const entry = PORTRAIT_CATALOG[46];
    const animation = entry.animation;
    if (!animation) throw new Error("portrait record 46 must remain layered");
    expect(portraitAssetUrls(46)).toEqual([
      entry.source,
      ...animation.eyes,
      ...animation.mouths,
    ]);
  });

  test("derives the complete current-stage story portrait set without loading all records", () => {
    const records = stageDialoguePortraitRecords(STAGE0_DEFINITION);
    expect(records).toEqual(expect.arrayContaining([45, 46, 47, 48]));
    expect(records.length).toBeLessThan(Object.keys(PORTRAIT_CATALOG).length);
  });

  test("adds requested portrait layers to the same stage presentation gate exactly once", () => {
    const expected = portraitAssetUrlsForRecords([46]);
    const urls = classPresentationAssetUrls({
      allyClassIds: ["soldier"],
      encounterClassIds: ["soldier"],
      portraitRecords: [46, 46],
    });
    for (const url of expected) expect(urls).toContain(url);
    expect(urls.filter((url) => url === PORTRAIT_CATALOG[46].source)).toHaveLength(1);
    expect(urls).not.toContain(PORTRAIT_CATALOG[45].source);
  });
});
