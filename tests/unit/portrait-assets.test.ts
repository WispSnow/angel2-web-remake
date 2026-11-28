import { describe, expect, test } from "vitest";
import { classPresentationAssetUrls, stagePortraitRecords } from "../../src/game/content/class-presentation-assets";
import { portraitHdAssetUrls } from "../../src/game/content/portrait-hd";
import { portraitHdUrlsForStyle } from "../../src/game/portrait-style";
import {
  classFallbackPortraitFor,
  promotionReachableClassIds,
} from "../../src/game/content/classes";
import {
  dialoguePortraitRecords,
  portraitAssetUrls,
  portraitAssetUrlsForRecords,
  stageDialoguePortraitRecords,
} from "../../src/game/content/portrait-assets";
import {
  DIALOGUE_PORTRAIT_FRAME_ASSETS,
  DIALOGUE_TEXT_WINDOW_ASSET,
  PORTRAIT_CATALOG,
} from "../../src/game/content/portrait-catalog.generated";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  STAGE49_ENDING_SUPPLEMENTAL_ASSETS,
  STAGE49_ROSTER_ACTORS,
} from "../../src/game/content/stage49-ending";

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

  test("stages a portrait's red-eye layer with the rest of its layers", () => {
    expect(portraitAssetUrls(41)).toContain("/assets/original/portraits/0041/eye-red.png");
    expect(portraitAssetUrls(46).some((url) => url.endsWith("eye-red.png"))).toBe(false);
  });

  test("derives the complete current-stage story portrait set without loading all records", () => {
    const records = stageDialoguePortraitRecords(STAGE0_DEFINITION);
    expect(records).toEqual(expect.arrayContaining([45, 46, 47, 48]));
    expect(records.length).toBeLessThan(Object.keys(PORTRAIT_CATALOG).length);
  });

  test("stages faces a page only shows mid-reveal or between DL waits", () => {
    // Neither swap can wait for decoding: SAY/0164 changes face between two
    // glyphs, SAY/0074 between waits as short as 40 ms.
    expect(dialoguePortraitRecords([{
      source: { record: 74, wait: 3 },
      upper: { portrait: 67, timedPortraitCues: [{ tick: 0, portrait: 56 }, { tick: 9, portrait: 67 }] },
      lower: { text: "妳們曾經", portrait: 24, portraitCues: [{ at: 0, portrait: 25 }, { at: 2, portrait: 24 }] },
    }])).toEqual([24, 25, 56, 67]);
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

  test("stages the generic portrait of every class an ally can promote into", () => {
    // 通用单位（士兵A 等）按当前职业显示通用肖像，转职当场就换成新职业那张。肖像是
    // DOM 图片，没进资源门就会绕过租约直接请求原始 URL，所以要和棋子一样按转职闭包备好。
    const urls = new Set(classPresentationAssetUrls({
      allyClassIds: ["soldier"],
      encounterClassIds: ["soldier"],
      portraitRecords: [],
    }));
    const missing = promotionReachableClassIds(["soldier"]).flatMap((classId) => {
      const record = classFallbackPortraitFor(classId, 1);
      if (record === undefined) return [];
      return portraitAssetUrlsForRecords([record])
        .filter((url) => !urls.has(url))
        .map((url) => `${classId}: ${url}`);
    });
    expect(missing).toEqual([]);
  });

  test("REMAKE-219: the HD gate covers the same promotion closure as the original portraits", () => {
    // 士兵A 在第 0 關轉成修女就換上 D/50。原版主圖早就按轉職閉包進資源門，高清以前只帶在場的臉，
    // 高清模式下轉職後的通用肖像於是退回原版。
    const requirements = { allyClassIds: ["soldier"] as const, portraitRecords: [46, 47] as const };
    const records = stagePortraitRecords({ allyClassIds: [...requirements.allyClassIds], portraitRecords: [...requirements.portraitRecords] });
    const urls = new Set(portraitHdUrlsForStyle(records, "hd"));
    const missing = promotionReachableClassIds(["soldier"]).flatMap((classId) => {
      const record = classFallbackPortraitFor(classId, 1);
      if (record === undefined) return [];
      return portraitHdAssetUrls(record).filter((url) => !urls.has(url)).map((url) => `${classId}: ${url}`);
    });
    expect(missing).toEqual([]);
    expect(urls).toContain("/assets/original/portraits/hd/0050/portrait.mp4");
    // 在場與劇情的臉照舊，原版模式仍不帶任何高清檔案。
    expect(urls).toContain("/assets/original/portraits/hd/0046/portrait.mp4");
    expect(portraitHdUrlsForStyle(records, "original")).toEqual([]);
  });

  test("retains ending dialogue layers and roster bases without taking the full portrait stream", () => {
    for (const url of portraitAssetUrls(46)) {
      expect(STAGE49_ENDING_SUPPLEMENTAL_ASSETS).toContain(url);
    }
    for (const url of Object.values(DIALOGUE_PORTRAIT_FRAME_ASSETS)) {
      expect(STAGE49_ENDING_SUPPLEMENTAL_ASSETS).toContain(url);
    }
    expect(STAGE49_ENDING_SUPPLEMENTAL_ASSETS).toContain(DIALOGUE_TEXT_WINDOW_ASSET);
    for (const actor of STAGE49_ROSTER_ACTORS) {
      expect(STAGE49_ENDING_SUPPLEMENTAL_ASSETS)
        .toContain(PORTRAIT_CATALOG[actor.portraitRecord].source);
    }
    expect(STAGE49_ENDING_SUPPLEMENTAL_ASSETS.length).toBeLessThan(100);
  });
});
