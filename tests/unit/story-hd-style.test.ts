import { afterAll, describe, expect, it, vi } from "vitest";

// The lease decides whether an HD file can be drawn without a raw request; the tests
// take files out of it one at a time to check each fallback on its own.
const lease = vi.hoisted(() => ({ missing: new Set<string>() }));
vi.mock("../../src/game/staged-render-asset-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/game/staged-render-asset-cache")>(),
  stagedRenderAssetAvailable: (url: string) => !lease.missing.has(url),
}));

import { STORY_HD_ENTRIES } from "../../src/game/content/story-hd.generated";
import { STORY_HD_EPILOGUE, STORY_HD_THE_END, storyHdAssetUrls } from "../../src/game/content/story-hd";
import { onPortraitPresentationChange, setPortraitStyle } from "../../src/game/portrait-style";
import {
  activeEpilogueHd,
  activeStoryHd,
  activeTheEndHd,
  epilogueHdUrlsForStyle,
  markEpilogueHdFailed,
  markStoryHdFailed,
  markTheEndHdFailed,
  storyHdUrlsForStyle,
  takeStoryHdFailureNotice,
  theEndHdUrlsForStyle,
} from "../../src/game/story-hd-style";

const looping = STORY_HD_ENTRIES.find((entry) => entry.video && entry.sky);
const spread = STORY_HD_EPILOGUE?.spreads[0];
const theEnd = STORY_HD_THE_END;

afterAll(() => setPortraitStyle("original"));

describe("REMAKE-196/200/201 HD story fallback rules", () => {
  it("has the shipped HD entries these rules read", () => {
    expect(looping).toBeDefined();
    expect(spread).toBeDefined();
    expect(theEnd).toBeDefined();
  });

  it("swaps nothing and requests nothing while the art style is 原版", () => {
    setPortraitStyle("original");
    expect(activeStoryHd(looping?.original)).toBeUndefined();
    expect(storyHdUrlsForStyle([looping?.original ?? ""])).toEqual([]);
    expect(activeEpilogueHd(...(spread?.originals ?? ["", ""]))).toBeUndefined();
    expect(epilogueHdUrlsForStyle([spread?.originals ?? ["", ""]])).toEqual([]);
    expect(activeTheEndHd()).toBeUndefined();
    expect(theEndHdUrlsForStyle()).toEqual([]);
  });

  it("swaps a whole illustration only when every one of its files is in the lease", () => {
    if (!looping) throw new Error("no looping HD illustration");
    setPortraitStyle("hd");
    expect(activeStoryHd(looping.original)).toBe(looping);
    expect(activeStoryHd(undefined)).toBeUndefined();
    expect(activeStoryHd("/assets/original/story/no-such-plate.png")).toBeUndefined();
    // poster, loop and cloud strip: any one still downloading keeps the original plate
    const files = storyHdAssetUrls(looping);
    expect(files).toHaveLength(3);
    for (const file of files) {
      lease.missing.add(file);
      expect(activeStoryHd(looping.original)).toBeUndefined();
      lease.missing.delete(file);
    }
    expect(activeStoryHd(looping.original)).toBe(looping);
    // the gate asks for each HD file once, and nothing for plates without an HD version
    expect(storyHdUrlsForStyle([looping.original, "/assets/original/story/no-such-plate.png", looping.original]))
      .toEqual(files);
  });

  it("falls a failed illustration back to the original once and reports it once", () => {
    if (!looping) throw new Error("no looping HD illustration");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const changed = vi.fn();
    const stop = onPortraitPresentationChange(changed);
    expect(takeStoryHdFailureNotice()).toBe(false);
    markStoryHdFailed(looping, "decode error");
    markStoryHdFailed(looping, "decode error");
    stop();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(`BK/${looping.background}`);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(activeStoryHd(looping.original)).toBeUndefined();
    expect(takeStoryHdFailureNotice()).toBe(true);
    expect(takeStoryHdFailureNotice()).toBe(false);
    warn.mockRestore();
  });

  it("matches an epilogue spread by its left and right halves, in order", () => {
    if (!spread) throw new Error("no HD epilogue spread");
    setPortraitStyle("hd");
    const [left, right] = spread.originals;
    expect(activeEpilogueHd(left, right)).toBe(spread);
    expect(activeEpilogueHd(right, left)).toBeUndefined();
    expect(epilogueHdUrlsForStyle([[left, right], [right, left], [left, right]], "hd")).toEqual([spread.video.source]);
    lease.missing.add(spread.video.source);
    expect(activeEpilogueHd(left, right)).toBeUndefined();
    lease.missing.delete(spread.video.source);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    markEpilogueHdFailed(spread, "stalled");
    markEpilogueHdFailed(spread, "stalled");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(activeEpilogueHd(left, right)).toBeUndefined();
    warn.mockRestore();
  });

  it("swaps The end only while its loop is in the lease and has not failed", () => {
    if (!theEnd) throw new Error("no HD The end");
    setPortraitStyle("hd");
    expect(activeTheEndHd()).toBe(theEnd);
    expect(theEndHdUrlsForStyle()).toEqual([theEnd.video.source]);
    lease.missing.add(theEnd.video.source);
    expect(activeTheEndHd()).toBeUndefined();
    lease.missing.delete(theEnd.video.source);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    markTheEndHdFailed("decode error");
    markTheEndHdFailed("decode error");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(activeTheEndHd()).toBeUndefined();
    warn.mockRestore();
  });
});
