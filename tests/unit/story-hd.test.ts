import { describe, expect, test } from "vitest";
import { STORY_HD_ENTRIES, STORY_HD_HEIGHT, STORY_HD_WIDTH } from "../../src/game/content/story-hd.generated";
import { STORY_HD_TITLE, storyHdAssetUrls, storyHdEntryForSource, storyHdTitleAssetUrls } from "../../src/game/content/story-hd";
import { STARTUP_TITLE } from "../../src/game/content/startup.generated";
import { STAGE_RUNTIME_MANIFEST, loadStageRuntime, stageStoryBackgroundUrls } from "../../src/game/stage-runtime";
import { storyHdUrlsForStyle } from "../../src/game/story-hd-style";

describe("REMAKE-196 HD story illustrations", () => {
  test("the HD frame is the 640x350 logical screen at 2.2x, within a pixel per side under object-fit: cover", () => {
    expect(STORY_HD_WIDTH / 640).toBeCloseTo(2.2, 5);
    // cover scales by the height: 350 * 1408 / 768 = 641.7 wide, so each side loses under one logical pixel
    expect((350 * STORY_HD_WIDTH) / STORY_HD_HEIGHT - 640).toBeLessThan(2);
  });

  test("every entry replaces one original illustration and ships a poster, plus a loop unless it is a still", () => {
    const originals = new Set<string>();
    for (const entry of STORY_HD_ENTRIES) {
      expect(originals.has(entry.original)).toBe(false);
      originals.add(entry.original);
      expect(entry.original).toMatch(/^\/assets\/original\/story-[^/]+\.png$/u);
      expect(entry.poster).toMatch(/^\/assets\/original\/story\/hd\/bk\d{2}\/poster\.webp$/u);
      expect(storyHdEntryForSource(entry.original)).toBe(entry);
      if (!entry.video) {
        expect(entry.sky, `BK/${entry.background}`).toBeUndefined();
        continue;
      }
      expect(entry.video.source).toMatch(/^\/assets\/original\/story\/hd\/bk\d{2}\/loop\.mp4$/u);
      // a loop over a scrolling sky is twice as tall: premultiplied colour on top, 1 - alpha below
      expect([entry.video.width, entry.video.height]).toEqual([STORY_HD_WIDTH, entry.sky ? 2 * STORY_HD_HEIGHT : STORY_HD_HEIGHT]);
      expect(entry.video.alpha).toBe(entry.sky ? "stacked" : undefined);
      expect(entry.video.fps).toBe(24);
    }
  });

  test("cloudy pictures scroll a tileable strip; pictures a story switches between share one, BK/13 stays still", () => {
    const byId = new Map(STORY_HD_ENTRIES.map((entry) => [entry.background, entry]));
    for (const entry of STORY_HD_ENTRIES) {
      if (!entry.sky) continue;
      expect(entry.sky.source).toMatch(/^\/assets\/original\/story\/hd\/bk\d{2}\/sky\.webp$/u);
      expect(entry.sky.height).toBeLessThanOrEqual(STORY_HD_HEIGHT);
      expect(entry.sky.width).toBeGreaterThanOrEqual(STORY_HD_WIDTH / 2);
      expect(Math.abs(entry.sky.speed)).toBeGreaterThan(0);
      expect(Math.abs(entry.sky.speed)).toBeLessThanOrEqual(20);
    }
    // stage 6 switches BK/5 -> BK/31 and stage 12 BK/10 -> BK/12 within one story: the same strip keeps the clouds in place
    for (const [base, variant] of [[5, 31], [10, 12]] as const) {
      expect(byId.get(variant)?.sky, `BK/${variant}`).toEqual(byId.get(base)?.sky);
    }
    expect(byId.get(13)?.video).toBeUndefined();
  });

  test("stage story backgrounds list the default illustration and every page background once", async () => {
    // stage 0's runtime has no assets object; the story surface draws stage 0's palace, and so does the gate
    expect(stageStoryBackgroundUrls(undefined)).toEqual(["/assets/original/story-palace.png"]);
    expect(stageStoryBackgroundUrls({})).toEqual([]);
    expect(stageStoryBackgroundUrls({
      storyBackground: "/assets/original/a.png",
      storyBackgrounds: { 1: "/assets/original/a.png", 2: "/assets/original/b.png" },
    })).toEqual(["/assets/original/a.png", "/assets/original/b.png"]);
    const stage12 = await loadStageRuntime("stage-12");
    expect(stageStoryBackgroundUrls(stage12.assets)).toEqual(expect.arrayContaining([
      "/assets/original/story-stage10-background-10.png",
      "/assets/original/story-stage12-background-11.png",
    ]));
  });

  test("every HD entry is reachable from at least one implemented stage's story", async () => {
    const used = new Set<string>();
    for (const stageId of Object.keys(STAGE_RUNTIME_MANIFEST) as (keyof typeof STAGE_RUNTIME_MANIFEST)[]) {
      for (const url of stageStoryBackgroundUrls((await loadStageRuntime(stageId)).assets)) used.add(url);
    }
    for (const entry of STORY_HD_ENTRIES) expect(used, `BK/${entry.background}`).toContain(entry.original);
  });

  test("the resource gate asks for HD files only in the HD style and only for illustrations that have one", () => {
    const sources = [...STORY_HD_ENTRIES.map(({ original }) => original), "/assets/original/story-no-hd.png"];
    expect(storyHdUrlsForStyle(sources, "original")).toEqual([]);
    // a shared sky strip is fetched once
    expect(storyHdUrlsForStyle(sources, "hd")).toEqual([...new Set(STORY_HD_ENTRIES.flatMap((entry) => storyHdAssetUrls(entry)))]);
    expect(storyHdUrlsForStyle(["/assets/original/story-no-hd.png"], "hd")).toEqual([]);
  });
});

