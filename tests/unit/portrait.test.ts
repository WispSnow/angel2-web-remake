import { afterEach, describe, expect, it, vi } from "vitest";
import {
  module29ShowsRedEyes,
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
  startPortraitAnimations,
} from "../../src/game/portrait";
import {
  isPortraitRecord,
  MODULE29_RED_EYE_RULE,
  PORTRAIT_CATALOG,
  PORTRAIT_RECORDS,
  portraitSourceFor,
  type PortraitAnimationAssets,
} from "../../src/game/content/portrait-catalog.generated";

describe("native portrait mouth animation", () => {
  it("toggles only for decoded Big5 double-byte glyphs", () => {
    expect(nativeStoryGlyphMovesMouth("妮")).toBe(true);
    expect(nativeStoryGlyphMovesMouth("「")).toBe(true);
    expect(nativeStoryGlyphMovesMouth("A")).toBe(false);
    expect(nativeStoryGlyphMovesMouth(" ")).toBe(false);
    expect(nativeStoryGlyphMovesMouth("\n")).toBe(false);
  });

  it("alternates between closed and half-open without selecting fully open", () => {
    expect(nativeMouthFrameAfterGlyph("1", "妮")).toBe("2");
    expect(nativeMouthFrameAfterGlyph("2", "雅")).toBe("1");
    expect(nativeMouthFrameAfterGlyph("1", "A")).toBe("1");
    expect(nativeMouthFrameAfterGlyph("2", " ")).toBe("2");
    expect(nativeMouthFrameAfterGlyph("3", "妮")).toBe("2");
  });
});

describe("generated campaign portrait catalog", () => {
  it("registers every native D record without per-stage animation maps", () => {
    expect(PORTRAIT_RECORDS).toHaveLength(68);
    expect(Object.values(PORTRAIT_CATALOG).filter(({ animation }) => animation)).toHaveLength(67);
    expect(PORTRAIT_CATALOG[63]).toMatchObject({
      source: "/assets/original/portraits/0063/base.png",
      displayName: null,
      animation: null,
    });
    expect(PORTRAIT_CATALOG[67].animation?.metadataSourceRecord).toBe(56);
  });

  it("provides complete eye and mouth layers for every stage-zero and stage-one portrait", () => {
    for (const record of [0, 15, 34, 42, 43, 44, 45, 46, 47, 48, 49] as const) {
      const animation = PORTRAIT_CATALOG[record].animation;
      expect(animation, `D/${record} animation`).not.toBeNull();
      expect(animation?.eyes).toHaveLength(3);
      expect(animation?.mouths).toHaveLength(3);
      expect(portraitSourceFor(record)).toMatch(new RegExp(`/portraits/${String(record).padStart(4, "0")}/base\\.png$`));
    }
  });

  it("applies the evidence-backed D/59 archer eye correction without changing its mouth", () => {
    expect(PORTRAIT_CATALOG[59].animation).toMatchObject({
      eyeOrigin: { x: 56, y: 24 },
      mouthOrigin: { x: 64, y: 32 },
      originCorrection: {
        ruleId: "REMAKE-010",
        target: "eye",
        nativeOrigin: { x: 40, y: 24 },
        appliedOrigin: { x: 56, y: 24 },
      },
    });
  });

  it("ships frame 7 red eyes exactly for the portraits module 29 can select them for", () => {
    // Decoded from `0000:85EC/860E/862B`: stage 5 萊茵／汀塔琪, stage 30 維絲塔, stage 22 葛蒂拉斯.
    expect(MODULE29_RED_EYE_RULE).toEqual({
      frame: 7,
      clearedProgress: 999,
      stages: [
        { nativeStage: 5, portraits: [2, 3] },
        { nativeStage: 30, portraits: [41] },
        { nativeStage: 22, portraits: [0] },
      ],
    });
    const withRedEyes = PORTRAIT_RECORDS.filter((record) => {
      const animation: PortraitAnimationAssets | null = PORTRAIT_CATALOG[record].animation;
      return animation?.redEyes !== undefined;
    });
    expect(withRedEyes).toEqual([0, 2, 3, 41]);
    const empress: PortraitAnimationAssets | null = PORTRAIT_CATALOG[41].animation;
    expect(empress?.redEyes).toBe("/assets/original/portraits/0041/eye-red.png");
  });

  it("shows red eyes only on the possessed character's own stage until its live victory", () => {
    expect(module29ShowsRedEyes(41, 30, 0)).toBe(true);
    expect(module29ShowsRedEyes(41, 30, 999)).toBe(false);
    expect(module29ShowsRedEyes(41, 22, 0)).toBe(false);
    expect(module29ShowsRedEyes(46, 30, 0)).toBe(false);
    expect(module29ShowsRedEyes(2, 5, 0)).toBe(true);
    expect(module29ShowsRedEyes(3, 5, 0)).toBe(true);
    // Scene 42 fields the same 萊茵 and 汀塔琪 as allies; the check is keyed on the scene.
    expect(module29ShowsRedEyes(2, 42, 0)).toBe(false);
    expect(module29ShowsRedEyes(0, 22, 0)).toBe(true);
    expect(module29ShowsRedEyes(0, 20, 0)).toBe(false);
  });

  it("uses the native 0..67 record boundary", () => {
    expect(isPortraitRecord(0)).toBe(true);
    expect(isPortraitRecord(67)).toBe(true);
    expect(isPortraitRecord(68)).toBe(false);
    expect(isPortraitRecord(-1)).toBe(false);
    expect(isPortraitRecord(1.5)).toBe(false);
  });
});

describe("animated portrait preparation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes the same layers again on the next frame after a refused decode", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let refusals = 1;
    const layers = ["base", "eye-1", "mouth-1"].map((layer) => ({
      naturalHeight: 16,
      naturalWidth: 24,
      src: `blob:portrait-0046-${layer}`,
      decode: vi.fn(async () => {
        // Chromium 對「合成器預算不夠」與「圖本身壞掉」回的是同一個 EncodingError。
        if (layer === "eye-1" && refusals > 0) {
          refusals -= 1;
          throw new DOMException("The source image cannot be decoded.", "EncodingError");
        }
      }),
    }));
    const portrait = {
      dataset: { portraitChannel: "stage49-story-lower", portraitRecord: "46", portraitReady: "false" },
      querySelectorAll: () => layers,
    } as unknown as HTMLElement;
    const root = { querySelectorAll: () => [portrait] } as unknown as HTMLElement;
    const settle = () => new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    const stop = startPortraitAnimations(root, true, () => false);
    frames.shift()?.(16);
    await settle();
    expect(portrait.dataset.portraitReady).toBe("false");
    expect(portrait.dataset.portraitError).toBe("The source image cannot be decoded.");
    expect(layers.map(({ decode }) => decode.mock.calls.length)).toEqual([1, 1, 1]);

    // 被拒的準備已從快取丟掉，下一幀的 tick 就對同一批圖層元素重新 decode()。
    frames.shift()?.(33);
    await settle();
    expect(layers.map(({ decode }) => decode.mock.calls.length)).toEqual([2, 2, 2]);
    expect(portrait.dataset.portraitReady).toBe("true");
    expect(portrait.dataset.portraitError).toBeUndefined();
    stop();
  });
});
