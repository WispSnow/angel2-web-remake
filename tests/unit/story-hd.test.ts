import { describe, expect, test } from "vitest";
import { STORY_HD_ENTRIES, STORY_HD_HEIGHT, STORY_HD_WIDTH } from "../../src/game/content/story-hd.generated";
import {
  STORY_HD_EPILOGUE,
  STORY_HD_INTRO,
  STORY_HD_THE_END,
  STORY_HD_TITLE,
  storyHdAssetUrls,
  storyHdEntryForSource,
  storyHdEpilogueSpread,
  storyHdIntroAssetUrls,
  storyHdIntroWindow,
  storyHdTitleAssetUrls,
} from "../../src/game/content/story-hd";
import { STARTUP_INTRO, STARTUP_TITLE } from "../../src/game/content/startup.generated";
import { CREDITS_FINAL_SCREEN, CREDITS_FINAL_TIMELINE } from "../../src/game/content/credits";
import { STAGE49_ENDING_ASSETS, STAGE49_EPILOGUE_SEGMENTS } from "../../src/game/content/stage49-ending";
import { VOICE_STARTUP_NARRATION, epilogueNarrationFor } from "../../src/game/content/voice-catalog";
import { STAGE_RUNTIME_MANIFEST, loadStageRuntime, stageStoryBackgroundUrls } from "../../src/game/stage-runtime";
import { epilogueHdUrlsForStyle, storyHdUrlsForStyle, theEndHdUrlsForStyle } from "../../src/game/story-hd-style";
import { loopPhaseDistance } from "../../src/game/the-end-hd";

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

describe("REMAKE-198 HD opening crawl", () => {
  /** startup.ts: module 23's timer runs at 10 ms a tick, 12 ticks a scroll update. */
  const UPDATE_MS = STARTUP_INTRO.ticksPerScrollUpdate * 10;
  const intro = STORY_HD_INTRO;

  test("replaces every crawl plate in order, in the plates' own rectangle, with one clip each", () => {
    if (!intro) throw new Error("no HD intro");
    expect(intro.scenes.map(({ original }) => original)).toEqual(STARTUP_INTRO.backgrounds.map(({ src }) => src));
    const [first] = STARTUP_INTRO.backgrounds;
    expect(intro.plate).toEqual({ x: first.x, y: first.y, width: 608, height: 257 });
    const urls = storyHdIntroAssetUrls(intro);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url).toMatch(/^\/assets\/original\/story\/hd\/intro\/\d+\.mp4$/u);
  });

  test("each clip lasts from its fade-in to the end of the next plate's, and the last one to the end of the crawl", () => {
    if (!intro) throw new Error("no HD intro");
    expect(intro.scenes[0].cue).toBe(0);
    const crawlMs = STARTUP_INTRO.scrollUpdates * UPDATE_MS;
    for (const [index, scene] of intro.scenes.entries()) {
      if (index > 0) expect(scene.cue).toBeGreaterThan(intro.scenes[index - 1].cue);
      const { start, end } = storyHdIntroWindow(intro, index, UPDATE_MS);
      const until = Math.min(end, crawlMs);
      expect(until - start).toBeGreaterThan(intro.crossfadeMs);
      expect(scene.video.frames / scene.video.fps * 1000).toBeGreaterThanOrEqual(until - start);
    }
    // windows overlap exactly by the cross-fade, so the plate rectangle is never left uncovered
    for (let index = 1; index < intro.scenes.length; index += 1) {
      expect(storyHdIntroWindow(intro, index - 1, UPDATE_MS).end - storyHdIntroWindow(intro, index, UPDATE_MS).start).toBe(intro.crossfadeMs);
    }
  });

  test("every picture comes in with the narration sentence that names it", () => {
    if (!intro) throw new Error("no HD intro");
    // startup-narration.ts: a sentence starts at its cue, or 250 ms after the previous one ends
    let busy = 0;
    const starts = VOICE_STARTUP_NARRATION.map((sentence) => {
      const start = Math.max(sentence.startUpdate * UPDATE_MS, busy);
      busy = start + sentence.durationMs + 250;
      return start;
    });
    const cueMs = intro.scenes.map(({ cue }) => cue * UPDATE_MS);
    // BK/43 水神愛西斯 (sentence 2), BK/45 女帝維絲塔 (4), BK/46 女帝與妮雅 (6), BK/47 妮雅傳授部下 (7), BK/48 陰謀 (8)
    for (const [scene, sentence] of [[1, 1], [3, 3], [4, 5], [5, 6], [6, 7]] as const) {
      expect(Math.abs(cueMs[scene] - starts[sentence])).toBeLessThanOrEqual(UPDATE_MS);
    }
    // BK/44 comes in at the pause inside sentence 3: 經過了無數次戰爭的蹂躪後，|「拉那洛」和「瓦爾克麗」兩族，終於合併。
    expect(cueMs[2]).toBeGreaterThan(starts[2]);
    expect(cueMs[2]).toBeLessThan(starts[2] + VOICE_STARTUP_NARRATION[2].durationMs / 2);
  });
});