describe("REMAKE-197 HD title screen", () => {
  test("covers both variants the title alternates, with the original pixels kept for the frame and the logo", () => {
    const title = STORY_HD_TITLE;
    expect(title).toBeDefined();
    if (!title) return;
    expect(title.variants.map(({ upper, lower }) => ({ upper, lower }))).toEqual(STARTUP_TITLE.variants);
    expect(title.frame).toMatch(/^\/assets\/original\/story\/hd\/title\/frame\.png$/u);
    for (const variant of title.variants) {
      expect(variant.logo).toMatch(/^\/assets\/original\/story\/hd\/title\/logo-[01]\.png$/u);
      expect(variant.land.source).toMatch(/\/land-[01]\.webp$/u);
      expect(variant.sky.source).toMatch(/\/sky-[01]\.webp$/u);
      expect(Math.abs(variant.sky.speed)).toBeGreaterThan(0);
      expect(Math.abs(variant.sky.speed)).toBeLessThanOrEqual(20);
    }
    // one land plate and one sky strip per variant, one loop for both women
    const urls = storyHdTitleAssetUrls(title);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(8);
  });

  test("every HD layer sits inside the upper art at the title's scale", () => {
    const title = STORY_HD_TITLE;
    if (!title) throw new Error("no HD title");
    // the upper art is 472x349 at (32,0); everything HD is in its pixels times `scale`
    const width = 472 * title.scale;
    const height = 349 * title.scale;
    const inside = (box: { x: number; y: number; width: number; height: number }) => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height + title.scale);
    };
    inside(title.interior);
    // stacked: premultiplied colour on top, 1 - alpha below, each half an even height
    expect(title.women.alpha).toBe("stacked");
    expect(title.women.height % 4).toBe(0);
    inside({ ...title.women, height: title.women.height / 2 });
    for (const variant of title.variants) {
      inside(variant.land);
      expect(variant.sky.y).toBeLessThanOrEqual(title.interior.y);
      expect(variant.sky.y + variant.sky.height).toBeGreaterThan(title.interior.y);
    }
  });
});