describe("REMAKE-200 HD ending epilogue", () => {
  const epilogue = STORY_HD_EPILOGUE;
  const variants = STAGE49_EPILOGUE_SEGMENTS.flatMap((segment) => segment.variants.map((variant) => ({ segment, variant })));
  const halves = ({ variant }: (typeof variants)[number]) =>
    [STAGE49_ENDING_ASSETS.epilogue(variant.illustrationRecords[0]), STAGE49_ENDING_ASSETS.epilogue(variant.illustrationRecords[1])] as const;

  test("has exactly one clip for every spread the epilogue segments can show", () => {
    if (!epilogue) throw new Error("no HD epilogue");
    expect(epilogue.spreads).toHaveLength(variants.length);
    for (const entry of variants) {
      const [left, right] = halves(entry);
      const spread = storyHdEpilogueSpread(left, right);
      expect(spread, `${entry.segment.id}:${entry.variant.selector}`).toBeDefined();
      expect(spread?.video.source).toMatch(/^\/assets\/original\/story\/hd\/epilogue\/\d+\.mp4$/u);
      expect([spread?.video.width, spread?.video.height]).toEqual([STORY_HD_WIDTH, STORY_HD_HEIGHT]);
    }
    const urls = epilogue.spreads.map(({ video }) => video.source);
    expect(new Set(urls).size).toBe(urls.length);
    // halves never pair the other way round
    expect(storyHdEpilogueSpread(STAGE49_ENDING_ASSETS.epilogue(5), STAGE49_ENDING_ASSETS.epilogue(4))).toBeUndefined();
  });

  test("each clip lasts as long as its segment stays up: the native limit, or longer while the narration speaks", () => {
    for (const entry of variants) {
      const [left, right] = halves(entry);
      const spread = storyHdEpilogueSpread(left, right);
      if (!spread) throw new Error(`no HD spread for ${left}`);
      const holdMs = Math.max(entry.segment.waitNativeTicks, entry.variant.typingNativeTicks) * 10;
      const spokenMs = epilogueNarrationFor(entry.segment.id, entry.variant.selector)?.durationMs ?? 0;
      expect(spread.video.frames / spread.video.fps * 1000, `${entry.segment.id}:${entry.variant.selector}`)
        .toBeGreaterThanOrEqual(Math.max(holdMs, spokenMs));
    }
  });

  test("the route gate fetches the chosen spreads only in 高清", () => {
    const chosen = variants.filter(({ variant }) => variant.selector === 0).map(halves);
    expect(epilogueHdUrlsForStyle(chosen, "original")).toEqual([]);
    const urls = epilogueHdUrlsForStyle(chosen, "hd");
    expect(urls).toHaveLength(chosen.length);
    expect(urls).toEqual(chosen.map(([left, right]) => storyHdEpilogueSpread(left, right)?.video.source));
  });
});

describe("REMAKE-201 HD The end", () => {
  test("replaces the picture inside UN/54 frame 0 and leaves the lettering and heart around it", () => {
    const theEnd = STORY_HD_THE_END;
    if (!theEnd) throw new Error("no HD The end");
    expect(theEnd.original).toBe(CREDITS_FINAL_SCREEN.base);
    // the picture is the 320x200 top left of the 408x301 frame; the lettering lies below it and the heart to its right
    expect(theEnd.picture).toEqual({ x: 0, y: 0, width: 320, height: 200 });
    // module 46 overlays the 48x56 arm frames at (352,161), (192,134) inside frame 0: the loop covers that gesture
    const overlay = { x: 352 - 160, y: 161 - 27, width: 48, height: 56 };
    expect(overlay.x + overlay.width).toBeLessThanOrEqual(theEnd.picture.x + theEnd.picture.width);
    expect(overlay.y + overlay.height).toBeLessThanOrEqual(theEnd.picture.y + theEnd.picture.height);
    expect(theEnd.video.source).toBe("/assets/original/story/hd/the-end/loop.mp4");
    expect(theEnd.video.width * theEnd.picture.height).toBe(theEnd.video.height * theEnd.picture.width);
    expect(theEnd.video.fps).toBe(24);
  });

  test("one loop holds the whole native cycle's gesture at about its length", () => {
    const theEnd = STORY_HD_THE_END;
    if (!theEnd) throw new Error("no HD The end");
    const cycleMs = CREDITS_FINAL_TIMELINE.reduce((sum, step) => sum + step.waitNativeTicks * 10, 0);
    expect(cycleMs).toBe(7_120);
    const loopMs = theEnd.video.frames / theEnd.video.fps * 1000;
    expect(loopMs).toBeGreaterThan(cycleMs * 0.6);
    expect(loopMs).toBeLessThan(cycleMs * 1.6);
  });

  test("the credits route gate fetches the loop only in 高清", () => {
    expect(theEndHdUrlsForStyle("original")).toEqual([]);
    expect(theEndHdUrlsForStyle("hd")).toEqual([STORY_HD_THE_END?.video.source]);
  });

  test("the loop phase distance wraps around the seam", () => {
    expect(loopPhaseDistance(0.1, 6.9, 7)).toBeCloseTo(0.2, 6);
    expect(loopPhaseDistance(3, 3.2, 7)).toBeCloseTo(0.2, 6);
    expect(loopPhaseDistance(10.5, 3.5, 7)).toBeCloseTo(0, 6);
  });
});
